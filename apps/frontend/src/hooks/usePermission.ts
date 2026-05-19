'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissionsStore } from '@/stores/permissions.store';
import { permissionsService } from '@/services/permissions.service';
import { useAuthStore } from '@/stores/auth.store';

/* Load permissions once per session (on mount when authenticated) */
export function useLoadPermissions() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const setPermissions  = usePermissionsStore(s => s.setPermissions);
  const reset           = usePermissionsStore(s => s.reset);

  const { data } = useQuery({
    queryKey: ['permissions-mine'],
    queryFn:  permissionsService.getMyPermissions,
    enabled:  isAuthenticated,
    staleTime: 60_000,
    gcTime:    120_000,
  });

  useEffect(() => {
    if (data) setPermissions(data);
  }, [data, setPermissions]);

  useEffect(() => {
    if (!isAuthenticated) reset();
  }, [isAuthenticated, reset]);
}

/* Check a single permission */
export function usePermission(key: string): boolean {
  return usePermissionsStore(s => s.hasPermission(key));
}

/* Check if user has ANY of the given permissions */
export function useHasAnyPermission(...keys: string[]): boolean {
  return usePermissionsStore(s => keys.some(k => s.hasPermission(k)));
}

/* Check if user has ALL of the given permissions */
export function useHasAllPermissions(...keys: string[]): boolean {
  return usePermissionsStore(s => keys.every(k => s.hasPermission(k)));
}
