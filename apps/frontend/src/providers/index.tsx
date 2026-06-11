import { QueryProvider }        from './QueryProvider';
import { AuthProvider }         from './AuthProvider';
import { ThemeProvider }        from './ThemeProvider';
import { ServiceWorkerProvider } from './ServiceWorkerProvider';
import { SystemConfigProvider } from './SystemConfigProvider';
import { ErrorBoundary }        from '@/components/ui/ErrorBoundary';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <SystemConfigProvider>
            <ThemeProvider>
              <ServiceWorkerProvider />
              {children}
            </ThemeProvider>
          </SystemConfigProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
