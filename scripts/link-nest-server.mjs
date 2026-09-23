#!/usr/bin/env node
/**
 * Links a local @lenne.tech/nest-server checkout into this project (`pnpm link <path>`).
 *
 * Replaces `pnpm link ${NEST_SERVER_PATH:-../nest-server}`: the default-value expansion is POSIX
 * shell syntax, and cmd.exe passes it through literally. The path is made absolute before it is
 * handed on, so pnpm never has to guess what a relative path was relative to.
 *
 * Usage: [NEST_SERVER_PATH=<path>] node scripts/link-nest-server.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the nest-server checkout: `NEST_SERVER_PATH`, else `../nest-server`. */
export function nestServerPath(env = process.env, cwd = process.cwd()) {
  return resolve(cwd, env.NEST_SERVER_PATH || '../nest-server');
}

const entry = process.argv[1];
if (entry && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))) {
  const path = nestServerPath();
  if (!existsSync(path)) {
    console.error(`nest-server checkout not found at ${path} — set NEST_SERVER_PATH to its location.`);
    process.exit(1);
  }
  // Through the shell because pnpm is a .cmd shim on Windows; quoted for paths with spaces.
  const result = spawnSync(`pnpm link "${path}"`, { shell: true, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
