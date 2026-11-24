import "@testing-library/jest-dom/vitest";

// jsdom 에는 ResizeObserver 가 없다 (SEED 버튼이 쓴다). 크기는 테스트하지 않으므로 빈 구현.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
