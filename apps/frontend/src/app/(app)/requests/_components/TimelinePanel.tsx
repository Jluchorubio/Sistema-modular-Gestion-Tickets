'use client';
import { useQuery } from '@tanstack/react-query';
import { requestsService, type RequestTimelineEntry } from '@/services/requests.service';
import { REQUEST_STATUS_COLORS } from '@/constants/requests';
import { fmtRelative } from '@/lib/formatters';
import { Spinner } from '@/components/ui/Spinner';
import styles from '../requests.module.css';

const TIMELINE_ACTION_LABELS: Record<string, string> = {
  created:               'Solicitud creada',
  taken:                 'Tomada por admin',
  progress_in_progress:  'Puesta en proceso',
  progress_completed:    'Finalizada',
  reviewed_under_review: 'Puesta en revisión',
  reviewed_approved:     'Aprobada',
  reviewed_rejected:     'Rechazada',
  cancelled:             'Cancelada por el solicitante',
  escalated:             'Escalada al superadmin',
  deescalated:           'Escalación resuelta',
};

export function TimelinePanel({ requestId }: { requestId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['request-timeline', requestId],
    queryFn:  () => requestsService.getTimeline(requestId),
    staleTime: 30_000,
  });

  if (isLoading) return <div style={{ padding: '12px 0', textAlign: 'center' }}><Spinner /></div>;

  const entries: RequestTimelineEntry[] = data ?? [];

  return (
    <div className={styles.timeline}>
      {entries.map((e, i) => (
        <div key={e.id} className={styles.timelineEntry}>
          <div className={styles.timelineDotWrap}>
            <div
              className={styles.timelineDot}
              style={{ background: e.new_status ? (REQUEST_STATUS_COLORS[e.new_status] ?? 'var(--status-info-text, #1d4ed8)') : 'var(--status-info-text, #1d4ed8)' }}
            />
            {i < entries.length - 1 && <div className={styles.timelineLine} />}
          </div>
          <div className={styles.timelineContent}>
            <div className={styles.timelineAction}>{TIMELINE_ACTION_LABELS[e.action] ?? e.action}</div>
            <div className={styles.timelineMeta}>{e.actor_name} · {fmtRelative(e.created_at)}</div>
            {e.notes && <div className={styles.timelineNotes}>"{e.notes}"</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
