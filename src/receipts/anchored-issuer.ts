/**
 * anchored-issuer — dynamic, env-gated loader for the anchored signing/anchoring
 * adapter (the `AnchoredIssuer` port from anchored.ts).
 *
 * The trusted-issuer keys + anchoring pipeline are NOT part of this standalone
 * server — that is exactly what the local self-signed mode exists to avoid. So the
 * anchored issuer is provided out-of-band: set `DEKIMU_ANCHORED_ISSUER_MODULE` to
 * a module that exports either a named `createAnchoredIssuer()` factory or a
 * default-export factory returning an `AnchoredIssuer`. It is loaded via
 * `import(spec)` with a runtime specifier — no static import, no bundled private
 * dependency, and no adapter name in this repo.
 *
 * When the variable is unset or the module can't be loaded, this returns `null`
 * and the caller falls back to the local self-signed receipt (graceful degrade).
 */
import type { AnchoredIssuer } from "./anchored.js";

type IssuerFactory = () => AnchoredIssuer | Promise<AnchoredIssuer>;

interface IssuerModule {
  createAnchoredIssuer?: IssuerFactory;
  default?: IssuerFactory | AnchoredIssuer;
}

function isIssuer(v: unknown): v is AnchoredIssuer {
  return typeof v === "object" && v !== null && typeof (v as AnchoredIssuer).sealAction === "function";
}

/**
 * Load the configured anchored issuer, or `null` when none is configured / it
 * fails to load / it does not expose the port. Never throws.
 */
export async function loadAnchoredIssuer(
  spec: string | undefined = process.env.DEKIMU_ANCHORED_ISSUER_MODULE,
): Promise<AnchoredIssuer | null> {
  if (!spec || spec.length === 0) return null;

  let mod: IssuerModule;
  try {
    mod = (await import(spec)) as IssuerModule;
  } catch {
    return null;
  }

  const factory: IssuerFactory | undefined =
    typeof mod.createAnchoredIssuer === "function"
      ? mod.createAnchoredIssuer
      : typeof mod.default === "function"
        ? (mod.default as IssuerFactory)
        : undefined;

  try {
    if (factory) {
      const issuer = await factory();
      return isIssuer(issuer) ? issuer : null;
    }
    // A module may export a ready-made issuer object as its default.
    return isIssuer(mod.default) ? mod.default : null;
  } catch {
    return null;
  }
}
