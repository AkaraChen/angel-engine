import type { PropsWithChildren } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { domMax, LazyMotion, MotionConfig } from "framer-motion";
import { Suspense } from "react";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { ConfirmDialogHost } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentCatalogProvider } from "@/features/agents/agent-catalog";
import { SettingsWindowPage } from "@/features/settings/settings-window-page";
import { UpdateMessageDialog } from "@/features/updates/update-message-dialog";
import { UpdateStatusBanner } from "@/features/updates/update-status-banner";
import { DaemonProvider } from "@/platform/daemon";
import { DaemonEventSync } from "@/platform/daemon-events";
import { KeymapProvider } from "@/platform/keymap/provider";
import { DesktopWindowContentReady } from "@/platform/window-content-ready";

function AppProviders({ children }: PropsWithChildren) {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        <DaemonProvider>
          <Suspense fallback={<AppLoadingScreen />}>
            <AgentCatalogProvider>
              <div className="contents">
                <QueryClientProvider client={queryClient}>
                  <KeymapProvider>
                    <ToastProvider>
                      <TooltipProvider>
                        {children}
                        {window.desktopWindow.role === "main" ? (
                          <>
                            <UpdateStatusBanner />
                            <UpdateMessageDialog />
                          </>
                        ) : null}
                        <ConfirmDialogHost />
                      </TooltipProvider>
                    </ToastProvider>
                  </KeymapProvider>
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
      <DaemonEventSync />
      <DesktopWindowContentReady />
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
      <DesktopWindowContentReady />
      <SettingsWindowPage />
    </AppProviders>
  );
}
