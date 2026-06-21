/**
 * PoP conformance — dekimu-mcp reproduces the capability-door Proof-of-Possession
 * signature byte-exactly using ONLY its own self-contained crypto.
 *
 * The vectors in conformance/pop-v0.1/vectors.json are known-answer tests generated
 * from the (private, un-importable) @dekimuhq/agent-capability canonicalize + signer.
 * dekimu-mcp may NOT import that package (CI guard check:no-private-dep), so it must
 * reproduce the canonical bytes + signature independently. If this test passes,
 * dekimu-mcp can sign door requests the live door will accept — the reproducible-
 * producer trap is closed. If it fails, the divergence is exactly what the vector
 * exists to surface.
 *
 * Note the two intentional encoding differences vs dekimu-mcp's receipt path:
 *   - the door PoP uses base64url signatures/keys; dekimu-mcp receipts use hex.
 *     The RAW ed25519 bytes are identical — we compare after normalising encoding.
 *   - dekimu-mcp.sign(message: string) UTF-8-encodes the canonical string; the door
 *     signs the UTF-8 bytes of the same string. UTF-8 round-trips, so they match.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import * as ed from "@noble/ed25519";
import { bytesToHex } from "@noble/hashes/utils";

import { canonicalize } from "../src/crypto/canonicalize.js";
// Importing sign wires ed.etc.sha512Sync as a side effect (see src/crypto/sign.ts).
import { sign } from "../src/crypto/sign.js";

// The vector's TEST-ONLY agent key: 32 bytes of 0x09 (seedHex in vectors.json).
const TEST_SEED_HEX = "09".repeat(32);

interface PoPVector {
  name: string;
  payload: unknown;
  canonicalString: string;
  canonicalBytesHex: string;
  signature: string; // base64url
  roundTrips: boolean;
}
interface PoPSuite {
  testKey: { seedHex: string; agentPublicKey: string };
  vectors: PoPVector[];
}

function loadSuite(): PoPSuite {
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "..", "conformance", "pop-v0.1", "vectors.json"), "utf8");
  return JSON.parse(raw) as PoPSuite;
}

const b64uToHex = (s: string): string => Buffer.from(s, "base64url").toString("hex");

describe("PoP conformance — dekimu-mcp reproduces the door vectors independently", () => {
  const suite = loadSuite();

  it("the suite uses the all-0x09 TEST seed this test reproduces from", () => {
    expect(suite.testKey.seedHex).toBe(TEST_SEED_HEX);
  });

  it("derives the vector's agent public key from the test seed", () => {
    const pubHex = bytesToHex(ed.getPublicKey(Buffer.from(TEST_SEED_HEX, "hex")));
    expect(pubHex).toBe(b64uToHex(suite.testKey.agentPublicKey));
  });

  for (const v of suite.vectors) {
    describe(`vector: ${v.name}`, () => {
      it("canonicalizes the payload to the exact vector bytes", () => {
        const c = canonicalize(v.payload);
        expect(c).toBe(v.canonicalString);
        expect(Buffer.from(c, "utf8").toString("hex")).toBe(v.canonicalBytesHex);
      });

      it("produces the exact vector signature (raw ed25519 bytes, encoding-normalised)", () => {
        const sigHex = sign(v.canonicalString, TEST_SEED_HEX);
        expect(sigHex).toBe(b64uToHex(v.signature));
      });
    });
  }
});
