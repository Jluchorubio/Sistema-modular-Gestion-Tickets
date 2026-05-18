'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, TrendingUp, Clock, CheckCircle2, AlertCircle, Users, XCircle } from 'lucide-react';
import { requestsService, type RequestStatus, type RequestType } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_TYPE_LABELS } from '@/constants/requests';
import { Spinner } from '@/components/ui/Spinner';
import styles from './moduleReports.module.css';

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:     <Clock size={14} />,
  taken:       <TrendingUp size={14} />,
  in_progress: <AlertCircle size={14} />,
  completed:   <CheckCircle2 size={14} />,
  rejected:    <XCircle size={14} />,
  cancelled:   <XCircle size={14} />,
};

/* ── Main ───────────────────────────────────────────────────────────────────── */

export function GestionReportsClient({ moduleId }: { moduleId: string }) {
  const { data: reqData, isLoading: loadingReqs } = useQuery({
    queryKey: ['gestion-reports-requests'],
    queryFn:  () => requestsService.getAll({ limit: 500 }),
    staleTime: 60_000,
  });

  const { data: moduleUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 60_000,
  });

  const { data: allUsersData, isLoading: loadingAll } = useQuery({
    queryKey: ['users-list-roles'],
    queryFn:  () => usersService.getUsers({ limit: 500 }),
    staleTime: 60_000,
  });

  const isLoading = loadingReqs || loadingUsers || loadingAll;
  const allRequests = reqData?.data ?? [];
  const total       = reqData?.meta?.total ?? allRequests.length;
  const allUsers    = allUsersData?.data ?? [];

  const byStatus = useMemo(() =>
    allRequests.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {}),
    [allRequests]
  );

  const byType = useMemo(() =>
    allRequests.reduce<Record<string, number>>((acc, r) => {
      if (r.type !== 'task') {
        acc[r.type] = (acc[r.type] ?? 0) + 1;
      }
      return acc;
    }, {}),
    [allRequests]
  );

  const completionRate = total > 0
    ? Math.round(((byStatus.completed ?? 0) / total) * 100)
    : 0;

  const pending   = (byStatus.pending ?? 0) + (byStatus.taken ?? 0) + (byStatus.in_progress ?? 0);
  const rejected  = byStatus.rejected ?? 0;
  const superadmins = allUsers.filter(u => u.is_superadmin).length;
  const admins      = moduleUsers.filter((u: any) => u.role_name === 'admin_modulo').length;

  const maxStatus = Math.max(...Object.values(byStatus), 1);
  const maxType   = Math.max(...Object.values(byType), 1);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Reportes — Gestión Administrativa</h2>
        <p className={styles.sub}>Métricas globales de solicitudes del sistema</p>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && (
        <>
          {/* ── KPIs ── */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><BarChart2 size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{total}</p>
                <p className={styles.kpiLabel}>Total solicitudes</p>
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconAmber}`}><Clock size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{pending}</p>
                <p className={styles.kpiLabel}>Pendientes / En curso</p>
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}><CheckCircle2 size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{completionRate}%</p>
                <p className={styles.kpiLabel}>Tasa de resolución</p>
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconRed}`}><XCircle size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{rejected}</p>
                <p className={styles.kpiLabel}>Rechazadas</p>
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconPurple}`}><Users size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{superadmins}</p>
                <p className={styles.kpiLabel}>Superadmins</p>
              </div>
            </div>
            <div className={styles.kpi}>
              <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}><Users size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{admins}</p>
                <p className={styles.kpiLabel}>Admins de módulo</p>
              </div>
            </div>
          </div>

          {/* ── By status ── */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Solicitudes por estado</h3>
            <div className={styles.barList}>
              {Object.entries(byStatus).length === 0 && <p className={styles.noData}>Sin datos</p>}
              {Object.entries(byStatus).map(([status, count]) => (
                <div key={status} className={styles.barRow}>
                  <div className={styles.barLabel}>
                    <span className={styles.barIcon} style={{ color: REQUEST_STATUS_COLORS[status as RequestStatus] ?? '#94a3b8' }}>
                      {STATUS_ICON[status] ?? <BarChart2 size={14} />}
                    </span>
                    <span>{REQUEST_STATUS_LABELS[status as RequestStatus] ?? status}</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${(count / maxStatus) * 100}%`,
                        background: REQUEST_STATUS_COLORS[status as RequestStatus] ?? '#94a3b8',
                      }}
                    />
                  </div>
                  <span className={styles.barCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── By type ── */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Solicitudes por tipo</h3>
            <div className={styles.barList}>
              {Object.entries(byType).length === 0 && <p className={styles.noData}>Sin datos</p>}
              {Object.entries(byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className={styles.barRow}>
                    <div className={styles.barLabel}>
                      <span className={styles.barIcon} style={{ color: '#6366f1' }}>
                        <BarChart2 size={14} />
                      </span>
                      <span>{REQUEST_TYPE_LABELS[type as RequestType] ?? type}</span>
                    </div>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${(count / maxType) * 100}%`, background: '#6366f1' }}
                      />
                    </div>
                    <span className={styles.barCount}>{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
