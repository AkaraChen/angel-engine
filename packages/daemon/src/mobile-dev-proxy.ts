import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Hono } from "hono";

import { proxyFetch, proxyUpgrade } from "httpxy";
import { injectMobileBootstrap } from "./mobile-index";

export function registerMobileDevProxy(app: Hono, devServerUrl: string): void {
  assertDevServerUrl(devServerUrl);

  app.all("/*", async (context, next) => {
    if (context.req.path.startsWith("/api/")) return next();

    try {
      const response = await proxyFetch(devServerUrl, context.req.raw);
      if (!response.headers.get("content-type")?.includes("text/html")) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(injectMobileBootstrap(await response.text()), {
        headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch {
      return context.json(
        { error: "Mobile development server is unavailable." },
        502,
      );
    }
  });
}

export function proxyMobileDevWebSocket(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  devServerUrl: string,
): void {
  void proxyUpgrade(devServerUrl, request, socket, head, {
    changeOrigin: true,
  }).catch(() => socket.destroy());
}

function assertDevServerUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(
      "Mobile development server URL must use HTTP or HTTPS.",
    );
  }
}
