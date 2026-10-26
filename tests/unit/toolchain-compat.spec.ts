import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Toolchain version combinations that are known to break the test run itself.
 *
 * vitest 5.0.5 reads the modules it evaluates in the MAIN process — globalSetup and reporters, i.e.
 * `tests/global-setup.ts` and `tests/db-lifecycle.reporter.ts` (vitest-e2e.config.ts) — as a Buffer,
 * and Vite 8.3.5 started calling `code.charCodeAt()` on that code when it maps a stack trace. From
 * then on, reading the `.stack` of ANY error created in the main process throws `TypeError:
 * code.charCodeAt is not a function`: every test green, and the run still exits 1 (nest-server saw
 * it 1 run in 3, 2026-10-24). Upstream: vitest-dev/vitest#11682 (fixed on main, not in 5.0.5).
 * Vite 8.3.4 is the documented workaround. PORTED from @lenne.tech/nest-server on 2026-10-24.
 *
 * The pin is the direct `vite` devDependency (8.3.4, like nest-server's). It replaced a
 * `vite@<8.3.4` override on 2026-10-24, because the override, hoisted into a monorepo root by
 * `lt fullstack init`, rewrote the app's vite peer ranges (see `pnpm-workspace.yaml`).
 *
 * Checks the INSTALLED versions, and vite as VITEST resolves it — that is the copy that runs.
 * The declared pin alone would not prove it: before vitest 5, vite was also a regular dependency of
 * vitest and could resolve on its own. Resolving from the project root also covers a generated
 * monorepo, where the packages are hoisted to the workspace root.
 *
 * Delete this spec once vitest ships the fix (a release after 5.0.5), and raise `vite` with it.
 */

const ROOT = join(__dirname, '../..');
const requireFromRoot = createRequire(join(ROOT, 'package.json'));

function installedVersion(pkg: string, from: NodeJS.Require = requireFromRoot): string {
  return from(`${pkg}/package.json`).version;
}

function parse(version: string): number[] {
  return version.split('-')[0].split('.').map(Number);
}

function atLeast(version: string, floor: string): boolean {
  const [a, b] = [parse(version), parse(floor)];
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return true;
}

describe('toolchain compatibility', () => {
  it('does not combine vitest 5.0.0–5.0.5 with vite >= 8.3.5 (vitest-dev/vitest#11682)', () => {
    const vitest = installedVersion('vitest');
    const vite = installedVersion('vite', createRequire(requireFromRoot.resolve('vitest/package.json')));
    // The Buffer read is new in vitest 5; 4.x passes strings and is not affected.
    const vitestAffected = atLeast(vitest, '5.0.0') && !atLeast(vitest, '5.0.6');
    expect(
      !vitestAffected || !atLeast(vite, '8.3.5'),
      `vitest ${vitest} + vite ${vite}: main-process stack traces crash the run — keep the vite devDependency at 8.3.4`,
    ).toBe(true);
  });
});
