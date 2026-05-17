import { useAuthStore } from '@/stores/auth.store';
import { ADMIN_ROLES, MODULE_ROLES, hasModuleRole, type ModuleRole } from '@/constants/roles';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const isSuperadmin  = user?.is_superadmin ?? false;
  const activeRoles   = user?.module_roles?.filter((r) => r.status === 'active').map((r) => r.role_name) ?? [];
  const hasAnyRole    = (roles: ModuleRole[]) => roles.some((r) => activeRoles.includes(r));

  return {
    isSuperadmin,

    // Global admin flags (derived — no hardcoded strings at call sites)
    isModuleAdmin:  isSuperadmin || activeRoles.includes(MODULE_ROLES.ADMIN_MODULO),
    canViewAdmin:   isSuperadmin || activeRoles.includes(MODULE_ROLES.ADMIN_MODULO),
    canViewReports: isSuperadmin || hasAnyRole(ADMIN_ROLES),
    canManageUsers: isSuperadmin,
    canManageRoles: isSuperadmin,
    canViewTrash:   isSuperadmin,

    /** Per-module access check: true if user has at least `minRole` in that module */
    canAccessModule: (moduleId: string, minRole: ModuleRole): boolean => {
      if (!user) return false;
      if (user.is_superadmin) return true;
      return user.module_roles.some(
        (r) =>
          r.module_id === moduleId &&
          r.status === 'active' &&
          hasModuleRole(r.role_name as ModuleRole, minRole),
      );
    },
  };
}
