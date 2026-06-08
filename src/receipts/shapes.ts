import { z } from "zod";

// Shape intended to mirror the reproducible-receipt registry on verify.dekimu.com —
// UNVERIFIED against a live fixture (see test/conformance.test.ts `it.todo`).
// `kind` namespaced as ar.action.v1 to slot into the by-kind verifier registry.
export const ActionReceiptSchema = z.object({
  kind: z.literal("ar.action.v1"),
  body: z.object({
    action: z.string(),
    inputsHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    outputHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    metadata: z.record(z.unknown()).optional(),
    issuedAt: z.number().int(),
  }),
  issuer: z.object({
    kind: z.literal("local-self-signed"),
    publicKey: z.string().regex(/^[0-9a-f]{64}$/), // ed25519 public key, 32 bytes
    fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  }),
  signature: z.string().regex(/^[0-9a-f]{128}$/), // ed25519 signature, 64 bytes
});

export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;

export interface MintInput {
  action: string;
  inputs?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}
