import { describe, it, expect } from 'vitest';
import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';

describe('ok', () => {
  it('wraps a value in a success result', () => {
    expect(ok('greenville')).toEqual({ ok: true, value: 'greenville' });
  });

  it('preserves falsy values rather than treating them as failure', () => {
    expect(ok('')).toEqual({ ok: true, value: '' });
    expect(ok(0)).toEqual({ ok: true, value: 0 });
    expect(ok(null)).toEqual({ ok: true, value: null });
  });

  it('returns a fresh object on every call', () => {
    const a = ok('one');
    const b = ok('two');
    expect(a).not.toBe(b);
    expect(a.value).toBe('one');
    expect(b.value).toBe('two');
  });
});

describe('err', () => {
  it('wraps a code in a failure result', () => {
    expect(err('too_many_bytes')).toEqual({ ok: false, code: 'too_many_bytes' });
  });
});

describe('discriminating on the ok flag', () => {
  // The whole point of the shape: callers branch on `.ok` and TypeScript
  // narrows to the right member without a cast.
  function describeResult(result: Ok<number> | Err<'boom'>): string {
    if (result.ok) {
      return `value:${result.value}`;
    }
    return `code:${result.code}`;
  }

  it('narrows to the success member', () => {
    expect(describeResult(ok(42))).toBe('value:42');
  });

  it('narrows to the failure member', () => {
    expect(describeResult(err('boom'))).toBe('code:boom');
  });
});
