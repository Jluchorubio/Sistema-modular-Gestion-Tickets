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
    staleTime: 15_000,
    gcTime:    60_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data) setPermissions(data);
  }, [data, setPermissions]);

  useEffect(() => {
    if (!isAuthenticated) reset();
  }, [isAuthenticated, reset]);
}

/* Check a single permission.
   Returns false while loading — no optimistic true.
   Use usePermissionState() when you need to distinguish loading from denied. */
export function usePermission(key: string): boolean {
  const loaded  = usePermissionsStore(s => s.loaded);
  const hasPerm = usePermissionsStore(s => s.hasPermission(key));
  return loaded && hasPerm;
}

/* Full 3-state permission check — use when you need to show a skeleton. */
export function usePermissionState(key: string): { loading: boolean; allowed: boolean } {
  const loaded  = usePermissionsStore(s => s.loaded);
  const hasPerm = usePermissionsStore(s => s.hasPermission(key));
  return { loading: !loaded, allowed: loaded && hasPerm };
}

/* Check if user has ANY of the given permissions */
export function useHasAnyPermission(...keys: string[]): boolean {
  const loaded = usePermissionsStore(s => s.loaded);
  const hasAny = usePermissionsStore(s => keys.some(k => s.hasPermission(k)));
  return loaded && hasAny;
}

/* Check if user has ALL of the given permissions */
export function useHasAllPermissions(...keys: string[]): boolean {
  const loaded  = usePermissionsStore(s => s.loaded);
  const hasAll  = usePermissionsStore(s => keys.every(k => s.hasPermission(k)));
  return loaded && hasAll;
}
