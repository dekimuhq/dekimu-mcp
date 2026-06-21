/**
 * operate — the ONLINE acting path. Calls the gated Dekimu capability door
 * (POST /api/agent/capabilities on app.dekimu.com) with a scoped agent credential
 * and a freshly-signed Proof-of-Possession, so a user's MCP client can ACT in the
 * ecosystem (not just mint/verify receipts locally).
 *
 * The door — not this tool — owns every gate (mandate trust-bind → PoP signature →
 * replay → Compass → oversight → receipt). This tool only assembles the request +
 * PoP and maps the verdict. It reproduces the door's canonical PoP byte-exactly via
 * the SAME self-contained canonicalize + signer proven against the published
 * conformance vectors (conformance/pop-v0.1/) — no private @dekimuhq import.
 *
 * Wire shape pinned from source (dekimu-hub app/api/agent/capabilities/route.ts):
 *   body = { capabilityId, input, workspaceId, agentId, credential, spend?, proof }
 *   proof.sig = base64url ed25519 over canonicalize({jti,ts,capabilityId,workspaceId,agentId,input})
 * Note: the door body has NO idempotencyKey field — omitted deliberately (source wins
 * over the design doc's speculative arg). `spend` is top-level and NOT part of the
 * signed payload.
 */
import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import { hexToBytes } from "@noble/hashes/utils";
import { canonicalize } from "../crypto/canonicalize.js";
// Importing sign wires ed.etc.sha512Sync as a side effect (src/crypto/sign.ts).
import { sign } from "../crypto/sign.js";
import { reverifyAction, type ReverifyResult } from "./reverify.js";

/** Door capability ids (route source + design §3). */
export const CAPABILITY_IDS = [
  "gdpr.scan",
  "ropa.compile",
  "dpia.run",
  "erasure.execute",
  "compass.passport.read",
  "operator.draft-reminder",
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

const DEFAULT_DOOR_URL = "https://app.dekimu.com/api/agent/capabilities";
const DEFAULT_VERIFY_URL = "https://verify.dekimu.com";

/** The agent credential envelope, shape mirrored from @dekimuhq/agent-gateway (forwarded verbatim). */
export interface CredentialEnvelope {
  readonly workspaceId: string;
  readonly agentId: string;
  /** base64url. The terminal key must own this, or the door identity-bind denies every call. */
  readonly agentPublicKey: string;
  readonly [k: string]: unknown;
}

export interface OperateConfig {
  readonly credential: CredentialEnvelope;
  readonly terminalKeyHex: string;
  readonly doorUrl: string;
  /** Public verifier base URL for post-action re-verification (default verify.dekimu.com). */
  readonly verifyBaseUrl: string;
}

export interface Spend {
  readonly currency: string;
  readonly amount: number;
}

export interface OperateInput {
  readonly capability: CapabilityId;
  readonly input: unknown;
  readonly spend?: Spend;
}

export type OperateStatus =
  | "ok"
  | "checkpoint"
  | "denied"
  | "door-disabled"
  | "config-error"
  | "error";

export interface OperateResult {
  readonly status: OperateStatus;
  readonly httpStatus?: number;
  readonly receiptId?: string;
  readonly output?: unknown;
  readonly tier?: string;
  readonly detail?: string;
  readonly reason?: string;
  readonly stage?: string;
  readonly error?: string;
  /**
   * Independent post-action attestation from the public verifier (A1 unit #5). Present on a
   * successful (`ok`) door call that returned a `receiptId`. `verification.match === false` means
   * the anchored receipt does NOT match what was invoked — surface it loudly.
   */
  readonly verification?: ReverifyResult;
}

/**
 * Minimal fetch contract — avoids a hard dependency on lib.dom types and makes tests trivial.
 * `body` is OPTIONAL: a GET MUST omit it (undici/WHATWG `fetch` throws on a GET/HEAD with a body,
 * even an empty string — the post-action re-verify GET relies on this).
 */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

const hexToB64u = (hex: string): string => Buffer.from(hex, "hex").toString("base64url");

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Load + validate door config from the environment. Fail-closed with a clear message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): OperateConfig | { error: string } {
  const credRaw = env.DEKIMU_AGENT_CREDENTIAL;
  const termKey = env.DEKIMU_AGENT_TERMINAL_KEY;
  if (!credRaw) return { error: "DEKIMU_AGENT_CREDENTIAL is not set." };
  if (!termKey) return { error: "DEKIMU_AGENT_TERMINAL_KEY is not set." };
  if (!/^[0-9a-f]{64}$/i.test(termKey))
    return { error: "DEKIMU_AGENT_TERMINAL_KEY must be 64 hex chars (a 32-byte ed25519 seed)." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(credRaw);
  } catch {
    return { error: "DEKIMU_AGENT_CREDENTIAL is not valid JSON." };
  }
  const cred = parsed as Record<string, unknown>;
  if (!isString(cred.workspaceId) || !isString(cred.agentId) || !isString(cred.agentPublicKey))
    return { error: "DEKIMU_AGENT_CREDENTIAL is missing workspaceId/agentId/agentPublicKey." };

  // Sanity: the terminal key must derive the credential's public key, else every door call
  // fails the identity-bind. Catch the misconfiguration here with a clear message.
  const derivedPub = Buffer.from(ed.getPublicKey(hexToBytes(termKey))).toString("base64url");
  if (derivedPub !== cred.agentPublicKey)
    return {
      error: "DEKIMU_AGENT_TERMINAL_KEY does not match the credential's agentPublicKey (wrong key or wrong credential).",
    };

  return {
    credential: cred as CredentialEnvelope,
    terminalKeyHex: termKey,
    doorUrl: env.DEKIMU_DOOR_URL && env.DEKIMU_DOOR_URL.length > 0 ? env.DEKIMU_DOOR_URL : DEFAULT_DOOR_URL,
    verifyBaseUrl: env.DEKIMU_VERIFY_URL && env.DEKIMU_VERIFY_URL.length > 0 ? env.DEKIMU_VERIFY_URL : DEFAULT_VERIFY_URL,
  };
}

export interface ProofInput {
  readonly jti: string;
  readonly ts: number;
  readonly capabilityId: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly input: unknown;
}

/** Build the DPoP-style proof: base64url ed25519 over the canonical signed payload. */
export function buildProof(
  args: ProofInput,
  terminalKeyHex: string,
): { jti: string; ts: number; sig: string } {
  const { jti, ts, capabilityId, workspaceId, agentId, input } = args;
  // Field order is irrelevant — canonicalize() sorts keys. Mirrors the door's signed set exactly.
  const signedPayload = { jti, ts, capabilityId, workspaceId, agentId, input };
  const sigHex = sign(canonicalize(signedPayload), terminalKeyHex);
  return { jti, ts, sig: hexToB64u(sigHex) };
}

export interface OperateDeps {
  readonly fetch?: FetchLike;
  /** Unix seconds. */
  readonly now?: () => number;
  readonly jti?: () => string;
}

/** Assemble request + PoP, POST to the door, map the verdict. Never throws. */
export async function operate(
  input: OperateInput,
  config: OperateConfig,
  deps: OperateDeps = {},
): Promise<OperateResult> {
  const fetchImpl: FetchLike = deps.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const newJti = deps.jti ?? (() => randomUUID());
  const { credential, terminalKeyHex, doorUrl } = config;
  const { workspaceId, agentId } = credential;

  const proof = buildProof(
    {
      jti: newJti(),
      ts: now(),
      capabilityId: input.capability,
      workspaceId,
      agentId,
      input: input.input,
    },
    terminalKeyHex,
  );

  const body = {
    capabilityId: input.capability,
    input: input.input,
    workspaceId,
    agentId,
    credential,
    ...(input.spend ? { spend: input.spend } : {}),
    proof,
  };

  let res: { status: number; json: () => Promise<unknown> };
  try {
    res = await fetchImpl(doorUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { status: "error", error: `door unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Door off (or route not deployed) — fail-closed, non-throwing, clear.
  if (res.status === 404)
    return {
      status: "door-disabled",
      httpStatus: 404,
      detail: "The agent door is not enabled on this deployment (AGENT_DOOR_ENABLED is off, or the route is unpublished).",
    };

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { status: "error", httpStatus: res.status, error: "the door returned a non-JSON response." };
  }
  const j = (parsed ?? {}) as Record<string, unknown>;
  const str = (k: string): string | undefined => (isString(j[k]) ? (j[k] as string) : undefined);

  switch (res.status) {
    case 200: {
      const receiptId = str("receiptId");
      // Close the loop: independently re-verify the minted AActR via the public verifier (#5).
      // Skipped only when the door returned no receiptId (nothing to attest). Fail-safe.
      let verification: ReverifyResult | undefined;
      if (receiptId) {
        const expectedCredentialId = isString(credential.credentialId) ? credential.credentialId : null;
        verification = await reverifyAction(
          { receiptId, capability: input.capability, expectedCredentialId },
          { fetch: fetchImpl, verifyBaseUrl: config.verifyBaseUrl },
        );
      }
      return { status: "ok", httpStatus: 200, receiptId, output: j.output, ...(verification ? { verification } : {}) };
    }
    case 202:
      return {
        status: "checkpoint",
        httpStatus: 202,
        tier: str("tier"),
        detail: str("detail") ?? "This action requires human approval (checkpoint pending).",
      };
    case 403:
      return { status: "denied", httpStatus: 403, stage: str("stage"), reason: str("reason") ?? "denied" };
    case 400:
      return { status: "config-error", httpStatus: 400, error: str("error") ?? "the door rejected the request shape." };
    default:
      return { status: "error", httpStatus: res.status, error: str("error") ?? "capability execution error." };
  }
}
