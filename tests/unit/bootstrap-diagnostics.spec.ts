import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Wiring guard for the process-exit diagnostics.
 *
 * The diagnostics themselves live in `@lenne.tech/nest-server`
 * (`installProcessDiagnostics` / `handleFatalBootstrapError`) and are unit-tested there —
 * this spec only asserts that the starter actually *wires them up*, because that wiring is
 * what every generated project inherits.
 *
 * Why it matters: without it a Node API dies "silently" — the dev runner prints nothing but
 * `app crashed`, no stacktrace, and a failed `bootstrap()` degrades into a mere
 * unhandledRejection that leaves a ZOMBIE process "alive" but listening on nothing.
 *
 * Mode-agnostic on purpose: the import is checked by symbol, not by module specifier. The lt
 * CLI's vendor conversion rewrites `from '@lenne.tech/nest-server'` to a relative `./core`
 * path (see `convertCloneToVendored`), so pinning the specifier here would fail every
 * vendor-mode project.
 */
/**
 * Reads a repo file with line and block comments removed.
 *
 * Without this, `// installProcessDiagnostics();` satisfies a naive `toContain()` — so the one
 * edit these guards exist to catch (someone commenting the wiring out) would pass unnoticed.
 *
 * @param relativePath - Path relative to the repository root
 * @returns The source with comments stripped
 */
function readSourceWithoutComments(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('bootstrap process-exit diagnostics (src/main.ts)', () => {
  const mainSource = readSourceWithoutComments('src/main.ts');

  it('imports both diagnostics helpers from the framework, not from a local copy', () => {
    expect(mainSource).toContain('installProcessDiagnostics');
    expect(mainSource).toContain('handleFatalBootstrapError');
    // A re-introduced project-local copy would defeat the point — the helpers ship with the
    // framework so every project gets fixes without re-vendoring their own variant.
    expect(mainSource).not.toContain('server/common/services/process-diagnostics');
  });

  it('installs the diagnostics before the server is created', () => {
    // Installing after NestFactory.create() would miss failures during module construction —
    // exactly the class of startup crash that is hardest to diagnose.
    const installIndex = mainSource.indexOf('installProcessDiagnostics()');
    const createIndex = mainSource.indexOf('NestFactory.create');
    expect(installIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(createIndex);
  });

  it('treats a bootstrap rejection as fatal instead of leaving a zombie process', () => {
    expect(mainSource).toContain('bootstrap().catch(handleFatalBootstrapError)');
    expect(mainSource).not.toMatch(/^bootstrap\(\);\s*$/m);
  });
});

describe('graceful shutdown (src/main.ts)', () => {
  const mainSource = readSourceWithoutComments('src/main.ts');

  it('enables shutdown hooks so SIGTERM actually terminates the container', () => {
    // Without this, the diagnostics handler is the ONLY signal listener, so it takes the
    // re-raise branch — and `process.kill(self, SIGTERM)` is a no-op at PID 1 (a PID-namespace
    // init is SIGNAL_UNKILLABLE for a default-disposition signal). The listening HTTP server
    // keeps the event loop busy, so `docker stop` waits out its grace period and SIGKILLs:
    // in-flight requests dropped, every onModuleDestroy() skipped.
    expect(mainSource).toContain('enableShutdownHooks()');

    const hooksIndex = mainSource.indexOf('enableShutdownHooks()');
    const listenIndex = mainSource.indexOf('server.listen(');
    expect(hooksIndex).toBeGreaterThan(-1);
    expect(listenIndex).toBeGreaterThan(-1);
    expect(hooksIndex).toBeLessThan(listenIndex);
  });
});

describe('dev runner heap configuration (nodemon.json)', () => {
  it('does NOT pin --max-old-space-size', () => {
    // Measured on a 32 GB host (Node 24): `--max-old-space-size=4096` yields a heap_size_limit of
    // 4288 MB — byte-identical to the default, i.e. a no-op. On a SMALLER host it is worse than a
    // no-op: it RAISES the ceiling above V8's own choice and pushes the process closer to the OS
    // OOM-killer, which is the undiagnosable SIGKILL the diagnostics exist to eliminate.
    //
    // In a container the flag is actively harmful: Node sizes the default heap from the cgroup
    // limit via uv_get_constrained_memory(), but ONLY while the flag is unset. Pinning a literal
    // disables that and restores the OOM-kill. Leaving it unset is the correct configuration
    // everywhere — this guard exists so a future "make dev and prod consistent" commit does not
    // silently re-add a value that cannot help.
    const nodemon = JSON.parse(readFileSync(join(process.cwd(), 'nodemon.json'), 'utf8')) as {
      env?: Record<string, string>;
    };
    expect(nodemon.env?.NODE_OPTIONS ?? '').not.toContain('--max-old-space-size');
  });
});
