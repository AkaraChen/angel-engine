export const TIPC_CHANNELS = [
  "appFetchUrlPreview",
  "appReadClipboardSourceUrl",
  "appSetLanguage",
  "daemonMobileHostingGet",
  "daemonMobileHostingListenAddresses",
  "daemonMobileHostingSet",
  "chatsShowContextMenu",
  "projectsChooseDirectory",
  "projectsShowContextMenu",
] as const;

export type TipcChannel = (typeof TIPC_CHANNELS)[number];

export const TIPC_CHANNEL_SET: ReadonlySet<string> = new Set(TIPC_CHANNELS);
