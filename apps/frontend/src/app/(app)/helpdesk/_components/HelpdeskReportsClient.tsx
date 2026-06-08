'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, Users, Clock, Star, TrendingUp, RefreshCw, Download } from 'lucide-react';
import { reportingService, type HelpdeskTechnician } from '@/services/reporting.service';
import api from '@/services/api';
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS } from '@/services/tickets.service';
import { fmtDay } from '@/lib/formatters';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };
type Tab = 'operacion' | 'tecnicos' | 'sla';

function n(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

/* ── KPI card ── */
function KpiCard({ label, value, sub, color = C.coral }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: C.navy }}>{label}</p>
      {sub && <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{sub}</p>}
    </div>
  );
}

/* ── Trend mini chart ── */
function TrendMini({ trend }: { trend: { day: string; created: string }[] }) {
  const max = useMemo(() => Math.max(...trend.map(d => n(d.created)), 1), [trend]);
  if (trend.length === 0) return <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '20px 0' }}>Sin datos</p>;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, padding: '0 4px' }}>
      {trend.map(d => {
        const h = Math.max(4, Math.round((n(d.created) / max) * 60));
        return (
          <div key={d.day} title={`${fmtDay(d.day)}: ${d.created}`}
            style={{ flex: 1, height: h, background: C.coral, borderRadius: '3px 3px 0 0', opacity: n(d.created) === 0 ? 0.2 : 0.85, cursor: 'default' }} />
        );
      })}
    </div>
  );
}

/* ── SLA ring ── */
function SlaRing({ pct }: { pct: number }) {
  const r = 40, circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="#f1f5f9" strokeWidth={11} />
        <circle cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={11}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color }}>{pct}%</p>
      </div>
    </div>
  );
}

/* ── Stars display ── */
function Stars({ score }: { score: number | null }) {
  if (score === null) return <span style={{ fontSize: 10, color: C.muted }}>—</span>;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} style={{ fontSize: 12, color: score >= s ? '#f59e0b' : '#e2e8f0' }}>★</span>
      ))}
      <span style={{ fontSize: 10, color: C.sub, marginLeft: 3 }}>{score.toFixed(1)}</span>
    </span>
  );
}

/* ── Main ── */
export function HelpdeskReportsClient({ moduleId }: { moduleId: string }) {
  const [tab,           setTab]           = useState<Tab>('operacion');
  const [csvExporting,  setCsvExporting]  = useState(false);

  async function handleExportCsv() {
    setCsvExporting(true);
    try {
      const res = await api.get('/reporting/export/tickets', {
        params:       { moduleId },
        responseType: 'blob',
      });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `tickets-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setCsvExporting(false);
    }
  }

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['helpdesk-reports', moduleId],
    queryFn:  () => reportingService.getHelpdeskMetrics(moduleId),
    staleTime: 5 * 60_000,
    enabled:  !!moduleId,
  });

  const kpis       = data?.kpis;
  const byCategory = data?.by_category ?? [];
  const byTech     = data?.by_technician ?? [];
  const sla        = data?.sla;
  const trend      = data?.daily_trend ?? [];

  const slaPct = n(sla?.summary?.compliance_pct);

  const TABS: { key: Tab; label: string; Icon: typeof BarChart2 }[] = [
    { key: 'operacion', label: 'Operación',  Icon: TrendingUp },
    { key: 'tecnicos',  label: 'Técnicos',   Icon: Users      },
    { key: 'sla',       label: 'SLA',        Icon: Clock      },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Mesa de Ayuda</p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: 0 }}>Reportes</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => refetch()} disabled={isFetching}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.sub, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
          <button type="button" onClick={handleExportCsv} disabled={csvExporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: csvExporting ? '#64748b' : C.navy, color: '#fff', fontSize: 11, fontWeight: 700, cursor: csvExporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            <Download size={12} style={{ animation: csvExporting ? 'spin 1s linear infinite' : 'none' }} />
            {csvExporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: '8px 8px 0 0', border: `1px solid ${active ? C.border : 'transparent'}`, borderBottom: active ? '1px solid #fff' : 'none', background: active ? '#fff' : 'transparent', color: active ? C.navy : C.muted, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: active ? -1 : 0 }}>
              <t.Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>Cargando reportes…</div>
      ) : (
        <>
          {/* ── OPERACIÓN ── */}
          {tab === 'operacion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <KpiCard label="Total tickets"    value={n(kpis?.total)}     sub="histórico"        color={C.navy} />
                <KpiCard label="Activos"          value={n(kpis?.open)}      sub="en este momento"  color={C.coral} />
                <KpiCard label="Esta semana"      value={n(kpis?.this_week)} sub="últimos 7 días"   color="#6366f1" />
                <KpiCard label="Rechazados"       value={n(kpis?.rechazados)} sub="total histórico" color={n(kpis?.rechazados) > 0 ? '#f59e0b' : '#22c55e'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <KpiCard label="Hoy"              value={n(kpis?.today)}           sub="tickets creados hoy"     color="#0ea5e9" />
                <KpiCard label="Este mes"         value={n(kpis?.this_month)}       sub="últimos 30 días"         color="#8b5cf6" />
                <KpiCard label="Tiempo prom. resolución" value={kpis?.avg_resolution_hours ? `${Math.round(n(kpis.avg_resolution_hours))}h` : '—'} sub="tickets cerrados" color="#10b981" />
              </div>

              {/* Trend */}
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} style={{ color: C.coral }} /> Tendencia últimos 30 días
                </p>
                <TrendMini trend={trend} />
                {trend.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: C.muted }}>{fmtDay(trend[0].day)}</span>
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>
                      {trend.reduce((s, d) => s + n(d.created), 0)} tickets en total
                    </span>
                    <span style={{ fontSize: 10, color: C.muted }}>{fmtDay(trend[trend.length - 1].day)}</span>
                  </div>
                )}
              </div>

              {/* Por categoría */}
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 14px' }}>Por categoría</p>
                {byCategory.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '16px 0' }}>Sin datos</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {byCategory.map(cat => {
                      const total = n(cat.total);
                      const maxTotal = n(byCategory[0].total);
                      const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                      return (
                        <div key={cat.category_name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.navy }}>{cat.category_name}</span>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <span style={{ fontSize: 10, color: C.coral, fontWeight: 700 }}>{cat.open} activos</span>
                              <span style={{ fontSize: 10, color: C.muted }}>{total} total</span>
                            </div>
                          </div>
                          <div style={{ height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: C.coral, borderRadius: 3, transition: 'width .4s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TÉCNICOS ── */}
          {tab === 'tecnicos' && (
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {byTech.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted }}>
                  <Users size={28} style={{ display: 'block', margin: '0 auto 12px', color: C.border }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin datos de técnicos</p>
                  <p style={{ fontSize: 11, margin: 0 }}>Aún no hay tickets asignados en este módulo.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 90px 110px', gap: 12, padding: '10px 18px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {['Técnico', 'Asignados', 'Resueltos', 'Reprocesos', 'Tiempo prom.', 'Calificación'].map((h, i) => (
                      <span key={i} style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
                    ))}
                  </div>
                  {byTech.map((tech: HelpdeskTechnician) => {
                    const resolved  = n(tech.tickets_resolved);
                    const assigned  = n(tech.tickets_assigned);
                    const resolvePct = assigned > 0 ? Math.round((resolved / assigned) * 100) : 0;
                    const rechazados = n(tech.rechazados);
                    const avgH = tech.avg_resolution_hours ? Math.round(n(tech.avg_resolution_hours)) : null;
                    const rating = tech.avg_rating ? n(tech.avg_rating) : null;
                    return (
                      <div key={tech.technician_id}
                        style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 90px 110px', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
                        {/* Nombre */}
                        <div>
                          <p style={{ margin: '0 0 1px', fontSize: 12.5, fontWeight: 700, color: C.navy }}>{tech.technician_name}</p>
                          <div style={{ height: 4, background: C.bg, borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                            <div style={{ height: '100%', width: `${resolvePct}%`, background: '#22c55e', borderRadius: 2 }} />
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted }}>{resolvePct}% resolución</p>
                        </div>
                        {/* Asignados */}
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{assigned}</span>
                        {/* Resueltos */}
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{resolved}</span>
                        {/* Rechazados */}
                        <span style={{ fontSize: 13, fontWeight: 700, color: rechazados > 0 ? '#f59e0b' : C.muted }}>{rechazados}</span>
                        {/* Tiempo prom */}
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, fontFamily: 'monospace' }}>
                          {avgH !== null ? `${avgH}h` : '—'}
                        </span>
                        {/* Rating */}
                        <div>
                          <Stars score={rating} />
                          {n(tech.total_ratings) > 0 && (
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted }}>{tech.total_ratings} reseña{n(tech.total_ratings) !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* ── SLA ── */}
          {tab === 'sla' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Ring + summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 28px', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <SlaRing pct={slaPct} />
                  <p style={{ margin: '6px 0 0', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Cumplimiento</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Total tickets',     value: n(sla?.summary?.total),       color: C.navy  },
                    { label: 'Sin SLA definido',  value: n(sla?.summary?.without_sla), color: C.muted },
                    { label: 'En cumplimiento',   value: n(sla?.summary?.compliant),   color: '#22c55e' },
                    { label: 'Vencidos (breach)', value: n(sla?.summary?.breached),    color: '#ef4444' },
                  ].map(s => (
                    <div key={s.label} style={{ padding: '10px 14px', background: C.bg, borderRadius: 8 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</p>
                      <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLA por prioridad */}
              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: 0, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>Por prioridad</p>
                {(sla?.by_priority ?? []).length === 0 ? (
                  <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '24px 0' }}>Sin datos</p>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', gap: 12, padding: '9px 18px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                      {['Prioridad', 'Total', 'Vencidos', 'SLA prom.'].map((h, i) => (
                        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
                      ))}
                    </div>
                    {sla!.by_priority.map(row => {
                      const color   = (TICKET_PRIORITY_COLORS as Record<string, string>)[row.priority] ?? C.muted;
                      const breach  = n(row.breached);
                      return (
                        <div key={row.priority} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: C.navy }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            {(TICKET_PRIORITY_LABELS as Record<string, string>)[row.priority] ?? row.priority}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{n(row.total)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: breach > 0 ? '#ef4444' : '#22c55e' }}>{breach}</span>
                          <span style={{ fontSize: 11, color: C.sub, fontFamily: 'monospace' }}>
                            {row.avg_sla_hours ? `${Math.round(n(row.avg_sla_hours))}h` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
