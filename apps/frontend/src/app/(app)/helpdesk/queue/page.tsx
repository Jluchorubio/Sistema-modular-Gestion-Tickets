'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, AlertTriangle, Clock, Search, UserPlus, ChevronRight, CheckCircle2,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { usePermission } from '@/hooks/usePermission';
import { ticketsService, type TicketListItem, type TicketPriority, TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, SLA_STATUS_COLORS } from '@/services/tickets.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { fmtDate } from '@/lib/formatters';

/* ── Design tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

const PRIORITY_ORDER: Record<TicketPriority, number> = {
  critica: 0, alta: 1, media: 2, baja: 3,
};

const PRIORITY_GROUPS: { priority: TicketPriority; label: string; urgency: string }[] = [
  { priority: 'critica', label: 'Crítica',  urgency: 'Requiere atención inmediata' },
  { priority: 'alta',    label: 'Alta',     urgency: 'Resolver en las próximas 2h' },
  { priority: 'media',   label: 'Media',    urgency: 'Resolver en el día' },
  { priority: 'baja',    label: 'Baja',     urgency: 'Sin urgencia inmediata' },
];

function hoursLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  return (new Date(deadline).getTime() - Date.now()) / 3_600_000;
}

function fmtHours(h: number): string {
  if (h < 0) return `-${Math.abs(h).toFixed(0)}h`;
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/* ── TicketRow ── */
function TicketRow({
  ticket,
  canTake,
  isTaking,
  onTake,
}: {
  ticket: TicketListItem;
  canTake: boolean;
  isTaking: boolean;
  onTake: (id: string) => void;
}) {
  const router    = useRouter();
  const pColor    = TICKET_PRIORITY_COLORS[ticket.priority] ?? C.muted;
  const h         = hoursLeft(ticket.sla_deadline_tracked ?? ticket.sla_deadline);
  const slaColor  = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status] ?? null) : null;
  const isBreached = ticket.sla_status === 'breached';
  const isCritical = h !== null && h < 2 && ticket.sla_status === 'active';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 130px 90px 80px 90px',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: isBreached ? '#fef2f2' : isCritical ? '#fff7ed' : '#fff',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${isBreached ? '#ef4444' : isCritical ? '#f97316' : pColor}`,
        cursor: 'pointer',
        transition: 'background .1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isBreached ? '#fee2e2' : isCritical ? '#ffedd5' : C.bg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isBreached ? '#fef2f2' : isCritical ? '#fff7ed' : '#fff'; }}
      onClick={() => router.push(`/helpdesk/ticket/${ticket.id}`)}
    >
      {/* Title + meta */}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: '0 0 3px', fontSize: 12.5, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.title}
        </p>
        <p style={{ margin: 0, fontSize: 10, color: C.muted }}>
          #{ticket.id.slice(-6).toUpperCase()} · {ticket.category_name} · {ticket.creator_name}
        </p>
      </div>

      {/* Category + environment */}
      <p style={{ margin: 0, fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticket.environment_name ?? '—'}
      </p>

      {/* Priority */}
      <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {TICKET_PRIORITY_LABELS[ticket.priority]}
      </span>

      {/* SLA time */}
      {h !== null ? (
        <span style={{ fontSize: 11, fontWeight: 800, color: slaColor ?? C.muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {fmtHours(h)}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: C.muted }}>—</span>
      )}

      {/* Take button */}
      {canTake ? (
        <button
          type="button"
          disabled={isTaking}
          onClick={(e) => { e.stopPropagation(); onTake(ticket.id); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 7,
            border: 'none', background: isTaking ? C.muted : C.navy,
            color: '#fff', fontSize: 10, fontWeight: 700,
            cursor: isTaking ? 'wait' : 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          <UserPlus size={10} />
          {isTaking ? '…' : 'Tomar'}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); router.push(`/helpdesk/ticket/${ticket.id}`); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 7,
            border: `1px solid ${C.border}`, background: '#fff',
            color: C.sub, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          Ver <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}

/* ── Priority group ── */
function PriorityGroup({
  group,
  tickets,
  canTake,
  takingId,
  onTake,
}: {
  group: typeof PRIORITY_GROUPS[0];
  tickets: TicketListItem[];
  canTake: boolean;
  takingId: string | null;
  onTake: (id: string) => void;
}) {
  const pColor = TICKET_PRIORITY_COLORS[group.priority];
  if (tickets.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: `${pColor}08`, borderRadius: '10px 10px 0 0', border: `1px solid ${pColor}25`, borderBottom: 'none' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: pColor, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          {group.label}
        </span>
        <span style={{ fontSize: 10, color: pColor, opacity: .7 }}>— {group.urgency}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: pColor, background: `${pColor}18`, padding: '2px 8px', borderRadius: 5, border: `1px solid ${pColor}30` }}>
          {tickets.length}
        </span>
      </div>

      {/* Table header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 80px 90px', gap: 12, padding: '8px 16px', background: C.bg, border: `1px solid ${C.border}`, borderBottom: 'none', borderTop: 'none' }}>
        {['Ticket', 'Sede/Ambiente', 'Prioridad', 'SLA', 'Acción'].map((h, i) => (
          <span key={i} style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        {tickets.map(t => (
          <TicketRow
            key={t.id}
            ticket={t}
            canTake={canTake}
            isTaking={takingId === t.id}
            onTake={onTake}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function QueuePage() {
  const router   = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc       = useQueryClient();

  const { allowed } = useHelpdeskRoleGuard(['admin_modulo', 'jefe_tecnico']);

  const { modules }  = useModules();
  const helpdeskId   = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [search,    setSearch]    = useState('');
  const [takingId,  setTakingId]  = useState<string | null>(null);

  /* Role check */
  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);
  const canTake  = usePermission('helpdesk:tickets:assign');

  const { data: res, isLoading, refetch } = useQuery({
    queryKey:  ['queue-unassigned', helpdeskId],
    queryFn:   () => ticketsService.getAll({ module_id: helpdeskId!, unassigned: true, limit: 200 }),
    enabled:   !!helpdeskId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allTickets = res?.data ?? [];

  const filtered = useMemo(() => {
    let list = allTickets;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.category_name ?? '').toLowerCase().includes(q) ||
        (t.creator_name ?? '').toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const po = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (po !== 0) return po;
      const ha = hoursLeft(a.sla_deadline_tracked ?? a.sla_deadline);
      const hb = hoursLeft(b.sla_deadline_tracked ?? b.sla_deadline);
      if (ha !== null && hb !== null) return ha - hb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [allTickets, search]);

  const grouped = useMemo(() =>
    PRIORITY_GROUPS.map(g => ({
      ...g,
      tickets: filtered.filter(t => t.priority === g.priority),
    })),
    [filtered],
  );

  /* Take ticket */
  const takeMut = useMutation({
    mutationFn: async (ticketId: string) => {
      if (!user) throw new Error('No user');
      return ticketsService.addAssignment(ticketId, user.id, 'owner');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue-unassigned', helpdeskId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['my-assigned-tickets', helpdeskId] });
      setTakingId(null);
    },
    onError: () => setTakingId(null),
  });

  function handleTake(ticketId: string) {
    setTakingId(ticketId);
    takeMut.mutate(ticketId);
  }

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>
            Mesa de Ayuda
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 4px' }}>
            Cola de trabajo
          </h1>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            Tickets sin técnico asignado — ordenados por prioridad y SLA
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Sin asignar', value: allTickets.length, color: C.coral },
            { label: 'Críticos', value: allTickets.filter(t => t.priority === 'critica').length, color: '#ef4444' },
            { label: 'SLA riesgo', value: allTickets.filter(t => {
              const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
              return t.sla_status === 'active' && h !== null && h < 4;
            }).length, color: '#f97316' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 80 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</p>
              <p style={{ margin: '3px 0 0', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, ID, categoría o solicitante…"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Cargando cola de trabajo…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 6px' }}>
            Cola vacía
          </p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            {allTickets.length === 0 ? 'Todos los tickets tienen técnico asignado.' : 'Sin resultados para la búsqueda.'}
          </p>
        </div>
      ) : (
        <>
          {!canTake && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 14 }}>
              <Inbox size={13} style={{ color: '#1d4ed8' }} />
              <span style={{ fontSize: 11, color: '#1e3a8a' }}>Modo visualización — solo técnicos y administradores pueden tomar tickets.</span>
            </div>
          )}
          {grouped.map(g => (
            <PriorityGroup
              key={g.priority}
              group={g}
              tickets={g.tickets}
              canTake={canTake}
              takingId={takingId}
              onTake={handleTake}
            />
          ))}
        </>
      )}
    </ModuleLayout>
  );
}
