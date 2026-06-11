'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { requestsService, type AdmRequest, type RequestStatus } from '@/services/requests.service';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_COLORS, REQUEST_TYPE_LABELS } from '@/constants/requests';
import { type CalendarRole, SRC_COLORS } from './_types';
import styles from '../calendar.module.css';

interface PopupProps {
  req:       AdmRequest;
  role:      CalendarRole;
  onClose:   () => void;
  onRefresh: () => void;
  onAudit:   (cat: string, msg: string) => void;
}

export function EventDetailPopup({ req, role, onClose, onRefresh, onAudit }: PopupProps) {
  const qc        = useQueryClient();
  const isTask    = req.type === 'task';
  const isSysTask = isTask && req.task_source === 'system';
  const canReview = !isTask && (role === 'superadmin' || role === 'admin');
  const canCancel = !isTask && role === 'user' && ['pending', 'under_review'].includes(req.status);
  const canComplete   = isTask && !isSysTask && req.status === 'pending';
  const canCancelTask = isTask && !isSysTask && req.status === 'pending';
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject,  setShowReject]  = useState(false);

  const reviewMut = useMutation({
    mutationFn: ({ status, notes }: { status: RequestStatus; notes?: string }) =>
      requestsService.review(req.id, status, notes),
    onSuccess: (_, v) => { onAudit('REVISIÓN', `"${req.title}" → ${v.status}.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });
  const cancelMut = useMutation({
    mutationFn: () => requestsService.cancel(req.id),
    onSuccess: () => { onAudit('CANCELACIÓN', `"${req.title}" cancelada.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });
  const completeMut = useMutation({
    mutationFn: () => requestsService.completeTask(req.id),
    onSuccess: () => { onAudit('COMPLETADO', `Tarea "${req.title}" completada.`); qc.invalidateQueries({ queryKey: ['calendar-requests'] }); onRefresh(); onClose(); },
  });

  const statusColor = REQUEST_STATUS_COLORS[req.status]    ?? '#94a3b8';
  const prioColor   = REQUEST_PRIORITY_COLORS[req.priority] ?? '#94a3b8';
  const srcColor    = isTask ? (isSysTask ? SRC_COLORS.system_task : SRC_COLORS.user_task) : null;
  const dueDate     = req.metadata?.due_date ? String(req.metadata.due_date) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose} style={{ position: 'absolute', top: 14, right: 14 }}><X size={15} /></button>
        <div className={styles.popupType}>
          {isTask ? (isSysTask ? '⚙ Tarea del sistema' : '✓ Tarea personal') : (REQUEST_TYPE_LABELS[req.type] ?? req.type)}
        </div>
        <div className={styles.popupTitle}>{req.title}</div>
        <div className={styles.badgeRow}>
          {srcColor && <span className={styles.badge} style={{ background: `${srcColor}22`, color: srcColor, border: `1px solid ${srcColor}44` }}>{isSysTask ? 'Sistema' : 'Personal'}</span>}
          <span className={styles.badge} style={{ background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}44` }}>{REQUEST_STATUS_LABELS[req.status] ?? req.status}</span>
          <span className={styles.badge} style={{ border: `1.5px solid ${prioColor}`, color: prioColor }}>{REQUEST_PRIORITY_LABELS[req.priority] ?? req.priority}</span>
        </div>
        {req.description && <p className={styles.popupDesc}>{req.description}</p>}
        <div className={styles.popupMeta}>
          {dueDate
            ? <span>Fecha límite: {new Date(dueDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            : <span>{new Date(req.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
          {req.requester_name && <span>Por: {req.requester_name}</span>}
          {req.reviewer_name  && <span>Revisado por: {req.reviewer_name}</span>}
        </div>
        {req.review_notes && <div className={styles.popupNotes}><strong>Notas:</strong> {req.review_notes}</div>}
        {canComplete && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnApprove}`} onClick={() => completeMut.mutate()} disabled={completeMut.isPending}><CheckCircle2 size={13} /> Completar tarea</button>
          </div>
        )}
        {canCancelTask && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}><XCircle size={13} /> Eliminar tarea</button>
          </div>
        )}
        {canReview && ['pending', 'under_review'].includes(req.status) && !showReject && (
          <div className={styles.popupActions}>
            {req.status === 'pending' && (
              <button className={`${styles.pBtn} ${styles.pBtnReview}`} onClick={() => reviewMut.mutate({ status: 'under_review' })} disabled={reviewMut.isPending}><Clock size={13} /> En revisión</button>
            )}
            <button className={`${styles.pBtn} ${styles.pBtnApprove}`} onClick={() => reviewMut.mutate({ status: 'approved' })} disabled={reviewMut.isPending}><CheckCircle2 size={13} /> Aprobar</button>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => setShowReject(true)} disabled={reviewMut.isPending}><XCircle size={13} /> Rechazar</button>
          </div>
        )}
        {showReject && (
          <div className={styles.rejectBox}>
            <textarea className={styles.rejectTextarea} placeholder="Motivo del rechazo (opcional)…" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
            <div className={styles.popupActions}>
              <button className={`${styles.pBtn} ${styles.pBtnCancel}`} onClick={() => setShowReject(false)}>Cancelar</button>
              <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => reviewMut.mutate({ status: 'rejected', notes: rejectNotes || undefined })} disabled={reviewMut.isPending}>Confirmar rechazo</button>
            </div>
          </div>
        )}
        {canCancel && (
          <div className={styles.popupActions}>
            <button className={`${styles.pBtn} ${styles.pBtnReject}`} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}><XCircle size={13} /> Cancelar solicitud</button>
          </div>
        )}
      </div>
    </div>
  );
}
