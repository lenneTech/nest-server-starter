#!/usr/bin/env node
/**
 * Refuses to run a deployed migrate script before the build has produced its inputs.
 *
 * WHY THIS EXISTS
 * `migrate:{develop,test,preview,prod}:up` run the COMPILED migrations out of `dist/`, the same
 * way `docker-entrypoint.sh` does in production. They used to run the TypeScript sources through
 * `--compiler ts:…`, which needs ts-node — a devDependency, and therefore absent from any tree
 * installed with `pnpm install --prod`. That is how the documented production start (README:
 * `pnpm run dp:prod`) died with "ts-node is required to run migrations from TypeScript sources".
 *
 * The switch to `dist/` costs one thing: these scripts now need a build first. Without this guard
 * that difference is SILENT — `migrate up` treats a missing migrations directory as "nothing to
 * do" and exits 0, so an unbuilt checkout reports a successful migration run that never happened,
 * and the server then starts against an unmigrated database. A loud failure is worth far more
 * than a quiet zero here.
 *
 * It checks the STORE file rather than the migrations directory. `copy:migrations` always writes
 * `dist/migrations-utils/migrate.js`, so its presence means "a build ran", while
 * `dist/migrations/` legitimately stays empty in a project that has no migrations yet.
 *
 * The developer scripts `migrate:up`, `migrate:down` and `migrate:list` are unaffected: they keep
 * running the TypeScript sources with ts-node out of a full installation, which is the right tool
 * on a developer machine.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'dist', 'migrations-utils', 'migrate.js');

if (!existsSync(STORE)) {
  console.error(
    '[migrations] dist/migrations-utils/migrate.js is missing — this script runs the compiled\n' +
      '             migrations and needs a build first:\n\n' +
      '                 pnpm run build\n\n' +
      '             For migrations from the TypeScript sources on a developer machine use\n' +
      '             `pnpm run migrate:up` (and :down / :list), which do not need a build.',
  );
  process.exit(1);
}
