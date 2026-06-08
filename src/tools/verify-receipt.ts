import { z } from "zod";
import { verifyReceipt } from "../receipts/verify.js";

export const verifyInputSchema = {
  receipt: z.union([z.string(), z.record(z.unknown())]).describe("A receipt object or its JSON string"),
};

export function verifyHandler(args: { receipt: string | Record<string, unknown> }) {
  let receipt: unknown = args.receipt;
  if (typeof receipt === "string") {
    try {
      receipt = JSON.parse(receipt);
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ valid: false, reason: "input: not valid JSON" }),
          },
        ],
      };
    }
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(verifyReceipt(receipt), null, 2) }] };
}
