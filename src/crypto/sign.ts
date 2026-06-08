import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

// @noble/ed25519 v2 needs sha512 wired for sync use.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

export interface Keypair {
  privateKey: string; // hex
  publicKey: string;  // hex
}

export function generateKeypair(): Keypair {
  const priv = ed.utils.randomPrivateKey();
  const pub = ed.getPublicKey(priv);
  return { privateKey: bytesToHex(priv), publicKey: bytesToHex(pub) };
}

export function sign(message: string, privateKeyHex: string): string {
  return bytesToHex(ed.sign(utf8ToBytes(message), hexToBytes(privateKeyHex)));
}

export function verify(message: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    return ed.verify(hexToBytes(signatureHex), utf8ToBytes(message), hexToBytes(publicKeyHex));
  } catch {
    return false; // malformed signature/key must never throw into callers
  }
}

export function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)));
}

export function fingerprint(publicKeyHex: string): string {
  return sha256Hex(publicKeyHex).slice(0, 16);
}
