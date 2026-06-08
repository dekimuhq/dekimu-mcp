import { describe, it, expect } from "vitest";
import { generateKeypair } from "../src/crypto/sign.js";
import { mintActionReceipt } from "../src/receipts/mint.js";
import { verifyReceipt } from "../src/receipts/verify.js";

describe("conformance", () => {
  it("self-minted receipts verify (round-trip floor)", () => {
    const r = mintActionReceipt({ action: "a", output: "b" }, generateKeypair(), 1000);
    expect(verifyReceipt(r).valid).toBe(true);
  });

  // Enable once a real fixture from verify.dekimu.com is captured (see fixtures/README.md).
  it.todo("verifies a receipt sample captured from the live verify.dekimu.com registry");
});
