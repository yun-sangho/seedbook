import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { uuidv5 } from "./uuid-v5";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** node:crypto 로 만든 기준값 (테스트에서만). */
function referenceUuidv5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replace(/-/g, ""), "hex"))
    .update(name, "utf8")
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("uuidv5", () => {
  it("matches the RFC 9562 example for www.example.com in the DNS namespace", () => {
    expect(uuidv5(DNS_NAMESPACE, "www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it.each([
    "",
    "2026-11-28",
    "한글 이름 🌱",
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(64),
    "y".repeat(1000),
  ])("matches node:crypto for %j", (name) => {
    expect(uuidv5(DNS_NAMESPACE, name)).toBe(referenceUuidv5(DNS_NAMESPACE, name));
  });

  it("rejects a namespace that is not a uuid", () => {
    expect(() => uuidv5("not-a-uuid", "x")).toThrow();
  });
});
