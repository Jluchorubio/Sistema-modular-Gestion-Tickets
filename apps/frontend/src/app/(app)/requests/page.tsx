'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  requestsService,
  type AdmRequest,
  type RequestType,
  type RequestStatus,
  type RequestPriority,
  type RequestTimelineEntry,
} from '@/services/requests.service';
import {
  REQUEST_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_COLORS,
  REQUEST_PRIORITIES,
} from '@/constants/requests';
import { useAuthStore } from '@/stores/auth.store';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import styles from './requests.module.css';
import mstyles from '@/components/ui/modal.module.css';

/* ── Constants ─────────────────────────────────────────────────────────────── */
const STATUS_PILL: Record<string, string> = {
  pending:      styles.pillPending,
  under_review: styles.pillUnderReview,
  approved:     styles.pillApproved,
  rejected:     styles.pillRejected,
  cancelled:    styles.pillCancelled,
};

/* ── Schemas ─────────────────────────────────────────────────────────────── */
const createSchema = z.object({
  type:        z.enum(['role_change', 'module_access', 'info_correction', 'sede_change',
                        'permission_adjustment', 'account_issue', 'reactivation', 'other']),
  priority:    z.enum(['baja', 'media', 'alta', 'critica']),
  title:       z.string().min(5, 'Mínimo 5 caracteres'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
});
type CreateForm = z.infer<typeof createSchema>;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return 'Hace un momento';
  if (diff < 3_600_000)  return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)}h`;
  return fmtDate(iso);
}

const TIMELINE_ACTION_LABELS: Record<string, string> = {
  created:             'Solicitud creada',
  reviewed_under_review: 'Puesta en revisión',
  reviewed_approved:   'Aprobada',
  reviewed_rejected:   'Rechazada',
  cancelled:           'Cancelada por el solicitante',
};

/* ── Timeline ─────────────────────────────────────────────────────────────── */
function TimelinePanel({ requestId }: { requestId: string }) {
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
              style={{ background: e.new_status ? REQUEST_STATUS_COLORS[e.new_status] : '#6366F1' }}
            />
            {i < entries.length - 1 && <div className={styles.timelineLine} />}
          </div>
          <div className={styles.timelineContent}>
            <div className={styles.timelineAction}>
              {TIMELINE_ACTION_LABELS[e.action] ?? e.action}
            </div>
            <div className={styles.timelineMeta}>
              {e.actor_name} · {fmtRelative(e.created_at)}
            </div>
            {e.notes && <div className={styles.timelineNotes}>"{e.notes}"</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function RequestsPage() {
  const qc           = useQueryClient();
  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  /* ── Filter state ── */
  const [statusFilter, setStatusFilter] = useState<RequestStatus | ''>('');
  const [typeFilter,   setTypeFilter]   = useState<RequestType   | ''>('');
  const [onlyMine,     setOnlyMine]     = useState(false);

  /* ── Modal state ── */
  const [createOpen,    setCreateOpen]    = useState(false);
  const [serverMsg,     setServerMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [rejectOpen,    setRejectOpen]    = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [rejectNotes,   setRejectNotes]   = useState('');
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [cancelTarget,  setCancelTarget]  = useState<string | null>(null);

  /* ── Query ── */
  const queryKey = isSuperadmin && !onlyMine
    ? ['requests', { statusFilter, typeFilter }]
    : ['requests', 'mine'];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      isSuperadmin && !onlyMine
        ? requestsService.getAll({ status: statusFilter, type: typeFilter })
        : requestsService.getMine(),
  });

  /* ── Create form ── */
  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { type: 'role_change', priority: 'media', title: '', description: '' },
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: (dto: CreateForm) => requestsService.create(dto),
    onSuccess: () => {
      setServerMsg({ ok: true, text: 'Solicitud enviada' });
      qc.invalidateQueries({ queryKey: ['requests'] });
      setTimeout(() => { setCreateOpen(false); reset(); setServerMsg(null); }, 800);
    },
    onError: (e: Error) => setServerMsg({ ok: false, text: e.message ?? 'Error al enviar' }),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: RequestStatus; notes?: string }) =>
      requestsService.review(id, status, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => requestsService.cancel(id),
    onSuccess: () => {
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  /* ── Handlers ── */
  const handleReview = useCallback((req: AdmRequest, status: RequestStatus) => {
    if (status === 'rejected') {
      setRejectTarget(req.id);
      setRejectNotes('');
      setRejectOpen(true);
    } else {
      reviewMut.mutate({ id: req.id, status });
    }
  }, [reviewMut]);

  const confirmReject = useCallback(() => {
    if (!rejectTarget) return;
    reviewMut.mutate({ id: rejectTarget, status: 'rejected', notes: rejectNotes || undefined });
    setRejectOpen(false);
    setRejectTarget(null);
  }, [rejectTarget, rejectNotes, reviewMut]);

  const openCreate = useCallback(() => {
    reset();
    setServerMsg(null);
    setCreateOpen(true);
  }, [reset]);

  /* ── Render ── */
  const rows        = data?.data ?? [];
  const total       = data?.meta.total ?? rows.length;
  const showActions = isSuperadmin && !onlyMine;

  return (
    <>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Solicitudes</div>
          {data && (
            <div className={styles.count}>
              {total} solicitud{total !== 1 ? 'es' : ''}
            </div>
          )}
        </div>
        <button className={styles.btnPrimary} onClick={openCreate}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Nueva solicitud
        </button>
      </div>

      {/* Admin filter bar */}
      {isSuperadmin && (
        <div className={styles.filterBar}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as RequestStatus | '')}
          >
            <option value="">Estado: Todos</option>
            <option value="pending">Pendiente</option>
            <option value="under_review">En revisión</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as RequestType | '')}
          >
            <option value="">Tipo: Todos</option>
            {REQUEST_TYPES.map(t => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
            ))}
          </select>

          <label className={styles.onlyMine}>
            <input
              type="checkbox"
              className={styles.onlyMineCb}
              checked={onlyMine}
              onChange={e => setOnlyMine(e.target.checked)}
            />
            Solo las mías
          </label>
        </div>
      )}

      {/* List */}
      {isLoading && <Spinner />}
      {error     && <div className={styles.errorMsg}>Error cargando solicitudes</div>}

      {!isLoading && !error && rows.length === 0 && (
        <div className={styles.emptyMsg}>No hay solicitudes.</div>
      )}

      {rows.map(req => {
        const isExpanded = expandedId === req.id;
        const canCancel  = !isSuperadmin && ['pending', 'under_review'].includes(req.status);

        return (
          <div key={req.id} className={styles.card}>
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
                  <span style={{ fontSize: 11, color: '#64748B' }}>
                    {REQUEST_PRIORITY_LABELS[req.priority]}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`${styles.pill} ${STATUS_PILL[req.status] ?? ''}`}>
                  {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                </span>
                {canCancel && (
                  <button
                    className={styles.cancelBtn}
                    title="Cancelar solicitud"
                    onClick={() => setCancelTarget(req.id)}
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  className={styles.expandBtn}
                  title={isExpanded ? 'Ocultar historial' : 'Ver historial'}
                  onClick={() => setExpandedId(isExpanded ? null : req.id)}
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

            {showActions && req.status === 'pending' && (
              <div className={styles.reviewActions}>
                <button
                  className={`${styles.reviewBtn} ${styles.reviewBtnPending}`}
                  onClick={() => handleReview(req, 'under_review')}
                  disabled={reviewMut.isPending}
                >
                  En revisión
                </button>
                <button
                  className={`${styles.reviewBtn} ${styles.reviewBtnApprove}`}
                  onClick={() => handleReview(req, 'approved')}
                  disabled={reviewMut.isPending}
                >
                  Aprobar
                </button>
                <button
                  className={`${styles.reviewBtn} ${styles.reviewBtnReject}`}
                  onClick={() => handleReview(req, 'rejected')}
                  disabled={reviewMut.isPending}
                >
                  Rechazar
                </button>
              </div>
            )}

            {isExpanded && (
              <div className={styles.timelineWrap}>
                <TimelinePanel requestId={req.id} />
              </div>
            )}
          </div>
        );
      })}

      {/* Create modal */}
      <Modal open={createOpen} title="Nueva solicitud" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleSubmit(data => { setServerMsg(null); createMut.mutate(data); })}>
          <label className={mstyles.fieldLabel}>Tipo de solicitud</label>
          <select className={mstyles.fieldInput} {...register('type')}>
            {REQUEST_TYPES.map(t => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
            ))}
          </select>

          <label className={mstyles.fieldLabel}>Prioridad</label>
          <select className={mstyles.fieldInput} {...register('priority')}>
            {REQUEST_PRIORITIES.map(p => (
              <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>
            ))}
          </select>

          <label className={mstyles.fieldLabel}>Título *</label>
          <input
            className={mstyles.fieldInput}
            placeholder="Resumen breve de tu solicitud…"
            {...register('title')}
          />
          {errors.title && (
            <div className={mstyles.msgErr} style={{ padding: '6px 10px', marginTop: 4 }}>
              {errors.title.message}
            </div>
          )}

          <label className={mstyles.fieldLabel}>Descripción *</label>
          <textarea
            className={mstyles.fieldInput}
            placeholder="Explica tu solicitud con detalle…"
            style={{ minHeight: 100, resize: 'vertical' }}
            {...register('description')}
          />
          {errors.description && (
            <div className={mstyles.msgErr} style={{ padding: '6px 10px', marginTop: 4 }}>
              {errors.description.message}
            </div>
          )}

          {serverMsg && (
            <div className={serverMsg.ok ? mstyles.msgOk : mstyles.msgErr}>
              {serverMsg.text}
            </div>
          )}

          <div className={mstyles.actions}>
            <button type="button" className={mstyles.actCancel} onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button
              type="submit"
              className={mstyles.actConfirm}
              disabled={isSubmitting || createMut.isPending}
            >
              Enviar solicitud
            </button>
          </div>
        </form>
      </Modal>

      {/* Reject notes modal */}
      <Modal open={rejectOpen} title="Rechazar solicitud" onClose={() => setRejectOpen(false)}>
        <div style={{ padding: '0 0 4px' }}>
          <label className={mstyles.fieldLabel}>Motivo del rechazo (opcional)</label>
          <textarea
            className={styles.rejectNotes}
            placeholder="Explica el motivo del rechazo…"
            value={rejectNotes}
            onChange={e => setRejectNotes(e.target.value)}
          />
        </div>
        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => setRejectOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={mstyles.actDanger}
            onClick={confirmReject}
            disabled={reviewMut.isPending}
          >
            Confirmar rechazo
          </button>
        </div>
      </Modal>

      {/* Cancel confirm modal */}
      <Modal open={!!cancelTarget} title="Cancelar solicitud" onClose={() => setCancelTarget(null)}>
        <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
          ¿Seguro que quieres cancelar esta solicitud? Esta acción no se puede deshacer.
        </p>
        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => setCancelTarget(null)}>
            Volver
          </button>
          <button
            type="button"
            className={mstyles.actDanger}
            onClick={() => cancelTarget && cancelMut.mutate(cancelTarget)}
            disabled={cancelMut.isPending}
          >
            Confirmar cancelación
          </button>
        </div>
      </Modal>
    </>
  );
}
