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
});
