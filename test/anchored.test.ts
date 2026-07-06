/**
 * anchored-provenance bridge — both modes, exercised with injected fakes (no
 * private package, no network). The anchored issuer + the W3C-VC carrier are
 * dependency-injected; the real signing/anchoring stack is never a test dep.
 */
import { describe, it, expect } from "vitest";
import {
  buildAActRBody,
  commit,
  mintAnchored,
  type AnchoredEnvelope,
  type AnchoredIssuer,
  type AActRBody,
} from "../src/receipts/anchored.js";
import { loadAnchorsVc, wrapAsVc, vcModuleSpecifier, type AnchorsVcModule } from "../src/receipts/anchors-vc.js";
import { loadAnchoredIssuer } from "../src/receipts/anchored-issuer.js";
import { mintDispatch, resolveMintMode } from "../src/tools/mint-action-receipt.js";

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** A fake issuer: seals the prepared body into a structural ar.action.v1 envelope. */
function fakeIssuer(): AnchoredIssuer {
  return {
    async sealAction(body: AActRBody): Promise<AnchoredEnvelope> {
      return {
        id: "ar.action.v1:01TEST",
        claim_type: "ar.action.v1",
        iss: "did:web:issuer.test",
        iat: "2026-07-06T00:00:00Z",
        subject: null,
        body,
        sig: "fake-signature",
      };
    },
  };
}

/** A faithful VC carrier: carries the envelope verbatim, round-trips byte-equal. */
function fakeVcModule(): AnchorsVcModule {
  return {
    toVerifiableCredential: (envelope: unknown) => ({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "AnchoredReceiptCredential"],
      evidence: [{ type: ["AnchoredReceipt"], envelope }],
    }),
    extractEnvelope: (vc: unknown) => (vc as { evidence: Array<{ envelope: unknown }> }).evidence[0]!.envelope,
  };
}

const DET = { salt: () => "SALT", now: () => 0, decisionId: () => "dec-1" };

// ── commit / buildAActRBody ─────────────────────────────────────────────────────

describe("commit", () => {
  it("is deterministic for the same salt+value and prefixed sha256:", () => {
    expect(commit("s", { a: 1 })).toBe(commit("s", { a: 1 }));
    expect(commit("s", { a: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("changes with the salt (a raw hash would not)", () => {
    expect(commit("s1", { a: 1 })).not.toBe(commit("s2", { a: 1 }));
  });
});

describe("buildAActRBody", () => {
  it("maps the tool call onto the AActR body and hides raw payloads behind commits", () => {
    const { body } = buildAActRBody(
      { toolName: "summarize", inputs: { secret: "s" }, output: "done" },
      DET,
    );
    expect(body.verb).toBe("summarize");
    expect(body.profile).toBe("hub.automation");
    expect(body.outcome).toBe("executed");
    expect(body.rule_id).toBe("mcp.summarize");
    expect(body.executed_at).toBe("1970-01-01T00:00:00.000Z");
    expect(body.decision_commit).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(body.params_commit).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Raw payload never leaks into the receipt.
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("binds credential_id + caveats_consumed when mandate-authorized (tamper-covered)", () => {
    const { body } = buildAActRBody(
      {
        toolName: "ropa.compile",
        mandate: { credentialId: "cred_0001", capability: "ropa.compile", dataScope: "ws_1", spendStep: 2, spendCurrency: "EUR", agentId: "agent_9" },
      },
      DET,
    );
    expect(body.credential_id).toBe("cred_0001");
    expect(body.caveats_consumed).toEqual({ data_scope: "ws_1", spend_step: 2, spend_currency: "EUR", capability: "ropa.compile" });
    expect(body.agent_id).toBe("agent_9");
  });

  it("omits the mandate block for a policy-authorized action (no credential_id)", () => {
    const { body } = buildAActRBody({ toolName: "gdpr.scan" }, DET);
    expect(body.credential_id).toBeUndefined();
    expect(body.caveats_consumed).toBeUndefined();
    expect(body.agent_id).toBeUndefined();
  });

  it("returns the reveal salts for each commit", () => {
    const { salts } = buildAActRBody({ toolName: "x" }, { now: () => 0, decisionId: () => "d" });
    expect(salts.decision).toMatch(/^[0-9a-f]{32}$/);
    expect(salts.params).toMatch(/^[0-9a-f]{32}$/);
    expect(salts.request_id).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ── mintAnchored ────────────────────────────────────────────────────────────────

describe("mintAnchored", () => {
  it("seals a real ar.action.v1 envelope via the injected issuer (no VC by default)", async () => {
    const r = await mintAnchored({ toolName: "summarize", output: "ok" }, fakeIssuer(), DET);
    expect(r.envelope.claim_type).toBe("ar.action.v1");
    expect(r.envelope.body.verb).toBe("summarize");
    expect(r.vc).toBeUndefined();
    expect(r.vcSkippedReason).toBeUndefined();
  });

  it("wraps as a W3C VC when requested + carrier injected, round-trip byte-equal", async () => {
    const r = await mintAnchored({ toolName: "x" }, fakeIssuer(), { ...DET, wrapVc: true, vcModule: fakeVcModule() });
    expect(r.vc).toBeDefined();
    expect((r.vc as { type: string[] }).type).toContain("AnchoredReceiptCredential");
    expect(r.vcSkippedReason).toBeUndefined();
  });

  it("degrades gracefully when wrapVc is requested but no carrier is available", async () => {
    // No injected carrier + a bogus env specifier ⇒ dynamic load returns null.
    const prev = process.env.DEKIMU_ANCHORS_VC_MODULE;
    process.env.DEKIMU_ANCHORS_VC_MODULE = "./__does_not_exist__.js";
    try {
      const r = await mintAnchored({ toolName: "x" }, fakeIssuer(), { ...DET, wrapVc: true });
      expect(r.vc).toBeUndefined();
      expect(r.vcSkippedReason).toContain("VC wrapping unavailable");
    } finally {
      if (prev === undefined) delete process.env.DEKIMU_ANCHORS_VC_MODULE;
      else process.env.DEKIMU_ANCHORS_VC_MODULE = prev;
    }
  });

  it("rejects a carrier that does not round-trip byte-equal", async () => {
    const lossy: AnchorsVcModule = {
      toVerifiableCredential: (env: unknown) => ({ evidence: [{ envelope: env }] }),
      extractEnvelope: () => ({ tampered: true }), // returns a DIFFERENT envelope
    };
    const r = await mintAnchored({ toolName: "x" }, fakeIssuer(), { ...DET, wrapVc: true, vcModule: lossy });
    expect(r.vc).toBeUndefined();
    expect(r.vcSkippedReason).toContain("round-trip mismatch");
  });
});

// ── optional-loader graceful degrade ────────────────────────────────────────────

describe("optional loaders degrade gracefully", () => {
  it("loadAnchorsVc returns null for an unresolvable module", async () => {
    expect(await loadAnchorsVc("./__nope__.js")).toBeNull();
  });
  it("loadAnchorsVc returns null when the module lacks the expected surface", async () => {
    // node: url resolves but exposes no toVerifiableCredential/extractEnvelope.
    expect(await loadAnchorsVc("node:url")).toBeNull();
  });
  it("vcModuleSpecifier honours the env override, else the default", () => {
    expect(vcModuleSpecifier({ DEKIMU_ANCHORS_VC_MODULE: "x-carrier" })).toBe("x-carrier");
    expect(vcModuleSpecifier({})).toBe("@dekimuhq/anchors-vc");
  });
  it("loadAnchoredIssuer returns null when unconfigured", async () => {
    expect(await loadAnchoredIssuer(undefined)).toBeNull();
    expect(await loadAnchoredIssuer("")).toBeNull();
  });
  it("loadAnchoredIssuer returns null for an unresolvable module", async () => {
    expect(await loadAnchoredIssuer("./__no_issuer__.js")).toBeNull();
  });
  it("wrapAsVc never throws on a throwing carrier", async () => {
    const boom: AnchorsVcModule = {
      toVerifiableCredential: () => {
        throw new Error("kaboom");
      },
      extractEnvelope: (v) => v,
    };
    const r = await wrapAsVc({ id: "x" }, { vcModule: boom });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("VC wrapping failed");
  });
});

// ── mintDispatch (tool boundary) ─────────────────────────────────────────────────

describe("mintDispatch — mode routing", () => {
  it("resolveMintMode defaults to local and only opts into anchored/both explicitly", () => {
    expect(resolveMintMode({})).toBe("local");
    expect(resolveMintMode({ DEKIMU_RECEIPT_MODE: "nonsense" })).toBe("local");
    expect(resolveMintMode({ DEKIMU_RECEIPT_MODE: "anchored" })).toBe("anchored");
    expect(resolveMintMode({ DEKIMU_RECEIPT_MODE: "BOTH" })).toBe("both");
  });

  it("local mode: unchanged self-signed receipt", async () => {
    const res = await mintDispatch({ action: "summarize", output: "done" }, 1000, { mode: "local" });
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toContain("Minted dekimu.mcp.action.v1 receipt");
  });

  it("anchored mode: seals a real ar.action.v1 via the injected issuer", async () => {
    const res = await mintDispatch(
      { action: "ropa.compile", credentialId: "cred_1", capability: "ropa.compile", dataScope: "ws_1" },
      1000,
      { mode: "anchored", issuer: fakeIssuer() },
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toContain("Minted ar.action.v1 (AActR)");
    expect(res.content[0]!.text).toContain("mandate-bound");
    const payload = JSON.parse(res.content[1]!.text) as { envelope: AnchoredEnvelope; reveal_salts: unknown };
    expect(payload.envelope.claim_type).toBe("ar.action.v1");
    expect(payload.envelope.body.credential_id).toBe("cred_1");
    expect(payload.reveal_salts).toBeDefined();
  });

  it("anchored mode: labels a policy-authorized action (no mandate)", async () => {
    const res = await mintDispatch({ action: "gdpr.scan" }, 1000, { mode: "anchored", issuer: fakeIssuer() });
    expect(res.content[0]!.text).toContain("policy-authorized");
  });

  it("anchored mode + wrapVc: attaches the VC via the injected carrier", async () => {
    const res = await mintDispatch(
      { action: "x", wrapVc: true },
      1000,
      { mode: "anchored", issuer: fakeIssuer(), vcModule: fakeVcModule() },
    );
    expect(res.content[0]!.text).toContain("W3C VC wrapper");
    const payload = JSON.parse(res.content[1]!.text) as { vc?: unknown };
    expect(payload.vc).toBeDefined();
  });

  it("both mode: emits the local receipt AND the anchored receipt", async () => {
    const res = await mintDispatch({ action: "x" }, 1000, { mode: "both", issuer: fakeIssuer() });
    const joined = res.content.map((c) => c.text).join("\n");
    expect(joined).toContain("Minted dekimu.mcp.action.v1 receipt");
    expect(joined).toContain("Minted ar.action.v1 (AActR)");
  });

  it("anchored requested but no issuer configured: degrades to local with a notice", async () => {
    const res = await mintDispatch({ action: "x", output: "y" }, 1000, { mode: "anchored", issuer: null });
    expect(res.content[0]!.text).toContain("no anchored issuer is configured");
    expect(res.content.some((c) => c.text.includes("dekimu.mcp.action.v1"))).toBe(true);
  });

  it("anchored mode: credentialId without capability/dataScope is a tool error, not a crash", async () => {
    const res = await mintDispatch({ action: "x", credentialId: "cred_1" }, 1000, { mode: "anchored", issuer: fakeIssuer() });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("requires both capability and dataScope");
  });

  it("anchored mode: non-JSON input surfaces as a tool error (never throws)", async () => {
    const res = await mintDispatch({ action: "x", inputs: { bad: Infinity } }, 1000, { mode: "anchored", issuer: fakeIssuer() });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("anchored mint failed");
  });
});
