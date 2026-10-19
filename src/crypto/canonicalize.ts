// RFC-8785 JSON Canonicalization Scheme (vendored, MIT).
// Intended to match the RFC-8785 canonical form verify.dekimu.com uses. This
// server's own output is pinned by the recorded fixture in
// test/conformance.test.ts (offline); the opt-in LIVE_VERIFIER=1 gate there asks
// the public verifier about that fixture (network).
export function canonicalize(value: unknown): string {
  if (typeof value === "number") {
    // RFC-8785 §3.2.2.3 forbids NaN/Infinity. JSON.stringify would silently emit
    // "null", signing a body that misrepresents the input — reject instead.
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number ${value} is not valid JSON`);
    }
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
    // Class instances with a custom toJSON (e.g. Date) would silently serialize as
    // their enumerable own keys (often `{}`), colliding distinct inputs. Reject —
    // the caller must pass plain JSON-shaped data.
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
      throw new Error("canonicalize: objects with a toJSON method are not supported (pass plain JSON data)");
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error(`canonicalize: unsupported value type ${typeof value}`);
}
