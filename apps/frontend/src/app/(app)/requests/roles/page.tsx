'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedRolesClient } from '@/components/modules/ModuleScopedRolesClient';
import { ContextNav } from '@/components/ui/ContextNav';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';
import { MODULE_ROLES } from '@/constants/roles';

export default function GestionRolesPage() {
  const { modules, isLoading } = useModules();
  const gestionRef = modules?.find(isGestionModule);
  const { user }   = useAuthStore();
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  if (isLoading || !gestionRef) return <Spinner />;

  const isSuperadmin  = user?.is_superadmin ?? false;
  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === gestionRef.id && r.status === 'active' && r.role_name === MODULE_ROLES.ADMIN_MODULO,
  ) ?? false;

  const nav = <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Gestión Administrativa', href: '/requests' }, { label: 'Roles' }]} />;

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <>
        {nav}
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          No tienes permiso para gestionar roles.
        </div>
      </>
    );
  }

  return (
    <>
      {nav}
      <ModuleScopedRolesClient moduleId={gestionRef.id} moduleName="Gestión Administrativa" />
    </>
  );
}
