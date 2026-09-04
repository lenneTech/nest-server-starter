/**
 * Every `node <path>.js` in package.json must point at a file the build actually produces.
 *
 * WHY THIS EXISTS
 * A command meant to run from the build is written as `node ./dist/scripts/x.js`. Whether that
 * file exists depends on two independent mechanisms, and nothing makes them agree:
 *
 *   - `tsconfig.build.json` COMPILES an explicit `include` list. In this starter that list is
 *     `["src/**\/*", "migrations/**\/*.ts", "migrations-utils/**\/*.ts"]` — it does not mention
 *     `scripts/` at all. Anything under `scripts/` is therefore never compiled.
 *   - `copy:scripts` (`cpy ./scripts ./dist/`) COPIES the directory verbatim into the image.
 *
 * So a `.mjs` or `.sh` under `scripts/` works in `dist/` because copying is enough, while a `.ts`
 * lands there as `.ts` and cannot run — the production image has no ts-node. Two different ways to
 * end up with a script that will not start:
 *
 *   - never compiled, never copied  ->  `dist/scripts/x.js` is simply absent
 *   - copied but not compiled       ->  `dist/scripts/x.ts` IS there, and `x.js` is not
 *
 * The second is the nastier one. `dist/scripts/` looks populated, so the search starts in the wrong
 * place. This starter already carries a live example: `scripts/init-server.ts` ships to
 * `dist/scripts/init-server.ts`, and `dist/scripts/init-server.js` has never existed.
 *
 * Both fail LATE and in the worst place. Adding the package.json entry succeeds, the build
 * succeeds, the deploy succeeds, and the missing file surfaces as MODULE_NOT_FOUND on the server —
 * in the middle of the very operation the script was written for. That is how a data migration
 * failed on its first production run in a downstream project.
 *
 * WHAT IT CHECKS
 * Not a naming convention — the ground truth. After a build, `dist/` is a fact, so every
 * `node <path>.js` in package.json has to resolve to a file that is really there. That catches both
 * routes above and a mistyped path too, and it needs no convention to hold. An earlier draft keyed
 * off a `:prod` script-name suffix; this repo has no such convention, so that check would have
 * found zero candidates and reported green forever — worse than no check, because it looks like
 * coverage.
 *
 * WHAT IT SAYS WHEN IT FAILS
 * The remedy is derived from the real `include` list, not hardcoded, because the right advice
 * differs per tree. For `src/` — already compiled — "add it to include" is meaningless; the
 * source is covered and something else went wrong. For `scripts/` — deliberately NOT compiled,
 * so dev tooling stays out of the image — "add it to include" is a change to the build concept,
 * not a routine fix, and usually the better answer is to write the script as `.mjs` so that
 * copying is enough. Naming the wrong one of those sends the reader down the wrong path.
 *
 * Runs AFTER the build; there is no `dist/` before it. Without one it says so and passes rather
 * than inventing a failure — a fresh checkout has no build, and that is not a defect.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

if (!existsSync(join(ROOT, 'dist'))) {
  console.log('[prod-scripts] skipped — no dist/ yet, run the build first.');
  process.exit(0);
}

// `node ./dist/scripts/x.js`, `node dist/src/main.js`, also behind env prefixes
// (`NODE_ENV=production node dist/src/main.js`) and node flags.
const INVOCATION = /\bnode\s+(?:--[^\s]+\s+)*(\.?\/?(?:dist|build)\/[^\s"';&|]+\.js)/g;

// The remedy is DERIVED from the real `include` list, not hardcoded. "Add it to include" is
// routine advice for a tree that is already compiled (`src/`), but a deliberate change to the
// build concept for one that is not (`scripts/` is dev tooling and stays out of the image).
// Naming the wrong one of those sends the reader down the wrong path.
// tsconfig.build.json is JSONC — it carries comments worth keeping, and stripping them with a
// naive regex corrupts the data: `/\/\*[\s\S]*?\*\//` eats the `/**/` INSIDE a glob like
// `src/**/*` and silently turns it into `src*`. So pull just the `include` array out of the raw
// text and read the quoted entries; no comment handling needed, nothing to corrupt.
const BUILD_INCLUDES = (() => {
  try {
    const raw = readFileSync(join(ROOT, 'tsconfig.build.json'), 'utf8');
    const block = raw.match(/"include"\s*:\s*\[([^\]]*)\]/);
    return block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  } catch {
    return [];
  }
})();

// If the list could not be read (file renamed, `include` written some other way), say so instead
// of silently treating everything as "not in include" — a confidently wrong remedy is worse than
// an honest "could not check". Same failure class as the JSONC mine above: nothing throws, and
// every statement built on the empty list is wrong.
const INCLUDE_KNOWN = BUILD_INCLUDES.length > 0;

function coveredByInclude(sourcePath) {
  return BUILD_INCLUDES.some((glob) => {
    const body = String(glob)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\/\*/g, '.*')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${body}$`).test(sourcePath);
  });
}

const failures = [];
let checked = 0;

for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  for (const match of String(command).matchAll(INVOCATION)) {
    checked += 1;
    const relative = match[1].replace(/^\.\//, '');
    if (existsSync(resolve(ROOT, relative))) {
      continue;
    }

    // `rootDir` is the project root and `outDir` is ./dist, so dist/<p> mirrors <p>.
    const source = relative.replace(/^(?:dist|build)\//, '').replace(/\.js$/, '.ts');
    const tree = source.split('/')[0];
    const copiedTs = relative.replace(/\.js$/, '.ts');
    const copiedNotCompiled = existsSync(resolve(ROOT, copiedTs));
    const inInclude = coveredByInclude(source);

    let hint;
    if (!INCLUDE_KNOWN) {
      // Every include-based statement below would be a guess dressed up as a fact.
      const what = copiedNotCompiled
        ? `${copiedTs} is there but was only COPIED, not compiled`
        : existsSync(resolve(ROOT, source))
          ? `${source} exists but produced no output`
          : `there is no source at ${source} either`;
      hint =
        `${what}. Could not read the "include" list from tsconfig.build.json, so this cannot ` +
        `say whether "${source}" is meant to be compiled — check that file by hand.`;
    } else if (copiedNotCompiled && !inInclude) {
      hint =
        `${copiedTs} is there but was only COPIED, not compiled. ` +
        `"${tree}/" is not in the "include" list of tsconfig.build.json, so nothing under it is ` +
        `ever compiled — write the script as .mjs (copying is then enough), or add "${source}" ` +
        `to "include" if it really belongs in the image.`;
    } else if (copiedNotCompiled) {
      hint =
        `${copiedTs} is there but was only COPIED, not compiled — ` +
        `although "${source}" IS covered by "include". Check the build for a compile error.`;
    } else if (!existsSync(resolve(ROOT, source))) {
      hint = `there is no source at ${source} either — the path is most likely wrong.`;
    } else if (!inInclude) {
      hint =
        `${source} exists but "${tree}/" is not in the "include" list of tsconfig.build.json, ` +
        `so it is never compiled — write it as .mjs, or add "${source}" to "include".`;
    } else {
      hint = `${source} exists and is covered by "include", yet nothing was emitted. Check the build.`;
    }

    failures.push(`  "${name}" runs ${relative}, which the build does not produce.\n      ${hint}`);
  }
}

if (failures.length > 0) {
  console.error('[prod-scripts] a script points at a file the build does not produce:\n');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`[prod-scripts] ok — ${checked} built entry point(s) exist.`);
