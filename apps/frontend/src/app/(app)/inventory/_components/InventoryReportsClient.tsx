'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Package, Shield, BarChart2, Layers, Download, ChevronDown, RefreshCw } from 'lucide-react';
import { reportingService } from '@/services/reporting.service';
import { Spinner } from '@/components/ui/Spinner';
import mgmt from '@/styles/mgmt.module.css';
import styles from '@/app/(app)/reports/reports.module.css';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

function n(v: string | null | undefined): number { return v ? parseFloat(v) : 0; }
type Severity = 'critical' | 'warning' | 'info' | 'success';
function getSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('login_failed') || a.includes('locked')) return 'critical';
  if (a.includes('update') || a.includes('config') || a.includes('role')) return 'warning';
  if (a.includes('created') || a.includes('completed')) return 'success';
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

type Tab = 'inventario' | 'activos' | 'auditoria';
const TABS: { key: Tab; label: string; Icon: typeof BarChart2 }[] = [
  { key: 'inventario', label: 'Inventario', Icon: Package   },
  { key: 'activos',    label: 'Activos',    Icon: Layers    },
  { key: 'auditoria',  label: 'Auditoría',  Icon: Shield    },
];

function KpiCard({ label, value, color = C.navy, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--app-card)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px' }}>
      <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: C.navy }}>{label}</p>
      {sub && <p style={{ margin: 0, fontSize: 10, color: C.muted }}>{sub}</p>}
    </div>
  );
}

export function InventoryReportsClient({ moduleId }: { moduleId?: string }) {
  const [tab,         setTab]        = useState<Tab>('inventario');
  const [auditAction, setAuditAction] = useState('');
  const [auditFrom,   setAuditFrom]   = useState('');
  const [auditTo,     setAuditTo]     = useState('');
  const [exportOpen,  setExportOpen]  = useState(false);
  const [csvLoading,  setCsvLoading]  = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const { data: inv, isLoading, refetch, isFetching } = useQuery({
    queryKey:  ['inventory-reports', moduleId],
    queryFn:   () => reportingService.getInventorySummary(moduleId),
    staleTime: 5 * 60_000,
  });

  const { data: auditLog, isLoading: auditLoading } = useQuery({
    queryKey:  ['inventory-audit', auditAction, auditFrom, auditTo],
    queryFn:   () => reportingService.getAuditLogFiltered({
      limit:      80,
      entityType: 'asset',
      action:     auditAction || undefined,
      dateFrom:   auditFrom   || undefined,
      dateTo:     auditTo     || undefined,
    }),
    staleTime: 60_000,
    enabled:   tab === 'auditoria',
  });

  const { data: auditKpis } = useQuery({
    queryKey:  ['inventory-audit-kpis'],
    queryFn:   () => reportingService.getAuditKpis(),
    staleTime: 60_000,
    enabled:   tab === 'auditoria',
  });

  const { data: auditActivity } = useQuery({
    queryKey:  ['inventory-audit-activity'],
    queryFn:   () => reportingService.getAuditUserActivity(10),
    staleTime: 5 * 60_000,
    enabled:   tab === 'auditoria',
  });

  const handleCsvExport = useCallback(() => {
    setCsvLoading(true);
    setExportOpen(false);
    try {
      const rows: string[][] = [['Estado', 'Total']];
      rows.push(['Disponible',    String(n(inv?.totals?.disponible))]);
      rows.push(['Asignado',      String(n(inv?.totals?.asignado))]);
      rows.push(['En reparación', String(n(inv?.totals?.en_reparacion))]);
      rows.push(['Dado de baja',  String(n(inv?.totals?.dado_de_baja))]);
      rows.push(['Total',         String(n(inv?.totals?.total))]);
      rows.push([]);
      rows.push(['Categoría', 'Total', 'Disponible', 'Asignado']);
      (inv?.by_category ?? []).forEach(c => rows.push([c.category_name, String(n(c.total)), String(n(c.disponible)), String(n(c.asignado))]));
      const csv = rows.map(r => r.join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url; a.download = `inventario-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  }, [inv]);

  const handlePdfExport = useCallback(async () => {
    setExportOpen(false);
    const { default: jsPDF }     = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF() as any;
    const now = new Date().toLocaleDateString('es-CO');

    doc.setFillColor(14, 34, 53);
    doc.rect(0, 0, 210, 55, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26); doc.setFont('helvetica', 'bold');
    doc.text('NEXO ITSM', 18, 28);
    doc.setFontSize(13); doc.setFont('helvetica', 'normal');
    doc.text('Reporte de Inventario', 18, 40);
    doc.setFontSize(10);
    doc.text(`Emitido: ${now}`, 18, 50);

    doc.setTextColor(14, 34, 53);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Estado de Activos', 18, 70);
    autoTable(doc, {
      startY: 75,
      head: [['Estado', 'Cantidad']],
      body: [
        ['Total',          String(n(inv?.totals?.total))],
        ['Disponible',     String(n(inv?.totals?.disponible))],
        ['Asignado',       String(n(inv?.totals?.asignado))],
        ['En reparación',  String(n(inv?.totals?.en_reparacion))],
        ['Dado de baja',   String(n(inv?.totals?.dado_de_baja))],
        ['Nuevos (30d)',   String(n(inv?.totals?.added_last_30))],
      ],
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [14, 34, 53] },
      columnStyles: { 1: { fontStyle: 'bold', halign: 'center' } },
    });

    const y = (doc as any).lastAutoTable.finalY + 14;
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Por Categoría', 18, y);
    autoTable(doc, {
      startY: y + 5,
      head: [['Categoría', 'Total', 'Disponible', 'Asignado']],
      body: (inv?.by_category ?? []).map(c => [c.category_name, String(n(c.total)), String(n(c.disponible)), String(n(c.asignado))]),
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [14, 34, 53] },
    });

    doc.save(`inventario-reporte-${Date.now()}.pdf`);
  }, [inv]);

  const handleExcelExport = useCallback(async () => {
    setExportOpen(false);
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'NEXO ITSM';
    wb.created = new Date();

    const ws1 = wb.addWorksheet('Resumen');
    ws1.columns = [
      { header: 'Estado', key: 'estado', width: 20 },
      { header: 'Total',  key: 'total',  width: 14 },
    ];
    ws1.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2235' } };
    [
      { estado: 'Total',          total: n(inv?.totals?.total) },
      { estado: 'Disponible',     total: n(inv?.totals?.disponible) },
      { estado: 'Asignado',       total: n(inv?.totals?.asignado) },
      { estado: 'En reparación',  total: n(inv?.totals?.en_reparacion) },
      { estado: 'Dado de baja',   total: n(inv?.totals?.dado_de_baja) },
      { estado: 'Nuevos (30d)',   total: n(inv?.totals?.added_last_30) },
    ].forEach(r => ws1.addRow(r));

    const ws2 = wb.addWorksheet('Por Categoría');
    ws2.columns = [
      { header: 'Categoría',  key: 'name',       width: 28 },
      { header: 'Total',      key: 'total',      width: 12 },
      { header: 'Disponible', key: 'disponible', width: 14 },
      { header: 'Asignado',   key: 'asignado',   width: 12 },
    ];
    ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5E3A' } };
    (inv?.by_category ?? []).forEach(c => ws2.addRow({
      name: c.category_name, total: n(c.total), disponible: n(c.disponible), asignado: n(c.asignado),
    }));

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = `inventario-reporte-${Date.now()}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [inv]);

  const totals     = inv?.totals;
  const byCategory = inv?.by_category ?? [];

  const statusData = [
    { name: 'Disponible',    value: n(totals?.disponible),   color: '#22c55e' },
    { name: 'Asignado',      value: n(totals?.asignado),     color: '#3b82f6' },
    { name: 'En reparación', value: n(totals?.en_reparacion), color: '#f59e0b' },
    { name: 'Dado de baja',  value: n(totals?.dado_de_baja), color: '#94a3b8' },
  ].filter(d => d.value > 0);

  const categoryData = byCategory.map(c => ({
    name:       c.category_name,
    total:      n(c.total),
    disponible: n(c.disponible),
    asignado:   n(c.asignado),
  }));

  const activityData = (auditActivity ?? []).map((u: any) => ({
    name:  (u.actor_name ?? u.actor_email ?? '—').split(' ').slice(0, 2).join(' '),
    count: n(u.action_count),
  }));

  if (isLoading) return <Spinner />;

  return (
    <div className={mgmt.pageWrap}>
    <div className={mgmt.pageContent}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.headerLabel}>Inventario de Activos</p>
          <h1 className={styles.title}>Reportes</h1>
          <p className={styles.sub}>Estado · Categorías · Auditoría</p>
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
                <button type="button" className={styles.exportDropdownItem} onClick={handlePdfExport}>
                  <Download size={13} /> Exportar PDF
                </button>
                <button type="button" className={styles.exportDropdownItem} onClick={handleExcelExport}>
                  <Download size={13} /> Exportar Excel
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

      {/* ══ INVENTARIO ══ */}
      {tab === 'inventario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.kpiGrid}>
            <KpiCard label="Total activos"   value={n(totals?.total)}         color={C.navy}    />
            <KpiCard label="Disponibles"     value={n(totals?.disponible)}    color="#22c55e"   />
            <KpiCard label="Asignados"       value={n(totals?.asignado)}      color="#3b82f6"   />
            <KpiCard label="En reparación"   value={n(totals?.en_reparacion)} color="#f59e0b"   />
            <KpiCard label="Dado de baja"    value={n(totals?.dado_de_baja)}  color={C.muted}   />
            <KpiCard label="Nuevos (30 días)" value={n(totals?.added_last_30)} color="#8b5cf6" sub="Incorporados recientemente" />
          </div>

          <div className={styles.chartsGrid}>
            <div className={styles.chartPanel}>
              <p className={styles.chartTitle}>Distribución por estado</p>
              <p className={styles.chartSub}>Activos actuales según su estado operacional.</p>
              <div className={styles.chartArea} style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {statusData.length === 0
                  ? <p className={styles.noData}>Sin activos registrados.</p>
                  : (
                    <div style={{ position: 'relative', width: 210, height: 210 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={3}>
                            {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color: C.navy, lineHeight: 1 }}>{n(totals?.total)}</span>
                        <span style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>activos</span>
                      </div>
                    </div>
                  )
                }
              </div>
            </div>

            <div className={styles.chartPanel}>
              <p className={styles.chartTitle}>Resumen por estado</p>
              <p className={styles.chartSub}>Conteo detallado de activos.</p>
              <div className={styles.chartArea} style={{ minHeight: 260 }}>
                {statusData.length === 0
                  ? <p className={styles.noData}>Sin datos.</p>
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={110} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="value" name="Activos" radius={[0,4,4,0]}>
                          {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTIVOS (POR CATEGORÍA) ══ */}
      {tab === 'activos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categoryData.length === 0
            ? <p className={styles.noData} style={{ padding: '40px 0' }}>Sin categorías registradas.</p>
            : (
              <>
                <div className={styles.chartPanel}>
                  <p className={styles.chartTitle}>Activos por categoría</p>
                  <p className={styles.chartSub}>Total, disponibles y asignados por categoría.</p>
                  <div className={styles.chartArea} style={{ minHeight: Math.max(260, categoryData.length * 38) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={120} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="disponible" name="Disponible" fill="#22c55e" radius={[0,4,4,0]} stackId="a" />
                        <Bar dataKey="asignado"   name="Asignado"   fill="#3b82f6" radius={[0,4,4,0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={styles.section}>
                  <p className={styles.sectionTitle}>Tabla por categoría</p>
                  <table className={styles.prioTable}>
                    <thead>
                      <tr><th>Categoría</th><th>Total</th><th>Disponible</th><th>Asignado</th></tr>
                    </thead>
                    <tbody>
                      {categoryData.map(c => (
                        <tr key={c.name}>
                          <td className={styles.prioName}>{c.name}</td>
                          <td className={styles.prioTotal}>{c.total}</td>
                          <td style={{ color: '#22c55e', fontWeight: 700 }}>{c.disponible}</td>
                          <td style={{ color: '#3b82f6', fontWeight: 700 }}>{c.asignado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }
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
            <input className={styles.auditFilterInput} placeholder="Acción (ej: asset)" value={auditAction} onChange={e => setAuditAction(e.target.value)} />
            <input type="date" className={styles.auditFilterInput} value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
            <span className={styles.dateSep}>—</span>
            <input type="date" className={styles.auditFilterInput} value={auditTo} onChange={e => setAuditTo(e.target.value)} />
            {(auditAction || auditFrom || auditTo) && (
              <button type="button" className={styles.dateClear} onClick={() => { setAuditAction(''); setAuditFrom(''); setAuditTo(''); }}>Limpiar</button>
            )}
          </div>

          <div className={styles.chartsGrid}>
            <div>
              <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>Timeline de activos</p>
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

    </div>
    </div>
    </div>
  );
}
