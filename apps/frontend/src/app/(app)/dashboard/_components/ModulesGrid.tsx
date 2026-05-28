'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { Spinner } from '@/components/ui/Spinner';
import type { SystemModule } from '@/types/module.types';
import styles from '../dashboard.module.css';

type ViewMode = 'card' | 'list' | 'summary';

interface Builtins {
  helpdesk:  SystemModule | null;
  inventory: SystemModule | null;
  gestion:   SystemModule | null;
}

interface Props {
  builtins:       Builtins;
  active:         SystemModule[];
  inactive:       SystemModule[];
  viewMode:       ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
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

const VIEW_OPTIONS: [ViewMode, string][] = [
  ['card', 'Tarjeta'],
  ['list', 'Lista'],
  ['summary', 'Resumen'],
];

export function ModulesGrid({
  builtins,
  active,
  inactive,
  viewMode,
  onViewModeChange,
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
  if (isError) return <p className={styles.errorMsg}>Error cargando modulos. Intenta recargar.</p>;
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
  const viewLabel = VIEW_OPTIONS.find(([mode]) => mode === viewMode)?.[1] ?? 'Tarjeta';

  function renderModuleItem(m: SystemModule, route: string, isBuiltIn = false) {
    if (viewMode === 'card') {
      return (
        <ModuleCard
          key={m.id}
          module={m}
          isSuperadmin={isSuperadmin}
          isBuiltIn={isBuiltIn}
          onClick={() => router.push(route)}
          {...(isBuiltIn
            ? builtinHandlers(m)
            : {
                onEdit: () => onEdit(m),
                onToggleActive: () => onToggleActive(m),
                onDelete: () => onDelete(m),
                onToggleMaintenance: () => onMaintenance(m),
              })}
        />
      );
    }

    const status = m.maintenance_mode ? 'Mantenimiento' : m.is_active ? 'Activo' : 'Inactivo';
    const statusClass = m.maintenance_mode
      ? styles.moduleStatusWarn
      : m.is_active
        ? styles.moduleStatusOk
        : styles.moduleStatusMuted;
    const description = m.description || 'Modulo operativo del sistema.';

    if (viewMode === 'summary') {
      return (
        <button key={m.id} type="button" className={styles.moduleSummaryItem} onClick={() => router.push(route)}>
          <div>
            <span className={styles.moduleType}>{m.type || 'modulo'}</span>
            <strong>{m.name}</strong>
          </div>
          <span className={statusClass}>{status}</span>
        </button>
      );
    }

    return (
      <div key={m.id} className={styles.moduleListItem}>
        <button type="button" className={styles.moduleListMain} onClick={() => router.push(route)}>
          <span className={styles.moduleListThumb}>
            {m.image_url ? (
              <img src={m.image_url} alt="" />
            ) : (
              <span>{(m.name || 'M').slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <span>
            <strong>{m.name}</strong>
            <small>{description}</small>
          </span>
        </button>
        <span className={statusClass}>{status}</span>
        <button type="button" className={styles.moduleListEnter} onClick={() => router.push(route)}>
          Ingresar
        </button>
      </div>
    );
  }

  function renderCreateControl() {
    if (!isSuperadmin) return null;
    if (viewMode === 'card') {
      return (
        <button type="button" className={styles.createCard} onClick={onCreate}>
          <Plus size={28} />
          <span>Crear modulo</span>
        </button>
      );
    }
    return (
      <button type="button" className={styles.createInline} onClick={onCreate}>
        <Plus size={16} />
        Crear modulo
      </button>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Modulos disponibles</div>
        <div className={styles.viewSelect}>
          <button type="button" className={styles.viewSelectBtn}>
            {viewLabel}
            <ChevronDown size={13} />
          </button>
          <div className={styles.viewSelectMenu}>
            {VIEW_OPTIONS.map(([mode, label]) => (
              <button key={mode} type="button" className={styles.viewSelectItem} onClick={() => onViewModeChange(mode)}>
                <Check size={13} className={viewMode === mode ? styles.viewCheckOn : styles.viewCheckOff} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={viewMode === 'card' ? styles.grid : viewMode === 'list' ? styles.listStack : styles.summaryGrid}>
        {visibleBuiltins.map(({ m, route }) => renderModuleItem(m, route, true))}

        {!active.length && !isSuperadmin && totalVisible === 0 && (
          <span className={styles.emptyMsg}>No se encontraron modulos.</span>
        )}

        {active.map((m) => renderModuleItem(m, `/${m.slug}`))}
        {renderCreateControl()}
      </div>

      {inactive.length > 0 && isSuperadmin && (
        <>
          <div className={styles.inactiveSectionTitle}>Modulos desactivados</div>
          <div className={viewMode === 'card' ? styles.grid : viewMode === 'list' ? styles.listStack : styles.summaryGrid}>
            {inactive.map((m) => renderModuleItem(m, `/${m.slug}`))}
          </div>
        </>
      )}
    </>
  );
}
