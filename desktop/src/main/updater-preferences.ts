import type { DesktopUpdateChannel } from "../shared/update-channel";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";

import {
  DEFAULT_UPDATE_CHANNEL,
  readUpdateChannelFromConfig,
} from "../shared/update-channel";

function preferencesPath() {
  return path.join(app.getPath("userData"), "updates.json");
}

export function readUpdateChannelPreference(): DesktopUpdateChannel {
  try {
    return readUpdateChannelFromConfig(
      JSON.parse(readFileSync(preferencesPath(), "utf8")),
    );
  } catch {
    return DEFAULT_UPDATE_CHANNEL;
  }
}

export function writeUpdateChannelPreference(channel: DesktopUpdateChannel) {
  try {
    writeFileSync(preferencesPath(), `${JSON.stringify({ channel })}\n`);
  } catch (error: unknown) {
    // The channel still applies to this session; only persistence is lost.
    log.warn("Could not persist the update channel preference.", error);
  }
}
