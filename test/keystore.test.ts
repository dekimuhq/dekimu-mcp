import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateKeypair } from "../src/crypto/keystore.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "dekimu-mcp-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("keystore", () => {
  it("creates a keypair on first load and reuses it after", () => {
    const a = loadOrCreateKeypair(dir);
    const b = loadOrCreateKeypair(dir);
    expect(a.publicKey).toBe(b.publicKey);
  });
  it("throws (does not silently regenerate) on a corrupt key file", () => {
    loadOrCreateKeypair(dir);
    writeFileSync(join(dir, "key.json"), "not json");
    expect(() => loadOrCreateKeypair(dir)).toThrow();
  });
  it("throws on valid JSON that is not a keypair (null, wrong type, bad length, non-hex)", () => {
    for (const bad of [
      "null",
      '"a string"',
      JSON.stringify({ privateKey: "abc", publicKey: "def" }),
      JSON.stringify({ privateKey: "z".repeat(64), publicKey: "z".repeat(64) }),
      JSON.stringify({ privateKey: 42, publicKey: 42 }),
    ]) {
      writeFileSync(join(dir, "key.json"), bad);
      expect(() => loadOrCreateKeypair(dir)).toThrow(/does not contain valid hex/);
    }
  });
  it("normalizes uppercase hex keys to lowercase (receipt schema pins lowercase)", () => {
    const kp = loadOrCreateKeypair(dir);
    writeFileSync(
      join(dir, "key.json"),
      JSON.stringify({ privateKey: kp.privateKey.toUpperCase(), publicKey: kp.publicKey.toUpperCase() })
    );
    const reloaded = loadOrCreateKeypair(dir);
    expect(reloaded.privateKey).toBe(kp.privateKey);
    expect(reloaded.publicKey).toBe(kp.publicKey);
  });
});
