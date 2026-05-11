'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventClickArg } from '@fullcalendar/core';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { requestsService, type AdmRequest } from '@/services/requests.service';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_TYPE_LABELS } from '@/constants/requests';
import styles from '../calendar.module.css';

export function CalendarClient() {
  const user = useAuthStore((s) => s.user);

  const isSuperadmin   = user?.is_superadmin ?? false;
  const isAdminModulo  = user?.module_roles?.some(
    (r) => r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;
  const isJefeTecnico  = user?.module_roles?.some(
    (r) => r.role_name === 'jefe_tecnico' && r.status === 'active',
  ) ?? false;
  const canSeeAll = isSuperadmin || isAdminModulo;

  const calendarTitle = isSuperadmin
    ? 'Todos los tickets'
    : isAdminModulo
      ? 'Tickets del módulo'
      : isJefeTecnico
        ? 'Tickets del equipo'
        : 'Mis solicitudes';

  const [selectedReq, setSelectedReq] = useState<AdmRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['calendar-requests', canSeeAll],
    queryFn:  () =>
      canSeeAll
        ? requestsService.getAll({ limit: 200 })
        : requestsService.getMine(100),
    staleTime: 2 * 60_000,
  });

  const requests = data?.data ?? [];

  const events = requests.map((req) => ({
    id:              req.id,
    title:           req.title,
    start:           req.created_at.slice(0, 10),
    allDay:          true,
    backgroundColor: REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8',
    borderColor:     REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8',
    textColor:       '#ffffff',
    extendedProps:   { req },
  }));

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    setSelectedReq(info.event.extendedProps.req as AdmRequest);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.title}>Calendario</div>
          <div className={styles.subtitle}>{calendarTitle}</div>
        </div>
        <div className={styles.legend}>
          {Object.entries(REQUEST_STATUS_LABELS).map(([key, label]) => (
            <span key={key} className={styles.legendItem}>
              <span
                className={styles.legendDot}
                style={{ background: REQUEST_STATUS_COLORS[key] }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.calWrap}>
        {isLoading && (
          <div className={styles.loadOverlay}>Cargando solicitudes…</div>
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
            listMonth: { buttonText: 'Agenda' },
            dayGridWeek: { buttonText: 'Semana' },
          }}
          height="auto"
          firstDay={1}
          dayMaxEvents={3}
          moreLinkText={(n) => `+${n} más`}
          noEventsText="Sin solicitudes para mostrar"
          eventDisplay="block"
          eventTimeFormat={{
            hour:   '2-digit',
            minute: '2-digit',
            meridiem: false,
          }}
        />
      </div>

      {/* ── Event detail modal ── */}
      {selectedReq && (
        <div
          className={styles.popupOverlay}
          onClick={() => setSelectedReq(null)}
        >
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.popupClose}
              onClick={() => setSelectedReq(null)}
            >
              ✕
            </button>

            <div className={styles.popupType}>
              {REQUEST_TYPE_LABELS[selectedReq.type] ?? selectedReq.type}
            </div>

            <div className={styles.popupTitle}>{selectedReq.title}</div>

            <div className={styles.popupStatus}>
              <span
                className={styles.popupStatusBadge}
                style={{
                  background: (REQUEST_STATUS_COLORS[selectedReq.status] ?? '#94a3b8') + '22',
                  color:       REQUEST_STATUS_COLORS[selectedReq.status] ?? '#94a3b8',
                  border:      `1px solid ${(REQUEST_STATUS_COLORS[selectedReq.status] ?? '#94a3b8')}44`,
                }}
              >
                {REQUEST_STATUS_LABELS[selectedReq.status] ?? selectedReq.status}
              </span>
            </div>

            {selectedReq.description && (
              <p className={styles.popupDesc}>{selectedReq.description}</p>
            )}

            <div className={styles.popupMeta}>
              <span>
                Creado:{' '}
                {new Date(selectedReq.created_at).toLocaleDateString('es', {
                  day:   'numeric',
                  month: 'long',
                  year:  'numeric',
                })}
              </span>
              {canSeeAll && selectedReq.requester_name && (
                <span>Por: {selectedReq.requester_name}</span>
              )}
              {canSeeAll && selectedReq.reviewer_name && (
                <span>Revisado por: {selectedReq.reviewer_name}</span>
              )}
            </div>

            {selectedReq.review_notes && (
              <div className={styles.popupNotes}>
                <strong>Notas de revisión:</strong> {selectedReq.review_notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
