import { describe, it, expect } from "vitest";
import { checkActivity } from "../src/obligations/check.js";

describe("checkActivity", () => {
  it("flags a missing lawful basis as a gap", () => {
    const res = checkActivity({ purpose: "marketing", dataCategories: ["email"] });
    const lb = res.obligations.find((o) => o.id === "lawful-basis");
    expect(lb?.status).toBe("gap");
    expect(res.manifestVersion).toBeTruthy();
    expect(res.disclaimer).toContain("snapshot");
  });
  it("marks lawful basis met when provided", () => {
    const res = checkActivity({ purpose: "marketing", lawfulBasis: "consent", dataCategories: ["email"], retention: "24m" });
    expect(res.obligations.find((o) => o.id === "lawful-basis")?.status).toBe("met");
  });
  it("flags missing retention as a gap", () => {
    const res = checkActivity({ purpose: "x", lawfulBasis: "contract" });
    expect(res.obligations.find((o) => o.id === "retention")?.status).toBe("gap");
  });
});
