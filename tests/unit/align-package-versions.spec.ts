/**
 * The version rule behind `pnpm run update` (extras/align-package-versions.mjs).
 *
 * WHY THE SECTION CASES ARE THE ONES THAT MATTER
 * Until 11.42.15 the rule only raised a pin the framework declared in the SAME section. nest-server
 * keeps `mongodb` in `dependencies`, this project in `devDependencies` — and Better-Auth's MongoDB
 * adapter resolves its `mongodb` peer from that pin. The release that moved mongoose to 9.11 (which
 * requires mongodb ~7.7) would have left every project on mongodb 7.6.0 next to the framework's 7.7.0:
 * two bson copies, a failing `instanceof ObjectId` in the adapter, and 401 on sign-in.
 *
 * The reverse direction stays closed: the framework's devDependencies (e.g. the better-auth trio it
 * tests against) never raise this project's runtime dependencies, because api and app must resolve
 * the same better-auth and the project owns that version.
 *
 * nest-server's consumer gate (`alignConsumerPins()`) applies the same rule; both must stay identical.
 *
 * Observed red: a same-section lookup fails the first two cases below; letting `dependencies` take
 * its version from both framework sections in `RAISE_SOURCES` fails the third and the last.
 */
import { describe, expect, it } from 'vitest';

import { alignPackageVersions } from '../../extras/align-package-versions.mjs';

const framework = {
  dependencies: { '@nestjs/common': '11.2.7', mongodb: '7.7.0', mongoose: '9.11.2' },
  devDependencies: { 'better-auth': '1.7.8', oxfmt: '0.72.0', typescript: '5.9.3' },
};

describe('alignPackageVersions — the rule behind `pnpm run update`', () => {
  it('raises a framework runtime dependency in whichever section the project keeps it', () => {
    const project = {
      dependencies: { '@lenne.tech/nest-server': '11.42.15', mongoose: '9.10.4' },
      devDependencies: { mongodb: '7.6.0', oxfmt: '0.71.0' },
    };
    const { added, raised } = alignPackageVersions(project, framework);

    expect(project.dependencies).toEqual({ '@lenne.tech/nest-server': '11.42.15', mongoose: '9.11.2' });
    expect(project.devDependencies).toEqual({ mongodb: '7.7.0', oxfmt: '0.72.0' });
    expect(raised).toEqual(
      expect.arrayContaining([
        { from: '9.10.4', name: 'mongoose', range: false, section: 'dependencies', to: '9.11.2' },
        { from: '7.6.0', name: 'mongodb', range: false, section: 'devDependencies', to: '7.7.0' },
        { from: '0.71.0', name: 'oxfmt', range: false, section: 'devDependencies', to: '0.72.0' },
      ]),
    );
    expect(raised).toHaveLength(3);
    expect(added).toEqual([]);
  });

  it('never moves a package into the framework section, and never duplicates it with addMissing', () => {
    const project = { dependencies: {}, devDependencies: { mongodb: '7.6.0' } };
    const { added } = alignPackageVersions(project, framework, { addMissing: true });

    expect(project.devDependencies.mongodb).toBe('7.7.0');
    expect(project.dependencies).not.toHaveProperty('mongodb');
    expect(added.map((entry) => entry.name)).not.toContain('mongodb');
  });

  it('never raises a runtime dependency from a framework devDependency', () => {
    const project = { dependencies: { 'better-auth': '1.7.7', typescript: '5.8.3' } };
    const { raised } = alignPackageVersions(project, framework);

    expect(project.dependencies).toEqual({ 'better-auth': '1.7.7', typescript: '5.8.3' });
    expect(raised).toEqual([]);
  });

  it('never lowers and never adds without addMissing', () => {
    const project = { dependencies: { mongoose: '9.12.0' }, devDependencies: {} };
    const { added, raised } = alignPackageVersions(project, framework);

    expect(project.dependencies).toEqual({ mongoose: '9.12.0' });
    expect(project.devDependencies).toEqual({});
    expect(raised).toEqual([]);
    expect(added).toEqual([]);
  });

  it('adds a missing package to the framework section with addMissing', () => {
    const project = { dependencies: {} };
    const { added } = alignPackageVersions(project, framework, { addMissing: true });

    expect(project.dependencies).toMatchObject({ '@nestjs/common': '11.2.7', mongoose: '9.11.2' });
    expect(project).toHaveProperty('devDependencies.oxfmt', '0.72.0');
    expect(added).toHaveLength(6);
  });

  it('raises a range only when the framework version lies above it, and skips what is not a version', () => {
    const project = {
      dependencies: { '@nestjs/common': '^11.2.0', mongodb: 'latest', mongoose: '~9.10.0' },
    };
    const { raised, skipped } = alignPackageVersions(project, framework);

    // ^11.2.0 already admits 11.2.7 → left open as the project chose.
    expect(project.dependencies['@nestjs/common']).toBe('^11.2.0');
    // ~9.10.0 does not admit 9.11.2 → raised to the exact version.
    expect(project.dependencies.mongoose).toBe('9.11.2');
    expect(raised).toEqual([{ from: '~9.10.0', name: 'mongoose', range: true, section: 'dependencies', to: '9.11.2' }]);
    // A dist-tag is neither a version nor a range: reported, never overwritten.
    expect(project.dependencies.mongodb).toBe('latest');
    expect(skipped).toEqual([{ current: 'latest', name: 'mongodb', section: 'dependencies' }]);
  });

  it('takes the newest version from the framework sections allowed for the project section', () => {
    const both = { dependencies: { mongodb: '7.9.0' }, devDependencies: { mongodb: '7.11.0' } };
    const dev = { devDependencies: { mongodb: '7.10.0' } };
    alignPackageVersions(dev, both);
    // Compared numerically: 7.11.0 is newer than 7.10.0.
    expect(dev.devDependencies.mongodb).toBe('7.11.0');

    // A runtime pin follows only what the framework ships, never its own test version.
    const runtime = { dependencies: { mongodb: '7.8.0' } };
    alignPackageVersions(runtime, both);
    expect(runtime.dependencies.mongodb).toBe('7.9.0');
  });
});
