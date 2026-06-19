/**
 * operate (online acting path) — offline tests.
 *
 * The crux test ties buildProof() back to the PROVEN conformance vector: a PoP built
 * from the baseline vector's signed fields + the TEST seed must equal the vector's
 * recorded signature. If the door accepts the vector (proven in pop-conformance.test),
 * and operate reproduces the vector's signature, then operate signs door-acceptably.
 *
 * Door I/O is exercised with an injected FetchLike — no network.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

import { buildProof, loadConfig, operate, type FetchLike, type OperateConfig } from "../src/operate/operate.js";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const TEST_SEED_HEX = "09".repeat(32);
const AGENT_PUBKEY_B64U = Buffer.from(ed.getPublicKey(Buffer.from(TEST_SEED_HEX, "hex"))).toString("base64url");

interface PoPVector {
  name: string;
  payload: { jti: string; ts: number; capabilityId: string; workspaceId: string; agentId: string; input: unknown };
  signature: string;
}
function loadBaselineVector(): PoPVector {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "..", "conformance", "pop-v0.1", "vectors.json"), "utf8");
  const suite = JSON.parse(raw) as { vectors: PoPVector[] };
  const v = suite.vectors.find((x) => x.name === "baseline-ascii");
  if (!v) throw new Error("baseline-ascii vector missing");
  return v;
}

const TEST_CREDENTIAL = {
  v: 1,
  credentialId: "cred_test_0001",
  workspaceId: "ws_conformance_0001",
  issuer: "hub",
  agentId: "agent_conformance_0001",
  agentPublicKey: AGENT_PUBKEY_B64U,
};

function configFor(): OperateConfig {
  return {
    credential: TEST_CREDENTIAL,
    terminalKeyHex: TEST_SEED_HEX,
    doorUrl: "https://door.test/api/agent/capabilities",
    verifyBaseUrl: "https://verify.test",
  };
}

describe("buildProof — reproduces the proven conformance vector signature", () => {
  it("baseline vector: built PoP signature equals the recorded vector signature", () => {
    const v = loadBaselineVector();
    const proof = buildProof(
      {
        jti: v.payload.jti,
        ts: v.payload.ts,
        capabilityId: v.payload.capabilityId,
        workspaceId: v.payload.workspaceId,
        agentId: v.payload.agentId,
        input: v.payload.input,
      },
      TEST_SEED_HEX,
    );
    expect(proof.sig).toBe(v.signature);
    expect(proof.jti).toBe(v.payload.jti);
    expect(proof.ts).toBe(v.payload.ts);
  });
});

describe("loadConfig — fail-closed validation", () => {
  const base = {
    DEKIMU_AGENT_CREDENTIAL: JSON.stringify(TEST_CREDENTIAL),
    DEKIMU_AGENT_TERMINAL_KEY: TEST_SEED_HEX,
  } as NodeJS.ProcessEnv;

  it("errors when the credential is absent", () => {
    expect(loadConfig({ DEKIMU_AGENT_TERMINAL_KEY: TEST_SEED_HEX })).toEqual({ error: expect.stringContaining("DEKIMU_AGENT_CREDENTIAL is not set") });
  });
  it("errors when the terminal key is absent", () => {
    expect(loadConfig({ DEKIMU_AGENT_CREDENTIAL: JSON.stringify(TEST_CREDENTIAL) })).toEqual({ error: expect.stringContaining("DEKIMU_AGENT_TERMINAL_KEY is not set") });
  });
  it("errors on a malformed terminal key", () => {
    expect(loadConfig({ ...base, DEKIMU_AGENT_TERMINAL_KEY: "nothex" })).toEqual({ error: expect.stringContaining("64 hex chars") });
  });
  it("errors on non-JSON credential", () => {
    expect(loadConfig({ ...base, DEKIMU_AGENT_CREDENTIAL: "{not json" })).toEqual({ error: expect.stringContaining("not valid JSON") });
  });
  it("errors when the terminal key does not own the credential public key", () => {
    const wrongCred = { ...TEST_CREDENTIAL, agentPublicKey: "AAAA" };
    expect(loadConfig({ ...base, DEKIMU_AGENT_CREDENTIAL: JSON.stringify(wrongCred) })).toEqual({ error: expect.stringContaining("does not match the credential's agentPublicKey") });
  });
  it("returns config with the default door URL when unset", () => {
    const cfg = loadConfig(base);
    expect("error" in cfg).toBe(false);
    if (!("error" in cfg)) {
      expect(cfg.doorUrl).toBe("https://app.dekimu.com/api/agent/capabilities");
      expect(cfg.verifyBaseUrl).toBe("https://verify.dekimu.com");
      expect(cfg.credential.workspaceId).toBe("ws_conformance_0001");
    }
  });
});

// Fake fetch that records each request and returns a scripted response. The door call is a
// POST; operate's post-action re-verification (#5) is a GET to the verifier — by default we
// answer that GET with 404 (→ verification {checked:false}, harmless to door-path assertions).
function fakeFetch(status: number, json: unknown): { fetch: FetchLike; calls: Array<{ url: string; method: string; body: unknown }> } {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === "GET") return { status: 404, json: async () => ({ error: "not found" }) };
    return { status, json: async () => json };
  };
  return { fetch, calls };
}

// Routes the door (POST) and verifier (GET) to separate scripted responses — for #5 tests.
function routedFetch(
  door: { status: number; json: unknown },
  verifier: { status: number; json: unknown },
): { fetch: FetchLike; calls: Array<{ url: string; method: string }> } {
  const calls: Array<{ url: string; method: string }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method });
    const r = init.method === "GET" ? verifier : door;
    return { status: r.status, json: async () => r.json };
  };
  return { fetch, calls };
}

function verifierReport(capability: string, credentialId: string | undefined = "cred_test_0001") {
  return {
    signature: { ok: true, issuerTrusted: true, trust_outcome: "valid_trusted" },
    envelope: {
      claim_type: "ar.action.v1",
      body: {
        ...(credentialId !== undefined ? { credential_id: credentialId } : {}),
        caveats_consumed: { data_scope: "ws_conformance_0001", spend_step: 1, capability },
      },
    },
  };
}

const FIXED_DEPS = { now: () => 1750000000, jti: () => "01J9Z8K7Q6R5S4T3U2V1W0X9YZ" };

describe("operate — request assembly + verdict mapping", () => {
  it("sends the exact door body: signed fields from credential, proof, no idempotencyKey", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true, output: { ran: true }, receiptId: "ar.action.v1:01ABC" });
    const res = await operate({ capability: "ropa.compile", input: { since: "2026-01-01" } }, configFor(), { fetch, ...FIXED_DEPS });

    expect(res.status).toBe("ok");
    expect(res.receiptId).toBe("ar.action.v1:01ABC");

    const body = calls[0]!.body as Record<string, unknown>;
    expect(body.capabilityId).toBe("ropa.compile");
    expect(body.workspaceId).toBe("ws_conformance_0001"); // from credential, not args
    expect(body.agentId).toBe("agent_conformance_0001");
    expect(body.credential).toMatchObject({ credentialId: "cred_test_0001" });
    expect(body).not.toHaveProperty("idempotencyKey"); // source-driven: door has no such field
    expect(body).not.toHaveProperty("spend"); // omitted when not provided
    const proof = body.proof as Record<string, unknown>;
    expect(proof).toHaveProperty("jti");
    expect(proof).toHaveProperty("ts");
    expect(typeof proof.sig).toBe("string");
  });

  it("includes spend only when provided", async () => {
    const { fetch, calls } = fakeFetch(200, { ok: true });
    await operate({ capability: "operator.draft-reminder", input: {}, spend: { currency: "EUR", amount: 5 } }, configFor(), { fetch, ...FIXED_DEPS });
    expect((calls[0]!.body as Record<string, unknown>).spend).toEqual({ currency: "EUR", amount: 5 });
  });

  it("maps 404 to door-disabled (fail-closed, non-throwing)", async () => {
    const { fetch } = fakeFetch(404, { error: "Not found" });
    const res = await operate({ capability: "gdpr.scan", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("door-disabled");
    expect(res.detail).toContain("not enabled");
  });

  it("maps 202 to checkpoint with tier", async () => {
    const { fetch } = fakeFetch(202, { ok: false, status: "checkpoint", tier: "high", detail: "needs approval" });
    const res = await operate({ capability: "erasure.execute", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("checkpoint");
    expect(res.tier).toBe("high");
  });

  it("maps 403 to denied with stage + reason", async () => {
    const { fetch } = fakeFetch(403, { ok: false, status: "denied", stage: "mandate", reason: "scope mismatch" });
    const res = await operate({ capability: "ropa.compile", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("denied");
    expect(res.stage).toBe("mandate");
    expect(res.reason).toBe("scope mismatch");
  });

  it("maps a thrown fetch to a non-throwing error result", async () => {
    const fetch: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const res = await operate({ capability: "gdpr.scan", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("error");
    expect(res.error).toContain("door unreachable");
  });
});

describe("operate — post-action re-verification (#5)", () => {
  it("attaches a matching verification when the public verifier confirms the receipt", async () => {
    const { fetch, calls } = routedFetch(
      { status: 200, json: { ok: true, output: { ran: true }, receiptId: "ar.action.v1:01ABC" } },
      { status: 200, json: verifierReport("ropa.compile") },
    );
    const res = await operate({ capability: "ropa.compile", input: { since: "2026-01-01" } }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("ok");
    expect(res.verification?.checked).toBe(true);
    expect(res.verification?.match).toBe(true);
    // door POST then verifier GET to the configured base URL.
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
    expect(calls[1]!.url).toBe("https://verify.test/api/v/ar.action.v1%3A01ABC");
  });

  it("keeps status ok but flags a non-matching verification (capability bait-and-switch)", async () => {
    const { fetch } = routedFetch(
      { status: 200, json: { ok: true, receiptId: "ar.action.v1:01ABC" } },
      { status: 200, json: verifierReport("erasure.execute") }, // receipt records a DIFFERENT verb
    );
    const res = await operate({ capability: "ropa.compile", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("ok");
    expect(res.verification?.match).toBe(false);
    expect(res.verification?.reason).toContain("capability mismatch");
  });

  it("skips re-verification (no second call) when the door returns no receiptId", async () => {
    const { fetch, calls } = routedFetch(
      { status: 200, json: { ok: true } }, // no receiptId
      { status: 200, json: verifierReport("ropa.compile") },
    );
    const res = await operate({ capability: "ropa.compile", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("ok");
    expect(res.verification).toBeUndefined();
    expect(calls.map((c) => c.method)).toEqual(["POST"]);
  });

  it("surfaces verification {checked:false} when the receipt is not yet on the verifier", async () => {
    const { fetch } = routedFetch(
      { status: 200, json: { ok: true, receiptId: "ar.action.v1:01ABC" } },
      { status: 404, json: { error: "not found" } },
    );
    const res = await operate({ capability: "ropa.compile", input: {} }, configFor(), { fetch, ...FIXED_DEPS });
    expect(res.status).toBe("ok");
    expect(res.verification?.checked).toBe(false);
  });
});
