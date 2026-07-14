// jsdom lacks a few browser APIs that UI deps touch on mount. Provide minimal
// stubs so component render tests can run.

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (typeof window.ResizeObserver !== "function") {
  window.ResizeObserver = ObserverStub;
}

if (typeof window.IntersectionObserver !== "function") {
  window.IntersectionObserver =
    ObserverStub as unknown as typeof IntersectionObserver;
}

if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}
