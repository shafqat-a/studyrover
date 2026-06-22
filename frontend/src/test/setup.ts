// Global test setup for Vitest + React Testing Library.
//
// Loaded via `setupFiles` in vitest.config.ts before every test file. It:
//   - registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
//   - unmounts React trees after each test to avoid cross-test leakage
//   - stubs browser APIs jsdom does not implement (matchMedia, ResizeObserver,
//     IntersectionObserver) that UI components commonly touch.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom lacks matchMedia; provide a no-op implementation so components that read
// media queries (responsive hooks, theme toggles) render without throwing.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}

// jsdom lacks ResizeObserver; many layout/measuring components instantiate one.
// Use vi.stubGlobal so we don't trip TS narrowing window to `never`.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// jsdom lacks IntersectionObserver; lazy/visibility components rely on it.
class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
