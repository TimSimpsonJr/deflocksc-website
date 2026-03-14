/**
 * Sync open-civics package data into the formats the site expects.
 *
 * Run as a prebuild step:  node scripts/sync-open-civics.mjs
 *
 * 1. Assembles individual local council files from open-civics into
 *    src/data/local-councils.json (combined format)
 * 2. Copies boundary GeoJSON files from open-civics-boundaries into
 *    public/districts/
 */

import { readdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Resolve package paths relative to project node_modules
// (package "exports" field restricts require.resolve, so use direct paths)
const nodeModules = join(PROJECT_ROOT, 'node_modules');

// --- Local councils ---

const localDir = join(nodeModules, 'open-civics', 'data', 'sc', 'local');
const files = readdirSync(localDir).filter(f => f.endsWith('.json'));

const councils = {};
for (const file of files) {
  const data = JSON.parse(readFileSync(join(localDir, file), 'utf-8'));
  const key = data.meta.jurisdiction;
  councils[key] = {
    label: data.meta.label,
    members: data.members,
  };
}

const outPath = join(PROJECT_ROOT, 'src', 'data', 'local-councils.json');
writeFileSync(outPath, JSON.stringify(councils, null, 2) + '\n');
console.log(`Wrote ${Object.keys(councils).length} jurisdictions to src/data/local-councils.json`);

// --- Boundaries ---

const boundaryDir = join(nodeModules, 'open-civics-boundaries', 'data', 'sc', 'boundaries');
const distDir = join(PROJECT_ROOT, 'public', 'districts');
const boundaryFiles = readdirSync(boundaryDir).filter(f => f.endsWith('.json'));

for (const file of boundaryFiles) {
  cpSync(join(boundaryDir, file), join(distDir, file));
}
console.log(`Copied ${boundaryFiles.length} boundary files to public/districts/`);
