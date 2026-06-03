'use client';
import { useAuthStore } from '@/stores/auth.store';

export function useModuleAccess(
  moduleId:   string | undefined,
  accessMode: string | null | undefined = undefined,
): { hasAccess: boolean; isChecking: boolean } {
  const user = useAuthStore((s) => s.user);

  if (!user)     return { hasAccess: false, isChecking: true };
  if (!moduleId) return { hasAccess: false, isChecking: true };
  if (user.is_superadmin) return { hasAccess: true, isChecking: false };

  // Open-access modules — no role required
  if (accessMode === 'open') return { hasAccess: true, isChecking: false };

  const hasRole = user.module_roles.some(
    (r) => r.module_id === moduleId && r.status === 'active',
  );

  // If module data not loaded yet and user has no role, wait (avoid flash of no-access)
  if (accessMode === undefined && !hasRole) return { hasAccess: false, isChecking: true };

  return { hasAccess: hasRole, isChecking: false };
}
