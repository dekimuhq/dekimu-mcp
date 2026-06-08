import { canonicalize } from "../crypto/canonicalize.js";
import { verify as edVerify, fingerprint } from "../crypto/sign.js";
import { ActionReceiptSchema } from "./shapes.js";

export interface VerifyResult {
  valid: boolean;
  issuer: string | null;
  // NOTE: `fingerprintSelfConsistent` only checks that fingerprint == hash(publicKey).
  // It is NOT an identity proof — a self-signed receipt's issuer chooses both the key
  // and the signature, so `valid:true` means only "someone holding this key signed
  // these bytes", never "this came from a trusted party".
  checks: { structure: boolean; signature: boolean; fingerprintSelfConsistent: boolean };
  reason?: string;
}

export function verifyReceipt(receipt: unknown): VerifyResult {
  const parsed = ActionReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    return {
      valid: false,
      issuer: null,
      checks: { structure: false, signature: false, fingerprintSelfConsistent: false },
      reason: "structure: not an ar.action.v1 receipt",
    };
  }
  const r = parsed.data;
  const fpOk = fingerprint(r.issuer.publicKey) === r.issuer.fingerprint;
  const sigOk = edVerify(
    canonicalize({ kind: r.kind, body: r.body, issuer: r.issuer }),
    r.signature,
    r.issuer.publicKey
  );
  const valid = fpOk && sigOk;
  return {
    valid,
    issuer: r.issuer.kind,
    checks: { structure: true, signature: sigOk, fingerprintSelfConsistent: fpOk },
    ...(valid ? {} : { reason: !sigOk ? "signature: does not verify" : "fingerprint: mismatch" }),
  };
}
