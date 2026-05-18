'use client';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { GestionReportsClient } from '../_components/GestionReportsClient';
import { Spinner } from '@/components/ui/Spinner';
import { GESTION_NAV, GESTION_MODULE_NAME } from '../_nav';

export default function GestionReportsPage() {
  const user       = useAuthStore(s => s.user);
  const { modules, isLoading } = useModules();
  const gestionId  = modules?.find(m => ['gestion', 'gestion-adm'].includes(m.slug))?.id;

  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  if (!user?.is_superadmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        Solo superadmins pueden ver esta sección.
      </div>
    );
  }

  if (isLoading || !gestionId) return <Spinner />;

  return <GestionReportsClient moduleId={gestionId} />;
}
