import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateKeypair, type Keypair } from "./sign.js";

export function defaultKeyDir(): string {
  return join(homedir(), ".dekimu-mcp");
}

export function loadOrCreateKeypair(dir: string = defaultKeyDir()): Keypair {
  const path = join(dir, "key.json");
  if (existsSync(path)) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (e) {
      throw new Error(`dekimu-mcp keystore: cannot read ${path}: ${(e as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `dekimu-mcp keystore: ${path} is corrupt. Refusing to regenerate (would orphan prior receipts). ` +
          `Move it aside manually to mint a fresh key.`
      );
    }
    const kp = parsed as Keypair;
    if (!kp.privateKey || !kp.publicKey) {
      throw new Error(`dekimu-mcp keystore: ${path} missing keys. Refusing to regenerate.`);
    }
    return kp;
  }
  mkdirSync(dir, { recursive: true });
  const kp = generateKeypair();
  writeFileSync(path, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}
