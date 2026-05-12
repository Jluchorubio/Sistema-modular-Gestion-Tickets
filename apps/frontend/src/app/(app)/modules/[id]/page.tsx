'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { AssignUsersModal } from './AssignUsersModal';
import styles from './module-detail.module.css';

const ROLE_LABEL: Record<string, string> = {
  admin_modulo:  'Admin Módulo',
  jefe_tecnico:  'Jefe Técnico',
  tecnico:       'Técnico',
  usuario:       'Usuario',
};

const ROLE_CLS: Record<string, string> = {
  admin_modulo:  styles.roleAdmin,
  jefe_tecnico:  styles.roleJefe,
  tecnico:       styles.roleTecnico,
  usuario:       styles.roleUsuario,
};

export default function ModuleDetailPage() {
  const { id }          = useParams<{ id: string }>();
  const router          = useRouter();
  const user            = useAuthStore((s) => s.user);
  const isSuperadmin    = user?.is_superadmin ?? false;
  const [showAssign, setShowAssign] = useState(false);

  const {
    data: mod,
    isLoading: modLoading,
    isError: modError,
  } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
  });

  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery({
    queryKey: ['module-members', id],
    queryFn:  () => usersService.getModuleUsers(id),
    enabled:  !!id,
  });

  const techs  = members?.filter((m) => {
    const r = (m as any).role_name as string;
    return r === 'tecnico' || r === 'jefe_tecnico';
  }) ?? [];
  const admins = members?.filter((m) => (m as any).role_name === 'admin_modulo') ?? [];

  if (modLoading) return <Spinner />;
  if (modError || !mod) {
    return <p className={styles.errorMsg}>Error cargando módulo.</p>;
  }

  return (
    <div>
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.breadcrumbLink} onClick={() => router.push('/dashboard')}>
          Módulos
        </button>
        <span>›</span>
        <span>{mod.name}</span>
      </div>

      <div className={styles.header}>
        <div>
          <div className={styles.title}>{mod.name}</div>
          <div className={styles.slug}>{mod.slug}</div>
        </div>
        {isSuperadmin && (
          <button type="button" className={styles.btnPrimary} onClick={() => setShowAssign(true)}>
            + Asignar usuarios
          </button>
        )}
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Miembros</div>
          <div className={styles.statValue}>{members?.length ?? '—'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Técnicos</div>
          <div className={styles.statValue}>{membersLoading ? '—' : techs.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Administradores</div>
          <div className={styles.statValue}>{membersLoading ? '—' : admins.length}</div>
        </div>
      </div>

      <div className={styles.sectionTitle}>Miembros y roles</div>

      {membersLoading && <Spinner />}

      {membersError && (
        <p className={styles.errorMsg}>Error cargando miembros.</p>
      )}

      {showAssign && (
        <AssignUsersModal
          moduleId={id}
          existingUserIds={new Set(members?.map((m) => m.id) ?? [])}
          onClose={() => setShowAssign(false)}
        />
      )}

      {members && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {!members.length && (
                <tr>
                  <td colSpan={4} className={styles.emptyMsg}>
                    Sin miembros en este módulo.
                    {isSuperadmin && ' Usa "Asignar usuarios" para agregar.'}
                  </td>
                </tr>
              )}
              {members.map((m, i) => {
                const initials = getInitials(m.first_name, m.last_name);
                const roleName = (m as any).role_name as string;
                const roleCls  = ROLE_CLS[roleName] ?? styles.roleUsuario;
                const isActive = (m as any).status === 'active';

                return (
                  <tr key={`${m.id}_${roleName}_${i}`}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className={styles.avatarImg} />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>
                        <div>
                          <div className={styles.userName}>
                            {m.first_name} {m.last_name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <span className={`${styles.rolePill} ${roleCls}`}>
                        {ROLE_LABEL[roleName] ?? roleName}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${isActive ? styles.badgeActive : styles.badgeInactive}`}>
                        {isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
