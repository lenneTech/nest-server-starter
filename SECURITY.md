# Security

## Dependency advisories

`pnpm audit` runs as a gating step of `pnpm run check`. It must be **green**, and it must
be green *honestly* — a permanently red audit trains people to skip the check, which costs
more than any single advisory.

There are exactly two ways an advisory leaves the report:

1. **Fix it.** Add an entry to `overrides:` in `pnpm-workspace.yaml` pinning a patched
   release. This is the default and covers almost every case.
2. **Suppress it**, via `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` — only when 1 is
   provably impossible, or when the advisory is a false positive.

### Rules for a suppression

An entry is only acceptable with all four of these written next to it:

1. **Name the advisory** (GHSA id, and the CVE if one exists).
2. **State which claim you are making** — either *the dependency provably cannot be fixed*,
   or *the code IS fixed and the advisory is a false positive* (an upstream range that was
   never narrowed after a backport). These are different claims; do not blur them.
3. **Say why the residual risk is acceptable**, naming the affected paths and whether any
   of them reaches the production image.
4. **Date the verification**, and say what would make the entry removable.

If you cannot write those honestly, fix the dependency instead.

### The scoping trap

`ignoreGhsas` matches on the **GHSA id alone**. pnpm applies no package, version or path
filter. A suppression justified by "these two paths are dev-only" still hides the *same*
advisory if it later appears on a production path.

So a suppression is not only a statement about today's tree — it is a standing hole in the
detection. Whenever a suppressed advisory affects a package that also has a production
path, record that explicitly and state what to re-check after a dependency bump. The
current `GHSA-mh99-v99m-4gvg` entry does this; follow its shape.

### Verifying a patch claim

Check the package's **`main` entry point**, not the package as a whole. Backports have
shipped with a stray `dist/` that carries the fix while `main` still points at unpatched
code — grepping the whole package then reports "patched" when it is not.

```bash
node -p "require.resolve('<pkg>')"   # what actually loads
```

### Override targets

Target the **newest patched release that also clears the `minimumReleaseAge` gate**, not
the minimum that merely clears the advisory (an override is a hard pin and would hold the
package back), and not the absolute latest either (a release younger than the cutoff fails
`pnpm install` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Check before bumping:

```bash
npm view <pkg> time --json
```

Prefer picking a slightly older patched release over adding a `minimumReleaseAgeExclude`
entry. Standing exemptions to the release-age gate weaken a supply-chain control for
everyone; waiting out a cutoff costs nothing.

Note that `pnpm audit --fix` (run by `pnpm run check:fix`) auto-appends `name@version`
entries to `minimumReleaseAgeExclude`. Those are machine-written, not decisions — remove
them again.

## Reporting a vulnerability

Report security issues in this template privately to security@lenne.tech rather than via a
public issue.
