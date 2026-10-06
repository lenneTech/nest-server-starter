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
2. **State which claim you are making** — one of three, and they are different claims, so do
   not blur them:
   - *the dependency provably cannot be fixed* (no patched release exists — verify against the
     REGISTRY's version list, not the advisory's claim: an advisory naming a version nobody
     published is not a rarity);
   - *the code IS fixed and the advisory is a false positive* (an upstream range that was never
     narrowed after a backport);
   - *a patched release exists, but the consumer provably cannot use it* — then the entry needs a
     matching `auditConfig.unusableFixConsumers` line as well, see below.
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
path, record that explicitly and state what to re-check after a dependency bump. The two
current entries (`GHSA-ch52-4w7c-c8xp`, `GHSA-vfj7-8cjw-p6xm`, since 2026-10-03) follow that
shape — copy it.

### Before the third claim: can a patch make the fix usable?

The third claim is the one to be strict about, because "the consumer cannot use it" is also what
it looks like when nobody tried hard enough. When the patched major only fails to LOAD — a removed
default export, a renamed entry point — a one-line `pnpm patch` can turn the dead end into a real
fix, and then the advisory closes instead of being suppressed. Measured case (lt-crm, 2026-10-06):
one CRITICAL and two HIGH simple-git advisories whose only fix was 4.x, which dropped the ESM
default export `@nuxt/devtools` imports. A patch restoring that one export — the same binding the
module already exports under its named form, so security-neutral — closed all three.

Three conditions, and the third is the one that usually fails:

1. The patch is **pinned to an exact version**, so the next release makes `pnpm install` fail
   LOUDLY rather than silently patching something else. A patch against a minified symbol is
   acceptable only with that pin, and the failure is then the signal to re-check upstream.
2. The patch restores an **interface**, it does not change behaviour. If you cannot say what else
   that major changed and why it does not matter here, the patch is a guess in the costume of a fix.
3. Someone will carry it. A patch is a standing obligation on every future bump. For a dev-tooling
   path outside the production image, weigh that against simply declaring the residual.

Record that you evaluated patching and why you declined, or the next person pays to rediscover it.

### What keeps a suppression honest

Two guards, one per way an entry goes wrong, and an entry needs both:

| Question | Guard | Fails when |
|----------|-------|------------|
| Is it still TRUE? | `pnpm run check:overrides` (part of `check`) | the GitHub advisory gains a patched version or is withdrawn — the entry is obsolete, remove it. Under `CI` an unreachable API fails too, so the workflow passes `GITHUB_TOKEN` |
| Is the THIRD claim still true? | the same guard, against `auditConfig.unusableFixConsumers` | the declared consumer moves or leaves the tree, the advisory gains a patched version nobody assessed (a BACKPORT into a line the consumer *can* use), or anything other than exactly `consumer@version` starts pulling the affected package — including a dependency this repository declares itself, which is a version bump nobody made rather than a dead end |
| Is it still in SCOPE? | `tests/unit/audit-suppression-scope.spec.ts` | the package appears in the PRODUCTION tree, or an entry has no matching case there |

A declaration for the third claim records the consumer, **the version it was assessed against**
and the patched version it rejected — `'@nuxt/devtools@3.4.1 cannot use 4.0.1'` — because each of
those can change without anybody revisiting the entry. That is what makes it expire by itself
instead of ageing into a permanent exception.

A new entry therefore also needs a case in that spec. Both travel with the template into
generated projects. In a generated **monorepo** the lt CLI hoists this file into the root,
where lt-monorepo's own `check:overrides` covers the merged suppressions; the scope spec stands
down there and says so.

### Verifying a patch claim

Check the package's **`main` entry point**, not the package as a whole. Backports have
shipped with a stray `dist/` that carries the fix while `main` still points at unpatched
code — grepping the whole package then reports "patched" when it is not.

```bash
node -p "require.resolve('<pkg>')"   # what actually loads
```

### Override keys: one rule per package

An override key is matched against the **requested range** (semver intersection), not
against the resolved version. A bounded key like `ip-address@<10.3.1` therefore still
fires for a consumer asking `^10.0.0` and pins the whole tree to the target. Every entry
in `overrides:` is a hard pin — there is no such thing as a "floor only" override.

Two rules for the same package fight, and **the loser is invisible**. Until 2026-08-22
this repo carried both of these:

```yaml
'@hono/node-server': 1.19.14          # BELOW the >=2.0.10 that fixes the CVEs
'@hono/node-server@<2.0.10': 2.0.11   # above it
```

The tree happened to land on `2.0.11`, so `pnpm audit` was green while the configuration
said the opposite — one edit away from shipping the advisory. The same shape existed for
`hono` (bare `4.12.25`, below the `4.12.27` fix, rescued only by a second ranged entry),
and earlier for `fast-uri`. Write one rule per package.

### Override targets

Target the **newest patched release that also clears the `minimumReleaseAge` gate**, not
the minimum that merely clears the advisory (an override is a hard pin and would hold the
package back), and not the absolute latest either (a release younger than the cutoff fails
`pnpm install` with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`). Check before bumping:

```bash
npm view <pkg> time --json
```

A target left behind the newest release in its major silently becomes a **downgrade lock**:
the entry looks maintained, the audit is green, and the package is being held back — until
the day an advisory lands on the version it is holding. That is what happened to `fast-uri`
here, and to eleven targets at once in the 11.36.1 sweep.

Two override entries are **lockstep** entries rather than mere floors: `@apollo/server`,
`nodemailer` (and `multer`, `ws`) also appear as declared dependencies of
`@lenne.tech/nest-server`. Under the hoisted linker a target *below* the declared version
does not leave you one patch behind — it puts a **second, older copy** in the tree next to
the declared one. Move those targets in the same commit as the framework bump.

### Verifying an override is still doing something — the only honest test

A clean `pnpm audit` is **not** evidence that an override is obsolete: the audit is clean
*because the override is working*. Diffing against the committed lockfile proves nothing
either — it already carries the pins. Do two **fresh** resolves and diff them:

```bash
mkdir -p /tmp/ovA /tmp/ovB
cp package.json pnpm-workspace.yaml /tmp/ovA/
cp package.json /tmp/ovB/ && <strip the `overrides:` block> > /tmp/ovB/pnpm-workspace.yaml
(cd /tmp/ovA && pnpm install --lockfile-only)
(cd /tmp/ovB && pnpm install --lockfile-only && pnpm audit)
diff <(grep -E '^  [^ ]' /tmp/ovA/pnpm-lock.yaml) <(grep -E '^  [^ ]' /tmp/ovB/pnpm-lock.yaml)
```

Read the diff as follows:

| Without the override the tree resolves… | Meaning | Action |
| --- | --- | --- |
| an **older** version, and the audit goes red | load-bearing | keep |
| the **same** version | inert today | keep as documented floor, raise the target if it lags |
| a **newer** version | downgrade lock | raise the key and the target together |
| the package is **absent entirely** | the chain left the tree | remove the entry, then re-audit |

Removal needs the last row, or a red audit that the override provably fixes. Nothing else.

Prefer picking a slightly older patched release over adding a `minimumReleaseAgeExclude`
entry. Standing exemptions to the release-age gate weaken a supply-chain control for
everyone; waiting out a cutoff costs nothing.

Note that `pnpm audit --fix` (run by `pnpm run check:fix`) auto-appends `name@version`
entries to `minimumReleaseAgeExclude`. Those are machine-written, not decisions — remove
them again.

## Reporting a vulnerability

Report security issues in this template privately to security@lenne.tech rather than via a
public issue.
