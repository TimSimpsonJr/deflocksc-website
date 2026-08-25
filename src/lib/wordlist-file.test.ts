import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWordlistChecksum, parseWordlist, WORDLIST_SIZE } from './organizer-cli.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'data');
const wordlistPath = join(dataDir, 'eff-short-wordlist-2.txt');
const checksumPath = join(dataDir, 'eff-short-wordlist-2.sha256');

describe('committed EFF short wordlist #2', () => {
  it('matches the recorded sha256 checksum', () => {
    const bytes = readFileSync(wordlistPath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    const record = readFileSync(checksumPath, 'utf-8');
    expect(checkWordlistChecksum(actual, record)).toEqual({ ok: true, value: actual });
  });

  it('names the wordlist file in the checksum record', () => {
    const record = readFileSync(checksumPath, 'utf-8').trim();
    expect(record).toContain('eff-short-wordlist-2.txt');
  });

  it('still satisfies every structural rule', () => {
    const result = parseWordlist(readFileSync(wordlistPath, 'utf-8'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(WORDLIST_SIZE);
      expect(result.value[0]).toBe('aardvark');
      expect(result.value[WORDLIST_SIZE - 1]).toBe('zucchini');
    }
  });

  it('uses LF line endings only', () => {
    expect(readFileSync(wordlistPath, 'utf-8')).not.toContain('\r');
  });
});
