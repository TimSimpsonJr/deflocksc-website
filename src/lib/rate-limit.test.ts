import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above imports, so the fake store and the mocked factory
// must be hoisted with it.
const { fakeStore, rateLimitStore } = vi.hoisted(() => {
  const fakeStore = {
    getWithMetadata: vi.fn(),
    setJSON: vi.fn(),
  };
  return { fakeStore, rateLimitStore: vi.fn(() => fakeStore) };
});

vi.mock('./blob-stores.js', () => ({
  rateLimitStore,
}));

import { consume, hashSubject } from './rate-limit.js';

const TODAY = '2026-08-18';
const SUBJECT = 'a'.repeat(64);
const KEY = `rl/${TODAY}/${SUBJECT}`;

beforeEach(() => {
  fakeStore.getWithMetadata.mockReset();
  fakeStore.setJSON.mockReset();
  // mockReset clears the implementation too, so restore the default of
  // returning the fake store; the factory-throw test overrides this.
  rateLimitStore.mockReset();
  rateLimitStore.mockReturnValue(fakeStore);
});

describe('hashSubject', () => {
  it('returns a 64-character lowercase hex digest', () => {
    expect(hashSubject('203.0.113.7', 'salt-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never returns or contains the input IP', () => {
    const ip = '203.0.113.7';
    const digest = hashSubject(ip, 'salt-a');
    expect(digest).not.toBe(ip);
    expect(digest).not.toContain(ip);
  });

  it('is stable for the same ip and salt', () => {
    expect(hashSubject('203.0.113.7', 'salt-a')).toBe(hashSubject('203.0.113.7', 'salt-a'));
  });

  it('produces different digests for different salts', () => {
    expect(hashSubject('203.0.113.7', 'salt-a')).not.toBe(hashSubject('203.0.113.7', 'salt-b'));
  });

  it('produces different digests for different IPs under one salt', () => {
    expect(hashSubject('203.0.113.7', 'salt-a')).not.toBe(hashSubject('203.0.113.8', 'salt-a'));
  });
});

describe('consume', () => {
  it('allows the first call and reports used=1', async () => {
    fakeStore.getWithMetadata.mockResolvedValue(null);
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
  });

  it('reads and writes the bucket at rl/<today>/<subject>', async () => {
    fakeStore.getWithMetadata.mockResolvedValue(null);
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    await consume(SUBJECT, 5, TODAY);

    expect(fakeStore.getWithMetadata).toHaveBeenCalledWith(KEY, {
      type: 'json',
      consistency: 'strong',
    });
    expect(fakeStore.setJSON.mock.calls[0][0]).toBe(KEY);
  });

  it('never lets a raw IP reach the key or the stored value', async () => {
    const ip = '198.51.100.42';
    const subject = hashSubject(ip, 'pepper');
    fakeStore.getWithMetadata.mockResolvedValue(null);
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    await consume(subject, 5, TODAY);

    const [key, value] = fakeStore.setJSON.mock.calls[0];
    expect(key).toBe(`rl/${TODAY}/${subject}`);
    expect(key).not.toContain(ip);
    expect(JSON.stringify(value)).not.toContain(ip);
  });

  it('creates a missing bucket with onlyIfNew', async () => {
    fakeStore.getWithMetadata.mockResolvedValue(null);
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    await consume(SUBJECT, 5, TODAY);

    expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 1 }, { onlyIfNew: true });
  });

  it('guards an existing bucket with onlyIfMatch on its etag', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 2 }, etag: 'etag-v2' });
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 3 }, { onlyIfMatch: 'etag-v2' });
    expect(verdict).toEqual({ allowed: true, used: 3, limit: 5 });
  });

  it('denies a subject already at the limit and does not write', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 5 }, etag: 'etag-v5' });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: false, used: 5, limit: 5 });
    expect(fakeStore.setJSON).not.toHaveBeenCalled();
  });

  it('denies a subject already past the limit', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 9 }, etag: 'etag-v9' });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: false, used: 9, limit: 5 });
    expect(fakeStore.setJSON).not.toHaveBeenCalled();
  });

  it('retries after an etag conflict and then succeeds', async () => {
    fakeStore.getWithMetadata
      .mockResolvedValueOnce({ data: { count: 1 }, etag: 'etag-v1' })
      .mockResolvedValueOnce({ data: { count: 2 }, etag: 'etag-v2' });
    fakeStore.setJSON
      .mockResolvedValueOnce({ modified: false })
      .mockResolvedValueOnce({ modified: true });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 3, limit: 5 });
    expect(fakeStore.getWithMetadata).toHaveBeenCalledTimes(2);
    expect(fakeStore.setJSON).toHaveBeenCalledTimes(2);
    expect(fakeStore.setJSON.mock.calls[0][2]).toEqual({ onlyIfMatch: 'etag-v1' });
    expect(fakeStore.setJSON.mock.calls[1][2]).toEqual({ onlyIfMatch: 'etag-v2' });
  });

  it('fails open after three consecutive conflicts', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 2 }, etag: 'etag-v2' });
    fakeStore.setJSON.mockResolvedValue({ modified: false });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 2, limit: 5 });
    expect(fakeStore.setJSON).toHaveBeenCalledTimes(3);
  });

  it('fails open when the store read throws', async () => {
    fakeStore.getWithMetadata.mockRejectedValue(new Error('blobs unavailable'));

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
  });

  it('fails open when the store write throws', async () => {
    fakeStore.getWithMetadata.mockResolvedValue(null);
    fakeStore.setJSON.mockRejectedValue(new Error('context refused'));

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
  });

  it('fails open when getWithMetadata throws synchronously', async () => {
    // A synchronous throw from the store method (as opposed to a rejected
    // promise) must still be swallowed. This is the case the old test
    // mislabelled as the factory throwing — kept here under its true name.
    fakeStore.getWithMetadata.mockImplementation(() => {
      throw new Error('read exploded');
    });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
  });

  it('fails open when the store factory itself throws', async () => {
    // rateLimitStore() throwing (missing site id, refused context) must not
    // 500 the caller. This genuinely makes the factory throw, so the store
    // methods are never reached.
    rateLimitStore.mockImplementation(() => {
      throw new Error('no store');
    });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
    expect(fakeStore.getWithMetadata).not.toHaveBeenCalled();
    expect(fakeStore.setJSON).not.toHaveBeenCalled();
  });

  it('treats a corrupt or missing count as zero', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 'lots' }, etag: 'etag-x' });
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
    expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 1 }, { onlyIfMatch: 'etag-x' });
  });

  it('treats a negative count as zero', async () => {
    fakeStore.getWithMetadata.mockResolvedValue({ data: { count: -4 }, etag: 'etag-neg' });
    fakeStore.setJSON.mockResolvedValue({ modified: true });

    const verdict = await consume(SUBJECT, 5, TODAY);

    expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
  });

  it('denies immediately when limit is zero', async () => {
    fakeStore.getWithMetadata.mockResolvedValue(null);

    const verdict = await consume(SUBJECT, 0, TODAY);

    expect(verdict).toEqual({ allowed: false, used: 0, limit: 0 });
    expect(fakeStore.setJSON).not.toHaveBeenCalled();
  });
});
