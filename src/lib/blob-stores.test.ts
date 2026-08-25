import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Store } from '@netlify/blobs';

// vi.mock calls are hoisted above the imports, so a plain `const mock = vi.fn()`
// at module scope would still be in its temporal dead zone when the mock factory
// runs. vi.hoisted is the supported way to create the spy early enough.
const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));

vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));

import {
  ContextRefusedError,
  codesStore,
  eventsStore,
  linksStore,
  metaStore,
  rateLimitStore,
} from './blob-stores.js';

/** Stand-in for a real Netlify Store: same method names, all spied. */
function makeFakeStore() {
  return {
    get: vi.fn(async () => 'stored-value'),
    getWithMetadata: vi.fn(async () => ({
      data: 'stored-value',
      etag: 'etag-1',
      metadata: {},
    })),
    list: vi.fn(async () => ({ blobs: [{ key: 'k7m29qxb', etag: 'etag-1' }], directories: [] })),
    set: vi.fn(async () => ({ etag: 'etag-2', modified: true })),
    setJSON: vi.fn(async () => ({ etag: 'etag-2', modified: true })),
    delete: vi.fn(async () => undefined),
    deleteAll: vi.fn(async () => ({ deleted: 1 })),
  };
}

let fake: ReturnType<typeof makeFakeStore>;
const originalContext = process.env.CONTEXT;

beforeEach(() => {
  fake = makeFakeStore();
  getStoreMock.mockReset();
  getStoreMock.mockImplementation(() => fake as unknown as Store);
});

afterEach(() => {
  if (originalContext === undefined) {
    delete process.env.CONTEXT;
  } else {
    process.env.CONTEXT = originalContext;
  }
});

describe('store configuration', () => {
  it('opens the events store with strong consistency', () => {
    eventsStore();
    expect(getStoreMock).toHaveBeenCalledWith({ name: 'events', consistency: 'strong' });
  });

  it('opens the codes store with strong consistency', () => {
    codesStore();
    expect(getStoreMock).toHaveBeenCalledWith({ name: 'codes', consistency: 'strong' });
  });

  it('opens the ratelimit store without a consistency override', () => {
    rateLimitStore();
    expect(getStoreMock).toHaveBeenCalledWith({ name: 'ratelimit' });
  });

  it('opens the meta store without a consistency override', () => {
    metaStore();
    expect(getStoreMock).toHaveBeenCalledWith({ name: 'meta' });
  });

  it('opens the links store with strong consistency', () => {
    linksStore();
    expect(getStoreMock).toHaveBeenCalledWith({ name: 'links', consistency: 'strong' });
  });

  it('never imports or calls the deploy-scoped store helper', () => {
    // Asserted against the import line rather than the whole file so the module
    // docblock is free to name the forbidden API when explaining why.
    const source = readFileSync(
      fileURLToPath(new URL('./blob-stores.ts', import.meta.url)),
      'utf8',
    );
    const importLine = source
      .split('\n')
      .find((line) => line.includes("from '@netlify/blobs'"));

    expect(importLine).toBeDefined();
    expect(importLine).not.toContain('getDeployStore');
    expect(source).not.toMatch(/getDeployStore\s*\(/);
  });
});

describe.each(['deploy-preview', 'branch-deploy', 'dev'])('CONTEXT=%s', (context) => {
  beforeEach(() => {
    process.env.CONTEXT = context;
  });

  it('refuses set', () => {
    const store = eventsStore();
    expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
    expect(fake.set).not.toHaveBeenCalled();
  });

  it('refuses setJSON', () => {
    const store = eventsStore();
    expect(() => store.setJSON('k7m29qxb', { title: 'x' })).toThrow(ContextRefusedError);
    expect(fake.setJSON).not.toHaveBeenCalled();
  });

  it('refuses delete', () => {
    const store = codesStore();
    expect(() => store.delete('deadbeef')).toThrow(ContextRefusedError);
    expect(fake.delete).not.toHaveBeenCalled();
  });

  it('refuses deleteAll', () => {
    const store = codesStore();
    expect(() => store.deleteAll()).toThrow(ContextRefusedError);
    expect(fake.deleteAll).not.toHaveBeenCalled();
  });

  it('still allows get', async () => {
    const store = eventsStore();
    await expect(store.get('k7m29qxb')).resolves.toBe('stored-value');
    expect(fake.get).toHaveBeenCalledWith('k7m29qxb');
  });

  it('still allows getWithMetadata and list', async () => {
    const store = eventsStore();
    await expect(store.getWithMetadata('k7m29qxb')).resolves.toEqual({
      data: 'stored-value',
      etag: 'etag-1',
      metadata: {},
    });
    await expect(store.list()).resolves.toEqual({
      blobs: [{ key: 'k7m29qxb', etag: 'etag-1' }],
      directories: [],
    });
  });
});

describe('CONTEXT unset', () => {
  beforeEach(() => {
    delete process.env.CONTEXT;
  });

  it('refuses writes', () => {
    const store = eventsStore();
    expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
    expect(fake.set).not.toHaveBeenCalled();
  });

  it('still allows reads', async () => {
    const store = eventsStore();
    await expect(store.get('k7m29qxb')).resolves.toBe('stored-value');
  });
});

describe('ContextRefusedError', () => {
  it('is an Error naming the store, the operation, and the context', () => {
    process.env.CONTEXT = 'deploy-preview';
    const store = codesStore();

    let caught: unknown;
    try {
      store.delete('deadbeef');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(ContextRefusedError);
    expect((caught as Error).name).toBe('ContextRefusedError');
    expect((caught as Error).message).toContain('codes');
    expect((caught as Error).message).toContain('delete');
    expect((caught as Error).message).toContain('deploy-preview');
  });

  it('reads CONTEXT at call time, not at store-creation time', () => {
    process.env.CONTEXT = 'production';
    const store = eventsStore();

    process.env.CONTEXT = 'branch-deploy';
    expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
    expect(fake.set).not.toHaveBeenCalled();
  });
});

describe('CONTEXT=production', () => {
  beforeEach(() => {
    process.env.CONTEXT = 'production';
  });

  it('passes set through', async () => {
    const store = eventsStore();
    await expect(store.set('k7m29qxb', 'x')).resolves.toEqual({
      etag: 'etag-2',
      modified: true,
    });
    expect(fake.set).toHaveBeenCalledWith('k7m29qxb', 'x');
  });

  it('passes setJSON through with its options argument intact', async () => {
    const store = rateLimitStore();
    await store.setJSON('rl/2026-08-17/abc123', { used: 1 }, { onlyIfMatch: 'etag-1' });
    expect(fake.setJSON).toHaveBeenCalledWith(
      'rl/2026-08-17/abc123',
      { used: 1 },
      { onlyIfMatch: 'etag-1' },
    );
  });

  it('passes delete through', async () => {
    const store = codesStore();
    await store.delete('deadbeef');
    expect(fake.delete).toHaveBeenCalledWith('deadbeef');
  });

  it('passes deleteAll through', async () => {
    const store = metaStore();
    await expect(store.deleteAll()).resolves.toEqual({ deleted: 1 });
    expect(fake.deleteAll).toHaveBeenCalled();
  });
});

describe('links store', () => {
  it('refuses writes outside production', () => {
    process.env.CONTEXT = 'deploy-preview';
    const store = linksStore();
    expect(() => store.setJSON('intake', 'https://signal.group/#x')).toThrow(
      ContextRefusedError,
    );
    expect(fake.setJSON).not.toHaveBeenCalled();
  });

  it('passes writes through in production', async () => {
    process.env.CONTEXT = 'production';
    const store = linksStore();
    await store.setJSON('intake', 'https://signal.group/#x');
    expect(fake.setJSON).toHaveBeenCalledWith('intake', 'https://signal.group/#x');
  });
});
