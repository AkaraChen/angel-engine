import { createDesktopWindow } from "./factory";

export function createMainWindow() {
  return createDesktopWindow({
    options: {
      minHeight: 640,
      minWidth: 960,
    },
  });
}
