'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Check, ShieldCheck } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import type { GlobalRole } from '@/types/user.types';
import styles from './profile.module.css';

interface Props {
  userId:              string;
  currentGlobalRoleId: string | null | undefined;
}

export function RoleManagementPanel({ userId, currentGlobalRoleId }: Props) {
  const qc = useQueryClient();

  const [assignOpen,   setAssignOpen]   = useState(false);
  const [selModule,    setSelModule]    = useState('');
  const [selRole,      setSelRole]      = useState('');
  const [assignMsg,    setAssignMsg]    = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedGlobalRoleId, setSelectedGlobalRoleId] = useState(currentGlobalRoleId ?? '');
  const [globalMsg,    setGlobalMsg]    = useState<string | null>(null);
  const [removingId,   setRemovingId]   = useState<string | null>(null);

  const { data: roles = [] } = useQuery({
    queryKey: ['user-roles', userId],
    queryFn:  () => usersService.getUserRoles(userId),
    staleTime: 30_000,
  });

  const { data: globalRoles = [] } = useQuery({
    queryKey: ['global-roles'],
    queryFn:  () => usersService.getGlobalRoles(),
    staleTime: 60_000,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
    enabled:  assignOpen,
    staleTime: 60_000,
  });

  const { data: moduleRoles = [] } = useQuery({
    queryKey: ['module-roles', selModule],
    queryFn:  () => modulesService.getModuleRoles(selModule),
    enabled:  !!selModule,
    staleTime: 60_000,
  });

  const invalidateRoles = () => {
    qc.invalidateQueries({ queryKey: ['user-roles', userId] });
    qc.invalidateQueries({ queryKey: ['user', userId] });
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const removeMut = useMutation({
    mutationFn: (umrId: string) => usersService.removeRole(userId, umrId),
    onMutate:   (umrId) => setRemovingId(umrId),
    onSettled:  () => setRemovingId(null),
    onSuccess:  invalidateRoles,
  });

  const assignMut = useMutation({
    mutationFn: () => usersService.assignUserRole(userId, selModule, selRole),
    onSuccess: () => {
      setAssignMsg({ ok: true, text: 'Rol asignado' });
      invalidateRoles();
      setTimeout(() => {
        setAssignOpen(false);
        setAssignMsg(null);
        setSelModule('');
        setSelRole('');
      }, 700);
    },
    onError: (e: Error) => setAssignMsg({ ok: false, text: e.message ?? 'Error al asignar' }),
  });

  const globalRoleMut = useMutation({
    mutationFn: (roleId: string | null) =>
      usersService.updateUser(userId, { global_role_id: roleId ?? undefined }),
    onSuccess: () => {
      setGlobalMsg('Actualizado');
      invalidateRoles();
      setTimeout(() => setGlobalMsg(null), 2000);
    },
    onError: () => setGlobalMsg('Error'),
  });

  const activeRoles = roles.filter(r => r.status === 'active');

  function closeAssign() {
    setAssignOpen(false);
    setAssignMsg(null);
    setSelModule('');
    setSelRole('');
  }

  return (
    <div>
      {/* ── Global role selector ──────────────────────── */}
      <p className={styles.leftSectionTitle} style={{ marginBottom: 8 }}>
        <ShieldCheck size={11} style={{ display: 'inline', marginRight: 4 }} />
        Rol global
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <select
          className={styles.formInput}
          style={{ flex: 1, fontSize: 12 }}
          value={selectedGlobalRoleId}
          onChange={e => setSelectedGlobalRoleId(e.target.value)}
        >
          <option value="">Sin rol global</option>
          {(globalRoles as GlobalRole[]).filter(r => r.is_active).map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={styles.btnPrimary}
          style={{ padding: '7px 12px', flexShrink: 0 }}
          disabled={
            globalRoleMut.isPending ||
            selectedGlobalRoleId === (currentGlobalRoleId ?? '')
          }
          onClick={() => globalRoleMut.mutate(selectedGlobalRoleId || null)}
          title="Guardar rol global"
        >
          <Check size={13} />
        </button>
      </div>
      {globalMsg && (
        <p style={{ fontSize: 11, color: '#15803D', marginBottom: 8 }}>{globalMsg}</p>
      )}

      {/* ── Module roles list ─────────────────────────── */}
      <p className={styles.leftSectionTitle} style={{ marginTop: 12, marginBottom: 8 }}>
        Roles por módulo
      </p>
      {activeRoles.length === 0 && (
        <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
          Sin roles de módulo asignados.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {activeRoles.map(r => (
          <div key={r.umr_id} className={styles.roleRow}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.module_name}
              </p>
              <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{r.role_name}</p>
            </div>
            <button
              type="button"
              className={styles.roleRemoveBtn}
              onClick={() => removeMut.mutate(r.umr_id)}
              disabled={removingId === r.umr_id}
              title="Quitar rol"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={styles.btnSecondary}
        style={{ fontSize: 12, padding: '6px 12px', width: '100%' }}
        onClick={() => { setAssignOpen(true); setAssignMsg(null); }}
      >
        <Plus size={12} /> Asignar a módulo
      </button>

      {/* ── Assign modal ──────────────────────────────── */}
      {assignOpen && (
        <div className={styles.assignModalBackdrop} onClick={closeAssign}>
          <div className={styles.assignModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0D1B2A' }}>
                Asignar rol en módulo
              </h3>
              <button type="button" className={styles.cameraClose} onClick={closeAssign}>
                <X size={15} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Módulo</label>
              <select
                className={styles.formInput}
                value={selModule}
                onChange={e => { setSelModule(e.target.value); setSelRole(''); }}
              >
                <option value="">Seleccionar módulo…</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {selModule && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Rol</label>
                <select
                  className={styles.formInput}
                  value={selRole}
                  onChange={e => setSelRole(e.target.value)}
                >
                  <option value="">Seleccionar rol…</option>
                  {moduleRoles.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {assignMsg && (
              <p className={assignMsg.ok ? styles.msgOk : styles.msgErr}>{assignMsg.text}</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ flex: 1 }}
                onClick={closeAssign}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ flex: 1 }}
                disabled={!selModule || !selRole || assignMut.isPending}
                onClick={() => assignMut.mutate()}
              >
                <Check size={13} />
                {assignMut.isPending ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
