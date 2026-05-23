import { QueryProvider } from './QueryProvider';
import { AuthProvider } from './AuthProvider';
import { ThemeProvider } from './ThemeProvider';
import { ServiceWorkerProvider } from './ServiceWorkerProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <ServiceWorkerProvider />
          {children}
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
