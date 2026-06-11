'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, ShieldCheck, ChevronDown, UserPlus } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { AssignUsersModal } from '@/app/(app)/modules/[id]/AssignUsersModal';
import type { User } from '@/types/user.types';
import styles from './moduleUsers.module.css';
import mgmt  from '@/styles/mgmt.module.css';

interface ModuleUser extends User {
  role_name: string;
}

export function ModuleUsersClient() {
  const qc           = useQueryClient();
  const moduleId     = useUIStore((s) => s.moduleId);
  const authUser     = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;
  const isAdminModulo = !!moduleId && !!authUser?.module_roles?.some(
    (r) => r.module_id === moduleId && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  const canViewMembers = isSuperadmin || isAdminModulo;

  const [assignOpen,    setAssignOpen]    = useState(false);
  const [assignTarget,  setAssignTarget]  = useState<ModuleUser | null>(null);
  const [selectedRole,  setSelectedRole]  = useState('');
  const [showAdd,       setShowAdd]       = useState(false);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId!),
    enabled:  !!moduleId && canViewMembers,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['module-roles', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId!),
    enabled:  !!moduleId,
  });

  const assignMut = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      usersService.assignUserRole(userId, moduleId!, roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-users', moduleId] });
      setAssignOpen(false);
      setAssignTarget(null);
      setSelectedRole('');
    },
  });

  function openAssign(u: ModuleUser) {
    setAssignTarget(u);
    setSelectedRole('');
    setAssignOpen(true);
  }

  if (!moduleId) return (
    <div className={styles.empty}>Módulo no identificado. Regresa al Dashboard e ingresa al módulo.</div>
  );

  return (
    <div className={mgmt.pageWrap}>
    <div className={mgmt.pageContent}>
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Usuarios del módulo</h2>
          {!isLoading && <p className={styles.sub}>{users.length} miembro{users.length !== 1 ? 's' : ''}</p>}
        </div>
        {isSuperadmin && (
          <button type="button" className={styles.btnPrimary} onClick={() => setShowAdd(true)}>
            <UserPlus size={14} />
            Asignar usuarios
          </button>
        )}
      </div>

      {isLoading && <Spinner />}
      {error && <div className={styles.errorMsg}>Error cargando usuarios</div>}

      {!isLoading && !error && users.length === 0 && (
        <div className={styles.empty}>
          <Users size={32} className={styles.emptyIcon} />
          <p>No hay usuarios asignados a este módulo</p>
        </div>
      )}

      {!isLoading && !error && users.length > 0 && (
        <div className={styles.list}>
          {users.map((u) => (
            <div key={u.id} className={styles.row}>
              <div className={styles.avatar}>
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" className={styles.avatarImg} />
                  : <span>{getInitials(u.first_name, u.last_name)}</span>
                }
              </div>
              <div className={styles.info}>
                <p className={styles.name}>{u.first_name} {u.last_name}</p>
                <p className={styles.email}>{(u as any).email ?? ''}</p>
              </div>
              <span className={styles.roleBadge}>{u.role_name}</span>
              <button
                type="button"
                className={styles.btnAction}
                onClick={() => openAssign(u)}
                title="Cambiar rol en módulo"
              >
                <ShieldCheck size={14} />
                Cambiar rol
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add users modal ── */}
      {showAdd && moduleId && (
        <AssignUsersModal
          moduleId={moduleId}
          existingUserIds={new Set(users.map(u => u.id))}
          onClose={() => {
            setShowAdd(false);
            qc.invalidateQueries({ queryKey: ['module-users', moduleId] });
          }}
        />
      )}

      {/* ── Assign role modal ── */}
      {assignOpen && assignTarget && (
        <div className={styles.modalOverlay} onClick={() => setAssignOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Cambiar rol en módulo</h3>
            <p className={styles.modalSub}>
              {assignTarget.first_name} {assignTarget.last_name} — rol actual: <strong>{assignTarget.role_name}</strong>
            </p>

            <div className={styles.selectWrap}>
              <ChevronDown size={14} className={styles.selectIcon} />
              <select
                className={styles.select}
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
              >
                <option value="">Seleccionar nuevo rol…</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setAssignOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!selectedRole || assignMut.isPending}
                onClick={() => selectedRole && assignMut.mutate({ userId: assignTarget.id, roleId: selectedRole })}
              >
                {assignMut.isPending ? 'Guardando…' : 'Guardar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  );
}
