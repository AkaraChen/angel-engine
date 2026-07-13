import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { DaemonProvider } from "@/platform/daemon-provider";

export function App() {
  return (
    <DaemonProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
        <Toaster />
      </QueryClientProvider>
    </DaemonProvider>
  );
}
