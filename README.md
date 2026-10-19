# dekimu-mcp

A local-first MCP server that gives any agent verifiable action receipts + reproducible GDPR checks.

**Local-first, no telemetry, no network egress at runtime.**

## Install

```sh
npx @dekimuhq/dekimu-mcp
```

### Odysseus

Add to your MCP config:

```json
{
  "mcpServers": {
    "dekimu": {
      "command": "npx",
      "args": ["-y", "@dekimuhq/dekimu-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent path on your OS:

```json
{
  "mcpServers": {
    "dekimu": {
      "command": "npx",
      "args": ["-y", "@dekimuhq/dekimu-mcp"]
    }
  }
}
```

## Tools

Three local-first tools — no network, no credentials:

| Tool | What it does |
|---|---|
| `mint_action_receipt` | Mint a tamper-evident, offline-verifiable `dekimu.mcp.action.v1` receipt for any agent action, self-signed by a local key. |
| `verify_receipt` | Verify the structure and signature of a receipt offline. Returns a result, never throws. |
| `gdpr_obligation_check` | Run a reproducible GDPR obligation check on a described processing activity against a bundled regulation snapshot (not legal advice). |

> **Honesty box:** Receipts are self-signed by your local key — they are tamper-evident and offline-verifiable, but the issuer is YOU, not a Dekimu trusted issuer. They verify offline with `verify_receipt`; the public verifier at https://verify.dekimu.com reports them as self-signed / unknown-key, never as Dekimu-trusted.

To anchor against Dekimu's trusted issuer (verifier domain + transparency log + third-party-verifiable provenance), see Hub at https://app.dekimu.com.

### GDPR obligation ids

`gdpr_obligation_check` reports each obligation under the ecosystem's canonical id — the same strings used by the public [Regulation-as-Code GDPR profile](https://github.com/dekimuhq/regulation-as-code) (manifest `gdpr` 1.2.0) and by Dekimu Hub. This server evaluates the subset a described activity can answer on its own:

| id | GDPR article | Met when |
|---|---|---|
| `gdpr.lawful-basis` | Art. 6 — lawfulness of processing | `lawfulBasis` is given |
| `gdpr.purpose-limitation` | Art. 5(1)(b) — purpose limitation | `purpose` is given |
| `gdpr.retention` | Art. 5(1)(e) — storage limitation | `retention` is given |

The remaining profile obligations (`gdpr.privacy-notice`, `gdpr.subject-rights`, `gdpr.erasure`, `gdpr.dpia`, `gdpr.prior-consultation`) need an evidence corpus and are not evaluated here. `dataCategories` and `dataSubjects` are accepted as input but do not drive an obligation (there is no data-minimisation obligation in the profile).

### Ecosystem tools (also registered)

The server also registers three tools for agents that operate inside the Dekimu ecosystem. They are no-ops without configuration and never add network egress to the three tools above.

| Tool | What it does | Needs |
|---|---|---|
| `operate_capability` | **Online.** Signs a proof-of-possession with the configured agent credential and invokes a gated capability (`gdpr.scan`, `ropa.compile`, `dpia.run`, `erasure.execute`, `compass.passport.read`, `operator.draft-reminder`) through Dekimu Hub's capability door. Returns the door verdict (`ok` / `checkpoint` / `denied`) and any receipt id. Fail-closed: missing or mismatched configuration, or a disabled door, returns a clear status and does nothing. | `DEKIMU_AGENT_CREDENTIAL` + `DEKIMU_AGENT_TERMINAL_KEY` (optional `DEKIMU_DOOR_URL`, `DEKIMU_VERIFY_URL`) |
| `autonomy_policy_query` | Read-only. Returns the autonomy tier for a policy domain (`engineering-ops`, `content`, `money`, `legal`, `strategy`) from a small bundled table. | — |
| `ecosystem_digest_latest` | Read-only. Returns the latest ecosystem digest JSON from a local file. Reports `available: false` when unset or unreadable. | `ECOSYSTEM_DIGEST_PATH` |

## Anchored provenance (optional, OFF by default)

By default `mint_action_receipt` emits a local self-signed `dekimu.mcp.action.v1` receipt and the server runs standalone with zero extra dependencies.

When an **anchored issuer** is configured, the mint path can instead (or also) emit a registered `ar.action.v1` (AActR) provenance receipt for the tool call — the tool becomes the `verb`, the inputs/result become salted commits (raw payloads never enter the receipt), and, when the call ran under a capability mandate, `credential_id` + `caveats_consumed` bind the authorizing mandate into the signed body. An anchored envelope can optionally be wrapped as a **W3C Verifiable Credential** for VC-native consumers.

Configuration (all optional — unset ⇒ local mode, unchanged):

| Env | Effect |
|---|---|
| `DEKIMU_RECEIPT_MODE` | `local` (default) · `anchored` · `both` |
| `DEKIMU_ANCHORED_ISSUER_MODULE` | Module exporting `createAnchoredIssuer()` (or a default factory) that signs + anchors the AActR body. Absent ⇒ anchored requests degrade to a local receipt with a notice. |
| `DEKIMU_ANCHORS_VC_MODULE` | Optional W3C-VC carrier module (used only when a tool call sets `wrapVc`). Absent ⇒ VC wrap is skipped, the anchored receipt is unaffected. |

The signing/anchoring keys live in the injected issuer, never in this server. Both integrations are loaded dynamically and degrade gracefully when absent. See [docs/anchored-provenance-pattern.md](docs/anchored-provenance-pattern.md).

> **Scope:** an anchored receipt proves the tool call happened as recorded — **not** that the tool's result is correct or safe.

## Development

```sh
npm ci && npm test && npm run build
```

Tests are offline. `LIVE_VERIFIER=1 npm test` additionally asks the public verifier (`POST https://verify.dekimu.com/api/lookup-by-hash`) about the recorded conformance fixture and asserts the loose, stable fact about a self-signed receipt: it is not anchored (no transparency-log claim). The by-value verdict runs in the browser at https://verify.dekimu.com/verify-receipt and is reported as a self-signed / not-trusted status, never `verified`. Override the host with `LIVE_VERIFIER_URL`.

## Learn more

- **Verify a receipt:** https://verify.dekimu.com
- **The specs:** [Anchored Receipts](https://github.com/dekimuhq/anchors-spec) · [agents.txt — policy for agent actions](https://github.com/dekimuhq/agents-txt)

## License

MIT

## Part of the Dekimu ecosystem

Built and maintained by [Dekimu](https://dekimu.com). The Dekimu ecosystem — [Dekimu Hub](https://app.dekimu.com) and the public verifier at [verify.dekimu.com](https://verify.dekimu.com) — is the reference implementation for this project. Sibling projects: [anchors-spec](https://github.com/dekimuhq/anchors-spec) · [agents.txt](https://github.com/dekimuhq/agents-txt) · [regulation-as-code](https://github.com/dekimuhq/regulation-as-code) · [claude-memory](https://github.com/dekimuhq/claude-memory). All of them: https://dekimu.com/open-source.
