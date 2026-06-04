'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronRight, ChevronDown, Clock, AlertTriangle, CheckCircle2, XCircle,
  Paperclip, Star,
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

  /* ── Header / transition bar state ── */
  const [transReason,     setTransReason]     = useState('');
  const [activeTransId,   setActiveTransId]   = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  /* ── Left panel state ── */
  const [replyText,       setReplyText]       = useState('');
  const [commentType,     setCommentType]     = useState<'public' | 'internal'>('public');

  /* ── Validation state ── */
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState('');
  const [isApproving,     setIsApproving]     = useState(false);
  const [isRejecting,     setIsRejecting]     = useState(false);
  const [validationError, setValidationError] = useState('');

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


          {/* HEADER */}
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button type="button" onClick={() => router.push('/helpdesk')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
              <ArrowLeft size={12} /> Volver
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
              <span>Mesa de Ayuda</span>
              <ChevronRight size={10} />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff5e3a' }}>#{ticket.id.slice(0,8).toUpperCase()}</span>
            </div>

            <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, color: '#0e2235', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {ticket.title}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
              <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
              <PriorityBadge priority={ticket.priority} />
              {slaCountdown && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${slaColor}15`, color: slaColor, border: `1px solid ${slaColor}30`, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={9} /> {slaCountdown}
                </span>
              )}
            </div>

            <PermissionGate perm="helpdesk:tickets:edit">
            {!ticket.is_final && ticket.transitions.length > 0 && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button" onClick={() => setShowActionsMenu(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: showActionsMenu ? '#f1f5f9' : '#fff', fontSize: 12, fontWeight: 700, color: '#0e2235', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Acciones <ChevronDown size={12} />
                </button>
                {showActionsMenu && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 50, minWidth: 190, overflow: 'hidden' }}>
                    {ticket.transitions.map(tr => {
                      const VBGS: Record<string, string> = { success: '#059669', primary: '#ff5e3a', danger: '#ef4444', warning: '#f59e0b', default: '#0e2235' };
                      const col = VBGS[tr.variant ?? 'default'] ?? '#0e2235';
                      const isAct = activeTransId === tr.id;
                      return (
                        <button key={tr.id} type="button"
                          onClick={() => { setActiveTransId(isAct ? null : tr.id); setShowActionsMenu(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: isAct ? '#f1f5f9' : 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: col, textAlign: 'left' as const, fontFamily: 'inherit' }}>
                          {tr.variant === 'success' ? <CheckCircle2 size={13} /> : tr.variant === 'danger' ? <XCircle size={13} /> : <ChevronRight size={13} style={{ color: col }} />}
                          {tr.to_label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </PermissionGate>
          </div>

          {/* TRANSITION CONFIRM BAR */}
          <PermissionGate perm="helpdesk:tickets:edit">
          {activeTransId && (
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 600, flexShrink: 0 }}>Motivo (opcional):</span>
              <input value={transReason} onChange={e => setTransReason(e.target.value)} placeholder="Describe el cambio de estado..."
                style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" onClick={() => { setActiveTransId(null); setTransReason(''); }}
                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                Cancelar
              </button>
              <button type="button" onClick={() => transMut.mutate({ transId: activeTransId, reason: transReason })} disabled={transMut.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: transMut.isPending ? .7 : 1 }}>
                <CheckCircle2 size={11} /> {transMut.isPending ? 'Aplicando...' : 'Confirmar'}
              </button>
            </div>
          )}
          </PermissionGate>

          {/* 2-COLUMN BODY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', flex: 1, overflow: 'hidden' }}>

            {/* MAIN: banners + timeline + reply */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e2e8f0' }}>

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

              {/* TIMELINE */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <TicketTimeline events={timeline} isLoading={timelineLoading} autoScroll />
              </div>

              {/* REPLY BOX */}
              <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 20px', flexShrink: 0, background: '#fff' }}>
                <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange} />
                <PermissionGate perm="helpdesk:comments:add">
                {!ticket.is_final && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{currentUser?.first_name?.charAt(0).toUpperCase() ?? 'T'}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Comentario</span>
                      <select value={commentType} onChange={e => setCommentType(e.target.value as 'public' | 'internal')}
                        style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <option value="public">Publico</option>
                        <option value="internal">Interno</option>
                      </select>
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Paperclip size={10} /> {uploadMut.isPending ? '...' : 'Adjuntar'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder={commentType === 'internal' ? 'Nota interna (solo equipo tecnico)...' : 'Escribe tu respuesta...'}
                        rows={2}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' as const, boxSizing: 'border-box' as const }}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyText.trim()) { e.preventDefault(); addCommentMut.mutate(); } }}
                      />
                      <button type="button" disabled={!replyText.trim() || addCommentMut.isPending} onClick={() => addCommentMut.mutate()}
                        style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: replyText.trim() && !addCommentMut.isPending ? '#0e2235' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0 }}>
                        {addCommentMut.isPending ? '...' : 'Enviar'}
                      </button>
                    </div>
                    {(addCommentMut.isError || uploadError) && (
                      <p style={{ fontSize: 10, color: '#dc2626', margin: '4px 0 0' }}>{uploadError || 'Error al enviar.'}</p>
                    )}
                  </>
                )}
                </PermissionGate>
              </div>
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
