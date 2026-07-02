# dekimu-mcp — Supply-chain hardening checklist (pre-first-publish)

`@dekimuhq/dekimu-mcp` is the ecosystem's **first public-npm publish**. Public npm is the
live attack surface for supply-chain worms — the **Shai-Hulud wave (June 2026) compromised
100+ npm/PyPI packages** via freshly-published malicious versions and stolen publish tokens.
Work this list **before pushing the publish button** (the button itself stays SL-gated).

Status legend: ✅ already in place · ⬜ to do · 🔁 ongoing policy.

## Already in place (verified 2026-06-16)
- ✅ `files: ["dist"]` — only built output ships, never `src/` or `test/`.
- ✅ `@noble/ed25519@2.3.0` + `@noble/hashes@1.8.0` **exact-pinned** (no `^`).
- ✅ `prepublishOnly`: `check:no-private-dep && build && test` — blocks accidental `@dekimuhq/*`
  private-dep leak into an OSS package.
- ✅ `publishConfig.access: public`, registry `registry.npmjs.org`.

## Identity & publish path
- ⬜ **Enforce 2FA on the `@dekimuhq` npm org** (auth-and-publish level), all members.
- ⬜ **Prefer OIDC trusted publishing over a long-lived token.** Publish from a GitHub Actions
  `publish.yml` with `permissions: { id-token: write }` → no `NPM_TOKEN` secret to steal.
  If a token is unavoidable, use a **granular automation token scoped to this package only**
  and rotate it immediately after the first publish.
- ⬜ Never run `npm publish` from a dev laptop with broad-scope creds — that's the token-theft
  vector Shai-Hulud rode.

## Provenance (build attestation)
- ⬜ Publish with **`npm publish --provenance`** (works automatically under GitHub Actions OIDC).
  Attests the tarball was built from this repo + commit — consumers (the Odysseus / local-agent
  crowd) can verify origin. Document the provenance badge in the README funnel.
- ⬜ Add to CI before publish: `npm audit signatures` — verifies every installed dep carries a
  valid registry signature (catches tampered mirrors).

## Dependency hygiene
- ⬜ **Pin the remaining ranged deps**: `@modelcontextprotocol/sdk ^1.0.0` and `zod ^3.23.0` →
  exact versions (lockfile already pins for builds; pin in `package.json` too so a fresh
  `npm install` can't silently pull a compromised patch). Re-bump deliberately, never via bot.
- ⬜ **Minimum-release-age cooldown** — the core Shai-Hulud defense. Don't install/bump to any
  dep version younger than ~7 days (worms get yanked fast once detected). Enforce via
  `npm config set minimum-release-age` (if supported by the installed npm) or a Socket.dev /
  `npm-audit`-gated CI check. 🔁 standing policy for every future bump.
- ⬜ CI: add `npm audit --audit-level=high` as a **blocking** gate (mirror the Hub `npm-audit`
  workflow — note Hub currently has an open `high+` advisory; resolve before copying the pattern).
- ⬜ Use `npm ci` (not `npm install`) everywhere in CI — installs strictly from the lockfile.

## Pre-publish dry run
- ⬜ `npm pack --dry-run` → confirm the tarball contains **only `dist/`, README, LICENSE,
  package.json** (no `.env`, no `src/`, no test fixtures, no `.npmrc`).
- ⬜ `npm publish --dry-run` → sanity-check name/version/access before the real run.

## Post-publish (🔁 ongoing)
- 🔁 Watch for **typosquats** of `@dekimuhq/dekimu-mcp` (dekimu-mcp, dekimuhq-mcp, dekimu_mcp…).
- 🔁 Re-run `npm audit` weekly (or fold into the existing ecosystem link-audit cron).
- 🔁 On any future version bump, repeat the provenance + dry-run + release-age steps.

---
*Drafted 2026-06-16 alongside the what-next queue. Trigger context: Shai-Hulud npm/PyPI wave
(morning-update) + dekimu-mcp being the first public-npm surface. The publish action remains
SL-reactivation-gated; this list is the build-to-ready prep so the button is safe to press the
moment the gate lifts.*
