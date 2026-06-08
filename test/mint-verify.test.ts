import { describe, it, expect } from "vitest";
import { generateKeypair } from "../src/crypto/sign.js";
import { mintActionReceipt } from "../src/receipts/mint.js";
import { ActionReceiptSchema } from "../src/receipts/shapes.js";

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
