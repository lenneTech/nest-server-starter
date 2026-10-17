'use strict';

// Start timer
console.time('duration');

// =====================================================================================================================
// Configurations
// =====================================================================================================================
const npmPackage = '@lenne.tech/nest-server';
const addMissing = process.argv.includes('--add-missing');

// =====================================================================================================================
// Import packages and data
// =====================================================================================================================

// Get require function
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import packages
import * as https from 'https';
import { execSync } from 'child_process';
import fs from 'fs';
import { alignPackageVersions, DEPENDENCY_SECTIONS } from './align-package-versions.mjs';

// Get directory path
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =====================================================================================================================
// Operations
// =====================================================================================================================

// Get package.json
console.log('Get package.json');
const packageJson = require('../package.json');
if (!packageJson) {
  console.log('Missing package.json');
  process.exit(1);
}

// Get version
const version = packageJson?.dependencies?.[npmPackage];
if (!version) {
  console.log('Please install Nest-Server: pnpm add @lenne.tech/nest-server');
  process.exit(1);
}
console.log('Found ' + npmPackage + ' version ' + version);

// Get metadata
console.log('Get metadata from npm registry');
let meta;
try {
  meta = await getPackageData(npmPackage);
} catch (e) {
  console.log('Metadata could not be loaded:' + e.message);
  process.exit(1);
}
if (meta.name !== npmPackage) {
  console.log('Expected ' + npmPackage + ' but found: ' + meta.name);
  process.exit(1);
}

// Update versions — the rule lives in align-package-versions.mjs: a package this project declares is
// raised to the framework's version in the section the project keeps it. What the framework ships
// (`dependencies`) counts for either section; what it only develops with counts for devDependencies.
console.log(addMissing ? 'Update existing and add missing packages' : 'Update existing packages');
const alignment = alignPackageVersions(packageJson, meta['versions']?.[version], { addMissing });
for (const { current, name, section } of alignment.skipped) {
  console.log(section, name, 'skipped — cannot compare "' + current + '" (not a version or range)');
}
for (const { from, name, range, section, to } of alignment.raised) {
  console.log(section, name, from + ' => ' + to + (range ? ' (range no longer covers it)' : ''));
}
for (const { name, section, version: addedVersion } of alignment.added) {
  console.log(section, name, 'added ' + addedVersion);
}
for (const section of DEPENDENCY_SECTIONS) {
  if (packageJson[section]) {
    packageJson[section] = Object.fromEntries(
      Object.entries(packageJson[section]).sort((a, b) => a[0].localeCompare(b[0])),
    );
  }
}
const counter = alignment.raised.length;
const added = alignment.added.length;
if (!counter && !added) {
  execSync('cd ' + __dirname + '/.. && pnpm install', { stdio: 'inherit' });
  console.log('Everything is up-to-date for ' + npmPackage + ' version ' + version);
  getVersionHint();
  process.exit(0);
}
if (counter) console.log(counter + ' packages updated');
if (added) console.log(added + ' packages added');

// Save package.json
console.log('Save package.json');
try {
  fs.writeFileSync(__dirname + '/../package.json', JSON.stringify(packageJson, null, 2));
} catch (e) {
  console.log('Error during saving package.json: ' + e.message);
  process.exit(1);
}

// Install packages
execSync('cd ' + __dirname + '/.. && pnpm install', { stdio: 'inherit' });
console.timeEnd('duration');

// Get version hint
getVersionHint();

// =====================================================================================================================
// Helper functions
// =====================================================================================================================

/**
 * Get package data from npm registry
 * @param {string} packageName - Name of the package
 * @returns {Promise<object>}
 */
function getPackageData(packageName) {
  return new Promise((resolve, reject) => {
    https
      .get('https://registry.npmjs.org/' + packageName, (resp) => {
        let data = '';

        // A chunk of data has been received.
        resp.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          resolve(JSON.parse(data));
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

/**
 * Get version hint if necessary
 */
function getVersionHint() {
  // Hint
  if (meta['dist-tags'].latest && meta['dist-tags'].latest !== version) {
    console.warn(
      'You use version ' + version + ', the latest version of ' + npmPackage + ' is: ' + meta['dist-tags'].latest
    );
  }
}
