# Conformance fixtures

Receipts here are copied verbatim from the reproducible-receipt registry deployed on
verify.dekimu.com (the `/verify-receipt` by-kind registry). They lock the guarantee that
`dekimu-mcp` mints and verifies the SAME shape the live verifier accepts.

To refresh: mint a sample via the live surface, save the JSON here as `<kind>.sample.json`.
Until a real sample is captured, `conformance.test.ts` uses a self-minted round-trip as a
placeholder and is marked `.todo` for the external-interop assertion.
