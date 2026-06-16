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
  let receipt;
  try {
    const kp = loadOrCreateKeypair();
    receipt = mintActionReceipt(args, kp, now);
  } catch (error: unknown) {
    // inputs/output/metadata are agent-controlled (z.unknown). Non-JSON values
    // (non-finite numbers, bigint, functions, toJSON objects) make canonicalize
    // throw — surface it as a tool error rather than crashing the server.
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      isError: true,
      content: [{ type: "text" as const, text: `mint failed: ${message}` }],
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `Minted dekimu.mcp.action.v1 receipt, self-signed by local key ${receipt.issuer.fingerprint} (NOT a Dekimu trusted issuer — anchor against the trusted issuer via Hub).`,
      },
      { type: "text" as const, text: JSON.stringify(receipt, null, 2) },
    ],
  };
}
