import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/auth-provider";
import { themeStorageKey } from "@/features/settings/theme";
import i18n from "@/i18n";
import { DaemonProvider } from "@/platform/daemon-provider";

export function App() {
  return (
    // Theme and language are persisted to this client's own localStorage only;
    // they never touch the desktop's settings store or the daemon (KIT-144).
    <I18nextProvider i18n={i18n}>
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
    </I18nextProvider>
  );
}
