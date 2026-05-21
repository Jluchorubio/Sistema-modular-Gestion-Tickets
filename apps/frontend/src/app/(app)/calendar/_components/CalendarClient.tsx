'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventClickArg } from '@fullcalendar/core';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, XCircle, Clock, Filter, Plus, Settings, User } from 'lucide-react';
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
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_COLORS,
  REQUEST_PRIORITIES,
} from '@/constants/requests';
import styles from '../calendar.module.css';

/* ── Role + context ──────────────────────────────────────────────────────── */
type CalendarRole = 'superadmin' | 'admin' | 'jefe' | 'user';

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
  admin_modulo: 'Admin de módulo',
  jefe_tecnico: 'Jefe técnico',
  tecnico:      'Técnico',
  usuario:      'Usuario',
};

function useCalendarContexts(): CalendarContext[] {
  const user = useAuthStore((s) => s.user);

  if (user?.is_superadmin) {
    return [{ id: 'global', label: 'Vista global', sublabel: 'Todas las solicitudes', role: 'superadmin' }];
  }

  const active = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
  if (active.length === 0) {
    return [{ id: 'personal', label: 'Mis solicitudes', sublabel: 'Vista personal', role: 'user' }];
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

  // Always add personal view at end for non-superadmin
  contexts.push({ id: 'personal', label: 'Personal', sublabel: 'Mis tareas y solicitudes', role: 'user' });
  return contexts;
}

const ROLE_LABELS: Record<CalendarRole, string> = {
  superadmin: 'Vista global — todas las solicitudes',
  admin:      'Vista de módulo — solicitudes del módulo',
  jefe:       'Vista de equipo — solicitudes del equipo',
  user:       'Mis solicitudes',
};

/* ── Source colors ──────────────────────────────────────────────────────── */
const SOURCE_COLORS = {
  system_task: '#8B5CF6',
  user_task:   '#6366F1',
};

function eventColor(req: AdmRequest): string {
  if (req.type === 'task') {
    return req.task_source === 'system' ? SOURCE_COLORS.system_task : SOURCE_COLORS.user_task;
  }
  return REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
}

/* ── Source filter type ─────────────────────────────────────────────────── */
type CalendarSourceFilter = '' | 'system_tasks' | 'user_tasks' | 'requests';

const SOURCE_FILTER_LABELS: Record<CalendarSourceFilter, string> = {
  '':           'Origen: Todos',
  system_tasks: 'Tareas del sistema',
  user_tasks:   'Mis tareas',
  requests:     'Gestión Administrativa',
};

/* ── Stats bar ─────────────────────────────────────────────────────────── */
function StatsBar({ requests }: { requests: AdmRequest[] }) {
  const counts = useMemo(() => ({
    total:       requests.length,
    pending:     requests.filter((r) => r.status === 'pending').length,
    taken:       requests.filter((r) => r.status === 'taken').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    completed:   requests.filter((r) => r.status === 'completed').length,
    approved:    requests.filter((r) => r.status === 'approved').length,
    rejected:    requests.filter((r) => r.status === 'rejected').length,
  }), [requests]);

  return (
    <div className={styles.statsBar}>
      {([
        { label: 'Total',       value: counts.total,       color: '#0f172a' },
        { label: 'Pendientes',  value: counts.pending,      color: REQUEST_STATUS_COLORS.pending },
        { label: 'Tomados',     value: counts.taken,        color: REQUEST_STATUS_COLORS.taken },
        { label: 'En proceso',  value: counts.in_progress,  color: REQUEST_STATUS_COLORS.in_progress },
        { label: 'Finalizados', value: counts.completed,    color: REQUEST_STATUS_COLORS.completed },
        { label: 'Aprobadas',   value: counts.approved,     color: REQUEST_STATUS_COLORS.approved },
        { label: 'Rechazadas',  value: counts.rejected,     color: REQUEST_STATUS_COLORS.rejected },
      ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
        <div key={label} className={styles.statCard}>
          <span className={styles.statValue} style={{ color }}>{value}</span>
          <span className={styles.statLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── New task modal ─────────────────────────────────────────────────────── */
interface NewTaskModalProps {
  onClose:      () => void;
  onCreated:    () => void;
  isSuperadmin: boolean;
}

function NewTaskModal({ onClose, onCreated, isSuperadmin }: NewTaskModalProps) {
  const qc = useQueryClient();
  const [title,      setTitle]      = useState('');
  const [desc,       setDesc]       = useState('');
  const [priority,   setPriority]   = useState<RequestPriority>('media');
  const [dueDate,    setDueDate]    = useState('');
  const [taskSource, setTaskSource] = useState<TaskSource>('user');
  const [error,      setError]      = useState('');

  const createMut = useMutation({
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
      onCreated();
      onClose();
    },
    onError: () => setError('Error al crear la tarea. Intenta de nuevo.'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 5) { setError('El título debe tener al menos 5 caracteres.'); return; }
    setError('');
    createMut.mutate();
  }

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popup} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.popupClose} onClick={onClose}>
          <X size={16} />
        </button>

        <div className={styles.popupType}>Nueva tarea</div>
        <div className={styles.popupTitle} style={{ fontSize: 16, marginBottom: 18 }}>
          Agregar tarea al calendario
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isSuperadmin && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                Tipo de tarea
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['user', 'system'] as TaskSource[]).map((src) => {
                  const active = taskSource === src;
                  const c = src === 'system' ? '#8B5CF6' : '#6366F1';
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setTaskSource(src)}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: `2px solid ${active ? c : '#E2E8F0'}`,
                        background: active ? `${c}18` : '#fff',
                        color: active ? c : '#64748B',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      {src === 'system' ? <Settings size={13} /> : <User size={13} />}
                      {src === 'system' ? 'Del sistema' : 'Personal'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Título *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre de la tarea…"
              maxLength={200}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Descripción
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Descripción opcional…"
              rows={3}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                border: '1px solid #E2E8F0', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as RequestPriority)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid #E2E8F0', outline: 'none', fontFamily: 'inherit',
                  background: '#fff', cursor: 'pointer',
                }}
              >
                {REQUEST_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                Fecha límite
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit', background: '#fff',
                }}
              />
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}

          <div className={styles.popupActions} style={{ marginTop: 4 }}>
            <button
              type="button"
              className={`${styles.popupBtn} ${styles.popupBtnCancel}`}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`${styles.popupBtn} ${styles.popupBtnApprove}`}
              disabled={createMut.isPending}
            >
              <CheckCircle2 size={13} /> {createMut.isPending ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Event popup ────────────────────────────────────────────────────────── */
interface PopupProps {
  req:       AdmRequest;
  role:      CalendarRole;
  onClose:   () => void;
  onRefresh: () => void;
}

function EventPopup({ req, role, onClose, onRefresh }: PopupProps) {
  const qc           = useQueryClient();
  const isTask       = req.type === 'task';
  const isSystemTask = isTask && req.task_source === 'system';
  const canReview    = !isTask && (role === 'superadmin' || role === 'admin');
  const canCancel    = !isTask && role === 'user' && ['pending', 'under_review'].includes(req.status);
  const canComplete  = isTask && !isSystemTask && req.status === 'pending';
  const canCancelTask = isTask && !isSystemTask && req.status === 'pending';

  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject,  setShowReject]  = useState(false);

  const reviewMut = useMutation({
    mutationFn: ({ status, notes }: { status: RequestStatus; notes?: string }) =>
      requestsService.review(req.id, status, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });

  const cancelMut = useMutation({
    mutationFn: () => requestsService.cancel(req.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });

  const completeMut = useMutation({
    mutationFn: () => requestsService.completeTask(req.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });

  const statusColor   = REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
  const priorityColor = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
  const dueDate       = req.metadata?.due_date ? String(req.metadata.due_date) : null;
  const srcColor      = isTask
    ? (isSystemTask ? SOURCE_COLORS.system_task : SOURCE_COLORS.user_task)
    : null;

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.popupClose} onClick={onClose}>
          <X size={16} />
        </button>

        <div className={styles.popupType}>
          {isTask
            ? (isSystemTask ? '⚙ Tarea del sistema' : '✓ Tarea personal')
            : (REQUEST_TYPE_LABELS[req.type] ?? req.type)}
        </div>

        <div className={styles.popupTitle}>{req.title}</div>

        <div className={styles.popupBadges}>
          {srcColor && (
            <span
              className={styles.popupStatusBadge}
              style={{ background: `${srcColor}22`, color: srcColor, border: `1px solid ${srcColor}44` }}
            >
              {isSystemTask ? 'Sistema' : 'Personal'}
            </span>
          )}
          <span
            className={styles.popupStatusBadge}
            style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
          >
            {REQUEST_STATUS_LABELS[req.status] ?? req.status}
          </span>
          <span
            className={styles.popupPriorityBadge}
            style={{ borderColor: priorityColor, color: priorityColor }}
          >
            {REQUEST_PRIORITY_LABELS[req.priority] ?? req.priority}
          </span>
        </div>

        {req.description && <p className={styles.popupDesc}>{req.description}</p>}

        <div className={styles.popupMeta}>
          {dueDate ? (
            <span>
              Fecha límite: {new Date(dueDate).toLocaleDateString('es', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          ) : (
            <span>
              {new Date(req.created_at).toLocaleDateString('es', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          )}
          {req.requester_name && <span>Por: {req.requester_name}</span>}
          {req.reviewer_name  && <span>Revisado por: {req.reviewer_name}</span>}
        </div>

        {req.review_notes && (
          <div className={styles.popupNotes}>
            <strong>Notas:</strong> {req.review_notes}
          </div>
        )}

        {canComplete && (
          <div className={styles.popupActions}>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnApprove}`}
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              <CheckCircle2 size={13} /> Completar tarea
            </button>
          </div>
        )}

        {canCancelTask && (
          <div className={styles.popupActions}>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnReject}`}
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
            >
              <XCircle size={13} /> Eliminar tarea
            </button>
          </div>
        )}

        {canReview && req.status === 'pending' && !showReject && (
          <div className={styles.popupActions}>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnReview}`}
              onClick={() => reviewMut.mutate({ status: 'under_review' })}
              disabled={reviewMut.isPending}
            >
              <Clock size={13} /> En revisión
            </button>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnApprove}`}
              onClick={() => reviewMut.mutate({ status: 'approved' })}
              disabled={reviewMut.isPending}
            >
              <CheckCircle2 size={13} /> Aprobar
            </button>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnReject}`}
              onClick={() => setShowReject(true)}
              disabled={reviewMut.isPending}
            >
              <XCircle size={13} /> Rechazar
            </button>
          </div>
        )}

        {canReview && req.status === 'under_review' && !showReject && (
          <div className={styles.popupActions}>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnApprove}`}
              onClick={() => reviewMut.mutate({ status: 'approved' })}
              disabled={reviewMut.isPending}
            >
              <CheckCircle2 size={13} /> Aprobar
            </button>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnReject}`}
              onClick={() => setShowReject(true)}
              disabled={reviewMut.isPending}
            >
              <XCircle size={13} /> Rechazar
            </button>
          </div>
        )}

        {showReject && (
          <div className={styles.rejectBox}>
            <textarea
              className={styles.rejectTextarea}
              placeholder="Motivo del rechazo (opcional)…"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
            <div className={styles.rejectBoxActions}>
              <button
                className={`${styles.popupBtn} ${styles.popupBtnCancel}`}
                onClick={() => setShowReject(false)}
              >
                Cancelar
              </button>
              <button
                className={`${styles.popupBtn} ${styles.popupBtnReject}`}
                onClick={() => reviewMut.mutate({ status: 'rejected', notes: rejectNotes || undefined })}
                disabled={reviewMut.isPending}
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        )}

        {canCancel && (
          <div className={styles.popupActions}>
            <button
              className={`${styles.popupBtn} ${styles.popupBtnReject}`}
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
            >
              <XCircle size={13} /> Cancelar solicitud
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function CalendarClient() {
  const contexts         = useCalendarContexts();
  const [selectedCtxIdx, setSelectedCtxIdx] = useState(0);
  const ctx              = contexts[selectedCtxIdx] ?? contexts[0];
  const role             = ctx.role;
  const canSeeAll        = role === 'superadmin' || role === 'admin' || role === 'jefe';
  const isSuperadmin     = role === 'superadmin';

  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [typeFilter,   setTypeFilter]   = useState<RequestType   | ''>('');
  const [sourceFilter, setSourceFilter] = useState<CalendarSourceFilter>('');
  const [showFilters,  setShowFilters]  = useState(false);
  const [selectedReq,  setSelectedReq] = useState<AdmRequest | null>(null);
  const [showNewTask,  setShowNewTask]  = useState(false);

  const queryKey = ['calendar-requests', selectedCtxIdx, statusFilter, typeFilter];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      canSeeAll
        ? requestsService.getAll({ status: statusFilter, type: typeFilter, limit: 300 })
        : requestsService.getMine(200),
    staleTime: 2 * 60_000,
  });

  const requests = data?.data ?? [];

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (ctx.moduleId && role !== 'superadmin') {
      result = result.filter((r) => r.metadata?.module_id === ctx.moduleId);
    }
    if (!sourceFilter) return result;
    if (sourceFilter === 'system_tasks') return result.filter((r) => r.task_source === 'system');
    if (sourceFilter === 'user_tasks')   return result.filter((r) => r.task_source === 'user' && r.type === 'task');
    if (sourceFilter === 'requests')     return result.filter((r) => r.type !== 'task');
    return result;
  }, [requests, sourceFilter, ctx.moduleId, role]);

  const events = useMemo(() => filteredRequests.map((req) => {
    const color = eventColor(req);
    const startDate = req.type === 'task' && req.metadata?.due_date
      ? String(req.metadata.due_date)
      : req.created_at.slice(0, 10);
    return {
      id:              req.id,
      title:           req.type === 'task'
        ? (req.task_source === 'system' ? `⚙ ${req.title}` : `✓ ${req.title}`)
        : req.title,
      start:           startDate,
      allDay:          true,
      backgroundColor: color,
      borderColor:     color,
      textColor:       '#ffffff',
      extendedProps:   { req },
    };
  }), [filteredRequests]);

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedReq(info.event.extendedProps.req as AdmRequest);
  }

  return (
    <ModuleLayout
      title="Calendario"
      description="Visualización de solicitudes y tareas en formato de calendario mensual, semanal o agenda."
      isSuperadmin={isSuperadmin}
    >
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.subtitle}>{ROLE_LABELS[role]}</div>
          {contexts.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {contexts.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCtxIdx(i)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    border: `1.5px solid ${selectedCtxIdx === i ? '#6366F1' : '#E2E8F0'}`,
                    background: selectedCtxIdx === i ? '#6366F118' : '#fff',
                    color: selectedCtxIdx === i ? '#6366F1' : '#64748B',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span>{c.label}</span>
                  <span style={{ opacity: 0.7, fontWeight: 400 }}>· {c.sublabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: SOURCE_COLORS.system_task }} />
              Sistema
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: SOURCE_COLORS.user_task }} />
              Personal
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: REQUEST_STATUS_COLORS.pending }} />
              Pendiente
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: REQUEST_STATUS_COLORS.approved }} />
              Aprobada
            </span>
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#6366F1', color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={14} /> Nueva tarea
          </button>
          {canSeeAll && (
            <button
              className={`${styles.filterToggle}${showFilters ? ` ${styles.filterToggleActive}` : ''}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter size={13} /> Filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Admin filter bar ── */}
      {canSeeAll && showFilters && (
        <div className={styles.filterBar}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')}
          >
            <option value="">Estado: Todos</option>
            {Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RequestType | '')}
          >
            <option value="">Tipo: Todos</option>
            {([...REQUEST_TYPES, 'task'] as RequestType[]).map((t) => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as CalendarSourceFilter)}
          >
            {(Object.keys(SOURCE_FILTER_LABELS) as CalendarSourceFilter[]).map((k) => (
              <option key={k} value={k}>{SOURCE_FILTER_LABELS[k]}</option>
            ))}
          </select>
          {(statusFilter || typeFilter || sourceFilter) && (
            <button
              className={styles.clearFilters}
              onClick={() => { setStatusFilter(''); setTypeFilter(''); setSourceFilter(''); }}
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── Stats bar ── */}
      <StatsBar requests={requests} />

      {/* ── Calendar ── */}
      <div className={styles.calWrap}>
        {isLoading && <div className={styles.loadOverlay}>Cargando…</div>}
        <FullCalendar
          plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={esLocale}
          events={events}
          eventClick={handleEventClick}
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,dayGridWeek,listMonth',
          }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Lista' }}
          views={{
            listMonth:   { buttonText: 'Agenda' },
            dayGridWeek: { buttonText: 'Semana' },
          }}
          height="auto"
          firstDay={1}
          dayMaxEvents={3}
          moreLinkText={(n) => `+${n} más`}
          noEventsText="Sin solicitudes para mostrar"
          eventDisplay="block"
        />
      </div>

      {showNewTask && (
        <NewTaskModal
          onClose={() => setShowNewTask(false)}
          onCreated={() => refetch()}
          isSuperadmin={isSuperadmin}
        />
      )}

      {selectedReq && (
        <EventPopup
          req={selectedReq}
          role={role}
          onClose={() => setSelectedReq(null)}
          onRefresh={() => refetch()}
        />
      )}
    </div>
    </ModuleLayout>
  );
}
