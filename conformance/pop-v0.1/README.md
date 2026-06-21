# Agent-Capability PoP Conformance Vectors — v0.1

Known-answer tests for the Dekimu capability **door** Proof-of-Possession (PoP)
signature. A producer that reproduces every vector's `canonicalBytesHex` +
`signature` independently can sign door requests the live door will accept.

## Why these live here

`dekimu-mcp` is self-contained by design — it may not import the private
`@dekimuhq/agent-capability` packages (CI guard `check:no-private-dep`). These
vectors are the public bridge: the door's canonical PoP form, pinned as data, so
`dekimu-mcp` (and any third-party / BYO agent) can reproduce it byte-exactly
without the private source — closing the reproducible-producer trap.

- `vectors.json` — generated from the authoritative private `canonicalize` +
  `ed25519Signer` (`@dekimuhq/agent-capability`'s `npm run gen:pop-vector`).
  **Canonical published copy. Never hand-edit** — regenerate at the producer and
  copy the output here.
- `../../test/pop-conformance.test.ts` — proves dekimu-mcp's OWN crypto
  reproduces every vector. This test is the conformance gate.

## What it is — and is NOT

- **IS** a signature KAT suite: the portable canonicalization rule (key sort /
  number formatting / unicode / UTF-8) + four edge-case vectors (ascii, numbers,
  nested-out-of-order, unicode) + the proof-vs-signed-payload split + freshness.
- **IS NOT** a replayable live call: vectors use a fixed past `ts`. A live call
  must stamp `ts ≈ now` + a fresh `jti`, and the signature is checked only AFTER
  the door trust-binds the credential and identity-binds the terminal key.

Not an anchored receipt — PoP is door-auth, so this is deliberately NOT in
`anchors-spec`.
