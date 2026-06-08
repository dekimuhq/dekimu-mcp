import { describe, it, expect } from "vitest";
import { generateKeypair } from "../src/crypto/sign.js";
import { mintActionReceipt } from "../src/receipts/mint.js";
import { ActionReceiptSchema } from "../src/receipts/shapes.js";
import { verifyReceipt } from "../src/receipts/verify.js";

describe("mintActionReceipt", () => {
  const kp = generateKeypair();
  it("produces a schema-valid, signed receipt", () => {
    const r = mintActionReceipt(
      { action: "summarize", inputs: { url: "x" }, output: "done" },
      kp,
      1000
    );
    expect(ActionReceiptSchema.safeParse(r).success).toBe(true);
    expect(r.issuer.kind).toBe("local-self-signed");
    expect(r.signature).toMatch(/^[0-9a-f]+$/);
  });
  it("hashes inputs/output instead of storing them by default", () => {
    const r = mintActionReceipt({ action: "a", inputs: { secret: "s" } }, kp, 1000);
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(r.body.inputsHash).toHaveLength(64);
  });
});

describe("verifyReceipt", () => {
  const kp = generateKeypair();
  it("accepts a freshly minted receipt and reports the local issuer", () => {
    const r = mintActionReceipt({ action: "a", output: "b" }, kp, 1000);
    const v = verifyReceipt(r);
    expect(v.valid).toBe(true);
    expect(v.issuer).toBe("local-self-signed");
    expect(v.checks.signature).toBe(true);
  });
  it("rejects a tampered body", () => {
    const r = mintActionReceipt({ action: "a", output: "b" }, kp, 1000);
    const tampered = { ...r, body: { ...r.body, action: "evil" } };
    const v = verifyReceipt(tampered);
    expect(v.valid).toBe(false);
    expect(v.reason).toBeTruthy();
  });
  it("rejects structurally-malformed input without throwing", () => {
    const v = verifyReceipt({ not: "a receipt" });
    expect(v.valid).toBe(false);
    expect(v.checks.structure).toBe(false);
  });
});
