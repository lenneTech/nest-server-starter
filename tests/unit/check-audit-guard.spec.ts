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
import { describe, expect, it } from 'vitest';

import { auditDegradedText, isAuditEndpointUnavailable, resolveAuditDegradation } from '../../scripts/check.mjs';

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
      const texts = (['unreachable', 'unreadable', 'retired'] as const).map((reason) =>
        auditDegradedText(reason, { short }),
      );
      expect(new Set(texts).size).toBe(3);
    }
  });

  it('never claims a check happened', () => {
    expect(auditDegradedText('unreadable', { short: false })).toContain('NOT CHECKED');
    expect(auditDegradedText('unreadable', { short: true })).toContain('not blocking');
  });
});
