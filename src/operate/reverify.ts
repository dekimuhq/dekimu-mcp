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
 *   2. it's the family the capability mints (`expectedReceiptFor`): the AActR
 *      (`ar.action.v1`) for most, a provenance receipt (`ar.provenance.v1`, body kind
 *      `ropa.register.v1`) for `ropa.compile`
 *   3. AActR only: `caveats_consumed.capability` == the capability we invoked
 *   4. AActR only: `credential_id` is present and, when we know which credential we used,
 *      equals it (the door bound OUR credential, not a different one)
 *
 * A provenance receipt records WHAT was produced, not WHO asked: it carries no capability
 * caveat and no credential id, so checks 3-4 cannot run. `actionBound: false` says so
 * plainly instead of failing them. `workspaceKeyMatches` (signing kid is this workspace's
 * per-tenant key) is reported for both families but never fails `match`: a deployment
 * without per-tenant signing signs with the shared Hub key, which is still trusted.
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

/** What a capability's receipt must look like, per receipt family. */
export interface ExpectedReceipt {
  readonly claimType: string;
  /** Required `envelope.body.kind`, when the family carries one. */
  readonly bodyKind?: string;
  /** The receipt records the invoked capability + the credential (AActR); provenance receipts do not. */
  readonly actionBound: boolean;
}

const ACTION_RECEIPT: ExpectedReceipt = { claimType: "ar.action.v1", actionBound: true };
const NON_ACTION_RECEIPTS: Readonly<Record<string, ExpectedReceipt>> = {
  // agent-capabilities ropa.compile: `receipt: { family: "apr" }`, body { kind: "ropa.register.v1", register }.
  "ropa.compile": { claimType: "ar.provenance.v1", bodyKind: "ropa.register.v1", actionBound: false },
};

export function expectedReceiptFor(capability: string): ExpectedReceipt {
  return NON_ACTION_RECEIPTS[capability] ?? ACTION_RECEIPT;
}

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
  /** false = this receipt family does not record who asked (capability/credential checks n/a). */
  readonly actionBound?: boolean;
  readonly receiptBodyKind?: string;
  /** The verifier's matched signing kid. */
  readonly issuerKid?: string;
  /** Kid is this workspace's per-tenant key (`hub-<ws>-<gen>`); null = not compared. Informational. */
  readonly workspaceKeyMatches?: boolean | null;
}

export interface ReverifyArgs {
  readonly receiptId: string;
  readonly capability: string;
  /** The credentialId the caller acted under, if known — enables the equality check. */
  readonly expectedCredentialId?: string | null;
  /** The workspace the credential is scoped to, if known — enables `workspaceKeyMatches`. */
  readonly expectedWorkspaceId?: string | null;
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
  const receiptBodyKind = isString(body.kind) ? body.kind : undefined;
  const issuerKid = isString(sig.matchedKid) ? sig.matchedKid : undefined;

  const expected = expectedReceiptFor(args.capability);
  const claimTypeOk = receiptClaimType === expected.claimType;
  const bodyKindOk = expected.bodyKind === undefined || receiptBodyKind === expected.bodyKind;
  const capabilityMatches = receiptCapability === args.capability;
  const credentialBound = Boolean(receiptCredentialId);
  const credentialIdMatches =
    args.expectedCredentialId == null ? null : receiptCredentialId === args.expectedCredentialId;
  const workspaceKeyMatches =
    args.expectedWorkspaceId == null || issuerKid === undefined
      ? null
      : issuerKid.startsWith(`hub-${args.expectedWorkspaceId}-`);

  const bindingOk = expected.actionBound
    ? capabilityMatches && credentialBound && credentialIdMatches !== false
    : true;
  const match = issuerTrusted && claimTypeOk && bodyKindOk && bindingOk;

  const reason = match
    ? undefined
    : !signatureOk
      ? "the public verifier reports the receipt signature is not valid"
      : !issuerTrusted
        ? `issuer key is not trusted (trust_outcome: ${trustOutcome ?? "(missing)"}) — the receipt is not signed by a Hub-controlled key`
        : !claimTypeOk
          ? `unexpected claim_type: ${receiptClaimType ?? "(missing)"} (expected ${expected.claimType} for ${args.capability})`
          : !bodyKindOk
            ? `unexpected body kind: ${receiptBodyKind ?? "(missing)"} (expected ${expected.bodyKind})`
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
    actionBound: expected.actionBound,
    ...(expected.actionBound ? { capabilityMatches, credentialBound, credentialIdMatches } : {}),
    workspaceKeyMatches,
    ...(issuerKid ? { issuerKid } : {}),
    ...(receiptClaimType ? { receiptClaimType } : {}),
    ...(receiptBodyKind ? { receiptBodyKind } : {}),
    ...(receiptCapability ? { receiptCapability } : {}),
    ...(receiptCredentialId ? { receiptCredentialId } : {}),
  };
}
