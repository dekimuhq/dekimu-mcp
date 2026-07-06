/**
 * anchors-vc — OPTIONAL W3C Verifiable Credential carrier for anchored receipts.
 *
 * A sealed `ar.action.v1` envelope can be wrapped as a VC so a VC-native consumer
 * (e.g. an audit pipeline) can ingest it, while the embedded envelope stays the
 * cryptographic root of trust. The carrier is a SEPARATE optional package: it is
 * NEVER a static import here — it is loaded dynamically at runtime, so the
 * published server installs and runs standalone with zero extra dependency.
 * When the carrier is absent, wrapping degrades gracefully to a documented skip.
 *
 * The module specifier is overridable via `DEKIMU_ANCHORS_VC_MODULE`; the default
 * targets the published anchored-receipts VC carrier. Loading is `import(spec)`
 * with a runtime specifier — no static `@dekimuhq/*` import / require (the
 * no-private-dependency firewall is preserved).
 */
import { canonicalize } from "../crypto/canonicalize.js";

/** The slice of the carrier's API this bridge uses. */
export interface AnchorsVcModule {
  toVerifiableCredential: (envelope: unknown, opts?: unknown) => unknown;
  extractEnvelope: (vc: unknown) => unknown;
}

const DEFAULT_MODULE = "@dekimuhq/anchors-vc";

/** Resolve the configured carrier module specifier (env override, else default). */
export function vcModuleSpecifier(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.DEKIMU_ANCHORS_VC_MODULE;
  return v && v.length > 0 ? v : DEFAULT_MODULE;
}

/**
 * Dynamically load the optional VC carrier. Returns `null` (never throws) when the
 * package is not installed or does not expose the expected surface.
 */
export async function loadAnchorsVc(spec: string = vcModuleSpecifier()): Promise<AnchorsVcModule | null> {
  let mod: Partial<AnchorsVcModule>;
  try {
    mod = (await import(spec)) as Partial<AnchorsVcModule>;
  } catch {
    return null; // not installed / not resolvable — graceful.
  }
  if (typeof mod.toVerifiableCredential !== "function" || typeof mod.extractEnvelope !== "function") {
    return null;
  }
  return mod as AnchorsVcModule;
}

export interface WrapDeps {
  /** Inject an already-loaded carrier (tests); else it is loaded dynamically. */
  vcModule?: AnchorsVcModule;
}

export type WrapResult = { ok: true; vc: unknown } | { ok: false; reason: string };

/**
 * Wrap a sealed anchored envelope as a VC. Fail-safe + never-throwing: a missing
 * carrier, a throwing carrier, or a broken round-trip all return `{ ok:false }`
 * with a reason — the anchored envelope itself is unaffected.
 *
 * Integrity guard: the carrier MUST round-trip byte-equal
 * (`extractEnvelope(toVerifiableCredential(e))` canonicalizes equal to `e`); a
 * mismatch is rejected so a lossy/incompatible carrier can never silently ship a
 * VC that no longer carries the exact receipt.
 */
export async function wrapAsVc(envelope: unknown, deps: WrapDeps = {}): Promise<WrapResult> {
  const mod = deps.vcModule ?? (await loadAnchorsVc());
  if (!mod) {
    return {
      ok: false,
      reason:
        "VC wrapping unavailable: the optional W3C-VC carrier is not installed " +
        "(install it, or set DEKIMU_ANCHORS_VC_MODULE to its specifier). The anchored receipt is still valid.",
    };
  }
  try {
    const vc = mod.toVerifiableCredential(envelope);
    const roundTripped = mod.extractEnvelope(vc);
    if (canonicalize(roundTripped) !== canonicalize(envelope)) {
      return { ok: false, reason: "VC round-trip mismatch: extractEnvelope(toVerifiableCredential(e)) is not byte-equal to e." };
    }
    return { ok: true, vc };
  } catch (e) {
    return { ok: false, reason: `VC wrapping failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
