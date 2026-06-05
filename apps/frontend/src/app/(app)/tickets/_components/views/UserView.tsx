'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Ticket, ChevronRight, CheckCircle2, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  ticketsService,
  type TicketListItem, type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS, SLA_STATUS_COLORS,
} from '@/services/tickets.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';
import { isToday, TicketCard } from './shared';
import { CreateDrawer } from './CreateDrawer';

type TabKey = 'activas' | 'por-accion' | 'cerradas';

const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

function hoursLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  return (new Date(deadline).getTime() - Date.now()) / 3_600_000;
}

function fmtHours(h: number): string {
  if (h < 0) return `Vencido ${Math.abs(h).toFixed(0)}h`;
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function portalStateBadge(t: TicketListItem): { label: string; bg: string; color: string } {
  if (t.is_final)          return { label: 'Cerrado',     bg: '#f1f5f9', color: '#64748b' };
  if (t.is_approval_state) return { label: 'Resuelto',    bg: '#f0fdf4', color: '#15803d' };
  if (t.is_pause_state)    return { label: 'En espera',   bg: '#fef3c7', color: '#92400e' };
  if (t.assignee_name)     return { label: 'En proceso',  bg: '#eff6ff', color: '#1d4ed8' };
  return                          { label: 'Abierto',      bg: '#fff7ed', color: '#c2410c' };
}

/* ── Active ticket card ── */
function ActiveCard({ ticket, basePath }: { ticket: TicketListItem; basePath: string }) {
  const router  = useRouter();
  const pColor  = TICKET_PRIORITY_COLORS[ticket.priority as TicketPriority] ?? C.muted;
  const badge   = portalStateBadge(ticket);
  const h       = hoursLeft(ticket.sla_deadline_tracked ?? ticket.sla_deadline ?? null);
  const slaColor = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status] ?? null) : null;
  const breached = ticket.sla_status === 'breached';

  return (
    <div
      onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
      style={{
        background: '#fff',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${pColor}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'background .1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.bg; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 5px', fontSize: 13, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.title}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.muted, display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
            <span>#{ticket.id.slice(-6).toUpperCase()}</span>
            <span>{ticket.category_name}</span>
            {ticket.assignee_name && <span style={{ color: C.sub }}>{ticket.assignee_name}</span>}
            <span>{fmtRelative(ticket.created_at)}</span>
            {h !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: breached ? '#ef4444' : slaColor ?? C.muted, fontWeight: breached ? 700 : 500 }}>
                <Clock size={10} /> {fmtHours(h)}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
            {badge.label}
          </span>
          <ChevronRight size={14} style={{ color: C.muted }} />
        </div>
      </div>
    </div>
  );
}

/* ── Approval card ── */
function ApprovalCard({
  ticket,
  basePath,
  onApprove,
  onReject,
  isApproving,
}: {
  ticket: TicketListItem;
  basePath: string;
  onApprove: (id: string) => void;
  onReject:  (id: string, reason: string) => void;
  isApproving: string | null;
}) {
  const router = useRouter();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason]         = useState('');
  const busy = isApproving === ticket.id;

  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid #fed7aa`,
      borderLeft: `3px solid ${C.coral}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.title}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
            #{ticket.id.slice(-6).toUpperCase()} · {ticket.category_name}
            {ticket.assignee_name && ` · ${ticket.assignee_name}`}
            {' · '}{fmtRelative(ticket.created_at)}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#f0fdf4', color: '#15803d', flexShrink: 0 }}>
          Resuelto
        </span>
      </div>

      {/* Notice */}
      <p style={{ margin: 0, fontSize: 11.5, color: '#c2410c', fontWeight: 600 }}>
        ¿El problema fue resuelto? Acepta para cerrar o rechaza para reabrirlo.
      </p>

      {/* Actions */}
      {!showReject ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(ticket.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, border: 'none', background: busy ? C.muted : '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit' }}
          >
            <CheckCircle2 size={12} /> {busy ? 'Procesando…' : 'Aceptar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowReject(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, border: `1px solid #fca5a5`, background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            No fue resuelto
          </button>
          <button
            type="button"
            onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Ver detalle <ChevronRight size={11} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Describe por qué no fue resuelto…"
            rows={2}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: `1px solid #fca5a5`, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' as const }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={!reason.trim() || busy}
              onClick={() => { onReject(ticket.id, reason.trim()); setShowReject(false); setReason(''); }}
              style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: !reason.trim() || busy ? C.muted : '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: !reason.trim() || busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              Enviar rechazo
            </button>
            <button
              type="button"
              onClick={() => { setShowReject(false); setReason(''); }}
              style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Closed ticket card ── */
function ClosedCard({ ticket, basePath }: { ticket: TicketListItem; basePath: string }) {
  const router = useRouter();
  return (
    <div
      onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
      style={{
        background: '#fff',
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        opacity: 0.85,
        transition: 'opacity .1s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.85'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.title}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: C.muted }}>
          #{ticket.id.slice(-6).toUpperCase()} · {ticket.category_name}
          {ticket.assignee_name && ` · ${ticket.assignee_name}`}
          {' · '}{fmtRelative(ticket.created_at)}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: '#f1f5f9', color: '#64748b' }}>
          Cerrado
        </span>
        <ChevronRight size={14} style={{ color: C.muted }} />
      </div>
    </div>
  );
}

/* ── Empty state ── */
function EmptyTab({ tab, canCreate, onCreate }: { tab: TabKey; canCreate: boolean; onCreate: () => void }) {
  const messages: Record<TabKey, string> = {
    'activas':    'No tienes solicitudes activas',
    'por-accion': 'Nada pendiente de tu parte',
    'cerradas':   'Aún no tienes solicitudes cerradas',
  };
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <CheckCircle2 size={28} style={{ color: '#e2e8f0', display: 'block', margin: '0 auto 12px' }} />
      <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>{messages[tab]}</p>
      {tab === 'activas' && canCreate && (
        <button type="button" onClick={onCreate}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={12} /> Crear solicitud
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */

export function UserView({
  moduleId,
  basePath,
  canCreate,
  visualVariant = 'default',
}: {
  moduleId: string;
  basePath: string;
  canCreate: boolean;
  visualVariant?: 'helpdeskMockup' | 'default';
}) {
  const router   = useRouter();
  const { user } = useAuthStore((s) => s);
  const qc       = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [activeTab,  setActiveTab]  = useState<TabKey>('activas');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  /* legacy default-variant state */
  const [showFilters,    setShowFilters]    = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');

  const limit = visualVariant === 'helpdeskMockup' ? 100 : 20;

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', moduleId, 'mine', page, limit],
    queryFn:  () => ticketsService.getAll({ module_id: moduleId, mine: true, page, limit }),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const tickets    = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  /* ── Approve / Reject mutations (helpdeskMockup only) ── */
  const approveMut = useMutation({
    mutationFn: (id: string) => ticketsService.approve(id, ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', moduleId, 'mine'] });
      setApprovingId(null);
    },
    onError: () => setApprovingId(null),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => ticketsService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets', moduleId, 'mine'] });
    },
  });

  function handleApprove(id: string) {
    setApprovingId(id);
    approveMut.mutate(id);
  }

  function handleReject(id: string, reason: string) {
    rejectMut.mutate({ id, reason });
  }

  /* ── Default variant filters ── */
  const filtered = useMemo(() => {
    let list = tickets;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
    }
    if (priorityFilter) list = list.filter((t) => t.priority === priorityFilter);
    return list;
  }, [tickets, search, priorityFilter]);

  const { ticketsOld, ticketsToday } = useMemo(() => {
    const old: typeof filtered = [];
    const today: typeof filtered = [];
    for (const t of filtered) {
      (isToday(t.created_at) ? today : old).push(t);
    }
    return { ticketsOld: old, ticketsToday: today };
  }, [filtered]);

  /* ── helpdeskMockup tab data (computed unconditionally) ── */
  const tabData = useMemo<Record<TabKey, TicketListItem[]>>(() => ({
    'activas':    tickets.filter(t => !t.is_final && !t.is_approval_state),
    'por-accion': tickets.filter(t => t.is_approval_state),
    'cerradas':   tickets.filter(t => t.is_final),
  }), [tickets]);

  const currentTabTickets = useMemo(() => {
    const list = tabData[activeTab];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(t => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
  }, [tabData, activeTab, search]);

  /* ══════════════════════════════════ helpdeskMockup ═════════════════════════ */

  if (visualVariant === 'helpdeskMockup') {
    const firstName = user?.first_name ?? 'Usuario';
    const currentTickets = currentTabTickets;

    const TABS: { key: TabKey; label: string }[] = [
      { key: 'activas',    label: 'Activas' },
      { key: 'por-accion', label: 'Por mi acción' },
      { key: 'cerradas',   label: 'Cerradas' },
    ];

    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Hero ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>
                Portal de Soporte
              </p>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>
                Bienvenido, {firstName}
              </h1>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                Gestiona tus solicitudes y encuentra soluciones en la base de conocimiento.
              </p>
            </div>
            {canCreate && moduleId && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, background: C.coral, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255,94,58,.35)', flexShrink: 0 }}
              >
                <Plus size={15} /> Reportar incidente
              </button>
            )}
          </div>

          {/* ── Pending action banner ── */}
          {tabData['por-accion'].length > 0 && (
            <div
              onClick={() => setActiveTab('por-accion')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, cursor: 'pointer' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.coral, flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#c2410c', flex: 1 }}>
                Tienes {tabData['por-accion'].length} solicitud{tabData['por-accion'].length > 1 ? 'es' : ''} resuelta{tabData['por-accion'].length > 1 ? 's' : ''} esperando tu confirmación.
              </p>
              <ChevronRight size={14} style={{ color: '#c2410c', flexShrink: 0 }} />
            </div>
          )}

          {/* ── Ticket section ── */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

            {/* Tabs + search bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', borderBottom: `1px solid ${C.border}`, gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {TABS.map(tab => {
                  const count  = tabData[tab.key].length;
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => { setActiveTab(tab.key); setSearch(''); }}
                      style={{
                        padding: '14px 4px',
                        marginRight: 20,
                        border: 'none',
                        background: 'none',
                        borderBottom: active ? `2px solid ${C.navy}` : '2px solid transparent',
                        fontSize: 13,
                        fontWeight: active ? 800 : 500,
                        color: active ? C.navy : C.muted,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'color .15s',
                      }}
                    >
                      {tab.label}
                      {count > 0 && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 10,
                          background: tab.key === 'por-accion' && count > 0 ? C.coral : active ? C.navy : C.border,
                          color: tab.key === 'por-accion' && count > 0 ? '#fff' : active ? '#fff' : C.sub,
                          lineHeight: '16px',
                        }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <div style={{ position: 'relative', minWidth: 200, paddingBlock: 10 }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar solicitudes…"
                  style={{ width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: C.bg, boxSizing: 'border-box' as const }}
                />
              </div>
            </div>

            {/* Card list */}
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
                  Cargando solicitudes…
                </div>
              ) : currentTickets.length === 0 ? (
                <EmptyTab tab={activeTab} canCreate={canCreate} onCreate={() => setShowCreate(true)} />
              ) : activeTab === 'por-accion' ? (
                currentTickets.map(t => (
                  <ApprovalCard
                    key={t.id}
                    ticket={t}
                    basePath={basePath}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isApproving={approvingId}
                  />
                ))
              ) : activeTab === 'cerradas' ? (
                currentTickets.map(t => (
                  <ClosedCard key={t.id} ticket={t} basePath={basePath} />
                ))
              ) : (
                currentTickets.map(t => (
                  <ActiveCard key={t.id} ticket={t} basePath={basePath} />
                ))
              )}
            </div>
          </div>

          {/* ── Knowledge base shortcut ── */}
          <div
            onClick={() => router.push(`${basePath}/knowledge`)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: `linear-gradient(135deg, #0e2235 0%, #1a3a55 100%)`, borderRadius: 14, padding: '20px 24px', cursor: 'pointer', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Search size={20} style={{ color: '#fff' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: '#fff' }}>Base de conocimiento</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Encuentra soluciones y guías antes de crear un ticket nuevo</p>
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              Explorar artículos <ChevronRight size={13} />
            </div>
          </div>

        </div>
        {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  /* ══════════════════════════════════ default ═════════════════════════ */

  return (
    <>
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto', background: '#f8fafc' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '28px', border: '1px solid #e8edf3', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0e2235' }}>Portal de Soporte</h2>
            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
              Reporta incidentes o solicita asistencia técnica. Podrás hacer seguimiento de tus reportes activos y aprobar su resolución.
            </p>
            {canCreate && moduleId && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#ff5e3a', border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(255,94,58,.3)' }}
              >
                <Plus size={14} />Crear Ticket Técnico
              </button>
            )}
          </div>

          <div>
            <p style={{ margin: '0 0 14px', fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>Mis Reportes Recientes</p>
            {isLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Cargando tickets…</div>
            ) : tickets.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e8edf3', padding: '48px 0', textAlign: 'center' }}>
                <Ticket size={28} style={{ color: '#e2e8f0' }} />
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10 }}>No has creado tickets aún</p>
                {canCreate && moduleId && (
                  <button type="button" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ff5e3a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setShowCreate(true)}>
                    <Plus size={12} />Crear primer ticket
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.cardGrid}>
                {tickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className={styles.pagination} style={{ marginTop: 16 }}>
                <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
                <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
                <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}
