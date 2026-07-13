import { clipboard } from "electron";

const CHROMIUM_SOURCE_URL_FORMAT = "org.chromium.source-url";

export interface ClipboardSourceUrlResult {
  sourceUrl?: string;
}

export function readClipboardSourceUrl(
  expectedText: string,
): ClipboardSourceUrlResult {
  if (clipboard.readText() !== expectedText) return {};

  try {
    const source = clipboard.readBuffer(CHROMIUM_SOURCE_URL_FORMAT);
    if (source.length === 0) return {};
    const url = new URL(source.toString("utf8"));
    if (url.protocol !== "http:" && url.protocol !== "https:") return {};
    return { sourceUrl: url.toString() };
  } catch {
    return {};
  }
}
