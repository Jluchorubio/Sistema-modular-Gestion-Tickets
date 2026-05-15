'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Layers, Users, Ticket, TrendingUp, AlertTriangle, WrenchIcon } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useModules } from '@/hooks/useModules';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleCard } from '@/components/modules/ModuleCard';
import { ModuleFormModal } from '@/components/modules/ModuleFormModal';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { SystemModule } from '@/types/module.types';
import styles from '../dashboard.module.css';
import mstyles from '@/components/ui/modal.module.css';

export function DashboardClient() {
  const router                                             = useRouter();
  const qc                                                 = useQueryClient();
  const { user }                                           = useCurrentUser();
  const authUser                                           = useAuthStore(s => s.user);
  const { modules, active, inactive, isLoading, isError } = useModules();

  const firstName    = user?.first_name    ?? '';
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: sysStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn:  () => usersService.getSystemStats(),
    enabled:  isSuperadmin,
    staleTime: 60_000,
  });

  const [modalOpen,   setModalOpen]   = useState(false);
  const [editModule,  setEditModule]  = useState<SystemModule | null>(null);

  // ── Safe delete modal ──────────────────────────────────────────────────────
  const [deleteTarget,    setDeleteTarget]    = useState<SystemModule | null>(null);
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [deleteUserInput, setDeleteUserInput] = useState('');
  const [deleteError,     setDeleteError]     = useState('');

  // ── Maintenance modal ──────────────────────────────────────────────────────
  const [maintTarget,  setMaintTarget]  = useState<SystemModule | null>(null);
  const [maintMessage, setMaintMessage] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['modules'] });

  const toggleMut = useMutation({
    mutationFn: (m: SystemModule) =>
      modulesService.updateModule(m.id, { is_active: !m.is_active }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => modulesService.deleteModule(id),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteNameInput('');
      setDeleteUserInput('');
      setDeleteError('');
      invalidate();
    },
    onError: () => setDeleteError('Error al eliminar el módulo. Intenta de nuevo.'),
  });

  const maintMut = useMutation({
    mutationFn: ({ id, enabled, message }: { id: string; enabled: boolean; message?: string }) =>
      modulesService.toggleMaintenance(id, enabled, message),
    onSuccess: () => {
      setMaintTarget(null);
      setMaintMessage('');
      invalidate();
    },
  });

  function openCreate() {
    setEditModule(null);
    setModalOpen(true);
  }

  function openEdit(m: SystemModule) {
    setEditModule(m);
    setModalOpen(true);
  }

  function openDelete(m: SystemModule) {
    setDeleteTarget(m);
    setDeleteNameInput('');
    setDeleteUserInput('');
    setDeleteError('');
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const expectedName = deleteTarget.name;
    const expectedUser = authUser?.username ?? '';

    if (deleteNameInput !== expectedName) {
      setDeleteError(`El nombre del módulo no coincide. Escribe exactamente: "${expectedName}"`);
      return;
    }
    if (!expectedUser || deleteUserInput !== expectedUser) {
      setDeleteError(`El nombre de usuario no coincide. Escribe exactamente: "${expectedUser}"`);
      return;
    }
    deleteMut.mutate(deleteTarget.id);
  }

  function openMaintenance(m: SystemModule) {
    setMaintTarget(m);
    setMaintMessage(m.maintenance_message ?? '');
  }

  return (
    <div>
      <div className={styles.welcome}>
        {firstName ? `Hola, ${firstName}` : 'Hola'}
      </div>
      <p className={styles.sub}>Selecciona el módulo al que deseas acceder</p>

      {/* ── Stats strip (superadmin only, #12) ── */}
      {isSuperadmin && sysStats && (
        <div className={styles.statsStrip}>
          <div className={styles.statCard}>
            <Layers size={16} className={styles.statCardIcon} />
            <div>
              <span className={styles.statCardValue}>{sysStats.modules.total}</span>
              <span className={styles.statCardLabel}>Módulos</span>
            </div>
            <div className={styles.statCardSub}>
              todos accesibles
            </div>
          </div>
          <div className={styles.statCard}>
            <Users size={16} className={styles.statCardIcon} />
            <div>
              <span className={styles.statCardValue}>{sysStats.users.total}</span>
              <span className={styles.statCardLabel}>Usuarios</span>
            </div>
            <div className={styles.statCardSub}>
              {sysStats.users.active} activos · {sysStats.users.inactive} inactivos
            </div>
          </div>
          <div className={styles.statCard}>
            <Ticket size={16} className={styles.statCardIcon} />
            <div>
              <span className={styles.statCardValue}>{sysStats.tickets.total}</span>
              <span className={styles.statCardLabel}>Tickets</span>
            </div>
            <div className={styles.statCardSub}>
              {sysStats.tickets.open} abiertos
            </div>
          </div>
          <div className={styles.statCard}>
            <AlertTriangle size={16} className={styles.statCardIcon} style={{ color: sysStats.requests.pending > 0 ? '#F59E0B' : undefined }} />
            <div>
              <span className={styles.statCardValue}>{sysStats.requests.pending}</span>
              <span className={styles.statCardLabel}>Solicitudes</span>
            </div>
            <div className={styles.statCardSub}>
              {sysStats.requests.in_progress} en proceso · {sysStats.requests.total} total
            </div>
          </div>
        </div>
      )}

      {isLoading && <Spinner />}

      {isError && (
        <p className={styles.errorMsg}>Error cargando módulos. Intenta recargar.</p>
      )}

      {modules && (
        <>
          <div className={styles.sectionTitle}>Módulos disponibles</div>
          <div className={styles.grid}>
            {!active.length && !isSuperadmin && (
              <span className={styles.emptyMsg}>No tienes módulos asignados.</span>
            )}
            {active.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                isSuperadmin={isSuperadmin}
                onClick={() => router.push(`/modules/${m.id}`)}
                onEdit={() => openEdit(m)}
                onToggleActive={() => toggleMut.mutate(m)}
                onDelete={() => openDelete(m)}
                onToggleMaintenance={() => openMaintenance(m)}
              />
            ))}
            {isSuperadmin && (
              <button type="button" className={styles.createCard} onClick={openCreate}>
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
                    onClick={() => router.push(`/modules/${m.id}`)}
                    onEdit={() => openEdit(m)}
                    onToggleActive={() => toggleMut.mutate(m)}
                    onDelete={() => openDelete(m)}
                    onToggleMaintenance={() => openMaintenance(m)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ModuleFormModal
        open={modalOpen}
        module={editModule}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />

      {/* ── Safe Delete Modal ── */}
      <Modal
        open={!!deleteTarget}
        title="Eliminar módulo"
        onClose={() => setDeleteTarget(null)}
      >
        <div style={{ padding: '0 0 4px' }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            background: '#450a0a', border: '1px solid #7f1d1d',
            borderRadius: 8, padding: '12px 14px', marginBottom: 18,
          }}>
            <AlertTriangle size={16} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#fca5a5', margin: 0, lineHeight: 1.5 }}>
              Esta acción moverá el módulo a la papelera. Se conservará 90 días antes del borrado definitivo.
            </p>
          </div>

          <label className={mstyles.fieldLabel}>
            Escribe el nombre del módulo: <strong>{deleteTarget?.name}</strong>
          </label>
          <input
            className={mstyles.fieldInput}
            placeholder={deleteTarget?.name ?? ''}
            value={deleteNameInput}
            onChange={e => { setDeleteNameInput(e.target.value); setDeleteError(''); }}
          />

          <label className={mstyles.fieldLabel} style={{ marginTop: 14 }}>
            Escribe tu nombre de usuario: <strong>{authUser?.username}</strong>
          </label>
          <input
            className={mstyles.fieldInput}
            placeholder={authUser?.username ?? ''}
            value={deleteUserInput}
            onChange={e => { setDeleteUserInput(e.target.value); setDeleteError(''); }}
          />

          {deleteError && (
            <div className={mstyles.msgErr} style={{ marginTop: 10 }}>{deleteError}</div>
          )}
        </div>

        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => setDeleteTarget(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className={mstyles.actDanger}
            onClick={confirmDelete}
            disabled={deleteMut.isPending || !deleteNameInput || !deleteUserInput}
          >
            {deleteMut.isPending ? 'Eliminando…' : 'Eliminar módulo'}
          </button>
        </div>
      </Modal>

      {/* ── Maintenance Modal ── */}
      <Modal
        open={!!maintTarget}
        title={maintTarget?.maintenance_mode ? 'Desactivar mantenimiento' : 'Activar modo mantenimiento'}
        onClose={() => setMaintTarget(null)}
      >
        <div style={{ padding: '0 0 4px' }}>
          {!maintTarget?.maintenance_mode ? (
            <>
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: '#451a03', border: '1px solid #78350f',
                borderRadius: 8, padding: '12px 14px', marginBottom: 18,
              }}>
                <WrenchIcon size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#fde68a', margin: 0, lineHeight: 1.5 }}>
                  Los usuarios sin rol de admin no podrán acceder al módulo <strong>{maintTarget?.name}</strong> mientras esté en mantenimiento.
                </p>
              </div>
              <label className={mstyles.fieldLabel}>Mensaje de mantenimiento (opcional)</label>
              <textarea
                className={mstyles.fieldInput}
                placeholder="Ej: Estamos realizando actualizaciones. Volvemos en breve."
                style={{ minHeight: 80, resize: 'vertical' }}
                value={maintMessage}
                onChange={e => setMaintMessage(e.target.value)}
              />
            </>
          ) : (
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
              ¿Desactivar el modo mantenimiento del módulo <strong>{maintTarget?.name}</strong>?
              Los usuarios podrán acceder nuevamente.
            </p>
          )}
        </div>

        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => setMaintTarget(null)}>
            Cancelar
          </button>
          <button
            type="button"
            className={maintTarget?.maintenance_mode ? mstyles.actConfirm : mstyles.actDanger}
            disabled={maintMut.isPending}
            onClick={() => maintTarget && maintMut.mutate({
              id: maintTarget.id,
              enabled: !maintTarget.maintenance_mode,
              message: maintMessage || undefined,
            })}
          >
            {maintMut.isPending
              ? 'Procesando…'
              : maintTarget?.maintenance_mode ? 'Desactivar mantenimiento' : 'Activar mantenimiento'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
