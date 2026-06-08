import { describe, it, expect } from "vitest";
import { mintHandler } from "../src/tools/mint-action-receipt.js";

describe("mintHandler (tool boundary)", () => {
  it("mints a receipt for well-formed input", () => {
    const res = mintHandler({ action: "summarize", output: "done" }, 1000);
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("Minted ar.action.v1 receipt");
  });

  it("returns a tool error (not a crash) for non-JSON agent input", () => {
    // Non-finite number inside agent-controlled inputs makes canonicalize throw.
    const res = mintHandler({ action: "a", inputs: { x: Infinity } }, 1000);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/mint failed/);
  });

  it("returns a tool error for a bigint in inputs", () => {
    const res = mintHandler({ action: "a", inputs: { n: 10n as unknown } }, 1000);
    expect(res.isError).toBe(true);
  });
});
