'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Inbox, AlertTriangle, Search, UserPlus, ChevronRight, CheckCircle2, ChevronDown, RefreshCw,
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

const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;
const QUEUE_LIMIT    = 50;

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

function fmtAge(created: string): string {
  const ms = Date.now() - new Date(created).getTime();
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(0)}h`;
  return `${Math.floor(h / 24)}d`;
}

function ageColor(created: string): string {
  const h = (Date.now() - new Date(created).getTime()) / 3_600_000;
  if (h >= 8) return '#ef4444';
  if (h >= 2) return '#f59e0b';
  return '#94a3b8';
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
    <div ref={ref} className={styles.assignWrap}>
      <button
        type="button"
        disabled={isAssigning}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className={styles.assignBtn}
        style={open ? { background: '#f8fafc' } : undefined}
      >
        <UserPlus size={10} /> Asignar <ChevronDown size={9} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div className={styles.assignMenu}>
          {sorted.map(t => {
            const ac = TECH_AVAIL_COLORS[t.avail_status ?? 'offline'];
            return (
              <button
                key={t.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onAssign(t.id); }}
                className={styles.assignItem}
                style={{ opacity: t.avail_status === 'offline' ? .55 : 1 }}
              >
                <span className={styles.assignDot} style={{ background: ac }} />
                <span className={styles.assignName}>{t.first_name} {t.last_name}</span>
                <span className={styles.assignStatus} style={{ color: ac }}>{TECH_AVAIL_LABELS[t.avail_status as TechAvailStatus]}</span>
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
  const router   = useRouter();
  const pColor   = getPriorityConfig(ticket.priority).color;
  const h        = hoursLeft(ticket.sla_deadline_tracked ?? ticket.sla_deadline);
  const slaColor = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status).text : null;
  const isBreached = ticket.sla_status === 'breached';
  const isCritical = h !== null && h < 2 && ticket.sla_status === 'active';

  const state = isRecentlyAssigned ? 'assigned' : isBreached ? 'breached' : isCritical ? 'critical' : 'normal';
  const leftColor = isRecentlyAssigned ? '#22c55e' : isBreached ? '#ef4444' : isCritical ? '#f97316' : pColor;

  return (
    <div
      className={`${styles.tableGrid} ${styles.ticketRowWrap}`}
      data-state={state}
      style={{
        borderLeft: `3px solid ${leftColor}`,
        opacity: isTaking ? .75 : 1,
      }}
      onClick={() => router.push(`/helpdesk/ticket/${ticket.id}`)}
    >
      {/* Title + meta */}
      <div style={{ minWidth: 0 }}>
        <p className={styles.ticketRowTitle}>{ticket.title}</p>
        <p className={styles.ticketRowMeta}>
          <span>#{ticket.id.slice(-6).toUpperCase()}</span>
          <span className={styles.metaSep}>·</span>
          <span>{ticket.creator_name}</span>
          <span className={styles.metaSep}>·</span>
          <span className={styles.metaStatus}>{ticket.state_label}</span>
          <span className={styles.metaSep}>·</span>
          <span style={{ fontWeight: 700, color: ageColor(ticket.created_at) }}>{fmtAge(ticket.created_at)} en cola</span>
          {ticket.is_pause_state && ticket.last_transition_reason && (
            <>
              <span className={styles.metaSep}>·</span>
              <span className={styles.metaPause}>⏸ {ticket.last_transition_reason}</span>
            </>
          )}
        </p>
      </div>

      {/* Sede/Ambiente */}
      <p className={`${styles.colSede} ${styles.ticketRowEnv}`}>
        {ticket.environment_name ?? '—'}
      </p>

      {/* Priority badge — colors stay inline (dynamic per priority) */}
      <span
        className={`${styles.colPriority} ${styles.priorityBadge}`}
        style={{
          background: `color-mix(in srgb, ${pColor} 15%, transparent)`,
          color: pColor,
          border: `1px solid color-mix(in srgb, ${pColor} 25%, transparent)`,
        }}
      >
        {getPriorityConfig(ticket.priority).label}
      </span>

      {/* SLA time — color stays inline (dynamic SLA status) */}
      {h !== null ? (
        <span className={styles.slaCell} style={{ color: slaColor ?? '#94a3b8' }}>
          {fmtHours(h)}
        </span>
      ) : (
        <span className={styles.slaCell} style={{ color: '#94a3b8', fontFamily: 'inherit', fontWeight: 400 }}>—</span>
      )}

      {/* Actions */}
      <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
        {canTake && (
          <button
            type="button"
            disabled={isTaking}
            onClick={(e) => { e.stopPropagation(); onTake(ticket.id); }}
            className={styles.takeBtn}
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
            className={styles.viewBtn}
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
  group, tickets, canTake, takingId, onTake,
  techs, assigningId, onAssignTo, canAssignOthers, recentlyAssignedId,
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
    <div className={styles.groupWrap}>
      {/* Group header — background/border/color stay inline (dynamic per priority) */}
      <div
        className={styles.groupHead}
        style={{
          background: `color-mix(in srgb, ${pColor} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${pColor} 20%, transparent)`,
        }}
      >
        {group.priority === 'critica'
          ? <span className={styles.criticalDot} />
          : <span style={{ width: 9, height: 9, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
        }
        <span className={styles.groupLabel} style={{ color: pColor }}>{group.label}</span>
        <span className={styles.groupUrgency} style={{ color: pColor }}>— {group.urgency}</span>
        <span
          className={styles.groupCount}
          style={{
            color: pColor,
            background: `color-mix(in srgb, ${pColor} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${pColor} 25%, transparent)`,
          }}
        >
          {tickets.length}
        </span>
      </div>

      {/* Table header */}
      <div className={`${styles.tableGrid} ${styles.groupTableHead}`}>
        {(['Ticket', 'Sede/Ambiente', 'Prioridad', 'SLA', 'Acción'] as const).map((h, i) => (
          <span
            key={i}
            className={`${styles.groupHeaderCell}${i === 1 ? ` ${styles.colSede}` : i === 2 ? ` ${styles.colPriority}` : ''}`}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className={styles.groupRows}>
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

  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [search,             setSearch]             = useState('');
  const [filterCategory,     setFilterCategory]     = useState<string | null>(null);
  const [filterSla,          setFilterSla]          = useState<string | null>(null);
  const [takingId,           setTakingId]           = useState<string | null>(null);
  const [assigningId,        setAssigningId]        = useState<string | null>(null);
  const [recentlyAssignedId, setRecentlyAssignedId] = useState<string | null>(null);
  const [toast,              setToast]              = useState<string | null>(null);
  const toastRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assignedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagination state
  const [queuePage,    setQueuePage]    = useState(1);
  const [accumulated,  setAccumulated]  = useState<TicketListItem[]>([]);
  const [serverTotal,  setServerTotal]  = useState(0);
  const lastResRef = useRef<import('@/services/tickets.service').PaginatedTickets | null>(null);

  function showToast(msg: string) {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast(msg);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);

  const canTake         = usePermission('helpdesk:tickets:assign');
  const canAssignOthers = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';

  const { data: res, isLoading, isFetching } = useQuery({
    queryKey:  ['queue-unassigned', helpdeskId, queuePage],
    queryFn:   () => ticketsService.getAll({ module_id: helpdeskId!, unassigned: true, limit: QUEUE_LIMIT, page: queuePage }),
    enabled:   !!helpdeskId,
    staleTime: 30_000,
    refetchInterval: queuePage === 1 ? 60_000 : false,
  });

  // Reset accumulation when module changes
  useEffect(() => {
    setQueuePage(1);
    setAccumulated([]);
    setServerTotal(0);
    lastResRef.current = null;
  }, [helpdeskId]);

  // Accumulate tickets as pages load
  useEffect(() => {
    if (!res || res === lastResRef.current) return;
    lastResRef.current = res;
    setServerTotal(res.total);
    if (res.page === 1) {
      setAccumulated(res.data);
    } else {
      setAccumulated(prev => {
        const existing = new Set(prev.map(t => t.id));
        return [...prev, ...res.data.filter(t => !existing.has(t.id))];
      });
    }
  }, [res]);

  const loadMore = useCallback(() => {
    setQueuePage(p => p + 1);
  }, []);

  const hasMore = serverTotal > accumulated.length;

  const { data: techs = [] } = useQuery<ModuleTechnician[]>({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId && canAssignOthers,
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const allTickets = accumulated;

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
    if (filterCategory) list = list.filter(t => t.category_name === filterCategory);
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

  const breachedCount = allTickets.filter(t => t.sla_status === 'breached').length;
  const riskCount     = allTickets.filter(t => {
    const h = hoursLeft(t.sla_deadline_tracked ?? t.sla_deadline);
    return t.sla_status === 'active' && h !== null && h < 4;
  }).length;

  const statPills = [
    { label: 'Sin asignar', value: serverTotal || allTickets.length,                       color: '#ff5e3a' },
    { label: 'Críticos',    value: allTickets.filter(t => t.priority === 'critica').length, color: '#ef4444' },
    { label: 'SLA riesgo',  value: riskCount,                                               color: '#f97316' },
    ...(breachedCount > 0 ? [{ label: 'SLA vencido', value: breachedCount, color: '#dc2626' }] : []),
  ];

  const slaChips = [
    { key: 'breached', label: 'SLA Vencido', color: '#ef4444' },
    { key: 'risk',     label: 'SLA Riesgo',  color: '#f97316' },
    { key: 'ok',       label: 'SLA OK',      color: '#22c55e' },
  ];

  return (
    <ModuleLayout
      moduleId={helpdeskId}
      title="Mesa de Ayuda"
      description=""
      isSuperadmin={isSuperadmin}
      hideInfo
    >
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Mesa de Ayuda</p>
          <h1 className={styles.title}>Cola de trabajo</h1>
          <p className={styles.desc}>Tickets sin técnico asignado — ordenados por prioridad y SLA</p>
        </div>

        {/* Stats */}
        <div className={styles.statsBar}>
          {statPills.map(s => (
            <div
              key={s.label}
              className={styles.statPill}
              style={{ borderColor: s.label === 'SLA vencido' ? '#fecaca' : '#e2e8f0' }}
            >
              <p className={styles.statPillVal} style={{ color: s.color }}>{s.value}</p>
              <p className={styles.statPillLbl}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}><Search size={13} /></span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título, ID, categoría o solicitante…"
          className={styles.searchInput}
        />
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        {slaChips.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterSla(filterSla === f.key ? null : f.key)}
            className={styles.filterChip}
            style={filterSla === f.key ? {
              border: `1px solid ${f.color}`,
              background: `${f.color}18`,
              color: f.color,
            } : {
              border: `1px solid ${f.color}44`,
              color: '#94a3b8',
            }}
          >
            {f.label}
          </button>
        ))}

        {categories.length > 0 && <span className={styles.filterSep} />}

        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
            className={styles.filterChip}
            style={filterCategory === cat ? {
              border: '1px solid #0e2235',
              background: '#0e2235',
              color: '#fff',
            } : undefined}
          >
            {cat}
          </button>
        ))}

        {(filterCategory || filterSla) && (
          <button
            type="button"
            onClick={() => { setFilterCategory(null); setFilterSla(null); }}
            className={styles.filterChip}
          >
            ✕ Limpiar
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={styles.loading}>Cargando cola de trabajo…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', display: 'block', margin: '0 auto 12px' }} />
          <p className={styles.emptyTitle}>Cola vacía</p>
          <p className={styles.emptyDesc}>
            {allTickets.length === 0 ? 'Todos los tickets tienen técnico asignado.' : 'Sin resultados para la búsqueda.'}
          </p>
        </div>
      ) : (
        <>
          {grouped[0].tickets.length > 0 && (
            <div className={styles.alertRed}>
              <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span className={styles.alertRedText}>
                {grouped[0].tickets.length} ticket{grouped[0].tickets.length > 1 ? 's' : ''} crítico{grouped[0].tickets.length > 1 ? 's' : ''} sin asignar
              </span>
              {grouped[0].tickets.some(t => (Date.now() - new Date(t.created_at).getTime()) > 3_600_000) && (
                <span className={styles.alertRedSub}>— más de 1h esperando</span>
              )}
              {canAssignOthers && (
                <button type="button" onClick={() => setFilterCategory(null)} className={styles.alertRedBtn}>
                  Asignar ahora ↓
                </button>
              )}
            </div>
          )}

          {!canTake && !canAssignOthers && (
            <div className={styles.alertBlue}>
              <Inbox size={13} style={{ color: '#1d4ed8' }} />
              <span className={styles.alertBlueText}>Modo visualización — solo técnicos y administradores pueden tomar tickets.</span>
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

      {/* Load more */}
      {!isLoading && (hasMore || isFetching) && (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMoreBtn}
            disabled={isFetching}
            onClick={loadMore}
          >
            <RefreshCw size={12} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
            {isFetching ? 'Cargando…' : 'Cargar más'}
          </button>
          <span className={styles.loadMoreMeta}>
            {allTickets.length} de {serverTotal} tickets
          </span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={styles.toast}>
          <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
          {toast}
        </div>
      )}
    </ModuleLayout>
  );
}
