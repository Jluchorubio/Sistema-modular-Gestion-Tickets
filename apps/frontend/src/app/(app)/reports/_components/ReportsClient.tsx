'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, Shield, BarChart2, Activity, ChevronDown, Download,
  RefreshCw, AlertTriangle, Info, CheckCircle2, Zap, User, Calendar, Inbox,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { ADMIN_ROLES } from '@/constants/roles';
import {
  reportingService,
  type DailyTrend, type SlaByPriority, type AuditEntry,
  type AuditKpis, type AuditUserActivity, type TicketsSummary, type SlaMetrics,
} from '@/services/reporting.service';
import api from '@/services/api';
import { getPriorityConfig } from '@/constants/status';
import { fmtDay } from '@/lib/formatters';
import styles from '../reports.module.css';
import mgmt   from '@/styles/mgmt.module.css';

/* ─────────────────── helpers ─────────────────────── */

function n(v: string | null | undefined): number {
  return v ? parseFloat(v) : 0;
}

const PRIORITY_COLORS = Object.fromEntries(
  ['baja','media','alta','critica'].map(p => [p, getPriorityConfig(p).color])
);
const PRIORITY_LABELS = Object.fromEntries(
  ['baja','media','alta','critica'].map(p => [p, getPriorityConfig(p).label])
);

type Severity = 'critical' | 'warning' | 'info' | 'success';

function getSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('login_failed') || a.includes('login_locked') || a.includes('permission')) return 'critical';
  if (a.includes('update') || a.includes('config') || a.includes('setting') || a.includes('role')) return 'warning';
  if (a.includes('created') || a.includes('completed') || a.includes('resolved') || a === 'auth.login') return 'success';
  return 'info';
}

function getCategory(action: string): string {
  const a = action.toLowerCase();
  if (a.startsWith('auth.')) return 'Autenticación';
  if (a.startsWith('calendar.')) return 'Calendario';
  if (a.startsWith('ticket.')) return 'Helpdesk';
  if (a.startsWith('asset.')) return 'Inventario';
  if (a.startsWith('request.')) return 'Solicitudes';
  if (a.includes('config') || a.includes('setting')) return 'Configuración';
  if (a.includes('permission') || a.includes('role')) return 'Permisos';
  return 'Sistema';
}

function humanizeAction(action: string): string {
  return action
    .replace('auth.', '')
    .replace('calendar.', 'Calendario: ')
    .replace('ticket.', 'Ticket: ')
    .replace('asset.', 'Activo: ')
    .replace('request.', 'Solicitud: ')
    .replace(/_/g, ' ')
    .replace(/\./g, ' · ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)   return 'Hace un momento';
  if (diff < 3600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `Hace ${Math.floor(diff / 3600_000)}h`;
  return new Date(iso).toLocaleDateString('es-CO');
}

const SEV = {
  critical: { color: '#ef4444', label: 'CRÍTICO' },
  warning:  { color: '#f59e0b', label: 'AVISO'   },
  info:     { color: '#3b82f6', label: 'INFO'     },
  success:  { color: '#22c55e', label: 'OK'       },
} as const;

function computeInsights(tickets?: TicketsSummary, sla?: SlaMetrics): string[] {
  const out: string[] = [];
  if (!tickets || !sla) return out;
  const compliance = n(sla.summary.compliance_pct);
  const breached   = n(sla.summary.breached);
  const total      = n(tickets.totals.total);
  const open       = n(tickets.totals.open);
  const last7      = n(tickets.totals.last_7_days);

  if      (compliance < 70) out.push(`SLA crítico: solo ${compliance.toFixed(1)}% de cumplimiento — acción inmediata requerida.`);
  else if (compliance < 90) out.push(`SLA en alerta: ${compliance.toFixed(1)}% de cumplimiento, por debajo del objetivo del 90%.`);
  else                      out.push(`SLA saludable: ${compliance.toFixed(1)}% de cumplimiento, por encima del objetivo.`);

  if (breached > 0) out.push(`${breached} ticket${breached !== 1 ? 's' : ''} con SLA vencido requieren escalación inmediata.`);

  const openRate = total > 0 ? (open / total) * 100 : 0;
  if (openRate > 60) out.push(`${openRate.toFixed(0)}% de tickets están abiertos — carga operacional elevada.`);
  else if (openRate < 20 && total > 0) out.push(`Solo ${openRate.toFixed(0)}% de tickets están abiertos — excelente tasa de cierre.`);

  if (last7 > 0) {
    const avg = (last7 / 7).toFixed(1);
    out.push(`Promedio de ${avg} tickets/día en los últimos 7 días.`);
  }
  return out.slice(0, 4);
}

function computeDeltaFromTrend(trend: DailyTrend[]): number | null {
  if (!trend || trend.length < 4) return null;
  const mid    = Math.floor(trend.length / 2);
  const first  = trend.slice(0, mid).reduce((s, d) => s + n(d.created), 0);
  const second = trend.slice(mid).reduce((s, d) => s + n(d.created), 0);
  if (first === 0) return null;
  return Math.round(((second - first) / first) * 100);
}

function computePlatformStatus(compliance: number, breached: number, criticalToday: number): 'healthy' | 'warning' | 'critical' {
  if (compliance < 70 || breached >= 10 || criticalToday >= 5) return 'critical';
  if (compliance < 90 || breached > 0  || criticalToday > 0)  return 'warning';
  return 'healthy';
}

function computeRiskSignals(events: AuditEntry[]): string[] {
  if (!events.length) return [];
  const out: string[] = [];
  const criticals  = events.filter(e => getSeverity(e.action) === 'critical');
  if (criticals.length > 0)
    out.push(`${criticals.length} evento${criticals.length !== 1 ? 's' : ''} crítico${criticals.length !== 1 ? 's' : ''} en el período filtrado`);
  const authFails  = events.filter(e => e.action.toLowerCase().includes('login_failed') || e.action.toLowerCase().includes('login_locked'));
  if (authFails.length >= 2)
    out.push(`${authFails.length} intentos de autenticación fallidos detectados`);
  const roleChg    = events.filter(e => e.action.toLowerCase().includes('role') || e.action.toLowerCase().includes('permission'));
  if (roleChg.length > 0)
    out.push(`${roleChg.length} cambio${roleChg.length !== 1 ? 's' : ''} de permisos o roles`);
  const deletes    = events.filter(e => e.action.toLowerCase().includes('delete'));
  if (deletes.length >= 3)
    out.push(`${deletes.length} eliminaciones en el período — revisar`);
  return out.slice(0, 5);
}

/* ─────────────────── sub-components ─────────────────── */

function KpiCard({ label, value, sub, color = '#0e2235', delta, Icon }: {
  label: string; value: string | number; sub?: string; color?: string; delta?: number | null;
  Icon?: LucideIcon;
}) {
  return (
    <div className={styles.kpiCardFlex}>
      {Icon && (
        <div className={styles.kpiIconWrap} style={{ background: `${color}18` }}>
          <Icon size={17} style={{ color }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className={styles.kpiCardVal} style={{ color }}>{value}</p>
        {delta != null && (
          <span
            className={delta > 0 ? styles.kpiDeltaUp : delta < 0 ? styles.kpiDeltaDown : styles.kpiDeltaNeutral}
            style={{ fontSize: 10, display: 'block', marginBottom: 1 }}
          >
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} {Math.abs(delta)}% vs período anterior
          </span>
        )}
        <p className={styles.kpiCardName}>{label}</p>
        {sub && <p className={styles.kpiCardSub}>{sub}</p>}
      </div>
    </div>
  );
}

function InsightsBox({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  return (
    <div className={styles.insightsBox}>
      <p className={styles.insightsTitle}><Zap size={12} /> Análisis operacional automático</p>
      <ul className={styles.insightsList}>
        {insights.map((ins, i) => (
          <li key={i} className={styles.insightsItem}>
            <span className={styles.insightsDot} />
            {ins}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuditTimeline({ events }: { events: AuditEntry[] }) {
  if (events.length === 0) {
    return <div className={styles.timelineEmpty}>Sin eventos de auditoría registrados.</div>;
  }
  return (
    <div className={styles.timeline}>
      {events.map((e) => {
        const sev = getSeverity(e.action);
        const cfg = SEV[sev];
        return (
          <div key={e.id} className={styles.timelineItem}>
            <div className={styles.timelineDot} style={{ background: cfg.color, marginTop: 4 }} />
            <div className={styles.timelineContent}>
              <div className={styles.timelineTop}>
                <span
                  className={styles.timelineSev}
                  style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}12` }}
                >
                  {cfg.label}
                </span>
                <span className={styles.timelineActor}>{e.actor_name ?? e.actor_email ?? 'Sistema'}</span>
                <span className={styles.timelineAction}>{humanizeAction(e.action)}</span>
              </div>
              <div className={styles.timelineMeta}>
                <span>{relativeTime(e.created_at)}</span>
                <span>· {getCategory(e.action)}</span>
                {e.entity_id && <span>· #{e.entity_id.slice(0, 8)}</span>}
                {e.ip_address && <span>· {e.ip_address}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlatformStatusBanner({ status, compliance, breached, criticalToday }: {
  status: 'healthy' | 'warning' | 'critical';
  compliance: number;
  breached: number;
  criticalToday?: number;
}) {
  const wrapCls  = status === 'healthy' ? styles.statusBannerHealthy  : status === 'warning' ? styles.statusBannerWarning  : styles.statusBannerCritical;
  const dotCls   = status === 'healthy' ? styles.statusDotHealthy     : status === 'warning' ? styles.statusDotWarning     : styles.statusDotCritical;
  const badgeCls = status === 'healthy' ? styles.statusBadgeHealthy   : status === 'warning' ? styles.statusBadgeWarning   : styles.statusBadgeCritical;
  const title    = status === 'healthy' ? 'Sistema operativo y saludable'
                 : status === 'warning' ? 'Sistema con advertencias activas'
                 : 'Sistema con incidentes críticos — acción requerida';
  const badgeTxt = status === 'healthy' ? '● OPERATIVO' : status === 'warning' ? '● ADVERTENCIA' : '● CRÍTICO';
  return (
    <div className={`${styles.statusBanner} ${wrapCls}`}>
      <div className={`${styles.statusDot} ${dotCls}`} />
      <div className={styles.statusMain}>
        <p className={styles.statusTitle}>{title}</p>
        <div className={styles.statusStats}>
          <span>SLA global: <strong style={{ color: compliance >= 90 ? '#22c55e' : compliance >= 70 ? '#f59e0b' : '#ef4444' }}>{compliance}%</strong></span>
          <span>SLA vencidos: <strong style={{ color: breached > 0 ? '#ef4444' : '#22c55e' }}>{breached}</strong></span>
          {(criticalToday ?? 0) > 0 && <span>Eventos críticos hoy: <strong style={{ color: '#ef4444' }}>{criticalToday}</strong></span>}
        </div>
      </div>
      <span className={`${styles.statusBadge} ${badgeCls}`}>{badgeTxt}</span>
    </div>
  );
}

function RiskDetectionBox({ signals, loading }: { signals: string[]; loading?: boolean }) {
  if (loading) return null;
  return (
    <div className={styles.riskBox}>
      <p className={styles.riskTitle}><AlertTriangle size={11} /> Detección de riesgos</p>
      {signals.length === 0
        ? <p className={styles.riskOk}><CheckCircle2 size={13} /> Sin riesgos detectados en el período seleccionado</p>
        : (
          <ul className={styles.riskList}>
            {signals.map((s, i) => (
              <li key={i} className={styles.riskItem}>
                <span className={styles.riskDot} />
                {s}
              </li>
            ))}
          </ul>
        )
      }
    </div>
  );
}

const TOOLTIP_STYLE = {
  fontSize: 11,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 4px 12px rgba(0,0,0,.08)',
};

/* ─────────────────── tabs ─────────────────────── */

type Tab = 'overview' | 'operacion' | 'sla' | 'auditoria';

const TABS: { key: Tab; label: string; Icon: typeof BarChart2 }[] = [
  { key: 'overview',   label: 'Overview',   Icon: BarChart2   },
  { key: 'operacion',  label: 'Operación',  Icon: TrendingUp  },
  { key: 'sla',        label: 'SLA',        Icon: Activity    },
  { key: 'auditoria',  label: 'Auditoría',  Icon: Shield      },
];

/* ─────────────────── main ─────────────────────── */

export function ReportsClient() {
  const user          = useAuthStore((s) => s.user);
  const isSuperadmin  = user?.is_superadmin ?? false;
  const storeModuleId = useUIStore((s) => s.moduleId);

  const adminModules = useMemo(() => {
    const roles = user?.module_roles?.filter(
      (r) => r.status === 'active' && (ADMIN_ROLES as string[]).includes(r.role_name),
    ) ?? [];
    const seen = new Set<string>();
    return roles.filter((r) => { if (seen.has(r.module_id)) return false; seen.add(r.module_id); return true; });
  }, [user]);

  const [tab,          setTab]          = useState<Tab>('overview');
  const [selectedMod,  setSelectedMod]  = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [exportOpen,   setExportOpen]   = useState(false);
  const [csvLoading,   setCsvLoading]   = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // audit filters
  const [auditActor,   setAuditActor]   = useState('');
  const [auditAction,  setAuditAction]  = useState('');
  const [auditFrom,    setAuditFrom]    = useState('');
  const [auditTo,      setAuditTo]      = useState('');

  useEffect(() => { setSelectedMod(storeModuleId ?? ''); }, [storeModuleId]);

  // close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const moduleId = selectedMod || undefined;
  const from     = dateFrom || undefined;
  const to       = dateTo   || undefined;
  const canView  = isSuperadmin || adminModules.length > 0;

  const { data: tickets, isLoading: tLoading, refetch: refetchTickets } = useQuery({
    queryKey:  ['reports-tickets', moduleId, from, to],
    queryFn:   () => reportingService.getTicketsSummary(moduleId, from, to),
    staleTime: 2 * 60_000,
    enabled:   canView,
  });

  const { data: sla, isLoading: sLoading, refetch: refetchSla } = useQuery({
    queryKey:  ['reports-sla', moduleId, from, to],
    queryFn:   () => reportingService.getSlaMetrics(moduleId, from, to),
    staleTime: 2 * 60_000,
    enabled:   canView,
  });

  const { data: auditLog, isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey:  ['reports-audit', auditActor, auditAction, auditFrom, auditTo],
    queryFn:   () => reportingService.getAuditLogFiltered({
      limit: 100,
      actorId: auditActor || undefined,
      action:  auditAction || undefined,
      dateFrom: auditFrom || undefined,
      dateTo:   auditTo   || undefined,
    }),
    staleTime: 60_000,
    enabled:   canView && tab === 'auditoria',
  });

  const { data: auditKpis } = useQuery({
    queryKey:  ['reports-audit-kpis'],
    queryFn:   () => reportingService.getAuditKpis(),
    staleTime: 60_000,
    enabled:   canView,
  });

  const { data: auditActivity } = useQuery({
    queryKey:  ['reports-audit-activity'],
    queryFn:   () => reportingService.getAuditUserActivity(12),
    staleTime: 5 * 60_000,
    enabled:   canView && tab === 'auditoria',
  });

  const isLoading = tLoading || sLoading;

  function refetchAll() {
    refetchTickets();
    refetchSla();
    if (tab === 'auditoria') refetchAudit();
  }

  /* ── Module comparison (parallel per-module SLA + tickets) ── */
  const showModuleComp = canView && adminModules.length > 1 && tab === 'overview';
  const moduleCompQueries = useQueries({
    queries: adminModules.slice(0, 5).flatMap((m) => [
      {
        queryKey:  ['mc-tickets', m.module_id],
        queryFn:   () => reportingService.getTicketsSummary(m.module_id),
        staleTime: 5 * 60_000,
        enabled:   showModuleComp,
      },
      {
        queryKey:  ['mc-sla', m.module_id],
        queryFn:   () => reportingService.getSlaMetrics(m.module_id),
        staleTime: 5 * 60_000,
        enabled:   showModuleComp,
      },
    ]),
  });

  /* ── CSV export ── */
  const handleCsvExport = useCallback(async () => {
    setCsvLoading(true);
    setExportOpen(false);
    try {
      const res = await api.get('/reporting/export/tickets', {
        params:       moduleId ? { moduleId } : {},
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
      setCsvLoading(false);
    }
  }, [moduleId]);

  /* ── PDF export ── */
  const handlePdfExport = useCallback(async () => {
    setExportOpen(false);
    const { default: jsPDF }     = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF() as any;
    const now = new Date().toLocaleDateString('es-CO');

    // Cover
    doc.setFillColor(14, 34, 53);
    doc.rect(0, 0, 210, 55, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('NEXO ITSM', 18, 28);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte Ejecutivo Operacional', 18, 40);
    doc.setFontSize(10);
    doc.text(`Emitido: ${now}`, 18, 50);

    // Watermark
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(60);
    doc.setFont('helvetica', 'bold');
    doc.saveGraphicsState();
    doc.setGState(new (doc.GState as any)({ opacity: 0.06 }));
    doc.text('NEXO', 30, 160, { angle: 40 });
    doc.restoreGraphicsState();

    // KPIs section
    doc.setTextColor(14, 34, 53);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('KPIs Operacionales', 18, 70);

    const compliance = n(sla?.summary.compliance_pct);
    const kpiRows = [
      ['Total Tickets',     n(tickets?.totals.total).toString()],
      ['Tickets Abiertos',  n(tickets?.totals.open).toString()],
      ['Tickets Cerrados',  n(tickets?.totals.closed).toString()],
      ['Últimos 7 días',    n(tickets?.totals.last_7_days).toString()],
      ['SLA Cumplimiento',  `${compliance}%`],
      ['SLA Vencidos',      n(sla?.summary.breached).toString()],
    ];

    autoTable(doc, {
      startY: 75,
      head: [['Métrica', 'Valor']],
      body: kpiRows,
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [14, 34, 53] },
      columnStyles: { 1: { fontStyle: 'bold', halign: 'center' } },
    });

    // SLA by priority
    let y = (doc as any).lastAutoTable.finalY + 14;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('SLA por Prioridad', 18, y);

    const slaRows = (sla?.by_priority ?? []).map(r => [
      PRIORITY_LABELS[r.priority] ?? r.priority,
      n(r.total).toString(),
      n(r.breached).toString(),
      r.avg_sla_hours ? `${Math.round(n(r.avg_sla_hours))}h` : '—',
    ]);

    autoTable(doc, {
      startY: y + 5,
      head: [['Prioridad', 'Total', 'Vencidos', 'SLA Prom.']],
      body: slaRows,
      styles: { fontSize: 10, cellPadding: 5 },
      headStyles: { fillColor: [14, 34, 53] },
    });

    // Insights
    const insights = computeInsights(tickets, sla);
    if (insights.length > 0) {
      y = (doc as any).lastAutoTable.finalY + 14;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Análisis Automático', 18, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      insights.forEach((ins, i) => {
        doc.text(`• ${ins}`, 20, y + i * 7);
      });
    }

    doc.save(`nexo-reporte-${Date.now()}.pdf`);
  }, [tickets, sla]);

  /* ── Excel export ── */
  const handleExcelExport = useCallback(async () => {
    setExportOpen(false);
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'NEXO ITSM';
    wb.created = new Date();

    // Sheet 1: Resumen
    const ws1 = wb.addWorksheet('Resumen Ejecutivo');
    ws1.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor',   key: 'value',  width: 18 },
    ];
    ws1.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2235' } };
    const compliance = n(sla?.summary.compliance_pct);
    [
      { metric: 'Total Tickets',    value: n(tickets?.totals.total) },
      { metric: 'Tickets Abiertos', value: n(tickets?.totals.open) },
      { metric: 'Tickets Cerrados', value: n(tickets?.totals.closed) },
      { metric: 'Últimos 7 Días',   value: n(tickets?.totals.last_7_days) },
      { metric: 'SLA Cumplimiento', value: `${compliance}%` },
      { metric: 'SLA Vencidos',     value: n(sla?.summary.breached) },
    ].forEach(r => ws1.addRow(r));

    // Sheet 2: SLA por prioridad
    const ws2 = wb.addWorksheet('SLA por Prioridad');
    ws2.columns = [
      { header: 'Prioridad',   key: 'priority', width: 16 },
      { header: 'Total',       key: 'total',    width: 10 },
      { header: 'Vencidos',    key: 'breached', width: 12 },
      { header: 'SLA Prom. h', key: 'avg',      width: 14 },
    ];
    ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2235' } };
    (sla?.by_priority ?? []).forEach(r => ws2.addRow({
      priority: PRIORITY_LABELS[r.priority] ?? r.priority,
      total:    n(r.total),
      breached: n(r.breached),
      avg:      r.avg_sla_hours ? Math.round(n(r.avg_sla_hours)) : '—',
    }));

    // Sheet 3: Tendencia
    const ws3 = wb.addWorksheet('Tendencia 30 días');
    ws3.columns = [
      { header: 'Fecha',   key: 'day',     width: 16 },
      { header: 'Tickets', key: 'created', width: 12 },
    ];
    ws3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5E3A' } };
    (tickets?.daily_trend ?? []).forEach(d => ws3.addRow({ day: d.day, created: n(d.created) }));

    // Sheet 4: Auditoría
    const ws4 = wb.addWorksheet('Auditoría');
    ws4.columns = [
      { header: 'Timestamp', key: 'created_at',  width: 22 },
      { header: 'Actor',     key: 'actor_name',  width: 24 },
      { header: 'Acción',    key: 'action',      width: 32 },
      { header: 'Entidad',   key: 'entity_type', width: 18 },
      { header: 'IP',        key: 'ip_address',  width: 16 },
    ];
    ws4.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws4.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    (auditLog ?? []).forEach(e => ws4.addRow({
      created_at:  new Date(e.created_at).toLocaleString('es-CO'),
      actor_name:  e.actor_name ?? e.actor_email ?? '—',
      action:      e.action,
      entity_type: e.entity_type,
      ip_address:  e.ip_address ?? '—',
    }));

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexo-reporte-${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [tickets, sla, auditLog]);

  /* ── derived data ── */
  const totals     = tickets?.totals;
  const byState    = tickets?.by_state    ?? [];
  const byPriority = tickets?.by_priority ?? [];
  const trend      = tickets?.daily_trend ?? [];
  const compliance = n(sla?.summary.compliance_pct);
  const hasData    = n(totals?.total) > 0;
  const insights       = useMemo(() => computeInsights(tickets, sla), [tickets, sla]);
  const trendDelta     = useMemo(() => computeDeltaFromTrend(trend), [trend]);
  const platformStatus = useMemo(
    () => computePlatformStatus(compliance, n(sla?.summary.breached), n(auditKpis?.critical_today)),
    [compliance, sla, auditKpis],
  );
  const moduleCompData = useMemo(() => {
    if (adminModules.length <= 1 || moduleCompQueries.length === 0) return [];
    return adminModules.slice(0, 5).map((m, i) => {
      const tQ = moduleCompQueries[i * 2];
      const sQ = moduleCompQueries[i * 2 + 1];
      const t  = tQ?.data as TicketsSummary | undefined;
      const s  = sQ?.data as SlaMetrics     | undefined;
      return {
        name:       m.module_name,
        total:      n(t?.totals.total),
        open:       n(t?.totals.open),
        compliance: n(s?.summary.compliance_pct),
        breached:   n(s?.summary.breached),
        loading:    tQ?.isLoading || sQ?.isLoading,
      };
    });
  }, [adminModules, moduleCompQueries]);

  const trendData = trend.map((d) => ({
    name:    fmtDay(d.day).slice(0, 6),
    tickets: n(d.created),
    day:     d.day,
  }));

  const stateData = byState.map((s) => ({
    name:  s.state_label,
    value: n(s.total),
    color: s.is_final ? '#22c55e' : '#3b82f6',
  }));

  const priorityData = byPriority.map((p) => ({
    name:  PRIORITY_LABELS[p.priority] ?? p.priority,
    value: n(p.total),
    color: PRIORITY_COLORS[p.priority] ?? '#94a3b8',
  }));

  const slaDonutData = [
    { name: 'Cumplidos', value: n(sla?.summary.compliant), color: '#22c55e' },
    { name: 'Vencidos',  value: n(sla?.summary.breached),  color: '#ef4444' },
    { name: 'Sin SLA',   value: n(sla?.summary.without_sla), color: '#e2e8f0' },
  ].filter(d => d.value > 0);

  const activityData = (auditActivity ?? []).map((u) => ({
    name:  (u.actor_name ?? u.actor_email ?? '—').split(' ').slice(0, 2).join(' '),
    count: n(u.action_count),
  })).slice(0, 10);

  return (
    <div className={mgmt.pageWrap}>
      <div className={mgmt.pageContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <p className={styles.headerLabel}>Centro de Analítica</p>
            <h1 className={styles.title}>Reportes y Auditoría</h1>
            <p className={styles.sub}>Observabilidad operacional · SLA · Trazabilidad empresarial</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={refetchAll} className={styles.refreshBtn}>
              <RefreshCw size={12} />
              Actualizar
            </button>
            <div className={styles.exportWrap} ref={exportRef}>
              <button
                type="button"
                className={styles.exportBtn}
                disabled={csvLoading}
                onClick={() => setExportOpen(v => !v)}
              >
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

        {/* ── Module filter ── */}
        {!storeModuleId && (isSuperadmin || adminModules.length > 1) && (
          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterBtn}${!selectedMod ? ` ${styles.filterBtnActive}` : ''}`}
              onClick={() => setSelectedMod('')}
            >
              Todos los módulos
            </button>
            {adminModules.map((m) => (
              <button
                key={m.module_id}
                type="button"
                className={`${styles.filterBtn}${selectedMod === m.module_id ? ` ${styles.filterBtnActive}` : ''}`}
                onClick={() => setSelectedMod(m.module_id)}
              >
                {m.module_name}
              </button>
            ))}
          </div>
        )}

        {/* ── Date range ── */}
        <div className={styles.dateRow}>
          <span className={styles.dateLabel}>Rango:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={styles.dateInput} />
          <span className={styles.dateSep}>—</span>
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className={styles.dateInput} />
          {(dateFrom || dateTo) && (
            <button type="button" className={styles.dateClear} onClick={() => { setDateFrom(''); setDateTo(''); }}>Limpiar</button>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div className={styles.tabs}>
          {TABS.map((t) => (
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
          <div className={styles.loading}>Cargando métricas…</div>
        ) : (
          <>

            {/* ══════════ OVERVIEW ══════════ */}
            {tab === 'overview' && (
              <>
                <PlatformStatusBanner
                  status={platformStatus}
                  compliance={compliance}
                  breached={n(sla?.summary.breached)}
                  criticalToday={n(auditKpis?.critical_today)}
                />

                <InsightsBox insights={insights} />

                <div className={styles.kpiGrid}>
                  <KpiCard label="Total Tickets"    value={n(totals?.total)}         delta={trendDelta} sub={`Abiertos: ${n(totals?.open)} · Cerrados: ${n(totals?.closed)}`} color="#0e2235"  Icon={BarChart2} />
                  <KpiCard label="SLA Cumplimiento" value={`${compliance}%`}          sub="De tickets con SLA activo" color={compliance >= 90 ? '#22c55e' : compliance >= 70 ? '#f59e0b' : '#ef4444'} Icon={CheckCircle2} />
                  <KpiCard label="SLA Vencidos"     value={n(sla?.summary.breached)}  sub={`Sin SLA: ${n(sla?.summary.without_sla)}`} color="#ef4444" Icon={AlertTriangle} />
                  <KpiCard label="Últimos 7 Días"   value={n(totals?.last_7_days)}    sub="Tickets nuevos" color="#3b82f6" Icon={Calendar} />
                </div>

                {hasData && (
                  <>
                    <div className={styles.chartsGrid}>
                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}><TrendingUp size={13} style={{ color: '#ff5e3a' }} /> Tendencia de creación — 30 días</p>
                        <p className={styles.chartSub}>Volumen diario de tickets abiertos en el período.</p>
                        <div className={`${styles.chartArea} ${styles.chartArea260}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%"  stopColor="#ff5e3a" stopOpacity={0.22} />
                                  <stop offset="95%" stopColor="#ff5e3a" stopOpacity={0}    />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [v, 'Tickets']} />
                              <Area type="monotone" dataKey="tickets" stroke="#ff5e3a" fill="url(#trendGrad)" strokeWidth={2} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}>Por Estado</p>
                        <p className={styles.chartSub}>Distribución actual de tickets.</p>
                        <div className={`${styles.chartArea} ${styles.chartArea260}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={stateData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={3}>
                                {stateData.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                              <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    <div className={styles.chartsGrid}>
                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}>Por Prioridad</p>
                        <p className={styles.chartSub}>Distribución de tickets por nivel de prioridad.</p>
                        <div className={`${styles.chartArea} ${styles.chartArea220}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}>
                                {priorityData.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Pie>
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                              <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}>SLA por Prioridad</p>
                        <p className={styles.chartSub}>Cumplimiento y breaches por nivel.</p>
                        <div className={`${styles.chartArea} ${styles.chartArea220}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={(sla?.by_priority ?? []).map(r => ({
                              name:     PRIORITY_LABELS[r.priority] ?? r.priority,
                              total:    n(r.total),
                              vencidos: n(r.breached),
                            }))} margin={{ left: -10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                              <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="total"    name="Total"    fill="#0e2235" radius={[4,4,0,0]} />
                              <Bar dataKey="vencidos" name="Vencidos" fill="#ef4444" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {moduleCompData.length > 0 && (
                  <div className={styles.moduleCompWrap}>
                    <p className={styles.moduleCompHeader}>
                      <BarChart2 size={12} /> Comparación de módulos
                    </p>
                    <table className={styles.moduleCompTable}>
                      <thead>
                        <tr>
                          <th>Módulo</th>
                          <th>Tickets</th>
                          <th>Abiertos</th>
                          <th>SLA %</th>
                          <th>Vencidos</th>
                          <th>Riesgo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moduleCompData.map((m) => {
                          const risk    = m.compliance < 70 || m.breached >= 5 ? 'high' : m.compliance < 90 || m.breached > 0 ? 'med' : 'low';
                          const riskCls = risk === 'high' ? styles.moduleCompRiskHigh : risk === 'med' ? styles.moduleCompRiskMed : styles.moduleCompRiskLow;
                          return (
                            <tr key={m.name}>
                              <td style={{ fontWeight: 700, color: '#0e2235' }}>{m.name}</td>
                              <td>{m.loading ? '…' : m.total}</td>
                              <td>{m.loading ? '…' : m.open}</td>
                              <td>
                                {m.loading ? '…' : (
                                  <>
                                    <span style={{ fontWeight: 700, color: m.compliance >= 90 ? '#22c55e' : m.compliance >= 70 ? '#f59e0b' : '#ef4444' }}>
                                      {m.compliance}%
                                    </span>
                                    <div className={styles.moduleCompBar}>
                                      <div className={styles.moduleCompBarFill} style={{ width: `${m.compliance}%`, background: m.compliance >= 90 ? '#22c55e' : m.compliance >= 70 ? '#f59e0b' : '#ef4444' }} />
                                    </div>
                                  </>
                                )}
                              </td>
                              <td style={{ color: m.breached > 0 ? '#ef4444' : '#334155' }}>{m.loading ? '…' : m.breached}</td>
                              <td><span className={riskCls}>{risk === 'high' ? '● ALTO' : risk === 'med' ? '● MEDIO' : '● OK'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!hasData && (
                  <div className={styles.emptyState}>
                    <BarChart2 size={32} className={styles.emptyIcon} />
                    <p className={styles.emptyMsg}>Sin datos para mostrar. Crea tickets para ver métricas.</p>
                  </div>
                )}
              </>
            )}

            {/* ══════════ OPERACIÓN ══════════ */}
            {tab === 'operacion' && (
              <>
                <div className={styles.kpiGrid}>
                  <KpiCard label="Total Tickets"  value={n(totals?.total)}         color="#0e2235"  Icon={BarChart2} />
                  <KpiCard label="Abiertos"        value={n(totals?.open)}          color="#ff5e3a" sub="En este momento" Icon={Inbox} />
                  <KpiCard label="Cerrados"        value={n(totals?.closed)}        color="#22c55e" Icon={CheckCircle2} />
                  <KpiCard label="Últimos 7 días"  value={n(totals?.last_7_days)}   color="#3b82f6" Icon={Calendar} />
                </div>

                {hasData && (
                  <>
                    <div className={styles.chartPanel} style={{ marginBottom: 16 }}>
                      <p className={styles.chartTitle}><TrendingUp size={13} style={{ color: '#ff5e3a' }} /> Tendencia 30 días</p>
                      <p className={styles.chartSub}>Volumen diario de tickets creados.</p>
                      <div className={`${styles.chartArea} ${styles.chartArea260}`}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="trendGrad2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#0e2235" stopOpacity={0.18} />
                                <stop offset="95%" stopColor="#0e2235" stopOpacity={0}    />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [v, 'Tickets']} />
                            <Area type="monotone" dataKey="tickets" stroke="#0e2235" fill="url(#trendGrad2)" strokeWidth={2} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className={styles.chartsGrid}>
                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}>Por Estado</p>
                        <div className={`${styles.chartArea} ${styles.chartArea220}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stateData} layout="vertical" margin={{ left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={90} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                              <Bar dataKey="value" name="Tickets" radius={[0,4,4,0]}>
                                {stateData.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className={styles.chartPanel}>
                        <p className={styles.chartTitle}>Por Prioridad</p>
                        <div className={`${styles.chartArea} ${styles.chartArea220}`}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={priorityData} layout="vertical" margin={{ left: 10 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={70} />
                              <Tooltip contentStyle={TOOLTIP_STYLE} />
                              <Bar dataKey="value" name="Tickets" radius={[0,4,4,0]}>
                                {priorityData.map((e, i) => <Cell key={i} fill={e.color} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* ══════════ SLA ══════════ */}
            {tab === 'sla' && (
              <>
                <div className={styles.kpiGrid}>
                  <KpiCard label="Total con SLA"  value={n(sla?.summary.total)}         color="#0e2235" Icon={BarChart2} />
                  <KpiCard label="Cumplimiento"   value={`${compliance}%`}              color={compliance >= 90 ? '#22c55e' : compliance >= 70 ? '#f59e0b' : '#ef4444'} Icon={CheckCircle2} />
                  <KpiCard label="Vencidos"       value={n(sla?.summary.breached)}      color="#ef4444" sub="Breach activo" Icon={AlertTriangle} />
                  <KpiCard label="Sin SLA"        value={n(sla?.summary.without_sla)}   color="#94a3b8" sub="Sin definir" Icon={Shield} />
                </div>

                <div className={styles.chartsGrid}>
                  <div className={styles.chartPanel}>
                    <p className={styles.chartTitle}>Cumplimiento SLA global</p>
                    <p className={styles.chartSub}>Tickets resueltos antes del vencimiento límite.</p>
                    <div className={`${styles.chartArea} ${styles.chartArea260}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ position: 'relative', width: 200, height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={slaDonutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={86} paddingAngle={3}>
                              {slaDonutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          <span style={{ fontSize: 28, fontWeight: 900, color: compliance >= 90 ? '#22c55e' : compliance >= 70 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{compliance}%</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>cumplimiento</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartPanel}>
                    <p className={styles.chartTitle}>SLA por prioridad</p>
                    <p className={styles.chartSub}>Total vs vencidos por nivel.</p>
                    <div className={`${styles.chartArea} ${styles.chartArea260}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(sla?.by_priority ?? []).map(r => ({
                          name:     PRIORITY_LABELS[r.priority] ?? r.priority,
                          total:    n(r.total),
                          vencidos: n(r.breached),
                        }))} margin={{ left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="total"    name="Total"    fill="#0e2235" radius={[4,4,0,0]} />
                          <Bar dataKey="vencidos" name="Vencidos" fill="#ef4444" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* SLA table */}
                <div className={styles.section}>
                  <p className={styles.sectionTitle}>Detalle por prioridad</p>
                  <table className={styles.prioTable}>
                    <thead>
                      <tr>
                        <th>Prioridad</th>
                        <th>Total</th>
                        <th>Vencidos</th>
                        <th>SLA Prom.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sla?.by_priority ?? []).map((r) => {
                        const color  = PRIORITY_COLORS[r.priority] ?? '#94a3b8';
                        const breach = n(r.breached);
                        return (
                          <tr key={r.priority}>
                            <td>
                              <span className={styles.prioRow}>
                                <span className={styles.prioDot} style={{ background: color }} />
                                <span className={styles.prioName}>{PRIORITY_LABELS[r.priority] ?? r.priority}</span>
                              </span>
                            </td>
                            <td className={styles.prioTotal}>{n(r.total)}</td>
                            <td className={styles.prioBreached} style={{ color: breach > 0 ? '#ef4444' : '#22c55e' }}>{breach}</td>
                            <td className={styles.prioAvg}>{r.avg_sla_hours ? `${Math.round(n(r.avg_sla_hours))}h` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══════════ AUDITORÍA ══════════ */}
            {tab === 'auditoria' && (
              <>
                {/* KPI cards */}
                <div className={styles.auditKpiGrid}>
                  <div className={styles.auditKpiCard}>
                    <p className={styles.auditKpiVal}>{n(auditKpis?.total_today)}</p>
                    <p className={styles.auditKpiLabel}>Eventos hoy</p>
                  </div>
                  <div className={`${styles.auditKpiCard} ${n(auditKpis?.critical_today) > 0 ? styles.auditKpiCritical : ''}`}>
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

                {/* Filters */}
                <div className={styles.auditFilters}>
                  <span className={styles.auditFilterLabel}>Filtrar:</span>
                  <input
                    className={styles.auditFilterInput}
                    placeholder="Actor (nombre o email)"
                    value={auditActor}
                    onChange={e => setAuditActor(e.target.value)}
                  />
                  <input
                    className={styles.auditFilterInput}
                    placeholder="Acción (ej: auth, delete)"
                    value={auditAction}
                    onChange={e => setAuditAction(e.target.value)}
                  />
                  <input type="date" className={styles.auditFilterInput} value={auditFrom} onChange={e => setAuditFrom(e.target.value)} />
                  <span className={styles.dateSep}>—</span>
                  <input type="date" className={styles.auditFilterInput} value={auditTo} onChange={e => setAuditTo(e.target.value)} />
                  {(auditActor || auditAction || auditFrom || auditTo) && (
                    <button type="button" className={styles.dateClear} onClick={() => { setAuditActor(''); setAuditAction(''); setAuditFrom(''); setAuditTo(''); }}>Limpiar</button>
                  )}
                </div>

                {!auditLoading && (
                  <RiskDetectionBox signals={computeRiskSignals(auditLog ?? [])} />
                )}

                <div className={styles.chartsGrid} style={{ marginBottom: 16 }}>
                  {/* Timeline */}
                  <div>
                    <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>
                      <Shield size={12} style={{ verticalAlign: 'middle', marginRight: 5, color: '#ff5e3a' }} />
                      Timeline de eventos
                    </p>
                    {auditLoading
                      ? <div className={styles.loading} style={{ padding: '40px 0' }}>Cargando eventos…</div>
                      : <AuditTimeline events={auditLog ?? []} />
                    }
                  </div>

                  {/* User activity */}
                  <div>
                    <p className={styles.sectionTitle} style={{ marginBottom: 10 }}>
                      <User size={12} style={{ verticalAlign: 'middle', marginRight: 5, color: '#0e2235' }} />
                      Actividad por usuario (30 días)
                    </p>
                    <div className={styles.chartPanel} style={{ padding: '16px 12px' }}>
                      <div style={{ height: 280 }}>
                        {activityData.length === 0
                          ? <p className={styles.noData}>Sin actividad registrada.</p>
                          : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={activityData} layout="vertical" margin={{ left: 0, right: 12 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#334155' }} width={90} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [v, 'Acciones']} />
                                <Bar dataKey="count" name="Acciones" fill="#0e2235" radius={[0,4,4,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

          </>
        )}

      </div>
    </div>
  );
}
