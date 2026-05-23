'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { usePermission } from '@/hooks/usePermission';
import { GestionReportsClient } from '../_components/GestionReportsClient';
import { Spinner } from '@/components/ui/Spinner';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionReportsPage() {
  const { modules, isLoading } = useModules();
  const gestionId  = modules?.find(isGestionModule)?.id;
  const canView    = usePermission('gestion:reports:view');

  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  if (!canView) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  if (isLoading || !gestionId) return <Spinner />;

  return <GestionReportsClient moduleId={gestionId} />;
}
