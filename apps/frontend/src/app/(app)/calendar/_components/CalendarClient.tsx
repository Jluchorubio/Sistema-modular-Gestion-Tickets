'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventClickArg } from '@fullcalendar/core';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, XCircle, Clock, Filter } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  requestsService,
  type AdmRequest,
  type RequestStatus,
  type RequestType,
} from '@/services/requests.service';
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_COLORS,
} from '@/constants/requests';
import styles from '../calendar.module.css';

/* ── Role detection ─────────────────────────────────────────────────────── */
type CalendarRole = 'superadmin' | 'admin' | 'jefe' | 'user';

function useCalendarRole(): CalendarRole {
  const user = useAuthStore((s) => s.user);
  if (user?.is_superadmin) return 'superadmin';
  const roles = user?.module_roles?.filter((r) => r.status === 'active').map((r) => r.role_name) ?? [];
  if (roles.includes('admin_modulo'))  return 'admin';
  if (roles.includes('jefe_tecnico'))  return 'jefe';
  return 'user';
}

const ROLE_LABELS: Record<CalendarRole, string> = {
  superadmin: 'Vista global — todas las solicitudes',
  admin:      'Vista de módulo — solicitudes del módulo',
  jefe:       'Vista de equipo — solicitudes del equipo',
  user:       'Mis solicitudes',
};

/* ── Stats bar ─────────────────────────────────────────────────────────── */
function StatsBar({ requests }: { requests: AdmRequest[] }) {
  const counts = useMemo(() => ({
    total:       requests.length,
    pending:     requests.filter((r) => r.status === 'pending').length,
    under_review:requests.filter((r) => r.status === 'under_review').length,
    approved:    requests.filter((r) => r.status === 'approved').length,
    rejected:    requests.filter((r) => r.status === 'rejected').length,
    cancelled:   requests.filter((r) => r.status === 'cancelled').length,
  }), [requests]);

  return (
    <div className={styles.statsBar}>
      {([
        { label: 'Total',      value: counts.total,        color: '#0f172a' },
        { label: 'Pendientes', value: counts.pending,       color: REQUEST_STATUS_COLORS.pending },
        { label: 'En revisión',value: counts.under_review,  color: REQUEST_STATUS_COLORS.under_review },
        { label: 'Aprobadas',  value: counts.approved,      color: REQUEST_STATUS_COLORS.approved },
        { label: 'Rechazadas', value: counts.rejected,      color: REQUEST_STATUS_COLORS.rejected },
      ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
        <div key={label} className={styles.statCard}>
          <span className={styles.statValue} style={{ color }}>{value}</span>
          <span className={styles.statLabel}>{label}</span>
        </div>
      ))}
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
  const qc        = useQueryClient();
  const canReview = role === 'superadmin' || role === 'admin';
  const canCancel = role === 'user' && ['pending', 'under_review'].includes(req.status);

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

  const statusColor = REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
  const priorityColor = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.popupClose} onClick={onClose}>
          <X size={16} />
        </button>

        <div className={styles.popupType}>
          {REQUEST_TYPE_LABELS[req.type] ?? req.type}
        </div>

        <div className={styles.popupTitle}>{req.title}</div>

        <div className={styles.popupBadges}>
          <span
            className={styles.popupStatusBadge}
            style={{
              background: `${statusColor}22`,
              color:       statusColor,
              border:      `1px solid ${statusColor}44`,
            }}
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

        {req.description && (
          <p className={styles.popupDesc}>{req.description}</p>
        )}

        <div className={styles.popupMeta}>
          <span>
            {new Date(req.created_at).toLocaleDateString('es', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </span>
          {req.requester_name && <span>Por: {req.requester_name}</span>}
          {req.reviewer_name  && <span>Revisado por: {req.reviewer_name}</span>}
        </div>

        {req.review_notes && (
          <div className={styles.popupNotes}>
            <strong>Notas:</strong> {req.review_notes}
          </div>
        )}

        {/* ── Review actions (admin) ── */}
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

        {/* ── Cancel (user) ── */}
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
  const role        = useCalendarRole();
  const canSeeAll   = role === 'superadmin' || role === 'admin';

  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [typeFilter,   setTypeFilter]   = useState<RequestType   | ''>('');
  const [showFilters,  setShowFilters]  = useState(false);
  const [selectedReq,  setSelectedReq]  = useState<AdmRequest | null>(null);

  const queryKey = ['calendar-requests', role, statusFilter, typeFilter];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      canSeeAll
        ? requestsService.getAll({ status: statusFilter, type: typeFilter, limit: 300 })
        : requestsService.getMine(200),
    staleTime: 2 * 60_000,
  });

  const requests = data?.data ?? [];

  const events = useMemo(() => requests.map((req) => {
    const color = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
    return {
      id:              req.id,
      title:           req.title,
      start:           req.created_at.slice(0, 10),
      allDay:          true,
      backgroundColor: req.status === 'cancelled' ? '#94a3b8' : color,
      borderColor:     req.status === 'cancelled' ? '#94a3b8' : color,
      textColor:       '#ffffff',
      extendedProps:   { req },
    };
  }), [requests]);

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedReq(info.event.extendedProps.req as AdmRequest);
  }

  return (
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.title}>Calendario</div>
          <div className={styles.subtitle}>{ROLE_LABELS[role]}</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.legend}>
            {(['baja', 'media', 'alta', 'critica'] as const).map((p) => (
              <span key={p} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: REQUEST_PRIORITY_COLORS[p] }} />
                {REQUEST_PRIORITY_LABELS[p]}
              </span>
            ))}
          </div>
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
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {(statusFilter || typeFilter) && (
            <button
              className={styles.clearFilters}
              onClick={() => { setStatusFilter(''); setTypeFilter(''); }}
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
        {isLoading && (
          <div className={styles.loadOverlay}>Cargando…</div>
        )}
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
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week:  'Semana',
            list:  'Lista',
          }}
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

      {/* ── Event popup ── */}
      {selectedReq && (
        <EventPopup
          req={selectedReq}
          role={role}
          onClose={() => setSelectedReq(null)}
          onRefresh={() => refetch()}
        />
      )}
    </div>
  );
}
