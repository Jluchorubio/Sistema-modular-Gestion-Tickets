'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { Spinner } from '@/components/ui/Spinner';
import type { SystemModule } from '@/types/module.types';
import styles from '../dashboard.module.css';

interface Builtins {
  helpdesk:  SystemModule;
  inventory: SystemModule;
  gestion:   SystemModule;
}

interface Props {
  builtins:       Builtins;
  active:         SystemModule[];
  inactive:       SystemModule[];
  hasModules:     boolean;
  isSuperadmin:   boolean;
  isLoading:      boolean;
  isError:        boolean;
  isRealModule:   (m: SystemModule) => boolean;
  onEdit:         (m: SystemModule) => void;
  onToggleActive: (m: SystemModule) => void;
  onDelete:       (m: SystemModule) => void;
  onMaintenance:  (m: SystemModule) => void;
  onCreate:       () => void;
}

export function ModulesGrid({
  builtins,
  active,
  inactive,
  hasModules,
  isSuperadmin,
  isLoading,
  isError,
  isRealModule,
  onEdit,
  onToggleActive,
  onDelete,
  onMaintenance,
  onCreate,
}: Props) {
  const router = useRouter();

  if (isLoading) return <Spinner />;
  if (isError)   return <p className={styles.errorMsg}>Error cargando módulos. Intenta recargar.</p>;
  if (!hasModules) return null;

  function builtinHandlers(m: SystemModule) {
    if (!isRealModule(m)) return {};
    return {
      onEdit:              () => onEdit(m),
      onToggleActive:      () => onToggleActive(m),
      onToggleMaintenance: () => onMaintenance(m),
    };
  }

  return (
    <>
      <div className={styles.sectionTitle}>Módulos disponibles</div>
      <div className={styles.grid}>
        <ModuleCard
          module={builtins.helpdesk}
          isSuperadmin={isSuperadmin}
          isBuiltIn
          onClick={() => router.push('/helpdesk')}
          {...builtinHandlers(builtins.helpdesk)}
        />
        <ModuleCard
          module={builtins.inventory}
          isSuperadmin={isSuperadmin}
          isBuiltIn
          onClick={() => router.push('/inventory')}
          {...builtinHandlers(builtins.inventory)}
        />
        <ModuleCard
          module={builtins.gestion}
          isSuperadmin={isSuperadmin}
          isBuiltIn
          onClick={() => router.push('/requests')}
          {...builtinHandlers(builtins.gestion)}
        />

        {!active.length && !isSuperadmin && (
          <span className={styles.emptyMsg}>No tienes módulos personalizados asignados.</span>
        )}

        {active.map((m) => (
          <ModuleCard
            key={m.id}
            module={m}
            isSuperadmin={isSuperadmin}
            onClick={() => router.push(`/${m.slug}`)}
            onEdit={() => onEdit(m)}
            onToggleActive={() => onToggleActive(m)}
            onDelete={() => onDelete(m)}
            onToggleMaintenance={() => onMaintenance(m)}
          />
        ))}

        {isSuperadmin && (
          <button type="button" className={styles.createCard} onClick={onCreate}>
            <Plus size={28} />
            <span>Crear módulo</span>
          </button>
        )}
      </div>

      {inactive.length > 0 && isSuperadmin && (
        <>
          <div className={styles.inactiveSectionTitle}>Módulos desactivados</div>
          <div className={styles.grid}>
            {inactive.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                isSuperadmin={isSuperadmin}
                onClick={() => router.push(`/${m.slug}`)}
                onEdit={() => onEdit(m)}
                onToggleActive={() => onToggleActive(m)}
                onDelete={() => onDelete(m)}
                onToggleMaintenance={() => onMaintenance(m)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
