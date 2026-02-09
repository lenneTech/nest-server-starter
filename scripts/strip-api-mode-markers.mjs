#!/usr/bin/env node

/**
 * Strip API Mode Markers
 *
 * Removes all #region/#endregion marker comments from source and test files,
 * keeping all the content. Use this if you want to use the starter in "Both" mode
 * without any markers.
 *
 * Also cleans up:
 * - api-mode.manifest.json
 * - The strip-markers script entry from package.json
 * - This script file itself
 */

import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * Recursively find all .ts files in a directory
 */
function findTsFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
      results.push(...findTsFiles(fullPath));
    } else if (stat.isFile() && extname(entry) === '.ts') {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Remove region marker lines from file content
 */
function stripMarkers(content) {
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.match(/^\/\/ #(region|endregion)\s/);
  });
  return filtered.join('\n');
}

// 1. Strip markers from all .ts files in src/ and tests/
const dirs = [join(projectRoot, 'src'), join(projectRoot, 'tests')];
let filesModified = 0;

for (const dir of dirs) {
  try {
    const files = findTsFiles(dir);
    for (const file of files) {
      const original = readFileSync(file, 'utf-8');
      const stripped = stripMarkers(original);
      if (original !== stripped) {
        writeFileSync(file, stripped, 'utf-8');
        filesModified++;
        console.log(`  Stripped markers from: ${file.replace(projectRoot + '/', '')}`);
      }
    }
  } catch {
    // Directory might not exist
  }
}

console.log(`\nStripped markers from ${filesModified} file(s).`);

// 2. Delete api-mode.manifest.json
try {
  unlinkSync(join(projectRoot, 'api-mode.manifest.json'));
  console.log('Deleted api-mode.manifest.json');
} catch {
  // File might not exist
}

// 3. Remove strip-markers script from package.json
try {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (pkg.scripts && pkg.scripts['strip-markers']) {
    delete pkg.scripts['strip-markers'];
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log('Removed strip-markers script from package.json');
  }
} catch (e) {
  console.error('Could not update package.json:', e.message);
}

// 4. Delete this script
try {
  unlinkSync(__filename);
  console.log('Deleted strip-api-mode-markers.mjs');
} catch {
  // Might fail on Windows
}

console.log('\nDone! All markers have been removed. The starter is now in "Both" mode.');
