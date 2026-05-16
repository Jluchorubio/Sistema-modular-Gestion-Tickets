import {
  ChevronDown, ChevronUp, X, Play,
  Loader2, CheckCircle2, TrendingUp, TrendingDown,
} from 'lucide-react';
import { type AdmRequest } from '@/services/requests.service';
import {
  REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_COLORS,
} from '@/constants/requests';
import { fmtDate } from '@/lib/formatters';
import { SlaCountdown } from './SlaCountdown';
import { TimelinePanel } from './TimelinePanel';
import styles from '../requests.module.css';

const STATUS_PILL: Record<string, string> = {
  pending:      styles.pillPending,
  taken:        styles.pillTaken,
  in_progress:  styles.pillUnderReview,
  completed:    styles.pillApproved,
  under_review: styles.pillUnderReview,
  approved:     styles.pillApproved,
  rejected:     styles.pillRejected,
  cancelled:    styles.pillCancelled,
};

interface Props {
  req:                 AdmRequest;
  isExpanded:          boolean;
  showAdminActions:    boolean;
  isSuperadmin:        boolean;
  activeTab:           'mine' | 'inbox';
  onToggleExpand:      () => void;
  onCancel:            () => void;
  onTake:              () => void;
  onProgress:          (status: 'in_progress' | 'completed') => void;
  onReject:            () => void;
  onEscalate:          () => void;
  onDeescalate:        () => void;
  isTakePending:       boolean;
  isProgressPending:   boolean;
  isReviewPending:     boolean;
  isDeescalatePending: boolean;
}

export function RequestCard({
  req, isExpanded, showAdminActions, isSuperadmin, activeTab,
  onToggleExpand, onCancel, onTake, onProgress, onReject, onEscalate, onDeescalate,
  isTakePending, isProgressPending, isReviewPending, isDeescalatePending,
}: Props) {
  const statusColor   = REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
  const hasSla        = (req.status === 'taken' || req.status === 'in_progress') && req.sla_due_at;
  const isEscalated   = req.escalated === true;
  const canCancel     = !isSuperadmin && activeTab === 'mine' && ['pending', 'under_review'].includes(req.status);
  const canEscalate   = showAdminActions && !isEscalated && ['pending', 'taken', 'in_progress', 'under_review'].includes(req.status);
  const canDeescalate = isSuperadmin && isEscalated;

  return (
    <div
      className={styles.card}
      style={isEscalated ? { borderColor: '#F97316', boxShadow: '0 0 0 1px #F9731644' } : undefined}
    >
      {isEscalated && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', background: '#431407', borderBottom: '1px solid #7c2d12',
          fontSize: 11, fontWeight: 700, color: '#FB923C', borderRadius: '8px 8px 0 0',
        }}>
          <TrendingUp size={11} />
          ESCALADA{req.escalated_by_name ? ` por ${req.escalated_by_name}` : ''}
          {req.escalation_note && (
            <span style={{ fontWeight: 400, color: '#FED7AA' }}>· "{req.escalation_note}"</span>
          )}
        </div>
      )}

      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitle}>{req.title}</div>
          <div className={styles.cardMeta}>
            <span className={styles.typeLabel}>{REQUEST_TYPE_LABELS[req.type] ?? req.type}</span>
            {req.requester_name && <><span>·</span><span>{req.requester_name}</span></>}
            <span>·</span>
            <span>{fmtDate(req.created_at)}</span>
            <span>·</span>
            <span
              className={styles.priorityDot}
              style={{ background: REQUEST_PRIORITY_COLORS[req.priority] }}
              title={`Prioridad: ${REQUEST_PRIORITY_LABELS[req.priority]}`}
            />
            <span style={{ fontSize: 11, color: '#64748B' }}>{REQUEST_PRIORITY_LABELS[req.priority]}</span>
            {req.taken_by_name && (
              <><span>·</span><span style={{ fontSize: 11, color: '#8B5CF6' }}>Tomado por {req.taken_by_name}</span></>
            )}
          </div>
          {hasSla && <div style={{ marginTop: 6 }}><SlaCountdown sla_due_at={req.sla_due_at!} /></div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span
            className={`${styles.pill} ${STATUS_PILL[req.status] ?? ''}`}
            style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}
          >
            {REQUEST_STATUS_LABELS[req.status] ?? req.status}
          </span>
          {canCancel && (
            <button className={styles.cancelBtn} title="Cancelar solicitud" onClick={onCancel}>
              <X size={13} />
            </button>
          )}
          <button
            className={styles.expandBtn}
            title={isExpanded ? 'Ocultar historial' : 'Ver historial'}
            onClick={onToggleExpand}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div className={styles.cardDesc}>{req.description}</div>

      {req.reviewer_name && (
        <div className={styles.cardReview}>
          Revisado por <strong>{req.reviewer_name}</strong>
          {req.review_notes && ` · "${req.review_notes}"`}
        </div>
      )}

      {showAdminActions && req.type !== 'task' && (
        <div className={styles.reviewActions}>
          {req.status === 'pending' && (
            <>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnPending}`}
                style={{ background: '#4C1D95', color: '#DDD6FE', border: '1px solid #6D28D9' }}
                onClick={onTake}
                disabled={isTakePending}
              >
                <Play size={12} /> Tomar solicitud
              </button>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnReject}`}
                onClick={onReject}
                disabled={isReviewPending}
              >
                <X size={12} /> Rechazar
              </button>
            </>
          )}
          {req.status === 'taken' && (
            <>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnPending}`}
                onClick={() => onProgress('in_progress')}
                disabled={isProgressPending}
              >
                <Loader2 size={12} /> En proceso
              </button>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnApprove}`}
                onClick={() => onProgress('completed')}
                disabled={isProgressPending}
              >
                <CheckCircle2 size={12} /> Finalizar
              </button>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnReject}`}
                onClick={onReject}
                disabled={isReviewPending}
              >
                <X size={12} /> Rechazar
              </button>
            </>
          )}
          {req.status === 'in_progress' && (
            <>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnApprove}`}
                onClick={() => onProgress('completed')}
                disabled={isProgressPending}
              >
                <CheckCircle2 size={12} /> Finalizar
              </button>
              <button
                className={`${styles.reviewBtn} ${styles.reviewBtnReject}`}
                onClick={onReject}
                disabled={isReviewPending}
              >
                <X size={12} /> Rechazar
              </button>
            </>
          )}
          {canEscalate && (
            <button
              className={styles.reviewBtn}
              style={{ background: '#431407', color: '#FB923C', border: '1px solid #7c2d12' }}
              onClick={onEscalate}
            >
              <TrendingUp size={12} /> Escalar
            </button>
          )}
          {canDeescalate && (
            <button
              className={styles.reviewBtn}
              style={{ background: '#052e16', color: '#22C55E', border: '1px solid #14532d' }}
              onClick={onDeescalate}
              disabled={isDeescalatePending}
            >
              <TrendingDown size={12} /> Resolver escalación
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className={styles.timelineWrap}>
          <TimelinePanel requestId={req.id} />
        </div>
      )}
    </div>
  );
}
