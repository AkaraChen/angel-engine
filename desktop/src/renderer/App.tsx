import { QueryClientProvider } from "@tanstack/react-query";
import { domMax, LazyMotion, MotionConfig } from "framer-motion";
import { Suspense } from "react";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentCatalogProvider } from "@/features/agents/agent-catalog";
import { DaemonProvider } from "@/platform/daemon";

export function App() {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">
        <DaemonProvider>
          <Suspense fallback={null}>
            <AgentCatalogProvider>
              <div className="contents">
                <QueryClientProvider client={queryClient}>
                  <ToastProvider>
                    <TooltipProvider>
                      <AppRouter />
                    </TooltipProvider>
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
