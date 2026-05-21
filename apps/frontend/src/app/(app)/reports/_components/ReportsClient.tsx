'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Ticket, CheckCircle2, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
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

/* ── Stat card ───────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: typeof Ticket; color: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}15` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className={styles.statValue}>{value}</p>
        <p className={styles.statLabel}>{label}</p>
        {sub && <p className={styles.statSub}>{sub}</p>}
      </div>
    </div>
  );
}

/* ── Horizontal bar ──────────────────────────────────────────────────────── */

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

/* ── Trend bar chart ─────────────────────────────────────────────────────── */

function TrendChart({ trend }: { trend: DailyTrend[] }) {
  const maxVal = useMemo(() => Math.max(...trend.map((d) => num(d.created)), 1), [trend]);

  if (trend.length === 0) {
    return <div className={styles.trendEmpty}>Sin datos en los últimos 30 días</div>;
  }

  return (
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
            <div
              className={styles.trendBarFill}
              style={{ height: h, opacity: val === 0 ? 0.2 : 1 }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ── SLA ring ────────────────────────────────────────────────────────────── */

function SlaRing({ pct }: { pct: number }) {
  const r            = 44;
  const circumference = 2 * Math.PI * r;
  const dash         = (pct / 100) * circumference;
  const color        = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={55} cy={55} r={r} fill="none" stroke="#F1F5F9" strokeWidth={12} />
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

/* ── SLA priority table ──────────────────────────────────────────────────── */

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
          const color  = PRIORITY_COLORS[r.priority] ?? '#94A3B8';
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
              <td style={{ color: breach > 0 ? '#EF4444' : '#22C55E', fontWeight: 600 }}>{breach}</td>
              <td className={styles.tableAvg}>{r.avg_sla_hours ? `${Math.round(num(r.avg_sla_hours))}h` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Section card ────────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>{title}</p>
      {children}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */

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
    <ModuleLayout
      title="Reportes"
      description="Análisis de rendimiento, cumplimiento SLA y tendencias de tickets por módulo."
      isSuperadmin={isSuperadmin}
    >
    <div>
      {/* ── Module selector ── */}
      {(isSuperadmin || adminModules.length > 1) && (
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.filterBtn} ${!selectedModule ? styles.filterBtnActive : ''}`}
            onClick={() => setSelectedModule('')}
          >
            Todos
          </button>
          {adminModules.map((m) => (
            <button
              key={m.module_id}
              type="button"
              className={`${styles.filterBtn} ${selectedModule === m.module_id ? styles.filterBtnActive : ''}`}
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
          {/* ── Stat cards ── */}
          <div className={styles.statsGrid}>
            <StatCard label="Total tickets"   value={num(totals?.total)}      icon={Ticket}       color="#6366F1" />
            <StatCard label="Abiertos"         value={num(totals?.open)}       sub="En progreso"   icon={Clock}        color="#F59E0B" />
            <StatCard label="Cerrados"         value={num(totals?.closed)}     sub="Completados"   icon={CheckCircle2} color="#22C55E" />
            <StatCard label="Últimos 7 días"   value={num(totals?.last_7_days)} sub="Nuevos tickets" icon={TrendingUp}  color="#3B82F6" />
          </div>

          {!hasData && (
            <div className={styles.emptyState}>
              <Ticket size={32} className={styles.emptyIcon} />
              <p className={styles.emptyMsg}>Sin datos para mostrar. Crea tickets para ver métricas.</p>
            </div>
          )}

          {hasData && (
            <>
              {/* ── SLA compliance + by priority ── */}
              <div className={styles.gridSla}>
                <Section title="Cumplimiento SLA">
                  <div className={styles.slaWrap}>
                    <div className={styles.slaRingWrap}>
                      <SlaRing pct={compliance} />
                      <div className={styles.slaRingInner}>
                        <span
                          className={styles.slaRingPct}
                          style={{ color: compliance >= 90 ? '#22C55E' : compliance >= 70 ? '#F59E0B' : '#EF4444' }}
                        >
                          {sla?.summary.compliance_pct ? `${compliance}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.slaStats}>
                      {([
                        ['Total',     num(sla?.summary.total),       '#0D1B2A'],
                        ['Conformes', num(sla?.summary.compliant),   '#22C55E'],
                        ['Vencidos',  num(sla?.summary.breached),    '#EF4444'],
                        ['Sin SLA',   num(sla?.summary.without_sla), '#94A3B8'],
                      ] as [string, number, string][]).map(([label, val, color]) => (
                        <div key={label} className={styles.slaStatItem}>
                          <p className={styles.slaStatValue} style={{ color }}>{val}</p>
                          <p className={styles.slaStatLabel}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                <Section title="SLA por prioridad">
                  <SlaPriorityTable rows={sla?.by_priority ?? []} />
                </Section>
              </div>

              {/* ── By state + by priority ── */}
              <div className={styles.gridTwo}>
                <Section title="Tickets por estado">
                  {byState.length === 0
                    ? <p className={styles.noData}>Sin datos</p>
                    : byState.map((s) => (
                      <HBar
                        key={s.state_name}
                        label={s.state_label}
                        value={num(s.total)}
                        total={totalTickets}
                        color={s.is_final ? '#22C55E' : '#6366F1'}
                      />
                    ))
                  }
                </Section>

                <Section title="Tickets por prioridad">
                  {byPriority.length === 0
                    ? <p className={styles.noData}>Sin datos</p>
                    : byPriority.map((p) => (
                      <HBar
                        key={p.priority}
                        label={PRIORITY_LABELS[p.priority] ?? p.priority}
                        value={num(p.total)}
                        total={totalTickets}
                        color={PRIORITY_COLORS[p.priority] ?? '#94A3B8'}
                      />
                    ))
                  }
                </Section>
              </div>

              {/* ── 30-day trend ── */}
              <Section title="Tendencia de creación — últimos 30 días">
                <TrendChart trend={trend} />
                {trend.length > 0 && (
                  <div className={styles.trendFooter}>
                    <span>{fmtDay(trend[0].day)}</span>
                    <span>Total: {trend.reduce((s, d) => s + num(d.created), 0)} tickets</span>
                    <span>{fmtDay(trend[trend.length - 1].day)}</span>
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      )}
    </div>
    </ModuleLayout>
  );
}
