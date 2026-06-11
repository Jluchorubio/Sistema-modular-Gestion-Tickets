'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart2, TrendingUp, Clock, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { requestsService, type RequestStatus } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS } from '@/constants/requests';
import { Spinner } from '@/components/ui/Spinner';
import styles from './moduleReports.module.css';

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:     <Clock size={14} />,
  taken:       <TrendingUp size={14} />,
  in_progress: <AlertCircle size={14} />,
  completed:   <CheckCircle2 size={14} />,
  rejected:    <AlertCircle size={14} />,
  cancelled:   <AlertCircle size={14} />,
};

export function ModuleReportsClient() {
  const moduleId  = useUIStore((s) => s.moduleId);
  const authUser  = useAuthStore((s) => s.user);
  const isSuperadmin  = authUser?.is_superadmin ?? false;
  const isAdminModulo = !!moduleId && !!authUser?.module_roles?.some(
    (r) => r.module_id === moduleId && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  const canViewAll = isSuperadmin || isAdminModulo;

  const { data: reqData, isLoading: loadingReqs } = useQuery({
    queryKey: ['module-reports-requests', moduleId],
    queryFn:  () => requestsService.getAll({ limit: 500 }),
    enabled:  !!moduleId && canViewAll,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId!),
    enabled:  !!moduleId && canViewAll,
  });

  const isLoading = loadingReqs || loadingUsers;
  const allRequests = reqData?.data ?? [];
  const total = reqData?.meta?.total ?? allRequests.length;

  const byStatus = allRequests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const byType = allRequests.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});

  const completionRate = total > 0
    ? Math.round(((byStatus.completed ?? 0) / total) * 100)
    : 0;

  const pending = (byStatus.pending ?? 0) + (byStatus.taken ?? 0) + (byStatus.in_progress ?? 0);

  if (!moduleId) return (
    <div className={styles.empty}>Módulo no identificado. Regresa al Dashboard e ingresa al módulo.</div>
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Reportes del módulo</h2>
        <p className={styles.sub}>Gestión Administrativa — métricas de solicitudes</p>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && (
        <>
          {/* ── KPI Cards ── */}
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
              <div className={`${styles.kpiIcon} ${styles.kpiIconPurple}`}><Users size={18} /></div>
              <div>
                <p className={styles.kpiVal}>{users.length}</p>
                <p className={styles.kpiLabel}>Miembros del módulo</p>
              </div>
            </div>
          </div>

          {/* ── By status ── */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Solicitudes por estado</h3>
            <div className={styles.barList}>
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
                        width: `${total > 0 ? (count / total) * 100 : 0}%`,
                        background: REQUEST_STATUS_COLORS[status as RequestStatus] ?? '#94a3b8',
                      }}
                    />
                  </div>
                  <span className={styles.barCount}>{count}</span>
                </div>
              ))}
              {Object.keys(byStatus).length === 0 && (
                <p className={styles.noData}>Sin datos</p>
              )}
            </div>
          </div>

          {/* ── By type ── */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Solicitudes por tipo</h3>
            <div className={styles.typeGrid}>
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} className={styles.typeCard}>
                  <p className={styles.typeCount}>{count}</p>
                  <p className={styles.typeLabel}>{type.replace(/_/g, ' ')}</p>
                </div>
              ))}
              {Object.keys(byType).length === 0 && (
                <p className={styles.noData}>Sin datos</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
