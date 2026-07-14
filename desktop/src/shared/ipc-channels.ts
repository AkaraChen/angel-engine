export const TIPC_CHANNELS = [
  "appReadClipboardSourceUrl",
  "appSetLanguage",
  "daemonMobileHostingGet",
  "daemonMobileHostingSet",
  "chatsShowContextMenu",
  "projectsChooseDirectory",
  "projectsShowContextMenu",
] as const;

export type TipcChannel = (typeof TIPC_CHANNELS)[number];

export const TIPC_CHANNEL_SET: ReadonlySet<string> = new Set(TIPC_CHANNELS);
