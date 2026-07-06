# MCP 2026-07-28 stateless RC — impact on dekimu-mcp

**Re-validation date:** 2026-07-06
**Verdict: no breakage. No code change required.**

## What the RC changes

The 2026-07-28 Model Context Protocol specification release candidate makes the
protocol **stateless** at the transport layer. The changes are scoped to the
**Streamable HTTP** transport and to a new **v2 SDK line**:

- Streamable HTTP drops protocol-level sessions (`Mcp-Session-Id`), drops the
  `initialize` handshake (each POST is self-describing via `params._meta`), and
  drops the GET stream endpoint; adds `Mcp-Method` / `Mcp-Name` routing headers so
  gateways route without inspecting the body. This lets remote servers run behind a
  plain round-robin load balancer instead of sticky sessions + a shared session
  store.
- The RC ships as **beta v2 SDK packages under a new namespace**
  (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`). Serving
  `2026-07-28` is an **explicit opt-in** when you wire up the transport; upgrading
  does not by itself change what a server speaks. v2 servers still answer the
  legacy `2025-11-25` handshake for backward compatibility.

## Why dekimu-mcp is unaffected

1. **Transport.** dekimu-mcp runs over **stdio** (`StdioServerTransport`), not
   Streamable HTTP. The stateless redesign — sessions, handshake, GET stream,
   routing headers, load-balancer concerns — is entirely an HTTP-transport concern.
   stdio has no sessions, no gateway, and no sticky-routing to remove. It is
   local-first with no network egress at runtime.
2. **SDK line.** dekimu-mcp pins `@modelcontextprotocol/sdk ^1.0.0` (the v1 line;
   resolved 1.29.0). The RC is delivered through the **separate** v2 beta namespace,
   which is opt-in. The v1 SDK continues to speak `2025-11-25`, and v2 servers stay
   backward-compatible with `2025-11-25` clients — so nothing in the current stack
   is forced to move.
3. **Server/tool API.** `McpServer` + `registerTool` + `server.connect` are the v1
   high-level API and are unchanged in the v1 line. No tool-registration change is
   needed.

## When to revisit

Re-open this note only if dekimu-mcp:

- adds a **remote / HTTP** transport (then the stateless streamable-HTTP rules and
  the `Mcp-Method` / `Mcp-Name` headers apply, and sessionless self-describing
  requests become the target), or
- adopts the **v2 SDK** (`@modelcontextprotocol/server`) — a namespace + package
  migration (the maintainers ship a codemod), opt-in and independent of the
  transport change.

Until then, the local-first stdio server on the v1 SDK is unaffected by the
2026-07-28 stateless release candidate.
