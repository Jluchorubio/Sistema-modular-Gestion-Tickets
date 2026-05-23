'use client';

import { useAuthStore } from '@/stores/auth.store';
import { hasModuleRole, type ModuleRole } from '@/constants/roles';

interface PermissionGuardProps {
  children: React.ReactNode;
  minRole: ModuleRole;
  moduleId?: string;
  fallback?: React.ReactNode;
}

export function PermissionGuard({
  children,
  minRole,
  moduleId,
  fallback = null,
}: PermissionGuardProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) return <>{fallback}</>;
  if (user.is_superadmin) return <>{children}</>;

  const relevantRoles = moduleId
    ? user.module_roles.filter((r) => r.module_id === moduleId)
    : user.module_roles;

  const qualified = relevantRoles.some(
    (r) => r.status === 'active' && hasModuleRole(r.role_name, minRole)
  );

  return qualified ? <>{children}</> : <>{fallback}</>;
}
