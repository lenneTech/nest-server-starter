/**
 * Pins which migrate scripts may need ts-node.
 *
 * WHY THIS EXISTS
 * `--compiler ts:…` loads `ts-node`, which is a devDependency. Any tree installed with
 * `pnpm install --prod` therefore cannot run a script that carries that flag — and the documented
 * production start goes straight through one: README names `pnpm run dp:prod`, which runs
 * `migrate:prod:up` first. Measured in a generated project on 2026-09-16:
 *
 *     Error: ts-node is required to run migrations from TypeScript sources
 *
 * The deployed scripts therefore run the COMPILED migrations from `dist/`, exactly as
 * `docker-entrypoint.sh` has always done. The developer scripts keep the TypeScript sources,
 * because that is the point of them.
 *
 * Both halves are asserted. Pinning only the deployed ones would leave "just add --compiler back,
 * then it runs without a build" as an inviting fix for the wrong problem.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const scripts: Record<string, string> = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')).scripts;

const DEPLOYED = ['migrate:develop:up', 'migrate:test:up', 'migrate:preview:up', 'migrate:prod:up'];
const DEVELOPER = ['migrate:up', 'migrate:down', 'migrate:list'];

describe('deployed migrate scripts run without ts-node', () => {
  it.each(DEPLOYED)('%s does not load the ts compiler', (name: string) => {
    expect(scripts[name]).toBeDefined();
    expect(scripts[name]).not.toContain('--compiler');
  });

  it.each(DEPLOYED)('%s applies the compiled migrations from dist/', (name: string) => {
    expect(scripts[name]).toContain('--store ./dist/migrations-utils/migrate.js');
    expect(scripts[name]).toContain('--migrations-dir ./dist/migrations');
  });

  // `migrate up` treats a missing migrations directory as "nothing to do" and exits 0, so without
  // this guard an unbuilt checkout reports a successful run that never happened.
  it.each(DEPLOYED)('%s refuses to run before the build', (name: string) => {
    expect(scripts[name]).toContain('node scripts/require-built-migrations.mjs &&');
  });
});

describe('developer migrate scripts keep the TypeScript sources', () => {
  it.each(DEVELOPER)('%s runs the sources through ts-node', (name: string) => {
    expect(scripts[name]).toBeDefined();
    expect(scripts[name]).toContain('--compiler ts:');
    expect(scripts[name]).toContain('--migrations-dir ./migrations');
  });
});
