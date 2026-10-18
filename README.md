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

- `mint_action_receipt` — mint a tamper-evident, offline-verifiable receipt for any agent action.
- `verify_receipt` — verify the signature and structure of a receipt offline.
- `gdpr_obligation_check` — run a reproducible GDPR obligation check against a bundled regulation snapshot.

> **Honesty box:** Receipts are self-signed by your local key — they are tamper-evident and offline-verifiable, but the issuer is YOU, not a Dekimu trusted issuer.

To anchor against Dekimu's trusted issuer (verifier domain + transparency log + third-party-verifiable provenance), see Hub at https://app.dekimu.com.

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

## Learn more

- **Verify a receipt:** https://verify.dekimu.com
- **The specs:** [Anchored Receipts](https://github.com/dekimuhq/anchors-spec) · [agents.txt — policy for agent actions](https://github.com/dekimuhq/agents-txt)
- **Who builds this:** [Dekimu](https://dekimu.com) — EU-first compliance & agent-trust tooling. Local-first, no lock-in.

## License

MIT
