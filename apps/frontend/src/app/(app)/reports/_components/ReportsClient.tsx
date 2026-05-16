'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShieldCheck, Ticket, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { reportingService, type DailyTrend, type SlaByPriority } from '@/services/reporting.service';
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS } from '@/services/tickets.service';

const PRIORITY_COLORS = TICKET_PRIORITY_COLORS as Record<string, string>;
const PRIORITY_LABELS = TICKET_PRIORITY_LABELS as Record<string, string>;
import { fmtDay } from '@/lib/formatters';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function num(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

/* ── Stat card ───────────────────────────────────────────────────────────── */

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: typeof Ticket; color: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3',
      padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 24, fontWeight: 800, color: '#0D1B2A', margin: 0, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0', fontWeight: 500 }}>{label}</p>
        {sub && <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

/* ── Horizontal bar ──────────────────────────────────────────────────────── */

function HBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: '#334155', fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#64748B', fontWeight: 600 }}>{value} <span style={{ color: '#94A3B8', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}

/* ── Trend bar chart ─────────────────────────────────────────────────────── */

function TrendChart({ trend }: { trend: DailyTrend[] }) {
  const maxVal = useMemo(() => Math.max(...trend.map((d) => num(d.created)), 1), [trend]);

  if (trend.length === 0) {
    return <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12 }}>Sin datos en los últimos 30 días</div>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100, paddingBottom: 20, overflowX: 'auto' }}>
      {trend.map((d) => {
        const h    = Math.max(4, Math.round((num(d.created) / maxVal) * 80));
        const val  = num(d.created);
        return (
          <div
            key={d.day}
            title={`${fmtDay(d.day)}: ${val} ticket${val !== 1 ? 's' : ''}`}
            style={{ flex: '0 0 auto', width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'default' }}
          >
            <div style={{ width: '100%', height: h, background: '#6366F1', borderRadius: '3px 3px 0 0', opacity: val === 0 ? .2 : 1, transition: 'opacity .2s' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4F46E5')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#6366F1')}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ── SLA ring ────────────────────────────────────────────────────────────── */

function SlaRing({ pct }: { pct: number }) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;
  const color = pct >= 90 ? '#22C55E' : pct >= 70 ? '#F59E0B' : '#EF4444';

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
  if (rows.length === 0) return <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '12px 0' }}>Sin datos</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
          {['Prioridad', 'Total', 'Vencidos', 'SLA prom. (h)'].map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: 10 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const color  = PRIORITY_COLORS[r.priority] ?? '#94A3B8';
          const breach = num(r.breached);
          return (
            <tr key={r.priority} style={{ borderBottom: '1px solid #F8FAFC' }}>
              <td style={{ padding: '8px 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  <span style={{ color: '#334155', fontWeight: 500 }}>{PRIORITY_LABELS[r.priority] ?? r.priority}</span>
                </span>
              </td>
              <td style={{ padding: '8px 8px', color: '#334155', fontWeight: 600 }}>{num(r.total)}</td>
              <td style={{ padding: '8px 8px' }}>
                <span style={{ color: breach > 0 ? '#EF4444' : '#22C55E', fontWeight: 600 }}>{breach}</span>
              </td>
              <td style={{ padding: '8px 8px', color: '#64748B' }}>
                {r.avg_sla_hours ? `${Math.round(num(r.avg_sla_hours))}h` : '—'}
              </td>
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
    <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</p>
      {children}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */

export function ReportsClient() {
  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const adminModules = useMemo(() => {
    const eligibleRoles = ['admin_modulo', 'jefe_tecnico'];
    const roles = user?.module_roles?.filter(
      (r) => r.status === 'active' && eligibleRoles.includes(r.role_name),
    ) ?? [];
    const seen = new Set<string>();
    return roles.filter((r) => { if (seen.has(r.module_id)) return false; seen.add(r.module_id); return true; });
  }, [user]);

  const [selectedModule, setSelectedModule] = useState<string>('');

  const moduleId = selectedModule || undefined;

  const { data: sla, isLoading: slaLoading } = useQuery({
    queryKey: ['reports-sla', moduleId],
    queryFn:  () => reportingService.getSlaMetrics(moduleId),
    staleTime: 2 * 60_000,
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['reports-tickets', moduleId],
    queryFn:  () => reportingService.getTicketsSummary(moduleId),
    staleTime: 2 * 60_000,
  });

  const isLoading = slaLoading || ticketsLoading;

  const totals     = tickets?.totals;
  const byState    = tickets?.by_state    ?? [];
  const byPriority = tickets?.by_priority ?? [];
  const trend      = tickets?.daily_trend ?? [];

  const totalTickets = num(totals?.total);
  const compliance   = num(sla?.summary.compliance_pct);

  const hasData = totalTickets > 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Reportes</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
            {selectedModule
              ? adminModules.find((m) => m.module_id === selectedModule)?.module_name ?? 'Módulo seleccionado'
              : 'Vista global — todos los módulos'}
          </p>
        </div>
      </div>

      {/* ── Module selector ── */}
      {(isSuperadmin || adminModules.length > 1) && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setSelectedModule('')}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${!selectedModule ? '#6366F1' : '#E2E8F0'}`, background: !selectedModule ? '#6366F115' : '#fff', color: !selectedModule ? '#6366F1' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
            Todos
          </button>
          {adminModules.map((m) => (
            <button key={m.module_id} type="button" onClick={() => setSelectedModule(m.module_id)}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1.5px solid ${selectedModule === m.module_id ? '#6366F1' : '#E2E8F0'}`, background: selectedModule === m.module_id ? '#6366F115' : '#fff', color: selectedModule === m.module_id ? '#6366F1' : '#64748B', cursor: 'pointer', fontFamily: 'inherit' }}>
              {m.module_name}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Cargando métricas…
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── Stat cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Total tickets" value={num(totals?.total)} icon={Ticket} color="#6366F1" />
            <StatCard label="Abiertos" value={num(totals?.open)} sub="En progreso" icon={Clock} color="#F59E0B" />
            <StatCard label="Cerrados" value={num(totals?.closed)} sub="Completados" icon={CheckCircle2} color="#22C55E" />
            <StatCard label="Últimos 7 días" value={num(totals?.last_7_days)} sub="Nuevos tickets" icon={TrendingUp} color="#3B82F6" />
          </div>

          {!hasData && (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <Ticket size={32} style={{ color: '#CBD5E1', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Sin datos para mostrar. Crea tickets para ver métricas.</p>
            </div>
          )}

          {hasData && (
            <>
              {/* ── SLA + by priority ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 16 }}>
                {/* SLA compliance ring */}
                <Section title="Cumplimiento SLA">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', width: 110, height: 110 }}>
                      <SlaRing pct={compliance} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: compliance >= 90 ? '#22C55E' : compliance >= 70 ? '#F59E0B' : '#EF4444' }}>
                          {sla?.summary.compliance_pct ? `${compliance}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', width: '100%', marginTop: 8 }}>
                      {([
                        ['Total',     num(sla?.summary.total),       '#0D1B2A'],
                        ['Conformes', num(sla?.summary.compliant),   '#22C55E'],
                        ['Vencidos',  num(sla?.summary.breached),    '#EF4444'],
                        ['Sin SLA',   num(sla?.summary.without_sla), '#94A3B8'],
                      ] as [string, number, string][]).map(([label, val, color]) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>{val}</p>
                          <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* SLA by priority */}
                <Section title="SLA por prioridad">
                  <SlaPriorityTable rows={sla?.by_priority ?? []} />
                </Section>
              </div>

              {/* ── By state + by priority ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <Section title="Tickets por estado">
                  {byState.length === 0
                    ? <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>Sin datos</p>
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
                    ? <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>Sin datos</p>
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
                <div>
                  <TrendChart trend={trend} />
                  {trend.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                      <span>{fmtDay(trend[0].day)}</span>
                      <span>Total: {trend.reduce((s, d) => s + num(d.created), 0)} tickets</span>
                      <span>{fmtDay(trend[trend.length - 1].day)}</span>
                    </div>
                  )}
                </div>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
