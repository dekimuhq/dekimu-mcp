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
  const { sigOk = true, claimType = "ar.action.v1", capability = "compliance.audit.run" } = over;
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

const ARGS = { receiptId: "ar.action.v1:01ABC", capability: "compliance.audit.run", expectedCredentialId: "cred_test_0001" };

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
    const r = await reverifyAction({ receiptId: ARGS.receiptId, capability: "compliance.audit.run" }, { fetch });
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

// ropa.compile mints a PROVENANCE receipt (ar.provenance.v1, body {kind, register}), not an
// AActR. Shape below mirrors verify.dekimu.com's live report for apr.v1:01M7R9AE7T9WCMD4PXRA000000
// (2026-11-18). Until then reverify demanded ar.action.v1 and reported a trusted, correct RoPA
// receipt as `match: false` — the loud integrity signal, raised on every ropa.compile call.
describe("reverifyAction — provenance receipts (ropa.compile)", () => {
  function aprReport(over: { claimType?: string; kind?: string; trustOutcome?: string; kid?: string } = {}) {
    const trustOutcome = over.trustOutcome ?? "valid_trusted";
    return {
      signature: {
        ok: true,
        issuerTrusted: trustOutcome === "valid_trusted",
        trust_outcome: trustOutcome,
        matchedKid: over.kid ?? "hub-ws_ops-2",
      },
      envelope: {
        claim_type: over.claimType ?? "ar.provenance.v1",
        body: { kind: over.kind ?? "ropa.register.v1", register: { activities: [] } },
      },
    };
  }
  const APR = { receiptId: "apr.v1:01M7", capability: "ropa.compile", expectedCredentialId: "cred_x", expectedWorkspaceId: "ws_ops" };

  it("matches a trusted provenance receipt of the right kind, and says it is not action-bound", async () => {
    const r = await reverifyAction(APR, fetchReturning(200, aprReport()));
    expect(r).toMatchObject({ checked: true, match: true, actionBound: false, workspaceKeyMatches: true, receiptBodyKind: "ropa.register.v1" });
    // capability/credential checks cannot run on this family — they are absent, not "false".
    expect(r.capabilityMatches).toBeUndefined();
    expect(r.credentialBound).toBeUndefined();
  });

  it("still refuses an untrusted issuer", async () => {
    const r = await reverifyAction(APR, fetchReturning(200, aprReport({ trustOutcome: "valid_untrusted" })));
    expect(r.match).toBe(false);
    expect(r.reason).toContain("not trusted");
  });

  it("refuses an AActR where a provenance receipt was expected", async () => {
    const r = await reverifyAction(APR, fetchReturning(200, aprReport({ claimType: "ar.action.v1" })));
    expect(r.match).toBe(false);
    expect(r.reason).toContain("expected ar.provenance.v1");
  });

  it("refuses a provenance receipt of a different kind", async () => {
    const r = await reverifyAction(APR, fetchReturning(200, aprReport({ kind: "dpia.report.v1" })));
    expect(r.match).toBe(false);
    expect(r.reason).toContain("unexpected body kind");
  });

  it("reports (never fails on) a key outside this workspace — the shared Hub key is still trusted", async () => {
    const r = await reverifyAction(APR, fetchReturning(200, aprReport({ kid: "hub-2026" })));
    expect(r).toMatchObject({ match: true, workspaceKeyMatches: false, issuerKid: "hub-2026" });
  });
});
