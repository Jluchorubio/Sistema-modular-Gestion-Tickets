'use client';

import { X } from 'lucide-react';
import { type TicketListItem } from '@/services/tickets.service';
import { type CalendarMeeting, PROVIDER_LABELS, PROVIDER_COLORS, STATUS_COLORS as MEET_STATUS_COLORS, STATUS_LABELS as MEET_STATUS_LABELS } from '@/services/meetings.service';
import { type CalendarEvent, EVENT_TYPE_LABELS } from '@/services/calendar-events.service';
import { getPriorityConfig, getSlaStatusConfig } from '@/constants/status';
import styles from '../calendar.module.css';

/* ── Ticket SLA popup ── */
export function TicketSlaPopup({ ticket, onClose }: { ticket: TicketListItem; onClose: () => void }) {
  const slaCfg    = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status) : null;
  const slaColor  = slaCfg?.text ?? '#94a3b8';
  const slaBg     = slaCfg?.bg ?? 'transparent';
  const slaBorder = slaCfg?.border ?? '#94a3b8';
  const slaLabel  = slaCfg?.label ?? 'Sin SLA';
  const prioColor = getPriorityConfig(ticket.priority).color;
  const deadline  = ticket.sla_deadline
    ? new Date(ticket.sla_deadline).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}><X size={15} /></button>
        <div className={styles.popupType}>🎫 Ticket — SLA</div>
        <div className={styles.popupTitle}>{ticket.title}</div>
        <div className={styles.badgeRow}>
          <span className={styles.badge} style={{ background: slaBg, color: slaColor, border: `1px solid ${slaBorder}` }}>SLA: {slaLabel}</span>
          <span className={styles.badge} style={{ background: `color-mix(in srgb, ${prioColor} 15%, transparent)`, color: prioColor, border: `1px solid color-mix(in srgb, ${prioColor} 25%, transparent)` }}>{getPriorityConfig(ticket.priority).label}</span>
          <span className={styles.badge} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{ticket.state_label}</span>
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

/* ── Meeting popup ── */
export function MeetingPopup({ meeting, onClose }: { meeting: CalendarMeeting; onClose: () => void }) {
  const provColor   = PROVIDER_COLORS[meeting.provider] ?? '#64748b';
  const statusColor = MEET_STATUS_COLORS[meeting.status] ?? '#64748b';
  const dt          = new Date(meeting.scheduled_at);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}><X size={15} /></button>
        <div className={styles.popupType}>📹 Reunión — {PROVIDER_LABELS[meeting.provider]}</div>
        <div className={styles.popupTitle}>{meeting.reason}</div>
        <div className={styles.badgeRow}>
          <span className={styles.badge} style={{ background: `${provColor}22`, color: provColor, border: `1px solid ${provColor}44` }}>{PROVIDER_LABELS[meeting.provider]}</span>
          <span className={styles.badge} style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{MEET_STATUS_LABELS[meeting.status]}</span>
        </div>
        <div className={styles.popupMeta}>
          <span>Ticket: {meeting.ticket_title}</span>
          <span>Módulo: {meeting.module_name}</span>
          <span>Organiza: {meeting.created_by_name}</span>
          <span>Fecha: {dt.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>Hora: {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
          {meeting.duration_minutes && <span>Duración: {meeting.duration_minutes} min</span>}
          <span>Participantes: {meeting.participant_count}</span>
        </div>
        {meeting.meeting_url && (
          <div style={{ marginTop: 14 }}>
            <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: provColor, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Unirse a la reunión →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Calendar event popup ── */
export function CalEventPopup({ ev, onClose }: { ev: CalendarEvent; onClose: () => void }) {
  const color     = ev.color ?? '#8b5cf6';
  const typeLabel = EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type;
  const startDt   = new Date(ev.start_at);
  const endDt     = new Date(ev.end_at);
  const dateStr   = startDt.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr   = ev.all_day
    ? 'Todo el día'
    : `${startDt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}><X size={15} /></button>
        <div className={styles.popupType}>📅 Evento — {typeLabel}</div>
        <div className={styles.popupTitle}>{ev.title}</div>
        <div className={styles.badgeRow}>
          <span className={styles.badge} style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>{typeLabel}</span>
          {ev.priority && <span className={styles.badge} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{ev.priority}</span>}
          <span className={styles.badge} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{ev.status}</span>
        </div>
        {ev.description && <p className={styles.popupDesc}>{ev.description}</p>}
        <div className={styles.popupMeta}>
          <span>Fecha: {dateStr}</span>
          <span>Hora: {timeStr}</span>
          {ev.module_name       && <span>Módulo: {ev.module_name}</span>}
          {ev.created_by_name   && <span>Organizador: {ev.created_by_name}</span>}
          {ev.participant_count > 0 && <span>Participantes: {ev.participant_count}</span>}
        </div>
      </div>
    </div>
  );
}
