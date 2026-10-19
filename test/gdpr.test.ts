import { describe, it, expect } from "vitest";
import { checkActivity } from "../src/obligations/check.js";
import { GDPR_OBLIGATIONS } from "../src/obligations/gdpr-manifest.js";

// The public Regulation-as-Code GDPR profile (profiles/gdpr/v1.md, manifest `gdpr` 1.2.0)
// — every id this server emits must be one of these, spelled identically.
const CANONICAL_GDPR_IDS = [
  "gdpr.lawful-basis",
  "gdpr.purpose-limitation",
  "gdpr.retention",
  "gdpr.privacy-notice",
  "gdpr.subject-rights",
  "gdpr.erasure",
  "gdpr.dpia",
  "gdpr.prior-consultation",
];

describe("checkActivity", () => {
  it("emits only canonical gdpr.* obligation ids", () => {
    for (const o of GDPR_OBLIGATIONS) expect(CANONICAL_GDPR_IDS).toContain(o.id);
    expect(GDPR_OBLIGATIONS.map((o) => o.id)).toEqual(["gdpr.lawful-basis", "gdpr.purpose-limitation", "gdpr.retention"]);
  });
  it("flags a missing lawful basis as a gap", () => {
    const res = checkActivity({ purpose: "marketing", dataCategories: ["email"] });
    const lb = res.obligations.find((o) => o.id === "gdpr.lawful-basis");
    expect(lb?.status).toBe("gap");
    expect(res.manifestVersion).toBeTruthy();
    expect(res.disclaimer).toContain("snapshot");
  });
  it("marks lawful basis met when provided", () => {
    const res = checkActivity({ purpose: "marketing", lawfulBasis: "consent", dataCategories: ["email"], retention: "24m" });
    expect(res.obligations.find((o) => o.id === "gdpr.lawful-basis")?.status).toBe("met");
  });
  it("flags missing retention as a gap", () => {
    const res = checkActivity({ purpose: "x", lawfulBasis: "contract" });
    expect(res.obligations.find((o) => o.id === "gdpr.retention")?.status).toBe("gap");
  });
  it("marks purpose limitation met when a purpose is specified", () => {
    const res = checkActivity({ purpose: "x" });
    expect(res.obligations.find((o) => o.id === "gdpr.purpose-limitation")?.status).toBe("met");
  });
});
