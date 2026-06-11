import { exposeChatStreamBridge } from "./bridges/chat-stream";
import { exposeDesktopEnvironmentBridge } from "./bridges/desktop-environment";
import { exposeDesktopWindowBridge } from "./bridges/desktop-window";
import { exposeTerminalBridge } from "./bridges/terminal";
import { exposeTipcClientBridge } from "./bridges/tipc-client";
import { exposeWorkspaceBrowserBridge } from "./bridges/workspace-browser";

exposeDesktopEnvironmentBridge();
exposeDesktopWindowBridge();
exposeTipcClientBridge();
exposeChatStreamBridge();
exposeTerminalBridge();
exposeWorkspaceBrowserBridge();
