import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter } from "@/app/app-router";
import { ToastProvider } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </QueryClientProvider>
  );
}
