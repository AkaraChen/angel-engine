import type { BrowserWindow, Rectangle } from "electron";
import fs from "node:fs";
import path from "node:path";
import { app, screen } from "electron";

const mainWindowStateFileName = "window-state.json";
const defaultMainBounds = {
  height: 820,
  width: 1200,
};
const minimumMainBounds = {
  height: 640,
  width: 960,
};

type WindowState = Partial<Rectangle>;

export function savedWindowBounds({
  defaultBounds = defaultMainBounds,
  minimumBounds = minimumMainBounds,
  stateFileName = mainWindowStateFileName,
}: {
  defaultBounds?: Pick<Rectangle, "height" | "width">;
  minimumBounds?: Pick<Rectangle, "height" | "width">;
  stateFileName?: string;
} = {}): Partial<Rectangle> {
  const bounds = readWindowState(stateFileName);
  if (isUsableBounds(bounds, minimumBounds)) {
    return bounds;
  }

  return {
    height: defaultBounds.height,
    width: defaultBounds.width,
  };
}

export function persistWindowBounds(
  window: BrowserWindow,
  stateFileName = mainWindowStateFileName,
) {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      writeWindowState(stateFileName, window.getNormalBounds());
    }, 250);
  };

  window.on("move", scheduleSave);
  window.on("resize", scheduleSave);
  window.on("close", () => {
    if (saveTimer) clearTimeout(saveTimer);
    writeWindowState(stateFileName, window.getNormalBounds());
  });
}

function readWindowState(stateFileName: string): WindowState | null {
  try {
    return JSON.parse(
      fs.readFileSync(stateFilePath(stateFileName), "utf8"),
    ) as WindowState;
  } catch {
    return null;
  }
}

function writeWindowState(stateFileName: string, bounds: Rectangle) {
  try {
    fs.mkdirSync(path.dirname(stateFilePath(stateFileName)), {
      recursive: true,
    });
    fs.writeFileSync(stateFilePath(stateFileName), JSON.stringify(bounds));
  } catch {
    // Window state persistence should never block app shutdown.
  }
}

function stateFilePath(stateFileName: string) {
  return path.join(app.getPath("userData"), stateFileName);
}

function isUsableBounds(
  bounds: WindowState | null,
  minimumBounds: Pick<Rectangle, "height" | "width">,
): bounds is Rectangle {
  if (!bounds) return false;
  if (!isFiniteNumber(bounds.width) || !isFiniteNumber(bounds.height)) {
    return false;
  }
  if (
    bounds.width < minimumBounds.width ||
    bounds.height < minimumBounds.height
  ) {
    return false;
  }
  if (!isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y)) {
    return true;
  }

  const rectangle: Rectangle = {
    height: bounds.height,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
  };

  return screen
    .getAllDisplays()
    .some((display) => rectanglesIntersect(display.workArea, rectangle));
}

function rectanglesIntersect(left: Rectangle, right: Rectangle) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
