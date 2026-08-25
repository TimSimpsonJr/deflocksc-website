import { describe, it, expect } from 'vitest';
import { normalizeCode, digestCode, generateCode } from './organizer-code.js';

const PEPPER = 'a'.repeat(64);
const OTHER_PEPPER = 'b'.repeat(64);

// The canonical form every spelling below must collapse to.
const CANONICAL = 'drum-yoga-vivid-clay';

// Every spelling an organizer might realistically type or paste.
const SPELLINGS = [
  'drum-yoga-vivid-clay',
  'Drum Yoga Vivid Clay',
  'DRUM YOGA VIVID CLAY',
  ' drum  yoga\tvivid clay ',
  'drum-yoga-vivid-clay\n',
  'drum_yoga.vivid,clay',
  // Fullwidth Latin capitals: ＤＲＵＭ ＹＯＧＡ ＶＩＶＩＤ ＣＬＡＹ
  'ＤＲＵＭ ＹＯＧＡ ＶＩＶＩＤ ＣＬＡＹ',
];

function unwrap(result: ReturnType<typeof normalizeCode>): string {
  if (!result.ok) throw new Error(`expected ok, got code "${result.code}"`);
  return result.value;
}

describe('normalizeCode', () => {
  it('accepts a canonical hyphenated code unchanged', () => {
    const result = normalizeCode(CANONICAL);
    expect(result).toEqual({ ok: true, value: CANONICAL });
  });

  it('rejects anything that is not a string', () => {
    expect(normalizeCode(null)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(undefined)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(42)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(['drum', 'yoga', 'vivid', 'clay'])).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode({ code: CANONICAL })).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects input over 128 raw bytes before doing any shape work', () => {
    // 200 bytes and zero words: the byte cap must fire first, not 'wrong_shape'.
    const result = normalizeCode('x'.repeat(200));
    expect(result).toEqual({ ok: false, code: 'too_many_bytes' });
  });

  it('measures the byte cap on raw input, not on normalized input', () => {
    // 60 fullwidth letters = 180 UTF-8 bytes, but only 60 bytes after NFKC.
    // The cap bounds the work done to normalize, so this must still be rejected.
    const fullwidthA = 'ａ'; // ａ
    const result = normalizeCode(fullwidthA.repeat(60));
    expect(result).toEqual({ ok: false, code: 'too_many_bytes' });
  });

  it('accepts input at exactly 128 bytes', () => {
    const input = ['a'.repeat(32), 'b'.repeat(31), 'c'.repeat(31), 'd'.repeat(31)].join('-');
    expect(new TextEncoder().encode(input).length).toBe(128);
    expect(normalizeCode(input)).toEqual({ ok: true, value: input });
  });

  it('rejects fewer than four words', () => {
    expect(normalizeCode('drum-yoga-vivid')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects more than four words', () => {
    expect(normalizeCode('drum-yoga-vivid-clay-extra')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(normalizeCode('')).toEqual({ ok: false, code: 'wrong_shape' });
    expect(normalizeCode('   \t  ')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects a code that contains no letters', () => {
    expect(normalizeCode('1234-5678-9012-3456')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('strips digits rather than treating them as word characters', () => {
    // Digits are outside a-z, so they act as separators and split one word in two.
    expect(normalizeCode('dr9um-yoga-vivid-clay')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('collapses casing, spacing, tabs and punctuation to one canonical form', () => {
    for (const spelling of SPELLINGS) {
      expect(unwrap(normalizeCode(spelling))).toBe(CANONICAL);
    }
  });

  it('is idempotent', () => {
    for (const spelling of SPELLINGS) {
      const once = unwrap(normalizeCode(spelling));
      const twice = unwrap(normalizeCode(once));
      expect(twice).toBe(once);
    }
  });
});

describe('digestCode', () => {
  it('returns 64 lowercase hex characters', () => {
    const digest = digestCode(CANONICAL, PEPPER);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pins the exact digest for a known code and pepper', () => {
    // Known-answer test. The relative properties below (format, stability,
    // sensitivity to code and pepper) all survive a semantics-changing edit
    // that keeps 64-hex output -- e.g. swapping key and message in the HMAC,
    // or changing the input encoding. Only an absolute vector catches that,
    // and the module warns the failure would be silent: codes stop validating.
    expect(digestCode(CANONICAL, PEPPER)).toBe(
      '02bb91051960a64f9a01801b662a358881e1ab6e402fb0136e7ca9e9fcd6bf7d',
    );
  });

  it('is stable across calls', () => {
    expect(digestCode(CANONICAL, PEPPER)).toBe(digestCode(CANONICAL, PEPPER));
  });

  it('differs when the pepper differs', () => {
    expect(digestCode(CANONICAL, PEPPER)).not.toBe(digestCode(CANONICAL, OTHER_PEPPER));
  });

  it('differs for a different code under the same pepper', () => {
    expect(digestCode(CANONICAL, PEPPER)).not.toBe(digestCode('drum-yoga-vivid-claw', PEPPER));
  });

  it('produces one digest for every equivalent spelling', () => {
    // This is the property that keeps an issued code working no matter how it
    // is typed back in. If it breaks, every live code breaks with it.
    const expected = digestCode(CANONICAL, PEPPER);
    for (const spelling of SPELLINGS) {
      expect(digestCode(unwrap(normalizeCode(spelling)), PEPPER)).toBe(expected);
    }
  });
});

describe('generateCode', () => {
  const wordlist = ['drum', 'yoga', 'vivid', 'clay', 'ledge', 'onset'] as const;

  it('draws four words in the order the injected randomInt supplies them', () => {
    const indices = [0, 1, 2, 3];
    let call = 0;
    const randomInt = () => indices[call++];
    expect(generateCode(wordlist, randomInt)).toBe('drum-yoga-vivid-clay');
    expect(call).toBe(4);
  });

  it('allows repeated words', () => {
    const randomInt = () => 4;
    expect(generateCode(wordlist, randomInt)).toBe('ledge-ledge-ledge-ledge');
  });

  it('asks for indices bounded by the wordlist length', () => {
    const asked: number[] = [];
    const randomInt = (maxExclusive: number) => {
      asked.push(maxExclusive);
      return 0;
    };
    generateCode(wordlist, randomInt);
    expect(asked).toEqual([6, 6, 6, 6]);
  });

  it('produces a code that normalizes to itself', () => {
    const indices = [5, 4, 2, 0];
    let call = 0;
    const generated = generateCode(wordlist, () => indices[call++]);
    expect(unwrap(normalizeCode(generated))).toBe(generated);
  });

  it('throws on an empty wordlist rather than emitting an undefined word', () => {
    expect(() => generateCode([], () => 0)).toThrow(RangeError);
  });
});
