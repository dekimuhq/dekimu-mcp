# MCP anchored-provenance pattern

A reusable convention for emitting a tamper-evident, independently-verifiable
provenance receipt for an MCP tool call. It is additive at the tool-result layer —
no change to the MCP transport, and no change to how the server registers or serves
its tools.

An anchored receipt proves **the tool call happened as recorded** — the verb that
ran, over which committed inputs/result, under which authorization. It does **not**
assert that the tool's result is correct or safe (provenance, not truth).

## Two modes

| Mode | Receipt | Issuer | Independently verifiable | Config |
|---|---|---|---|---|
| **local** (default) | `dekimu.mcp.action.v1` | your local self-signed key | offline structure + signature only | none |
| **anchored** | `ar.action.v1` (AActR) | an injected trusted issuer | yes, via the public verifier | opt-in |

Local mode is honest about being self-signed: the issuer is the local key, not a
trusted issuer. Anchored mode maps the tool call onto the registered Anchored
Action Receipt (AActR) shape and hands it to a trusted issuer to sign + anchor.

## Trigger point

After a tool executes, map the call onto the AActR body and mint:

| MCP datum | AActR body field |
|---|---|
| tool name / verb | `verb` |
| inputs | `params_commit` — salted commit (raw payload never stored) |
| result / decision | `decision_commit` — salted commit |
| idempotency key | `request_id_commit` — salted commit of `rule_id:decisionId` |
| terminal status | `outcome` (`executed` / `failed-gave-up` — both mint) |
| execution time | `executed_at` (RFC 3339 UTC) |

Raw tool inputs/results never enter the receipt — only salted commits
`sha256(salt : canonicalize(value))`. The owner retains the salts out-of-band and
reveals `(salt, value)` to later prove exactly what the commit covers, keeping the
publicly-anchored receipt free of the raw (possibly personal) payload.

## Authorization binding

When the call ran under a capability mandate, the authorizing mandate binds into
the **signed body**, not merely alongside it:

- `credential_id` — the authorizing mandate's credential id (plaintext,
  revocation-checkable). Absent for policy-authorized calls that carry no mandate.
- `caveats_consumed` — the slice of authority the call actually exercised
  (`capability`, `data_scope`, budget step). Present only when `credential_id` is.

Because these are inside the signed body, tampering with them fails verification —
the receipt is *of* what the mandate authorized; it is never itself a mandate.

## Optional W3C VC wrapper

An anchored envelope can be wrapped as a Verifiable Credential so a VC-native
consumer can ingest it; the embedded envelope stays the cryptographic root of
trust and the wrap round-trips byte-equal. The wrap is optional and skipped
cleanly when the carrier is not present.

## Integration boundary

This server never holds the trusted-issuer signing keys — the signing + anchoring
adapter and the VC carrier are both injected / dynamically loaded, so the published
package installs and runs standalone with no extra dependency and degrades
gracefully when they are absent. Wiring is in
[`src/receipts/anchored.ts`](../src/receipts/anchored.ts) (body mapping + commits +
the issuer port), [`src/receipts/anchored-issuer.ts`](../src/receipts/anchored-issuer.ts)
(issuer loader), and [`src/receipts/anchors-vc.ts`](../src/receipts/anchors-vc.ts)
(optional VC carrier).
