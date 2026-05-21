'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, ChevronRight, Clock, AlertTriangle, CheckCircle2,
  Ticket, Filter, RotateCcw, LayoutList, Calendar, BarChart2,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import type { ModuleNavItem } from '@/types/nav.types';
import {
  ticketsService,
  type TicketListItem, type TicketDetail, type TicketPriority,
  type CreateTicketDto,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
} from '@/services/tickets.service';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';

const PRIORITIES: TicketPriority[] = ['baja', 'media', 'alta', 'critica'];

const HELPDESK_NAV: ModuleNavItem[] = [
  { key: 'all-tickets', label: 'Todos los Tickets', Icon: LayoutList, href: '/tickets'    },
  { key: 'my-tickets',  label: 'Mis Tickets',       Icon: Ticket,     href: '/my-tickets' },
  { key: 'calendar',    label: 'Calendario',         Icon: Calendar,   href: '/calendar'   },
  { key: 'reports',     label: 'Reportes',           Icon: BarChart2,  href: '/reports'    },
];

/* ── Priority badge ─────────────────────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

/* ── State badge ────────────────────────────────────────────────────────── */

function StateBadge({ label, isFinal }: { label: string; isFinal: boolean }) {
  const color = isFinal ? '#22C55E' : '#6366F1';
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

/* ── SLA badge ──────────────────────────────────────────────────────────── */

function SlaBadge({ status, deadline }: { status: string | null; deadline: string | null }) {
  if (!status || !deadline) return null;
  const color = SLA_STATUS_COLORS[status as keyof typeof SLA_STATUS_COLORS] ?? '#94A3B8';
  const label = SLA_STATUS_LABELS[status as keyof typeof SLA_STATUS_LABELS] ?? status;
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 3,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      <Clock size={9} />
      {label}
    </span>
  );
}

/* ── Create ticket modal ─────────────────────────────────────────────────── */

interface CreateModalProps {
  moduleId: string;
  onClose:  () => void;
}

function CreateModal({ moduleId, onClose }: CreateModalProps) {
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
  });

  const { data: environments } = useQuery({
    queryKey: ['ticket-environments', moduleId],
    queryFn:  () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState<Partial<CreateTicketDto>>({
    module_id:  moduleId,
    priority:   'media',
    urgency:    'media',
    impact:     'medio',
  });
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: () => ticketsService.create(form as CreateTicketDto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el ticket.'),
  });

  function set(key: keyof CreateTicketDto, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim())        { setError('Título requerido.'); return; }
    if (!form.category_id)          { setError('Categoría requerida.'); return; }
    if (!form.environment_id)       { setError('Ambiente requerido.'); return; }
    setError('');
    createMut.mutate();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: '#fff',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ticket size={15} style={{ color: '#6366F1' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Nuevo ticket</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Completa la información del ticket</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input
              type="text" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)}
              placeholder="Describe el problema o solicitud…" maxLength={255} style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <textarea
              value={form.description ?? ''} onChange={(e) => set('description', e.target.value)}
              placeholder="Detalles adicionales…" rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={(e) => set('environment_id', e.target.value)} style={inputStyle}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Prioridad</label>
              <select value={form.priority ?? 'media'} onChange={(e) => set('priority', e.target.value)} style={inputStyle}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Urgencia</label>
              <select value={form.urgency ?? 'media'} onChange={(e) => set('urgency', e.target.value)} style={inputStyle}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Impacto</label>
              <select value={form.impact ?? 'medio'} onChange={(e) => set('impact', e.target.value)} style={inputStyle}>
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
              Cancelar
            </button>
            <button type="submit" disabled={createMut.isPending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />
              {createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Ticket detail modal ─────────────────────────────────────────────────── */

interface DetailModalProps {
  ticketId: string;
  onClose:  () => void;
}

function DetailModal({ ticketId, onClose }: DetailModalProps) {
  const qc = useQueryClient();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn:  () => ticketsService.getOne(ticketId),
    staleTime: 30_000,
  });

  const [transReason, setTransReason] = useState('');
  const [activeTransId, setActiveTransId] = useState<string | null>(null);

  const transMut = useMutation({
    mutationFn: ({ transId, reason }: { transId: string; reason?: string }) =>
      ticketsService.transition(ticketId, transId, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      setActiveTransId(null);
      setTransReason('');
    },
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, padding: '28px 28px 24px', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={16} />
        </button>

        {isLoading && <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando…</div>}

        {ticket && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 500 }}>{ticket.module_name}</span>
                <ChevronRight size={11} style={{ color: '#CBD5E1' }} />
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{ticket.category_name}</span>
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '0 0 10px' }}>{ticket.title}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <PriorityBadge priority={ticket.priority} />
                <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
                <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />
              </div>
            </div>

            {/* Description */}
            {ticket.description && (
              <div style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, fontSize: 13, color: '#334155', marginBottom: 16, lineHeight: 1.6 }}>
                {ticket.description}
              </div>
            )}

            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 12, marginBottom: 20 }}>
              {([
                ['Creado por',   ticket.creator_name],
                ['Asignado a',   ticket.assignee_name ?? '—'],
                ['Ambiente',     ticket.environment_name],
                ['Creado',       fmtDate(ticket.created_at)],
                ['Urgencia',     ticket.urgency],
                ['Impacto',      ticket.impact],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label}>
                  <span style={{ color: '#94A3B8', fontWeight: 500 }}>{label}: </span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Transitions */}
            {!ticket.is_final && ticket.transitions.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 8 }}>ACCIONES DISPONIBLES</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ticket.transitions.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => setActiveTransId(activeTransId === tr.id ? null : tr.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${activeTransId === tr.id ? '#6366F1' : '#E2E8F0'}`,
                        background: activeTransId === tr.id ? '#6366F115' : '#fff',
                        color: activeTransId === tr.id ? '#6366F1' : '#475569',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <ChevronRight size={11} />
                      {tr.to_label}
                    </button>
                  ))}
                </div>

                {activeTransId && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <textarea
                      value={transReason}
                      onChange={(e) => setTransReason(e.target.value)}
                      placeholder="Motivo del cambio (opcional)…"
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                        border: '1px solid #E2E8F0', outline: 'none', resize: 'vertical',
                        boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setActiveTransId(null); setTransReason(''); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => transMut.mutate({ transId: activeTransId, reason: transReason })}
                        disabled={transMut.isPending}
                        style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: transMut.isPending ? .7 : 1 }}
                      >
                        <CheckCircle2 size={12} />
                        {transMut.isPending ? 'Aplicando…' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {ticket.history.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 10 }}>HISTORIAL DE ESTADOS</p>
                <div style={{ borderRadius: 10, border: '1px solid #F1F5F9', overflow: 'hidden' }}>
                  {ticket.history.map((h, i) => (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderBottom: i < ticket.history.length - 1 ? '1px solid #F1F5F9' : undefined,
                      background: '#fff',
                    }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RotateCcw size={11} style={{ color: '#6366F1' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#0F172A', margin: 0 }}>
                          {h.from_label} → {h.to_label}
                        </p>
                        {h.transition_reason && (
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{h.transition_reason}</p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{h.actor_name}</p>
                        <p style={{ fontSize: 10, color: '#CBD5E1', margin: '1px 0 0' }}>{fmtRelative(h.transitioned_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Ticket row ─────────────────────────────────────────────────────────── */

function TicketRow({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const overdue = ticket.sla_status === 'breached';
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
        cursor: 'pointer', transition: 'background .15s',
        borderLeft: overdue ? '3px solid #EF444488' : '3px solid transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {overdue && <AlertTriangle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.title}
        </p>
        <p style={{ fontSize: 11, color: '#94A3B8', margin: '3px 0 0' }}>
          {ticket.category_name} · {ticket.environment_name} · {fmtRelative(ticket.created_at)}
          {ticket.assignee_name && ` · ${ticket.assignee_name}`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <PriorityBadge priority={ticket.priority} />
        <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
        <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function TicketsClient() {
  useModuleNav('Mesa de Ayuda', HELPDESK_NAV);

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const activeModules = useMemo(() => {
    const roles = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
    const seen  = new Set<string>();
    const unique: { module_id: string; module_name: string; role_name: string }[] = [];
    for (const r of roles) {
      if (!seen.has(r.module_id)) {
        seen.add(r.module_id);
        unique.push(r);
      }
    }
    return unique;
  }, [user]);

  const [selectedModule, setSelectedModule] = useState<string>(activeModules[0]?.module_id ?? '');
  const [stateFilter,    setStateFilter]    = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [mineOnly,       setMineOnly]       = useState(false);
  const [showCreate,     setShowCreate]     = useState(false);
  const [detailId,       setDetailId]       = useState<string | null>(null);
  const [showFilters,    setShowFilters]    = useState(false);
  const [page,           setPage]           = useState(1);

  const { data: workflow } = useQuery({
    queryKey: ['ticket-workflow', selectedModule],
    queryFn:  () => ticketsService.getWorkflow(selectedModule),
    enabled:  !!selectedModule,
    staleTime: 5 * 60_000,
  });

  const qk = ['tickets', selectedModule, stateFilter, priorityFilter, mineOnly, page];
  const { data, isLoading } = useQuery({
    queryKey: qk,
    queryFn:  () => ticketsService.getAll({
      module_id: selectedModule || undefined,
      state_id:  stateFilter   || undefined,
      priority:  priorityFilter || undefined,
      mine:      mineOnly,
      page,
      limit: 25,
    }),
    staleTime: 60_000,
  });

  const tickets    = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  const hasFilters = !!(stateFilter || priorityFilter || mineOnly);

  function clearFilters() {
    setStateFilter('');
    setPriorityFilter('');
    setMineOnly(false);
    setPage(1);
  }

  const canCreate = isSuperadmin || activeModules.length > 0;

  return (
    <ModuleLayout
      moduleId={selectedModule || undefined}
      title="Mesa de Ayuda"
      description="Sistema centralizado de soporte técnico. Gestiona incidencias, solicitudes y seguimiento SLA para todos los módulos asignados."
      isSuperadmin={isSuperadmin}
    >
      {/* ── Toolbar: filter + create ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: `1.5px solid ${showFilters ? '#6366F1' : '#E2E8F0'}`,
            background: showFilters ? '#6366F115' : '#fff',
            color: showFilters ? '#6366F1' : '#475569',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Filter size={13} />
          Filtros
          {hasFilters && (
            <span style={{ background: '#6366F1', color: '#fff', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>•</span>
          )}
        </button>

        {canCreate && selectedModule && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 15px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: 'none', background: '#6366F1', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={13} /> Nuevo ticket
          </button>
        )}
      </div>

      {/* ── Module tabs ── */}
      {activeModules.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {!isSuperadmin && (
            <button
              type="button"
              onClick={() => { setSelectedModule(''); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${!selectedModule ? '#6366F1' : '#E2E8F0'}`,
                background: !selectedModule ? '#6366F115' : '#fff',
                color: !selectedModule ? '#6366F1' : '#64748B',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Todos
            </button>
          )}
          {activeModules.map((m) => (
            <button
              key={m.module_id}
              type="button"
              onClick={() => { setSelectedModule(m.module_id); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${selectedModule === m.module_id ? '#6366F1' : '#E2E8F0'}`,
                background: selectedModule === m.module_id ? '#6366F115' : '#fff',
                color: selectedModule === m.module_id ? '#6366F1' : '#64748B',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {m.module_name}
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      {showFilters && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', padding: '14px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <select
            value={stateFilter}
            onChange={(e) => { setStateFilter(e.target.value); setPage(1); }}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value="">Estado: Todos</option>
            {(workflow?.states ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <option value="">Prioridad: Todas</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => { setMineOnly(e.target.checked); setPage(1); }} />
            Solo míos
          </label>

          {hasFilters && (
            <button type="button" onClick={clearFilters} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', border: 'none', background: 'none', fontSize: 12, color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}>
              <X size={11} /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── Ticket list ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EDF3', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ padding: '56px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Cargando tickets…
          </div>
        )}

        {!isLoading && tickets.length === 0 && (
          <div style={{ padding: '56px 0', textAlign: 'center' }}>
            <Ticket size={28} style={{ color: '#CBD5E1', marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {hasFilters ? 'Sin tickets con esos filtros.' : 'No hay tickets en este módulo.'}
            </p>
            {canCreate && selectedModule && !hasFilters && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{ marginTop: 14, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Plus size={13} /> Crear primer ticket
              </button>
            )}
          </div>
        )}

        {tickets.map((t, i) => (
          <div key={t.id} style={{ borderBottom: i < tickets.length - 1 ? '1px solid #F1F5F9' : undefined }}>
            <TicketRow ticket={t} onClick={() => setDetailId(t.id)} />
          </div>
        ))}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .4 : 1, fontFamily: 'inherit' }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .4 : 1, fontFamily: 'inherit' }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && selectedModule && (
        <CreateModal moduleId={selectedModule} onClose={() => setShowCreate(false)} />
      )}

      {detailId && (
        <DetailModal ticketId={detailId} onClose={() => setDetailId(null)} />
      )}
    </ModuleLayout>
  );
}
