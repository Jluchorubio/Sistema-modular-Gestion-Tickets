'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Loader2 } from 'lucide-react';
import { usersService }  from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import styles from '../users.module.css';

interface ApiModuleRole {
  id:          string;
  module_id:   string;
  module_name: string;
  module_slug: string | null;
  role_id:     string;
  role_name:   string;
  assigned_at: string;
  is_active:   boolean;
}

interface Props {
  userId: string;
}

export function UserModuleRolesSection({ userId }: Props) {
  const qc = useQueryClient();
  const [selModule, setSelModule] = useState('');
  const [selRole,   setSelRole]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const [err,       setErr]       = useState('');

  const { data: userRoles = [], isLoading: rolesLoading } = useQuery<ApiModuleRole[]>({
    queryKey: ['user-roles', userId],
    queryFn:  () => usersService.getUserRoles(userId) as unknown as Promise<ApiModuleRole[]>,
    staleTime: 0,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn:  modulesService.getModules,
    staleTime: 5 * 60_000,
  });

  const { data: availableRoles = [], isLoading: rolesForModLoading } = useQuery({
    queryKey: ['module-roles', selModule],
    queryFn:  () => modulesService.getModuleRoles(selModule),
    enabled:  !!selModule,
    staleTime: 5 * 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['user-roles', userId] });
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const removeMut = useMutation({
    mutationFn: (umrId: string) => usersService.removeRole(userId, umrId),
    onSuccess:  invalidate,
    onError:    (e: any) => setErr(e?.response?.data?.message ?? 'Error al quitar rol'),
  });

  const assignMut = useMutation({
    mutationFn: () => usersService.assignUserRole(userId, selModule, selRole),
    onSuccess:  () => {
      invalidate();
      setAdding(false);
      setSelModule('');
      setSelRole('');
      setErr('');
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Error al asignar rol'),
  });

  const activeModuleIds = new Set(userRoles.filter(r => r.is_active).map(r => r.module_id));
  const assignableModules = modules.filter(m => m.is_active);

  return (
    <div className={styles.moduleRolesSection}>
      <div className={styles.moduleRolesSectionHeader}>
        <span className={styles.moduleRolesSectionTitle}>Roles por módulo</span>
        {!adding && (
          <button
            type="button"
            className={styles.moduleRolesAddBtn}
            onClick={() => { setAdding(true); setErr(''); }}
          >
            <Plus size={11} />
            Asignar
          </button>
        )}
      </div>

      {rolesLoading && (
        <div className={styles.moduleRolesLoading}>
          <Loader2 size={14} className={styles.moduleRolesSpinner} />
          <span>Cargando roles…</span>
        </div>
      )}

      {!rolesLoading && userRoles.filter(r => r.is_active).length === 0 && !adding && (
        <p className={styles.moduleRolesEmpty}>Sin roles de módulo asignados</p>
      )}

      <div className={styles.moduleRolesList}>
        {userRoles.filter(r => r.is_active).map(r => (
          <div key={r.id} className={styles.moduleRoleTag}>
            <span className={styles.moduleRoleTagModule}>{r.module_name}</span>
            <span className={styles.moduleRoleTagSep}>·</span>
            <span className={styles.moduleRoleTagRole}>{r.role_name}</span>
            <button
              type="button"
              className={styles.moduleRoleTagRemove}
              onClick={() => { setErr(''); removeMut.mutate(r.id); }}
              disabled={removeMut.isPending}
              title="Quitar rol"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className={styles.moduleRolesAddForm}>
          <select
            className={styles.moduleRolesSelect}
            value={selModule}
            onChange={e => { setSelModule(e.target.value); setSelRole(''); setErr(''); }}
          >
            <option value="">— Seleccionar módulo —</option>
            {assignableModules.map(m => (
              <option key={m.id} value={m.id} disabled={activeModuleIds.has(m.id)}>
                {m.name}{activeModuleIds.has(m.id) ? ' (ya tiene rol)' : ''}
              </option>
            ))}
          </select>

          {selModule && (
            <select
              className={styles.moduleRolesSelect}
              value={selRole}
              onChange={e => { setSelRole(e.target.value); setErr(''); }}
              disabled={rolesForModLoading}
            >
              <option value="">— Seleccionar rol —</option>
              {availableRoles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}

          {err && <p className={styles.moduleRolesErr}>{err}</p>}

          <div className={styles.moduleRolesAddActions}>
            <button
              type="button"
              className={styles.moduleRolesCancelBtn}
              onClick={() => { setAdding(false); setSelModule(''); setSelRole(''); setErr(''); }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={styles.moduleRolesSaveBtn}
              disabled={!selModule || !selRole || assignMut.isPending}
              onClick={() => assignMut.mutate()}
            >
              {assignMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
