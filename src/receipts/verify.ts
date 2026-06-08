import { canonicalize } from "../crypto/canonicalize.js";
import { verify as edVerify, fingerprint } from "../crypto/sign.js";
import { ActionReceiptSchema } from "./shapes.js";

export interface VerifyResult {
  valid: boolean;
  issuer: string | null;
  checks: { structure: boolean; signature: boolean; fingerprint: boolean };
  reason?: string;
}

export function verifyReceipt(receipt: unknown): VerifyResult {
  const parsed = ActionReceiptSchema.safeParse(receipt);
  if (!parsed.success) {
    return { valid: false, issuer: null, checks: { structure: false, signature: false, fingerprint: false }, reason: "structure: not an ar.action.v1 receipt" };
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
    checks: { structure: true, signature: sigOk, fingerprint: fpOk },
    ...(valid ? {} : { reason: !sigOk ? "signature: does not verify" : "fingerprint: mismatch" }),
  };
}
