import { z } from "zod";
import { loadOrCreateKeypair } from "../crypto/keystore.js";
import { mintActionReceipt } from "../receipts/mint.js";

export const mintInputSchema = {
  action: z.string().describe("What the agent did, e.g. 'summarized document'"),
  inputs: z.unknown().optional().describe("Inputs — hashed, not stored, unless you pass them in metadata"),
  output: z.unknown().optional().describe("Output — hashed, not stored"),
  metadata: z.record(z.unknown()).optional(),
};

// `now` injected for testability; the server passes Date.now().
export function mintHandler(
  args: { action: string; inputs?: unknown; output?: unknown; metadata?: Record<string, unknown> },
  now: number,
) {
  const kp = loadOrCreateKeypair();
  const receipt = mintActionReceipt(args, kp, now);
  return {
    content: [
      {
        type: "text" as const,
        text: `Minted ar.action.v1 receipt, self-signed by local key ${receipt.issuer.fingerprint} (NOT a Dekimu trusted issuer — anchor against the trusted issuer via Hub).`,
      },
      { type: "text" as const, text: JSON.stringify(receipt, null, 2) },
    ],
  };
}
