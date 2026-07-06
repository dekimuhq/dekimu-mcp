import { z } from "zod";
import { loadOrCreateKeypair } from "../crypto/keystore.js";
import { mintActionReceipt } from "../receipts/mint.js";
import {
  mintAnchored,
  type AnchoredIssuer,
  type AnchoredMintInput,
  type MandateContext,
} from "../receipts/anchored.js";
import { loadAnchoredIssuer } from "../receipts/anchored-issuer.js";
import type { AnchorsVcModule } from "../receipts/anchors-vc.js";

export const mintInputSchema = {
  action: z.string().describe("What the agent did, e.g. 'summarized document'"),
  inputs: z.unknown().optional().describe("Inputs — hashed, not stored, unless you pass them in metadata"),
  output: z.unknown().optional().describe("Output — hashed, not stored"),
  metadata: z.record(z.unknown()).optional(),
  // ── Anchored-mode fields (ignored in the default local mode) ────────────────
  credentialId: z
    .string()
    .optional()
    .describe("Anchored mode only: authorizing mandate credential id — binds credential_id + caveats_consumed into the AActR body."),
  capability: z
    .string()
    .optional()
    .describe("Anchored mode only: the capability/verb the mandate authorized (required with credentialId)."),
  dataScope: z
    .string()
    .optional()
    .describe("Anchored mode only: the data-scope the action exercised (required with credentialId)."),
  spendStep: z.number().optional().describe("Anchored mode only: budget this action decremented (default 1)."),
  spendCurrency: z.string().optional().describe("Anchored mode only: ISO-4217 code when spendStep is monetary."),
  agentId: z.string().optional().describe("Anchored mode only: stable per-agent principal bound in the mandate."),
  outcome: z
    .enum(["executed", "failed-gave-up"])
    .optional()
    .describe("Anchored mode only: terminal outcome (default 'executed')."),
  profile: z
    .enum(["hub.automation", "aiact.art12"])
    .optional()
    .describe("Anchored mode only: issuing profile (default 'hub.automation')."),
  wrapVc: z.boolean().optional().describe("Anchored mode only: also wrap the sealed envelope as a W3C VC (optional carrier)."),
};

export interface MintArgs {
  action: string;
  inputs?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  credentialId?: string;
  capability?: string;
  dataScope?: string;
  spendStep?: number;
  spendCurrency?: string;
  agentId?: string;
  outcome?: "executed" | "failed-gave-up";
  profile?: "hub.automation" | "aiact.art12";
  wrapVc?: boolean;
}

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

const text = (t: string): ToolContent => ({ type: "text" as const, text: t });

// `now` injected for testability; the server passes Date.now().
export function mintHandler(args: MintArgs, now: number): ToolResult {
  let receipt;
  try {
    const kp = loadOrCreateKeypair();
    receipt = mintActionReceipt(args, kp, now);
  } catch (error: unknown) {
    // inputs/output/metadata are agent-controlled (z.unknown). Non-JSON values
    // (non-finite numbers, bigint, functions, toJSON objects) make canonicalize
    // throw — surface it as a tool error rather than crashing the server.
    const message = error instanceof Error ? error.message : "unknown error";
    return { isError: true, content: [text(`mint failed: ${message}`)] };
  }
  return {
    content: [
      text(
        `Minted dekimu.mcp.action.v1 receipt, self-signed by local key ${receipt.issuer.fingerprint} (NOT a Dekimu trusted issuer — anchor against the trusted issuer via Hub).`,
      ),
      text(JSON.stringify(receipt, null, 2)),
    ],
  };
}

export type MintMode = "local" | "anchored" | "both";

/** Resolve the receipt mode. Default `local` — the anchored path is OFF unless opted in. */
export function resolveMintMode(env: NodeJS.ProcessEnv = process.env): MintMode {
  const raw = (env.DEKIMU_RECEIPT_MODE ?? "").toLowerCase();
  return raw === "anchored" || raw === "both" ? raw : "local";
}

/** Build the anchored-mode input from tool args. Mandate block only when a credentialId is supplied. */
function toAnchoredInput(args: MintArgs): AnchoredMintInput {
  let mandate: MandateContext | undefined;
  if (args.credentialId) {
    if (!args.capability || !args.dataScope) {
      throw new Error("anchored mint with credentialId requires both capability and dataScope (to bind caveats_consumed).");
    }
    mandate = {
      credentialId: args.credentialId,
      capability: args.capability,
      dataScope: args.dataScope,
      ...(args.spendStep !== undefined ? { spendStep: args.spendStep } : {}),
      ...(args.spendCurrency ? { spendCurrency: args.spendCurrency } : {}),
      ...(args.agentId ? { agentId: args.agentId } : {}),
    };
  }
  return {
    toolName: args.action,
    inputs: args.inputs,
    output: args.output,
    ...(args.outcome ? { outcome: args.outcome } : {}),
    ...(args.profile ? { profile: args.profile } : {}),
    ...(mandate ? { mandate } : {}),
  };
}

export interface MintDispatchDeps {
  mode?: MintMode;
  /** Inject the anchored issuer (tests); else it is loaded from the environment. */
  issuer?: AnchoredIssuer | null;
  /** Inject the VC carrier (tests); else it is loaded dynamically when wrapVc is set. */
  vcModule?: AnchorsVcModule;
  now?: () => number;
}

/**
 * Mode-aware mint entry point used by the server.
 *  - local (default): unchanged self-signed receipt.
 *  - anchored: seal a real ar.action.v1 (AActR) via the configured issuer, optional VC wrap.
 *  - both: local receipt AND anchored receipt.
 * If anchored is requested but no issuer is configured, degrades to local with a clear notice.
 */
export async function mintDispatch(args: MintArgs, now: number, deps: MintDispatchDeps = {}): Promise<ToolResult> {
  const mode = deps.mode ?? resolveMintMode();
  if (mode === "local") return mintHandler(args, now);

  const issuer = deps.issuer !== undefined ? deps.issuer : await loadAnchoredIssuer();
  if (!issuer) {
    const local = mintHandler(args, now);
    return {
      ...local,
      content: [
        text(
          "Anchored mode was requested (DEKIMU_RECEIPT_MODE) but no anchored issuer is configured " +
            "(set DEKIMU_ANCHORED_ISSUER_MODULE). Emitted a LOCAL self-signed dekimu.mcp.action.v1 receipt instead.",
        ),
        ...local.content,
      ],
    };
  }

  let anchored;
  try {
    anchored = await mintAnchored(toAnchoredInput(args), issuer, {
      wrapVc: args.wrapVc === true,
      ...(deps.vcModule ? { vcModule: deps.vcModule } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    return { isError: true, content: [text(`anchored mint failed: ${message}`)] };
  }

  const payload = {
    envelope: anchored.envelope,
    ...(anchored.vc !== undefined ? { vc: anchored.vc } : {}),
    ...(anchored.vcSkippedReason ? { vc_skipped: anchored.vcSkippedReason } : {}),
    // Reveal secrets for the salted commits — retain out-of-band to later prove the target.
    reveal_salts: anchored.salts,
  };

  const bound = anchored.envelope.body.credential_id ? "mandate-bound" : "policy-authorized (no mandate)";
  const vcNote = anchored.vc !== undefined ? " + W3C VC wrapper" : anchored.vcSkippedReason ? " (VC wrap skipped)" : "";
  const anchoredResult: ToolResult = {
    content: [
      text(`Minted ar.action.v1 (AActR) anchored receipt via the configured issuer — ${bound}${vcNote}. Proves provenance of the tool call, NOT correctness of its result.`),
      text(JSON.stringify(payload, null, 2)),
    ],
  };

  if (mode !== "both") return anchoredResult;

  const local = mintHandler(args, now);
  return { content: [...local.content, ...anchoredResult.content], ...(local.isError ? { isError: true } : {}) };
}
