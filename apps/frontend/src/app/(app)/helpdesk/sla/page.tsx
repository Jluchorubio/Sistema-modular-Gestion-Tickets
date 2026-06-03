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
import { ticketsService, type TicketListItem, type SlaStatus, TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, SLA_STATUS_COLORS } from '@/services/tickets.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

/* ── Design tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

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

/* ── Metric card ── */
function MetricCard({
  icon, label, value, color, active, onClick
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${color}10` : '#fff',
        border: `1.5px solid ${active ? color : C.border}`,
        borderRadius: 12,
        padding: '16px 20px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flex: 1,
        minWidth: 140,
        transition: 'border-color .15s',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'grid', placeItems: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: active ? color : C.navy, lineHeight: 1 }}>{value}</p>
        <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
      </div>
    </div>
  );
}

/* ── Ticket row ── */
function TicketRow({ ticket }: { ticket: TicketListItem }) {
  const router    = useRouter();
  const h         = hoursLeft(ticket.sla_deadline_tracked ?? ticket.sla_deadline);
  const risk      = riskLevel(h, ticket.sla_status);
  const riskColor = RISK_COLORS[risk] ?? C.muted;
  const pColor    = TICKET_PRIORITY_COLORS[ticket.priority] ?? C.muted;

  return (
    <div
      onClick={() => router.push(`/helpdesk/ticket/${ticket.id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 100px 90px 110px 36px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: risk === 'breached' ? '#fef2f2' : risk === 'critical' ? '#fff7ed' : '#fff',
        borderBottom: `1px solid ${C.border}`,
        cursor: 'pointer',
        borderLeft: `3px solid ${riskColor}`,
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = risk === 'breached' ? '#fee2e2' : risk === 'critical' ? '#ffedd5' : C.bg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = risk === 'breached' ? '#fef2f2' : risk === 'critical' ? '#fff7ed' : '#fff'; }}
    >
      {/* Title */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 3px', fontSize: 12.5, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.title}
        </p>
        <p style={{ margin: 0, fontSize: 10, color: C.muted }}>
          #{ticket.id.slice(-6).toUpperCase()} · {ticket.creator_name}
        </p>
      </div>

      {/* Assignee */}
      <p style={{ margin: 0, fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticket.assignee_name ?? '—'}
      </p>

      {/* Priority */}
      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {TICKET_PRIORITY_LABELS[ticket.priority]}
      </span>

      {/* Time left */}
      <span style={{ fontSize: 12, fontWeight: 800, color: riskColor, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
        {h !== null ? fmtHours(h) : '—'}
      </span>

      {/* Risk badge */}
      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}30`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {RISK_LABELS[risk]}
      </span>

      <ChevronRight size={13} style={{ color: C.muted }} />
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

  /* Fetch all non-final tickets */
  const { data: res, isLoading } = useQuery({
    queryKey:  ['sla-all-tickets', helpdeskId],
    queryFn:   () => ticketsService.getAll({ module_id: helpdeskId!, limit: 500 }),
    enabled:   !!helpdeskId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allTickets = res?.data ?? [];

  /* Compute risk levels */
  const withRisk = useMemo(() =>
    allTickets
      .filter(t => !t.is_final)
      .map(t => {
        const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
        return { ...t, risk: riskLevel(h, t.sla_status), hoursLeft: h };
      })
      .sort((a, b) => {
        const order = { breached: 0, critical: 1, warning: 2, ok: 3, met: 4, paused: 5 };
        const oa = order[a.risk] ?? 9;
        const ob = order[b.risk] ?? 9;
        if (oa !== ob) return oa - ob;
        return (a.hoursLeft ?? 999) - (b.hoursLeft ?? 999);
      }),
    [allTickets],
  );

  /* Compliance stats */
  const stats = useMemo(() => {
    const closed = allTickets.filter(t => t.is_final);
    const met     = closed.filter(t => t.sla_status === 'met').length;
    const breached = closed.filter(t => t.sla_status === 'breached').length;
    const rate = closed.length > 0 ? Math.round((met / closed.length) * 100) : null;
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
    let list = withRisk;
    if (view === 'breached') list = list.filter(t => t.risk === 'breached');
    else if (view === 'critical') list = list.filter(t => t.risk === 'critical' || t.risk === 'breached');
    else if (view === 'warning')  list = list.filter(t => t.risk === 'warning');
    else if (view === 'met')      list = allTickets.filter(t => t.is_final && t.sla_status === 'met')
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

  const complianceColor = stats.compliance_rate === null ? C.muted
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>
            Mesa de Ayuda
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: 0 }}>
            Seguimiento SLA
          </h1>
        </div>

        {/* Compliance rate */}
        {stats.compliance_rate !== null && (
          <div style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <BarChart2 size={18} style={{ color: complianceColor }} />
            <div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: complianceColor, lineHeight: 1 }}>
                {stats.compliance_rate}%
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Cumplimiento SLA
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard icon={<AlertTriangle size={18} />} label="Vencidos"    value={stats.breached_active} color="#ef4444" active={view === 'breached'} onClick={() => setView(v => v === 'breached' ? 'all' : 'breached')} />
        <MetricCard icon={<Clock size={18} />}         label="Crítico <2h" value={stats.critical_active} color="#f97316" active={view === 'critical'} onClick={() => setView(v => v === 'critical' ? 'all' : 'critical')} />
        <MetricCard icon={<Clock size={18} />}         label="En riesgo"   value={stats.warning_active}  color="#f59e0b" active={view === 'warning'}  onClick={() => setView(v => v === 'warning'  ? 'all' : 'warning')}  />
        <MetricCard icon={<CheckCircle2 size={18} />}  label="En tiempo"   value={stats.ok_active}       color="#22c55e" active={view === 'ok'}       onClick={() => setView(v => v === 'ok'       ? 'all' : 'ok')}       />
        <MetricCard icon={<Pause size={18} />}         label="Cumplidos"   value={stats.closed_met}      color="#94a3b8" active={view === 'met'}      onClick={() => setView(v => v === 'met'      ? 'all' : 'met')}      />
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ticket, técnico o solicitante…"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 90px 110px 36px', gap: 12, padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.border}`, borderLeft: '3px solid transparent' }}>
          {['Ticket', 'Técnico', 'Prioridad', 'Tiempo', 'Estado SLA', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
            Cargando datos SLA…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <CheckCircle2 size={28} style={{ color: '#22c55e', display: 'block', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {view === 'all' ? 'Sin tickets activos.' : 'Sin tickets en esta categoría.'}
            </p>
          </div>
        ) : (
          filtered.map((t) => <TicketRow key={t.id} ticket={t as TicketListItem} />)
        )}
      </div>

      {/* Footer count */}
      {filtered.length > 0 && (
        <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', textAlign: 'right' }}>
          {filtered.length} ticket{filtered.length !== 1 ? 's' : ''} mostrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </ModuleLayout>
  );
}
