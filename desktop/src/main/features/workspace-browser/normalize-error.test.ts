import { describe, expect, it } from "vitest";

import {
  hostnameForBrowserUrl,
  normalizeWorkspaceBrowserLoadFailure,
  normalizeWorkspaceBrowserNavigateFailure,
  sanitizeBrowserUrl,
  workspaceBrowserErrorCodeForNetError,
} from "./normalize-error";

describe("normalizeWorkspaceBrowserLoadFailure", () => {
  it("ignores subframe failures", () => {
    expect(
      normalizeWorkspaceBrowserLoadFailure({
        errorCode: -105,
        errorDescription: "ERR_NAME_NOT_RESOLVED",
        isMainFrame: false,
        validatedURL: "https://docs.example.test/",
      }),
    ).toBeNull();
  });

  it("ignores aborted navigations", () => {
    expect(
      normalizeWorkspaceBrowserLoadFailure({
        errorCode: -3,
        errorDescription: "ERR_ABORTED",
        isMainFrame: true,
        validatedURL: "https://docs.example.test/",
      }),
    ).toBeNull();
  });

  it("maps offline-class net errors without raw Electron strings", () => {
    expect(
      normalizeWorkspaceBrowserLoadFailure({
        errorCode: -105,
        errorDescription: "ERR_NAME_NOT_RESOLVED",
        isMainFrame: true,
        validatedURL: "https://docs.example.test/path",
      }),
    ).toEqual({
      code: "offline",
      detail: "docs.example.test",
      url: "https://docs.example.test/path",
    });
  });

  it("maps generic navigation failures", () => {
    expect(
      normalizeWorkspaceBrowserLoadFailure({
        errorCode: -2,
        errorDescription: "ERR_FAILED",
        isMainFrame: true,
        validatedURL: "https://example.com/",
      }),
    ).toEqual({
      code: "navigation_failed",
      detail: "example.com",
      url: "https://example.com/",
    });
  });
});

describe("normalizeWorkspaceBrowserNavigateFailure", () => {
  it("maps unsupported protocol throws", () => {
    expect(
      normalizeWorkspaceBrowserNavigateFailure(
        new Error("Workspace browser only supports http(s) URLs."),
        "file:///tmp/x",
      ),
    ).toEqual({
      code: "unsupported_url",
      url: undefined,
    });
  });

  it("never forwards stack traces or raw host wire text", () => {
    const error = new Error("Error: ERR_FAILED (-2) loading 'https://x'");
    error.stack = "Error: ERR_FAILED\n    at WebContents.loadURL";
    expect(
      normalizeWorkspaceBrowserNavigateFailure(error, "https://x.test/"),
    ).toEqual({
      code: "navigation_failed",
      detail: "x.test",
      url: "https://x.test/",
    });
  });
});

describe("workspaceBrowserErrorCodeForNetError", () => {
  it("classifies connection refused as offline", () => {
    expect(workspaceBrowserErrorCodeForNetError(-102)).toBe("offline");
  });

  it("classifies unknown positive codes as unknown", () => {
    expect(workspaceBrowserErrorCodeForNetError(0)).toBe("unknown");
  });
});

describe("sanitizeBrowserUrl", () => {
  it("keeps only http(s) urls", () => {
    expect(sanitizeBrowserUrl("https://ok.test/a")).toBe("https://ok.test/a");
    expect(sanitizeBrowserUrl("about:blank")).toBeUndefined();
    expect(sanitizeBrowserUrl("file:///etc/passwd")).toBeUndefined();
  });

  it("extracts hostnames safely", () => {
    expect(hostnameForBrowserUrl("https://docs.example.test/x")).toBe(
      "docs.example.test",
    );
    expect(hostnameForBrowserUrl("not a url")).toBeUndefined();
  });
});
