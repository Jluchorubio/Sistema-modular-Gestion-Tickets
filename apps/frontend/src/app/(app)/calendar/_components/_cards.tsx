'use client';

import { AlertTriangle } from 'lucide-react';
import { type AdmRequest } from '@/services/requests.service';
import { type TicketListItem } from '@/services/tickets.service';
import { type CalendarMeeting, PROVIDER_LABELS, PROVIDER_COLORS, STATUS_COLORS as MEET_STATUS_COLORS, STATUS_LABELS as MEET_STATUS_LABELS } from '@/services/meetings.service';
import { type CalendarEvent, EVENT_TYPE_LABELS } from '@/services/calendar-events.service';
import { getPriorityConfig, getSlaStatusConfig } from '@/constants/status';
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_COLORS, REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_TYPE_LABELS } from '@/constants/requests';
import { eventColor } from './_types';
import styles from '../calendar.module.css';

/* ── Request / task card ── */
export function DayEventCard({ req, onClick }: { req: AdmRequest; onClick: () => void }) {
  const color       = eventColor(req);
  const prioColor   = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
  const statusColor = REQUEST_STATUS_COLORS[req.status]     ?? '#94a3b8';
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
        <span style={{ color: statusColor, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
          {REQUEST_STATUS_LABELS[req.status] ?? req.status}
        </span>
        {req.requester_name && <span className={styles.dayEventUser}>{req.requester_name}</span>}
      </div>
    </div>
  );
}

/* ── Ticket SLA card ── */
export function TicketSlaCard({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const slaCfg    = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status) : null;
  const slaColor  = slaCfg?.text ?? '#94a3b8';
  const slaBg     = slaCfg?.bg ?? 'transparent';
  const slaBorder = slaCfg?.border ?? '#94a3b8';
  const slaLabel  = slaCfg?.label ?? 'Sin SLA';
  const prioColor = getPriorityConfig(ticket.priority).color;
  return (
    <div className={`${styles.dayEventCard} ${styles.ticketCard}`} onClick={onClick}>
      <div className={styles.dayEventTop}>
        <span className={styles.slaTag} style={{ background: slaBg, color: slaColor, border: `1px solid ${slaBorder}` }}>
          <AlertTriangle size={8} /> SLA · {slaLabel}
        </span>
        <span style={{ color: prioColor, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
          {getPriorityConfig(ticket.priority).label}
        </span>
      </div>
      <h4 className={styles.dayEventTitle}>{ticket.title}</h4>
      <div className={styles.dayEventMeta}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{ticket.module_name}</span>
        {ticket.assignee_name && <span className={styles.dayEventUser}>{ticket.assignee_name}</span>}
      </div>
    </div>
  );
}

/* ── Meeting card ── */
export function DayMeetingCard({ meeting, onClick }: { meeting: CalendarMeeting; onClick: () => void }) {
  const provColor   = PROVIDER_COLORS[meeting.provider] ?? '#64748b';
  const statusColor = MEET_STATUS_COLORS[meeting.status] ?? '#64748b';
  const dt          = new Date(meeting.scheduled_at);
  return (
    <div className={`${styles.dayEventCard} ${styles.ticketCard}`} onClick={onClick} style={{ borderLeft: `3px solid ${provColor}` }}>
      <div className={styles.dayEventTop}>
        <span className={styles.slaTag} style={{ background: `${provColor}22`, color: provColor, border: `1px solid ${provColor}44` }}>
          📹 {PROVIDER_LABELS[meeting.provider]}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: statusColor, textTransform: 'uppercase' }}>
          {MEET_STATUS_LABELS[meeting.status]}
        </span>
      </div>
      <h4 className={styles.dayEventTitle}>{meeting.reason}</h4>
      <div className={styles.dayEventMeta}>
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{meeting.module_name}</span>
        <span className={styles.dayEventUser}>{dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

/* ── Calendar event card ── */
export function DayCalEventCard({ ev, onClick }: { ev: CalendarEvent; onClick: () => void }) {
  const color     = ev.color ?? '#8b5cf6';
  const typeLabel = EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type;
  const start     = ev.all_day ? null : new Date(ev.start_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`${styles.dayEventCard} ${styles.ticketCard}`} onClick={onClick} style={{ borderLeft: `3px solid ${color}` }}>
      <div className={styles.dayEventTop}>
        <span className={styles.slaTag} style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
          📅 {typeLabel}
        </span>
        {ev.all_day && <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Todo el día</span>}
        {start       && <span className={styles.dayEventUser}>{start}</span>}
      </div>
      <h4 className={styles.dayEventTitle}>{ev.title}</h4>
      {ev.module_name && (
        <div className={styles.dayEventMeta}>
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{ev.module_name}</span>
          <span className={styles.dayEventUser}>{ev.created_by_name}</span>
        </div>
      )}
    </div>
  );
}
