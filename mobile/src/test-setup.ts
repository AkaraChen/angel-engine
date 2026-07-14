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

// jsdom does not always expose a working localStorage (depends on the document
// origin); provide an in-memory implementation so storage-backed code can run.
function hasWorkingLocalStorage(): boolean {
  try {
    return typeof window.localStorage?.setItem === "function";
  } catch {
    return false;
  }
}

if (!hasWorkingLocalStorage()) {
  const store = new Map<string, string>();
  const storage: Storage = {
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
}

// Initialize the i18n singleton once (after the localStorage/navigator stubs
// above are in place) so component tests that render a sub-tree without the
// App-level I18nextProvider still resolve real translation strings.
await import("@/i18n");

export {};
