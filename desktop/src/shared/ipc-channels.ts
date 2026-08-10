export const TIPC_CHANNELS = [
  "appLinearTokenClear",
  "appLinearTokenHas",
  "appLinearTokenSet",
  "appFetchUrlPreview",
  "appReadClipboardSourceUrl",
  "appSetLanguage",
  "daemonMobileHostingGet",
  "daemonMobileHostingListenAddresses",
  "daemonMobileHostingSet",
  "keymapGetUserBindings",
  "keymapSetUserBindings",
  "keymapResetAll",
  "keymapRestoreBackup",
  "keymapOpenInEditor",
  "pathLauncherAvailability",
  "pathLauncherInvoke",
  "projectsChooseDirectory",
  "usageGetSnapshot",
  "usageRefresh",
  "trayGetPreferences",
  "traySetEnabled",
] as const;

export type TipcChannel = (typeof TIPC_CHANNELS)[number];

export const TIPC_CHANNEL_SET: ReadonlySet<string> = new Set(TIPC_CHANNELS);
