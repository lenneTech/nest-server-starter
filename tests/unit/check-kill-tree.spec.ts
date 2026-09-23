/**
 * Guards for the watchdog's process-tree kill in `scripts/check.mjs`.
 *
 * WHY ONLY THE PLAN IS EXECUTED
 * `killTree()` sends real signals. A test that runs it — even with an injected platform — sends
 * them for real on the POSIX branch, and a wrong PID there (`-1`) is a broadcast to every process
 * of the user. That is what rebooted a developer machine on 2026-09-23. So the decision lives in
 * the pure `killTreePlan()` and is tested from both platforms here; the call site is guarded by
 * reading its source, never by running it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { killTreePlan } from '../../scripts/check.mjs';

describe('killTreePlan', () => {
  it('forces the whole tree on Windows', () => {
    expect(killTreePlan(4321, 'SIGTERM', 'win32')).toEqual({
      args: ['/PID', '4321', '/T', '/F'],
      command: 'taskkill',
    });
  });

  it('keeps /F even for the polite signal, because Windows has no polite stage', () => {
    // `taskkill /T` without `/F` was measured to answer "Die Beendigung dieses Prozesses muss
    // erzwungen werden" and leave the port held — the hang the watchdog exists to end.
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      expect(killTreePlan(1, signal, 'win32').args, `${signal} must still force`).toContain('/F');
    }
  });

  it('passes the signal through on POSIX and names no command', () => {
    expect(killTreePlan(4321, 'SIGTERM', 'linux')).toEqual({ signal: 'SIGTERM' });
    expect(killTreePlan(4321, 'SIGKILL', 'darwin')).toEqual({ signal: 'SIGKILL' });
  });
});

describe('killTree call site', () => {
  // Static on purpose (see header). Without this, reverting killTree to the pgrep-only version
  // leaves every killTreePlan case above green while Windows orphans vitest again.
  const source = readFileSync(join(process.cwd(), 'scripts/check.mjs'), 'utf8');
  const body = source.slice(source.indexOf('function killTree('), source.indexOf('function capture('));

  it('asks killTreePlan first and runs its command before any pgrep', () => {
    const plan = body.indexOf('killTreePlan(child.pid, signal)');
    const run = body.indexOf('execFileSync(plan.command, plan.args');
    const pgrep = body.indexOf('pgrep');
    expect(plan).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(plan);
    expect(pgrep).toBeGreaterThan(run);
  });

  it('returns after the platform command instead of falling through to pgrep', () => {
    expect(body.slice(body.indexOf('if (plan.command)'), body.indexOf('pgrep'))).toMatch(/\breturn;/);
  });
});
