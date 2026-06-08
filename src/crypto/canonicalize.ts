// RFC-8785 JSON Canonicalization Scheme (vendored, MIT).
// Matches the canonicalize step used by verify.dekimu.com so receipts interop.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
  }
  if (typeof value === "object") {
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
