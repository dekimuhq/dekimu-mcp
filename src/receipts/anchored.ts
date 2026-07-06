/**
 * anchored — the OFF-by-default anchored-provenance bridge.
 *
 * The default mint path (`mint_action_receipt`) emits a LOCAL self-signed
 * `dekimu.mcp.action.v1` receipt: tamper-evident + offline-verifiable, but the
 * issuer is the local key, not a trusted issuer. That mode is unchanged and needs
 * no configuration — the server is fully standalone-usable out of the box.
 *
 * When an ANCHORED ISSUER is configured, the mint path can instead (or also) emit
 * a registered `ar.action.v1` (AActR) envelope: the MCP tool call is mapped onto
 * the AActR body — verb = the tool, the inputs/result/target become salted commits
 * (privacy-preserving: the raw payload never enters the receipt), and, when the
 * call ran under a capability mandate, `credential_id` + `caveats_consumed` bind
 * the authorizing mandate into the signed body. The prepared body is handed to the
 * injected issuer, which owns signing + anchoring (the trusted-issuer keys live
 * there, not here). An anchored envelope can then OPTIONALLY be wrapped as a W3C
 * Verifiable Credential for VC-native consumers.
 *
 * Provenance-not-truth: an AActR proves the tool call happened as recorded, never
 * that the tool's result is correct or safe — the same discipline as the local
 * receipt.
 *
 * NO static private dependency: the issuer and the VC carrier are BOTH injected /
 * dynamically loaded (see anchored-issuer.ts + anchors-vc.ts). When neither is
 * present the bridge degrades gracefully and the local self-signed mode stands.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { canonicalize } from "../crypto/canonicalize.js";
import { sha256Hex } from "../crypto/sign.js";
import { wrapAsVc, type AnchorsVcModule } from "./anchors-vc.js";

// ── AActR body (ar.action.v1) ────────────────────────────────────────────────
// Structural shape of the registered AActR body we POPULATE from an MCP call.
// This is a wire-shape mapping, not a new primitive — the canonical schema and
// its verifier live in the anchored-receipts family / verify.dekimu.com.

/** Issuing profile: default automation record, or an EU AI Act Art.12 log entry. */
export type AActRProfile = "hub.automation" | "aiact.art12";
/** Terminal outcome — both mint a receipt ("tried and stopped" is audit-worthy). */
export type AActROutcome = "executed" | "failed-gave-up";

/** The attenuated authority a single action actually exercised (plaintext, non-PII). */
export interface AActRCaveatsConsumed {
  /** Data-scope bound exercised (workspace id or a narrower non-PII selector). */
  data_scope: string;
  /** Budget decremented; call-count units unless `spend_currency` is set. */
  spend_step: number;
  /** ISO-4217 code when `spend_step` is a monetary amount; absent ⇒ call-count. */
  spend_currency?: string;
  /** The capability / verb invoked (e.g. `ropa.compile`). */
  capability: string;
}

/** Canonical AActR body. Null-subject; the target lives here as salted commits. */
export interface AActRBody {
  profile: AActRProfile;
  /** The dispatched verb (the MCP tool). Plaintext, non-PII. */
  verb: string;
  rule_id: string;
  recipe_id: string;
  outcome: AActROutcome;
  /** RFC 3339 / ISO 8601 UTC. */
  executed_at: string;
  /** `sha256:<hex>` salted commit of the result/decision. */
  decision_commit: string;
  /** `sha256:<hex>` salted commit of the inputs/params. */
  params_commit: string;
  /** `sha256:<hex>` salted commit of `${rule_id}:${decisionId}` (idempotency key). */
  request_id_commit: string;
  /** Authorizing mandate credential id — present iff mandate-authorized. */
  credential_id?: string;
  /** Slice of mandate authority spent — present iff `credential_id` present. */
  caveats_consumed?: AActRCaveatsConsumed;
  /** Stable per-agent principal, when the mandate carried one. */
  agent_id?: string;
}

/**
 * Structural view of a signed `ar.action.v1` envelope, as returned by an injected
 * issuer. The issuer owns the full envelope; this captures only the fields the
 * bridge + the VC carrier read. Extra fields ride through untouched.
 */
export interface AnchoredEnvelope {
  id: string;
  claim_type: "ar.action.v1";
  iss: string;
  iat: string;
  /** `null` for AActR (null-subject family). */
  subject: string | null;
  body: AActRBody;
  anchor?: { log?: string; tree_head_root?: string } | null;
  [k: string]: unknown;
}

/**
 * The signing + anchoring port. Production wires an adapter over the trusted-issuer
 * stack; tests inject a fake. NEVER implemented with a static private import here —
 * see anchored-issuer.ts for the dynamic, env-gated loader.
 */
export interface AnchoredIssuer {
  /** Seal a prepared AActR body into a signed (optionally anchored) envelope. */
  sealAction(body: AActRBody): Promise<AnchoredEnvelope>;
}

// ── Mandate binding (from capability context) ─────────────────────────────────

/** Capability/mandate context that binds `credential_id` + `caveats_consumed`. */
export interface MandateContext {
  /** The authorizing mandate's credential id (plaintext, revocation-checkable). */
  credentialId: string;
  /** The capability/verb the mandate authorized. */
  capability: string;
  /** The data-scope bound the action exercised. */
  dataScope: string;
  /** Budget this action decremented (default 1 call-count unit). */
  spendStep?: number;
  /** ISO-4217 code when the decrement is monetary. */
  spendCurrency?: string;
  /** Stable per-agent principal bound in the mandate, when present. */
  agentId?: string;
}

/** Input describing a single MCP tool call to record as an AActR. */
export interface AnchoredMintInput {
  /** The MCP tool / verb that ran → AActR `verb`. */
  toolName: string;
  /** Tool inputs → `params_commit` (salted, never stored raw). */
  inputs?: unknown;
  /** Tool result → `decision_commit` (salted, never stored raw). */
  output?: unknown;
  outcome?: AActROutcome;
  profile?: AActRProfile;
  ruleId?: string;
  recipeId?: string;
  decisionId?: string;
  /** Present ⇒ mandate-authorized: binds `credential_id` + `caveats_consumed`. */
  mandate?: MandateContext;
}

export interface CommitSalts {
  decision: string;
  params: string;
  request_id: string;
}

/**
 * Salted commit `sha256(salt : canonicalize(value))`, prefixed `sha256:`.
 * Salting keeps the publicly-anchored receipt free of the low-entropy raw value
 * while still binding it: the owner reveals `(salt, value)` to prove the commit.
 */
export function commit(salt: string, value: unknown): string {
  return "sha256:" + sha256Hex(`${salt}:${canonicalize(value)}`);
}

const defaultSalt = (): string => randomBytes(16).toString("hex");

export interface BuildDeps {
  /** Fresh salt per commit field; injectable for deterministic tests. */
  salt?: () => string;
  /** Unix ms. */
  now?: () => number;
  /** Decision id source; injectable for deterministic tests. */
  decisionId?: () => string;
}

/**
 * Map an MCP tool call onto an AActR body. The mandate block is bound ONLY when a
 * `mandate` context is supplied (mandate-authorized); policy-authorized calls omit
 * `credential_id`/`caveats_consumed` entirely, per the family's rule.
 */
export function buildAActRBody(
  input: AnchoredMintInput,
  deps: BuildDeps = {},
): { body: AActRBody; salts: CommitSalts } {
  const salt = deps.salt ?? defaultSalt;
  const now = deps.now ?? (() => Date.now());
  const decisionId = input.decisionId ?? deps.decisionId?.() ?? randomUUID();
  const ruleId = input.ruleId ?? `mcp.${input.toolName}`;
  const recipeId = input.recipeId ?? "mcp.tool-call";

  const salts: CommitSalts = { decision: salt(), params: salt(), request_id: salt() };

  const body: AActRBody = {
    profile: input.profile ?? "hub.automation",
    verb: input.toolName,
    rule_id: ruleId,
    recipe_id: recipeId,
    outcome: input.outcome ?? "executed",
    executed_at: new Date(now()).toISOString(),
    decision_commit: commit(salts.decision, input.output ?? null),
    params_commit: commit(salts.params, input.inputs ?? null),
    request_id_commit: commit(salts.request_id, `${ruleId}:${decisionId}`),
  };

  if (input.mandate) {
    const m = input.mandate;
    body.credential_id = m.credentialId;
    body.caveats_consumed = {
      data_scope: m.dataScope,
      spend_step: m.spendStep ?? 1,
      ...(m.spendCurrency ? { spend_currency: m.spendCurrency } : {}),
      capability: m.capability,
    };
    if (m.agentId) body.agent_id = m.agentId;
  }

  return { body, salts };
}

export interface MintAnchoredOptions extends BuildDeps {
  /** Also wrap the sealed envelope as a W3C VC (optional carrier). */
  wrapVc?: boolean;
  /** Inject an already-loaded VC carrier (tests); else it is loaded dynamically. */
  vcModule?: AnchorsVcModule;
}

export interface MintAnchoredResult {
  envelope: AnchoredEnvelope;
  /** Reveal secrets for the salted commits — retain out-of-band to later prove the target. */
  salts: CommitSalts;
  /** Present when `wrapVc` succeeded. */
  vc?: unknown;
  /** Present when `wrapVc` was requested but skipped (carrier absent / round-trip failed). */
  vcSkippedReason?: string;
}

/**
 * Build the AActR body, seal it via the injected issuer, and (optionally) wrap the
 * result as a W3C VC. The issuer owns signing + anchoring; this never signs.
 */
export async function mintAnchored(
  input: AnchoredMintInput,
  issuer: AnchoredIssuer,
  opts: MintAnchoredOptions = {},
): Promise<MintAnchoredResult> {
  const { body, salts } = buildAActRBody(input, opts);
  const envelope = await issuer.sealAction(body);

  if (!opts.wrapVc) return { envelope, salts };

  const wrapped = await wrapAsVc(envelope, { vcModule: opts.vcModule });
  return wrapped.ok
    ? { envelope, salts, vc: wrapped.vc }
    : { envelope, salts, vcSkippedReason: wrapped.reason };
}
