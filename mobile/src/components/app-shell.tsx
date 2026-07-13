import type { PropsWithChildren } from "react";

import { useRoute } from "wouter";

import { TabBar } from "@/components/tab-bar";

export function AppShell({ children }: PropsWithChildren) {
  // The chat detail view is immersive and manages its own footer input, so the
  // bottom tab bar is hidden there.
  const [isChatDetail] = useRoute("/chat/:chatId");
  return (
    <div
      className="
      flex size-full min-h-0 flex-col bg-background text-foreground
    "
    >
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      {isChatDetail ? null : <TabBar />}
    </div>
  );
}
