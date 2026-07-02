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
    // Validate shape strictly: a truthy-but-malformed key (null file, wrong type,
    // wrong length, non-hex) would otherwise surface later as an opaque
    // hexToBytes/sign error — or a TypeError on property access when parsed is null.
    const isHex64 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
    const kp = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Partial<Keypair>;
    if (!isHex64(kp.privateKey) || !isHex64(kp.publicKey)) {
      throw new Error(
        `dekimu-mcp keystore: ${path} does not contain valid hex ed25519 keys. Refusing to regenerate ` +
          `(would orphan prior receipts). Move it aside manually to mint a fresh key.`
      );
    }
    // Normalize to lowercase: ActionReceiptSchema pins lowercase hex, so an
    // uppercase key file would mint receipts that fail their own structure check.
    return { privateKey: kp.privateKey.toLowerCase(), publicKey: kp.publicKey.toLowerCase() };
  }
  // 0o700: the directory holds a private key — don't rely on the file mode alone.
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const kp = generateKeypair();
  writeFileSync(path, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}
