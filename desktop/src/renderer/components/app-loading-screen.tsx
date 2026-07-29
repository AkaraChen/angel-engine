import appIconUrl from "@assets/icon.iconset/icon_256x256.png";

import { Spinner } from "@/components/ui/spinner";
import { DesktopWindowContentReady } from "@/platform/window-content-ready";

/**
 * Shown while a window has nothing else to paint yet — the backend handshake
 * and the suspended providers both land here. It doubles as the window's
 * content-ready signal, so the window is revealed on this screen instead of
 * waiting, invisible, for the app to finish booting.
 *
 * There is no title bar during boot, so the whole surface is a drag region.
 */
export function AppLoadingScreen() {
  return (
    <div
      className="
        flex h-svh w-full flex-col items-center justify-center gap-6
        bg-background
      "
      data-electron-drag
    >
      <DesktopWindowContentReady />
      <img alt="" className="size-20" draggable={false} src={appIconUrl} />
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
