'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Users } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { Spinner } from '@/components/ui/Spinner';
import styles from './moduleRoles.module.css';

export function ModuleRolesClient() {
  const moduleId = useUIStore((s) => s.moduleId);

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['module-roles', moduleId],
    queryFn:  () => modulesService.getModuleRoles(moduleId!),
    enabled:  !!moduleId,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId!),
    enabled:  !!moduleId,
  });

  const isLoading = loadingRoles || loadingUsers;

  const usersByRole = (roleName: string) =>
    users.filter((u) => u.role_name === roleName);

  if (!moduleId) return (
    <div className={styles.empty}>Módulo no identificado. Regresa al Dashboard e ingresa al módulo.</div>
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Roles del módulo</h2>
        {!isLoading && <p className={styles.sub}>{roles.length} rol{roles.length !== 1 ? 'es' : ''} disponibles</p>}
      </div>

      {isLoading && <Spinner />}

      {!isLoading && roles.length === 0 && (
        <div className={styles.empty}>
          <ShieldCheck size={32} className={styles.emptyIcon} />
          <p>No hay roles definidos para este módulo</p>
        </div>
      )}

      {!isLoading && roles.length > 0 && (
        <div className={styles.list}>
          {roles.map((role) => {
            const members = usersByRole(role.name);
            return (
              <div key={role.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.roleIcon}>
                    <ShieldCheck size={16} />
                  </div>
                  <div className={styles.roleInfo}>
                    <p className={styles.roleName}>{role.name}</p>
                    {role.description && (
                      <p className={styles.roleDesc}>{role.description}</p>
                    )}
                  </div>
                  <span className={styles.memberCount}>
                    <Users size={12} />
                    {members.length} miembro{members.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {members.length > 0 && (
                  <div className={styles.memberList}>
                    {members.map((u) => (
                      <span key={u.id} className={styles.memberChip}>
                        {u.first_name} {u.last_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
