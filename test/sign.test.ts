import { describe, it, expect } from "vitest";
import { generateKeypair, sign, verify, sha256Hex, fingerprint } from "../src/crypto/sign.js";

describe("ed25519 sign/verify", () => {
  it("round-trips a signature over canonical bytes", () => {
    const kp = generateKeypair();
    const msg = '{"a":1}';
    const sig = sign(msg, kp.privateKey);
    expect(verify(msg, sig, kp.publicKey)).toBe(true);
  });
  it("rejects a tampered message", () => {
    const kp = generateKeypair();
    const sig = sign('{"a":1}', kp.privateKey);
    expect(verify('{"a":2}', sig, kp.publicKey)).toBe(false);
  });
  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).toHaveLength(64);
  });
  it("fingerprint is a short stable id of a public key", () => {
    const kp = generateKeypair();
    expect(fingerprint(kp.publicKey)).toBe(fingerprint(kp.publicKey));
  });
});
