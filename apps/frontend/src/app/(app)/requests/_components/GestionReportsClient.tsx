'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart2, Clock, CheckCircle2, XCircle, Users, Shield, TrendingUp, ChevronDown, Download,
} from 'lucide-react';
import { requestsService, type RequestStatus, type RequestType } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { reportingService } from '@/services/reporting.service';
import { usePermission } from '@/hooks/usePermission';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_TYPE_LABELS } from '@/constants/requests';
import { Spinner } from '@/components/ui/Spinner';
import mgmt from '@/styles/mgmt.module.css';
import styles from '@/app/(app)/reports/reports.module.css';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function n(v: string | null | undefined): number { return v ? parseFloat(v) : 0; }
type Severity = 'critical' | 'warning' | 'info' | 'success';
function getSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('login_failed') || a.includes('locked') || a.includes('permission')) return 'critical';
  if (a.includes('update') || a.includes('config') || a.includes('role')) return 'warning';
  if (a.includes('created') || a.includes('completed') || a.includes('resolved')) return 'success';
  return 'info';
}
function humanizeAction(action: string): string {
  return action.replace(/\./g, ' · ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return 'Hace un momento';
  if (diff < 3600_000)  return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `Hace ${Math.floor(diff / 3600_000)}h`;
  return new Date(iso).toLocaleDateString('es-CO');
}
const SEV = {
  critical: { color: '#ef4444', label: 'CRÍTICO' },
  warning:  { color: '#f59e0b', label: 'AVISO'   },
  info:     { color: '#3b82f6', label: 'INFO'     },
  success:  { color: '#22c55e', label: 'OK'       },
} as const;
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' };

type Tab = 'solicitudes' | 'aprobaciones' | 'auditoria';
const TABS: { key: Tab; label: string; Icon: typeof BarChart2 }[] = [
  { key: 'solicitudes',  label: 'Solicitudes',  Icon: BarChart2   },
  { key: 'aprobaciones', label: 'Aprobaciones', Icon: CheckCircle2 },
  { key: 'auditoria',    label: 'Auditoría',    Icon: Shield      },
];

function KpiCard({ label, value, sub, color = C.coral, Icon }: {
  label: string; value: string | number; sub?: string; color?: string; Icon?: typeof BarChart2;
}) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {Icon && (
        <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={17} style={{ color }} />
        </div>
      )}
      <div>
        <p style={{ margin: '0 0 2px', fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '0 0 1px', fontSize: 11, fontWeight: 700, color: C.navy }}>{label}</p>
        {sub && <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{sub}</p>}
      </div>
    </div>
  );
}

export function GestionReportsClient({ moduleId }: { moduleId: string }) {
  const canViewMembers = usePermission('gestion:users:view');
  const [tab,         setTab]        = useState<Tab>('solicitudes');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom,   setAuditFrom]   = useState('');
  const [auditTo,     setAuditTo]     = useState('');

  const { data: reqData, isLoading: loadingReqs } = useQuery({
    queryKey: ['gestion-reports-requests'],
    queryFn:  () => requestsService.getAll({ limit: 500 }),
    staleTime: 60_000,
  });

  const { data: moduleUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    enabled:  canViewMembers,
    staleTime: 60_000,
  });

  const { data: allUsersData, isLoading: loadingAll } = useQuery({
    queryKey: ['users-list-roles'],
    queryFn:  () => usersService.getUsers({ limit: 500 }),
    enabled:  canViewMembers,
    staleTime: 60_000,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey: ['gestion-audit', auditAction, auditFrom, auditTo],
    queryFn:  () => reportingService.getAuditLogFiltered({
      limit:    80,
      action:   auditAction || undefined,
      dateFrom: auditFrom   || undefined,
      dateTo:   auditTo     || undefined,
    }),
    staleTime: 60_000,
    enabled:   tab === 'auditoria',
  });

  const { data: auditKpis } = useQuery({
    queryKey: ['gestion-audit-kpis'],
    queryFn:  () => reportingService.getAuditKpis(),
    staleTime: 60_000,
    enabled:   tab === 'auditoria',
  });

  const { data: auditActivity } = useQuery({
    queryKey: ['gestion-audit-activity'],
    queryFn:  () => reportingService.getAuditUserActivity(10),
    staleTime: 5 * 60_000,
    enabled:   tab === 'auditoria',
  });

  const isLoading  = loadingReqs || loadingUsers || loadingAll;
  const allReqs    = reqData?.data ?? [];
  const total      = reqData?.meta?.total ?? allReqs.length;
  const allUsers   = allUsersData?.data ?? [];

  const byStatus = allReqs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const byType = allReqs.reduce<Record<string, number>>((acc, r) => {
    if (r.type !== 'task') { acc[r.type] = (acc[r.type] ?? 0) + 1; }
    return acc;
  }, {});

  const completionRate = total > 0 ? Math.round(((byStatus.completed ?? 0) / total) * 100) : 0;
  const pending   = (byStatus.pending ?? 0) + (byStatus.taken ?? 0) + (byStatus.in_progress ?? 0);
  const rejected  = byStatus.rejected ?? 0;
  const superadmins = allUsers.filter((u: any) => u.is_superadmin).length;
  const admins      = (moduleUsers as any[]).filter((u: any) => u.role_name === 'admin_modulo').length;

  // Recharts data
  const statusChartData = Object.entries(byStatus).map(([status, count]) => ({
    name:  REQUEST_STATUS_LABELS[status as RequestStatus] ?? status,
    value: count,
    color: REQUEST_STATUS_COLORS[status as RequestStatus] ?? C.muted,
  }));

  const typeChartData = Object.entries(byType)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({
      name:  REQUEST_TYPE_LABELS[type as RequestType] ?? type,
      value: count,
      color: '#3b82f6',
    }));

  const activityData = (auditActivity ?? []).map((u: any) => ({
    name:  (u.actor_name ?? u.actor_email ?? '—').split(' ').slice(0, 2).join(' '),
    count: n(u.action_count),
  }));

  // Approval breakdown
  const approvalData = [
    { name: 'Completadas', value: byStatus.completed ?? 0, color: '#22c55e' },
    { name: 'Pendientes',  value: pending,                 color: '#f59e0b' },
    { name: 'Rechazadas',  value: rejected,                color: '#ef4444' },
    { name: 'Canceladas',  value: byStatus.cancelled ?? 0, color: C.muted   },
  ].filter(d => d.value > 0);

  return (
    <div className={mgmt.pageWrap}>
    <div className={mgmt.pageContent}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.headerLabel}>Gestión Administrativa</p>
          <h1 className={styles.title}>Reportes</h1>
          <p className={styles.sub}>Solicitudes · Aprobaciones · Auditoría</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab}${tab === t.key ? ` ${styles.tabActive}` : ''}`}
            onClick={() => setTab(t.key)}
          >
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}

      {!isLoading && (
        <>
          {/* ══ SOLICITUDES ══ */}
          {tab === 'solicitudes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.kpiGrid}>
                <KpiCard label="Total solicitudes"  value={total}          color={C.navy}   Icon={BarChart2}    />
                <KpiCard label="Pendientes / En curso" value={pending}    color="#f59e0b"  Icon={Clock}        sub="En proceso" />
                <KpiCard label="Tasa de resolución" value={`${completionRate}%`} color="#22c55e" Icon={TrendingUp} />
                <KpiCard label="Rechazadas"         value={rejected}       color="#ef4444"  Icon={XCircle}      />
                <KpiCard label="Superadmins"        value={superadmins}    color="#8b5cf6"  Icon={Users}        />
                <KpiCard label="Admins de módulo"   value={admins}         color="#3b82f6"  Icon={Users}        />
              </div>

              <div className={styles.chartsGrid}>
                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Por estado</p>
                  <p className={styles.chartSub}>Distribución actual de solicitudes.</p>
                  <div className={styles.chartArea} style={{ minHeight: 260 }}>
                    {statusChartData.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={statusChartData} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={100} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" name="Solicitudes" radius={[0,4,4,0]}>
                              {statusChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )
                    }
                  </div>
                </div>

                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Por tipo</p>
                  <p className={styles.chartSub}>Tipos de solicitudes más frecuentes.</p>
                  <div className={styles.chartArea} style={{ minHeight: 260 }}>
                    {typeChartData.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={typeChartData} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={110} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" name="Solicitudes" fill="#3b82f6" radius={[0,4,4,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ APROBACIONES ══ */}
          {tab === 'aprobaciones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.kpiGrid}>
                <KpiCard label="Completadas"     value={byStatus.completed ?? 0} color="#22c55e" Icon={CheckCircle2} />
                <KpiCard label="Tasa aprobación" value={`${completionRate}%`}    color="#22c55e" Icon={TrendingUp}   />
                <KpiCard label="Pendientes"      value={pending}                 color="#f59e0b" Icon={Clock}        />
                <KpiCard label="Rechazadas"      value={rejected}                color="#ef4444" Icon={XCircle}      />
              </div>

              <div className={styles.chartsGrid}>
                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Distribución de resultados</p>
                  <p className={styles.chartSub}>Completadas vs pendientes vs rechazadas.</p>
                  <div className={styles.chartArea} style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {approvalData.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : (
                        <div style={{ position: 'relative', width: 200, height: 200 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={approvalData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={84} paddingAngle={3}>
                                {approvalData.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <span style={{ fontSize: 26, fontWeight: 900, color: '#22c55e', lineHeight: 1 }}>{completionRate}%</span>
                            <span style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>aprobación</span>
                          </div>
                        </div>
                      )
                    }
                  </div>
                </div>

                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Por tipo de solicitud</p>
                  <p className={styles.chartSub}>Volumen de aprobaciones por categoría.</p>
                  <div className={styles.chartArea} style={{ minHeight: 260 }}>
                    {typeChartData.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={typeChartData} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} />
                            <YAxis tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" name="Solicitudes" fill="#22c55e" radius={[4,4,0,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ AUDITORÍA ══ */}
          {tab === 'auditoria' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.auditKpiGrid}>
                <div className={styles.auditKpiCard}>
                  <p className={styles.auditKpiVal}>{n(auditKpis?.total_today)}</p>
                  <p className={styles.auditKpiLabel}>Eventos hoy</p>
                </div>
                <div className={styles.auditKpiCard}>
                  <p className={styles.auditKpiVal} style={n(auditKpis?.critical_today) > 0 ? { color: '#ef4444' } : undefined}>{n(auditKpis?.critical_today)}</p>
                  <p className={styles.auditKpiLabel}>Críticos hoy</p>
                </div>
                <div className={styles.auditKpiCard}>
                  <p className={styles.auditKpiVal}>{n(auditKpis?.config_changes)}</p>
                  <p className={styles.auditKpiLabel}>Cambios config.</p>
                </div>
                <div className={styles.auditKpiCard}>
                  <p className={styles.auditKpiVal}>{n(auditKpis?.role_changes)}</p>
                  <p className={styles.auditKpiLabel}>Cambios de rol</p>
                </div>
              </div>

              <div className={styles.auditFilters}>
                <span className={styles.auditFilterLabel}>Filtrar:</span>
                <input className={styles.auditFilterInput} placeholder="Acción (ej: request)" value={auditAction} onChange={e => setAuditAction(e.target.value)} />
                <input type="date" className={styles.auditFilterInput} value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
                <span className={styles.dateSep}>—</span>
                <input type="date" className={styles.auditFilterInput} value={auditTo} onChange={e => setAuditTo(e.target.value)} />
                {(auditAction || auditFrom || auditTo) && (
                  <button type="button" className={styles.dateClear} onClick={() => { setAuditAction(''); setAuditFrom(''); setAuditTo(''); }}>Limpiar</button>
                )}
              </div>

              <div className={styles.chartsGrid}>
                <div>
                  <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Timeline de eventos</p>
                  {auditLoading ? (
                    <div className={styles.loading} style={{ padding: '40px 0' }}>Cargando eventos…</div>
                  ) : (
                    <div className={styles.timeline}>
                      {(auditLog ?? []).length === 0 ? (
                        <div className={styles.timelineEmpty}>Sin eventos registrados.</div>
                      ) : (
                        (auditLog ?? []).map((e) => {
                          const sev = getSeverity(e.action);
                          const cfg = SEV[sev];
                          return (
                            <div key={e.id} className={styles.timelineItem}>
                              <div className={styles.timelineDot} style={{ background: cfg.color, marginTop: 4 }} />
                              <div className={styles.timelineContent}>
                                <div className={styles.timelineTop}>
                                  <span className={styles.timelineSev} style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}12` }}>{cfg.label}</span>
                                  <span className={styles.timelineActor}>{e.actor_name ?? e.actor_email ?? 'Sistema'}</span>
                                  <span className={styles.timelineAction}>{humanizeAction(e.action)}</span>
                                </div>
                                <div className={styles.timelineMeta}>
                                  <span>{relativeTime(e.created_at)}</span>
                                  {e.entity_id && <span>· #{e.entity_id.slice(0, 8)}</span>}
                                  {e.ip_address && <span>· {e.ip_address}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Actividad por usuario (30 días)</p>
                  <div className={styles.chartPanel} style={{ padding: '16px 12px' }}>
                    <div style={{ height: 260 }}>
                      {activityData.length === 0
                        ? <p className={styles.noData}>Sin actividad registrada.</p>
                        : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityData} layout="vertical" margin={{ left: 0, right: 12 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={90} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [v, 'Acciones']} />
                              <Bar dataKey="count" name="Acciones" fill={C.navy} radius={[0,4,4,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </div>
    </div>
  );
}
