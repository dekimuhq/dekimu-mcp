import { z } from "zod";

// Mirrors @dekimuhq/autonomy-policy (unpublished). Replace with:
//   import { getTier, POLICY_VERSION } from "@dekimuhq/autonomy-policy";
// once that package is published to GitHub Packages (founder-owed gate).
const POLICY_VERSION = "0.1.0";
const DOMAIN_TIERS: Record<string, string> = {
  "engineering-ops": "full-auto",
  content: "template-auto",
  money: "approval-gated",
  legal: "approval-gated",
  strategy: "human-led",
};

export const policyQueryInputSchema = {
  domain: z.string().describe("One of: engineering-ops, content, money, legal, strategy"),
};

export const readOnly = true;

export function policyQueryHandler(args: { domain: string }) {
  // Own-property check: `domain` is untrusted MCP-client input. A plain index
  // lookup resolves inherited Object.prototype keys ("__proto__", "constructor",
  // "toString", …) to non-undefined values and misreports them as known domains.
  const tier = Object.hasOwn(DOMAIN_TIERS, args.domain) ? DOMAIN_TIERS[args.domain] : undefined;
  if (tier === undefined) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "unknown domain",
            domain: args.domain,
            knownDomains: Object.keys(DOMAIN_TIERS),
          }),
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ domain: args.domain, tier, policyVersion: POLICY_VERSION }, null, 2),
      },
    ],
  };
}
