import { describe, it, expect } from 'vitest';
import { toJsonIsland } from './json-island.js';

// The canonical breakout: JSON.stringify does NOT escape "</script>", and the HTML
// tokenizer ends a <script> element at the first literal occurrence regardless of
// JS string context. If this string survives unescaped, the data island is an XSS.
const BREAKOUT = '</script><img src=x onerror=alert(1)>';

// U+2028 / U+2029 appear ONLY as escapes here — never as literal characters.
const LS = '\u2028';
const PS = '\u2029';

describe('toJsonIsland', () => {
  it('round-trips a plain object unchanged through JSON.parse', () => {
    const value = { id: 'k7m29qxb', title: 'Greenville meetup', count: 3, ok: true, none: null };
    const out = toJsonIsland(value);
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes a </script> breakout inside a string value', () => {
    const value = { title: BREAKOUT };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');

    // Lossless: the escape must not change the parsed value.
    expect(JSON.parse(out)).toEqual({ title: BREAKOUT });
    expect(JSON.parse(out).title).toBe(BREAKOUT);
  });

  it('escapes a </script> breakout inside an object key', () => {
    const value = { [BREAKOUT]: 'value' };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual(value);
    expect(Object.keys(JSON.parse(out))).toEqual([BREAKOUT]);
  });

  it('escapes < and > wherever they appear', () => {
    const value = ['a < b', 'c > d', '<!--', '-->'];
    const out = toJsonIsland(value);

    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes ampersands', () => {
    const value = { title: 'Cops & Cameras' };
    const out = toJsonIsland(value);

    expect(out).not.toContain('&');
    expect(out).toContain('\\u0026');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes U+2028 and U+2029 and round-trips them', () => {
    const value = { title: `line${LS}sep`, description: `para${PS}sep` };
    const out = toJsonIsland(value);

    // JSON.stringify leaves these raw; they are legal in JSON but hostile in HTML/JS contexts.
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');

    expect(JSON.parse(out)).toEqual(value);
  });

  it('round-trips every escaped character losslessly through JSON.parse', () => {
    // One fixture exercising all five escape targets: in key position, in value
    // position, nested, and adjacent to one another.
    const key = `<key>&${LS}${PS}`;
    const value = {
      [key]: [BREAKOUT, 'a & b', `${PS}leading`, { deep: `<>&${LS}${PS}` }],
      plain: 'unchanged',
      numbers: [1, 2.5, -3],
    };
    const out = toJsonIsland(value);

    for (const raw of ['<', '>', '&', '\u2028', '\u2029']) {
      expect(out).not.toContain(raw);
    }

    // The escaping is proven lossless: parsing the escaped output deep-equals the input.
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(value);
    expect(Object.keys(parsed)).toEqual(Object.keys(value));
    expect(parsed[key][3].deep).toBe(`<>&${LS}${PS}`);
  });

  it('leaves structural JSON punctuation intact', () => {
    const value = { list: [1, 2, { nested: ['a', 'b'] }] };
    const out = toJsonIsland(value);

    expect(out).toBe('{"list":[1,2,{"nested":["a","b"]}]}');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('is lossless for a full event-shaped record', () => {
    const value = {
      id: 'k7m29qxb',
      type: 'public',
      title: `Council meeting <ALPR> & ${BREAKOUT}`,
      description: `Line one${LS}line two${PS}line three`,
      date: '2026-08-22',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: { freq: 'weekly', until: '2027-02-22' },
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
    };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('leaves ordinary non-ASCII text untouched', () => {
    const value = { title: 'Reunión en Ñ Street — café' };
    const out = toJsonIsland(value);

    expect(out).toContain('Reunión');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('emits "null" for values JSON.stringify cannot represent', () => {
    expect(toJsonIsland(undefined)).toBe('null');
    expect(toJsonIsland(() => 'nope')).toBe('null');
    expect(JSON.parse(toJsonIsland(undefined))).toBe(null);
  });

  it('escapes every dangerous character in one adversarial string', () => {
    const nasty = `<>&${LS}${PS}</script></SCRIPT >`;
    const out = toJsonIsland({ nasty });

    for (const ch of ['<', '>', '&', '\u2028', '\u2029']) {
      expect(out).not.toContain(ch);
    }
    expect(JSON.parse(out).nasty).toBe(nasty);
  });
});
