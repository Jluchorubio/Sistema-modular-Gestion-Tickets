'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Trash2, ExternalLink, Ticket, FileText, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsService, type AppNotification } from '@/services/notifications.service';
import { fmtRelative, fmtDate } from '@/lib/formatters';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const EVENT_LABELS: Record<string, string> = {
  'ticket.created':             'Ticket creado',
  'ticket.assigned':            'Ticket asignado',
  'ticket.state_changed':       'Cambio de estado',
  'ticket.validation_required': 'Requiere validación',
  'ticket.escalated':           'Ticket escalado',
  'ticket.comment_added':       'Nuevo comentario',
  'request.approved':           'Solicitud aprobada',
  'request.rejected':           'Solicitud rechazada',
  'request.taken':              'Solicitud tomada',
  'meeting.scheduled':          'Reunión programada',
};

function getLabel(n: AppNotification) {
  return EVENT_LABELS[n.event_type] ?? n.event_type.replace(/_/g, ' ');
}

function getMessage(n: AppNotification): string {
  const p = n.payload;
  if (typeof p.message === 'string') return p.message;
  if (typeof p.body    === 'string') return p.body;
  if (typeof p.subject === 'string') return p.subject;
  return '';
}

function getHref(n: AppNotification): string | null {
  const { ticketId, requestId, meetingId } = n.payload as Record<string, string | undefined>;
  if (ticketId)  return `/helpdesk/ticket/${ticketId}`;
  if (requestId) return `/requests/${requestId}`;
  return null;
}

function EventIcon({ type }: { type: string }) {
  const s = { width: 16, height: 16, flexShrink: 0 };
  if (type.startsWith('ticket'))  return <Ticket  {...s} style={{ ...s, color: '#ff5e3a' }} />;
  if (type.startsWith('request')) return <FileText {...s} style={{ ...s, color: '#0e2235' }} />;
  if (type.startsWith('meeting')) return <Calendar {...s} style={{ ...s, color: '#7c3aed' }} />;
  return <Bell {...s} style={{ ...s, color: '#94a3b8' }} />;
}

function groupByDate(list: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const groups: Record<string, AppNotification[]> = {};

  list.forEach(n => {
    const d = new Date(n.created_at); d.setHours(0,0,0,0);
    let key: string;
    if (d.getTime() === today.getTime())     key = 'Hoy';
    else if (d.getTime() === yesterday.getTime()) key = 'Ayer';
    else key = fmtDate(n.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter();
  const qc     = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey:        ['notifications-me'],
    queryFn:         notificationsService.getMyNotifications,
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const notifications = data?.notifications ?? [];
  const unread        = data?.unread_count  ?? 0;

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });
  const markAllMut = useMutation({
    mutationFn: notificationsService.markAllAsRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => notificationsService.dismiss(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });
  const dismissAllReadMut = useMutation({
    mutationFn: notificationsService.dismissAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });

  function handleClick(n: AppNotification) {
    if (n.status === 'pending') markReadMut.mutate(n.id);
    const href = getHref(n);
    if (href) router.push(href);
  }

  const groups     = groupByDate(notifications);
  const hasRead    = notifications.some(n => n.status === 'sent');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Bell size={20} color="#0e2235" />
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0e2235', margin: 0 }}>
              Notificaciones
            </h1>
            {unread > 0 && (
              <span style={{
                background: '#ff5e3a', color: '#fff', borderRadius: 12,
                fontSize: 11, fontWeight: 700, padding: '1px 7px', lineHeight: '18px',
              }}>
                {unread} nueva{unread !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
            Historial completo de actividad del sistema
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {unread > 0 && (
            <button
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                background: '#0e2235', color: '#fff', border: 'none', borderRadius: 4,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <CheckCheck size={14} />
              Marcar todo leído
            </button>
          )}
          {hasRead && (
            <button
              onClick={() => dismissAllReadMut.mutate()}
              disabled={dismissAllReadMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
                borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <Trash2 size={14} />
              Limpiar leídas
            </button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #e2e8f0', marginBottom: 24 }} />

      {/* Content */}
      {isLoading && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
          Cargando notificaciones…
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <Bell size={40} color="#e2e8f0" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, color: '#94a3b8', margin: 0 }}>Sin notificaciones</p>
          <p style={{ fontSize: 13, color: '#cbd5e1', margin: '4px 0 0' }}>
            Las actividades del sistema aparecerán aquí
          </p>
        </div>
      )}

      {!isLoading && groups.map(({ label, items }) => (
        <div key={label} style={{ marginBottom: 24 }}>
          {/* Group label */}
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 8, padding: '0 2px',
          }}>
            {label}
          </div>

          {/* Group items */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
            {items.map((n, idx) => {
              const isUnread = n.status === 'pending';
              const href     = getHref(n);
              const msg      = getMessage(n);

              return (
                <div
                  key={n.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 16px',
                    borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none',
                    background: isUnread ? '#fafbff' : '#fff',
                    cursor: href ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (href) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isUnread ? '#fafbff' : '#fff'; }}
                  onClick={() => handleClick(n)}
                >
                  {/* Unread dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: isUnread ? '#ff5e3a' : 'transparent',
                    border: isUnread ? 'none' : '1.5px solid #e2e8f0',
                  }} />

                  {/* Icon */}
                  <div style={{ marginTop: 1, flexShrink: 0 }}>
                    <EventIcon type={n.event_type} />
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: msg ? 3 : 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: isUnread ? 600 : 500,
                        color: isUnread ? '#0e2235' : '#334155',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {getLabel(n)}
                      </span>
                      {href && <ExternalLink size={11} color="#94a3b8" style={{ flexShrink: 0 }} />}
                    </div>
                    {msg && (
                      <p style={{
                        fontSize: 12, color: '#64748b', margin: 0,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {msg}
                      </p>
                    )}
                  </div>

                  {/* Meta: time + dismiss */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {fmtRelative(n.created_at)}
                    </span>
                    <button
                      type="button"
                      title="Descartar"
                      onClick={e => { e.stopPropagation(); dismissMut.mutate(n.id); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#cbd5e1', padding: '2px', lineHeight: 1,
                        display: 'flex', alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
