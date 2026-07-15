import type { PropsWithChildren } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { domMax, LazyMotion, MotionConfig } from "framer-motion";
import { Suspense } from "react";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentCatalogProvider } from "@/features/agents/agent-catalog";
import { SettingsWindowPage } from "@/features/settings/settings-window-page";
import { DaemonProvider } from "@/platform/daemon";

function AppProviders({ children }: PropsWithChildren) {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        <DaemonProvider>
          <Suspense fallback={null}>
            <AgentCatalogProvider>
              <div className="contents">
                <QueryClientProvider client={queryClient}>
                  <ToastProvider>
                    <TooltipProvider>{children}</TooltipProvider>
                  </ToastProvider>
                </QueryClientProvider>
              </div>
            </AgentCatalogProvider>
          </Suspense>
        </DaemonProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}

/**
 * The settings window mounts only the settings page — the main app router and
 * workspace surfaces never render there.
 */
export function SettingsApp() {
  return (
    <AppProviders>
      <SettingsWindowPage />
    </AppProviders>
  );
}
