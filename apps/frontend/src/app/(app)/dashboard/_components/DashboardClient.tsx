'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useModules } from '@/hooks/useModules';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleFormModal } from '@/components/modules/ModuleFormModal';
import type { SystemModule } from '@/types/module.types';
import { DashboardStats } from './DashboardStats';
import { DashboardOpsPanel } from './DashboardOpsPanel';
import { ModulesGrid } from './ModulesGrid';
import { DeleteModuleModal } from './DeleteModuleModal';
import { MaintenanceModal } from './MaintenanceModal';
import styles from '../dashboard.module.css';

const HELPDESK_DEFAULTS: SystemModule = {
  id: '__helpdesk__', name: 'Mesa de Ayuda', slug: 'helpdesk',
  description: 'Gestión de tickets de soporte técnico, incidencias y solicitudes de servicio',
  type: 'helpdesk', image_url: null, color: '#3B82F6',
  is_active: true, has_access: false, access_mode: 'request',
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const INVENTORY_DEFAULTS: SystemModule = {
  id: '__inventory__', name: 'Inventario', slug: 'inventario',
  description: 'Control de activos, equipos, materiales y recursos físicos de la organización',
  type: 'inventario', image_url: null, color: '#10B981',
  is_active: true, has_access: false, access_mode: 'open',
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const GESTION_DEFAULTS: SystemModule = {
  id: '__gestion__', name: 'Gestión Administrativa', slug: 'gestion',
  description: 'Solicitudes de acceso, cambio de rol, corrección de perfil y escalaciones',
  type: 'gestion', image_url: null, color: '#0e2235',
  is_active: true, has_access: true, access_mode: 'open',
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const BUILTIN_SLUGS = new Set([
  'helpdesk', 'inventario', 'gestion', 'gestion-adm', 'gestion-administrativa', 'tickets', 'inventory',
  'soporte', 'soporte-tecnico', 'soporte_tecnico', 'soportetecnico',
  'support', 'support-tech', 'administrative',
]);

function isRealModule(m: SystemModule): boolean {
  return !m.id.startsWith('__');
}

export function DashboardClient() {
  const qc       = useQueryClient();
  const { user } = useCurrentUser();
  const authUser = useAuthStore(s => s.user);
  const { modules, active: activeRaw, inactive: inactiveRaw, isLoading, isError } = useModules();

  const firstName    = user?.first_name    ?? '';
  const lastName     = user?.last_name     ?? '';
  const isSuperadmin = user?.is_superadmin ?? false;

  const helpdeskModule  = modules?.find(m =>
    ['helpdesk', 'tickets', 'soporte', 'soporte-tecnico', 'soporte_tecnico', 'support'].includes(m.slug) ||
    ['helpdesk', 'soporte'].includes(m.type ?? '')
  ) ?? { ...HELPDESK_DEFAULTS, has_access: isSuperadmin };
  const inventoryModule = (() => {
    const m = modules?.find(m => ['inventario', 'inventory'].includes(m.slug) || m.type === 'inventario');
    return m ? { ...m, has_access: true } : { ...INVENTORY_DEFAULTS, has_access: true };
  })();
  const gestionModule = (() => {
    const m = modules?.find(m =>
      ['gestion', 'gestion-adm', 'gestion-administrativa'].includes(m.slug) ||
      (!!m.type && ['administrative', 'gestion'].includes(m.type))
    );
    return m ? { ...m, has_access: true } : { ...GESTION_DEFAULTS, has_access: true };
  })();

  const builtinIds = new Set(
    [helpdeskModule.id, inventoryModule.id, gestionModule.id].filter(id => !id.startsWith('__'))
  );
  const isBuiltin = (m: SystemModule) => BUILTIN_SLUGS.has(m.slug) || builtinIds.has(m.id);

  const active   = activeRaw.filter(m => !isBuiltin(m));
  const inactive = inactiveRaw.filter(m => !isBuiltin(m));

  const { data: sysStats } = useQuery({
    queryKey:  ['system-stats'],
    queryFn:   () => usersService.getSystemStats(),
    enabled:   isSuperadmin,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: opsData } = useQuery({
    queryKey:  ['dashboard-ops'],
    queryFn:   () => usersService.getDashboardOps(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  /* ── Search ── */
  const [search, setSearch] = useState('');
  const [moduleView, setModuleView] = useState<'card' | 'list' | 'summary'>('card');
  const q = search.toLowerCase().trim();

  useEffect(() => {
    const stored = window.localStorage.getItem('dashboard:modules:view');
    if (stored === 'card' || stored === 'list' || stored === 'summary') setModuleView(stored);
  }, []);

  function changeModuleView(view: 'card' | 'list' | 'summary') {
    setModuleView(view);
    window.localStorage.setItem('dashboard:modules:view', view);
  }

  function matchesQuery(m: SystemModule) {
    return m.name.toLowerCase().includes(q) || (m.type ?? '').toLowerCase().includes(q);
  }

  const filteredHelpdesk  = q ? (matchesQuery(helpdeskModule)  ? helpdeskModule  : null) : helpdeskModule;
  const filteredInventory = q ? (matchesQuery(inventoryModule) ? inventoryModule : null) : inventoryModule;
  const filteredGestion   = q ? (matchesQuery(gestionModule)   ? gestionModule   : null) : gestionModule;

  const filteredActive   = q ? active.filter(matchesQuery)   : active;
  const filteredInactive = q ? inactive.filter(matchesQuery) : inactive;

  /* ── Modals ── */
  const [editModule,   setEditModule]   = useState<SystemModule | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemModule | null>(null);
  const [maintTarget,  setMaintTarget]  = useState<SystemModule | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['modules'] });
    qc.invalidateQueries({ queryKey: ['system-stats'] });
  };

  const toggleMut = useMutation({
    mutationFn: (m: SystemModule) => modulesService.updateModule(m.id, { is_active: !m.is_active }),
    onSuccess:  invalidate,
  });

  function openEdit(m: SystemModule)   { setEditModule(m); setModalOpen(true); }
  function openCreate()                { setEditModule(null); setModalOpen(true); }
  function openDelete(m: SystemModule) { setDeleteTarget(m); }
  function openMaint(m: SystemModule)  { setMaintTarget(m); }

  const displayName = [firstName, lastName].filter(Boolean).join(' ');

  return (
    <div className={styles.pageWrap}>
      <main className={styles.mainContent}>
        {/* ── Header — border-b pb-5 mb-8 flex justify-between ── */}
        <div className={styles.dashHeader}>
          <div>
            <h1 className={styles.welcome}>
              Bienvenido{displayName ? `, ${displayName}` : ''} 👋
            </h1>
            <p className={styles.sub}>
              Selecciona el entorno operativo al cual deseas ingresar para gestionar incidentes, activos o aprobaciones.
            </p>
          </div>
          {/* ── Search ── */}
          <div className={styles.searchRow}>
            <span className={styles.searchLabel}>Buscar módulos</span>
            <input
              type="text"
              placeholder="Escribe para buscar..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className={styles.searchBtn}>Ir</button>
          </div>
        </div>

        {isSuperadmin && sysStats && <DashboardStats stats={sysStats} />}

        {opsData && <DashboardOpsPanel ops={opsData} />}

        <ModulesGrid
          builtins={{ helpdesk: filteredHelpdesk, inventory: filteredInventory, gestion: filteredGestion }}
          active={filteredActive}
          inactive={filteredInactive}
          viewMode={moduleView}
          onViewModeChange={changeModuleView}
          hasModules={!!modules}
          isSuperadmin={isSuperadmin}
          isLoading={isLoading}
          isError={isError}
          isRealModule={isRealModule}
          onEdit={openEdit}
          onToggleActive={m => toggleMut.mutate(m)}
          onDelete={openDelete}
          onMaintenance={openMaint}
          onCreate={openCreate}
        />
      </main>

      <ModuleFormModal
        open={modalOpen}
        module={editModule}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />
      <DeleteModuleModal
        target={deleteTarget}
        username={authUser?.username ?? ''}
        onClose={() => setDeleteTarget(null)}
      />
      <MaintenanceModal
        target={maintTarget}
        onClose={() => setMaintTarget(null)}
      />
    </div>
  );
}
