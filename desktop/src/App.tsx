import { AppRouter } from '@/app/app-router';
import { ToastProvider } from '@/components/ui/toast';

export function App() {
  return (
    <ToastProvider>
      <AppRouter />
    </ToastProvider>
  );
}
