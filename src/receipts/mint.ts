import { canonicalize } from "../crypto/canonicalize.js";
import { sha256Hex, sign, fingerprint, type Keypair } from "../crypto/sign.js";
import type { ActionReceipt, MintInput } from "./shapes.js";

export function mintActionReceipt(input: MintInput, kp: Keypair, issuedAt: number): ActionReceipt {
  const body = {
    action: input.action,
    inputsHash: input.inputs === undefined ? null : sha256Hex(canonicalize(input.inputs)),
    outputHash: input.output === undefined ? null : sha256Hex(canonicalize(input.output)),
    ...(input.metadata ? { metadata: input.metadata } : {}),
    issuedAt,
  };
  const issuer = {
    kind: "local-self-signed" as const,
    publicKey: kp.publicKey,
    fingerprint: fingerprint(kp.publicKey),
  };
  const signature = sign(canonicalize({ kind: "ar.action.v1", body, issuer }), kp.privateKey);
  return { kind: "ar.action.v1", body, issuer, signature };
}
