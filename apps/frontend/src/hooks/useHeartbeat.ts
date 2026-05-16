'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { authService } from '@/services/auth.service';

const INTERVAL_MS = 60_000;

export function useHeartbeat() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    authService.heartbeat().catch(() => {});

    const id = setInterval(() => {
      authService.heartbeat().catch(() => {});
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [isAuthenticated]);
}
