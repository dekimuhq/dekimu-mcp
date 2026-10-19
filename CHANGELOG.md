# Changelog

## 0.2.0 — 2026-10-19

**Breaking — `gdpr_obligation_check` output ids.** Obligation ids are now the ecosystem's canonical ids, identical to the public Regulation-as-Code GDPR profile (manifest `gdpr` 1.2.0) and Dekimu Hub:

| 0.1.0 id | 0.2.0 id |
|---|---|
| `lawful-basis` | `gdpr.lawful-basis` |
| `purpose` | `gdpr.purpose-limitation` |
| `retention` | `gdpr.retention` |
| `data-minimisation` | **removed** — the canonical profile has no data-minimisation obligation (Art. 5(1)(c)) and none of its eight obligations evidences "data categories declared"; mapping it to any of them would misreport the article. `dataCategories` is still accepted as input. |

The check logic is unchanged. `manifestVersion` is now `gdpr-1.2.0-snapshot-2026-10-19`.

**Docs.** All six registered tools are documented (the three ecosystem tools — `operate_capability`, `autonomy_policy_query`, `ecosystem_digest_latest` — in their own section). The public verifier's behaviour for self-signed receipts is stated as it is: they verify offline; verify.dekimu.com reports them as self-signed / unknown-key, never as Dekimu-trusted.

**Tests.** The documented `LIVE_VERIFIER=1` gate now exists: it asks the public verifier about the recorded fixture and asserts it is not anchored.

## 0.1.0 — 2026-10-19

First public release on registry.npmjs.org.
