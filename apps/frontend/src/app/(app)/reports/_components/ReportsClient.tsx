'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { ADMIN_ROLES } from '@/constants/roles';
import { reportingService, type DailyTrend, type SlaByPriority } from '@/services/reporting.service';
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS } from '@/services/tickets.service';
import { fmtDay } from '@/lib/formatters';
import styles from '../reports.module.css';

const PRIORITY_COLORS = TICKET_PRIORITY_COLORS as Record<string, string>;
const PRIORITY_LABELS = TICKET_PRIORITY_LABELS as Record<string, string>;

function num(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

/* ── Horizontal bar ── */
function HBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={styles.hbar}>
      <div className={styles.hbarLabels}>
        <span className={styles.hbarName}>{label}</span>
        <span className={styles.hbarCount}>
          {value} <span className={styles.hbarPct}>({pct}%)</span>
        </span>
      </div>
      <div className={styles.hbarTrack}>
        <div className={styles.hbarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Trend bar chart ── */
function TrendChart({ trend }: { trend: DailyTrend[] }) {
  const maxVal = useMemo(() => Math.max(...trend.map((d) => num(d.created)), 1), [trend]);

  if (trend.length === 0) {
    return <div className={styles.trendEmpty}>Sin datos en los últimos 30 días</div>;
  }

  return (
    <>
      <div className={styles.trendBars}>
        {trend.map((d) => {
          const h   = Math.max(4, Math.round((num(d.created) / maxVal) * 80));
          const val = num(d.created);
          return (
            <div
              key={d.day}
              className={styles.trendBarWrap}
              title={`${fmtDay(d.day)}: ${val} ticket${val !== 1 ? 's' : ''}`}
            >
              <div className={styles.trendBarFill} style={{ height: h, opacity: val === 0 ? 0.2 : 1 }} />
            </div>
          );
        })}
      </div>
      <div className={styles.trendFooter}>
        <span>{fmtDay(trend[0].day)}</span>
        <span>Total: {trend.reduce((s, d) => s + num(d.created), 0)} tickets</span>
        <span>{fmtDay(trend[trend.length - 1].day)}</span>
      </div>
    </>
  );
}

/* ── SLA ring ── */
function SlaRing({ pct }: { pct: number }) {
  const r             = 44;
  const circumference = 2 * Math.PI * r;
  const dash          = (pct / 100) * circumference;
  const color         = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={55} cy={55} r={r} fill="none" stroke="#f1f5f9" strokeWidth={12} />
      <circle
        cx={55} cy={55} r={r} fill="none"
        stroke={color} strokeWidth={12}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
    </svg>
  );
}

/* ── SLA priority table ── */
function SlaPriorityTable({ rows }: { rows: SlaByPriority[] }) {
  if (rows.length === 0) return <p className={styles.noData}>Sin datos</p>;
  return (
    <table className={styles.table}>
      <thead className={styles.tableHead}>
        <tr>
          {['Prioridad', 'Total', 'Vencidos', 'SLA prom. (h)'].map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className={styles.tableBody}>
        {rows.map((r) => {
          const color  = PRIORITY_COLORS[r.priority] ?? '#94a3b8';
          const breach = num(r.breached);
          return (
            <tr key={r.priority}>
              <td>
                <span className={styles.tablePriority}>
                  <span className={styles.tableDot} style={{ background: color }} />
                  <span className={styles.tablePrioName}>{PRIORITY_LABELS[r.priority] ?? r.priority}</span>
                </span>
              </td>
              <td className={styles.tableTotal}>{num(r.total)}</td>
              <td style={{ color: breach > 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{breach}</td>
              <td className={styles.tableAvg}>{r.avg_sla_hours ? `${Math.round(num(r.avg_sla_hours))}h` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Main ── */
export function ReportsClient() {
  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const adminModules = useMemo(() => {
    const roles = user?.module_roles?.filter(
      (r) => r.status === 'active' && (ADMIN_ROLES as string[]).includes(r.role_name),
    ) ?? [];
    const seen = new Set<string>();
    return roles.filter((r) => { if (seen.has(r.module_id)) return false; seen.add(r.module_id); return true; });
  }, [user]);

  const [selectedModule, setSelectedModule] = useState<string>('');
  const moduleId = selectedModule || undefined;

  const { data: sla, isLoading: slaLoading } = useQuery({
    queryKey:  ['reports-sla', moduleId],
    queryFn:   () => reportingService.getSlaMetrics(moduleId),
    staleTime: 2 * 60_000,
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey:  ['reports-tickets', moduleId],
    queryFn:   () => reportingService.getTicketsSummary(moduleId),
    staleTime: 2 * 60_000,
  });

  const isLoading = slaLoading || ticketsLoading;

  const totals     = tickets?.totals;
  const byState    = tickets?.by_state    ?? [];
  const byPriority = tickets?.by_priority ?? [];
  const trend      = tickets?.daily_trend ?? [];

  const totalTickets = num(totals?.total);
  const compliance   = num(sla?.summary.compliance_pct);
  const hasData      = totalTickets > 0;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Centro de Reportes y Auditoría</h1>
            <p className={styles.sub}>Estadísticas avanzadas, nivel de servicio de acuerdos de SLA y registro de auditoría de seguridad global.</p>
          </div>
        </div>

        {/* ── Module filter ── */}
        {(isSuperadmin || adminModules.length > 1) && (
          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterBtn}${!selectedModule ? ` ${styles.filterBtnActive}` : ''}`}
              onClick={() => setSelectedModule('')}
            >
              Todos los módulos
            </button>
            {adminModules.map((m) => (
              <button
                key={m.module_id}
                type="button"
                className={`${styles.filterBtn}${selectedModule === m.module_id ? ` ${styles.filterBtnActive}` : ''}`}
                onClick={() => setSelectedModule(m.module_id)}
              >
                {m.module_name}
              </button>
            ))}
          </div>
        )}

        {isLoading && <div className={styles.loading}>Cargando métricas…</div>}

        {!isLoading && (
          <>
            {/* ── 4 metric cards ── */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Cumplimiento SLA General</span>
                <span className={`${styles.metricValue} ${styles.metricValueGreen}`}>
                  {sla?.summary.compliance_pct ? `${compliance}%` : '—'}
                </span>
                <span className={styles.metricTrend}>
                  ↑ Basado en tickets con SLA activo
                </span>
              </div>

              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Total Tickets</span>
                <span className={`${styles.metricValue} ${styles.metricValueDark}`}>
                  {num(totals?.total)}
                </span>
                <span className={styles.metricTrend}>
                  Abiertos: {num(totals?.open)} · Cerrados: {num(totals?.closed)}
                </span>
              </div>

              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Tickets Vencidos SLA</span>
                <span className={`${styles.metricValue} ${styles.metricValueCoral}`}>
                  {num(sla?.summary.breached)}
                </span>
                <span className={styles.metricTrend}>
                  Sin SLA asignado: {num(sla?.summary.without_sla)}
                </span>
              </div>

              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Últimos 7 Días</span>
                <span className={`${styles.metricValue} ${styles.metricValueDark}`}>
                  {num(totals?.last_7_days)} tickets
                </span>
                <span className={styles.metricTrend}>
                  <span className={styles.metricTrendDot} />
                  Nuevos tickets creados
                </span>
              </div>
            </div>

            {!hasData && (
              <div className={styles.emptyState}>
                <Ticket size={32} className={styles.emptyIcon} />
                <p className={styles.emptyMsg}>Sin datos para mostrar. Crea tickets para ver métricas.</p>
              </div>
            )}

            {hasData && (
              <>
                {/* ── Charts split 7/5 ── */}
                <div className={styles.chartsGrid}>
                  {/* Left: 30-day trend */}
                  <div className={styles.chartPanel}>
                    <div>
                      <h3 className={styles.chartPanelTitle}>
                        <span className={styles.chartPanelTitleAccent}>▲</span>
                        Tendencia de Creación de Tickets (30 días)
                      </h3>
                      <p className={styles.chartPanelSub}>
                        Volumen diario de tickets abiertos en el período reciente.
                      </p>
                    </div>
                    <div className={styles.chartArea}>
                      <TrendChart trend={trend} />
                    </div>
                  </div>

                  {/* Right: SLA ring */}
                  <div className={styles.chartPanel}>
                    <div>
                      <h3 className={styles.chartPanelTitle}>
                        Cumplimiento de SLA
                      </h3>
                      <p className={styles.chartPanelSub}>
                        Porcentaje de tickets resueltos antes del vencimiento límite.
                      </p>
                    </div>
                    <div className={styles.chartArea} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div className={styles.slaWrap}>
                        <div className={styles.slaRingWrap}>
                          <SlaRing pct={compliance} />
                          <div className={styles.slaRingInner}>
                            <span
                              className={styles.slaRingPct}
                              style={{ color: compliance >= 90 ? '#22c55e' : compliance >= 70 ? '#f59e0b' : '#ef4444' }}
                            >
                              {sla?.summary.compliance_pct ? `${compliance}%` : '—'}
                            </span>
                          </div>
                        </div>
                        <div className={styles.slaStats}>
                          {([
                            ['Total',     num(sla?.summary.total),       '#0e2235'],
                            ['Conformes', num(sla?.summary.compliant),   '#22c55e'],
                            ['Vencidos',  num(sla?.summary.breached),    '#ef4444'],
                            ['Sin SLA',   num(sla?.summary.without_sla), '#94a3b8'],
                          ] as [string, number, string][]).map(([label, val, color]) => (
                            <div key={label} className={styles.slaStatItem}>
                              <p className={styles.slaStatValue} style={{ color }}>{val}</p>
                              <p className={styles.slaStatLabel}>{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Detail sections ── */}
                <div className={styles.sectionsGrid}>
                  <div className={styles.section}>
                    <p className={styles.sectionTitle}>Tickets por Estado</p>
                    {byState.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : byState.map((s) => (
                        <HBar
                          key={s.state_name}
                          label={s.state_label}
                          value={num(s.total)}
                          total={totalTickets}
                          color={s.is_final ? '#22c55e' : '#4f46e5'}
                        />
                      ))
                    }
                  </div>

                  <div className={styles.section}>
                    <p className={styles.sectionTitle}>Tickets por Prioridad</p>
                    {byPriority.length === 0
                      ? <p className={styles.noData}>Sin datos</p>
                      : byPriority.map((p) => (
                        <HBar
                          key={p.priority}
                          label={PRIORITY_LABELS[p.priority] ?? p.priority}
                          value={num(p.total)}
                          total={totalTickets}
                          color={PRIORITY_COLORS[p.priority] ?? '#94a3b8'}
                        />
                      ))
                    }
                  </div>

                  <div className={styles.section}>
                    <p className={styles.sectionTitle}>SLA por Prioridad</p>
                    <SlaPriorityTable rows={sla?.by_priority ?? []} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Audit log table ── */}
        <div className={styles.auditWrap}>
          <div className={styles.auditHead}>
            <span className={styles.auditHeadTitle}>Logs e Historial de Auditoría de Seguridad</span>
            <span className={styles.auditBadge}>AUDIT REALTIME</span>
          </div>
          <div className={styles.auditScroll}>
            <table className={styles.auditTable}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor / Operador</th>
                  <th>Acción / Subsistema</th>
                  <th>Descripción del Evento de Auditoría</th>
                  <th>IP Origen</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className={styles.auditEmpty}>
                    Módulo de auditoría en configuración. Los registros aparecerán aquí cuando el sistema empiece a capturar eventos.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
