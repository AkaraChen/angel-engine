import type { Hono } from "hono";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { injectMobileBootstrap } from "./mobile-index";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeFor(filePath: string): string {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

/**
 * Resolves a request path to a file inside `rootDir`, refusing anything that
 * escapes the directory (path traversal protection). Returns `undefined` when
 * the resolved path is outside the root.
 */
function resolveWithinRoot(
  rootDir: string,
  requestPath: string,
): string | undefined {
  const normalized = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.resolve(rootDir, `.${path.sep}${normalized}`);
  const rootWithSep = rootDir.endsWith(path.sep)
    ? rootDir
    : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    return undefined;
  }
  return resolved;
}

/**
 * Reads the mobile bundle's `index.html` and injects a bootstrap script telling
 * the mobile app it must authenticate (read via `window.__ANGEL_DAEMON__`).
 *
 * Crucially, this injects NO bearer token: the served page is reachable by any
 * device on the LAN, so it must not carry a credential. The mobile app pairs by
 * posting the user's password to `/api/auth/pair` to obtain a session token.
 */
async function buildIndexHtml(mobileDir: string): Promise<string> {
  const html = await readFile(path.join(mobileDir, "index.html"), "utf8");
  return injectMobileBootstrap(html);
}

/**
 * Mounts static hosting for the mobile web bundle on `app`. Real files under
 * `mobileDir` are served directly; every other GET falls back to the
 * token-injected `index.html` so client-side (history) routes resolve.
 *
 * This must be registered AFTER the token-guarded `/api/*` routes so those keep
 * precedence — `/api/*` stays behind bearer auth while the static assets are
 * reachable by any device on the LAN.
 */
export async function registerMobileHosting(
  app: Hono,
  mobileDir: string,
): Promise<void> {
  const rootDir = path.resolve(mobileDir);
  const indexHtml = await buildIndexHtml(rootDir);

  app.get("/*", async (context, next) => {
    const pathname = safeDecode(new URL(context.req.url).pathname);
    if (pathname === undefined || pathname.startsWith("/api/")) {
      return next();
    }

    if (pathname !== "/" && pathname !== "") {
      const filePath = resolveWithinRoot(rootDir, pathname);
      if (filePath !== undefined) {
        try {
          const data = await readFile(filePath);
          return context.body(new Uint8Array(data), 200, {
            "Cache-Control": "no-cache",
            "Content-Type": contentTypeFor(filePath),
          });
        } catch {
          // Not a real file — fall through to the SPA index below.
        }
      }
    }

    return context.html(indexHtml);
  });
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
