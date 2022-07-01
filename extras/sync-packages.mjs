'use strict';

// Start timer
console.time('duration');

// =====================================================================================================================
// Configurations
// =====================================================================================================================
const npmPackage = '@lenne.tech/nest-server';

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
const semver = require('semver');

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
  console.log('Please install Nest-Server: npm i @lenne.tech/nest-server');
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

// Check packageJson
if (!packageJson.devDependencies) {
  packageJson.devDependencies = {};
}

// Update versions
console.log('Add or update packages');
let counter = 0;
for (const dep of ['dependencies', 'devDependencies']) {
  // console.log(dep, meta['versions'][version][dep]);
  if (!meta['versions'][version][dep]) {
    continue;
  }
  for (const [pack, ver] of Object.entries(meta['versions'][version][dep])) {
    if (!packageJson[dep][pack] || semver.gt(ver, packageJson[dep][pack])) {
      const old = packageJson[dep][pack];
      packageJson[dep][pack] = ver;
      console.log(dep, pack, old + ' => ' + ver);
      counter++;
    }
  }
  packageJson[dep] = Object.fromEntries(Object.entries(packageJson[dep]).sort((a, b) => a[0].localeCompare(b[0])));
}
if (!counter) {
  execSync('cd ' + __dirname + '/.. && npm i', { stdio: 'inherit' });
  console.log('Everything is up-to-date for ' + npmPackage + ' version ' + version);
  getVersionHint();
  process.exit(0);
}
console.log(counter + ' packages updated');

// Save package.json
console.log('Save package.json');
try {
  fs.writeFileSync(__dirname + '/../package.json', JSON.stringify(packageJson, null, 2));
} catch (e) {
  console.log('Error during saving package.json: ' + e.message);
  process.exit(1);
}

// Install packages
execSync('cd ' + __dirname + '/.. && npm i', { stdio: 'inherit' });
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
