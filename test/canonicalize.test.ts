import { describe, it, expect } from "vitest";
import { canonicalize } from "../src/crypto/canonicalize.js";

describe("canonicalize (RFC-8785 JCS)", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it("is recursive and stable", () => {
    expect(canonicalize({ z: { y: 2, x: 1 }, a: [3, 2, 1] })).toBe('{"a":[3,2,1],"z":{"x":1,"y":2}}');
  });
  it("emits no insignificant whitespace", () => {
    expect(canonicalize({ a: "x" })).toBe('{"a":"x"}');
  });
  it("serializes integers without decimals", () => {
    expect(canonicalize({ n: 42 })).toBe('{"n":42}');
  });
});
