'use client';
import { useAuthStore } from '@/stores/auth.store';

export function useModuleAccess(moduleId: string | undefined): {
  hasAccess: boolean;
  isChecking: boolean;
} {
  const user = useAuthStore((s) => s.user);

  if (!user)       return { hasAccess: false, isChecking: true };
  if (!moduleId)   return { hasAccess: false, isChecking: true };
  if (user.is_superadmin) return { hasAccess: true,  isChecking: false };

  const hasAccess = user.module_roles.some(
    (r) => r.module_id === moduleId && r.status === 'active',
  );
  return { hasAccess, isChecking: false };
}
