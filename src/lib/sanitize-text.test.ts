import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  dedupeKey,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  ADDRESS_LIMITS,
  type SanitizeOptions,
} from './sanitize-text.js';

// The caps live in sanitize-text.ts and are imported here, never redeclared:
// the sanitizer enforces whatever it is handed, so a test-local copy of a cap
// would drift from the real one invisibly. Every hostile character in this file
// is written as a \u escape on purpose: a literal invisible character does not
// survive a copy-paste, and a test that silently loses its payload passes.

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemeCount = (s: string) => [...segmenter.segment(s)].length;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

function expectErr(result: ReturnType<typeof sanitizeText>, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a rejection, got success');
  expect(result.code).toBe(code);
}

function expectOk(result: ReturnType<typeof sanitizeText>, value: string) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected success, got ' + result.code);
  expect(result.value).toBe(value);
}

describe('sanitizeText: exported caps', () => {
  // These are the single source of truth, from the design doc, section 6.
  // Pinning the exact values here means a silent edit to a cap fails a test.
  it('exports the title caps as 1024 bytes and 80 graphemes', () => {
    expect(TITLE_LIMITS).toEqual({ maxBytes: 1024, maxGraphemes: 80 });
  });

  it('exports the description caps as 3072 bytes and 300 graphemes', () => {
    expect(DESCRIPTION_LIMITS).toEqual({ maxBytes: 3072, maxGraphemes: 300 });
  });

  it('exports the address caps as 512 bytes and 120 graphemes', () => {
    expect(ADDRESS_LIMITS).toEqual({ maxBytes: 512, maxGraphemes: 120 });
  });
});

describe('sanitizeText: accepts ordinary input', () => {
  it('accepts a plain title unchanged', () => {
    expectOk(sanitizeText('Sign night in Greenville', TITLE_LIMITS), 'Sign night in Greenville');
  });

  it('accepts a description under the description caps', () => {
    expectOk(
      sanitizeText('County council meeting, public comment at 6.', DESCRIPTION_LIMITS),
      'County council meeting, public comment at 6.'
    );
  });

  it('accepts an address under the address caps', () => {
    expectOk(
      sanitizeText('301 University Ridge, Greenville', ADDRESS_LIMITS),
      '301 University Ridge, Greenville'
    );
  });

  it('accepts digits, which must not be mistaken for emoji keycap bases', () => {
    expectOk(sanitizeText('Meetup 2026 #3', TITLE_LIMITS), 'Meetup 2026 #3');
  });

  it('accepts accented Latin, which the script allowance deliberately permits', () => {
    expectOk(sanitizeText('Reuni\u00F3n en Columbia', TITLE_LIMITS), 'Reuni\u00F3n en Columbia');
  });
});

describe('sanitizeText: type and byte caps', () => {
  it('rejects a number', () => {
    expectErr(sanitizeText(42, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects null', () => {
    expectErr(sanitizeText(null, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects undefined', () => {
    expectErr(sanitizeText(undefined, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an object', () => {
    expectErr(sanitizeText({ title: 'ok' }, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an array', () => {
    expectErr(sanitizeText(['ok'], TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an over-cap raw byte length', () => {
    expectErr(sanitizeText('a'.repeat(1025), TITLE_LIMITS), 'too_many_bytes');
  });

  it('rejects on bytes before graphemes when multibyte input blows the byte cap', () => {
    // 400 x U+20AC is 1200 UTF-8 bytes but only 400 graphemes. The byte cap is
    // what must fire, because it runs first.
    const euros = '\u20AC'.repeat(400);
    expect(byteLength(euros)).toBe(1200);
    expectErr(sanitizeText(euros, TITLE_LIMITS), 'too_many_bytes');
  });

  it('accepts a string exactly at the byte cap', () => {
    expectOk(
      sanitizeText('a'.repeat(1024), { maxBytes: 1024, maxGraphemes: 2000 }),
      'a'.repeat(1024)
    );
  });

  it('rejects the empty string', () => {
    expectErr(sanitizeText('', TITLE_LIMITS), 'empty');
  });

  it('rejects a whitespace-only string', () => {
    expectErr(sanitizeText('   \u00A0 ', TITLE_LIMITS), 'empty');
  });
});

describe('sanitizeText: normalization and whitespace', () => {
  it('folds fullwidth homoglyphs to their ASCII equivalents via NFKC', () => {
    // Fullwidth "greenville", which must not survive as a distinct value.
    const fullwidth = '\uFF47\uFF52\uFF45\uFF45\uFF4E\uFF56\uFF49\uFF4C\uFF4C\uFF45';
    expectOk(sanitizeText(fullwidth, TITLE_LIMITS), 'greenville');
  });

  it('trims leading and trailing whitespace', () => {
    expectOk(sanitizeText('   Sign night   ', TITLE_LIMITS), 'Sign night');
  });

  it('collapses internal space runs to a single space', () => {
    expectOk(sanitizeText('Sign     night', TITLE_LIMITS), 'Sign night');
  });

  it('collapses a non-breaking space into an ordinary space', () => {
    expectOk(sanitizeText('Sign\u00A0night', TITLE_LIMITS), 'Sign night');
  });

  it('is idempotent: sanitizing an already-sanitized value changes nothing', () => {
    const once = sanitizeText('  Sign   night\u00A0 in \uFF23olumbia ', TITLE_LIMITS);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = sanitizeText(once.value, TITLE_LIMITS);
    expect(twice).toEqual(once);
  });
});

describe('sanitizeText: grapheme counting', () => {
  // Graphemes are never more numerous than UTF-16 code units, so a string that
  // is "20 code units but 80 graphemes" is unrepresentable. The direction that
  // does exist -- many code units for few graphemes -- is exactly what a naive
  // `.length` cap gets wrong, and it is covered below, along with the
  // independent byte axis.
  //
  // U+101FD is a combining mark (Mn, Script=Inherited) that lives outside the
  // BMP, so it costs 2 UTF-16 code units while adding 0 graphemes.
  const wide = 'a\u{101FD}\u{101FD}'; // 5 code units, 1 grapheme, 2 combining marks
  const narrow = 'a\u{101FD}'; // 3 code units, 1 grapheme, 1 combining mark
  const eightyUnitsTwentyGraphemes = wide.repeat(10) + narrow.repeat(10);

  it('builds the fixture it claims to: 80 code units, 20 graphemes', () => {
    expect(eightyUnitsTwentyGraphemes.length).toBe(80);
    expect(graphemeCount(eightyUnitsTwentyGraphemes)).toBe(20);
  });

  it('accepts 80 code units that are only 20 graphemes, under a 20-grapheme cap', () => {
    const result = sanitizeText(eightyUnitsTwentyGraphemes, { maxBytes: 1024, maxGraphemes: 20 });
    expect(result.ok).toBe(true);
  });

  it('rejects 81 ASCII characters, which are 81 graphemes, under an 80-grapheme cap', () => {
    expectErr(sanitizeText('a'.repeat(81), TITLE_LIMITS), 'too_many_graphemes');
  });

  it('accepts exactly 80 ASCII characters under an 80-grapheme cap', () => {
    expectOk(sanitizeText('a'.repeat(80), TITLE_LIMITS), 'a'.repeat(80));
  });

  it('measures bytes and graphemes independently: 20 graphemes, 80 raw bytes', () => {
    const twentyGraphemesEightyBytes = 'a\u0301\u0301'.repeat(10) + 'a\u0301'.repeat(10);
    expect(graphemeCount(twentyGraphemesEightyBytes)).toBe(20);
    expect(byteLength(twentyGraphemesEightyBytes)).toBe(80);
    expectErr(
      sanitizeText(twentyGraphemesEightyBytes, { maxBytes: 79, maxGraphemes: 20 }),
      'too_many_bytes'
    );
    expect(
      sanitizeText(twentyGraphemesEightyBytes, { maxBytes: 80, maxGraphemes: 20 }).ok
    ).toBe(true);
  });
});

describe('sanitizeText: hostile corpus', () => {
  it('rejects a right-to-left override (U+202E, Trojan Source)', () => {
    expectErr(sanitizeText('Meetup \u202Egnitseterp', TITLE_LIMITS), 'bidi_control');
  });

  it('rejects a bidi isolate (U+2066)', () => {
    expectErr(sanitizeText('Meetup \u2066Greenville\u2069', TITLE_LIMITS), 'bidi_control');
  });

  it('rejects a zero-width run', () => {
    expectErr(sanitizeText('Green\u200B\u200B\u200Bville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a zero-width joiner', () => {
    expectErr(sanitizeText('Green\u200Dville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects an internal byte order mark', () => {
    expectErr(sanitizeText('Green\uFEFFville', TITLE_LIMITS), 'zero_width');
  });

  // The invisible-format class is the whole Cf category, not an enumerated
  // handful. Each of these renders identically to "Greenville" and would
  // otherwise smuggle content past a reviewer and split the dedupe key.
  it('rejects a soft hyphen (U+00AD)', () => {
    expectErr(sanitizeText('Green\u00ADville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a word joiner (U+2060)', () => {
    expectErr(sanitizeText('Green\u2060ville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects an invisible math operator (U+2062 INVISIBLE TIMES)', () => {
    expectErr(sanitizeText('Green\u2062ville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a left-to-right mark (U+200E), which is not a bidi override', () => {
    expectErr(sanitizeText('Green\u200Eville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a right-to-left mark (U+200F)', () => {
    expectErr(sanitizeText('Green\u200Fville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects an interlinear annotation anchor (U+FFF9)', () => {
    expectErr(sanitizeText('Green\uFFF9ville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a Unicode tag character (U+E0041), which maps to ASCII "A"', () => {
    expectErr(sanitizeText('Green\u{E0041}ville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a combining grapheme joiner (U+034F), which is Mn, not Cf', () => {
    expectErr(sanitizeText('Green\u034Fville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a Zalgo stack', () => {
    expectErr(sanitizeText('a' + '\u0301'.repeat(30) + '!', TITLE_LIMITS), 'combining_run');
  });

  it('allows two combining marks on one base', () => {
    expect(sanitizeText('a\u0327\u0316b', TITLE_LIMITS).ok).toBe(true);
  });

  it('rejects three consecutive combining marks', () => {
    expectErr(sanitizeText('a\u0327\u0316\u0331b', TITLE_LIMITS), 'combining_run');
  });

  it('rejects a Cyrillic lookalike character', () => {
    // Final character is U+0435 CYRILLIC SMALL LETTER IE, not Latin "e".
    expectErr(sanitizeText('Greenvill\u0435', TITLE_LIMITS), 'script_not_allowed');
  });

  it('rejects Hangul, which the Latin-and-Common restriction deliberately excludes', () => {
    expectErr(sanitizeText('\uD68C\uC758', TITLE_LIMITS), 'script_not_allowed');
  });

  it('rejects a single emoji in an otherwise clean title', () => {
    expectErr(sanitizeText('Sign night \u{1F389}', TITLE_LIMITS), 'emoji');
  });

  it('rejects an all-emoji title of 80 graphemes', () => {
    expectErr(sanitizeText('\u270A'.repeat(80), TITLE_LIMITS), 'emoji');
  });

  it('rejects an unassigned code point', () => {
    expectErr(sanitizeText('Meet\u0378up', TITLE_LIMITS), 'unassigned_or_private');
  });

  it('rejects a private use area code point', () => {
    expectErr(sanitizeText('Meet\uE000up', TITLE_LIMITS), 'unassigned_or_private');
  });

  it('rejects a mid-string newline', () => {
    expectErr(sanitizeText('Sign night\nGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a mid-string carriage return', () => {
    expectErr(sanitizeText('Sign night\rGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a mid-string tab', () => {
    expectErr(sanitizeText('Sign night\tGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects U+2028, which is a raw SyntaxError inside a JS string literal', () => {
    expectErr(sanitizeText('Sign night\u2028Greenville', TITLE_LIMITS), 'newline');
  });

  it('rejects U+2029', () => {
    expectErr(sanitizeText('Sign night\u2029Greenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a C0 control character', () => {
    expectErr(sanitizeText('Sign\u0007night', TITLE_LIMITS), 'control_char');
  });

  it('rejects a DEL character', () => {
    expectErr(sanitizeText('Sign\u007Fnight', TITLE_LIMITS), 'control_char');
  });

  it('rejects a C1 control character', () => {
    expectErr(sanitizeText('Sign\u0090night', TITLE_LIMITS), 'control_char');
  });
});

describe('sanitizeText: rejections leak nothing', () => {
  it('returns only ok and code, never the offending input', () => {
    const hostile = 'Green\u200Bville-SECRET-MARKER';
    const result = sanitizeText(hostile, TITLE_LIMITS);
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['code', 'ok']);
    expect(JSON.stringify(result)).not.toContain('SECRET-MARKER');
    expect(JSON.stringify(result)).not.toContain('Green');
  });
});

describe('dedupeKey', () => {
  it('lowercases', () => {
    expect(dedupeKey('Sign Night')).toBe('sign night');
  });

  it('collapses two strings differing only by zero-width characters', () => {
    const plain = 'Sign Night';
    const spiked = 'S\u200Bign\u200C Ni\u200Dght\uFEFF';
    expect(dedupeKey(spiked)).toBe(dedupeKey(plain));
  });

  it('collapses a soft-hyphen-spiked word onto its plain form', () => {
    // The whole invisible-format class is stripped, not just the zero-width set,
    // so a title spiked with U+00AD cannot dodge duplicate detection.
    expect(dedupeKey('Green\u00ADville')).toBe(dedupeKey('Greenville'));
  });

  it('collapses two strings differing only by an added space', () => {
    expect(dedupeKey('Sign  Night')).toBe(dedupeKey('Sign Night'));
  });

  it('collapses fullwidth and ASCII forms of the same word', () => {
    expect(dedupeKey('\uFF33ign Night')).toBe(dedupeKey('Sign Night'));
  });

  it('is idempotent', () => {
    const once = dedupeKey('  Sign\u200B  Night ');
    expect(dedupeKey(once)).toBe(once);
  });

  it('keeps genuinely different titles distinct', () => {
    expect(dedupeKey('Sign night')).not.toBe(dedupeKey('Sign day'));
  });
});

describe('sanitizeText: no regex backtracks on adversarial input', () => {
  // Caps raised so nothing short-circuits before the regexes under test.
  const WIDE: SanitizeOptions = { maxBytes: 100000, maxGraphemes: 100000 };

  const adversarial: Array<[string, string]> = [
    ['300 plain characters, reaching every check', 'a'.repeat(300)],
    ['100 bases each carrying the maximum 2 marks', 'a\u0301\u0301'.repeat(100)],
    ['one base under a 299-mark Zalgo stack', 'a' + '\u0301'.repeat(299)],
    ['150 alternating space runs', 'a '.repeat(150)],
    ['300 unassigned code points', '\u0378'.repeat(300)],
    ['150 zero-width-separated characters', 'a\u200B'.repeat(150)],
    ['300 emoji', '\u{1F600}'.repeat(300)],
    ['300 bidi overrides', '\u202E'.repeat(300)],
  ];

  for (const [label, input] of adversarial) {
    it('completes in under 50ms: ' + label, () => {
      expect([...input].length).toBe(300);
      // 50ms is a catastrophic-backtracking tripwire -- that failure mode blows
      // up in seconds, not milliseconds -- not a performance benchmark, so the
      // threshold is loose enough not to flake on a loaded CI box.
      // Warm up first so JIT compilation and Segmenter construction are never
      // inside a measured run.
      sanitizeText(input, WIDE);
      let best = Infinity;
      for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        sanitizeText(input, WIDE);
        best = Math.min(best, performance.now() - start);
      }
      expect(best).toBeLessThan(50);
    });
  }
});
