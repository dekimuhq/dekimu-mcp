import { z } from "zod";
import { CAPABILITY_IDS, loadConfig, operate } from "../operate/operate.js";

export const operateInputSchema = {
  capability: z
    .enum(CAPABILITY_IDS)
    .describe("The gated door capability to invoke (e.g. ropa.compile, gdpr.scan, operator.draft-reminder)."),
  input: z
    .unknown()
    .describe("Capability-specific input. Validated server-side by the door's Zod schema; shape varies per capability."),
  spend: z
    .object({ currency: z.string(), amount: z.number() })
    .optional()
    .describe("Optional spend budget this action consumes (for side-effecting capabilities)."),
};

type OperateArgs = {
  capability: (typeof CAPABILITY_IDS)[number];
  input: unknown;
  spend?: { currency: string; amount: number };
};

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Online acting path. Reads the agent credential + terminal key + door URL from the
 * environment (never tool args), signs a PoP, and POSTs to the gated door. Fail-closed
 * and non-throwing: missing/invalid config or a disabled door return a clear status.
 */
export async function operateHandler(args: OperateArgs) {
  const config = loadConfig();
  if ("error" in config) {
    return asText({ status: "config-error", error: config.error });
  }
  const result = await operate(args, config);
  return asText(result);
}
