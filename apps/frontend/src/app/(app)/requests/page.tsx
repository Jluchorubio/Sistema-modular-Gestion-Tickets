'use client';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { MODULE_ROLES } from '@/constants/roles';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from './_nav';
import { AdminView } from './_components/AdminView';
import { UserView } from './_components/UserView';

export default function RequestsPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(isGestionModule)?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  const { user }      = useAuthStore();
  const isSuperadmin  = user?.is_superadmin ?? false;
  const isAdminModulo = user?.module_roles?.some(
    (r) => r.status === 'active' && r.role_name === MODULE_ROLES.ADMIN_MODULO,
  ) ?? false;
  const hasAdminAccess = isSuperadmin || isAdminModulo;

  return (
    <ModuleLayout
      moduleId={gestionId}
      title="Gestión Administrativa"
      description="Consola centralizada de solicitudes organizacionales: autorizaciones, traslados, cambios de rol y escalamientos administrativos."
      isSuperadmin={isSuperadmin}
      alwaysOpen
    >
      {hasAdminAccess
        ? <AdminView isSuperadmin={isSuperadmin} />
        : <UserView  isSuperadmin={isSuperadmin} />
      }
    </ModuleLayout>
  );
}
