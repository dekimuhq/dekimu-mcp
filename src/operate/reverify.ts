/**
 * reverify — the VERIFIABLE corner, from the agent's side (Dekimu A1 unit #5).
 *
 * After the gated door reports it minted an AActR (`receiptId`), DON'T take the door's
 * word for it: independently re-fetch that receipt from the PUBLIC verifier
 * (verify.dekimu.com) and confirm it actually attests to what we asked for —
 *   1. the verifier reports the receipt is signed by a TRUSTED Hub-controlled key
 *      (`trust_outcome === "valid_trusted"`, not merely `signature.ok` — a `valid_untrusted`
 *      receipt is cryptographically intact but signed by an unrecognised/ephemeral key, which a
 *      forger could self-mint; the trust verdict is what makes this independent of the door)
 *   2. it's the registered AActR family (`claim_type === "ar.action.v1"`)
 *   3. `caveats_consumed.capability` == the capability we invoked (no bait-and-switch)
 *   4. `credential_id` is present and, when we know which credential we used, equals it
 *      (an agent-side expectation check: the receipt's Hub-signed credential_id == the
 *      credentialId of the credential WE handed the door — confirms the door bound our
 *      credential, not a different one; skipped when the caller didn't supply an expected id)
 *
 * Fail-safe + non-throwing: a verifier that is unreachable / returns junk yields
 * `{ checked: false }` — the action still happened at the door; we just couldn't
 * independently attest it. A `{ checked: true, match: false }` is the loud signal: the
 * anchored receipt does NOT match the request (a real integrity problem to surface).
 *
 * No private `@dekimuhq` import — this reads the public verifier's JSON API
 * (`GET /api/v/<claimId>`), the same surface any third party would use.
 */
import type { FetchLike } from "./operate.js";

const DEFAULT_VERIFY_URL = "https://verify.dekimu.com";

export interface ReverifyResult {
  /** We successfully fetched + parsed the public verifier's report. */
  readonly checked: boolean;
  /** All attestation checks held (only meaningful when `checked`). */
  readonly match: boolean;
  readonly reason?: string;
  /** The public verifier's own Ed25519 signature verdict (crypto intact). */
  readonly signatureOk?: boolean;
  /** The verifier's trust verdict: "valid_trusted" iff the issuer key is Hub-controlled. */
  readonly trustOutcome?: string;
  readonly capabilityMatches?: boolean;
  /** Receipt carries a non-empty `credential_id` (the action was mandate-bound). */
  readonly credentialBound?: boolean;
  /** `null` = we didn't know the expected id, so it wasn't compared. */
  readonly credentialIdMatches?: boolean | null;
  readonly receiptClaimType?: string;
  readonly receiptCapability?: string;
  readonly receiptCredentialId?: string;
}

export interface ReverifyArgs {
  readonly receiptId: string;
  readonly capability: string;
  /** The credentialId the caller acted under, if known — enables the equality check. */
  readonly expectedCredentialId?: string | null;
}

export interface ReverifyDeps {
  readonly fetch: FetchLike;
  readonly verifyBaseUrl?: string;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export async function reverifyAction(args: ReverifyArgs, deps: ReverifyDeps): Promise<ReverifyResult> {
  const base =
    deps.verifyBaseUrl && deps.verifyBaseUrl.length > 0
      ? deps.verifyBaseUrl.replace(/\/+$/, "")
      : DEFAULT_VERIFY_URL;
  const url = `${base}/api/v/${encodeURIComponent(args.receiptId)}`;

  let res: { status: number; json: () => Promise<unknown> };
  try {
    // No `body` on a GET — undici/WHATWG fetch throws on a GET with a body, even "".
    res = await deps.fetch(url, { method: "GET", headers: { accept: "application/json" } });
  } catch (e) {
    return { checked: false, match: false, reason: `verifier unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.status !== 200) {
    return { checked: false, match: false, reason: `verifier returned HTTP ${res.status}` };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { checked: false, match: false, reason: "verifier returned a non-JSON response" };
  }

  const rep = (parsed ?? {}) as Record<string, unknown>;
  const sig = (rep.signature ?? {}) as Record<string, unknown>;
  const env = (rep.envelope ?? {}) as Record<string, unknown>;
  const body = (env.body ?? {}) as Record<string, unknown>;
  const caveats = (body.caveats_consumed ?? {}) as Record<string, unknown>;

  const signatureOk = sig.ok === true;
  const trustOutcome = isString(sig.trust_outcome) ? sig.trust_outcome : undefined;
  const issuerTrusted = trustOutcome === "valid_trusted";
  const receiptClaimType = isString(env.claim_type) ? env.claim_type : undefined;
  const receiptCapability = isString(caveats.capability) ? caveats.capability : undefined;
  const receiptCredentialId = isString(body.credential_id) ? body.credential_id : undefined;

  const isAActR = receiptClaimType === "ar.action.v1";
  const capabilityMatches = receiptCapability === args.capability;
  const credentialBound = Boolean(receiptCredentialId);
  const credentialIdMatches =
    args.expectedCredentialId == null ? null : receiptCredentialId === args.expectedCredentialId;

  const match =
    issuerTrusted && isAActR && capabilityMatches && credentialBound && credentialIdMatches !== false;

  const reason = match
    ? undefined
    : !signatureOk
      ? "the public verifier reports the receipt signature is not valid"
      : !issuerTrusted
        ? `issuer key is not trusted (trust_outcome: ${trustOutcome ?? "(missing)"}) — the receipt is not signed by a Hub-controlled key`
        : !isAActR
          ? `unexpected claim_type: ${receiptClaimType ?? "(missing)"} (expected ar.action.v1)`
          : !capabilityMatches
            ? `capability mismatch: receipt records ${receiptCapability ?? "(missing)"}, invoked ${args.capability}`
            : !credentialBound
              ? "receipt carries no credential_id (action was not mandate-bound)"
              : credentialIdMatches === false
                ? "credential_id mismatch: receipt bound a different credential than the one used"
                : undefined;

  return {
    checked: true,
    match,
    ...(reason ? { reason } : {}),
    signatureOk,
    ...(trustOutcome ? { trustOutcome } : {}),
    capabilityMatches,
    credentialBound,
    credentialIdMatches,
    ...(receiptClaimType ? { receiptClaimType } : {}),
    ...(receiptCapability ? { receiptCapability } : {}),
    ...(receiptCredentialId ? { receiptCredentialId } : {}),
  };
}
