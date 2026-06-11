'use client';

import { useState }                                        from 'react';
import { useRouter }                                       from 'next/navigation';
import { Bell, CheckCheck, Trash2, ExternalLink,
         Ticket, FileText, Calendar }                      from 'lucide-react';
import { useQuery, useMutation, useQueryClient }           from '@tanstack/react-query';
import { notificationsService, type AppNotification }     from '@/services/notifications.service';
import { fmtRelative, fmtDate }                            from '@/lib/formatters';
import { ContextNav }                                       from '@/components/ui/ContextNav';
import styles                                              from './notifications.module.css';

/* ── Constants ────────────────────────────────────────────────────────────── */

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

type FilterType = 'all' | 'unread' | 'ticket' | 'request' | 'meeting' | 'dismissed';

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all',       label: 'Todos'        },
  { value: 'unread',    label: 'No leídas'    },
  { value: 'ticket',    label: 'Tickets'      },
  { value: 'request',   label: 'Solicitudes'  },
  { value: 'meeting',   label: 'Reuniones'    },
  { value: 'dismissed', label: 'Descartadas'  },
];

/* ── Helpers ──────────────────────────────────────────────────────────────── */

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
  const { ticketId, requestId } = n.payload as Record<string, string | undefined>;
  if (ticketId)  return `/helpdesk/ticket/${ticketId}`;
  if (requestId) return `/requests/${requestId}`;
  return null;
}

function getTypeKey(event: string): 'ticket' | 'request' | 'meeting' | 'default' {
  if (event.startsWith('ticket'))  return 'ticket';
  if (event.startsWith('request')) return 'request';
  if (event.startsWith('meeting')) return 'meeting';
  return 'default';
}

const TYPE_PILL_CLS: Record<string, string> = {
  ticket:  styles.typePillTicket,
  request: styles.typePillRequest,
  meeting: styles.typePillMeeting,
  default: styles.typePillDefault,
};

const TYPE_ICON_CLS: Record<string, string> = {
  ticket:  styles.iconTicket,
  request: styles.iconRequest,
  meeting: styles.iconMeeting,
  default: styles.iconDefault,
};

const TYPE_LABEL: Record<string, string> = {
  ticket:  'Ticket',
  request: 'Solicitud',
  meeting: 'Reunión',
  default: 'Sistema',
};

function EventIcon({ type }: { type: string }) {
  if (type === 'ticket')  return <Ticket   size={15} color="#ff5e3a" />;
  if (type === 'request') return <FileText size={15} color="#0e2235" />;
  if (type === 'meeting') return <Calendar size={15} color="#7c3aed" />;
  return <Bell size={15} color="#94a3b8" />;
}

function groupByDate(list: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const groups: Record<string, AppNotification[]> = {};

  list.forEach(n => {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    let key: string;
    if      (d.getTime() === today.getTime())     key = 'Hoy';
    else if (d.getTime() === yesterday.getTime()) key = 'Ayer';
    else                                           key = fmtDate(n.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading } = useQuery({
    queryKey:        ['notifications-history'],
    queryFn:         notificationsService.getAllNotifications,
    refetchInterval: 60_000,
    staleTime:       30_000,
  });

  const notifications = data?.notifications ?? [];
  const unread        = data?.unread_count  ?? 0;

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-history'] }),
  });
  const markAllMut = useMutation({
    mutationFn: notificationsService.markAllAsRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-history'] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => notificationsService.dismiss(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-history'] }),
  });
  const dismissAllReadMut = useMutation({
    mutationFn: notificationsService.dismissAllRead,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications-history'] }),
  });

  function handleClick(n: AppNotification) {
    if (n.status === 'pending') markReadMut.mutate(n.id);
    const href = getHref(n);
    if (href) router.push(href);
  }

  const filtered = notifications.filter(n => {
    const isDismissed = !!n.dismissed_at;
    if (filter === 'dismissed') return isDismissed;
    if (isDismissed)            return false;
    if (filter === 'all')       return true;
    if (filter === 'unread')    return n.status === 'pending';
    return n.event_type.startsWith(filter);
  });

  const groups      = groupByDate(filtered);
  const hasRead     = notifications.some(n => n.status === 'sent' && !n.dismissed_at);
  const dismissedCt = notifications.filter(n => !!n.dismissed_at).length;

  return (
    <div className={styles.pageWrap}>
      <ContextNav
        back
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Notificaciones' },
        ]}
      />
      <div className={styles.pageContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleRow}>
              <Bell size={20} color="#0e2235" />
              <h1 className={styles.title}>Notificaciones</h1>
              {unread > 0 && (
                <span className={styles.unreadBadge}>
                  {unread} nueva{unread !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className={styles.subtitle}>Historial completo de actividad del sistema</p>
          </div>

          <div className={styles.headerActions}>
            {unread > 0 && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
              >
                <CheckCheck size={13} />
                Marcar todo leído
              </button>
            )}
            {hasRead && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => dismissAllReadMut.mutate()}
                disabled={dismissAllReadMut.isPending}
              >
                <Trash2 size={13} />
                Limpiar leídas
              </button>
            )}
          </div>
        </div>

        {/* ── Stats chips ── */}
        {!isLoading && (
          <div className={styles.statsRow}>
            <div className={styles.statChip}>
              <span className={styles.statValue}>{notifications.length}</span>
              <span className={styles.statLabel}>Total</span>
            </div>
            <div className={`${styles.statChip} ${unread > 0 ? styles.statChipHighlight : ''}`}>
              <span className={styles.statValue}>{unread}</span>
              <span className={styles.statLabel}>Sin leer</span>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statValue}>
                {notifications.filter(n => n.event_type.startsWith('ticket')).length}
              </span>
              <span className={styles.statLabel}>Tickets</span>
            </div>
            {dismissedCt > 0 && (
              <div className={styles.statChip}>
                <span className={styles.statValue}>{dismissedCt}</span>
                <span className={styles.statLabel}>Archivadas</span>
              </div>
            )}
          </div>
        )}

        {/* ── Filters ── */}
        <div className={styles.filters}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              className={`${styles.filterBtn} ${filter === f.value ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {isLoading && (
          <div className={styles.loader}>Cargando notificaciones…</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className={styles.empty}>
            <Bell size={40} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>
              {filter === 'all' ? 'Sin notificaciones' : 'Sin resultados'}
            </p>
            <p className={styles.emptyDesc}>
              {filter === 'all'
                ? 'Las actividades del sistema aparecerán aquí'
                : filter === 'dismissed'
                  ? 'No has descartado ninguna notificación'
                  : 'No hay notificaciones para este filtro'}
            </p>
          </div>
        )}

        {!isLoading && groups.map(({ label, items }) => (
          <div key={label} className={styles.group}>
            <div className={styles.groupLabel}>{label}</div>

            <div className={styles.surface}>
              {items.map(n => {
                const isUnread  = n.status === 'pending';
                const href      = getHref(n);
                const msg       = getMessage(n);
                const typeKey   = getTypeKey(n.event_type);

                return (
                  <div
                    key={n.id}
                    className={[
                      styles.item,
                      isUnread             ? styles.itemUnread    : '',
                      href                 ? styles.itemClickable : '',
                      !!n.dismissed_at     ? styles.itemDismissed : '',
                    ].join(' ')}
                    onClick={() => handleClick(n)}
                  >
                    {/* Unread dot */}
                    <div className={`${styles.dot} ${isUnread ? styles.dotUnread : styles.dotRead}`} />

                    {/* Type icon */}
                    <div className={`${styles.iconWrap} ${TYPE_ICON_CLS[typeKey]}`}>
                      <EventIcon type={typeKey} />
                    </div>

                    {/* Body */}
                    <div className={styles.body}>
                      <div className={styles.bodyTop}>
                        <span className={`${styles.typePill} ${TYPE_PILL_CLS[typeKey]}`}>
                          {TYPE_LABEL[typeKey]}
                        </span>
                        <span className={`${styles.label} ${isUnread ? '' : styles.labelRead}`}>
                          {getLabel(n)}
                        </span>
                        {href && <ExternalLink size={10} color="#94a3b8" style={{ flexShrink: 0 }} />}
                      </div>
                      {msg && <p className={styles.msg}>{msg}</p>}
                    </div>

                    {/* Meta */}
                    <div className={styles.meta}>
                      <span className={styles.time}>{fmtRelative(n.created_at)}</span>
                      <button
                        type="button"
                        title="Descartar"
                        className={styles.dismissBtn}
                        onClick={e => { e.stopPropagation(); dismissMut.mutate(n.id); }}
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
    </div>
  );
}
