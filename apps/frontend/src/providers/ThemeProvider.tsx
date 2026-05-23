'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui.store';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme    = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  /* Read saved theme from localStorage on first mount */
  useEffect(() => {
    const saved = localStorage.getItem('app-theme') as 'light' | 'dark' | 'system' | null;
    if (saved && saved !== theme) setTheme(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Apply data-theme attribute to <html> whenever theme changes */
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      html.setAttribute('data-theme', theme);
    }
  }, [theme]);

  /* Track OS-level changes when mode is 'system' */
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(e: MediaQueryListEvent) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return <>{children}</>;
}
