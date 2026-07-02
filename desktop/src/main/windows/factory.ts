import type { BrowserWindowConstructorOptions } from "electron";

import path from "node:path";
import { pathToFileURL } from "node:url";
import is from "@sindresorhus/is";
import { BrowserWindow, shell } from "electron";

import {
  configureDesktopWindowAppearance,
  desktopWindowChromeOptions,
} from "./appearance";
import { configureDesktopWindowNotifications } from "./notifications";
import {
  persistWindowBounds,
  restoreWindowState,
  savedWindowBounds,
} from "./state";

interface CreateDesktopWindowOptions {
  bounds?: Parameters<typeof savedWindowBounds>[0];
  hash?: string;
  options?: BrowserWindowConstructorOptions;
  stateFileName?: string;
}

export function createDesktopWindow({
  bounds,
  hash,
  options,
  stateFileName,
}: CreateDesktopWindowOptions = {}) {
  const rendererFilePath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );
  const window = new BrowserWindow({
    ...desktopWindowChromeOptions(),
    ...savedWindowBounds(bounds),
    ...options,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      ...options?.webPreferences,
    },
  });

  configureDesktopWindowAppearance(window);
  restoreWindowState(window, stateFileName);
  persistWindowBounds(window, stateFileName);
  configureExternalLinkHandling(window, rendererFilePath);
  configureDesktopWindowNotifications(window);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = is.nonEmptyString(hash)
      ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#${hash.replace(/^#/, "")}`
      : MAIN_WINDOW_VITE_DEV_SERVER_URL;
    void window.loadURL(url);
  } else if (is.nonEmptyString(hash)) {
    void window.loadFile(rendererFilePath, { hash });
  } else {
    void window.loadFile(rendererFilePath);
  }

  return window;
}

function configureExternalLinkHandling(
  window: BrowserWindow,
  rendererFilePath: string,
) {
  window.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigationUrl(url, rendererFilePath)) {
      return;
    }

    event.preventDefault();

    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

function isAppNavigationUrl(url: string, rendererFilePath: string) {
  try {
    const target = new URL(url);

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return target.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
    }

    const rendererUrl = pathToFileURL(rendererFilePath);
    return (
      target.protocol === "file:" && target.pathname === rendererUrl.pathname
    );
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return (
      protocol === "https:" || protocol === "http:" || protocol === "mailto:"
    );
  } catch {
    return false;
  }
}
