'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Clock, AlertTriangle, CheckCircle2, Pause, ChevronRight, BarChart2, Search } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { ticketsService, type TicketListItem, type SlaStatus } from '@/services/tickets.service';
import { getPriorityConfig } from '@/constants/status';
import { MetricCard, MetricRow } from '@/components/ui/MetricCard';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import styles from './sla.module.css';

/* ── Helpers ── */
function hoursLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  return (new Date(deadline).getTime() - Date.now()) / 3_600_000;
}

function fmtHours(h: number): string {
  if (h < 0) {
    const abs = Math.abs(h);
    if (abs < 1) return `-${Math.round(abs * 60)}min`;
    return `-${abs.toFixed(1)}h`;
  }
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function riskLevel(h: number | null, status: SlaStatus | null): 'breached' | 'critical' | 'warning' | 'ok' | 'met' | 'paused' {
  if (status === 'met')      return 'met';
  if (status === 'paused')   return 'paused';
  if (status === 'breached') return 'breached';
  if (h === null)            return 'ok';
  if (h < 0)  return 'breached';
  if (h < 2)  return 'critical';
  if (h < 8)  return 'warning';
  return 'ok';
}

const RISK_COLORS: Record<string, string> = {
  breached: '#ef4444',
  critical: '#f97316',
  warning:  '#f59e0b',
  ok:       '#22c55e',
  met:      '#22c55e',
  paused:   '#94a3b8',
};

const RISK_LABELS: Record<string, string> = {
  breached: 'Vencido',
  critical: 'Crítico <2h',
  warning:  'En riesgo <8h',
  ok:       'En tiempo',
  met:      'Cumplido',
  paused:   'Pausado',
};

function rowClass(risk: string): string {
  if (risk === 'breached') return `${styles.ticketRow} ${styles.ticketRowBreached}`;
  if (risk === 'critical') return `${styles.ticketRow} ${styles.ticketRowCritical}`;
  return `${styles.ticketRow} ${styles.ticketRowNormal}`;
}

/* ── Ticket row ── */
function TicketRow({ ticket }: { ticket: TicketListItem & { risk: string; hoursLeft: number | null } }) {
  const router    = useRouter();
  const h         = ticket.hoursLeft;
  const risk      = ticket.risk;
  const riskColor = RISK_COLORS[risk] ?? '#94a3b8';
  const pCfg      = getPriorityConfig(ticket.priority);

  return (
    <div className={rowClass(risk)} onClick={() => router.push(`/helpdesk/ticket/${ticket.id}`)}>
      {/* Title */}
      <div className={styles.ticketTitleWrap}>
        <p className={styles.ticketTitle}>{ticket.title}</p>
        <p className={styles.ticketMeta}>#{ticket.id.slice(-6).toUpperCase()} · {ticket.creator_name}</p>
      </div>

      {/* Assignee */}
      <p className={`${styles.ticketAssignee} ${styles.colAssignee}`}>
        {ticket.assignee_name ?? '—'}
      </p>

      {/* Priority */}
      <span
        className={`${styles.priorityBadge} ${styles.colPriority}`}
        style={{
          background: `color-mix(in srgb, ${pCfg.color} 15%, transparent)`,
          color: pCfg.color,
          border: `1px solid color-mix(in srgb, ${pCfg.color} 25%, transparent)`,
        }}
      >
        {pCfg.label}
      </span>

      {/* Time left */}
      <span className={`${styles.slaTime} ${styles.colSlaTime}`} style={{ color: riskColor }}>
        {h !== null ? fmtHours(h) : '—'}
      </span>

      {/* Risk badge */}
      <span
        className={styles.riskBadge}
        style={{ background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}30` }}
      >
        {RISK_LABELS[risk]}
      </span>

      <ChevronRight size={13} style={{ color: '#94a3b8' }} />
    </div>
  );
}

type ViewFilter = 'all' | 'breached' | 'critical' | 'warning' | 'ok' | 'met';

/* ── Main page ── */
export default function SlaPage() {
  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  const { allowed } = useHelpdeskRoleGuard(['admin_modulo', 'jefe_tecnico', 'tecnico']);

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [view,   setView]   = useState<ViewFilter>('all');
  const [search, setSearch] = useState('');

  const { data: res, isLoading } = useQuery({
    queryKey:  ['sla-all-tickets', helpdeskId],
    queryFn:   () => ticketsService.getAll({ module_id: helpdeskId!, limit: 500 }),
    enabled:   !!helpdeskId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allTickets = res?.data ?? [];

  const withRisk = useMemo(() =>
    allTickets
      .filter(t => !t.is_final)
      .map(t => {
        const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
        return { ...t, risk: riskLevel(h, t.sla_status), hoursLeft: h };
      })
      .sort((a, b) => {
        const order = { breached: 0, critical: 1, warning: 2, ok: 3, met: 4, paused: 5 };
        const oa = (order as Record<string, number>)[a.risk] ?? 9;
        const ob = (order as Record<string, number>)[b.risk] ?? 9;
        if (oa !== ob) return oa - ob;
        return (a.hoursLeft ?? 999) - (b.hoursLeft ?? 999);
      }),
    [allTickets],
  );

  const stats = useMemo(() => {
    const closed  = allTickets.filter(t => t.is_final);
    const met     = closed.filter(t => t.sla_status === 'met').length;
    const breached = closed.filter(t => t.sla_status === 'breached').length;
    const rate    = closed.length > 0 ? Math.round((met / closed.length) * 100) : null;
    return {
      breached_active:  withRisk.filter(t => t.risk === 'breached').length,
      critical_active:  withRisk.filter(t => t.risk === 'critical').length,
      warning_active:   withRisk.filter(t => t.risk === 'warning').length,
      ok_active:        withRisk.filter(t => t.risk === 'ok').length,
      closed_met:       met,
      closed_breached:  breached,
      compliance_rate:  rate,
    };
  }, [withRisk, allTickets]);

  const filtered = useMemo(() => {
    let list: typeof withRisk = withRisk;
    if (view === 'breached') list = list.filter(t => t.risk === 'breached');
    else if (view === 'critical') list = list.filter(t => t.risk === 'critical' || t.risk === 'breached');
    else if (view === 'warning')  list = list.filter(t => t.risk === 'warning');
    else if (view === 'met')      list = allTickets
      .filter(t => t.is_final && t.sla_status === 'met')
      .map(t => ({ ...t, risk: 'met' as const, hoursLeft: null }));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.creator_name ?? '').toLowerCase().includes(q) ||
        (t.assignee_name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [withRisk, allTickets, view, search]);

  const complianceColor = stats.compliance_rate === null ? '#94a3b8'
    : stats.compliance_rate >= 90 ? '#22c55e'
    : stats.compliance_rate >= 70 ? '#f59e0b'
    : '#ef4444';

  if (!allowed) return null;

  return (
    <ModuleLayout
      moduleId={helpdeskId}
      title="Mesa de Ayuda"
      description=""
      isSuperadmin={isSuperadmin}
      hideInfo
    >
      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mesa de Ayuda</p>
          <h1 className={styles.title}>Seguimiento SLA</h1>
        </div>

        {stats.compliance_rate !== null && (
          <div className={styles.complianceBadge}>
            <BarChart2 size={18} style={{ color: complianceColor }} />
            <div>
              <p className={styles.complianceValue} style={{ color: complianceColor }}>
                {stats.compliance_rate}%
              </p>
              <p className={styles.complianceLabel}>Cumplimiento SLA</p>
            </div>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <MetricRow style={{ marginBottom: 20 }}>
        <MetricCard icon={<AlertTriangle size={18} />} label="Vencidos"    value={stats.breached_active} color="var(--status-breached-text)" active={view === 'breached'} onClick={() => setView(v => v === 'breached' ? 'all' : 'breached')} />
        <MetricCard icon={<Clock size={18} />}         label="Crítico <2h" value={stats.critical_active} color="var(--status-escalated-text)" active={view === 'critical'} onClick={() => setView(v => v === 'critical' ? 'all' : 'critical')} />
        <MetricCard icon={<Clock size={18} />}         label="En riesgo"   value={stats.warning_active}  color="var(--status-warning-text)"   active={view === 'warning'}  onClick={() => setView(v => v === 'warning'  ? 'all' : 'warning')}  />
        <MetricCard icon={<CheckCircle2 size={18} />}  label="En tiempo"   value={stats.ok_active}       color="var(--status-success-text)"   active={view === 'ok'}       onClick={() => setView(v => v === 'ok'       ? 'all' : 'ok')}       />
        <MetricCard icon={<Pause size={18} />}         label="Cumplidos"   value={stats.closed_met}      color="var(--status-closed-text)"    active={view === 'met'}      onClick={() => setView(v => v === 'met'      ? 'all' : 'met')}      />
      </MetricRow>

      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}><Search size={13} /></span>
        <input
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ticket, técnico o solicitante…"
        />
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          {['Ticket', 'Técnico', 'Prioridad', 'Tiempo', 'Estado SLA', ''].map((h, i) => (
            <span key={i} className={styles.headerCell}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div className={styles.loading}>Cargando datos SLA…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={28} style={{ color: '#22c55e', display: 'block', margin: '0 auto 0' }} />
            <p className={styles.emptyText}>
              {view === 'all' ? 'Sin tickets activos.' : 'Sin tickets en esta categoría.'}
            </p>
          </div>
        ) : (
          filtered.map((t) => <TicketRow key={t.id} ticket={t as TicketListItem & { risk: string; hoursLeft: number | null }} />)
        )}
      </div>

      {filtered.length > 0 && (
        <p className={styles.footerCount}>
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''} mostrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </ModuleLayout>
  );
}
