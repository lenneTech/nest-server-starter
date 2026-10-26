/**
 * Guards for the audit-degradation logic in `scripts/check.mjs`.
 *
 * WHY THESE EXIST AS TESTS AND NOT AS A SCRATCH SCRIPT
 * The decision "is this audit failure infrastructure, or a real finding?" is the safety property
 * of the whole check chain: get it wrong in one direction and a genuine vulnerability turns into
 * a yellow warning nobody blocks on; wrong in the other and every outage paints the run red until
 * people learn to ignore it. It was previously unreachable inside `runAudit()`, observable only by
 * running a real audit against a real outage — which is why the three holes below survived.
 *
 * EVERY CASE HERE THAT EXPECTS `false` IS A NEGATIVE CONTROL — a run that MUST keep blocking.
 * Those are the ones that matter. A test suite that only feeds it outage-shaped input passes
 * happily against a guard that degrades everything, which is exactly the failure mode found in
 * three sibling repos on 2026-09-04: freshly written tests, green before and after the guard was
 * deleted, because the inputs never reached the branch under test.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  advisoryBulkUrl,
  auditDegradedText,
  isAuditEndpointUnavailable,
  resolveAuditDegradation,
} from '../../scripts/check.mjs';

const envelope = (error: Record<string, unknown>) => JSON.stringify({ error });

describe('isAuditEndpointUnavailable — infrastructure vs. real failure', () => {
  it('treats a genuine 5xx in the code field as unreachable', () => {
    expect(isAuditEndpointUnavailable(envelope({ code: 502, message: 'bad gateway' }))).toBe('unreachable');
    expect(isAuditEndpointUnavailable(envelope({ code: '503', message: 'service unavailable' }))).toBe('unreachable');
  });

  it('treats timeouts and connection errors as unreachable', () => {
    expect(
      isAuditEndpointUnavailable(envelope({ code: 23, message: 'The operation was aborted due to timeout' })),
    ).toBe('unreachable');
    expect(isAuditEndpointUnavailable(envelope({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }))).toBe(
      'unreachable',
    );
  });

  it("reports a retired endpoint separately, because the reader's next action differs", () => {
    expect(isAuditEndpointUnavailable('ERR_PNPM_AUDIT_BAD_RESPONSE')).toBe('retired');
  });

  // NEGATIVE CONTROL. `\b5\d\d\b` used to run against `code + message` joined, so pnpm's own
  // progress prose matched and a run that had to block became a yellow warning.
  it('does NOT degrade on a 5xx-looking number inside the free text', () => {
    expect(isAuditEndpointUnavailable(envelope({ code: 'pnpm', message: 'audited 503 packages' }))).toBe(false);
    expect(isAuditEndpointUnavailable(envelope({ code: 'pnpm', message: 'audited 500 packages, 0 vulnerable' }))).toBe(
      false,
    );
  });

  // NEGATIVE CONTROL. A 4xx refusal is actionable (token, registry config) and must stay fatal,
  // even when the message happens to carry an outage word.
  it('does NOT degrade on an auth refusal that mentions a timeout', () => {
    expect(isAuditEndpointUnavailable(envelope({ code: 401, message: 'request timeout' }))).toBe(false);
    expect(isAuditEndpointUnavailable(envelope({ code: 403, message: 'aborted' }))).toBe(false);
  });

  // The hang cap (AUDIT_TIMEOUT_MS) kills a `pnpm audit` that never answers. The killed process
  // wrote nothing of its own, so the cap's marker is the only thing any branch could recognise.
  it('reports an audit the hang cap killed as hung', () => {
    const killed =
      'partial output\n[watchdog] step did not finish within 600s — process tree killed as hung. AUDIT_STEP_HUNG';
    expect(isAuditEndpointUnavailable(killed)).toBe('hung');
  });

  // NEGATIVE CONTROL. Only the cap's own marker counts, never the word in a tool's output.
  it('does NOT degrade on the word "hung" without the marker', () => {
    expect(isAuditEndpointUnavailable('ERR_PNPM_UNKNOWN the request hung')).toBe(false);
  });
});

describe('resolveAuditDegradation — which runs may skip the block', () => {
  const counts = { critical: 0, high: 0, info: 0, low: 0, moderate: 0 };

  it('degrades when the ambiguity probe found the service unreachable', () => {
    expect(resolveAuditDegradation({ code: 0, counts, out: '', silentOutage: true })).toBe('unreachable');
  });

  // The hole this file was written for: exit 0 with nothing parseable. `counts` is null, so the
  // ambiguity probe never runs, and the old expression only looked at a non-zero exit — the run
  // fell through to "not degraded" and printed a green tick with a literal 0 next to it.
  it('degrades as "unreadable" on exit 0 with no parseable report', () => {
    expect(resolveAuditDegradation({ code: 0, counts: null, out: 'NOT JSON', silentOutage: false })).toBe('unreadable');
  });

  it('degrades on a non-zero exit carrying an infrastructure signature', () => {
    const out = envelope({ code: 23, message: 'The operation was aborted due to timeout' });
    expect(resolveAuditDegradation({ code: 1, counts: null, out, silentOutage: false })).toBe('unreachable');
  });

  it('degrades an audit the hang cap killed', () => {
    expect(resolveAuditDegradation({ code: 1, counts: null, out: 'AUDIT_STEP_HUNG', silentOutage: false })).toBe(
      'hung',
    );
  });

  // NEGATIVE CONTROL. `false` means "not degraded", i.e. blocking. Folding the two branches into
  // one `!counts` test would turn every genuine audit failure into a warning.
  it('does NOT degrade a real failure — a non-zero exit without an infrastructure signature', () => {
    expect(
      resolveAuditDegradation({ code: 1, counts: null, out: 'found 3 vulnerabilities', silentOutage: false }),
    ).toBe(false);
  });

  // NEGATIVE CONTROL. A parsed report with findings is a result, not an outage.
  it('does NOT degrade when a report was parsed', () => {
    const withFinding = { ...counts, moderate: 1 };
    expect(resolveAuditDegradation({ code: 1, counts: withFinding, out: '{}', silentOutage: false })).toBe(false);
    expect(resolveAuditDegradation({ code: 0, counts, out: '{}', silentOutage: false })).toBe(false);
  });
});

describe('auditDegradedText — every cause reads distinctly', () => {
  // Both render sites used to carry their own binary ternary (`unreachable` or else), so a third
  // cause would silently have been described as the second one. This is the guard against that.
  it('gives each cause its own wording in both the step line and the report', () => {
    for (const short of [true, false]) {
      const texts = (['unreachable', 'unreadable', 'retired', 'hung'] as const).map((reason) =>
        auditDegradedText(reason, { short }),
      );
      expect(new Set(texts).size).toBe(4);
    }
  });

  it('never claims a check happened', () => {
    for (const reason of ['unreadable', 'hung'] as const) {
      expect(auditDegradedText(reason, { short: false })).toContain('NOT CHECKED');
      expect(auditDegradedText(reason, { short: true })).toContain('not blocking');
    }
  });
});

/**
 * `pnpm audit` against a dead registry does not fail, it HANGS: no output, no exit, no error
 * envelope, so none of the degraded signatures above can fire. Only an absolute cap ends that step
 * (AUDIT_TIMEOUT_MS, ported from nest-server 11.40.0).
 *
 * Driven in a CHILD node process on purpose: the signal guard of this worker refuses to signal a
 * process it did not spawn itself, and killTree also signals the shell's children. The child runs
 * the real kill path without that guard, and reads CHECK_AUDIT_TIMEOUT at import like a real run.
 */
describe('the audit hang cap', () => {
  const CHECK_MJS = pathToFileURL(join(import.meta.dirname, '../../scripts/check.mjs')).href;

  /** Imports check.mjs in a fresh node process, awaits `call`, and returns its result plus the elapsed ms. */
  function inChild<T>(call: string, env: Record<string, string> = {}): T & { ms: number } {
    const driver =
      `import(${JSON.stringify(CHECK_MJS)}).then(async (check) => {` +
      '  const started = Date.now();' +
      `  const result = await check.${call};` +
      '  process.stdout.write(JSON.stringify({ ...result, ms: Date.now() - started }));' +
      '});';
    return JSON.parse(
      execFileSync(process.execPath, ['-e', driver], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
        timeout: 25_000,
      }),
    );
  }

  // "Hangs" for 20 s, then exits by itself: without the cap the step returns late and clean,
  // which fails the assertions below instead of leaving an orphaned process behind.
  const HANGING = `"${process.execPath}" -e "setTimeout(Boolean, 20000)"`;

  // Through runAudit() rather than capture(), so the test also fails when the cap is no longer
  // wired into the audit step or CHECK_AUDIT_TIMEOUT is no longer read.
  it('kills an audit that never returns and reports it as hung, without blocking', () => {
    // runAudit() appends `--json` unless the command carries it, and node would reject it as its own
    // option. Behind `--` it is a script argument, and its presence stops the append.
    const audit = inChild<{ blocking: boolean; degradedReason: unknown }>(
      `runAudit(${JSON.stringify(`${HANGING} -- --json`)})`,
      { CHECK_AUDIT_TIMEOUT: '1' },
    );
    expect(audit.degradedReason).toBe('hung');
    expect(audit.blocking).toBe(false);
    expect(audit.ms).toBeLessThan(10_000);
  }, 30_000);

  // NEGATIVE CONTROL. The cap fires on "never came back", never on a step that finished in time.
  it('leaves a step alone that finishes inside the cap', () => {
    const result = inChild<{ code: number; out: string }>(
      `capture(${JSON.stringify(`"${process.execPath}" -e "process.exit(0)"`)}, process.cwd(), 0, 10000)`,
    );
    expect(result.code).toBe(0);
    expect(result.out).not.toContain('AUDIT_STEP_HUNG');
  }, 30_000);
});

describe('check.mjs: advisoryBulkUrl', () => {
  it('asks the registry pnpm actually uses', () => {
    expect(advisoryBulkUrl('https://npm.internal.example/')).toBe(
      'https://npm.internal.example/-/npm/v1/security/advisories/bulk',
    );
  });

  it('tolerates a missing trailing slash and surrounding whitespace', () => {
    // `pnpm config get registry` returns a trailing newline, and not every registry carries a slash.
    expect(advisoryBulkUrl('  https://npm.internal.example  ')).toBe(
      'https://npm.internal.example/-/npm/v1/security/advisories/bulk',
    );
  });

  it.each([
    ['', 'empty'],
    ['undefined', 'the literal pnpm prints when unset'],
    ['not-a-url', 'garbage'],
  ])('falls back to npmjs.org for %s (%s)', (value) => {
    // A malformed setting must degrade to the PREVIOUS behaviour. A probe that throws would
    // report every clean repo as an outage — worse than the bug being fixed.
    expect(advisoryBulkUrl(value)).toBe('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk');
  });

  it('falls back when the value is not a string at all', () => {
    expect(advisoryBulkUrl(undefined as unknown as string)).toBe(
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    );
  });
});
