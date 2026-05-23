'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, Clock, AlertTriangle, CheckCircle2, RotateCcw,
  Users, Phone, CalendarDays, X, Paperclip, ScrollText,
  Upload, FileText, ImageIcon, Trash2, HardDrive, History, Link2, Search, Unlink,
} from 'lucide-react';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  ticketsService,
  type TicketPriority, type TicketAttachment, type TicketComment,
  type TicketAsset, type AssetHistoryEntry,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  ASSET_STATUS_COLORS, ASSET_STATUS_LABELS, ASSET_ACTION_LABELS,
} from '@/services/tickets.service';
import { modulesService } from '@/services/modules.service';
import type { ModuleTechnician } from '@/types/module.types';
import {
  meetingsService,
  type TicketMeeting,
  PROVIDER_LABELS,
  PROVIDER_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/services/meetings.service';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';

interface LocalGuest {
  id:       string;
  name:     string;
  role:     string;
  isLocal:  boolean;
}

/* ── Badges ─────────────────────────────────────────────────────── */

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

function SlaBadge({ status, deadline }: { status: string | null; deadline: string | null }) {
  if (!status || !deadline) return null;
  const color = SLA_STATUS_COLORS[status as keyof typeof SLA_STATUS_COLORS] ?? '#94A3B8';
  const label = SLA_STATUS_LABELS[status as keyof typeof SLA_STATUS_LABELS] ?? status;
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 3,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      <Clock size={9} />
      {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router      = useRouter();
  const qc          = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  /* ── Ticket data ── */
  const { data: ticket, isLoading, isError, error } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn:  () => ticketsService.getOne(ticketId),
    staleTime: 30_000,
    retry: 1,
  });

  /* ── Technicians for collaborator selection (no admin permission required) ── */
  const { data: technicians = [] } = useQuery<ModuleTechnician[]>({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 5 * 60_000,
  });

  /* ── Left panel state ── */
  const [transReason,   setTransReason]   = useState('');
  const [activeTransId, setActiveTransId] = useState<string | null>(null);
  const [replyText,     setReplyText]     = useState('');
  const [commentType,   setCommentType]   = useState<'public' | 'internal'>('public');

  /* ── Validation state ── */
  const [signature,       setSignature]       = useState('');
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState('');
  const [isApproving,     setIsApproving]     = useState(false);
  const [isRejecting,     setIsRejecting]     = useState(false);
  const [validationError, setValidationError] = useState('');

  /* ── Right panel state ── */
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isCalling,      setIsCalling]      = useState(false);
  const [scheduledDate,  setScheduledDate]  = useState('');
  const [scheduledTime,  setScheduledTime]  = useState('10:00');
  const [meetingProvider, setMeetingProvider] = useState<'google_meet' | 'teams' | 'zoom' | 'internal'>('google_meet');
  const [meetingUrl,      setMeetingUrl]      = useState('');
  const [meetingReason,   setMeetingReason]   = useState('Asesoramiento técnico');
  const [localGuests,    setLocalGuests]    = useState<LocalGuest[]>([]);

  /* ── Attachments ── */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');

  const { data: attachments = [] } = useQuery<TicketAttachment[]>({
    queryKey: ['ticket-attachments', ticketId],
    queryFn:  () => ticketsService.getAttachments(ticketId),
    staleTime: 60_000,
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => ticketsService.uploadAttachment(ticketId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] });
      setUploadError('');
    },
    onError: (e: any) => setUploadError(e?.response?.data?.message ?? 'Error al subir archivo.'),
  });

  const deletAttMut = useMutation({
    mutationFn: (attId: string) => ticketsService.deleteAttachment(ticketId, attId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] }),
  });

  /* ── Comments ── */
  const { data: comments = [] } = useQuery<TicketComment[]>({
    queryKey: ['ticket-comments', ticketId],
    queryFn:  () => ticketsService.getComments(ticketId),
    staleTime: 30_000,
  });

  const addCommentMut = useMutation({
    mutationFn: () => ticketsService.addComment(ticketId, replyText.trim(), commentType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
      setReplyText('');
    },
  });

  /* ── Meetings ── */
  const { data: meetings = [] } = useQuery<TicketMeeting[]>({
    queryKey: ['ticket-meetings', ticketId],
    queryFn:  () => meetingsService.getMeetings(ticketId),
    staleTime: 30_000,
  });

  const scheduleMut = useMutation({
    mutationFn: () => meetingsService.createMeeting(ticketId, {
      reason:       meetingReason.trim() || 'Reunión de soporte',
      provider:     meetingProvider,
      meeting_url:  meetingUrl.trim() || undefined,
      scheduled_at: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] });
      setScheduledDate(''); setScheduledTime('10:00');
      setMeetingUrl(''); setMeetingReason('Asesoramiento técnico');
    },
  });

  const cancelMeetMut = useMutation({
    mutationFn: (meetingId: string) => meetingsService.cancelMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] }),
  });

  /* ── Relations ── */
  const { data: relations = [] } = useQuery<{
    id: string; relation_type: string; notes: string | null; created_at: string;
    created_by_name: string;
    related_id: string; related_title: string; related_priority: string;
    related_created_at: string; related_state_label: string; related_state_name: string;
    related_is_final: boolean; related_owner_name: string | null;
    related_description: string | null;
  }[]>({
    queryKey: ['ticket-relations', ticketId],
    queryFn:  () => ticketsService.getRelations(ticketId),
    staleTime: 60_000,
  });

  const [relSearch, setRelSearch]           = useState('');
  const [relType, setRelType]               = useState('related');
  const [relNotes, setRelNotes]             = useState('');
  const [relTarget, setRelTarget]           = useState<{ id: string; title: string } | null>(null);
  const [relSearchResults, setRelSearchResults] = useState<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>([]);
  const [relSearching, setRelSearching]     = useState(false);
  const [showRelForm, setShowRelForm]       = useState(false);

  const addRelMut = useMutation({
    mutationFn: () => ticketsService.addRelation(ticketId, {
      target_ticket_id: relTarget!.id,
      relation_type:    relType,
      notes:            relNotes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] });
      setRelTarget(null); setRelSearch(''); setRelNotes(''); setRelSearchResults([]);
      setShowRelForm(false);
    },
  });

  const removeRelMut = useMutation({
    mutationFn: (relId: string) => ticketsService.removeRelation(ticketId, relId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] }),
  });

  async function handleRelSearch(q: string) {
    setRelSearch(q);
    setRelTarget(null);
    if (q.trim().length < 2) { setRelSearchResults([]); return; }
    setRelSearching(true);
    try {
      const res = await ticketsService.searchTickets(q.trim(), ticketId);
      setRelSearchResults(res);
    } finally {
      setRelSearching(false);
    }
  }

  /* ── Linked assets ── */
  const { data: linkedAssets = [] } = useQuery<TicketAsset[]>({
    queryKey: ['ticket-assets', ticketId],
    queryFn:  () => ticketsService.getTicketAssets(ticketId),
    staleTime: 60_000,
  });

  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [assetTab, setAssetTab] = useState<'history' | 'tickets'>('history');

  const { data: assetHistory = [], isFetching: historyFetching } = useQuery<AssetHistoryEntry[]>({
    queryKey: ['asset-history', ticketId, expandedAssetId],
    queryFn:  () => ticketsService.getAssetHistory(ticketId, expandedAssetId!),
    enabled:  !!expandedAssetId && assetTab === 'history',
    staleTime: 120_000,
  });

  const { data: assetPrevTickets = [], isFetching: prevTicketsFetching } = useQuery<{
    id: string; title: string; priority: string; created_at: string; updated_at: string;
    state_label: string; state_name: string; is_final: boolean;
    creator_name: string; owner_name: string | null;
  }[]>({
    queryKey: ['asset-prev-tickets', ticketId, expandedAssetId],
    queryFn:  () => ticketsService.getAssetPrevTickets(ticketId, expandedAssetId!),
    enabled:  !!expandedAssetId && assetTab === 'tickets',
    staleTime: 120_000,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Máximo 10 MB.'); return; }
    setUploadError('');
    uploadMut.mutate(file);
    e.target.value = '';
  }

  /* ── Transition mutation ── */
  const transMut = useMutation({
    mutationFn: ({ transId, reason }: { transId: string; reason?: string }) =>
      ticketsService.transition(ticketId, transId, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      setActiveTransId(null);
      setTransReason('');
    },
  });

  /* ── Collaboration: instant call invite ── */
  async function handleInstantCall() {
    if (!selectedUserId) return;
    setIsCalling(true);

    const user = technicians.find((u) => u.id === selectedUserId);
    if (!user) { setIsCalling(false); return; }

    try {
      await ticketsService.addAssignment(ticketId, selectedUserId, 'collaborator');
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
    } catch {
      // ignore — still add to local guest list for UI
    }

    setTimeout(() => {
      setIsCalling(false);
      const name = `${user.first_name} ${user.last_name}`.trim();
      setLocalGuests((prev) => {
        if (prev.some((g) => g.id === user.id)) return prev;
        return [...prev, { id: user.id, name, role: user.role_name, isLocal: true }];
      });
    }, 2000);
  }

  /* ── Collaboration: schedule meeting ── */
  function handleSchedule() {
    if (!scheduledDate || !scheduledTime) return;
    scheduleMut.mutate();
  }

  /* ── Guest helpers ── */
  function removeGuest(id: string) {
    setLocalGuests((prev) => prev.filter((g) => g.id !== id));
  }

  /* ── Compute combined guest list ── */
  const allGuests = useMemo<LocalGuest[]>(() => {
    const fromAssignments: LocalGuest[] = (ticket?.assignments ?? [])
      .filter((a) => a.is_active)
      .map((a) => ({ id: a.id, name: a.user_name, role: a.role, isLocal: false }));

    const localIds = new Set(fromAssignments.map((g) => g.id));
    const merged   = [...fromAssignments];
    for (const g of localGuests) {
      if (!localIds.has(g.id)) merged.push(g);
    }
    return merged;
  }, [ticket?.assignments, localGuests]);

  /* ── Validation handlers ── */
  async function handleApprove() {
    if (!signature.trim()) { setValidationError('Firma requerida.'); return; }
    setIsApproving(true);
    setValidationError('');
    try {
      await ticketsService.approve(ticketId, signature.trim());
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setSignature('');
    } catch (e: any) {
      setValidationError(e?.response?.data?.message ?? 'Error al aprobar.');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setValidationError('Justificación requerida.'); return; }
    setIsRejecting(true);
    setValidationError('');
    try {
      const result = await ticketsService.reject(ticketId, rejectReason.trim());
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setShowRejectForm(false);
      setRejectReason('');
      if (result.escalated) {
        alert('Ticket escalado al Jefe Técnico con prioridad Alta.');
      }
    } catch (e: any) {
      setValidationError(e?.response?.data?.message ?? 'Error al rechazar.');
    } finally {
      setIsRejecting(false);
    }
  }

  /* ── SLA helpers ── */
  const slaColor = ticket?.sla_status
    ? (SLA_STATUS_COLORS[ticket.sla_status as keyof typeof SLA_STATUS_COLORS] ?? '#94A3B8')
    : '#94A3B8';
  const slaLabel = ticket?.sla_status
    ? (SLA_STATUS_LABELS[ticket.sla_status as keyof typeof SLA_STATUS_LABELS] ?? ticket.sla_status)
    : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const slaCountdown = useMemo(() => {
    const deadline = ticket?.sla_deadline_tracked;
    const status   = ticket?.sla_status;
    if (!deadline) return null;
    if (status === 'met')    return 'SLA cumplido';
    if (status === 'paused') return 'Pausado';
    const diffMs = new Date(deadline).getTime() - now;
    const abs    = Math.abs(diffMs);
    const h      = Math.floor(abs / 3_600_000);
    const m      = Math.floor((abs % 3_600_000) / 60_000);
    const past   = diffMs < 0 || status === 'breached';
    if (h === 0)   return past ? `Vencido hace ${m}m`       : `Vence en ${m}m`;
    if (h < 24)    return past ? `Vencido hace ${h}h ${m}m` : `Vence en ${h}h ${m}m`;
    const d    = Math.floor(h / 24);
    const remH = h % 24;
    return past
      ? `Vencido hace ${d}d ${remH}h`
      : (remH > 0 ? `Vence en ${d}d ${remH}h` : `Vence en ${d}d`);
  }, [ticket?.sla_deadline_tracked, ticket?.sla_status, now]);

  /* ── Render ── */
  return (
    <div className={styles.workspacePage}>
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
        <div className={styles.workspace}>

          {/* ══ LEFT PANEL ════════════════════════════════════════ */}
          <div className={styles.wMain}>

            {/* Back */}
            <button type="button" onClick={() => router.push('/helpdesk')} className={styles.backBtn}>
              <ArrowLeft size={13} />
              Volver al listado
            </button>

            {/* Breadcrumb */}
            <div className={styles.breadcrumb}>
              <span>{ticket.module_name}</span>
              <ChevronRight size={10} />
              <span>{ticket.category_name}</span>
              <ChevronRight size={10} />
              <span>{ticket.environment_name}</span>
            </div>

            {/* Title + ID */}
            <div className={styles.titleRow}>
              <h2 className={styles.wTitle}>{ticket.title}</h2>
              <span className={styles.ticketIdBadge}>#{ticket.id.slice(0, 8)}</span>
            </div>

            {/* Badges */}
            <div className={styles.badgeRow}>
              <PriorityBadge priority={ticket.priority} />
              <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
              <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />
              {ticket.state_name === 'realizado' && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: '#F59E0B22', color: '#D97706', border: '1px solid #F59E0B44', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CheckCircle2 size={9} /> Requiere validación
                </span>
              )}
            </div>

            {/* Participant bar */}
            {allGuests.length > 0 && (() => {
              const ROLE_COLORS: Record<string, string> = {
                owner:        '#0e2235',
                collaborator: '#3b82f6',
                observer:     '#94a3b8',
              };
              const MAX_SHOWN = 6;
              const shown    = allGuests.slice(0, MAX_SHOWN);
              const overflow = allGuests.length - MAX_SHOWN;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>Participantes:</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {shown.map((g, i) => {
                      const borderColor = ROLE_COLORS[g.role] ?? '#94a3b8';
                      return (
                        <div
                          key={g.id}
                          title={`${g.name} (${g.role})`}
                          style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: '#1e3044',
                            border: `2px solid ${borderColor}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: '#e2e8f0',
                            marginLeft: i === 0 ? 0 : -8,
                            zIndex: shown.length - i,
                            position: 'relative',
                            flexShrink: 0,
                          }}
                        >
                          {g.name.charAt(0).toUpperCase()}
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: '#334155',
                        border: '2px solid #475569',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: '#94A3B8',
                        marginLeft: -8, position: 'relative', flexShrink: 0,
                      }}>
                        +{overflow}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Description */}
            {ticket.description && (
              <div className={styles.descBlock}>{ticket.description}</div>
            )}

            {/* Meta grid */}
            <div className={styles.metaGrid}>
              {([
                ['Creado por',  ticket.creator_name],
                ['Asignado a',  ticket.assignee_name ?? '—'],
                ['Ambiente',    ticket.environment_name],
                ['Creado',      fmtDate(ticket.created_at)],
                ['Urgencia',    ticket.urgency],
                ['Impacto',     ticket.impact],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{label}</span>
                  <span className={styles.metaValue}>{val}</span>
                </div>
              ))}
            </div>

            {/* ── Digital signature validation ── */}
            {ticket.state_name === 'realizado' && (
              currentUser?.id === ticket.created_by ? (
                <div className={styles.validationPanel}>
                  <p className={styles.validationTitle}>
                    <CheckCircle2 size={15} />
                    Validación de solución requerida
                  </p>
                  <p className={styles.validationSubtitle}>
                    El equipo técnico ha resuelto tu ticket. Por favor revisa la solución y valida con tu firma.
                  </p>

                  {ticket.reprocess_count > 0 && (
                    <div className={styles.escalationWarning}>
                      ⚠️ Ya aplicaste un reproceso. Si rechazas de nuevo, el ticket se escalará al Jefe Técnico con prioridad Alta.
                    </div>
                  )}

                  {!showRejectForm ? (
                    <>
                      <input
                        type="text"
                        className={styles.signatureInput}
                        placeholder="Tu firma (nombre completo) *"
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                      />
                      {validationError && (
                        <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 8px' }}>{validationError}</p>
                      )}
                      <div className={styles.validationBtns}>
                        <button
                          type="button"
                          className={styles.approveBtn}
                          disabled={!signature.trim() || isApproving}
                          onClick={handleApprove}
                        >
                          <CheckCircle2 size={13} />
                          {isApproving ? 'Firmando…' : 'Aprobar y firmar'}
                        </button>
                        <button
                          type="button"
                          className={styles.rejectBtn}
                          onClick={() => { setShowRejectForm(true); setValidationError(''); }}
                        >
                          <X size={13} />
                          Rechazar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.rejectForm}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', margin: 0 }}>
                        Motivo del rechazo
                      </p>
                      <textarea
                        className={styles.rejectTextarea}
                        placeholder="Describe por qué rechazas la solución…"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                      />
                      {validationError && (
                        <p style={{ fontSize: 11, color: '#dc2626', margin: 0 }}>{validationError}</p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => { setShowRejectForm(false); setRejectReason(''); setValidationError(''); }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className={styles.confirmRejectBtn}
                          disabled={!rejectReason.trim() || isRejecting}
                          onClick={handleReject}
                        >
                          {isRejecting ? 'Rechazando…' : 'Confirmar rechazo'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.awaitingValidation}>
                  <Clock size={15} />
                  Esperando validación del solicitante
                </div>
              )
            )}

            {/* Transitions */}
            {!ticket.is_final && ticket.state_name !== 'realizado' && ticket.transitions.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <p className={styles.sectionHeader}>Acciones disponibles</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ticket.transitions.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => setActiveTransId(activeTransId === tr.id ? null : tr.id)}
                      className={styles.transBtn}
                      style={{
                        border: `1.5px solid ${activeTransId === tr.id ? '#6366F1' : '#E2E8F0'}`,
                        background: activeTransId === tr.id ? '#6366F115' : '#fff',
                        color: activeTransId === tr.id ? '#6366F1' : '#475569',
                      }}
                    >
                      <ChevronRight size={11} />
                      {tr.to_label}
                    </button>
                  ))}
                </div>

                {activeTransId && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <textarea
                      value={transReason}
                      onChange={(e) => setTransReason(e.target.value)}
                      placeholder="Motivo del cambio (opcional)…"
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                        border: '1px solid #E2E8F0', outline: 'none', resize: 'vertical',
                        boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setActiveTransId(null); setTransReason(''); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => transMut.mutate({ transId: activeTransId, reason: transReason })}
                        disabled={transMut.isPending}
                        style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: transMut.isPending ? .7 : 1 }}
                      >
                        <CheckCircle2 size={12} />
                        {transMut.isPending ? 'Aplicando…' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {ticket.history.length > 0 && (
              <div>
                <p className={styles.sectionHeader}>Historial de estados</p>
                <div className={styles.historyList}>
                  {ticket.history.map((h) => (
                    <div key={h.id} className={styles.historyItem}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RotateCcw size={12} style={{ color: '#6366F1' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#0F172A', margin: 0 }}>
                          {h.from_label} → {h.to_label}
                        </p>
                        {h.transition_reason && (
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{h.transition_reason}</p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{h.actor_name}</p>
                        <p style={{ fontSize: 10, color: '#CBD5E1', margin: '1px 0 0' }}>{fmtRelative(h.transitioned_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments panel */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className={styles.sectionHeader} style={{ margin: 0 }}>
                  Evidencias y adjuntos
                  {attachments.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#e2e8f0', color: '#64748b', fontWeight: 600 }}>
                      {attachments.length}
                    </span>
                  )}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  disabled={uploadMut.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                    background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    color: '#475569', opacity: uploadMut.isPending ? .6 : 1,
                  }}
                >
                  <Upload size={12} />
                  {uploadMut.isPending ? 'Subiendo…' : 'Adjuntar'}
                </button>
              </div>

              {uploadError && (
                <p style={{ fontSize: 11, color: '#dc2626', margin: '0 0 8px' }}>{uploadError}</p>
              )}

              {attachments.length === 0 && !uploadMut.isPending && (
                <div
                  style={{
                    border: '1.5px dashed #e2e8f0', borderRadius: 10,
                    padding: '18px 16px', textAlign: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={18} style={{ color: '#cbd5e1', marginBottom: 6 }} />
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                    Sin adjuntos. Haz clic para subir evidencia.
                  </p>
                  <p style={{ fontSize: 10, color: '#cbd5e1', margin: '3px 0 0' }}>
                    Imágenes, PDF, Excel, Word · máx 10 MB
                  </p>
                </div>
              )}

              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {attachments.map((att) => {
                    const isImage = att.mime_type.startsWith('image/');
                    const sizeKb  = Math.round(att.file_size / 1024);
                    return (
                      <div
                        key={att.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 8,
                          border: '1px solid #f1f5f9', background: '#fafafa',
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                          background: isImage ? '#f0f9ff' : '#fef3f2',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isImage
                            ? <ImageIcon size={14} style={{ color: '#0ea5e9' }} />
                            : <FileText  size={14} style={{ color: '#ff5e3a' }} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12, fontWeight: 600, color: '#0f172a',
                              textDecoration: 'none', display: 'block',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {att.original_name}
                          </a>
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>
                            {sizeKb} KB · {att.uploader_name}
                          </p>
                        </div>
                        {currentUser?.id && (
                          <button
                            type="button"
                            title="Eliminar adjunto"
                            disabled={deletAttMut.isPending}
                            onClick={() => deletAttMut.mutate(att.id)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#94a3b8', padding: 4, flexShrink: 0,
                              opacity: deletAttMut.isPending ? .4 : 1,
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comments list */}
            {comments.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <p className={styles.sectionHeader}>
                  Comentarios
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#e2e8f0', color: '#64748b', fontWeight: 600 }}>
                    {comments.length}
                  </span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {comments.map((c) => (
                    <div key={c.id} style={{
                      padding: '10px 12px', borderRadius: 8,
                      background: c.comment_type === 'internal' ? '#fef9ec' : '#f8fafc',
                      border: `1px solid ${c.comment_type === 'internal' ? '#fde68a' : '#e2e8f0'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>
                            {c.author_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{c.author_name}</span>
                        {c.comment_type === 'internal' && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fde68a', color: '#92400e', fontWeight: 600 }}>
                            Interno
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{fmtRelative(c.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply box */}
            {!ticket.is_final && (
              <div className={styles.replyBox} style={{ marginTop: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      {currentUser?.first_name?.charAt(0).toUpperCase() ?? 'T'}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Agregar comentario</span>
                  <select
                    value={commentType}
                    onChange={(e) => setCommentType(e.target.value as 'public' | 'internal')}
                    style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <option value="public">Público</option>
                    <option value="internal">Interno</option>
                  </select>
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={commentType === 'internal' ? 'Nota interna (solo el equipo técnico la verá)…' : 'Escribe tu respuesta técnica aquí…'}
                  rows={3}
                  className={styles.replyTextarea}
                />
                <div className={styles.replyActions}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className={styles.replyIconBtn} title="Adjuntar archivo" onClick={() => fileInputRef.current?.click()}>
                      <Paperclip size={14} />
                    </button>
                    <button type="button" className={styles.replyIconBtn} title="Insertar plantilla">
                      <ScrollText size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.replySubmitBtn}
                    disabled={!replyText.trim() || addCommentMut.isPending}
                    onClick={() => addCommentMut.mutate()}
                  >
                    {addCommentMut.isPending ? 'Enviando…' : 'Responder Ticket'}
                  </button>
                </div>
                {addCommentMut.isError && (
                  <p style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>
                    Error al enviar comentario.
                  </p>
                )}
              </div>
            )}

            {/* ── Related tickets ── */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p className={styles.sectionHeader} style={{ margin: 0 }}>
                  Tickets relacionados
                  {relations.length > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#e2e8f0', color: '#64748b', fontWeight: 600 }}>
                      {relations.length}
                    </span>
                  )}
                </p>
                {!ticket.is_final && (
                  <button
                    type="button"
                    onClick={() => setShowRelForm((v) => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, padding: '4px 10px',
                      borderRadius: 6, cursor: 'pointer',
                      background: showRelForm ? '#e2e8f0' : '#0e2235',
                      color: showRelForm ? '#334155' : '#fff',
                      border: 'none',
                    }}
                  >
                    <Link2 size={11} />
                    {showRelForm ? 'Cancelar' : 'Vincular ticket'}
                  </button>
                )}
              </div>

              {/* Add relation form */}
              {showRelForm && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>Buscar ticket a vincular</p>

                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="Buscar por título o ID…"
                      value={relSearch}
                      onChange={(e) => handleRelSearch(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                        fontSize: 12, borderRadius: 7, border: '1px solid #e2e8f0',
                        background: '#fff', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>

                  {/* Search results dropdown */}
                  {relSearch.trim().length >= 2 && !relTarget && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', marginBottom: 8, maxHeight: 160, overflowY: 'auto' }}>
                      {relSearching ? (
                        <p style={{ fontSize: 11, color: '#94a3b8', padding: '8px 10px', margin: 0 }}>Buscando…</p>
                      ) : relSearchResults.length === 0 ? (
                        <p style={{ fontSize: 11, color: '#94a3b8', padding: '8px 10px', margin: 0 }}>Sin resultados.</p>
                      ) : (
                        relSearchResults.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => { setRelTarget({ id: r.id, title: r.title }); setRelSearch(r.title); setRelSearchResults([]); }}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '8px 10px', background: 'none', border: 'none',
                              borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.title}</span>
                            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{r.state_label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {relTarget && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#e0f2fe', borderRadius: 6, marginBottom: 8 }}>
                      <Link2 size={11} style={{ color: '#0284c7', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#0284c7', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{relTarget.title}</span>
                      <button type="button" onClick={() => { setRelTarget(null); setRelSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', padding: 0 }}>
                        <X size={11} />
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#64748b', margin: '0 0 3px' }}>Tipo de relación</p>
                      <select
                        value={relType}
                        onChange={(e) => setRelType(e.target.value)}
                        style={{ width: '100%', fontSize: 12, padding: '5px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        <option value="related">Relacionado</option>
                        <option value="duplicate">Duplicado</option>
                        <option value="blocks">Bloquea</option>
                        <option value="caused_by">Causado por</option>
                      </select>
                    </div>
                  </div>

                  <textarea
                    value={relNotes}
                    onChange={(e) => setRelNotes(e.target.value)}
                    placeholder="Notas opcionales…"
                    rows={2}
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 9px', borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'inherit', resize: 'vertical', marginBottom: 8, outline: 'none' }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={!relTarget || addRelMut.isPending}
                      onClick={() => addRelMut.mutate()}
                      style={{
                        fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7,
                        background: relTarget ? '#0e2235' : '#e2e8f0',
                        color: relTarget ? '#fff' : '#94a3b8',
                        border: 'none', cursor: relTarget ? 'pointer' : 'default',
                      }}
                    >
                      {addRelMut.isPending ? 'Vinculando…' : 'Vincular'}
                    </button>
                  </div>
                  {addRelMut.isError && (
                    <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Error al vincular.</p>
                  )}
                </div>
              )}

              {/* Relations list */}
              {relations.length === 0 ? (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>Sin tickets vinculados.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relations.map((r) => {
                    const stateColor = r.related_is_final ? '#22C55E' : '#6366F1';
                    const prioColor  = TICKET_PRIORITY_COLORS[r.related_priority as TicketPriority] ?? '#94a3b8';
                    const REL_LABELS: Record<string, string> = {
                      related:    'Relacionado',
                      duplicate:  'Duplicado',
                      blocks:     'Bloquea',
                      caused_by:  'Causado por',
                    };
                    return (
                      <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                {REL_LABELS[r.relation_type] ?? r.relation_type}
                              </span>
                              <span style={{ fontSize: 9, color: '#94a3b8' }}>{fmtRelative(r.related_created_at)}</span>
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.related_title}
                            </p>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: `${prioColor}22`, color: prioColor, border: `1px solid ${prioColor}44` }}>
                                {TICKET_PRIORITY_LABELS[r.related_priority as TicketPriority] ?? r.related_priority}
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 99, background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44` }}>
                                {r.related_state_label}
                              </span>
                            </div>
                            {r.related_owner_name && (
                              <p style={{ fontSize: 10, color: '#64748b', margin: '4px 0 0' }}>
                                Técnico: {r.related_owner_name}
                              </p>
                            )}
                            {r.related_description && (
                              <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                                {r.related_description}
                              </p>
                            )}
                            {r.notes && (
                              <p style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', margin: '3px 0 0' }}>{r.notes}</p>
                            )}
                          </div>
                          {!ticket.is_final && (
                            <button
                              type="button"
                              title="Desvincular"
                              disabled={removeRelMut.isPending}
                              onClick={() => removeRelMut.mutate(r.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, flexShrink: 0 }}
                            >
                              <Unlink size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ══ RIGHT DARK PANEL ══════════════════════════════════ */}
          <div className={styles.wDark}>

            {/* SLA section */}
            <div className={styles.darkSection}>
              <p className={styles.sectionLabel}>
                <AlertTriangle size={10} />
                SLA y Vencimiento
              </p>
              <div className={styles.slaCard}>
                <AlertTriangle size={18} className={styles.slaCardIcon} />
                <div className={styles.slaCardContent}>
                  <p className={styles.slaCardLabel}>Tiempo Límite</p>
                  {ticket.sla_deadline_tracked ? (
                    <>
                      <p className={styles.slaCardDate}>{fmtDate(ticket.sla_deadline_tracked)}</p>
                      {slaCountdown && (
                        <p style={{ fontSize: 11, fontWeight: 700, color: slaColor, margin: '2px 0 0' }}>
                          {slaCountdown}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={styles.slaCardEmpty}>Sin SLA configurado</p>
                  )}
                </div>
                {slaLabel && (
                  <span
                    className={styles.slaCardStatus}
                    style={{ background: `${slaColor}28`, color: slaColor, border: `1px solid ${slaColor}44` }}
                  >
                    {slaLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Solicitar colaborador */}
            <div className={styles.darkSection}>
              <p className={styles.inviteTitle}>Solicitar Colaborador</p>
              <p className={styles.inviteSubtitle}>
                Invita a un técnico o jefe técnico para resolver este ticket en conjunto.
              </p>
              <div className={styles.callPanel}>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className={styles.callSelect}
                >
                  <option value="">Seleccionar técnico…</option>
                  {technicians.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} — {u.role_name === 'jefe_tecnico' ? 'Jefe Técnico' : 'Técnico'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.callBtn}
                  disabled={!selectedUserId || isCalling}
                  onClick={handleInstantCall}
                >
                  <Phone size={11} />
                  {isCalling ? '…' : 'Invitar'}
                </button>
              </div>
              {isCalling && (
                <div className={styles.callingAnimation}>
                  Enviando invitación al colaborador…
                </div>
              )}
            </div>

            {/* Programar reunión */}
            <div className={styles.darkSection}>
              <p className={styles.inviteTitle}>Programar Reunión</p>
              <p className={styles.inviteSubtitle}>
                Agenda una sesión vinculada a este ticket.
              </p>

              {/* Provider */}
              <select
                value={meetingProvider}
                onChange={(e) => setMeetingProvider(e.target.value as typeof meetingProvider)}
                className={styles.methodSelect}
              >
                <option value="google_meet">Google Meet</option>
                <option value="teams">Microsoft Teams</option>
                <option value="zoom">Zoom</option>
                <option value="internal">Enlace interno</option>
              </select>

              {/* Reason */}
              <input
                type="text"
                value={meetingReason}
                onChange={(e) => setMeetingReason(e.target.value)}
                placeholder="Motivo de la reunión *"
                className={styles.scheduleInput}
                style={{ marginTop: 8 }}
              />

              {/* Optional link */}
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="Enlace de reunión (opcional)"
                className={styles.scheduleInput}
                style={{ marginTop: 6 }}
              />

              <div className={styles.schedulePanel}>
                <div className={styles.scheduleGrid}>
                  <div className={styles.scheduleFld}>
                    <p className={styles.scheduleFieldLabel}>Fecha *</p>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className={styles.scheduleInput}
                    />
                  </div>
                  <div className={styles.scheduleFld}>
                    <p className={styles.scheduleFieldLabel}>Hora *</p>
                    <select
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className={styles.scheduleSelect}
                    >
                      {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.scheduleSubmitBtn}
                  disabled={!scheduledDate || !scheduledTime || !meetingReason.trim() || scheduleMut.isPending}
                  onClick={handleSchedule}
                >
                  {scheduleMut.isPending ? 'Programando…' : 'Registrar Reunión'}
                </button>
                {scheduleMut.isError && (
                  <p style={{ fontSize: 11, color: '#ff8a80', marginTop: 6 }}>
                    Error al programar reunión.
                  </p>
                )}
              </div>
            </div>

            {/* Linked devices (inventory) */}
            {linkedAssets.length > 0 && (
              <div className={styles.darkSection}>
                <p className={styles.sectionLabel}>
                  <HardDrive size={10} />
                  Dispositivos vinculados ({linkedAssets.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {linkedAssets.map((asset) => {
                    const statusColor = ASSET_STATUS_COLORS[asset.status] ?? '#94a3b8';
                    const statusLabel = ASSET_STATUS_LABELS[asset.status] ?? asset.status;
                    const isExpanded  = expandedAssetId === asset.id;

                    return (
                      <div
                        key={asset.id}
                        style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {asset.name}
                            </p>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: `${statusColor}28`, color: statusColor,
                                border: `1px solid ${statusColor}44`, textTransform: 'uppercase',
                              }}>
                                {statusLabel}
                              </span>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                {asset.category_name}
                              </span>
                            </div>
                            {asset.serial_number && (
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0', fontFamily: 'monospace' }}>
                                S/N {asset.serial_number}
                              </p>
                            )}
                            {asset.assigned_to_name && (
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>
                                → {asset.assigned_to_name}
                              </p>
                            )}
                            {asset.link_notes && (
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0', fontStyle: 'italic' }}>
                                {asset.link_notes}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            title={isExpanded ? 'Ocultar' : 'Ver historial y tickets'}
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedAssetId(null);
                              } else {
                                setExpandedAssetId(asset.id);
                                setAssetTab('history');
                              }
                            }}
                            style={{
                              background: isExpanded ? 'rgba(255,255,255,0.15)' : 'none',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: 6, cursor: 'pointer', padding: '4px 6px',
                              color: 'rgba(255,255,255,0.55)', flexShrink: 0,
                            }}
                          >
                            <History size={12} />
                          </button>
                        </div>

                        {/* Inline history / prev tickets */}
                        {isExpanded && (
                          <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                            {/* Tab bar */}
                            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                              {(['history', 'tickets'] as const).map((tab) => (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={() => setAssetTab(tab)}
                                  style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                                    fontWeight: assetTab === tab ? 700 : 400,
                                    background: assetTab === tab ? 'rgba(255,255,255,0.18)' : 'none',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    color: assetTab === tab ? '#fff' : 'rgba(255,255,255,0.45)',
                                  }}
                                >
                                  {tab === 'history' ? 'Historial asignaciones' : 'Tickets anteriores'}
                                </button>
                              ))}
                            </div>

                            {assetTab === 'history' && (
                              historyFetching ? (
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Cargando…</p>
                              ) : assetHistory.length === 0 ? (
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Sin historial.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {assetHistory.map((h) => (
                                    <div key={h.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                      <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                                        background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
                                        textTransform: 'uppercase', flexShrink: 0,
                                      }}>
                                        {ASSET_ACTION_LABELS[h.action] ?? h.action}
                                      </span>
                                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {h.actor_name ?? h.user_name ?? '—'}
                                        {h.reason ? ` · ${h.reason}` : ''}
                                      </span>
                                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                                        {fmtRelative(h.created_at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )
                            )}

                            {assetTab === 'tickets' && (
                              prevTicketsFetching ? (
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Cargando…</p>
                              ) : assetPrevTickets.length === 0 ? (
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Sin tickets anteriores.</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {assetPrevTickets.map((pt) => {
                                    const stateColor = pt.is_final ? '#22C55E' : '#6366F1';
                                    const prioColor  = TICKET_PRIORITY_COLORS[pt.priority as TicketPriority] ?? '#94a3b8';
                                    return (
                                      <div key={pt.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '7px 10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                          <p style={{ fontSize: 11, fontWeight: 600, color: '#fff', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {pt.title}
                                          </p>
                                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                                            {fmtRelative(pt.created_at)}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: `${prioColor}22`, color: prioColor, border: `1px solid ${prioColor}44` }}>
                                            {TICKET_PRIORITY_LABELS[pt.priority as TicketPriority] ?? pt.priority}
                                          </span>
                                          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 99, background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}44` }}>
                                            {pt.state_label}
                                          </span>
                                        </div>
                                        {pt.owner_name && (
                                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '3px 0 0' }}>
                                            Técnico: {pt.owner_name}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Guest list */}
            <div className={styles.darkSection}>
              <div className={styles.guestHeader}>
                <p className={styles.sectionLabel} style={{ margin: 0 }}>
                  <Users size={10} />
                  Guests / Participantes
                </p>
                <span className={styles.guestCountBadge}>{allGuests.length}</span>
              </div>

              {allGuests.length === 0 ? (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                  Sin participantes aún.
                </p>
              ) : (
                <div className={styles.guestList}>
                  {allGuests.map((g) => (
                    <div key={g.id} className={styles.guestItem}>
                      <div className={styles.guestAvatar}>
                        {g.name.charAt(0).toUpperCase()}
                        {g.isLocal && (
                          <button
                            type="button"
                            className={styles.guestRemoveBtn}
                            onClick={() => removeGuest(g.id)}
                            title="Eliminar"
                          >
                            <X size={7} />
                          </button>
                        )}
                        <span className={styles.guestActiveDot} />
                      </div>
                      <p className={styles.guestName}>{g.name.split(' ')[0]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meetings list */}
            {meetings.length > 0 && (
              <div className={styles.darkSection}>
                <p className={styles.sectionLabel}>
                  <CalendarDays size={10} />
                  Reuniones ({meetings.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {meetings.map((m) => {
                    const provColor   = PROVIDER_COLORS[m.provider] ?? '#64748b';
                    const statusColor = STATUS_COLORS[m.status]     ?? '#64748b';
                    const dt = new Date(m.scheduled_at);
                    const isCancelled = m.status === 'cancelled';
                    return (
                      <div
                        key={m.id}
                        style={{
                          background: 'rgba(255,255,255,0.06)', borderRadius: 8,
                          padding: '10px 12px', opacity: isCancelled ? 0.5 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: provColor, textTransform: 'uppercase' }}>
                            {PROVIDER_LABELS[m.provider]}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>
                            {STATUS_LABELS[m.status]}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#fff', margin: '0 0 3px' }}>{m.reason}</p>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                          {dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {m.meeting_url && !isCancelled && (
                          <a
                            href={m.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: provColor, textDecoration: 'none', display: 'inline-block', marginTop: 4 }}
                          >
                            Unirse →
                          </a>
                        )}
                        {!isCancelled && m.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => cancelMeetMut.mutate(m.id)}
                            disabled={cancelMeetMut.isPending}
                            style={{ display: 'block', marginTop: 6, fontSize: 10, color: '#ff8a80', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                          >
                            Cancelar reunión
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
