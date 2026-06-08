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

## License

MIT
