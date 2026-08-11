import type { PromptInputFile } from "@/components/ai-elements/prompt-input";
import type {
  DesignAnchor,
  DesignChange,
  DesignElement,
  DesignRect,
  WorkspaceBrowserDesignScreenshot,
} from "@shared/workspace-browser";

import { nanoid } from "nanoid";

import {
  expandCssRect,
  mapCssRectToImagePixels,
} from "@shared/design-mode-crop";
import { formatDesignPromptText } from "@shared/design-mode-prompt";

const TARGET_CROP_PADDING_CSS = 8;

export const DESIGN_TARGET_CROP_REQUIRED_ERROR =
  "Could not create the target crop (design-target.png). Reselect the element and try again.";

export const DESIGN_TARGET_RECT_MISSING_ERROR =
  "Design Mode selection has no crop rect for the target screenshot.";

export interface DesignSelectionDraft {
  anchor: DesignAnchor;
  browserViewId: string;
  changes?: DesignChange[];
  element?: DesignElement;
  origin: string;
  pageUrl: string;
  /**
   * Screenshot captured immediately on selection so rect + bitmap stay aligned
   * even if the guest scrolls/reflows while the user types an instruction.
   */
  screenshot: WorkspaceBrowserDesignScreenshot | null;
}

export interface DesignSendPackage {
  attachments: PromptInputFile[];
  text: string;
}

/**
 * Build the text + image attachments for a Design Mode send.
 * Reuses the normal chat attachment shape so `sendPromptMessage` is unchanged.
 *
 * Requires both `design-viewport.png` and `design-target.png`. Crop failure
 * throws — callers must surface the error instead of toasting success.
 */
export async function buildDesignSendPackage(input: {
  selection: DesignSelectionDraft;
  screenshot: WorkspaceBrowserDesignScreenshot;
  userText: string;
  userAttachments?: PromptInputFile[];
}): Promise<DesignSendPackage> {
  const viewport = {
    width: input.screenshot.surfaceWidth,
    height: input.screenshot.surfaceHeight,
  };
  const text = formatDesignPromptText({
    anchor: input.selection.anchor,
    changes: input.selection.changes,
    element: input.selection.element,
    url: input.selection.pageUrl || input.selection.origin,
    userText: input.userText,
    viewport,
  });

  const cropRect = resolveCropRect(input.selection);
  if (!cropRect) {
    throw new Error(DESIGN_TARGET_RECT_MISSING_ERROR);
  }

  const padded = expandCssRect(cropRect, TARGET_CROP_PADDING_CSS, viewport);
  const cropDataUrl = await cropScreenshotToDataUrl(input.screenshot, padded);
  if (!cropDataUrl) {
    throw new Error(DESIGN_TARGET_CROP_REQUIRED_ERROR);
  }

  const attachments: PromptInputFile[] = [
    promptImageFromDataUrl(input.screenshot.dataUrl, "design-viewport.png"),
    promptImageFromDataUrl(cropDataUrl, "design-target.png"),
  ];

  if (input.userAttachments) {
    attachments.push(...input.userAttachments);
  }

  return { attachments, text };
}

export function resolveCropRect(
  selection: Pick<DesignSelectionDraft, "anchor" | "element">,
): DesignRect | null {
  if (selection.element?.rect) {
    return selection.element.rect;
  }
  if (
    selection.anchor.kind === "element" ||
    selection.anchor.kind === "region" ||
    selection.anchor.kind === "text"
  ) {
    return selection.anchor.rect;
  }
  return null;
}

export async function cropScreenshotToDataUrl(
  screenshot: WorkspaceBrowserDesignScreenshot,
  cssRect: DesignRect,
): Promise<string | null> {
  const pixelRect = mapCssRectToImagePixels(
    cssRect,
    {
      width: screenshot.surfaceWidth,
      height: screenshot.surfaceHeight,
    },
    {
      width: screenshot.width,
      height: screenshot.height,
    },
  );
  if (!pixelRect) {
    return null;
  }

  const image = await loadImage(screenshot.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = pixelRect.width;
  canvas.height = pixelRect.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(
    image,
    pixelRect.x,
    pixelRect.y,
    pixelRect.width,
    pixelRect.height,
    0,
    0,
    pixelRect.width,
    pixelRect.height,
  );
  return canvas.toDataURL("image/png");
}

function promptImageFromDataUrl(
  dataUrl: string,
  filename: string,
): PromptInputFile {
  return {
    filename,
    id: nanoid(),
    mediaType: "image/png",
    type: "file",
    url: dataUrl,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Failed to decode Design Mode screenshot."));
    image.src = dataUrl;
  });
}
