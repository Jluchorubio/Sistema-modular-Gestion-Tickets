'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventClickArg } from '@fullcalendar/core';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, CheckCircle2, XCircle, Clock, Plus, ChevronLeft, ChevronRight,
  Settings, User, Filter, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import {
  requestsService,
  type AdmRequest,
  type RequestStatus,
  type RequestType,
  type RequestPriority,
  type TaskSource,
} from '@/services/requests.service';
import {
  ticketsService,
  type TicketListItem,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  SLA_STATUS_LABELS,
  SLA_STATUS_COLORS,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_COLORS,
  REQUEST_PRIORITIES,
} from '@/constants/requests';
import styles from '../calendar.module.css';

/* ── Types ─────────────────────────────────────────────────────────────────── */
type CalendarRole = 'superadmin' | 'admin' | 'jefe' | 'user';
type CalendarView = 'mes' | 'semana' | 'dia' | 'agenda';
type SourceFilter  = '' | 'system_tasks' | 'user_tasks' | 'requests';

/* ── Role / context ────────────────────────────────────────────────────────── */
interface CalendarContext {
  id:       string;
  label:    string;
  sublabel: string;
  role:     CalendarRole;
  moduleId?: string;
}

const ROLE_NAME_MAP: Record<string, CalendarRole> = {
  admin_modulo: 'admin',
  jefe_tecnico: 'jefe',
  tecnico:      'user',
  usuario:      'user',
};

const ROLE_DISPLAY: Record<string, string> = {
  admin_modulo: 'Admin',
  jefe_tecnico: 'Jefe Técnico',
  tecnico:      'Técnico',
  usuario:      'Usuario',
};

const ROLE_DESC: Record<CalendarRole, string> = {
  superadmin: 'Acceso total: todos los módulos, filtros globales y auditoría completa.',
  admin:      'Vista de módulo: solicitudes y tareas del módulo asignado.',
  jefe:       'Vista de equipo: solicitudes y métricas del equipo técnico.',
  user:       'Vista personal: tus solicitudes y tareas asignadas.',
};

/* Role color for availability dots */
const ROLE_AVAIL_COLOR: Record<string, string> = {
  admin_modulo: '#ff5e3a',
  jefe_tecnico: '#f59e0b',
  tecnico:      '#3b82f6',
  usuario:      '#94a3b8',
};

function useCalendarContexts(): CalendarContext[] {
  const user = useAuthStore((s) => s.user);
  if (user?.is_superadmin) {
    return [{ id: 'global', label: 'Vista global', sublabel: 'Superadmin', role: 'superadmin' }];
  }
  const active = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
  if (active.length === 0) {
    return [{ id: 'personal', label: 'Personal', sublabel: 'Vista personal', role: 'user' }];
  }
  const seen = new Set<string>();
  const contexts: CalendarContext[] = [];
  for (const r of active) {
    const key = `${r.module_id}-${r.role_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contexts.push({
      id:       key,
      label:    r.module_name ?? r.module_id,
      sublabel: ROLE_DISPLAY[r.role_name] ?? r.role_name,
      role:     ROLE_NAME_MAP[r.role_name] ?? 'user',
      moduleId: r.module_id,
    });
  }
  contexts.push({ id: 'personal', label: 'Personal', sublabel: 'Mis solicitudes', role: 'user' });
  return contexts;
}

/* ── Audit log ─────────────────────────────────────────────────────────────── */
interface AuditEntry { ts: string; category: string; message: string; isSystem?: boolean }

function useAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([
    { ts: new Date().toLocaleTimeString('es', { hour12: false }), category: 'SISTEMA', message: 'Calendario operativo inicializado.', isSystem: true },
  ]);
  const ref = useRef<HTMLDivElement>(null);

  const add = useCallback((category: string, message: string, isSystem = false) => {
    const ts = new Date().toLocaleTimeString('es', { hour12: false });
    setEntries((prev) => [...prev.slice(-99), { ts, category, message, isSystem }]);
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return { entries, add, ref };
}

/* ── Date helpers ──────────────────────────────────────────────────────────── */
const MONTHS_ES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const WEEKDAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function getReqDateStr(req: AdmRequest): string {
  if (req.type === 'task' && req.metadata?.due_date) return String(req.metadata.due_date).slice(0, 10);
  return req.created_at.slice(0, 10);
}

/* ── Source colors ─────────────────────────────────────────────────────────── */
const SRC_COLORS = { system_task: '#8B5CF6', user_task: '#6366F1' };

function eventColor(req: AdmRequest): string {
  if (req.type === 'task') return req.task_source === 'system' ? SRC_COLORS.system_task : SRC_COLORS.user_task;
  return REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
}

/* ── Month grid ────────────────────────────────────────────────────────────── */
interface MonthGridProps {
  year:            number;
  month:           number;
  daysWithEvents:  Set<string>;
  daysWithSla:     Set<string>;
  selectedDay:     Date | null;
  onDaySelect:     (d: Date) => void;
}

function MonthGrid({ year, month, daysWithEvents, daysWithSla, selectedDay, onDaySelect }: MonthGridProps) {
  const todayStr    = toDateStr(new Date());
  const selectedStr = selectedDay ? toDateStr(selectedDay) : null;

  const cells = useMemo(() => {
    const first    = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startDow = first.getDay();
    const result: Array<{ date: Date; cur: boolean }> = [];

    for (let i = startDow - 1; i >= 0; i--)
      result.push({ date: new Date(year, month, -i), cur: false });
    for (let d = 1; d <= lastDate; d++)
      result.push({ date: new Date(year, month, d), cur: true });
    const rem = 42 - result.length;
    for (let d = 1; d <= rem; d++)
      result.push({ date: new Date(year, month + 1, d), cur: false });

    return result;
  }, [year, month]);

  return (
    <div className={styles.monthGrid}>
      <div className={styles.weekdayRow}>
        {WEEKDAYS_ES.map((d) => <span key={d} className={styles.weekdayLabel}>{d}</span>)}
      </div>
      <div className={styles.daysGrid}>
        {cells.map(({ date, cur }, i) => {
          const ds         = toDateStr(date);
          const isToday    = ds === todayStr;
          const isSelected = ds === selectedStr;
          const hasReqs    = daysWithEvents.has(ds);
          const hasSla     = daysWithSla.has(ds);

          let cls = styles.dayCell;
          if (!cur)            cls += ` ${styles.dayCellOther}`;
          else if (isSelected) cls += ` ${styles.dayCellSelected}`;
          else if (isToday)    cls += ` ${styles.dayCellToday}`;

          return (
            <div key={i} className={cls} onClick={() => cur && onDaySelect(date)}>
              <span className={styles.dayNum}>{date.getDate()}</span>
              {!isSelected && (hasReqs || hasSla) && (
                <div className={styles.dotRow}>
                  {hasReqs && <span className={styles.dotCoral} />}
                  {hasSla  && <span className={styles.dotSla}   />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Day request card ──────────────────────────────────────────────────────── */
function DayEventCard({ req, onClick }: { req: AdmRequest; onClick: () => void }) {
  const color       = eventColor(req);
  const prioColor   = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
  const statusColor = REQUEST_STATUS_COLORS[req.status]    ?? '#94a3b8';
  const isTask      = req.type === 'task';
  return (
    <div className={styles.dayEventCard} onClick={onClick}>
      <div className={styles.dayEventTop}>
        <span className={styles.dayEventPrio} style={{ background: `${prioColor}22`, color: prioColor, border: `1px solid ${prioColor}44` }}>
          {REQUEST_PRIORITY_LABELS[req.priority] ?? req.priority}
        </span>
        <span className={styles.dayEventSrc} style={{ color }}>
          {isTask ? (req.task_source === 'system' ? 'Sistema' : 'Tarea') : (REQUEST_TYPE_LABELS[req.type] ?? req.type)}
        </span>
      </div>
      <h4 className={styles.dayEventTitle}>{req.title}</h4>
      <div className={styles.dayEventMeta}>
        <span style={{ color: statusColor, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
          {REQUEST_STATUS_LABELS[req.status] ?? req.status}
        </span>
        {req.requester_name && <span className={styles.dayEventUser}>{req.requester_name}</span>}
      </div>
    </div>
  );
}

/* ── Ticket SLA card ───────────────────────────────────────────────────────── */
function TicketSlaCard({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const slaColor  = ticket.sla_status ? SLA_STATUS_COLORS[ticket.sla_status]      : '#94a3b8';
  const slaLabel  = ticket.sla_status ? SLA_STATUS_LABELS[ticket.sla_status]       : 'Sin SLA';
  const prioColor = TICKET_PRIORITY_COLORS[ticket.priority];
  return (
    <div className={`${styles.dayEventCard} ${styles.ticketCard}`} onClick={onClick}>
      <div className={styles.dayEventTop}>
        <span className={styles.slaTag} style={{ background: `${slaColor}22`, color: slaColor, border: `1px solid ${slaColor}44` }}>
          <AlertTriangle size={8} /> SLA · {slaLabel}
        </span>
        <span style={{ color: prioColor, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>
          {TICKET_PRIORITY_LABELS[ticket.priority]}
        </span>
      </div>
      <h4 className={styles.dayEventTitle}>{ticket.title}</h4>
      <div className={styles.dayEventMeta}>
        <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{ticket.module_name}</span>
        {ticket.assignee_name && <span className={styles.dayEventUser}>{ticket.assignee_name}</span>}
      </div>
    </div>
  );
}

/* ── Ticket SLA popup (read-only) ──────────────────────────────────────────── */
function TicketSlaPopup({ ticket, onClose }: { ticket: TicketListItem; onClose: () => void }) {
  const slaColor  = ticket.sla_status ? SLA_STATUS_COLORS[ticket.sla_status]  : '#94a3b8';
  const slaLabel  = ticket.sla_status ? SLA_STATUS_LABELS[ticket.sla_status]  : 'Sin SLA';
  const prioColor = TICKET_PRIORITY_COLORS[ticket.priority];
  const deadline  = ticket.sla_deadline
    ? new Date(ticket.sla_deadline).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}>
          <X size={15} />
        </button>

        <div className={styles.popupType}>🎫 Ticket — SLA</div>
        <div className={styles.popupTitle}>{ticket.title}</div>

        <div className={styles.badgeRow}>
          <span className={styles.badge} style={{ background: `${slaColor}22`, color: slaColor, border: `1px solid ${slaColor}44` }}>
            SLA: {slaLabel}
          </span>
          <span className={styles.badge} style={{ background: `${prioColor}22`, color: prioColor, border: `1px solid ${prioColor}44` }}>
            {TICKET_PRIORITY_LABELS[ticket.priority]}
          </span>
          <span className={styles.badge} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
            {ticket.state_label}
          </span>
        </div>

        <div className={styles.popupMeta}>
          <span>Módulo: {ticket.module_name}</span>
          <span>Categoría: {ticket.category_name}</span>
          {ticket.creator_name  && <span>Creado por: {ticket.creator_name}</span>}
          {ticket.assignee_name && <span>Asignado a: {ticket.assignee_name}</span>}
          {deadline             && <span style={{ color: slaColor, fontWeight: 600 }}>Vence: {deadline}</span>}
        </div>

        {ticket.breached_at && (
          <div className={styles.popupNotes} style={{ borderLeft: '3px solid #ef4444', color: '#dc2626' }}>
            <strong>SLA vencido:</strong> {new Date(ticket.breached_at).toLocaleDateString('es', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Availability panel — real module users ────────────────────────────────── */
function AvailabilityPanel({ moduleId }: { moduleId?: string }) {
  const { data: members } = useQuery({
    queryKey: ['calendar-module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId!),
    enabled:  !!moduleId,
    staleTime: 5 * 60_000,
  });

  const users = (members as Array<{ id: string; first_name: string; last_name: string; job_title: string | null; role_name: string }> | undefined)?.slice(0, 5) ?? [];

  const showMock = !moduleId || users.length === 0;
  const mockData = [
    { name: 'Soporte L1',    role: 'tecnico',      color: '#3b82f6' },
    { name: 'Admin BD',      role: 'admin_modulo', color: '#ff5e3a' },
    { name: 'Redes / Infra', role: 'tecnico',      color: '#3b82f6' },
  ];

  return (
    <div className={styles.availSection}>
      <h3 className={styles.sideSectionLabel}>Disponibilidad Técnica</h3>
      <div className={styles.availList}>
        {showMock
          ? mockData.map(({ name, role, color }) => (
              <div key={name} className={styles.availItem}>
                <div className={styles.availLeft}>
                  <span className={styles.availDot} style={{ background: color }} />
                  <span className={styles.availName}>{name}</span>
                </div>
                <span className={styles.availBadge} style={{ color, background: `${color}18` }}>
                  {ROLE_DISPLAY[role] ?? role}
                </span>
              </div>
            ))
          : users.map((u) => {
              const color = ROLE_AVAIL_COLOR[u.role_name] ?? '#94a3b8';
              return (
                <div key={u.id} className={styles.availItem}>
                  <div className={styles.availLeft}>
                    <span className={styles.availDot} style={{ background: color }} />
                    <span className={styles.availName}>{u.first_name} {u.last_name}</span>
                  </div>
                  <span className={styles.availBadge} style={{ color, background: `${color}18` }}>
                    {ROLE_DISPLAY[u.role_name] ?? u.role_name}
                  </span>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

/* ── Create event modal ─────────────────────────────────────────────────────── */
interface CreateModalProps {
  onClose:      () => void;
  onCreated:    () => void;
  isSuperadmin: boolean;
  onAudit:      (cat: string, msg: string) => void;
}

function CreateEventModal({ onClose, onCreated, isSuperadmin, onAudit }: CreateModalProps) {
  const qc = useQueryClient();
  const [title,      setTitle]      = useState('');
  const [desc,       setDesc]       = useState('');
  const [priority,   setPriority]   = useState<RequestPriority>('media');
  const [dueDate,    setDueDate]    = useState('');
  const [taskSource, setTaskSource] = useState<TaskSource>('user');
  const [error,      setError]      = useState('');

  const mut = useMutation({
    mutationFn: () => requestsService.create({
      type:        'task',
      title:       title.trim(),
      description: desc.trim() || 'Tarea de calendario.',
      priority,
      task_source: taskSource,
      metadata:    dueDate ? { due_date: dueDate } : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-requests'] });
      onAudit('CREACIÓN', `Tarea "${title.trim()}" registrada.`);
      onCreated(); onClose();
    },
    onError: () => setError('Error al crear. Intenta de nuevo.'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) { setError('Título mínimo 3 caracteres.'); return; }
    setError('');
    mut.mutate();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Crear Tarea u Evento</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit} className={styles.form}>
          {isSuperadmin && (
            <div>
              <label className={styles.fLabel}>Tipo de tarea</label>
              <div className={styles.typeRow}>
                {(['user', 'system'] as TaskSource[]).map((src) => (
                  <button
                    key={src} type="button"
                    className={`${styles.typeBtn} ${taskSource === src ? styles.typeBtnActive : ''}`}
                    onClick={() => setTaskSource(src)}
                  >
                    {src === 'system' ? <><Settings size={12} /> Del sistema</> : <><User size={12} /> Personal</>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={styles.fLabel}>Título *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre de la tarea u evento…" className={styles.fInput} maxLength={200} />
          </div>
          <div>
            <label className={styles.fLabel}>Descripción</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción opcional…" rows={3} className={styles.fTextarea} />
          </div>
          <div className={styles.fRow2}>
            <div>
              <label className={styles.fLabel}>Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as RequestPriority)} className={styles.fSelect}>
                {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fLabel}>Fecha límite</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={styles.fInput} />
            </div>
          </div>
          {error && <p className={styles.fError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={mut.isPending}>
              <CheckCircle2 size={13} /> {mut.isPending ? 'Guardando…' : 'Guardar Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Event detail popup (requests/tasks) ────────────────────────────────────── */
interface PopupProps {
  req:       AdmRequest;
  role:      CalendarRole;
  onClose:   () => void;
  onRefresh: () => void;
  onAudit:   (cat: string, msg: string) => void;
}

function EventDetailPopup({ req, role, onClose, onRefresh, onAudit }: PopupProps) {
  const qc        = useQueryClient();
  const isTask    = req.type === 'task';
  const isSysTask = isTask && req.task_source === 'system';
  const canReview = !isTask && (role === 'superadmin' || role === 'admin');
  const canCancel = !isTask && role === 'user' && ['pending', 'under_review'].includes(req.status);
  const canComplete  = isTask && !isSysTask && req.status === 'pending';
  const canCancelTask = isTask && !isSysTask && req.status === 'pending';
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject,  setShowReject]  = useState(false);

  const reviewMut = useMutation({
    mutationFn: ({ status, notes }: { status: RequestStatus; notes?: string }) =>
      requestsService.review(req.id, status, notes),
    onSuccess: (_, v) => { onAudit('REVISIÓN', `"${req.title}" → ${v.status}.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });
  const cancelMut = useMutation({
    mutationFn: () => requestsService.cancel(req.id),
    onSuccess: () => { onAudit('CANCELACIÓN', `"${req.title}" cancelada.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });
  const completeMut = useMutation({
    mutationFn: () => requestsService.completeTask(req.id),
    onSuccess: () => { onAudit('COMPLETADO', `Tarea "${req.title}" completada.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });

  const statusColor = REQUEST_STATUS_COLORS[req.status]    ?? '#94a3b8';
  const prioColor   = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
  const srcColor    = isTask ? (isSysTask ? SRC_COLORS.system_task : SRC_COLORS.user_task) : null;
  const dueDate     = req.metadata?.due_date ? String(req.metadata.due_date) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}><X size={15} /></button>
        <div className={styles.popupType}>{isTask ? (isSysTask ? '⚙ Tarea del sistema' : '✓ Tarea personal') : (REQUEST_TYPE_LABELS[req.type] ?? req.type)}</div>
        <div className={styles.popupTitle}>{req.title}</div>
        <div className={styles.badgeRow}>
          {srcColor && <span className={styles.badge} style={{ background: `${srcColor}22`, color: srcColor, border: `1px solid ${srcColor}44` }}>{isSysTask ? 'Sistema' : 'Personal'}</span>}
          <span className={styles.badge} style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{REQUEST_STATUS_LABELS[req.status] ?? req.status}</span>
          <span className={styles.badge} style={{ border: `1.5px solid ${prioColor}`, color: prioColor }}>{REQUEST_PRIORITY_LABELS[req.priority] ?? req.priority}</span>
        </div>
        {req.description && <p className={styles.popupDesc}>{req.description}</p>}
        <div className={styles.popupMeta}>
          {dueDate
            ? <span>Fecha límite: {new Date(dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            : <span>{new Date(req.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
          {req.requester_name && <span>Por: {req.requester_name}</span>}
          {req.reviewer_name  && <span>Revisado por: {req.reviewer_name}</span>}
        </div>
        {req.review_notes && <div className={styles.popupNotes}><strong>Notas:</strong> {req.review_notes}</div>}
        {canComplete && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnApprove}`} onClick={() => completeMut.mutate()} disabled={completeMut.isPending}><CheckCircle2 size={13} /> Completar tarea</button>
          </div>
        )}
        {canCancelTask && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}><XCircle size={13} /> Eliminar tarea</button>
          </div>
        )}
        {canReview && ['pending', 'under_review'].includes(req.status) && !showReject && (
          <div className={styles.popupActions}>
            {req.status === 'pending' && (
              <button className={`${styles.pBtn} ${styles.pBtnReview}`} onClick={() => reviewMut.mutate({ status: 'under_review' })} disabled={reviewMut.isPending}><Clock size={13} /> En revisión</button>
            )}
            <button className={`${styles.pBtn} ${styles.pBtnApprove}`} onClick={() => reviewMut.mutate({ status: 'approved' })} disabled={reviewMut.isPending}><CheckCircle2 size={13} /> Aprobar</button>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => setShowReject(true)} disabled={reviewMut.isPending}><XCircle size={13} /> Rechazar</button>
          </div>
        )}
        {showReject && (
          <div className={styles.rejectBox}>
            <textarea className={styles.rejectTextarea} placeholder="Motivo del rechazo (opcional)…" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
            <div className={styles.popupActions}>
              <button className={`${styles.pBtn} ${styles.pBtnCancel}`} onClick={() => setShowReject(false)}>Cancelar</button>
              <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => reviewMut.mutate({ status: 'rejected', notes: rejectNotes || undefined })} disabled={reviewMut.isPending}>Confirmar rechazo</button>
            </div>
          </div>
        )}
        {canCancel && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}><XCircle size={13} /> Cancelar solicitud</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── FC view map ────────────────────────────────────────────────────────────── */
const FC_VIEW: Record<Exclude<CalendarView, 'mes'>, string> = {
  semana: 'dayGridWeek',
  dia:    'dayGridDay',
  agenda: 'listMonth',
};

/* ── Main component ─────────────────────────────────────────────────────────── */
export function CalendarClient() {
  const contexts    = useCalendarContexts();
  const [ctxIdx, setCtxIdx] = useState(0);
  const ctx          = contexts[ctxIdx] ?? contexts[0];
  const role         = ctx.role;
  const canSeeAll    = role === 'superadmin' || role === 'admin' || role === 'jefe';
  const isSuperadmin = role === 'superadmin';

  const audit = useAuditLog();

  const today = new Date();
  const [view,        setView]        = useState<CalendarView>('mes');
  const [calYear,     setCalYear]     = useState(today.getFullYear());
  const [calMonth,    setCalMonth]    = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(today);

  const [statusFilter,   setStatusFilter]   = useState<RequestStatus   | ''>('');
  const [typeFilter,     setTypeFilter]     = useState<RequestType     | ''>('');
  const [sourceFilter,   setSourceFilter]   = useState<SourceFilter>('');
  const [priorityFilter, setPriorityFilter] = useState<RequestPriority | ''>('');

  const [showCreate,    setShowCreate]    = useState(false);
  const [selectedReq,   setSelectedReq]   = useState<AdmRequest | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketListItem | null>(null);

  /* ── Requests query ── */
  const { data: reqData, isLoading: reqLoading, refetch } = useQuery({
    queryKey: ['calendar-requests', ctxIdx, statusFilter, typeFilter],
    queryFn:  () =>
      canSeeAll
        ? requestsService.getAll({ status: statusFilter, type: typeFilter, limit: 300 })
        : requestsService.getMine(200),
    staleTime: 2 * 60_000,
  });

  /* ── Tickets query (SLA deadlines) ── */
  const { data: ticketData, isLoading: ticketLoading } = useQuery({
    queryKey: ['calendar-tickets', ctxIdx],
    queryFn:  () =>
      canSeeAll
        ? ticketsService.getAll({ module_id: ctx.moduleId, limit: 300 })
        : ticketsService.getAll({ mine: true, limit: 200 }),
    staleTime: 2 * 60_000,
  });

  const isLoading = reqLoading || ticketLoading;
  const requests  = reqData?.data   ?? [];
  const tickets   = ticketData?.data ?? [];

  /* ── Client-side filter on requests ── */
  const filteredRequests = useMemo(() => {
    let r = requests;
    if (ctx.moduleId && role !== 'superadmin') r = r.filter((x) => x.metadata?.module_id === ctx.moduleId);
    if (priorityFilter)                         r = r.filter((x) => x.priority === priorityFilter);
    if (sourceFilter === 'system_tasks')        r = r.filter((x) => x.task_source === 'system');
    if (sourceFilter === 'user_tasks')          r = r.filter((x) => x.task_source === 'user' && x.type === 'task');
    if (sourceFilter === 'requests')            r = r.filter((x) => x.type !== 'task');
    return r;
  }, [requests, priorityFilter, sourceFilter, ctx.moduleId, role]);

  /* ── Tickets with SLA deadline only ── */
  const slaTickets = useMemo(
    () => tickets.filter((t) => !!t.sla_deadline),
    [tickets],
  );

  /* ── Event day sets for month grid ── */
  const daysWithEvents = useMemo(() => {
    const s = new Set<string>();
    filteredRequests.forEach((r) => s.add(getReqDateStr(r)));
    return s;
  }, [filteredRequests]);

  const daysWithSla = useMemo(() => {
    const s = new Set<string>();
    slaTickets.forEach((t) => s.add(t.sla_deadline!.slice(0, 10)));
    return s;
  }, [slaTickets]);

  /* ── Right panel: selected day items ── */
  const selectedDayReqs = useMemo(() => {
    if (!selectedDay) return [];
    const ds = toDateStr(selectedDay);
    return filteredRequests.filter((r) => getReqDateStr(r) === ds);
  }, [filteredRequests, selectedDay]);

  const selectedDayTickets = useMemo(() => {
    if (!selectedDay) return [];
    const ds = toDateStr(selectedDay);
    return slaTickets.filter((t) => t.sla_deadline!.slice(0, 10) === ds);
  }, [slaTickets, selectedDay]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total:    requests.length,
    pending:  requests.filter((r) => r.status === 'pending').length,
    inProg:   requests.filter((r) => r.status === 'in_progress').length,
    done:     requests.filter((r) => r.status === 'completed').length,
    slaOpen:  slaTickets.filter((t) => t.sla_status === 'active').length,
  }), [requests, slaTickets]);

  /* ── Month nav ── */
  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    audit.add('CALENDARIO', 'Mes anterior.');
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    audit.add('CALENDARIO', 'Mes siguiente.');
  }

  function handleDaySelect(date: Date) {
    setSelectedDay(date);
    audit.add('CALENDARIO', `Eventos del ${date.toLocaleDateString('es', { day: 'numeric', month: 'long' })}.`);
  }

  function handleViewChange(v: CalendarView) {
    setView(v);
    audit.add('CALENDARIO', `Vista: ${v.toUpperCase()}.`);
  }

  /* ── FullCalendar events (merged requests + SLA tickets) ── */
  const fcEvents = useMemo(() => {
    const reqEvts = filteredRequests.map((req) => {
      const color = eventColor(req);
      return {
        id:              req.id,
        title:           req.type === 'task'
          ? (req.task_source === 'system' ? `⚙ ${req.title}` : `✓ ${req.title}`)
          : req.title,
        start:           getReqDateStr(req),
        allDay:          true,
        backgroundColor: color,
        borderColor:     color,
        textColor:       '#fff',
        extendedProps:   { req },
      };
    });

    const ticketEvts = slaTickets.map((t) => {
      const color = t.sla_status ? SLA_STATUS_COLORS[t.sla_status] : '#94a3b8';
      return {
        id:              `sla-${t.id}`,
        title:           `🎫 ${t.title}`,
        start:           t.sla_deadline!.slice(0, 10),
        allDay:          true,
        backgroundColor: color,
        borderColor:     color,
        textColor:       '#fff',
        extendedProps:   { ticket: t },
      };
    });

    return [...reqEvts, ...ticketEvts];
  }, [filteredRequests, slaTickets]);

  function handleFCClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    if (info.event.extendedProps.ticket) {
      const t = info.event.extendedProps.ticket as TicketListItem;
      setSelectedTicket(t);
      audit.add('SLA', `Ticket SLA: "${t.title}".`);
    } else {
      const req = info.event.extendedProps.req as AdmRequest;
      setSelectedReq(req);
      audit.add('DETALLE', `Abriendo: "${req.title}".`);
    }
  }

  function clearFilters() {
    setStatusFilter(''); setTypeFilter(''); setSourceFilter(''); setPriorityFilter('');
    audit.add('FILTROS', 'Filtros limpiados.');
  }

  const hasFilters = !!(statusFilter || typeFilter || sourceFilter || priorityFilter);
  const totalDayItems = selectedDayReqs.length + selectedDayTickets.length;

  return (
    <ModuleLayout title="Calendario" description="Planificación, SLA y coordinación operativa." isSuperadmin={isSuperadmin} showHero={false}>
      <div className={styles.shell}>

        {/* ── Main panel ── */}
        <div className={styles.main}>

          {/* Sub-header */}
          <div className={styles.subHeader}>
            <div className={styles.subHeaderLeft}>
              <span className={styles.ctxBadge}>{ctx.label} · {ctx.sublabel}</span>
              <span className={styles.subSep}>|</span>
              <p className={styles.ctxDesc}>{ROLE_DESC[role]}</p>
            </div>
            {contexts.length > 1 && (
              <div className={styles.ctxSwitcher}>
                {contexts.map((c, i) => (
                  <button
                    key={c.id}
                    className={`${styles.ctxBtn} ${ctxIdx === i ? styles.ctxBtnActive : ''}`}
                    onClick={() => { setCtxIdx(i); audit.add('CONTEXTO', `Cambiado a: ${c.label}.`); }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Heading */}
          <div className={styles.heading}>
            <div>
              <h1 className={styles.title}>Calendario de Operaciones</h1>
              <p className={styles.subtitle}>Control de SLA, Mantenimientos y Coordinación Global</p>
            </div>
            <div className={styles.viewSwitcher}>
              {(['mes', 'semana', 'dia', 'agenda'] as CalendarView[]).map((v) => (
                <button key={v} className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ''}`} onClick={() => handleViewChange(v)}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <div className={styles.statsStrip}>
            {[
              { label: 'Total',      value: stats.total,   color: '#0e2235' },
              { label: 'Pendientes', value: stats.pending, color: REQUEST_STATUS_COLORS.pending },
              { label: 'En proceso', value: stats.inProg,  color: REQUEST_STATUS_COLORS.in_progress },
              { label: 'Completados',value: stats.done,    color: REQUEST_STATUS_COLORS.completed },
              { label: 'SLA activos',value: stats.slaOpen, color: SLA_STATUS_COLORS.active },
            ].map(({ label, value, color }) => (
              <div key={label} className={styles.statChip}>
                <span className={styles.statValue} style={{ color }}>{value}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            ))}

            {/* Dot legend */}
            <div className={styles.dotLegend}>
              <span className={styles.dotLegendItem}>
                <span className={styles.dotCoral} style={{ position: 'relative', display: 'inline-block' }} /> Solicitudes
              </span>
              <span className={styles.dotLegendItem}>
                <span className={styles.dotSla} style={{ position: 'relative', display: 'inline-block' }} /> SLA Tickets
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filtersPanel}>
            <div className={styles.filtersPanelHead}>
              <Filter size={11} color="#ff5e3a" />
              <span className={styles.filtersPanelTitle}>Filtros Dinámicos del Sistema</span>
            </div>
            <div className={styles.filtersGrid}>
              <div className={styles.fGroup}>
                <label className={styles.fGroupLabel}>Estado</label>
                <select className={styles.fGroupSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')}>
                  <option value="">Todos</option>
                  {Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className={styles.fGroup}>
                <label className={styles.fGroupLabel}>Prioridad</label>
                <select className={styles.fGroupSelect} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as RequestPriority | '')}>
                  <option value="">Todas</option>
                  {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
              <div className={styles.fGroup}>
                <label className={styles.fGroupLabel}>Tipo</label>
                <select className={styles.fGroupSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RequestType | '')}>
                  <option value="">Todos</option>
                  {([...REQUEST_TYPES, 'task'] as RequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABELS[t] ?? t}</option>)}
                </select>
              </div>
              <div className={styles.fGroup}>
                <label className={styles.fGroupLabel}>Origen</label>
                <select className={styles.fGroupSelect} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
                  <option value="">Todo</option>
                  <option value="system_tasks">Sistema</option>
                  <option value="user_tasks">Personal</option>
                  <option value="requests">Gestión Administrativa</option>
                </select>
              </div>
              {hasFilters && (
                <div className={styles.fGroup} style={{ justifyContent: 'flex-end' }}>
                  <button className={styles.clearBtn} onClick={clearFilters}><X size={11} /> Limpiar</button>
                </div>
              )}
            </div>
          </div>

          {/* Calendar view */}
          <div className={styles.calWrap}>
            {isLoading && <div className={styles.loadOverlay}>Cargando…</div>}

            {view === 'mes' && (
              <>
                <div className={styles.monthNav}>
                  <button className={styles.monthNavBtn} onClick={prevMonth}><ChevronLeft size={15} /></button>
                  <span className={styles.monthNavTitle}>{MONTHS_ES[calMonth]} {calYear}</span>
                  <button className={styles.monthNavBtn} onClick={nextMonth}><ChevronRight size={15} /></button>
                </div>
                <MonthGrid
                  year={calYear}
                  month={calMonth}
                  daysWithEvents={daysWithEvents}
                  daysWithSla={daysWithSla}
                  selectedDay={selectedDay}
                  onDaySelect={handleDaySelect}
                />
              </>
            )}

            {view !== 'mes' && (
              <FullCalendar
                key={view}
                plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                initialView={FC_VIEW[view]}
                locale={esLocale}
                events={fcEvents}
                eventClick={handleFCClick}
                headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                buttonText={{ today: 'Hoy' }}
                height="auto"
                firstDay={0}
                dayMaxEvents={4}
                moreLinkText={(n) => `+${n} más`}
                noEventsText="Sin eventos para mostrar"
                eventDisplay="block"
              />
            )}
          </div>

          {/* Audit log */}
          <div className={styles.auditSection}>
            <div className={styles.auditHead}>
              <span className={styles.auditTitle}>Auditoría y Trazabilidad (Log)</span>
              <span className={styles.auditLive}>En Vivo</span>
            </div>
            <div className={styles.auditLog} ref={audit.ref}>
              {audit.entries.map((e, i) => (
                <div key={i} className={`${styles.auditEntry} ${e.isSystem ? styles.auditSystem : ''}`}>
                  <span className={styles.auditTs}>[{e.ts}] {e.category}:</span>
                  <span className={styles.auditMsg}>{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className={styles.right}>
          <div className={styles.rightInner}>

            {/* Day events (requests + SLA tickets) */}
            <div className={styles.daySection}>
              <div className={styles.daySectionHead}>
                <h3 className={styles.sideSectionLabel}>Eventos del Día</h3>
                {selectedDay && (
                  <span className={styles.dayBadge}>
                    {selectedDay.toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    {totalDayItems > 0 && ` · ${totalDayItems}`}
                  </span>
                )}
              </div>

              <div className={styles.dayList}>
                {totalDayItems === 0 ? (
                  <div className={styles.dayEmpty}>
                    <span className={styles.dayEmptyIcon}>📁</span>
                    <p>Sin eventos programados</p>
                    <p>Selecciona un día en el calendario</p>
                  </div>
                ) : (
                  <>
                    {/* SLA tickets first (higher urgency) */}
                    {selectedDayTickets.map((t) => (
                      <TicketSlaCard
                        key={t.id}
                        ticket={t}
                        onClick={() => { setSelectedTicket(t); audit.add('SLA', `Ticket: "${t.title}".`); }}
                      />
                    ))}
                    {/* Then requests/tasks */}
                    {selectedDayReqs.map((req) => (
                      <DayEventCard
                        key={req.id}
                        req={req}
                        onClick={() => { setSelectedReq(req); audit.add('DETALLE', `Abriendo: "${req.title}".`); }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            <AvailabilityPanel moduleId={ctx.moduleId} />
          </div>

          <button
            className={styles.createBtn}
            onClick={() => { setShowCreate(true); audit.add('ACCIÓN', 'Formulario de nuevo evento.'); }}
          >
            <Plus size={14} />
            Crear Tarea u Evento
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateEventModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} isSuperadmin={isSuperadmin} onAudit={audit.add} />
      )}
      {selectedReq && (
        <EventDetailPopup req={selectedReq} role={role} onClose={() => setSelectedReq(null)} onRefresh={() => refetch()} onAudit={audit.add} />
      )}
      {selectedTicket && (
        <TicketSlaPopup ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      )}
    </ModuleLayout>
  );
}
