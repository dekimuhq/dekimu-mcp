import { z } from "zod";

// Shape for dekimu-mcp's local MCP action-provenance receipts.
// `kind` is `dekimu.mcp.action.v1` — deliberately distinct from the registered
// AActR anchors family (`ar.action.v1`) on verify.dekimu.com, which uses a
// completely different body schema (profile/verb/rule_id/recipe_id/…).
// Using a separate identifier avoids impersonating a registered family. These
// receipts verify offline; the public verifier (verify.dekimu.com) reports them
// as self-signed / unknown-key, never as Dekimu-trusted.
export const ActionReceiptSchema = z.object({
  kind: z.literal("dekimu.mcp.action.v1"),
  body: z.object({
    action: z.string(),
    inputsHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    outputHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
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
