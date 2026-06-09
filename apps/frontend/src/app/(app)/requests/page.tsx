'use client';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from './_nav';
import { AdminView } from './_components/AdminView';
import { UserView } from './_components/UserView';

export default function RequestsPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(isGestionModule)?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  const { user }        = useAuthStore();
  const isSuperadmin    = user?.is_superadmin ?? false;
  const canViewAll      = usePermission('gestion:requests:view_all');
  const hasAdminAccess  = isSuperadmin || canViewAll;

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
