import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * 全局测试环境补充：happy-dom 未实现、而 antd / ProComponents 会直接调用的浏览器 API。
 *
 * 只补**渲染必需**的最小面；如果某个用例需要更完整的行为，优先在用例里局部打桩，
 * 不要把这里做成万能替身（否则测试会与真实浏览器行为越差越远）。
 */

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((key) => {
      delete store[key];
    });
  }),
};

globalThis.localStorage = localStorageMock as unknown as Storage;

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
