import type { WebContents } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DesignModeBrowserView,
  WorkspaceBrowserDesignModeService,
  parseDesignGuestEvent,
} from "./design-mode";

vi.mock("electron", () => ({
  ipcMain: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

function createMockWebContents(url: string, id = 1) {
  return {
    getURL: () => url,
    id,
    isDestroyed: () => false,
    send: vi.fn(),
  } as unknown as WebContents & { send: ReturnType<typeof vi.fn> };
}

describe("WorkspaceBrowserDesignModeService", () => {
  const sendToAllWindows = vi.fn();
  let views: Map<string, DesignModeBrowserView>;
  let service: WorkspaceBrowserDesignModeService;

  beforeEach(() => {
    sendToAllWindows.mockReset();
    views = new Map();
    service = new WorkspaceBrowserDesignModeService(
      (browserViewId) => views.get(browserViewId),
      { sendToAllWindows },
    );
    service.register();
  });

  it("denies start on non-allowlisted origin", () => {
    const webContents = createMockWebContents("https://example.com/");
    views.set("view-1", { browserViewId: "view-1", webContents });

    const result = service.start("view-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("origin-not-allowed");
    }
    expect(webContents.send).not.toHaveBeenCalled();
    expect(sendToAllWindows).toHaveBeenCalledWith(
      "workspace-browser:design:event:view-1",
      expect.objectContaining({
        code: "origin-not-allowed",
        type: "error",
      }),
    );
  });

  it("starts and stops on localhost and tears down guest on stop", () => {
    const webContents = createMockWebContents("http://localhost:5173/");
    views.set("view-1", { browserViewId: "view-1", webContents });

    const started = service.start("view-1");
    expect(started.ok).toBe(true);
    expect(webContents.send).toHaveBeenCalledWith(
      "workspace-browser:design:guest-command",
      { outputDetail: "standard", type: "start" },
    );

    const stopped = service.stop("view-1");
    expect(stopped.active).toBe(false);
    expect(webContents.send).toHaveBeenCalledWith(
      "workspace-browser:design:guest-command",
      { type: "stop" },
    );
  });

  it("forwards outputDetail on start and updates it while active", () => {
    const webContents = createMockWebContents("http://localhost:5173/");
    views.set("view-1", { browserViewId: "view-1", webContents });

    service.start("view-1", "compact");
    expect(webContents.send).toHaveBeenCalledWith(
      "workspace-browser:design:guest-command",
      { outputDetail: "compact", type: "start" },
    );

    webContents.send.mockClear();
    service.start("view-1", "detailed");
    expect(webContents.send).toHaveBeenCalledWith(
      "workspace-browser:design:guest-command",
      { outputDetail: "detailed", type: "setOutputDetail" },
    );
  });

  it("forwards selection events with trusted origin stamp", () => {
    const webContents = createMockWebContents("http://localhost:5173/app");
    views.set("view-1", { browserViewId: "view-1", webContents });
    service.start("view-1");
    sendToAllWindows.mockClear();

    (
      service as unknown as {
        handleGuestEvent: (sender: unknown, payload: unknown) => void;
      }
    ).handleGuestEvent(webContents, {
      anchor: {
        kind: "element",
        rect: { height: 20, width: 40, x: 1, y: 2 },
        selector: "button.primary",
      },
      element: {
        rect: { height: 20, width: 40, x: 1, y: 2 },
        selector: "button.primary",
        tagName: "button",
        reactComponents: ["PricingCard", "Button"],
      },
      type: "selection",
    });

    expect(sendToAllWindows).toHaveBeenCalledWith(
      "workspace-browser:design:event:view-1",
      expect.objectContaining({
        browserViewId: "view-1",
        origin: "http://localhost:5173",
        type: "selection",
        element: expect.objectContaining({
          selector: "button.primary",
          reactComponents: ["PricingCard", "Button"],
        }),
      }),
    );
  });

  it("accepts extra registered preview origins", () => {
    const webContents = createMockWebContents("http://192.168.1.20:3000/app");
    views.set("view-1", { browserViewId: "view-1", webContents });

    service.setAllowedOrigins({
      browserViewId: "view-1",
      origins: ["http://192.168.1.20:3000"],
    });

    const result = service.start("view-1");
    expect(result.ok).toBe(true);
    expect(webContents.send).toHaveBeenCalled();
  });

  it("drops guest events when design mode is inactive or origin is forged off-list", () => {
    const webContents = createMockWebContents("https://evil.example/");
    views.set("view-1", { browserViewId: "view-1", webContents });
    // Session exists only after setAllowedOrigins / start attempt.
    service.setAllowedOrigins({ browserViewId: "view-1", origins: [] });

    // Simulate guest forging a started event while inactive / disallowed.
    (
      service as unknown as {
        handleGuestEvent: (sender: unknown, payload: unknown) => void;
      }
    ).handleGuestEvent(webContents, { type: "started" });

    expect(sendToAllWindows).not.toHaveBeenCalled();
  });

  it("stamps trusted origin on guest lifecycle events when active", () => {
    const webContents = createMockWebContents("http://localhost:4173/preview");
    views.set("view-1", { browserViewId: "view-1", webContents });
    service.start("view-1");
    sendToAllWindows.mockClear();

    (
      service as unknown as {
        handleGuestEvent: (sender: unknown, payload: unknown) => void;
      }
    ).handleGuestEvent(webContents, { type: "started" });

    expect(sendToAllWindows).toHaveBeenCalledWith(
      "workspace-browser:design:event:view-1",
      {
        browserViewId: "view-1",
        origin: "http://localhost:4173",
        type: "started",
      },
    );
  });
});

describe("parseDesignGuestEvent", () => {
  it("accepts lifecycle events and rejects garbage", () => {
    expect(parseDesignGuestEvent({ type: "started" })).toEqual({
      type: "started",
    });
    expect(parseDesignGuestEvent({ type: "stopped" })).toEqual({
      type: "stopped",
    });
    expect(parseDesignGuestEvent(null)).toBeNull();
    expect(parseDesignGuestEvent({ type: "sendPrompt" })).toBeNull();
  });

  it("accepts element/region selection and rejects reserved text/point", () => {
    expect(
      parseDesignGuestEvent({
        type: "selection",
        anchor: {
          kind: "region",
          rect: { x: 0, y: 0, width: 10, height: 10 },
        },
      }),
    ).not.toBeNull();
    expect(
      parseDesignGuestEvent({
        type: "selection",
        anchor: {
          kind: "text",
          rect: { x: 0, y: 0, width: 1, height: 1 },
          text: "x",
        },
      }),
    ).toBeNull();
    expect(
      parseDesignGuestEvent({
        type: "selection",
        anchor: { kind: "point", x: 1, y: 2 },
      }),
    ).toBeNull();
  });
});
