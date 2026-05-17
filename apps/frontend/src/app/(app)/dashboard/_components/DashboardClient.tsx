'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useModules } from '@/hooks/useModules';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleFormModal } from '@/components/modules/ModuleFormModal';
import type { SystemModule } from '@/types/module.types';
import { DashboardStats } from './DashboardStats';
import { ModulesGrid } from './ModulesGrid';
import { DeleteModuleModal } from './DeleteModuleModal';
import { MaintenanceModal } from './MaintenanceModal';
import styles from '../dashboard.module.css';

// Fallback shapes used when built-in modules are not yet returned by the API
const HELPDESK_DEFAULTS: SystemModule = {
  id: '__helpdesk__', name: 'Mesa de Ayuda', slug: 'helpdesk',
  description: 'Gestión de tickets de soporte técnico, incidencias y solicitudes de servicio',
  type: 'helpdesk', image_url: null, color: '#3B82F6',
  is_active: true, has_access: true,
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const INVENTORY_DEFAULTS: SystemModule = {
  id: '__inventory__', name: 'Inventario', slug: 'inventario',
  description: 'Control de activos, equipos, materiales y recursos físicos de la organización',
  type: 'inventario', image_url: null, color: '#10B981',
  is_active: true, has_access: true,
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const GESTION_DEFAULTS: SystemModule = {
  id: '__gestion__', name: 'Gestión Administrativa', slug: 'gestion',
  description: 'Solicitudes de acceso, cambio de rol, corrección de perfil y escalaciones',
  type: 'gestion', image_url: null, color: '#6366F1',
  is_active: true, has_access: true,
  maintenance_mode: false, maintenance_since: null, maintenance_message: null,
  created_at: new Date(0).toISOString(), deleted_at: null,
};

const BUILTIN_SLUGS = new Set(['helpdesk', 'inventario', 'gestion', 'tickets', 'inventory']);

function isRealModule(m: SystemModule): boolean {
  return !m.id.startsWith('__');
}

export function DashboardClient() {
  const qc           = useQueryClient();
  const { user }     = useCurrentUser();
  const authUser     = useAuthStore(s => s.user);
  const { modules, active: activeRaw, inactive: inactiveRaw, isLoading, isError } = useModules();

  const active   = activeRaw.filter(m => !BUILTIN_SLUGS.has(m.slug));
  const inactive = inactiveRaw.filter(m => !BUILTIN_SLUGS.has(m.slug));

  const helpdeskModule  = modules?.find(m => ['helpdesk',  'tickets'].includes(m.slug))    ?? HELPDESK_DEFAULTS;
  const inventoryModule = modules?.find(m => ['inventario','inventory'].includes(m.slug))   ?? INVENTORY_DEFAULTS;
  const gestionModule   = modules?.find(m => m.slug === 'gestion')                          ?? GESTION_DEFAULTS;

  const firstName    = user?.first_name    ?? '';
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: sysStats } = useQuery({
    queryKey:  ['system-stats'],
    queryFn:   () => usersService.getSystemStats(),
    enabled:   isSuperadmin,
    staleTime: 60_000,
  });

  // ── Edit / Create modal ────────────────────────────────────────────────────
  const [editModule, setEditModule] = useState<SystemModule | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  // ── Delete modal ───────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<SystemModule | null>(null);

  // ── Maintenance modal ──────────────────────────────────────────────────────
  const [maintTarget, setMaintTarget] = useState<SystemModule | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['modules'] });

  const toggleMut = useMutation({
    mutationFn: (m: SystemModule) => modulesService.updateModule(m.id, { is_active: !m.is_active }),
    onSuccess:  invalidate,
  });

  function openEdit(m: SystemModule)   { setEditModule(m); setModalOpen(true); }
  function openCreate()                { setEditModule(null); setModalOpen(true); }
  function openDelete(m: SystemModule) { setDeleteTarget(m); }
  function openMaint(m: SystemModule)  { setMaintTarget(m); }

  return (
    <div>
      <div className={styles.welcome}>
        {firstName ? `Hola, ${firstName}` : 'Hola'}
      </div>
      <p className={styles.sub}>Selecciona el módulo al que deseas acceder</p>

      {isSuperadmin && sysStats && <DashboardStats stats={sysStats} />}

      <ModulesGrid
        builtins={{ helpdesk: helpdeskModule, inventory: inventoryModule, gestion: gestionModule }}
        active={active}
        inactive={inactive}
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
