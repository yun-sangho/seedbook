/**
 * 기기 레코드 저장의 정규 직렬화 (설계 §5.7.1). 같은 값은 언제나 같은 문자열이 되어 체크섬을
 * 비교할 수 있다.
 *
 * - 객체 키를 정렬한다.
 * - `JSON.stringify` 가 조용히 바꾸거나 빼는 값은 **예외로 던진다**: `NaN`·`Infinity` (→ `null`),
 *   `undefined`·함수·심볼 (→ 빠짐), `Date`·`Map` 같은 일반 객체가 아닌 값, `bigint`.
 *   `SYNC_AUDIT` 손실 경로 1 이 `NaN` → `null` 이었다.
 * - `-0` 은 `0` 으로 쓴다 (JSON 에 `-0` 이 없다. 다시 읽으면 `0`).
 */

export class CanonicalJsonError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(`canonical JSON: ${reason} at ${path || "(root)"}`);
    this.name = "CanonicalJsonError";
  }
}

export function canonicalStringify(value: unknown): string {
  return write(value, "");
}

function write(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalJsonError(path, `non-finite number ${value}`);
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value.map((item, i) => write(item, `${path}[${i}]`)).join(",")}]`;
      }
      if (!isPlainObject(value)) throw new CanonicalJsonError(path, "not a plain object");
      return `{${Object.keys(value)
        .sort()
        .map((key) => {
          const child = (value as Record<string, unknown>)[key];
          return `${JSON.stringify(key)}:${write(child, path ? `${path}.${key}` : key)}`;
        })
        .join(",")}}`;
    default:
      throw new CanonicalJsonError(path, `unsupported ${typeof value}`);
  }
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** JSON 값 두 개가 같은지 (키 순서 무관). 왕복 확인에 쓴다. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (key) =>
      Object.hasOwn(b, key) &&
      jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

/**
 * 정규 문자열의 SHA-256 (hex 64자). 손상 감지용이라 보안 목적은 아니다. WebCrypto 라 의존성이
 * 없고 iOS·Android WebView 에서 동작을 확인했다 (설계 §5.7.6).
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
