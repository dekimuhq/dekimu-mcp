import { describe, it, expect } from "vitest";
import { policyQueryHandler, readOnly as pRO } from "../src/tools/autonomy-policy-query.js";
import { digestLatestHandler, readOnly as dRO } from "../src/tools/ecosystem-digest-latest.js";

describe("read-only MCP tools v0", () => {
  it("policy query returns the tier for a known domain", () => {
    const res = policyQueryHandler({ domain: "engineering-ops" });
    expect(JSON.parse(res.content[0].text).tier).toBe("full-auto");
  });

  it("policy query flags unknown domain without throwing", () => {
    const res = policyQueryHandler({ domain: "marketing" });
    expect(JSON.parse(res.content[0].text).error).toBe("unknown domain");
  });

  it("policy query treats inherited Object.prototype keys as unknown domains", () => {
    // Untrusted client input: a plain index lookup would resolve these to
    // prototype members and misreport them as known domains.
    for (const domain of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const res = policyQueryHandler({ domain });
      expect(JSON.parse(res.content[0].text).error).toBe("unknown domain");
    }
  });

  it("digest latest degrades when path unconfigured", async () => {
    const prev = process.env.ECOSYSTEM_DIGEST_PATH;
    delete process.env.ECOSYSTEM_DIGEST_PATH;
    const res = await digestLatestHandler();
    expect(JSON.parse(res.content[0].text).available).toBe(false);
    if (prev !== undefined) process.env.ECOSYSTEM_DIGEST_PATH = prev;
  });

  it("both tools declare read-only", () => {
    expect(pRO).toBe(true);
    expect(dRO).toBe(true);
  });
});
