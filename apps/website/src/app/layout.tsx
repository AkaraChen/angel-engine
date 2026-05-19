import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://angel-engine.dev";
const title = "Angel Engine - Desktop Chat for Coding Agents";
const description =
  "A desktop app for Codex, OpenCode, and Claude Code chats, with project-aware threads, tool calls, and agent settings in one focused client.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Angel Engine",
    images: [
      {
        url: "/screenshot.png",
        width: 2908,
        height: 1814,
        alt: "Angel Engine desktop chat interface",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/screenshot.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body>
        {isDevelopment ? (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
