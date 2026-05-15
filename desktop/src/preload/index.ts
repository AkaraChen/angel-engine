import { exposeChatStreamBridge } from "./bridges/chat-stream";
import { exposeDesktopEnvironmentBridge } from "./bridges/desktop-environment";
import { exposeDesktopWindowBridge } from "./bridges/desktop-window";
import { exposeTipcClientBridge } from "./bridges/tipc-client";

exposeDesktopEnvironmentBridge();
exposeDesktopWindowBridge();
exposeTipcClientBridge();
exposeChatStreamBridge();
