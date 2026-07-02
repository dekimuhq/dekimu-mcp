import { z } from "zod";

// Inlined ON PURPOSE — do NOT replace with an import.
// dekimu-mcp is a PUBLIC MCP server; it must not depend on the private
// (access:restricted) @dekimuhq/autonomy-policy package. The `check:no-private-dep`
// guard fails the build on any `@dekimuhq/*` import in src/, and a private dep
// would break the public npm publish. Keep this map hand-synced with that
// package's DOMAIN_TIERS (5 stable rows; canonical source lives there).
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
