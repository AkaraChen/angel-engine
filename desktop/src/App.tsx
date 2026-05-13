import { QueryClientProvider } from "@tanstack/react-query";

import { AppRouter } from "@/app/router";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/app/query-client";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TooltipProvider>
          <AppRouter />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
