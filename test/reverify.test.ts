/**
 * reverify (A1 unit #5) — independent post-action attestation against the public verifier.
 * The verifier is exercised with an injected FetchLike — no network.
 */
import { describe, it, expect } from "vitest";
import { reverifyAction, type ReverifyResult } from "../src/operate/reverify.js";
import type { FetchLike } from "../src/operate/operate.js";

/** A verifier `GET /api/v/<id>` report, shaped like verify.dekimu.com's real JSON. */
function verifierReport(over: {
  sigOk?: boolean;
  trustOutcome?: string;
  claimType?: string;
  capability?: string;
  credentialId?: string | undefined;
} = {}) {
  const { sigOk = true, claimType = "ar.action.v1", capability = "ropa.compile" } = over;
  // Realistic: a bad signature can never be valid_trusted.
  const trustOutcome = over.trustOutcome ?? (sigOk ? "valid_trusted" : "invalid_signature");
  const credentialId = "credentialId" in over ? over.credentialId : "cred_test_0001";
  return {
    status: trustOutcome === "valid_trusted" ? "verified" : "untrusted",
    signature: { ok: sigOk, issuerTrusted: trustOutcome === "valid_trusted", trust_outcome: trustOutcome },
    envelope: {
      claim_type: claimType,
      body: {
        ...(credentialId !== undefined ? { credential_id: credentialId } : {}),
        caveats_consumed: { data_scope: "ws_test", spend_step: 1, capability },
      },
    },
  };
}

function fetchReturning(status: number, json: unknown): {
  fetch: FetchLike;
  urls: string[];
  inits: Array<{ method: string; body?: string }>;
} {
  const urls: string[] = [];
  const inits: Array<{ method: string; body?: string }> = [];
  const fetch: FetchLike = async (url, init) => {
    urls.push(url);
    inits.push({ method: init.method, body: init.body });
    return { status, json: async () => json };
  };
  return { fetch, urls, inits };
}

const ARGS = { receiptId: "ar.action.v1:01ABC", capability: "ropa.compile", expectedCredentialId: "cred_test_0001" };

describe("reverifyAction", () => {
  it("matches when trusted sig + AActR + capability + credential_id all agree", async () => {
    const { fetch, urls, inits } = fetchReturning(200, verifierReport());
    const r = await reverifyAction(ARGS, { fetch, verifyBaseUrl: "https://verify.test" });
    expect(r).toMatchObject<Partial<ReverifyResult>>({
      checked: true,
      match: true,
      signatureOk: true,
      trustOutcome: "valid_trusted",
      capabilityMatches: true,
      credentialBound: true,
      credentialIdMatches: true,
      receiptClaimType: "ar.action.v1",
    });
    expect(r.reason).toBeUndefined();
    expect(urls[0]).toBe("https://verify.test/api/v/ar.action.v1%3A01ABC");
    // The GET MUST carry no body — undici throws on a GET with a body (even "").
    expect(inits[0]!.method).toBe("GET");
    expect(inits[0]!.body).toBeUndefined();
  });

  it("flags a cryptographically-intact but UNTRUSTED issuer key (self-minted forgery)", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ sigOk: true, trustOutcome: "valid_untrusted" }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.checked).toBe(true);
    expect(r.match).toBe(false);
    expect(r.signatureOk).toBe(true);
    expect(r.trustOutcome).toBe("valid_untrusted");
    expect(r.reason).toContain("not trusted");
  });

  it("flags a capability mismatch (bait-and-switch)", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ capability: "erasure.execute" }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.checked).toBe(true);
    expect(r.match).toBe(false);
    expect(r.capabilityMatches).toBe(false);
    expect(r.reason).toContain("capability mismatch");
  });

  it("flags an invalid signature reported by the verifier", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ sigOk: false }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.match).toBe(false);
    expect(r.signatureOk).toBe(false);
    expect(r.reason).toContain("signature is not valid");
  });

  it("flags a credential_id mismatch (different credential bound)", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ credentialId: "cred_OTHER" }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.match).toBe(false);
    expect(r.credentialIdMatches).toBe(false);
    expect(r.reason).toContain("credential_id mismatch");
  });

  it("flags a receipt with no credential_id (not mandate-bound)", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ credentialId: undefined }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.match).toBe(false);
    expect(r.credentialBound).toBe(false);
    expect(r.reason).toContain("no credential_id");
  });

  it("does not compare credential_id when the expected id is unknown", async () => {
    const { fetch } = fetchReturning(200, verifierReport());
    const r = await reverifyAction({ receiptId: ARGS.receiptId, capability: "ropa.compile" }, { fetch });
    expect(r.match).toBe(true);
    expect(r.credentialIdMatches).toBeNull();
  });

  it("flags an unexpected claim_type", async () => {
    const { fetch } = fetchReturning(200, verifierReport({ claimType: "dekimu.mcp.action.v1" }));
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.match).toBe(false);
    expect(r.reason).toContain("unexpected claim_type");
  });

  it("returns checked:false on a non-200 (receipt not found yet / verifier error)", async () => {
    const { fetch } = fetchReturning(404, { error: "not found" });
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.checked).toBe(false);
    expect(r.match).toBe(false);
    expect(r.reason).toContain("HTTP 404");
  });

  it("returns checked:false (never throws) when the verifier is unreachable", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await reverifyAction(ARGS, { fetch });
    expect(r.checked).toBe(false);
    expect(r.reason).toContain("unreachable");
  });

  it("defaults to verify.dekimu.com when no base URL is given", async () => {
    const { fetch, urls } = fetchReturning(200, verifierReport());
    await reverifyAction(ARGS, { fetch });
    expect(urls[0]).toBe("https://verify.dekimu.com/api/v/ar.action.v1%3A01ABC");
  });
});
