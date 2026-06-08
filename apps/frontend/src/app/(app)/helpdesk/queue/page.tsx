'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, AlertTriangle, Clock, Search, UserPlus, ChevronRight, CheckCircle2, ChevronDown,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { usePermission } from '@/hooks/usePermission';
import { ticketsService, type TicketListItem, type TicketPriority, TICKET_PRIORITY_ORDER, TECH_AVAIL_COLORS, TECH_AVAIL_LABELS } from '@/services/tickets.service';
import { getPriorityConfig, getSlaStatusConfig } from '@/constants/status';
import { modulesService } from '@/services/modules.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';
import { fmtDate } from '@/lib/formatters';
import styles from './queue.module.css';

/* ── Design tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

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

const AVAIL_ORDER: Record<string, number> = {
  disponible: 0, ocupado: 1, en_reunion: 2, ausente: 3, fuera_horario: 4, offline: 5,
};

/* ── Tech assign inline dropdown ── */
function TechAssignDropdown({
  techs, isAssigning, onAssign,
}: {
  techs: ModuleTechnician[];
  isAssigning: boolean;
  onAssign: (techId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const sorted = useMemo(() =>
    [...techs].sort((a, b) => (AVAIL_ORDER[a.avail_status] ?? 9) - (AVAIL_ORDER[b.avail_status] ?? 9)),
    [techs],
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={isAssigning}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 10px', borderRadius: 7,
          border: `1px solid ${C.border}`, background: open ? C.bg : '#fff',
          color: C.sub, fontSize: 10, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        <UserPlus size={10} /> Asignar <ChevronDown size={9} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 60,
          background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
          boxShadow: '0 8px 24px rgba(14,34,53,.12)', marginTop: 3,
          minWidth: 210, maxHeight: 240, overflowY: 'auto',
        }}>
          {sorted.map(t => {
            const ac = TECH_AVAIL_COLORS[t.avail_status ?? 'offline'];
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onAssign(t.id); }}
                style={{
                  width: '100%', padding: '7px 11px', border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'inherit', textAlign: 'left',
                  opacity: t.avail_status === 'offline' ? .55 : 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.bg; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ac, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 11, color: '#334155' }}>{t.first_name} {t.last_name}</span>
                <span style={{ fontSize: 10, color: ac, fontWeight: 600 }}>{TECH_AVAIL_LABELS[t.avail_status as TechAvailStatus]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── TicketRow ── */
function TicketRow({
  ticket,
  canTake,
  isTaking,
  onTake,
  techs,
  isAssigning,
  onAssignTo,
  canAssignOthers,
  isRecentlyAssigned,
}: {
  ticket: TicketListItem;
  canTake: boolean;
  isTaking: boolean;
  onTake: (id: string) => void;
  techs: ModuleTechnician[];
  isAssigning: boolean;
  onAssignTo: (ticketId: string, techId: string) => void;
  canAssignOthers: boolean;
  isRecentlyAssigned: boolean;
}) {
  const router    = useRouter();
  const pColor    = getPriorityConfig(ticket.priority).color;
  const h         = hoursLeft(ticket.sla_deadline_tracked ?? ticket.sla_deadline);
  const slaColor  = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status).text : null;
  const isBreached = ticket.sla_status === 'breached';
  const isCritical = h !== null && h < 2 && ticket.sla_status === 'active';

  const baseBg    = isRecentlyAssigned ? '#f0fdf4' : isBreached ? '#fef2f2' : isCritical ? '#fff7ed' : isTaking ? '#f8fafc' : '#fff';
  const hoverBg   = isRecentlyAssigned ? '#dcfce7' : isBreached ? '#fee2e2' : isCritical ? '#ffedd5' : C.bg;
  const leftColor = isRecentlyAssigned ? '#22c55e' : isBreached ? '#ef4444' : isCritical ? '#f97316' : pColor;

  return (
    <div
      className={styles.tableGrid}
      style={{
        padding: '12px 16px',
        background: baseBg,
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${leftColor}`,
        cursor: 'pointer',
        transition: 'background .25s',
        opacity: isTaking ? .75 : 1,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = hoverBg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = baseBg; }}
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
      <p className={styles.colSede} style={{ margin: 0, fontSize: 11, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticket.environment_name ?? '—'}
      </p>

      {/* Priority */}
      <span className={styles.colPriority} style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `color-mix(in srgb, ${pColor} 15%, transparent)`, color: pColor, border: `1px solid color-mix(in srgb, ${pColor} 25%, transparent)`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {getPriorityConfig(ticket.priority).label}
      </span>

      {/* SLA time */}
      {h !== null ? (
        <span style={{ fontSize: 11, fontWeight: 800, color: slaColor ?? C.muted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {fmtHours(h)}
        </span>
      ) : (
        <span style={{ fontSize: 10, color: C.muted }}>—</span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        {canTake && (
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
        )}
        {canAssignOthers && (
          <TechAssignDropdown
            techs={techs}
            isAssigning={isAssigning}
            onAssign={(techId) => onAssignTo(ticket.id, techId)}
          />
        )}
        {!canTake && !canAssignOthers && (
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
  techs,
  assigningId,
  onAssignTo,
  canAssignOthers,
  recentlyAssignedId,
}: {
  group: typeof PRIORITY_GROUPS[0];
  tickets: TicketListItem[];
  canTake: boolean;
  takingId: string | null;
  onTake: (id: string) => void;
  techs: ModuleTechnician[];
  assigningId: string | null;
  onAssignTo: (ticketId: string, techId: string) => void;
  canAssignOthers: boolean;
  recentlyAssignedId: string | null;
}) {
  const pColor = getPriorityConfig(group.priority).color;
  if (tickets.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: `color-mix(in srgb, ${pColor} 8%, transparent)`, borderRadius: '10px 10px 0 0', border: `1px solid color-mix(in srgb, ${pColor} 20%, transparent)`, borderBottom: 'none' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: pColor, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          {group.label}
        </span>
        <span style={{ fontSize: 10, color: pColor, opacity: .7 }}>— {group.urgency}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: pColor, background: `color-mix(in srgb, ${pColor} 15%, transparent)`, padding: '2px 8px', borderRadius: 5, border: `1px solid color-mix(in srgb, ${pColor} 25%, transparent)` }}>
          {tickets.length}
        </span>
      </div>

      {/* Table header */}
      <div className={styles.tableGrid} style={{ padding: '8px 16px', background: C.bg, border: `1px solid ${C.border}`, borderBottom: 'none', borderTop: 'none' }}>
        {(['Ticket', 'Sede/Ambiente', 'Prioridad', 'SLA', 'Acción'] as const).map((h, i) => (
          <span
            key={i}
            className={i === 1 ? styles.colSede : i === 2 ? styles.colPriority : undefined}
            style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}
          >
            {h}
          </span>
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
            techs={techs}
            isAssigning={assigningId === t.id}
            onAssignTo={onAssignTo}
            canAssignOthers={canAssignOthers}
            isRecentlyAssigned={recentlyAssignedId === t.id}
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

  const [search,              setSearch]              = useState('');
  const [filterCategory,      setFilterCategory]      = useState<string | null>(null);
  const [filterSla,           setFilterSla]           = useState<string | null>(null);
  const [takingId,            setTakingId]            = useState<string | null>(null);
  const [assigningId,         setAssigningId]         = useState<string | null>(null);
  const [recentlyAssignedId,  setRecentlyAssignedId]  = useState<string | null>(null);
  const [toast,               setToast]               = useState<string | null>(null);
  const toastRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  /* Role check */
  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);
  const canTake         = usePermission('helpdesk:tickets:assign');
  const canAssignOthers = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';

  const { data: res, isLoading, refetch } = useQuery({
    queryKey:  ['queue-unassigned', helpdeskId],
    queryFn:   () => ticketsService.getAll({ module_id: helpdeskId!, unassigned: true, limit: 200 }),
    enabled:   !!helpdeskId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: techs = [] } = useQuery<ModuleTechnician[]>({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId && canAssignOthers,
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const allTickets = res?.data ?? [];

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of allTickets) {
      if (t.category_name && !seen.has(t.category_name)) {
        seen.add(t.category_name);
        out.push(t.category_name);
      }
    }
    return out.sort();
  }, [allTickets]);

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
    if (filterCategory) {
      list = list.filter(t => t.category_name === filterCategory);
    }
    if (filterSla === 'breached') {
      list = list.filter(t => t.sla_status === 'breached');
    } else if (filterSla === 'risk') {
      list = list.filter(t => {
        const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
        return t.sla_status === 'active' && h !== null && h < 4;
      });
    } else if (filterSla === 'ok') {
      list = list.filter(t => {
        const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
        return t.sla_status === 'active' && (h === null || h >= 4);
      });
    }
    return list.sort((a, b) => {
      const po = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (po !== 0) return po;
      const ha = hoursLeft(a.sla_deadline_tracked ?? a.sla_deadline);
      const hb = hoursLeft(b.sla_deadline_tracked ?? b.sla_deadline);
      if (ha !== null && hb !== null) return ha - hb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [allTickets, search, filterCategory, filterSla]);

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
    onSuccess: (_, ticketId) => {
      qc.invalidateQueries({ queryKey: ['queue-unassigned', helpdeskId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['my-assigned-tickets', helpdeskId] });
      setTakingId(null);
      showToast('Ticket tomado — redirigiendo…');
      router.push('/helpdesk/ticket/' + ticketId);
    },
    onError: () => setTakingId(null),
  });

  function handleTake(ticketId: string) {
    setTakingId(ticketId);
    takeMut.mutate(ticketId);
  }

  /* Assign to specific tech */
  const assignMut = useMutation({
    mutationFn: async ({ ticketId, techId }: { ticketId: string; techId: string }) =>
      ticketsService.addAssignment(ticketId, techId, 'owner'),
    onSuccess: (_, { ticketId, techId }) => {
      const techName = techs.find(t => t.id === techId);
      const name = techName ? `${techName.first_name} ${techName.last_name}` : 'el técnico';
      setRecentlyAssignedId(ticketId);
      if (assignedRef.current) clearTimeout(assignedRef.current);
      assignedRef.current = setTimeout(() => {
        setRecentlyAssignedId(null);
        qc.invalidateQueries({ queryKey: ['queue-unassigned', helpdeskId] });
        qc.invalidateQueries({ queryKey: ['my-assigned-tickets', helpdeskId] });
      }, 700);
      showToast(`Ticket asignado a ${name}`);
      setAssigningId(null);
    },
    onError: () => setAssigningId(null),
  });

  function handleAssignTo(ticketId: string, techId: string) {
    setAssigningId(ticketId);
    assignMut.mutate({ ticketId, techId });
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
              <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, ID, categoría o solicitante…"
          style={{ width: '100%', padding: '9px 12px 9px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }}
        />
      </div>

      {/* Filters */}
      {(categories.length > 0 || true) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, alignItems: 'center' }}>
          {/* SLA chips */}
          {[
            { key: 'breached', label: 'SLA Vencido', color: '#ef4444' },
            { key: 'risk',     label: 'SLA Riesgo',  color: '#f97316' },
            { key: 'ok',       label: 'SLA OK',      color: '#22c55e' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterSla(filterSla === f.key ? null : f.key)}
              style={{
                padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                border: `1px solid ${filterSla === f.key ? f.color : `${f.color}44`}`,
                background: filterSla === f.key ? `${f.color}18` : '#fff',
                color: filterSla === f.key ? f.color : C.muted,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}

          {/* Category separator */}
          {categories.length > 0 && (
            <span style={{ width: 1, height: 16, background: C.border, margin: '0 4px', flexShrink: 0 }} />
          )}

          {/* Category chips */}
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
              style={{
                padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700,
                border: `1px solid ${filterCategory === cat ? C.navy : C.border}`,
                background: filterCategory === cat ? C.navy : '#fff',
                color: filterCategory === cat ? '#fff' : C.sub,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {cat}
            </button>
          ))}

          {/* Clear all */}
          {(filterCategory || filterSla) && (
            <button
              type="button"
              onClick={() => { setFilterCategory(null); setFilterSla(null); }}
              style={{ padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 700, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

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
          {!canTake && !canAssignOthers && (
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
              techs={techs}
              assigningId={assigningId}
              onAssignTo={handleAssignTo}
              canAssignOthers={canAssignOthers}
              recentlyAssignedId={recentlyAssignedId}
            />
          ))}
        </>
      )}
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#0e2235', color: '#fff', padding: '10px 18px',
          borderRadius: 10, fontSize: 12, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          pointerEvents: 'none',
        }}>
          <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
          {toast}
        </div>
      )}
    </ModuleLayout>
  );
}
