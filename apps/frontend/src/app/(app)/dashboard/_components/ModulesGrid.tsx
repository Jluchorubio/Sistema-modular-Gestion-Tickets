'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { Spinner } from '@/components/ui/Spinner';
import type { SystemModule } from '@/types/module.types';
import styles from '../dashboard.module.css';

interface Builtins {
  helpdesk:  SystemModule | null;
  inventory: SystemModule | null;
  gestion:   SystemModule | null;
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

  const visibleBuiltins = [
    builtins.helpdesk  ? { m: builtins.helpdesk,  route: '/helpdesk'  } : null,
    builtins.inventory ? { m: builtins.inventory, route: '/inventory' } : null,
    builtins.gestion   ? { m: builtins.gestion,   route: '/requests'  } : null,
  ].filter(Boolean) as { m: SystemModule; route: string }[];

  const totalVisible = visibleBuiltins.length + active.length;

  return (
    <>
      <div className={styles.sectionTitle}>Módulos disponibles</div>
      <div className={styles.grid}>
        {visibleBuiltins.map(({ m, route }) => (
          <ModuleCard
            key={m.id}
            module={m}
            isSuperadmin={isSuperadmin}
            isBuiltIn
            onClick={() => router.push(route)}
            {...builtinHandlers(m)}
          />
        ))}

        {!active.length && !isSuperadmin && totalVisible === 0 && (
          <span className={styles.emptyMsg}>No se encontraron módulos.</span>
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
