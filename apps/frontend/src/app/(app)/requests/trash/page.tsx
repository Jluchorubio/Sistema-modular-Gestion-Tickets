'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { usePermission } from '@/hooks/usePermission';
import { GestionTrashClient } from '../_components/GestionTrashClient';
import { Spinner } from '@/components/ui/Spinner';
import { ContextNav } from '@/components/ui/ContextNav';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionTrashPage() {
  const { modules, isLoading } = useModules();
  const gestionId  = modules?.find(isGestionModule)?.id;
  const canView    = usePermission('gestion:trash:view');

  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  const nav = <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Gestión Administrativa', href: '/requests' }, { label: 'Papelera' }]} />;

  if (!canView) {
    return (
      <>
        {nav}
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
          No tienes permiso para ver esta sección.
        </div>
      </>
    );
  }

  if (isLoading || !gestionId) return <Spinner />;

  return (
    <>
      {nav}
      <GestionTrashClient moduleId={gestionId} />
    </>
  );
}
