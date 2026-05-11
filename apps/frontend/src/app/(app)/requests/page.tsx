'use client';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { requestsService, type AdmRequest, type RequestType, type RequestStatus } from '@/services/requests.service';
import { REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS, REQUEST_TYPES } from '@/constants/requests';
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
};

/* ── Schemas ─────────────────────────────────────────────────────────────── */
const createSchema = z.object({
  type:        z.enum(['role_change', 'module_access', 'info_correction', 'sede_change',
                        'permission_adjustment', 'account_issue', 'reactivation', 'other']),
  title:       z.string().min(5, 'Mínimo 5 caracteres'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
});
type CreateForm = z.infer<typeof createSchema>;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [createOpen,  setCreateOpen]  = useState(false);
  const [serverMsg,   setServerMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes]  = useState('');

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
    defaultValues: { type: 'role_change', title: '', description: '' },
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
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? rows.length;
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

      {rows.map(req => (
        <div key={req.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.cardTitle}>{req.title}</div>
              <div className={styles.cardMeta}>
                <span className={styles.typeLabel}>{REQUEST_TYPE_LABELS[req.type] ?? req.type}</span>
                {req.requester_name && <><span>·</span><span>{req.requester_name}</span></>}
                <span>·</span>
                <span>{fmtDate(req.created_at)}</span>
              </div>
            </div>
            <span className={`${styles.pill} ${STATUS_PILL[req.status] ?? ''}`}>
              {REQUEST_STATUS_LABELS[req.status] ?? req.status}
            </span>
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
        </div>
      ))}

      {/* Create modal */}
      <Modal open={createOpen} title="Nueva solicitud" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleSubmit(data => { setServerMsg(null); createMut.mutate(data); })}>
          <label className={mstyles.fieldLabel}>Tipo de solicitud</label>
          <select className={mstyles.fieldInput} {...register('type')}>
            {REQUEST_TYPES.map(t => (
              <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
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
    </>
  );
}
