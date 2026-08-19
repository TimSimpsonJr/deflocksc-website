#!/usr/bin/env node
/**
 * Download, verify, and commit the EFF Short Wordlist #2.
 *
 * Source:  https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt
 * Linked from https://www.eff.org/dice as "EFF's Short Wordlist #2".
 * Format:  1296 lines of "<4 dice digits>\t<word>", tab separated.
 *
 * The list is committed to the repo so code generation is auditable and so the
 * CLI never depends on a network fetch. This script exists so that fact is
 * reproducible: run it again and you should get a byte-identical file.
 *
 * Run:  npm run build-wordlist
 *
 * Like the codes CLI, this is bundled by esbuild before it runs, because Node's
 * type stripping cannot resolve this repo's './x.js' -> x.ts imports. All paths
 * are therefore resolved from process.cwd() (npm sets it to the repo root), not
 * from import.meta.url, which after bundling points into node_modules/.cache.
 *
 * If the URL 404s, find the current link on https://www.eff.org/dice, update
 * SOURCE_URL below and scripts/data/SOURCES.md, and re-run. Do not substitute a
 * different list: the whole point of #2 is unique 3-character prefixes and an
 * edit distance of at least 3, which is what survives being read aloud over a
 * bad phone line.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  WORDLIST_SHA_REL,
  WORDLIST_SIZE,
  WORDLIST_TXT_REL,
  parseWordlist,
} from '../src/lib/organizer-cli.js';

const SOURCE_URL = 'https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt';
const PROJECT_ROOT = process.cwd();
const TXT_PATH = join(PROJECT_ROOT, WORDLIST_TXT_REL);
const SHA_PATH = join(PROJECT_ROOT, WORDLIST_SHA_REL);

function die(message: string): never {
  process.stderr.write(`build-wordlist: ${message}\n`);
  process.exit(1);
}

/** Levenshtein distance, capped: returns min(distance, cap). */
function distanceUpTo(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) >= cap) return cap;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = new Array<number>(b.length + 1);
    row[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best >= cap) return cap;
    prev = row;
  }
  return Math.min(prev[b.length], cap);
}

async function main(): Promise<void> {
  process.stdout.write(`Fetching ${SOURCE_URL}\n`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    die(
      `HTTP ${response.status} ${response.statusText}. Check https://www.eff.org/dice for the current link.`,
    );
  }

  // Normalize to LF and guarantee exactly one trailing newline, so the checksum
  // is stable across platforms and git's autocrlf settings.
  const normalized = (await response.text()).replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';

  const parsed = parseWordlist(normalized);
  if (!parsed.ok) {
    die(
      `downloaded file failed structural validation (${parsed.code}). Wrong file, or the format changed.`,
    );
  }
  const words = parsed.value;
  if (words.length !== WORDLIST_SIZE) die('unreachable: count changed after validation');
  process.stdout.write(
    `OK: ${words.length} words, all lowercase a-z, unique, unique 3-char prefixes.\n`,
  );

  // Advisory check. EFF documents an edit distance of at least 3 between words
  // in this list; a nonzero count here means you almost certainly downloaded a
  // different list. Not fatal, because the property is documented rather than
  // guaranteed, and the checks above are the ones that matter for correctness.
  let closePairs = 0;
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      if (distanceUpTo(words[i], words[j], 3) < 3) closePairs += 1;
    }
  }
  process.stdout.write(`Edit-distance check: ${closePairs} pair(s) closer than 3 (expected 0).\n`);

  mkdirSync(dirname(TXT_PATH), { recursive: true });
  writeFileSync(TXT_PATH, normalized, 'utf-8');
  const digest = createHash('sha256').update(Buffer.from(normalized, 'utf-8')).digest('hex');
  writeFileSync(SHA_PATH, `${digest}  eff-short-wordlist-2.txt\n`, 'utf-8');

  process.stdout.write(`Wrote ${TXT_PATH}\n`);
  process.stdout.write(`Wrote ${SHA_PATH}\n`);
  process.stdout.write(`sha256 ${digest}\n`);
}

await main();
