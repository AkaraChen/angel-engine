const FETCH_TIMEOUT_MS = 8000;
const HTML_BYTE_LIMIT = 512 * 1024;
const IMAGE_BYTE_LIMIT = 2 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; AngelEngine/1.0; +https://github.com/AkaraChen/angel-engine)";

export interface UrlPreviewResult {
  imageDataUrl?: string;
  title?: string;
}

/**
 * Fetches a page's Open Graph preview from the main process, where renderer
 * CSP and CORS do not apply. Missing metadata is a documented page property,
 * not a failure: the result simply omits `title`/`imageDataUrl`.
 */
export async function fetchUrlPreview(url: URL): Promise<UrlPreviewResult> {
  const html = await fetchHtml(url);
  if (html === undefined) return {};

  const meta = parsePreviewMeta(html);
  const imageDataUrl = await resolvePreviewImage(meta.imageUrl, url);
  return {
    ...(imageDataUrl === undefined ? {} : { imageDataUrl }),
    ...(meta.title === undefined ? {} : { title: meta.title }),
  };
}

async function fetchHtml(url: URL): Promise<string | undefined> {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("text/html")) {
    return undefined;
  }
  const bytes = await readBodyWithLimit(response, HTML_BYTE_LIMIT);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function resolvePreviewImage(
  imageUrl: string | undefined,
  pageUrl: URL,
): Promise<string | undefined> {
  if (imageUrl === undefined) return undefined;

  try {
    const resolved = new URL(imageUrl, pageUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return await fetchImageDataUrl(resolved);
  } catch {
    // A broken og:image only downgrades the card to the icon fallback.
    return undefined;
  }
}

async function fetchImageDataUrl(url: URL): Promise<string | undefined> {
  const response = await fetch(url, {
    headers: { accept: "image/*", "user-agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.startsWith("image/")) {
    return undefined;
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > IMAGE_BYTE_LIMIT) return undefined;

  const bytes = await readBodyWithLimit(response, IMAGE_BYTE_LIMIT);
  const mimeType = contentType.split(";")[0].trim();
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function readBodyWithLimit(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    throw new Error("Preview response has no body.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= limit) break;
    }
  } finally {
    reader.releaseLock();
    await response.body.cancel().catch((): undefined => undefined);
  }

  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = merged.byteLength - offset;
    if (remaining <= 0) break;
    merged.set(
      remaining < chunk.byteLength ? chunk.subarray(0, remaining) : chunk,
      offset,
    );
    offset += Math.min(chunk.byteLength, remaining);
  }
  return merged;
}

interface PreviewMeta {
  imageUrl?: string;
  title?: string;
}

function parsePreviewMeta(html: string): PreviewMeta {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\s[^>]*>/gi)) {
    const key =
      tagAttribute(tag[0], "property") ?? tagAttribute(tag[0], "name");
    const content = tagAttribute(tag[0], "content");
    if (key === undefined || content === undefined) continue;
    const normalizedKey = key.toLowerCase();
    if (!meta.has(normalizedKey)) {
      meta.set(normalizedKey, decodeHtmlEntities(content));
    }
  }

  const documentTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const title =
    meta.get("og:title") ??
    meta.get("twitter:title") ??
    (documentTitle === undefined
      ? meta.get("og:site_name")
      : decodeHtmlEntities(documentTitle).trim() || meta.get("og:site_name"));
  const imageUrl =
    meta.get("og:image") ??
    meta.get("og:image:url") ??
    meta.get("twitter:image");

  return {
    ...(imageUrl === undefined || imageUrl.length === 0 ? {} : { imageUrl }),
    ...(title === undefined || title.length === 0 ? {} : { title }),
  };
}

function tagAttribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    "i",
  ).exec(tag);
  return match?.[2] ?? match?.[3];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll(/&#x([\da-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replaceAll(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}
