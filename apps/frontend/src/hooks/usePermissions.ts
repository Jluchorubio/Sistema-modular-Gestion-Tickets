import { useAuthStore } from '@/stores/auth.store';
import { hasModuleRole, type ModuleRole } from '@/constants/roles';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  return {
    isSuperadmin: user?.is_superadmin ?? false,
    canAccessModule: (moduleId: string, minRole: ModuleRole): boolean => {
      if (!user) return false;
      if (user.is_superadmin) return true;
      return user.module_roles.some(
        (r) =>
          r.module_id === moduleId &&
          r.status === 'active' &&
          hasModuleRole(r.role_name, minRole),
      );
    },
  };
}
