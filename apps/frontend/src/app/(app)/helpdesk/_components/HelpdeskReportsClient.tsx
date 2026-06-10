'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart2, Users, Clock, TrendingUp, RefreshCw, Download,
  Shield, Star, ChevronDown,
} from 'lucide-react';
import { reportingService, type HelpdeskTechnician } from '@/services/reporting.service';
import api from '@/services/api';
import { getPriorityConfig } from '@/constants/status';
import { fmtDay } from '@/lib/formatters';
import mgmt from '@/styles/mgmt.module.css';
import styles from '@/app/(app)/reports/reports.module.css';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

type Tab = 'operacion' | 'tecnicos' | 'sla' | 'auditoria';

const TABS: { key: Tab; label: string; Icon: typeof BarChart2 }[] = [
  { key: 'operacion',  label: 'Operación',  Icon: TrendingUp },
  { key: 'tecnicos',   label: 'Técnicos',   Icon: Users      },
  { key: 'sla',        label: 'SLA',        Icon: Clock      },
  { key: 'auditoria',  label: 'Auditoría',  Icon: Shield     },
];

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

const TOOLTIP_STYLE = {
  fontSize: 11,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,.08)',
};

function KpiCard({ label, value, sub, color = C.coral }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: C.navy }}>{label}</p>
      {sub && <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{sub}</p>}
    </div>
  );
}

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

export function HelpdeskReportsClient({ moduleId }: { moduleId: string }) {
  const [tab,          setTab]          = useState<Tab>('operacion');
  const [exportOpen,   setExportOpen]   = useState(false);
  const [csvLoading,   setCsvLoading]   = useState(false);
  const [auditAction,  setAuditAction]  = useState('');
  const [auditFrom,    setAuditFrom]    = useState('');
  const [auditTo,      setAuditTo]      = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey:  ['helpdesk-reports', moduleId],
    queryFn:   () => reportingService.getHelpdeskMetrics(moduleId),
    staleTime: 5 * 60_000,
    enabled:   !!moduleId,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey:  ['helpdesk-audit', moduleId, auditAction, auditFrom, auditTo],
    queryFn:   () => reportingService.getAuditLogFiltered({
      limit:      80,
      entityType: 'ticket',
      action:     auditAction || undefined,
      dateFrom:   auditFrom   || undefined,
      dateTo:     auditTo     || undefined,
    }),
    staleTime: 60_000,
    enabled:   !!moduleId && tab === 'auditoria',
  });

  const { data: auditKpis } = useQuery({
    queryKey:  ['helpdesk-audit-kpis'],
    queryFn:   () => reportingService.getAuditKpis(),
    staleTime: 60_000,
    enabled:   !!moduleId && tab === 'auditoria',
  });

  const { data: auditActivity } = useQuery({
    queryKey:  ['helpdesk-audit-activity'],
    queryFn:   () => reportingService.getAuditUserActivity(10),
    staleTime: 5 * 60_000,
    enabled:   !!moduleId && tab === 'auditoria',
  });

  const kpis       = data?.kpis;
  const byCategory = data?.by_category ?? [];
  const byTech     = data?.by_technician ?? [];
  const byPriority = data?.by_priority ?? [];
  const sla        = data?.sla;
  const trend      = data?.daily_trend ?? [];
  const slaPct     = n(sla?.summary?.compliance_pct);

  const trendData = trend.map(d => ({ name: fmtDay(d.day).slice(0, 6), tickets: n(d.created) }));

  const techResolutionData = byTech
    .filter(t => n(t.avg_resolution_hours) > 0)
    .map(t => ({
      name:  t.technician_name.split(' ').slice(0, 2).join(' '),
      horas: Math.round(n(t.avg_resolution_hours)),
    }))
    .sort((a, b) => a.horas - b.horas)
    .slice(0, 10);

  const techVolumeData = byTech.map(t => ({
    name:      t.technician_name.split(' ').slice(0, 2).join(' '),
    asignados: n(t.tickets_assigned),
    resueltos: n(t.tickets_resolved),
  })).slice(0, 10);

  const priorityData = byPriority.map(p => ({
    name:     getPriorityConfig(p.priority).label,
    total:    n(p.total),
    vencidos: n(p.breached),
    color:    getPriorityConfig(p.priority).color,
  }));

  const slaDonutData = [
    { name: 'Cumplidos', value: n(sla?.summary?.compliant),   color: '#22c55e' },
    { name: 'Vencidos',  value: n(sla?.summary?.breached),    color: '#ef4444' },
    { name: 'Sin SLA',   value: n(sla?.summary?.without_sla), color: '#e2e8f0' },
  ].filter(d => d.value > 0);

  const activityData = (auditActivity ?? []).map(u => ({
    name:  (u.actor_name ?? u.actor_email ?? '—').split(' ').slice(0, 2).join(' '),
    count: n(u.action_count),
  }));

  const handleCsvExport = useCallback(async () => {
    setCsvLoading(true);
    setExportOpen(false);
    try {
      const res = await api.get('/reporting/export/tickets', {
        params: { moduleId },
        responseType: 'blob',
      });
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `helpdesk-tickets-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  }, [moduleId]);

  return (
    <div className={mgmt.pageWrap}>
    <div className={mgmt.pageContent}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.headerLabel}>Mesa de Ayuda</p>
          <h1 className={styles.title}>Reportes</h1>
          <p className={styles.sub}>Operación · Técnicos · SLA · Auditoría</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={styles.refreshBtn}>
            <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
          <div className={styles.exportWrap} ref={exportRef}>
            <button type="button" className={styles.exportBtn} disabled={csvLoading} onClick={() => setExportOpen(v => !v)}>
              <Download size={12} />
              {csvLoading ? 'Exportando…' : 'Exportar'}
              <ChevronDown size={11} />
            </button>
            {exportOpen && (
              <div className={styles.exportDropdown}>
                <button type="button" className={styles.exportDropdownItem} onClick={handleCsvExport}>
                  <Download size={13} /> Exportar CSV
                </button>
              </div>
            )}
          </div>
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

      {isLoading ? (
        <div className={styles.loading}>Cargando reportes…</div>
      ) : (
        <>
          {/* ══ OPERACIÓN ══ */}
          {tab === 'operacion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.kpiGrid}>
                <KpiCard label="Total tickets"          value={n(kpis?.total)}      sub="histórico"       color={C.navy}    />
                <KpiCard label="Activos"                value={n(kpis?.open)}       sub="ahora mismo"     color={C.coral}   />
                <KpiCard label="Esta semana"            value={n(kpis?.this_week)}  sub="últimos 7 días"  color="#3b82f6"   />
                <KpiCard label="Este mes"               value={n(kpis?.this_month)} sub="últimos 30 días" color="#8b5cf6"   />
                <KpiCard label="Hoy"                    value={n(kpis?.today)}      sub="tickets creados" color="#0ea5e9"   />
                <KpiCard label="Tiempo prom. resolución" value={kpis?.avg_resolution_hours ? `${Math.round(n(kpis.avg_resolution_hours))}h` : '—'} sub="tickets cerrados" color="#10b981" />
                <KpiCard label="Rechazados"             value={n(kpis?.rechazados)} color={n(kpis?.rechazados) > 0 ? '#f59e0b' : '#22c55e'} />
                <KpiCard label="Reabiertos"             value={n(kpis?.reopen_count)} color={n(kpis?.reopen_count) > 0 ? '#ef4444' : '#22c55e'} />
              </div>

              <div className={styles.chartPanel}>
                <p className={styles.chartTitle}><TrendingUp size={13} style={{ color: C.coral }} /> Tendencia últimos 30 días</p>
                <p className={styles.chartSub}>Volumen diario de tickets creados.</p>
                <div className={styles.chartArea} style={{ minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hdTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={C.coral} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={C.coral} stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
                      <YAxis tick={{ fontSize: 9, fill: C.muted }} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [v, 'Tickets']} />
                      <Area type="monotone" dataKey="tickets" stroke={C.coral} fill="url(#hdTrendGrad)" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {byCategory.length > 0 && (
                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Por categoría</p>
                  <div style={{ minHeight: 220 }}>
                    <ResponsiveContainer width="100%" height={Math.max(200, byCategory.length * 34)}>
                      <BarChart data={byCategory.map(c => ({ name: c.category_name, activos: n(c.open), cerrados: n(c.closed) }))} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={110} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="activos"  name="Activos"  fill={C.coral}   radius={[0,4,4,0]} stackId="a" />
                        <Bar dataKey="cerrados" name="Cerrados" fill="#22c55e"  radius={[0,4,4,0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TÉCNICOS ══ */}
          {tab === 'tecnicos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Table */}
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
                      const resolved    = n(tech.tickets_resolved);
                      const assigned    = n(tech.tickets_assigned);
                      const resolvePct  = assigned > 0 ? Math.round((resolved / assigned) * 100) : 0;
                      const rechazados  = n(tech.rechazados);
                      const avgH        = tech.avg_resolution_hours ? Math.round(n(tech.avg_resolution_hours)) : null;
                      const rating      = tech.avg_rating ? n(tech.avg_rating) : null;
                      return (
                        <div key={tech.technician_id}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 90px 110px', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
                          <div>
                            <p style={{ margin: '0 0 1px', fontSize: 12.5, fontWeight: 700, color: C.navy }}>{tech.technician_name}</p>
                            <div style={{ height: 4, background: C.bg, borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
                              <div style={{ height: '100%', width: `${resolvePct}%`, background: '#22c55e', borderRadius: 2 }} />
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted }}>{resolvePct}% resolución</p>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{assigned}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{resolved}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: rechazados > 0 ? '#f59e0b' : C.muted }}>{rechazados}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.sub, fontFamily: 'monospace' }}>{avgH !== null ? `${avgH}h` : '—'}</span>
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

              {/* Charts (only when data exists) */}
              {byTech.length > 0 && (
                <div className={styles.chartsGrid}>

                  {/* avg_resolution_hours per tech */}
                  <div className={styles.chartPanel}>
                    <p className={styles.chartTitle}><Clock size={12} style={{ color: C.coral }} /> Tiempo promedio de resolución</p>
                    <p className={styles.chartSub}>Horas desde apertura hasta cierre — menos es mejor.</p>
                    {techResolutionData.length === 0 ? (
                      <p className={styles.noData} style={{ marginTop: 24 }}>Sin tickets cerrados con datos de tiempo.</p>
                    ) : (
                      <div style={{ minHeight: Math.max(180, techResolutionData.length * 36) }}>
                        <ResponsiveContainer width="100%" height={Math.max(180, techResolutionData.length * 36)}>
                          <BarChart data={techResolutionData} layout="vertical" margin={{ left: 4, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} unit="h" allowDecimals={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={100} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}h`, 'Prom. resolución']} />
                            <Bar dataKey="horas" name="Horas" radius={[0,4,4,0]}>
                              {techResolutionData.map((entry, i) => {
                                const maxH  = Math.max(...techResolutionData.map(d => d.horas));
                                const ratio = maxH > 0 ? entry.horas / maxH : 0;
                                const color = ratio < 0.33 ? '#22c55e' : ratio < 0.66 ? '#f59e0b' : '#ef4444';
                                return <Cell key={i} fill={color} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* assigned vs resolved grouped */}
                  <div className={styles.chartPanel}>
                    <p className={styles.chartTitle}><Users size={12} style={{ color: C.navy }} /> Carga por técnico</p>
                    <p className={styles.chartSub}>Tickets asignados vs resueltos — gap = backlog activo.</p>
                    <div style={{ minHeight: Math.max(180, techVolumeData.length * 36) }}>
                      <ResponsiveContainer width="100%" height={Math.max(180, techVolumeData.length * 36)}>
                        <BarChart data={techVolumeData} layout="vertical" margin={{ left: 4, right: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={100} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="asignados" name="Asignados" fill={C.navy}   radius={[0,3,3,0]} />
                          <Bar dataKey="resueltos"  name="Resueltos"  fill="#22c55e" radius={[0,3,3,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ══ SLA ══ */}
          {tab === 'sla' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className={styles.kpiGrid}>
                <KpiCard label="Total con SLA"   value={n(sla?.summary?.total)}       color={C.navy}    />
                <KpiCard label="Cumplimiento"    value={`${slaPct}%`}                  color={slaPct >= 90 ? '#22c55e' : slaPct >= 70 ? '#f59e0b' : '#ef4444'} />
                <KpiCard label="Vencidos"        value={n(sla?.summary?.breached)}    color="#ef4444"  sub="Breach activo" />
                <KpiCard label="Sin SLA"         value={n(sla?.summary?.without_sla)} color={C.muted}  />
              </div>

              <div className={styles.chartsGrid}>
                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Cumplimiento SLA</p>
                  <div className={styles.chartArea} style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: 190, height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={slaDonutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={3}>
                            {slaDonutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <span style={{ fontSize: 26, fontWeight: 900, color: slaPct >= 90 ? '#22c55e' : slaPct >= 70 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{slaPct}%</span>
                        <span style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>cumplimiento</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>SLA por prioridad</p>
                  <div className={styles.chartArea} style={{ minHeight: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={priorityData} margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} />
                        <YAxis tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="total"    name="Total"    fill={C.navy}    radius={[4,4,0,0]} />
                        <Bar dataKey="vencidos" name="Vencidos" fill="#ef4444"  radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Detalle por prioridad</p>
                <table className={styles.prioTable}>
                  <thead>
                    <tr><th>Prioridad</th><th>Total</th><th>Vencidos</th><th>SLA Prom.</th></tr>
                  </thead>
                  <tbody>
                    {(sla?.by_priority ?? []).map((row) => {
                      const color  = getPriorityConfig(row.priority).color;
                      const breach = n(row.breached);
                      return (
                        <tr key={row.priority}>
                          <td>
                            <span className={styles.prioRow}>
                              <span className={styles.prioDot} style={{ background: color }} />
                              <span className={styles.prioName}>{getPriorityConfig(row.priority).label}</span>
                            </span>
                          </td>
                          <td className={styles.prioTotal}>{n(row.total)}</td>
                          <td className={styles.prioBreached} style={{ color: breach > 0 ? '#ef4444' : '#22c55e' }}>{breach}</td>
                          <td className={styles.prioAvg}>{row.avg_sla_hours ? `${Math.round(n(row.avg_sla_hours))}h` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                  <p className={styles.auditKpiVal}>{n(auditKpis?.auth_events)}</p>
                  <p className={styles.auditKpiLabel}>Eventos auth</p>
                </div>
              </div>

              <div className={styles.auditFilters}>
                <span className={styles.auditFilterLabel}>Filtrar:</span>
                <input className={styles.auditFilterInput} placeholder="Acción (ej: ticket)" value={auditAction} onChange={e => setAuditAction(e.target.value)} />
                <input type="date" className={styles.auditFilterInput} value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
                <span className={styles.dateSep}>—</span>
                <input type="date" className={styles.auditFilterInput} value={auditTo} onChange={e => setAuditTo(e.target.value)} />
                {(auditAction || auditFrom || auditTo) && (
                  <button type="button" className={styles.dateClear} onClick={() => { setAuditAction(''); setAuditFrom(''); setAuditTo(''); }}>Limpiar</button>
                )}
              </div>

              <div className={styles.chartsGrid}>
                <div>
                  <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Timeline de tickets</p>
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
