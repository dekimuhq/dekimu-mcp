import { z } from "zod";

// Shape mirrors the reproducible-receipt registry deployed on verify.dekimu.com.
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
    publicKey: z.string(),
    fingerprint: z.string(),
  }),
  signature: z.string().regex(/^[0-9a-f]+$/),
});

export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;

export interface MintInput {
  action: string;
  inputs?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}
