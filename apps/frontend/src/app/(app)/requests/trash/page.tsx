'use client';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { GestionTrashClient } from '../_components/GestionTrashClient';
import { Spinner } from '@/components/ui/Spinner';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionTrashPage() {
  const user       = useAuthStore(s => s.user);
  const { modules, isLoading } = useModules();
  const gestionId  = modules?.find(isGestionModule)?.id;

  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);

  if (!user?.is_superadmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        Solo superadmins pueden ver esta sección.
      </div>
    );
  }

  if (isLoading || !gestionId) return <Spinner />;

  return <GestionTrashClient moduleId={gestionId} />;
}
