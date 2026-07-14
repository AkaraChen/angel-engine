import { createDesktopWindow } from "./factory";

export function createMainWindow() {
  return createDesktopWindow({
    hash: "/settings",
    options: {
      minHeight: 640,
      minWidth: 960,
    },
  });
}
