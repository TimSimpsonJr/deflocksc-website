import { describe, it, expect } from 'vitest';
import { digestCode } from './organizer-code.js';
import {
  CANARY_KEY,
  CANARY_SUBJECT,
  CLI_ARG_MESSAGES,
  ENV_MESSAGES,
  FOLD_WORKFLOW,
  USAGE,
  WORDLIST_SIZE,
  buildBlobsContext,
  buildCodeRecord,
  canaryDigest,
  checkWordlistChecksum,
  decideCanary,
  formatAmbiguousRevoke,
  formatBadIntakeUrl,
  formatFoldReminder,
  formatIntakeStatus,
  formatIntakeUpdated,
  formatIssueBanner,
  formatListTable,
  formatNoCodeFound,
  formatRevokeSummary,
  isValidPseudonym,
  looksLikeCode,
  parseCliArgs,
  parseEnv,
  parseFoldAnswer,
  parseWordlist,
  revokeRecord,
  selectRevocationTarget,
  shouldTombstone,
  toListJson,
  toListRow,
  tombstoneEvent,
} from './organizer-cli.js';

const rows = [
  { digest: 'a'.repeat(64), pseudonym: 'handle-jay', issuedAt: '2026-08-17T14:22:00Z', revoked: false },
  { digest: 'b'.repeat(64), pseudonym: 'pier', issuedAt: '2026-07-02T09:00:00Z', revoked: true },
];

const fullEnv = {
  ORGANIZER_CODE_PEPPER: 'pepper-value',
  NETLIFY_AUTH_TOKEN: 'token-value',
  NETLIFY_SITE_ID: 'site-value',
};

// Build a synthetic wordlist that satisfies every structural rule.
function syntheticWordlist(count = WORDLIST_SIZE): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // Unique 3-char prefix per entry: base-26 over three positions (26^3 = 17576 >= 1296).
    const prefix =
      alphabet[Math.floor(i / 676) % 26] + alphabet[Math.floor(i / 26) % 26] + alphabet[i % 26];
    const dice = `${(i % 6) + 1}${((i >> 2) % 6) + 1}${((i >> 4) % 6) + 1}${((i >> 6) % 6) + 1}`;
    lines.push(`${dice}\t${prefix}word`);
  }
  return lines.join('\n') + '\n';
}

describe('looksLikeCode', () => {
  it('flags a space-separated four-word code', () => {
    expect(looksLikeCode('Drum Yoga Vivid Clay')).toBe(true);
  });

  it('flags a hyphen-separated four-word code', () => {
    expect(looksLikeCode('drum-yoga-vivid-clay')).toBe(true);
  });

  it('flags a code padded with punctuation and digits', () => {
    expect(looksLikeCode('  drum2yoga.vivid_clay  ')).toBe(true);
  });

  it('does not flag a two-part pseudonym', () => {
    expect(looksLikeCode('handle-jay')).toBe(false);
  });

  it('does not flag a subcommand or a flag', () => {
    expect(looksLikeCode('revoke')).toBe(false);
    expect(looksLikeCode('--no-fold')).toBe(false);
  });

  it('does not flag a 64-char hex digest', () => {
    expect(looksLikeCode('a1b2c3d4'.repeat(8))).toBe(false);
  });
});

describe('isValidPseudonym', () => {
  it('accepts up to three hyphen-separated segments', () => {
    expect(isValidPseudonym('pier')).toBe(true);
    expect(isValidPseudonym('handle-jay')).toBe(true);
    expect(isValidPseudonym('handle-jay-2')).toBe(true);
  });

  it('rejects four segments, uppercase, spaces, empty segments, and overlong values', () => {
    expect(isValidPseudonym('a-b-c-d')).toBe(false);
    expect(isValidPseudonym('Handle')).toBe(false);
    expect(isValidPseudonym('handle jay')).toBe(false);
    expect(isValidPseudonym('handle--jay')).toBe(false);
    expect(isValidPseudonym('a')).toBe(false);
    expect(isValidPseudonym('a'.repeat(41))).toBe(false);
  });
});

describe('parseCliArgs', () => {
  it('parses issue with and without --clip', () => {
    expect(parseCliArgs(['issue', 'handle-jay'])).toEqual({
      ok: true,
      value: { name: 'issue', pseudonym: 'handle-jay', clip: false },
    });
    expect(parseCliArgs(['issue', 'handle-jay', '--clip'])).toEqual({
      ok: true,
      value: { name: 'issue', pseudonym: 'handle-jay', clip: true },
    });
  });

  it('parses revoke with digest and fold flags', () => {
    expect(parseCliArgs(['revoke', 'pier'])).toEqual({
      ok: true,
      value: { name: 'revoke', pseudonym: 'pier', digest: null, fold: 'prompt' },
    });
    expect(parseCliArgs(['revoke', 'pier', '--digest', 'c'.repeat(64), '--no-fold'])).toEqual({
      ok: true,
      value: { name: 'revoke', pseudonym: 'pier', digest: 'c'.repeat(64), fold: 'no' },
    });
    expect(parseCliArgs(['revoke', 'pier', '--fold'])).toEqual({
      ok: true,
      value: { name: 'revoke', pseudonym: 'pier', digest: null, fold: 'yes' },
    });
  });

  it('parses list with and without --json', () => {
    expect(parseCliArgs(['list'])).toEqual({ ok: true, value: { name: 'list', json: false } });
    expect(parseCliArgs(['list', '--json'])).toEqual({ ok: true, value: { name: 'list', json: true } });
  });

  it('parses set-intake with a signal url that would otherwise trip the code scan', () => {
    expect(parseCliArgs(['set-intake', 'https://signal.group/#CjQKIExamplE'])).toEqual({
      ok: true,
      value: { name: 'set-intake', signalUrl: 'https://signal.group/#CjQKIExamplE' },
    });
  });

  it('refuses an organizer code passed as an argument', () => {
    expect(parseCliArgs(['revoke', 'drum-yoga-vivid-clay'])).toEqual({
      ok: false,
      code: 'looks_like_code',
    });
    expect(parseCliArgs(['issue', 'Drum Yoga Vivid Clay'])).toEqual({
      ok: false,
      code: 'looks_like_code',
    });
  });

  it('refuses the code before it decides whether the subcommand is even real', () => {
    expect(parseCliArgs(['rotate', 'drum-yoga-vivid-clay'])).toEqual({
      ok: false,
      code: 'looks_like_code',
    });
  });

  it('reports the remaining argument errors', () => {
    expect(parseCliArgs([])).toEqual({ ok: false, code: 'no_command' });
    expect(parseCliArgs(['rotate'])).toEqual({ ok: false, code: 'unknown_command' });
    expect(parseCliArgs(['issue'])).toEqual({ ok: false, code: 'missing_pseudonym' });
    expect(parseCliArgs(['issue', 'Handle'])).toEqual({ ok: false, code: 'invalid_pseudonym' });
    expect(parseCliArgs(['issue', 'pier', '--quiet'])).toEqual({ ok: false, code: 'unknown_flag' });
    expect(parseCliArgs(['issue', 'pier', 'extra'])).toEqual({ ok: false, code: 'extra_argument' });
    expect(parseCliArgs(['revoke', 'pier', '--digest'])).toEqual({ ok: false, code: 'invalid_digest' });
    expect(parseCliArgs(['revoke', 'pier', '--digest', 'nothex'])).toEqual({
      ok: false,
      code: 'invalid_digest',
    });
    expect(parseCliArgs(['set-intake'])).toEqual({ ok: false, code: 'missing_url' });
    expect(parseCliArgs(['set-intake', 'https://signal.group/#a', 'extra'])).toEqual({
      ok: false,
      code: 'extra_argument',
    });
  });

  it('has a message for every argument error code', () => {
    const codes = [
      'no_command',
      'unknown_command',
      'looks_like_code',
      'missing_pseudonym',
      'invalid_pseudonym',
      'invalid_digest',
      'missing_url',
      'unknown_flag',
      'extra_argument',
    ] as const;
    for (const code of codes) {
      expect(typeof CLI_ARG_MESSAGES[code]).toBe('string');
      expect(CLI_ARG_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});

describe('USAGE', () => {
  it('documents the npm invocation, not a bare node invocation', () => {
    expect(USAGE).toContain('npm run codes -- issue <pseudonym>');
    expect(USAGE).not.toContain('node scripts/organizer-codes');
  });

  it('documents set-intake', () => {
    expect(USAGE).toContain('set-intake <signal-url>');
  });

  it('states the never-an-argument rule', () => {
    expect(USAGE).toContain('never accepted as arguments');
  });
});

describe('parseEnv', () => {
  it('accepts a fully configured environment and defaults the region', () => {
    expect(parseEnv(fullEnv)).toEqual({
      ok: true,
      value: {
        pepper: 'pepper-value',
        token: 'token-value',
        siteId: 'site-value',
        region: 'us-east-1',
      },
    });
  });

  it('honours an explicit region', () => {
    const result = parseEnv({ ...fullEnv, NETLIFY_BLOBS_REGION: 'us-west-2' });
    expect(result.ok && result.value.region).toBe('us-west-2');
  });

  it('fails closed on each missing secret, in order', () => {
    expect(parseEnv({})).toEqual({ ok: false, code: 'missing_pepper' });
    expect(parseEnv({ ...fullEnv, ORGANIZER_CODE_PEPPER: '   ' })).toEqual({
      ok: false,
      code: 'missing_pepper',
    });
    expect(parseEnv({ ...fullEnv, NETLIFY_AUTH_TOKEN: '' })).toEqual({
      ok: false,
      code: 'missing_token',
    });
    expect(parseEnv({ ...fullEnv, NETLIFY_SITE_ID: '' })).toEqual({
      ok: false,
      code: 'missing_site_id',
    });
  });

  it('has a message for every environment error code', () => {
    for (const code of ['missing_pepper', 'missing_token', 'missing_site_id'] as const) {
      expect(ENV_MESSAGES[code].length).toBeGreaterThan(0);
    }
    expect(ENV_MESSAGES.missing_token).toContain('Refusing to fall back');
  });
});

describe('buildBlobsContext', () => {
  it('encodes the site id, token, and region as base64 JSON', () => {
    const encoded = buildBlobsContext({
      pepper: 'p',
      token: 't',
      siteId: 's',
      region: 'us-east-1',
    });
    expect(JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))).toEqual({
      siteID: 's',
      token: 't',
      primaryRegion: 'us-east-1',
    });
  });

  it('never encodes the pepper', () => {
    const encoded = buildBlobsContext({
      pepper: 'super-secret-pepper',
      token: 't',
      siteId: 's',
      region: 'us-east-1',
    });
    expect(Buffer.from(encoded, 'base64').toString('utf-8')).not.toContain('super-secret-pepper');
  });
});

describe('canaryDigest and decideCanary', () => {
  it('digests the fixed canary subject with the given pepper', () => {
    expect(CANARY_SUBJECT).toBe('deflocksc-canary');
    expect(CANARY_KEY).toBe('pepper-canary');
    expect(canaryDigest('pepper-value')).toBe(digestCode(CANARY_SUBJECT, 'pepper-value'));
  });

  it('writes the canary the first time, for either strictness', () => {
    for (const strict of [true, false]) {
      const decision = decideCanary(null, 'expected-digest', strict);
      expect(decision.action).toBe('write');
      if (decision.action === 'write') {
        expect(decision.value).toBe('expected-digest');
        expect(decision.note).toContain('pepper-canary');
      }
    }
    expect(decideCanary(undefined, 'expected-digest', true).action).toBe('write');
  });

  it('accepts a matching canary', () => {
    expect(decideCanary('same', 'same', true)).toEqual({ action: 'accept' });
    expect(decideCanary('same', 'same', false)).toEqual({ action: 'accept' });
  });

  it('refuses a mismatch when strict and only warns when not', () => {
    const strict = decideCanary('stored', 'expected', true);
    expect(strict.action).toBe('refuse');
    const lenient = decideCanary('stored', 'expected', false);
    expect(lenient.action).toBe('warn');
    if (strict.action === 'refuse' && lenient.action === 'warn') {
      expect(strict.message).toBe(lenient.message);
      expect(strict.message).toContain('ORGANIZER_CODE_PEPPER');
    }
  });

  it('never puts either digest into the mismatch message', () => {
    const decision = decideCanary('stored-digest-value', 'expected-digest-value', true);
    expect(decision.action).toBe('refuse');
    if (decision.action === 'refuse') {
      expect(decision.message).not.toContain('stored-digest-value');
      expect(decision.message).not.toContain('expected-digest-value');
    }
  });
});

describe('record shapes', () => {
  it('buildCodeRecord emits exactly the three stored fields', () => {
    const record = buildCodeRecord('handle-jay', '2026-08-17T14:22:00Z');
    expect(record).toEqual({
      pseudonym: 'handle-jay',
      issuedAt: '2026-08-17T14:22:00Z',
      revoked: false,
    });
    expect(Object.keys(record).sort()).toEqual(['issuedAt', 'pseudonym', 'revoked']);
  });

  it('revokeRecord rebuilds the record with revoked flipped, dropping stray fields', () => {
    expect(revokeRecord({ ...rows[0], revoked: false })).toEqual({
      pseudonym: 'handle-jay',
      issuedAt: '2026-08-17T14:22:00Z',
      revoked: true,
    });
  });

  it('toListRow tolerates a malformed stored record', () => {
    expect(toListRow('d'.repeat(64), { pseudonym: 'pier', issuedAt: '2026-01-01T00:00:00Z' })).toEqual(
      { digest: 'd'.repeat(64), pseudonym: 'pier', issuedAt: '2026-01-01T00:00:00Z', revoked: false },
    );
    expect(toListRow('e'.repeat(64), null)).toEqual({
      digest: 'e'.repeat(64),
      pseudonym: '(unknown)',
      issuedAt: '',
      revoked: false,
    });
    expect(toListRow('f'.repeat(64), { pseudonym: 42, revoked: 'yes' })).toEqual({
      digest: 'f'.repeat(64),
      pseudonym: '(unknown)',
      issuedAt: '',
      revoked: false,
    });
  });

  it('shouldTombstone matches on codeDigest and skips already-tombstoned events', () => {
    expect(shouldTombstone({ codeDigest: 'x', revoked: false }, 'x')).toBe(true);
    expect(shouldTombstone({ codeDigest: 'x' }, 'x')).toBe(true);
    expect(shouldTombstone({ codeDigest: 'x', revoked: true }, 'x')).toBe(false);
    expect(shouldTombstone({ codeDigest: 'y' }, 'x')).toBe(false);
    expect(shouldTombstone(null, 'x')).toBe(false);
  });

  it('tombstoneEvent preserves the event record and sets revoked', () => {
    expect(tombstoneEvent({ id: 'ab12cd34', title: 'Meeting', codeDigest: 'x' })).toEqual({
      id: 'ab12cd34',
      title: 'Meeting',
      codeDigest: 'x',
      revoked: true,
    });
  });
});

describe('selectRevocationTarget', () => {
  const many = [
    rows[0],
    { digest: 'c'.repeat(64), pseudonym: 'handle-jay', issuedAt: '2026-08-01T00:00:00Z', revoked: false },
  ];

  it('finds a single match by pseudonym', () => {
    expect(selectRevocationTarget(rows, 'pier', null)).toEqual({ kind: 'one', row: rows[1] });
  });

  it('reports no match', () => {
    expect(selectRevocationTarget(rows, 'nobody', null)).toEqual({ kind: 'none' });
  });

  it('reports ambiguity when one pseudonym holds several codes', () => {
    const selection = selectRevocationTarget(many, 'handle-jay', null);
    expect(selection.kind).toBe('many');
    if (selection.kind === 'many') expect(selection.rows).toHaveLength(2);
  });

  it('disambiguates with an explicit digest', () => {
    expect(selectRevocationTarget(many, 'handle-jay', 'c'.repeat(64))).toEqual({
      kind: 'one',
      row: many[1],
    });
  });

  it('treats a digest that belongs to another pseudonym as no match', () => {
    expect(selectRevocationTarget(rows, 'pier', 'a'.repeat(64))).toEqual({ kind: 'none' });
  });
});

describe('formatListTable', () => {
  it('prints pseudonym, issue date, and revoked state', () => {
    const table = formatListTable(rows);
    expect(table).toContain('PSEUDONYM');
    expect(table).toContain('handle-jay');
    expect(table).toContain('2026-08-17');
    expect(table).toContain('pier');
    expect(table).toContain('2026-07-02');
  });

  it('sorts oldest first', () => {
    const table = formatListTable(rows);
    expect(table.indexOf('pier')).toBeLessThan(table.indexOf('handle-jay'));
  });

  it('never leaks a digest', () => {
    const table = formatListTable(rows);
    expect(table).not.toContain('a'.repeat(64));
    expect(table).not.toContain('b'.repeat(64));
    expect(table).not.toContain('aaaaaaaa');
  });

  it('handles an empty store', () => {
    expect(formatListTable([])).toBe('No codes issued.');
  });
});

describe('toListJson', () => {
  it('emits exactly the four allowlisted fields', () => {
    const parsedJson = JSON.parse(toListJson(rows)) as Record<string, unknown>[];
    expect(parsedJson).toHaveLength(2);
    for (const row of parsedJson) {
      expect(Object.keys(row).sort()).toEqual(['digest', 'issuedAt', 'pseudonym', 'revoked']);
    }
  });

  it('drops any extra field present on the input record', () => {
    const withExtra = [{ ...rows[0], secretNote: 'do not publish' } as never];
    expect(toListJson(withExtra)).not.toContain('secretNote');
  });
});

describe('the remaining output formatters', () => {
  it('formatIssueBanner shows the code once and says so', () => {
    const banner = formatIssueBanner('handle-jay', 'drum-yoga-vivid-clay');
    expect(banner).toContain('handle-jay');
    expect(banner).toContain('drum-yoga-vivid-clay');
    expect(banner).toContain('only time it is shown');
    expect(banner.split('drum-yoga-vivid-clay')).toHaveLength(2);
  });

  it('formatRevokeSummary truncates the digest and counts the cascade', () => {
    const summary = formatRevokeSummary('pier', 'b'.repeat(64), 3);
    expect(summary).toContain('Revoked pier');
    expect(summary).toContain('Tombstoned 3 event(s)');
    expect(summary).not.toContain('b'.repeat(64));
  });

  it('formatFoldReminder names the workflow', () => {
    expect(FOLD_WORKFLOW).toBe('fold-events.yml');
    expect(formatFoldReminder()).toContain(`gh workflow run ${FOLD_WORKFLOW}`);
  });

  it('formatAmbiguousRevoke lists each digest with its issue date', () => {
    const text = formatAmbiguousRevoke('handle-jay', rows);
    expect(text).toContain('--digest');
    expect(text).toContain('a'.repeat(64));
    expect(text).toContain('2026-08-17');
  });

  it('formatNoCodeFound names the pseudonym', () => {
    expect(formatNoCodeFound('ghost')).toContain('"ghost"');
  });
});

describe('intake formatters', () => {
  it('formatIntakeStatus reports set/not set and never a URL', () => {
    expect(formatIntakeStatus(true)).toContain('set');
    expect(formatIntakeStatus(false)).toContain('not set');
    expect(formatIntakeStatus(true)).not.toContain('signal.group');
    expect(formatIntakeStatus(true)).not.toContain('http');
  });

  it('formatIntakeUpdated confirms without echoing the URL', () => {
    const text = formatIntakeUpdated();
    expect(text).toContain('Intake link updated');
    expect(text).not.toContain('signal.group');
  });

  it('formatBadIntakeUrl names the validation code but not a raw URL', () => {
    const text = formatBadIntakeUrl('bad_protocol');
    expect(text).toContain('bad_protocol');
    expect(text).toContain('signal.group');
  });
});

describe('parseFoldAnswer', () => {
  it('treats only y and yes as consent', () => {
    expect(parseFoldAnswer('y')).toBe(true);
    expect(parseFoldAnswer(' YES ')).toBe(true);
    expect(parseFoldAnswer('')).toBe(false);
    expect(parseFoldAnswer('n')).toBe(false);
    expect(parseFoldAnswer('yep')).toBe(false);
  });
});

describe('checkWordlistChecksum', () => {
  const hash = '9'.repeat(64);

  it('accepts a matching sha256sum-format record', () => {
    expect(checkWordlistChecksum(hash, `${hash}  eff-short-wordlist-2.txt\n`)).toEqual({
      ok: true,
      value: hash,
    });
  });

  it('rejects a mismatch', () => {
    expect(checkWordlistChecksum('8'.repeat(64), `${hash}  eff-short-wordlist-2.txt\n`)).toEqual({
      ok: false,
      code: 'mismatch',
    });
  });

  it('rejects a malformed or misnamed record', () => {
    expect(checkWordlistChecksum(hash, hash)).toEqual({ ok: false, code: 'bad_record' });
    expect(checkWordlistChecksum(hash, `nothex  eff-short-wordlist-2.txt\n`)).toEqual({
      ok: false,
      code: 'bad_record',
    });
    expect(checkWordlistChecksum(hash, `${hash}  some-other-list.txt\n`)).toEqual({
      ok: false,
      code: 'bad_record',
    });
  });
});

describe('parseWordlist', () => {
  it('accepts a well-formed 1296-entry list', () => {
    const result = parseWordlist(syntheticWordlist());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(WORDLIST_SIZE);
      expect(result.value[0]).toBe('aaaword');
    }
  });

  it('tolerates CRLF line endings and a trailing blank line', () => {
    const crlf = syntheticWordlist().replace(/\n/g, '\r\n') + '\r\n';
    expect(parseWordlist(crlf).ok).toBe(true);
  });

  it('rejects the wrong entry count', () => {
    expect(parseWordlist(syntheticWordlist(10))).toEqual({ ok: false, code: 'bad_count' });
  });

  it('rejects a line without a tab separator', () => {
    expect(parseWordlist('1111 aardvark\n')).toEqual({ ok: false, code: 'bad_line' });
  });

  it('rejects a dice column that is not four digits 1-6', () => {
    expect(parseWordlist('1117\taardvark\n')).toEqual({ ok: false, code: 'bad_line' });
    expect(parseWordlist('111\taardvark\n')).toEqual({ ok: false, code: 'bad_line' });
  });

  it('rejects a non-lowercase-ascii word', () => {
    expect(parseWordlist('1111\tAardvark\n')).toEqual({ ok: false, code: 'bad_word' });
    expect(parseWordlist('1111\tab\n')).toEqual({ ok: false, code: 'bad_word' });
  });

  it('rejects duplicate words and duplicate three-character prefixes', () => {
    expect(parseWordlist('1111\taardvark\n1112\taardvark\n')).toEqual({
      ok: false,
      code: 'duplicate_word',
    });
    expect(parseWordlist('1111\taardvark\n1112\taardwolf\n')).toEqual({
      ok: false,
      code: 'duplicate_prefix',
    });
  });
});
