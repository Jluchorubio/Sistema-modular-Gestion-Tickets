'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, ChevronDown, Clock, AlertTriangle, CheckCircle2, XCircle,
  Paperclip, Star, Monitor, ChevronUp,
} from 'lucide-react';
import { TicketTimeline } from './TicketTimeline';
import { TicketSidebar } from './TicketSidebar';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  ticketsService,
} from '@/services/tickets.service';
import { PermissionGate } from '@/components/auth/PermissionGate';
import styles from '../tickets.module.css';
import { useTicketData, type LocalGuest } from './hooks/useTicketData';
import { useTicketActions } from './hooks/useTicketActions';

/* ── Badges ──────────────────────────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

function StateBadge({ label, isFinal }: { label: string; isFinal: boolean }) {
  const color = isFinal ? '#22C55E' : '#6366F1';
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router      = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  /* ── Data hook ── */
  const {
    ticket, isLoading, isError, error,
    technicians,
    attachments,
    existingRating,
    comments,
    timeline, timelineLoading,
    meetings,
    relations,
    linkedAssets,
    slaColor, slaLabel, slaCountdown,
    ownerAssignment,
    computeAllGuests,
    qc,
  } = useTicketData({ ticketId, helpdeskId });


  /* ── Left panel state ── */
  const [replyText,       setReplyText]       = useState('');
  const [commentType,     setCommentType]     = useState<'public' | 'internal'>('public');

  /* ── Validation state ── */
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState('');
  const [isApproving,     setIsApproving]     = useState(false);
  const [isRejecting,     setIsRejecting]     = useState(false);
  const [validationError, setValidationError] = useState('');

  /* ── Force-reopen state ── */
  const [showReopenForm,  setShowReopenForm]  = useState(false);
  const [reopenReason,    setReopenReason]    = useState('');
  const [isReopening,     setIsReopening]     = useState(false);

  /* ── Guests (shared: instant call lives in sidebar, allGuests used here) ── */
  const [localGuests, setLocalGuests] = useState<LocalGuest[]>([]);

  /* ── Attachments ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');

  /* ── Rating state ── */
  const [ratingScore,   setRatingScore]   = useState(0);
  const [ratingHover,   setRatingHover]   = useState(0);
  const [ratingComment, setRatingComment] = useState('');

  /* ── Actions hook ── */
  const {
    uploadMut, deletAttMut, addCommentMut, rateMut, transMut,
    scheduleMut, cancelMeetMut, addRelMut, removeRelMut,
    handleInstantCall, removeGuest,
    handleApprove, handleAcceptAndRate, handleReject, handleFileChange,
  } = useTicketActions({
    ticketId, technicians, qc,
    replyText, commentType, setReplyText,
    ratingScore, ratingComment, rejectReason,
    setIsApproving, setIsRejecting, setValidationError,
    setShowRejectForm, setRejectReason,
    setUploadError, localGuests, setLocalGuests,
  });

  /* ── Computed guests ── */
  const allGuests = useMemo<LocalGuest[]>(
    () => computeAllGuests(ticket?.assignments, localGuests),
    [ticket?.assignments, localGuests],
  );

  /* ── UI state ── */
  const [descExpanded, setDescExpanded] = useState(false);

  /* ── Render ── */
  return (
    <div className={styles.hwPage}>
      {isLoading && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Cargando ticket…
        </div>
      )}

      {isError && (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <AlertTriangle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
            No se pudo cargar el ticket
          </p>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
            {(error as any)?.response?.status === 404
              ? 'El ticket no existe o fue eliminado.'
              : (error as any)?.response?.status === 403
              ? 'No tienes permiso para ver este ticket.'
              : 'Error de conexión. Intenta de nuevo.'}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', cursor: 'pointer' }}
          >
            Volver
          </button>
        </div>
      )}

      {ticket && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>


          {/* HEADER — sticky, 56px */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 20,
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            padding: '0 20px', height: 56,
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            {/* Back */}
            <button type="button" onClick={() => router.push('/helpdesk')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
              <ArrowLeft size={12} /> Volver
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
              <span>Mesa de Ayuda</span>
              <ChevronRight size={10} />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff5e3a', letterSpacing: '.03em' }}>
                #{ticket.id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            {/* State + SLA — centered */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
              <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
              {ticket.escalated && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                  ESCALADO
                </span>
              )}
              {(ticket.reprocess_count ?? 0) > 0 && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: '#fdf4ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}>
                  REINCIDENTE ×{ticket.reprocess_count}
                </span>
              )}
              {ticket.is_pause_state && ticket.history[0]?.transition_reason && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ⏸ {ticket.history[0].transition_reason}
                </span>
              )}
              {slaCountdown && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: `${slaColor}15`, color: slaColor, border: `1px solid ${slaColor}30`, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={9} /> {slaCountdown}
                </span>
              )}
            </div>

          </div>


          {/* 2-COLUMN BODY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', flex: 1, overflow: 'hidden' }}>

            {/* MAIN: banners + timeline + reply */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e2e8f0' }}>

              {/* TICKET DETAIL SECTION */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>

                {/* Title */}
                <h2 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#0e2235', lineHeight: 1.3 }}>
                  {ticket.title}
                </h2>

                {/* Meta chips row */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: ticket.description ? 10 : 0 }}>
                  <PriorityBadge priority={ticket.priority} />
                  {ticket.category_name && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                      {ticket.category_name}
                    </span>
                  )}
                  {ticket.damage_type_label && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
                      {ticket.damage_type_label}
                    </span>
                  )}
                  {ticket.environment_name && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                      {ticket.environment_name}
                    </span>
                  )}
                  {linkedAssets[0] && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: '#f5f3ff', color: '#5b21b6', border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Monitor size={9} /> {linkedAssets[0].name}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                    Solicitado por <strong style={{ color: '#475569' }}>{ticket.creator_name}</strong> · #{ticket.id.slice(0,8).toUpperCase()}
                  </span>
                </div>

                {/* Description (collapsible) */}
                {ticket.description && (
                  <div>
                    <p style={{
                      margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.6,
                      overflow: 'hidden',
                      display: '-webkit-box', WebkitLineClamp: descExpanded ? undefined : 3,
                      WebkitBoxOrient: 'vertical' as any,
                    } as React.CSSProperties}>
                      {ticket.description}
                    </p>
                    {ticket.description.length > 180 && (
                      <button type="button" onClick={() => setDescExpanded(v => !v)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, fontSize: 10, fontWeight: 700, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                        {descExpanded ? <><ChevronUp size={10} /> Mostrar menos</> : <><ChevronDown size={10} /> Ver descripción completa</>}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Rating + acceptance banner */}
              {ticket.is_approval_state && currentUser?.id === ticket.created_by && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb', flexShrink: 0 }}>
                  {!showRejectForm ? (
                    <>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} style={{ color: '#22c55e' }} /> Solución aplicada — ¿quedaste satisfecho?
                      </p>
                      <p style={{ fontSize: 11, color: '#a16207', margin: '0 0 12px' }}>Califica la atención antes de aceptar. Puedes reabrir si la solución no es correcta.</p>

                      {/* Stars */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        {[1,2,3,4,5].map(s => (
                          <button key={s} type="button" onClick={() => setRatingScore(s)}
                            onMouseEnter={() => setRatingHover(s)} onMouseLeave={() => setRatingHover(0)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                            <Star size={22} fill={(ratingHover || ratingScore) >= s ? '#f59e0b' : 'none'} stroke={(ratingHover || ratingScore) >= s ? '#f59e0b' : '#d1d5db'} />
                          </button>
                        ))}
                        {ratingScore > 0 && (
                          <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginLeft: 4 }}>
                            {['','Muy malo','Malo','Regular','Bueno','Excelente'][ratingScore]}
                          </span>
                        )}
                      </div>

                      {/* Comment */}
                      <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)}
                        placeholder="Comentario opcional…" rows={2}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' as const, boxSizing: 'border-box' as const, marginBottom: 10 }} />

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button type="button" onClick={handleAcceptAndRate} disabled={isApproving || ratingScore === 0}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, border: 'none', background: ratingScore > 0 && !isApproving ? '#22c55e' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: ratingScore > 0 && !isApproving ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                          <CheckCircle2 size={12} />{isApproving ? 'Procesando…' : 'Aceptar y calificar'}
                        </button>
                        <button type="button" onClick={() => setShowRejectForm(true)}
                          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Reabrir
                        </button>
                        {ratingScore === 0 && (
                          <span style={{ fontSize: 10, color: '#a16207', fontWeight: 600 }}>↑ Selecciona estrellas para aceptar</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: '0 0 8px' }}>Motivo de reapertura</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Describe por qué no fue resuelto…" rows={2}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #fecaca', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' as const }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button type="button" onClick={handleReject} disabled={isRejecting || !rejectReason.trim()}
                            style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: isRejecting || !rejectReason.trim() ? '#94a3b8' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isRejecting ? '…' : 'Confirmar'}
                          </button>
                          <button type="button" onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                            style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {validationError && <p style={{ fontSize: 11, color: '#dc2626', margin: '8px 0 0' }}>{validationError}</p>}
                </div>
              )}

              {/* Rating fallback — ticket cerrado sin calificar */}
              {ticket.is_final && currentUser?.id === ticket.created_by && !existingRating && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7ed', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Star size={13} /> ¿Cómo fue la atención?
                  </p>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => setRatingScore(s)}
                        onMouseEnter={() => setRatingHover(s)} onMouseLeave={() => setRatingHover(0)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                        <Star size={22} fill={(ratingHover || ratingScore) >= s ? '#f59e0b' : 'none'} stroke={(ratingHover || ratingScore) >= s ? '#f59e0b' : '#d1d5db'} />
                      </button>
                    ))}
                    {ratingScore > 0 && <span style={{ fontSize: 11, color: '#92400e', alignSelf: 'center', marginLeft: 4, fontWeight: 700 }}>{['','Muy malo','Malo','Regular','Bueno','Excelente'][ratingScore]}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Comentario opcional…" rows={1}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 11, fontFamily: 'inherit', outline: 'none', resize: 'none' as const }} />
                    <button type="button" disabled={ratingScore === 0 || rateMut.isPending}
                      onClick={() => rateMut.mutate({ score_overall: ratingScore, comment: ratingComment || undefined })}
                      style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: ratingScore > 0 ? '#f59e0b' : '#e2e8f0', color: ratingScore > 0 ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: ratingScore > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                      {rateMut.isPending ? '…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Rating submitted confirmation */}
              {(ticket.is_final || ticket.is_approval_state) && currentUser?.id === ticket.created_by && existingRating && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f0fdf4', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Calificación enviada</span>
                  <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={12} fill={s <= existingRating.score_overall ? '#f59e0b' : 'none'} stroke={s <= existingRating.score_overall ? '#f59e0b' : '#d1d5db'} />
                    ))}
                  </div>
                  {existingRating.comment && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4, fontStyle: 'italic' }}>"{existingRating.comment}"</span>}
                </div>
              )}

              {/* Force-reopen (admin/jefe) — solo cuando is_final */}
              {ticket.is_final && (
                <PermissionGate perm="helpdesk:tickets:edit">
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    {!showReopenForm ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <XCircle size={13} style={{ color: '#64748b', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Ticket cerrado. Puedes reabrirlo si fue resuelto incorrectamente.</span>
                        <button
                          type="button"
                          onClick={() => setShowReopenForm(true)}
                          style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          Reabrir
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 8px' }}>Motivo de reapertura</p>
                        {(ticket.reprocess_count ?? 0) >= 3 && (
                          <p style={{ margin: '0 0 7px', fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                            ⚠ Reapertura #{(ticket.reprocess_count ?? 0) + 1} — la prioridad se elevará a Alta automáticamente.
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <textarea
                            value={reopenReason}
                            onChange={e => setReopenReason(e.target.value)}
                            placeholder="Describe por qué se reabre este ticket…"
                            rows={2}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <button
                              type="button"
                              disabled={isReopening || !reopenReason.trim()}
                              onClick={async () => {
                                if (!reopenReason.trim()) return;
                                setIsReopening(true);
                                try {
                                  await ticketsService.forceReopen(ticketId, reopenReason);
                                  qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
                                  qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
                                  setShowReopenForm(false);
                                  setReopenReason('');
                                } finally {
                                  setIsReopening(false);
                                }
                              }}
                              style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: isReopening || !reopenReason.trim() ? '#94a3b8' : '#0e2235', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              {isReopening ? '…' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowReopenForm(false); setReopenReason(''); }}
                              style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </PermissionGate>
              )}

              {/* TIMELINE */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 12px' }}>Actividad</p>
                <TicketTimeline events={timeline} isLoading={timelineLoading} autoScroll />
              </div>

              {/* REPLY BOX */}
              <PermissionGate perm="helpdesk:comments:add">
                {!ticket.is_final && (
                  <div style={{ borderTop: '2px solid #f1f5f9', padding: '14px 20px', flexShrink: 0, background: '#fff' }}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFileChange} />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      {/* Avatar */}
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{currentUser?.first_name?.charAt(0).toUpperCase() ?? 'T'}</span>
                      </div>
                      {/* Input area */}
                      <div style={{ flex: 1 }}>
                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                          placeholder={commentType === 'internal' ? '🔒 Nota interna — visible solo para el equipo técnico...' : 'Escribe tu respuesta al solicitante...'}
                          rows={replyText ? 3 : 2}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${commentType === 'internal' ? '#fde68a' : '#e2e8f0'}`, background: commentType === 'internal' ? '#fffbeb' : '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', transition: 'border-color .15s, background .15s' }}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyText.trim()) { e.preventDefault(); addCommentMut.mutate(); } }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                          <select value={commentType} onChange={e => setCommentType(e.target.value as 'public' | 'internal')}
                            style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: '#475569' }}>
                            <option value="public">📢 Público</option>
                            <option value="internal">🔒 Interno</option>
                          </select>
                          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Paperclip size={10} /> {uploadMut.isPending ? 'Subiendo...' : 'Adjuntar'}
                          </button>
                          {uploadError && <span style={{ fontSize: 10, color: '#dc2626' }}>{uploadError}</span>}
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>Ctrl+Enter para enviar</span>
                          <button type="button" disabled={!replyText.trim() || addCommentMut.isPending} onClick={() => addCommentMut.mutate()}
                            style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: replyText.trim() && !addCommentMut.isPending ? '#0e2235' : '#cbd5e1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            {addCommentMut.isPending ? 'Enviando...' : 'Enviar →'}
                          </button>
                        </div>
                        {addCommentMut.isError && <p style={{ fontSize: 10, color: '#dc2626', margin: '4px 0 0' }}>Error al enviar comentario.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </PermissionGate>
            </div>

            {/* RIGHT SIDEBAR */}
            <TicketSidebar
              ticketId={ticketId}
              ticket={ticket}
              ownerAssignment={ownerAssignment}
              allGuests={allGuests}
              linkedAssets={linkedAssets}
              meetings={meetings}
              relations={relations as any}
              technicians={technicians}
              sla={{ color: slaColor, label: slaLabel, countdown: slaCountdown }}
              onTransition={(transId, reason) => transMut.mutate({ transId, reason })}
              onCancelMeeting={(meetingId) => cancelMeetMut.mutate(meetingId)}
              onScheduleMeeting={(data) => scheduleMut.mutate(data)}
              onAddRelation={async (targetId, relationType, notes) => {
                await addRelMut.mutateAsync({ targetId, relationType, notes });
              }}
              onRemoveRelation={(relId) => removeRelMut.mutate(relId)}
              onInstantCall={handleInstantCall}
              onRemoveGuest={removeGuest}
              onSearchTickets={(q, exclude) => ticketsService.searchTickets(q, exclude)}
              mutPending={{
                transition:  transMut.isPending,
                schedule:    scheduleMut.isPending,
                cancelMeet:  cancelMeetMut.isPending,
                addRel:      addRelMut.isPending,
                removeRel:   removeRelMut.isPending,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
