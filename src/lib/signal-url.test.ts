import { describe, it, expect } from 'vitest';
import { validateSignalUrl } from './signal-url.js';

// A realistic Signal invite key: the characters Signal actually uses in the
// fragment are base64url, i.e. [A-Za-z0-9_-].
const KEY = 'CjQKIF_-1abcDEF';
const HAPPY = `https://signal.group/#${KEY}`;

describe('validateSignalUrl — non-strings', () => {
  it('rejects null', () => {
    expect(validateSignalUrl(null)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects undefined', () => {
    expect(validateSignalUrl(undefined)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects a number', () => {
    expect(validateSignalUrl(12345)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects an object', () => {
    expect(validateSignalUrl({ href: HAPPY })).toEqual({ ok: false, code: 'not_a_string' });
  });
});

describe('validateSignalUrl — byte cap', () => {
  it('rejects input over the byte cap before parsing it', () => {
    // 622 bytes. Also has an over-long fragment, so this asserts the cheap
    // byte check runs first rather than falling through to parsing.
    const huge = `https://signal.group/#${'a'.repeat(600)}`;
    expect(validateSignalUrl(huge)).toEqual({ ok: false, code: 'too_many_bytes' });
  });
});

describe('validateSignalUrl — unparseable', () => {
  it('rejects a string that is not a URL', () => {
    expect(validateSignalUrl('not a url')).toEqual({ ok: false, code: 'unparseable' });
  });

  it('rejects the empty string', () => {
    expect(validateSignalUrl('')).toEqual({ ok: false, code: 'unparseable' });
  });
});

describe('validateSignalUrl — protocol allowlist', () => {
  it('rejects javascript:', () => {
    expect(validateSignalUrl('javascript:alert(1)')).toEqual({ ok: false, code: 'bad_protocol' });
  });

  it('rejects java<TAB>script: — the URL parser strips the tab, so the scheme is javascript:', () => {
    // This is why schemes are allowlisted, not denylisted: a denylist matching
    // the literal string "javascript:" never sees this one, but the parser
    // (and the browser) does.
    const result = validateSignalUrl('java\tscript:alert(1)');
    expect(result).toEqual({ ok: false, code: 'bad_protocol' });
    // Not 'unparseable' — it really did parse, as javascript:.
    expect(new URL('java\tscript:alert(1)').protocol).toBe('javascript:');
  });

  it('rejects data:', () => {
    expect(validateSignalUrl('data:text/html,<script>alert(1)</script>')).toEqual({
      ok: false,
      code: 'bad_protocol',
    });
  });

  it('rejects plain http', () => {
    expect(validateSignalUrl(`http://signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_protocol',
    });
  });
});

describe('validateSignalUrl — host allowlist', () => {
  it('rejects evilsignal.group (the endsWith trap)', () => {
    expect(validateSignalUrl(`https://evilsignal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });

  it('rejects signal.group.evil.com (the startsWith trap)', () => {
    expect(validateSignalUrl(`https://signal.group.evil.com/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });

  it('rejects a subdomain of signal.group', () => {
    expect(validateSignalUrl(`https://www.signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });
});

describe('validateSignalUrl — credentials, port, query, path', () => {
  it('rejects user:pass credentials', () => {
    expect(validateSignalUrl(`https://user:pass@signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_credentials',
    });
  });

  it('rejects a username with no password', () => {
    expect(validateSignalUrl(`https://user@signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_credentials',
    });
  });

  it('rejects an explicit non-default port', () => {
    expect(validateSignalUrl(`https://signal.group:8443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects an explicit default port :443 that WHATWG URL normalizes away', () => {
    // new URL('https://signal.group:443/').port === '' — the parser drops the
    // scheme's own default port. Checking u.port alone would let this through,
    // so the validator also inspects the raw authority. The design forbids ANY
    // explicit port, default or not.
    expect(new URL(`https://signal.group:443/#${KEY}`).port).toBe('');
    expect(validateSignalUrl(`https://signal.group:443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects the :80 port on an https URL', () => {
    // Non-default for https, so u.port is '80'; still an explicit port and still
    // forbidden. Pinned alongside :443 so both the normalized and un-normalized
    // port paths are covered.
    expect(validateSignalUrl(`https://signal.group:80/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects a tab between scheme and slashes that hides an explicit port', () => {
    // The WHATWG parser strips ASCII tab/newline as its first step, so this
    // parses to host signal.group with the default port normalized away. A raw-
    // authority check that does NOT mirror that strip sees only the tab and
    // never the ':443'. The validator must remove the control chars first.
    expect(new URL(`https:\t//signal.group:443/#${KEY}`).hostname).toBe('signal.group');
    expect(validateSignalUrl(`https:\t//signal.group:443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects a newline between scheme and slashes that hides an explicit port', () => {
    expect(validateSignalUrl(`https:\n//signal.group:443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects a carriage return between scheme and slashes that hides an explicit port', () => {
    expect(validateSignalUrl(`https:\r//signal.group:443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects a query string', () => {
    expect(validateSignalUrl(`https://signal.group/?utm=x#${KEY}`)).toEqual({
      ok: false,
      code: 'has_query',
    });
  });

  it('rejects a path segment', () => {
    expect(validateSignalUrl(`https://signal.group/evil#${KEY}`)).toEqual({
      ok: false,
      code: 'has_path',
    });
  });
});

describe('validateSignalUrl — fragment', () => {
  it('rejects a missing fragment', () => {
    expect(validateSignalUrl('https://signal.group/')).toEqual({ ok: false, code: 'bad_fragment' });
  });

  it('rejects a bare hash with nothing after it', () => {
    expect(validateSignalUrl('https://signal.group/#')).toEqual({ ok: false, code: 'bad_fragment' });
  });

  it('rejects a fragment of 129 characters', () => {
    expect(validateSignalUrl(`https://signal.group/#${'a'.repeat(129)}`)).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('accepts a fragment of exactly 128 characters', () => {
    const max = 'a'.repeat(128);
    expect(validateSignalUrl(`https://signal.group/#${max}`)).toEqual({
      ok: true,
      value: `https://signal.group/#${max}`,
    });
  });

  it('rejects a fragment containing an exclamation mark', () => {
    expect(validateSignalUrl('https://signal.group/#KEY!')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('rejects a fragment containing a slash', () => {
    expect(validateSignalUrl('https://signal.group/#abc/def')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('rejects a fragment containing a space (percent-encoded by the parser)', () => {
    expect(validateSignalUrl('https://signal.group/#abc def')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });
});

describe('validateSignalUrl — happy path', () => {
  it('accepts a valid invite and PRESERVES THE FRAGMENT', () => {
    // The regression that matters most. Signal puts the invite key in the
    // fragment precisely so it is never sent to a server; a validator that
    // returns the URL without it hands back a dead link.
    const result = validateSignalUrl(HAPPY);
    expect(result).toEqual({ ok: true, value: HAPPY });
    if (result.ok) {
      expect(result.value).toContain(`#${KEY}`);
    }
  });

  it('accepts underscores and hyphens in the key', () => {
    const url = 'https://signal.group/#a_b-c_D-9';
    expect(validateSignalUrl(url)).toEqual({ ok: true, value: url });
  });

  it('normalizes a missing trailing slash while keeping the fragment', () => {
    const result = validateSignalUrl(`https://signal.group#${KEY}`);
    expect(result).toEqual({ ok: true, value: `https://signal.group/#${KEY}` });
  });
});
