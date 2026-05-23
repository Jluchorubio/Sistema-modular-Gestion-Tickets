'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Clock, Ticket, Search, ChevronDown, Star,
  BarChart2, ChevronRight, Users, Filter, ShieldCheck,
  Home, ArrowLeftRight, Layers, Settings,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';
import {
  ticketsService,
  type TicketListItem, type TicketPriority, type SlaStatus,
  type CreateTicketDto,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
} from '@/services/tickets.service';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import type { CurrentUser } from '@/types/user.types';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';
import styles from '../tickets.module.css';

const PRIORITIES: TicketPriority[] = ['baja', 'media', 'alta', 'critica'];
const PRIORITY_ORDER: Record<TicketPriority, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

type QuickFilter = 'waiting' | 'assigned' | 'unassigned' | 'approvals' | 'tasks' | 'collaborations';

const STAT_CARDS: { key: QuickFilter; label: string; accent: string; desc: string }[] = [
  { key: 'waiting',       label: 'Esperándome',    accent: '#ff5e3a', desc: 'Requieren tu acción' },
  { key: 'assigned',      label: 'Asignados a mí', accent: '#f59e0b', desc: 'En seguimiento'      },
  { key: 'approvals',     label: 'Aprobaciones',   accent: '#3b82f6', desc: 'Pendientes'           },
  { key: 'tasks',         label: 'Tareas',          accent: '#fbbf24', desc: 'Por completar'       },
  { key: 'unassigned',    label: 'Sin asignar',    accent: '#a855f7', desc: 'Sin responsable'     },
  { key: 'collaborations',label: 'Colaboraciones', accent: '#64748b', desc: 'Participando'        },
];

/* ─────────────────── Shared helpers ─────────────────────────────────────── */

function initials(name: string | null | undefined) {
  return (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
}

/* ─────────────────── Priority badge ─────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span
      className={styles.priorityBadge}
      style={{ background: `${color}22`, color, borderColor: `${color}44` }}
    >
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

/* ─────────────────── Stars ──────────────────────────────────────────────── */

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rounded ? '#f59e0b' : 'none'}
          color={n <= rounded ? '#f59e0b' : '#e2e8f0'}
        />
      ))}
      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, fontWeight: 700 }}>
        ({rating.toFixed(1)})
      </span>
    </span>
  );
}

/* ─────────────────── Availability constants ─────────────────────────────── */

const AVAIL_COLORS: Record<TechAvailStatus, string> = {
  disponible:    '#20c933',
  ocupado:       '#f59e0b',
  en_reunion:    '#3b82f6',
  fuera_horario: '#94a3b8',
  ausente:       '#ef4444',
  offline:       '#64748b',
};

const AVAIL_LABELS: Record<TechAvailStatus, string> = {
  disponible:    'Disponible',
  ocupado:       'Ocupado',
  en_reunion:    'En reunión',
  fuera_horario: 'Fuera de horario',
  ausente:       'Ausente',
  offline:       'Offline',
};

/* ─────────────────── Create ticket modal ────────────────────────────────── */

function CreateModal({ moduleId, onClose }: { moduleId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories }   = useQuery({ queryKey: ['ticket-categories', moduleId],   queryFn: () => ticketsService.getCategories(moduleId),   staleTime: 5 * 60_000 });
  const { data: environments } = useQuery({ queryKey: ['ticket-environments', moduleId], queryFn: () => ticketsService.getEnvironments(moduleId), staleTime: 5 * 60_000 });

  const [form, setForm] = useState<Partial<CreateTicketDto>>({ module_id: moduleId, priority: 'media', urgency: 'media', impact: 'medio' });
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: () => ticketsService.create(form as CreateTicketDto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['my-assigned-tickets'] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el ticket.'),
  });

  function set(key: keyof CreateTicketDto, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim())  { setError('Título requerido.'); return; }
    if (!form.category_id)    { setError('Categoría requerida.'); return; }
    if (!form.environment_id) { setError('Ambiente requerido.'); return; }
    setError('');
    createMut.mutate();
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,94,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ticket size={15} style={{ color: '#ff5e3a' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Nuevo ticket</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Completa la información del ticket</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Título *</label>
            <input type="text" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Describe el problema o solicitud…" maxLength={255} style={inp} />
          </div>
          <div>
            <label style={lbl}>Descripción</label>
            <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalles adicionales…" rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)} style={inp}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={(e) => set('environment_id', e.target.value)} style={inp}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Prioridad</label>
              <select value={form.priority ?? 'media'} onChange={(e) => set('priority', e.target.value)} style={inp}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Urgencia</label>
              <select value={form.urgency ?? 'media'} onChange={(e) => set('urgency', e.target.value)} style={inp}>
                <option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Impacto</label>
              <select value={form.impact ?? 'medio'} onChange={(e) => set('impact', e.target.value)} style={inp}>
                <option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option>
              </select>
            </div>
          </div>
          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>Cancelar</button>
            <button type="submit" disabled={createMut.isPending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />{createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────── Ticket card (admin/user grid) ──────────────────────── */

function TicketCard({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const overdue  = ticket.sla_status === 'breached';
  const slaColor = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status] ?? '#94A3B8') : null;
  const slaLabel = ticket.sla_status ? (SLA_STATUS_LABELS[ticket.sla_status] ?? null) : null;

  return (
    <div className={`${styles.ticketCard}${overdue ? ` ${styles.ticketCardOverdue}` : ''}`} onClick={onClick}>
      <div className={styles.cardHeader}>
        <div className={styles.assigneeBadge}>
          <div className={styles.assigneeAvatar}>{initials(ticket.assignee_name)}</div>
          <span className={styles.assigneeLabel}>{ticket.assignee_name ?? 'Sin asignar'}</span>
          <ChevronDown size={10} style={{ flexShrink: 0 }} />
        </div>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <h3 className={styles.cardTitle}>{ticket.title}</h3>
      <div className={styles.cardBreadcrumb}>
        <Ticket size={10} /><span>{ticket.category_name}</span>
        {ticket.environment_name && (<><span className={styles.breadcrumbSep}>›</span><span>{ticket.environment_name}</span></>)}
      </div>
      <div className={styles.cardFooter}>
        <div className={styles.cardOwner}>
          <div className={styles.ownerAvatar}>{initials(ticket.creator_name)}</div>
          <div className={styles.ownerInfo}>
            <span className={styles.ownerName}>{ticket.creator_name}</span>
            <span className={styles.ownerMeta}>{fmtRelative(ticket.created_at)}</span>
          </div>
        </div>
        <div className={styles.cardStats}>
          {slaLabel && slaColor && (
            <span className={styles.slaStat} style={{ color: slaColor }}>
              <Clock size={9} />{slaLabel}
            </span>
          )}
          <span className={styles.ticketIdBadgeSm}>#{ticket.id.slice(-6).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Tech queue row ─────────────────────────────────────── */

interface AssignedTicket {
  id: string; title: string; priority: string;
  created_at: string; updated_at: string;
  module_id: string; module_name: string; module_slug: string | null;
  category_name: string | null; environment_name: string | null;
  current_state_id: string; state_label: string; state_name: string; is_final: boolean;
  created_by: string; creator_name: string;
  sla_status: string | null; sla_deadline_tracked: string | null;
  assignment_role: string;
}

function TechQueueItem({ ticket, basePath }: { ticket: AssignedTicket; basePath: string }) {
  const router   = useRouter();
  const color    = TICKET_PRIORITY_COLORS[ticket.priority as TicketPriority] ?? '#94a3b8';
  const slaColor = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status as keyof typeof SLA_STATUS_COLORS] ?? '#94a3b8') : null;
  const slaLabel = ticket.sla_status ? (SLA_STATUS_LABELS[ticket.sla_status as keyof typeof SLA_STATUS_LABELS] ?? null) : null;

  return (
    <div
      onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'box-shadow .15s, transform .12s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
    >
      <div style={{ width: 4, borderRadius: 4, alignSelf: 'stretch', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.title}
          </p>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#0e2235', color: '#fff', flexShrink: 0 }}>
            #{ticket.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${color}22`, color, border: `1px solid ${color}44` }}>
            {TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority]}
          </span>
          {ticket.category_name && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{ticket.category_name}</span>
          )}
          {slaLabel && slaColor && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 700, color: slaColor }}>
              <Clock size={9} />{slaLabel}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 'auto' }}>
            por {ticket.creator_name}
          </span>
        </div>
      </div>
      <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
    </div>
  );
}

/* ─────────────────── Tech card (admin right panel) ─────────────────────── */

function TechCard({
  tech, isSelected, onVerProcesos,
}: {
  tech: ModuleTechnician;
  isSelected: boolean;
  onVerProcesos: () => void;
}) {
  const rating = parseFloat(String(tech.avg_rating ?? 0));

  return (
    <div style={{
      border: `2px solid ${isSelected ? '#0e2235' : '#e2e8f0'}`,
      borderRadius: 12,
      padding: '12px',
      background: isSelected ? 'rgba(14,34,53,0.04)' : '#fff',
      marginBottom: 10,
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: isSelected ? '0 2px 12px rgba(14,34,53,.1)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar + status dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {tech.avatar_url ? (
              <img src={tech.avatar_url} alt={tech.first_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e2e8f0' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(`${tech.first_name} ${tech.last_name}`)}
              </div>
            )}
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, background: AVAIL_COLORS[(tech.avail_status ?? 'disponible') as TechAvailStatus] ?? '#94a3b8', border: '2px solid #fff', borderRadius: '50%' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {tech.first_name} {tech.last_name}
            </p>
            {tech.username && (
              <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>@{tech.username}</span>
            )}
          </div>
        </div>

        {/* VER PROCESOS button */}
        <button
          type="button"
          onClick={onVerProcesos}
          style={{
            fontSize: 8.5, fontWeight: 800,
            border: `1.5px solid ${isSelected ? 'transparent' : '#0e2235'}`,
            padding: '5px 8px', borderRadius: 7,
            background: isSelected ? '#0e2235' : '#fff',
            color: isSelected ? '#fff' : '#0e2235',
            cursor: 'pointer', fontFamily: 'inherit',
            lineHeight: 1.4, textAlign: 'center' as const,
            letterSpacing: '.03em', flexShrink: 0,
          }}
        >
          VER<br />PROCESOS
        </button>
      </div>

      {/* Status + stars */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #f1f5f9', marginTop: 10, paddingTop: 8 }}>
        {(() => {
          const s = (tech.avail_status ?? 'disponible') as TechAvailStatus;
          const c = AVAIL_COLORS[s] ?? '#94a3b8';
          return (
            <span style={{ fontSize: 10, color: c, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {AVAIL_LABELS[s] ?? s}
            </span>
          );
        })()}
        <Stars rating={rating} size={10} />
      </div>
    </div>
  );
}

/* ─────────────────── Availability widget (TechView) ─────────────────────── */

const AVAIL_STATUS_OPTIONS: { value: TechAvailStatus; label: string }[] = [
  { value: 'disponible',    label: 'Disponible'       },
  { value: 'ocupado',       label: 'Ocupado'          },
  { value: 'en_reunion',    label: 'En reunión'       },
  { value: 'fuera_horario', label: 'Fuera de horario' },
  { value: 'ausente',       label: 'Ausente'          },
  { value: 'offline',       label: 'Offline'          },
];

function AvailabilityWidget({ userId, moduleId }: { userId: string; moduleId: string }) {
  const qc = useQueryClient();

  const { data: availList } = useQuery({
    queryKey: ['my-availability', userId],
    queryFn:  () => usersService.getMyAvailability(),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const current = availList?.find((a) => a.module_id === moduleId);
  const currentStatus = (current?.status ?? 'disponible') as TechAvailStatus;

  const [status, setStatus]         = useState<TechAvailStatus>('disponible');
  const [unavailTo, setUnavailTo]   = useState('');
  const [notes, setNotes]           = useState('');
  const [open, setOpen]             = useState(false);

  useEffect(() => {
    if (!open) setStatus(currentStatus);
  }, [currentStatus, open]);

  const mut = useMutation({
    mutationFn: () => usersService.setMyAvailability({
      module_id:      moduleId,
      status,
      unavailable_to: unavailTo || undefined,
      notes:          notes     || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-availability', userId] });
      qc.invalidateQueries({ queryKey: ['module-technicians', moduleId] });
      setOpen(false);
    },
  });

  const color = AVAIL_COLORS[currentStatus];

  return (
    <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e8edf3' }}>
      <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Mi disponibilidad</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {AVAIL_LABELS[currentStatus]}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 9.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: open ? '#0e2235' : '#f8fafc', color: open ? '#fff' : '#475569', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {open ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TechAvailStatus)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0f172a' }}
          >
            {AVAIL_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {['fuera_horario', 'ausente', 'offline'].includes(status) && (
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 9.5, fontWeight: 700, color: '#94a3b8' }}>Disponible de nuevo el</p>
              <input
                type="datetime-local"
                value={unavailTo}
                onChange={(e) => setUnavailTo(e.target.value)}
                style={{ width: '100%', padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota opcional…"
            rows={2}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
          />

          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            style={{ padding: '7px 0', borderRadius: 8, background: '#ff5e3a', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: mut.isPending ? .7 : 1 }}
          >
            {mut.isPending ? 'Guardando…' : 'Guardar estado'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Admin view ─────────────────────────────────────────── */

interface AdminViewProps {
  moduleId:  string;
  basePath:  string;
  canCreate: boolean;
  visualVariant?: 'helpdeskMockup' | 'default';
}

function AdminView({ moduleId, basePath, canCreate, visualVariant = 'default' }: AdminViewProps) {
  const user         = useAuthStore((s) => s.user);
  const router       = useRouter();
  const [stateFilter,     setStateFilter]    = useState('');
  const [priorityFilter,  setPriorityFilter] = useState<TicketPriority | ''>('');
  const [categoryFilter,  setCategoryFilter] = useState('');
  const [assigneeFilter,  setAssigneeFilter] = useState('');
  const [slaFilter,       setSlaFilter]      = useState<SlaStatus | ''>('');
  const [reprocesoFilter, setReprocesoFilter] = useState(false);
  const [showCreate,      setShowCreate]     = useState(false);
  const [page,            setPage]           = useState(1);
  const [search,          setSearch]         = useState('');
  const [sortBy,          setSortBy]         = useState('auto');
  const [quickFilter,     setQuickFilter]    = useState<QuickFilter | null>(null);
  const [techSearch,      setTechSearch]     = useState('');
  const [showFilters,     setShowFilters]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', moduleId, stateFilter, priorityFilter, categoryFilter, assigneeFilter, slaFilter, reprocesoFilter, page],
    queryFn:  () => ticketsService.getAll({
      module_id:   moduleId || undefined,
      state_id:    stateFilter    || undefined,
      priority:    priorityFilter || undefined,
      category_id: categoryFilter || undefined,
      assignee_id: assigneeFilter || undefined,
      sla_status:  slaFilter      || undefined,
      is_reproceso: reprocesoFilter || undefined,
      page,
      limit: 24,
    }),
    staleTime: 60_000,
  });

  const { data: workflow } = useQuery({
    queryKey: ['ticket-workflow', moduleId],
    queryFn:  () => ticketsService.getWorkflow(moduleId),
    staleTime: 5 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: techs } = useQuery({
    queryKey: ['module-technicians', moduleId],
    queryFn:  () => modulesService.getModuleTechnicians(moduleId),
    staleTime: 2 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: myAssignedTickets = [] } = useQuery({
    queryKey: ['my-assigned-tickets', moduleId],
    queryFn:  () => usersService.getMyAssignedTickets(moduleId, 200),
    staleTime: 60_000,
    enabled:  !!user?.id,
  });

  const allTickets = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);

  const { ticketsOld, ticketsToday } = useMemo(() => {
    let list = allTickets;
    const userName  = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim().toLowerCase();
    const taskIds   = new Set(myAssignedTickets.filter((t) => t.assignment_role === 'owner'      && t.state_name === 'reproceso').map((t) => t.id));
    const collabIds = new Set(myAssignedTickets.filter((t) => t.assignment_role === 'collaborator').map((t) => t.id));
    if (quickFilter === 'waiting')        list = list.filter((t) => (t.assignee_name ?? '').toLowerCase().includes(userName) && !t.is_final && t.state_name !== 'realizado');
    if (quickFilter === 'assigned')       list = list.filter((t) => t.assignee_name !== null);
    if (quickFilter === 'unassigned')     list = list.filter((t) => t.assignee_name === null);
    if (quickFilter === 'approvals')      list = list.filter((t) => t.state_name === 'realizado' && t.created_by === user?.id);
    if (quickFilter === 'tasks')          list = list.filter((t) => taskIds.has(t.id));
    if (quickFilter === 'collaborations') list = list.filter((t) => collabIds.has(t.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
    }

    if (sortBy === 'priority') {
      list = [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      return { ticketsOld: list, ticketsToday: [] };
    }
    if (sortBy === 'newest') {
      return { ticketsOld: list, ticketsToday: [] };
    }

    // auto: split by today vs previous, sort each group by priority
    const byPriority = (a: TicketListItem, b: TicketListItem) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    const old:   TicketListItem[] = [];
    const today: TicketListItem[] = [];
    for (const t of list) {
      (isToday(t.created_at) ? today : old).push(t);
    }
    old.sort(byPriority);
    today.sort(byPriority);
    return { ticketsOld: old, ticketsToday: today };
  }, [allTickets, myAssignedTickets, quickFilter, search, sortBy, user?.id, user?.first_name, user?.last_name]);

  const statCounts = useMemo(() => {
    // waiting: assigned to me (owner), active, not waiting requester validation
    const waiting = myAssignedTickets.filter(
      (t) => t.assignment_role === 'owner' && !t.is_final && t.state_name !== 'realizado',
    ).length;
    // assigned: all my owner assignments
    const assigned = myAssignedTickets.filter((t) => t.assignment_role === 'owner').length;
    // approvals: tickets in "realizado" created by me, pending my validation
    const approvals = allTickets.filter(
      (t) => t.state_name === 'realizado' && t.created_by === user?.id,
    ).length;
    // tasks: my owner tickets currently in "reproceso" (need rework)
    const tasks = myAssignedTickets.filter(
      (t) => t.assignment_role === 'owner' && t.state_name === 'reproceso',
    ).length;
    // unassigned: no owner assigned, not final
    const unassigned = allTickets.filter((t) => t.assignee_name === null && !t.is_final).length;
    // collaborations: tickets where I'm a collaborator
    const collaborations = myAssignedTickets.filter((t) => t.assignment_role === 'collaborator').length;
    return [waiting, assigned, approvals, tasks, unassigned, collaborations];
  }, [allTickets, myAssignedTickets, user?.id]);

  const filteredTechs = useMemo(() => {
    const list = techs ?? [];
    if (!techSearch.trim()) return list;
    const q = techSearch.toLowerCase();
    return list.filter((t) => `${t.first_name} ${t.last_name}`.toLowerCase().includes(q));
  }, [techs, techSearch]);

  function toggleQuickFilter(key: QuickFilter) { setQuickFilter((p) => p === key ? null : key); }
  const isHelpdeskMockup = visualVariant === 'helpdeskMockup';

  const iconBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 9, border: '1.5px solid #e2e8f0',
    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#64748b', transition: 'background .15s, color .15s, border-color .15s',
    flexShrink: 0,
  };

  return (
    <>
      {/* ── Stats row ── */}
      {!isHelpdeskMockup && <div className={styles.statsRow}>
        {STAT_CARDS.map((card, i) => {
          const isActive = quickFilter === card.key;
          return (
            <div
              key={i}
              className={`${styles.statCard}${isActive ? ` ${styles.statCardActive}` : ''}`}
              style={{ '--accent': card.accent } as React.CSSProperties}
              onClick={() => toggleQuickFilter(card.key)}
            >
              <p className={styles.statCount}>{statCounts[i]}</p>
              <p className={styles.statLabel}>{card.label}</p>
              <p className={styles.statDesc}>{card.desc}</p>
            </div>
          );
        })}
      </div>}

      {/* ── Main area: inner sidebar + ticket list + tech panel ── */}
      <div
        className={isHelpdeskMockup ? styles.helpdeskAdminShell : undefined}
        style={!isHelpdeskMockup ? { display: 'flex', flex: 1, gap: 0, overflow: 'hidden' } : undefined}
      >

        {/* Inner left sidebar (64px) */}
        {!isHelpdeskMockup && <div style={{ width: 64, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #eef2f6', borderLeft: '1px solid #eef2f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 14 }}>
          <button type="button" title="Módulo Principal" style={iconBtn} onClick={() => router.push(basePath)}>
            <Home size={15} />
          </button>
          <button type="button" title="Historial de tickets" style={iconBtn} onClick={() => router.push(`${basePath}`)}>
            <ArrowLeftRight size={15} />
          </button>
          <button type="button" title="Estructura de equipos" style={iconBtn}>
            <Layers size={15} />
          </button>
          <button type="button" title="Configuración del módulo" style={iconBtn}>
            <Settings size={15} />
          </button>
          {canCreate && moduleId && (
            <button
              type="button"
              title="Crear nuevo ticket"
              style={{ ...iconBtn, background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
              onClick={() => setShowCreate(true)}
            >
              <Plus size={15} />
            </button>
          )}
        </div>}

        {/* Central: ticket list (flex-1) */}
        <div
          className={isHelpdeskMockup ? styles.helpdeskAdminMain : undefined}
          style={!isHelpdeskMockup ? { flex: 1, minWidth: 0, padding: '20px 24px 0', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 12 } : undefined}
        >
          {isHelpdeskMockup && (
            <div className={styles.helpdeskStatsGrid}>
              {STAT_CARDS.map((card, i) => {
                const isActive = quickFilter === card.key;
                return (
                  <div
                    key={card.key}
                    className={`${styles.statCard}${isActive ? ` ${styles.statCardActive}` : ''}`}
                    style={{ '--accent': card.accent } as React.CSSProperties}
                    onClick={() => toggleQuickFilter(card.key)}
                  >
                    <p className={styles.statCount}>{statCounts[i]}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                    <p className={styles.statDesc}>{card.desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search + filter toggle */}
          {(() => {
            const activeFilterCount = [priorityFilter, stateFilter, categoryFilter, assigneeFilter, slaFilter, reprocesoFilter].filter(Boolean).length;
            const selStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 11, color: '#475569', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ background: '#fff', borderRadius: 14, padding: '10px 16px', border: '1px solid #e8edf3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar tickets…"
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#0f172a', fontFamily: 'inherit', background: 'transparent' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isHelpdeskMockup && canCreate && moduleId && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 1px 4px rgba(255,94,58,.25)' }}
                      >
                        <Plus size={12} />Reportar Nuevo Incidente
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFilters((v) => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${showFilters || activeFilterCount > 0 ? '#ff5e3a' : '#e2e8f0'}`, background: showFilters ? '#fff5f3' : '#fff', color: showFilters || activeFilterCount > 0 ? '#ff5e3a' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <Filter size={11} />
                      Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selStyle}>
                      <option value="auto">Automático (SLA)</option>
                      <option value="newest">Más recientes</option>
                      <option value="priority">Por prioridad</option>
                    </select>
                  </div>
                </div>

                {showFilters && (
                  <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1.5px solid #ffe8e3', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }} style={selStyle}>
                      <option value="">Prioridad</option>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
                    </select>

                    <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Estado</option>
                      {(workflow?.states ?? []).filter((s) => !s.is_final).map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>

                    <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Categoría</option>
                      {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <select value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Técnico asignado</option>
                      {(techs ?? []).map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                    </select>

                    <select value={slaFilter} onChange={(e) => { setSlaFilter(e.target.value as SlaStatus | ''); setPage(1); }} style={selStyle}>
                      <option value="">SLA</option>
                      {(['active', 'paused', 'met', 'breached'] as SlaStatus[]).map((s) => (
                        <option key={s} value={s}>{SLA_STATUS_LABELS[s]}</option>
                      ))}
                    </select>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: reprocesoFilter ? '#ef4444' : '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={reprocesoFilter} onChange={(e) => { setReprocesoFilter(e.target.checked); setPage(1); }} style={{ accentColor: '#ef4444' }} />
                      Reproceso
                    </label>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { setPriorityFilter(''); setStateFilter(''); setCategoryFilter(''); setAssigneeFilter(''); setSlaFilter(''); setReprocesoFilter(false); setPage(1); }}
                        style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>Bandeja de Casos Activos</span>
            <span style={{ fontSize: 10, color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', padding: '3px 10px', borderRadius: 8, fontWeight: 700 }}>Consola Global · {total}</span>
          </div>

          {/* Cards */}
          {isLoading ? (
            <div className={styles.loadingState}>Cargando tickets…</div>
          ) : ticketsOld.length === 0 && ticketsToday.length === 0 ? (
            <div className={styles.emptyState}>
              <Ticket size={28} className={styles.emptyIcon} />
              <p className={styles.emptyText}>{search || quickFilter || priorityFilter || stateFilter || categoryFilter || assigneeFilter || slaFilter || reprocesoFilter ? 'Sin tickets con esos filtros.' : 'No hay tickets activos en este módulo.'}</p>
              {canCreate && moduleId && !search && !quickFilter && (
                <button type="button" className={styles.newTicketBtn} onClick={() => setShowCreate(true)}>
                  <Plus size={13} />Crear primer ticket
                </button>
              )}
            </div>
          ) : sortBy !== 'auto' ? (
            <div className={styles.cardGrid}>
              {ticketsOld.map((t) => (
                <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
              ))}
            </div>
          ) : (
            <>
              {ticketsOld.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#ff5e3a', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      Anteriores — Vencidos / Alta Prioridad
                    </span>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>{ticketsOld.length} ticket{ticketsOld.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className={styles.cardGrid}>
                    {ticketsOld.map((t) => (
                      <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    Hoy — Actuales
                  </span>
                  <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>{ticketsToday.length} ticket{ticketsToday.length !== 1 ? 's' : ''}</span>
                </div>
                {ticketsToday.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Sin tickets nuevos hoy</p>
                ) : (
                  <div className={styles.cardGrid}>
                    {ticketsToday.map((t) => (
                      <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
              <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
              <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
            </div>
          )}

          {/* Footer note */}
          <div style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', color: '#cbd5e1', borderTop: '1px solid #f1f5f9', padding: '14px 0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textTransform: 'uppercase' }}>
            <ShieldCheck size={12} />
            Todos los tickets de este módulo (solo accesible para admin, superadmin y jefe técnico)
          </div>
        </div>

        {/* Right: tech panel (300px) */}
        <div
          className={isHelpdeskMockup ? styles.helpdeskTechPanel : undefined}
          style={!isHelpdeskMockup ? { width: 300, flexShrink: 0, background: '#f8fafc', borderLeft: '1px solid #eef2f6', padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 } : undefined}
        >

          {/* Search techs */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="text"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              placeholder="Buscar técnico…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#0f172a' }}
            />
          </div>

          {/* Filter row */}
          <div style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0', padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#334155', letterSpacing: '.05em' }}>
              <Filter size={11} /> Filtros
            </span>
            <span style={{ fontSize: 9.5, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 5, fontWeight: 800 }}>
              Mesa de Ayuda
            </span>
          </div>

          {/* Techs header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '.05em' }}>
              <Users size={12} /> Técnicos
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, background: '#20c933', color: '#fff', padding: '2px 9px', borderRadius: 99 }}>
              {filteredTechs.filter((t) => t.is_available).length}/{filteredTechs.length} disp.
            </span>
          </div>

          {/* Tech cards */}
          {filteredTechs.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>Sin técnicos asignados</p>
          ) : filteredTechs.map((tech) => (
            <TechCard
              key={tech.id}
              tech={tech}
              isSelected={false}
              onVerProcesos={() => router.push(`${basePath}/tech/${tech.id}`)}
            />
          ))}
        </div>
      </div>

      {showCreate && moduleId && <CreateModal moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}

/* ─────────────────── Tech view (logged-in tech's own queue) ─────────────── */

interface TechViewProps {
  user:       CurrentUser;
  moduleId:   string;
  basePath:   string;
  moduleRole: string;
  canCreate:  boolean;
}

function TechView({ user, moduleId, basePath, moduleRole, canCreate }: TechViewProps) {
  const [showDrawer,   setShowDrawer]   = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);

  const { data: assigned, isLoading } = useQuery({
    queryKey: ['my-assigned-tickets', moduleId],
    queryFn:  () => usersService.getMyAssignedTickets(moduleId, 100),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const { data: techStats } = useQuery({
    queryKey: ['my-tech-stats', moduleId],
    queryFn:  () => usersService.getMyTechStats(moduleId),
    staleTime: 5 * 60_000,
  });

  const { data: availList } = useQuery({
    queryKey: ['my-availability', user.id],
    queryFn:  () => usersService.getMyAvailability(),
    staleTime: 60_000,
  });
  const myAvailStatus = ((availList?.find((a) => a.module_id === moduleId)?.status) ?? 'disponible') as TechAvailStatus;

  const { previous, today } = useMemo(() => {
    const all = assigned ?? [];
    const prev: AssignedTicket[] = [];
    const tod:  AssignedTicket[] = [];
    for (const t of all) {
      (isToday(t.created_at) ? tod : prev).push(t as AssignedTicket);
    }
    const byPriority = (a: AssignedTicket, b: AssignedTicket) =>
      PRIORITY_ORDER[a.priority as TicketPriority] - PRIORITY_ORDER[b.priority as TicketPriority];
    prev.sort(byPriority);
    tod.sort(byPriority);
    return { previous: prev, today: tod };
  }, [assigned]);

  const roleLabel  = MODULE_ROLE_LABELS[moduleRole as keyof typeof MODULE_ROLE_LABELS] ?? moduleRole;
  const fullName   = `${user.first_name} ${user.last_name}`;
  const avgRating  = parseFloat(String(techStats?.avg_rating ?? 0));
  const ratedCount = techStats?.rated_tickets ?? 0;

  const infoStyle: React.CSSProperties = { background: '#fff', padding: '14px', borderRadius: 14, border: '1px solid #e8edf3', fontSize: 11, color: '#475569', lineHeight: 1.6 };
  const groupHeader = (label: string, count: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={11} />{label}
      </span>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{count} ticket{count !== 1 ? 's' : ''}</span>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: profile panel */}
        <div style={{ width: 260, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #eef2f6', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>

          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 12px' }}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={fullName} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }}>
                  {initials(fullName)}
                </div>
              )}
              <span style={{ position: 'absolute', bottom: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: AVAIL_COLORS[myAvailStatus], border: '2px solid #f8fafc' }} title={AVAIL_LABELS[myAvailStatus]} />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: '#0e2235' }}>{fullName}</p>
            {user.username && <p style={{ margin: '0 0 10px', fontSize: 11, color: '#94a3b8' }}>@{user.username}</p>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Stars rating={avgRating} size={14} />
            </div>
          </div>

          <div style={infoStyle}>
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Rol en módulo</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#0e2235', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0, display: 'inline-block' }} />
              {roleLabel}
            </p>
            {user.job_title && (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Especialidad</p>
                <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 5 }}>
                  {user.job_title.toUpperCase()}
                </span>
              </>
            )}
          </div>

          <div style={{ ...infoStyle, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: '#0e2235' }}>{previous.length + today.length}</p>
              <p style={{ margin: 0, fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>Pendientes</p>
            </div>
            <div style={{ width: 1, background: '#e8edf3' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: '#0e2235' }}>{ratedCount}</p>
              <p style={{ margin: 0, fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>Calificados</p>
            </div>
          </div>

          <AvailabilityWidget userId={user.id} moduleId={moduleId} />
        </div>

        {/* Center: queue */}
        <div style={{ flex: 1, minWidth: 0, background: '#fff', padding: '28px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, borderBottom: '2px solid #f1f5f9', paddingBottom: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0e2235', borderBottom: '2px solid #ff5e3a', paddingBottom: 14, marginBottom: -14 }}>
              TICKETS
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Organización Automática Activa</span>
            {canCreate && moduleId && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#ff5e3a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <Plus size={11} />Nuevo
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando cola de trabajo…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {previous.length > 0 && (
                <div>
                  {groupHeader('Tickets del Día Anterior · Prioritarios', previous.length, '#ff5e3a')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {previous.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                </div>
              )}
              <div>
                {groupHeader('Tickets del Día Actual', today.length, '#0e2235')}
                {today.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No hay tickets asignados para hoy</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {today.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                )}
              </div>
              {previous.length === 0 && today.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <Ticket size={36} style={{ color: '#e2e8f0' }} />
                  <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>No hay tickets asignados a ti en este módulo</p>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowDrawer(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#0e2235', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <BarChart2 size={13} style={{ color: '#ff5e3a' }} />
              Ver Rendimiento y Estadísticas
            </button>
          </div>
        </div>
      </div>

      {/* Performance drawer */}
      {showDrawer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.5)', zIndex: 40, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowDrawer(false)}>
          <div style={{ width: 360, background: '#fff', padding: '32px 28px', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,.12)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0e2235' }}>Rendimiento</h2>
              <button type="button" onClick={() => setShowDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Rating promedio', value: avgRating.toFixed(1), accent: '#f59e0b' },
                { label: 'Tickets calificados', value: String(ratedCount), accent: '#3b82f6' },
                { label: 'Pendientes hoy', value: String(today.length), accent: '#ff5e3a' },
                { label: 'Del día anterior', value: String(previous.length), accent: '#a855f7' },
              ].map((s) => (
                <div key={s.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '16px', border: `2px solid ${s.accent}22` }}>
                  <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: s.accent }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e8edf3' }}>
              <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em' }}>Calificación general</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Stars rating={avgRating} size={16} />
              </div>
              {ratedCount === 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>Aún no tienes tickets calificados en este módulo</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreate && moduleId && <CreateModal moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}

/* ─────────────────── User view ──────────────────────────────────────────── */

function UserView({ moduleId, basePath, canCreate }: { moduleId: string; basePath: string; canCreate: boolean }) {
  const router       = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [page,       setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', moduleId, 'mine', page],
    queryFn:  () => ticketsService.getAll({ module_id: moduleId, mine: true, page, limit: 20 }),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const tickets    = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

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

      {showCreate && moduleId && <CreateModal moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}

/* ─────────────────── Main component ─────────────────────────────────────── */

interface TicketsClientProps {
  forcedModuleId?:   string;
  forcedModuleSlug?: string;
  forcedModuleName?: string;
  forcedModuleDesc?: string | null;
  visualVariant?: 'helpdeskMockup' | 'default';
}

export function TicketsClient({
  forcedModuleId,
  forcedModuleSlug,
  forcedModuleName,
  forcedModuleDesc,
  visualVariant = 'default',
}: TicketsClientProps = {}) {
  const { modules } = useModules();
  const isForced    = !!forcedModuleId;

  const helpdeskId   = !isForced ? modules?.find(isHelpdeskModule)?.id : undefined;
  const moduleId     = forcedModuleId ?? helpdeskId ?? '';
  const moduleSlug   = forcedModuleSlug ?? 'helpdesk';
  const ticketBasePath = `/${moduleSlug}`;

  const navItems = useMemo(
    () => isForced && forcedModuleSlug ? buildDynamicModuleNav(forcedModuleSlug) : HELPDESK_NAV,
    [isForced, forcedModuleSlug],
  );
  useModuleNav(
    isForced ? (forcedModuleName ?? '') : HELPDESK_MODULE_NAME,
    navItems,
    moduleId || undefined,
  );

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const moduleRole = useMemo(() => {
    if (!user || !moduleId) return null;
    return user.module_roles.find(
      (r) => r.module_id === moduleId && r.status === 'active',
    )?.role_name ?? null;
  }, [user, moduleId]);

  const isAdminView = isSuperadmin || moduleRole === 'admin_modulo' || moduleRole === 'jefe_tecnico';
  const isTechView  = !isAdminView && moduleRole === 'tecnico';

  const canCreate = isSuperadmin || !!moduleRole;

  const layoutTitle = isForced ? (forcedModuleName ?? '') : 'Mesa de Ayuda';
  const layoutDesc  = isForced
    ? (forcedModuleDesc ?? null)
    : 'Sistema centralizado de soporte técnico. Gestiona incidencias, solicitudes y seguimiento SLA.';

  return (
    <ModuleLayout
      moduleId={moduleId || undefined}
      title={layoutTitle}
      description={layoutDesc}
      isSuperadmin={isSuperadmin}
    >
      {isAdminView ? (
        <AdminView moduleId={moduleId} basePath={ticketBasePath} canCreate={canCreate} visualVariant={visualVariant} />
      ) : isTechView && user ? (
        <TechView user={user} moduleId={moduleId} basePath={ticketBasePath} moduleRole={moduleRole!} canCreate={canCreate} />
      ) : (
        <UserView moduleId={moduleId} basePath={ticketBasePath} canCreate={canCreate} />
      )}
    </ModuleLayout>
  );
}
