import { exposeDaemonBridge } from "./bridges/daemon";
import { exposeDesktopEnvironmentBridge } from "./bridges/desktop-environment";
import { exposeDesktopWindowBridge } from "./bridges/desktop-window";
import { exposeTipcClientBridge } from "./bridges/tipc-client";
import { exposeWorkspaceBrowserBridge } from "./bridges/workspace-browser";

exposeDesktopEnvironmentBridge();
exposeDesktopWindowBridge();
exposeTipcClientBridge();
exposeWorkspaceBrowserBridge();
exposeDaemonBridge();
