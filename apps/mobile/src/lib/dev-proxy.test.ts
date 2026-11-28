import { describe, expect, it } from "vitest";
import { devProxyRoutes, isVitePath } from "./dev-proxy.ts";

const API = "http://localhost:4012";

/** Vite 의 proxy 키 해석과 같다: `^` 로 시작하면 정규식, 아니면 prefix. */
function matches(key: string, url: string): boolean {
  return key.startsWith("^") ? new RegExp(key).test(url) : url.startsWith(key);
}

/** Vite 는 websocket upgrade 를 `ws: true` 인 규칙 중 처음 맞는 것으로만 넘긴다. */
function websocketTarget(url: string): string | null {
  for (const [key, options] of Object.entries(devProxyRoutes(API))) {
    if (matches(key, url) && options.ws) return options.target;
  }
  return null;
}

/** 일반 요청은 처음 맞는 규칙이 받는다. */
function httpTarget(url: string): string | null {
  for (const [key, options] of Object.entries(devProxyRoutes(API))) {
    if (matches(key, url)) return options.target;
  }
  return null;
}

describe("devProxyRoutes", () => {
  it("Next 16 (Turbopack) dev HMR websocket(/_next/hmr)을 Next 로 넘긴다", () => {
    expect(websocketTarget("/_next/hmr?id=CjIIgN9rzsIxeuD7d2Wsh")).toBe(API);
  });

  it("webpack dev HMR websocket(/_next/webpack-hmr)도 Next 로 넘긴다", () => {
    expect(websocketTarget("/_next/webpack-hmr?id=abc")).toBe(API);
  });

  it("Vite 자기 HMR websocket(/)은 넘기지 않는다", () => {
    expect(websocketTarget("/?token=abc")).toBeNull();
  });

  it("Next 페이지·청크·API 를 Next 로 넘긴다", () => {
    expect(httpTarget("/dev/plant-preview")).toBe(API);
    expect(httpTarget("/_next/static/chunks/0zix_%40swc_helpers_cjs_0hi-e474n4mns._.js")).toBe(API);
    expect(httpTarget("/api/auth/callback/kakao?code=x")).toBe(API);
    expect(httpTarget("/")).toBe(API);
  });

  it("Vite 가 직접 답하는 경로는 넘기지 않는다", () => {
    expect(httpTarget("/@vite/client")).toBeNull();
    expect(httpTarget("/src/main.tsx")).toBeNull();
    expect(httpTarget("/node_modules/.vite/deps/react.js")).toBeNull();
    expect(httpTarget("/index.html")).toBeNull();
  });
});

describe("isVitePath", () => {
  it("Vite 모듈·번들 경로를 가른다", () => {
    expect(isVitePath("/@react-refresh")).toBe(true);
    expect(isVitePath("/_app/index.js")).toBe(true);
    expect(isVitePath("/assets/investments")).toBe(false);
    expect(isVitePath("/_next/hmr")).toBe(false);
  });
});
