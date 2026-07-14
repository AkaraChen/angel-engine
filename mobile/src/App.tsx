import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/auth-provider";
import { themeStorageKey } from "@/features/settings/theme";
import { DaemonProvider } from "@/platform/daemon-provider";

export function App() {
  return (
    // Theme is persisted to this client's own localStorage only; it never
    // touches the desktop's settings store or the daemon (KIT-144).
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey={themeStorageKey}
    >
      <AuthProvider>
        <DaemonProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <AppRouter />
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </DaemonProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
