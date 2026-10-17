/**
 * The version rule behind `pnpm run update` (extras/sync-packages.mjs), kept apart from that script
 * so it can be tested without the registry round trip and the package.json write the script does.
 *
 * A package this project already declares is raised to the framework's version when that is newer,
 * in the section this project keeps it. Which framework section may supply that version depends on
 * the project's section (`RAISE_SOURCES`):
 *
 * - What the framework SHIPS (`dependencies`) follows into either section. nest-server needs
 *   `mongodb` at runtime, this project keeps it as a devDependency — and Better-Auth's MongoDB adapter
 *   resolves its `mongodb` peer from exactly that pin. Matching sections left it on an older driver
 *   than the framework's mongoose requires: two bson copies, the adapter's `instanceof ObjectId`
 *   failed and sign-in answered 401.
 * - What the framework only develops and tests with (`devDependencies`) raises only this project's
 *   devDependencies, never a runtime pin. The better-auth trio is the reason: the framework holds it as
 *   devDependencies (its test versions; the peer range is the contract), this project holds it as
 *   dependencies and owns that version, because api and app must resolve the same better-auth.
 *
 * nest-server's consumer gate (scripts/check-consumer.mjs, `alignConsumerPins()`) applies the same
 * rule before every release. Keep the two identical: a gate that is more generous than this file
 * certifies an update path no project has.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const semver = require('semver');

export const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies'];

/** Which framework sections may raise a pin in each section of this project. */
export const RAISE_SOURCES = {
  dependencies: ['dependencies'],
  devDependencies: ['dependencies', 'devDependencies'],
};

/**
 * The newest exact version the framework declares for `name` across `sections`, else undefined.
 *
 * @param {object} frameworkManifest - the framework's package.json (or its registry entry)
 * @param {string} name - package name
 * @param {string[]} sections - framework sections to consider
 * @returns {string | undefined}
 */
function newestFrameworkVersion(frameworkManifest, name, sections) {
  let newest;
  for (const section of sections) {
    const version = frameworkManifest?.[section]?.[name];
    if (semver.valid(version) && (!newest || semver.gt(version, newest))) {
      newest = version;
    }
  }
  return newest;
}

/**
 * Raise (and with `addMissing`, add) this project's pins to the framework's versions.
 *
 * - Raised: a package the project declares, when the framework's version is newer. It stays in the
 *   section the project put it in; `RAISE_SOURCES` decides which framework sections count.
 * - Never lowered, and never moved to another section.
 * - A range is raised only when the framework's version lies ABOVE the whole range. A range that
 *   already admits it is left alone: rewriting it to an exact pin would narrow what the project
 *   deliberately left open. Anything that is neither a version nor a range is skipped and reported.
 * - Added (only with `addMissing`): a framework package the project declares in NEITHER section,
 *   into the section the framework uses (`dependencies` when it uses both).
 *
 * Mutates `packageJson` and returns what it changed.
 *
 * @param {object} packageJson - this project's package.json
 * @param {object} frameworkManifest - the framework's package.json (or its registry entry)
 * @param {{ addMissing?: boolean }} [options]
 */
export function alignPackageVersions(packageJson, frameworkManifest, { addMissing = false } = {}) {
  const result = { added: [], raised: [], skipped: [] };

  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, current] of Object.entries(packageJson[section] ?? {})) {
      const version = newestFrameworkVersion(frameworkManifest, name, RAISE_SOURCES[section]);
      if (!version) {
        continue;
      }

      // `semver.gt` needs two exact versions and THROWS on a range — a single `^4.21.0` anywhere in
      // the project used to abort the whole script with `TypeError: Invalid Version`, so
      // `pnpm run update` did nothing at all. The starter pins exactly, but projects grow ranges
      // over time; one is enough to take the update path down.
      if (!semver.valid(current)) {
        if (!semver.validRange(current)) {
          result.skipped.push({ current, name, section });
        } else if (semver.gtr(version, current)) {
          packageJson[section][name] = version;
          result.raised.push({ from: current, name, range: true, section, to: version });
        }
        continue;
      }

      if (semver.gt(version, current)) {
        packageJson[section][name] = version;
        result.raised.push({ from: current, name, range: false, section, to: version });
      }
    }
  }

  if (addMissing) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, version] of Object.entries(frameworkManifest?.[section] ?? {})) {
        const declared = DEPENDENCY_SECTIONS.some((own) => packageJson[own]?.[name] !== undefined);
        if (!declared && semver.valid(version)) {
          packageJson[section] = packageJson[section] ?? {};
          packageJson[section][name] = version;
          result.added.push({ name, section, version });
        }
      }
    }
  }

  return result;
}
