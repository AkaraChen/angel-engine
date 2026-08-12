import type { DesignRect } from "./workspace-browser";

export interface ImageSize {
  height: number;
  width: number;
}

export interface PixelCropRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Map a CSS-pixel DOM rect into image-pixel space.
 *
 * `surfaceSize` is the CSS viewport used when the rect was measured
 * (`window.innerWidth/Height`). `naturalSize` is the screenshot bitmap size
 * (device pixels). Using `naturalWidth / surfaceSize` avoids DPR crop drift.
 */
export function mapCssRectToImagePixels(
  rect: DesignRect,
  surfaceSize: ImageSize,
  naturalSize: ImageSize,
): PixelCropRect | null {
  if (
    !isPositiveFinite(surfaceSize.width) ||
    !isPositiveFinite(surfaceSize.height) ||
    !isPositiveFinite(naturalSize.width) ||
    !isPositiveFinite(naturalSize.height)
  ) {
    return null;
  }
  if (
    !isFiniteNumber(rect.x) ||
    !isFiniteNumber(rect.y) ||
    !isPositiveFinite(rect.width) ||
    !isPositiveFinite(rect.height)
  ) {
    return null;
  }

  const scaleX = naturalSize.width / surfaceSize.width;
  const scaleY = naturalSize.height / surfaceSize.height;

  let x = Math.round(rect.x * scaleX);
  let y = Math.round(rect.y * scaleY);
  let width = Math.round(rect.width * scaleX);
  let height = Math.round(rect.height * scaleY);

  // Clamp to bitmap bounds so canvas drawImage never samples outside.
  x = clamp(x, 0, Math.max(0, naturalSize.width - 1));
  y = clamp(y, 0, Math.max(0, naturalSize.height - 1));
  width = clamp(width, 1, naturalSize.width - x);
  height = clamp(height, 1, naturalSize.height - y);

  if (width < 1 || height < 1) {
    return null;
  }

  return { x, y, width, height };
}

/**
 * Expand a crop by a small padding (CSS px, converted with the same scale)
 * so the target isn't flush against the crop edge.
 */
export function expandCssRect(
  rect: DesignRect,
  paddingCss: number,
  surfaceSize: ImageSize,
): DesignRect {
  const pad = Math.max(0, paddingCss);
  const x = Math.max(0, rect.x - pad);
  const y = Math.max(0, rect.y - pad);
  const right = Math.min(surfaceSize.width, rect.x + rect.width + pad);
  const bottom = Math.min(surfaceSize.height, rect.y + rect.height + pad);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFinite(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
