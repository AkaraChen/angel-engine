import type { MobileHostingConfig } from "../../shared/mobile-hosting";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import {
  DEFAULT_MOBILE_HOST,
  sanitizeMobileHostingConfig,
} from "../../shared/mobile-hosting";

function configPath() {
  return path.join(app.getPath("userData"), "mobile-hosting.json");
}

export function readMobileHostingConfig(): MobileHostingConfig {
  try {
    return sanitizeMobileHostingConfig(
      JSON.parse(readFileSync(configPath(), "utf8")),
    );
  } catch {
    return { enabled: false, host: DEFAULT_MOBILE_HOST, password: "" };
  }
}

export function writeMobileHostingConfig(config: MobileHostingConfig) {
  writeFileSync(configPath(), `${JSON.stringify(config)}\n`, { mode: 0o600 });
}

function runtimeMarkerPath() {
  return path.join(app.getPath("userData"), "mobile-hosting.runtime.json");
}

/** Records the config a live daemon was launched with (for reattach checks). */
export function readMobileHostingRuntimeMarker():
  MobileHostingConfig | undefined {
  try {
    return sanitizeMobileHostingConfig(
      JSON.parse(readFileSync(runtimeMarkerPath(), "utf8")),
    );
  } catch {
    return undefined;
  }
}

export function writeMobileHostingRuntimeMarker(config: MobileHostingConfig) {
  try {
    writeFileSync(runtimeMarkerPath(), `${JSON.stringify(config)}\n`, {
      mode: 0o600,
    });
  } catch {
    // Best effort — a missing marker only forces a fresh spawn next launch.
  }
}

export function mobileHostingConfigEquals(
  a: MobileHostingConfig,
  b: MobileHostingConfig,
) {
  return (
    a.enabled === b.enabled && a.host === b.host && a.password === b.password
  );
}

/**
 * Locates the built mobile bundle directory (the one containing `index.html`).
 * In a packaged app the bundle is copied next to the app under `mobile/`; in
 * development it lives at `<workspace>/mobile/dist`.
 */
export function resolveMobileDir(): string | undefined {
  const candidates = [
    path.join(app.getAppPath(), "mobile"),
    path.resolve(app.getAppPath(), "..", "mobile", "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return undefined;
}

function firstLanIpv4(): string | undefined {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return undefined;
}

/**
 * Builds the URL a phone on the LAN should open. Wildcard bind hosts are
 * resolved to a concrete LAN IPv4 so the address is actually dialable.
 */
export function resolveMobileUrl(
  host: string,
  port: number | null,
): string | null {
  if (port === null) return null;
  const displayHost =
    host === "0.0.0.0" || host === "::" || host === "::0"
      ? firstLanIpv4()
      : host;
  if (displayHost === undefined || displayHost.length === 0) return null;
  const bracketed = displayHost.includes(":")
    ? `[${displayHost}]`
    : displayHost;
  return `http://${bracketed}:${port}/`;
}
