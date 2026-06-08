'use client';

import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { ROLE_DISPLAY, ROLE_AVAIL_COLOR } from './_types';
import styles from '../calendar.module.css';

export function AvailabilityPanel({ moduleId }: { moduleId?: string }) {
  const { data: members } = useQuery({
    queryKey: ['calendar-module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId!),
    enabled:  !!moduleId,
    staleTime: 5 * 60_000,
  });

  const users = (members as Array<{ id: string; first_name: string; last_name: string; job_title: string | null; role_name: string }> | undefined)?.slice(0, 5) ?? [];
  const showMock = !moduleId || users.length === 0;
  const mockData = [
    { name: 'Soporte L1',    role: 'tecnico',      color: '#3b82f6' },
    { name: 'Admin BD',      role: 'admin_modulo', color: '#ff5e3a' },
    { name: 'Redes / Infra', role: 'tecnico',      color: '#3b82f6' },
  ];

  return (
    <div className={styles.availSection}>
      <h3 className={styles.sideSectionLabel}>Disponibilidad Técnica</h3>
      <div className={styles.availList}>
        {showMock
          ? mockData.map(({ name, role, color }) => (
              <div key={name} className={styles.availItem}>
                <div className={styles.availLeft}>
                  <span className={styles.availDot} style={{ background: color }} />
                  <span className={styles.availName}>{name}</span>
                </div>
                <span className={styles.availBadge} style={{ color, background: `${color}18` }}>
                  {ROLE_DISPLAY[role] ?? role}
                </span>
              </div>
            ))
          : users.map((u) => {
              const color = ROLE_AVAIL_COLOR[u.role_name] ?? '#94a3b8';
              return (
                <div key={u.id} className={styles.availItem}>
                  <div className={styles.availLeft}>
                    <span className={styles.availDot} style={{ background: color }} />
                    <span className={styles.availName}>{u.first_name} {u.last_name}</span>
                  </div>
                  <span className={styles.availBadge} style={{ color, background: `${color}18` }}>
                    {ROLE_DISPLAY[u.role_name] ?? u.role_name}
                  </span>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}
