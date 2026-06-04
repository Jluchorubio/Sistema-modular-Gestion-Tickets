'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, ChevronDown, Clock, AlertTriangle, CheckCircle2, XCircle,
  Phone, X, Paperclip, Link2, Search, Unlink, Star, UserX,
} from 'lucide-react';
import { TicketTimeline } from './TicketTimeline';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  ticketsService,
  type TicketPriority, type TicketAttachment, type TicketComment,
  type TicketAsset, type TicketRating, type RateTicketDto,
  type TicketTimelineEvent,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  ASSET_STATUS_COLORS, ASSET_STATUS_LABELS,
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
import { PermissionGate } from '@/components/auth/PermissionGate';
import styles from '../tickets.module.css';

interface LocalGuest {
  id:       string;
  name:     string;
  role:     string;
  isLocal:  boolean;
}

/* â”€â”€ Badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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

/* â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router      = useRouter();
  const qc          = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  /* â”€â”€ Ticket data â”€â”€ */
  const { data: ticket, isLoading, isError, error } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn:  () => ticketsService.getOne(ticketId),
    staleTime: 30_000,
    retry: 1,
  });

  /* â”€â”€ Technicians for collaborator selection (no admin permission required) â”€â”€ */
  const { data: technicians = [] } = useQuery<ModuleTechnician[]>({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 5 * 60_000,
  });

  /* â”€â”€ Left panel state â”€â”€ */
  const [transReason,     setTransReason]     = useState('');
  const [activeTransId,   setActiveTransId]   = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [replyText,       setReplyText]       = useState('');
  const [commentType,     setCommentType]     = useState<'public' | 'internal'>('public');

  /* â”€â”€ Validation state â”€â”€ */
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState('');
  const [isApproving,     setIsApproving]     = useState(false);
  const [isRejecting,     setIsRejecting]     = useState(false);
  const [validationError, setValidationError] = useState('');

  /* â”€â”€ Right panel state â”€â”€ */
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isCalling,      setIsCalling]      = useState(false);
  const [scheduledDate,  setScheduledDate]  = useState('');
  const [scheduledTime,  setScheduledTime]  = useState('10:00');
  const [meetingProvider, setMeetingProvider] = useState<'google_meet' | 'teams' | 'zoom' | 'internal'>('google_meet');
  const [meetingUrl,      setMeetingUrl]      = useState('');
  const [meetingReason,   setMeetingReason]   = useState('Asesoramiento técnico');
  const [localGuests,    setLocalGuests]    = useState<LocalGuest[]>([]);

  /* â”€â”€ Attachments â”€â”€ */
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
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setUploadError('');
    },
    onError: (e: any) => setUploadError(e?.response?.data?.message ?? 'Error al subir archivo.'),
  });

  const deletAttMut = useMutation({
    mutationFn: (attId: string) => ticketsService.deleteAttachment(ticketId, attId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    },
  });

  /* â”€â”€ Rating â”€â”€ */
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingLabel, setRatingLabel] = useState<RateTicketDto['service_label'] | ''>('');
  const [ratingComment, setRatingComment] = useState('');
  const [ratingRecommend, setRatingRecommend] = useState<boolean | null>(null);

  const { data: existingRating } = useQuery<TicketRating | null>({
    queryKey: ['ticket-rating', ticketId],
    queryFn:  () => ticketsService.getRating(ticketId),
    enabled:  !!ticket?.is_final,
    staleTime: Infinity,
  });

  const rateMut = useMutation({
    mutationFn: (dto: RateTicketDto) => ticketsService.rate(ticketId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-rating', ticketId] }),
  });

  /* â”€â”€ Comments â”€â”€ */
  const { data: comments = [] } = useQuery<TicketComment[]>({
    queryKey: ['ticket-comments', ticketId],
    queryFn:  () => ticketsService.getComments(ticketId),
    staleTime: 30_000,
  });

  /* â”€â”€ Timeline unificada â”€â”€ */
  const { data: timeline = [], isLoading: timelineLoading } = useQuery<TicketTimelineEvent[]>({
    queryKey: ['ticket-timeline', ticketId],
    queryFn:  () => ticketsService.getTimeline(ticketId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const invalidateTimeline = () => qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });

  const addCommentMut = useMutation({
    mutationFn: () => ticketsService.addComment(ticketId, replyText.trim(), commentType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
      invalidateTimeline();
      setReplyText('');
    },
  });

  /* â”€â”€ Meetings â”€â”€ */
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
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setScheduledDate(''); setScheduledTime('10:00');
      setMeetingUrl(''); setMeetingReason('Asesoramiento técnico');
    },
  });

  const cancelMeetMut = useMutation({
    mutationFn: (meetingId: string) => meetingsService.cancelMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] }),
  });

  /* â”€â”€ Relations â”€â”€ */
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

  /* â”€â”€ Linked assets â”€â”€ */
  const { data: linkedAssets = [] } = useQuery<TicketAsset[]>({
    queryKey: ['ticket-assets', ticketId],
    queryFn:  () => ticketsService.getTicketAssets(ticketId),
    staleTime: 60_000,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Máximo 10 MB.'); return; }
    setUploadError('');
    uploadMut.mutate(file);
    e.target.value = '';
  }

  /* â”€â”€ Transition mutation â”€â”€ */
  const transMut = useMutation({
    mutationFn: ({ transId, reason }: { transId: string; reason?: string }) =>
      ticketsService.transition(ticketId, transId, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setActiveTransId(null);
      setTransReason('');
    },
  });

  /* â”€â”€ Collaboration: instant call invite â”€â”€ */
  async function handleInstantCall() {
    if (!selectedUserId) return;
    setIsCalling(true);

    const user = technicians.find((u) => u.id === selectedUserId);
    if (!user) { setIsCalling(false); return; }

    try {
      await ticketsService.addAssignment(ticketId, selectedUserId, 'collaborator');
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
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

  /* â”€â”€ Collaboration: schedule meeting â”€â”€ */
  function handleSchedule() {
    if (!scheduledDate || !scheduledTime) return;
    scheduleMut.mutate();
  }

  /* â”€â”€ Guest helpers â”€â”€ */
  function removeGuest(id: string) {
    setLocalGuests((prev) => prev.filter((g) => g.id !== id));
  }

  /* â”€â”€ Compute combined guest list â”€â”€ */
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

  /* â”€â”€ Validation handlers â”€â”€ */
  async function handleApprove() {
    setIsApproving(true);
    setValidationError('');
    try {
      await ticketsService.approve(ticketId, '');
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    } catch (e: any) {
      setValidationError(e?.response?.data?.message ?? 'Error al aprobar.');
    } finally {
      setIsApproving(false);
    }
  }

  async function handleAcceptAndRate() {
    if (ratingScore === 0) { setValidationError('Selecciona una calificación para aceptar.'); return; }
    setIsApproving(true);
    setValidationError('');
    try {
      await ticketsService.rate(ticketId, { score_overall: ratingScore, comment: ratingComment || undefined });
      await ticketsService.approve(ticketId, '');
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-rating', ticketId] });
    } catch (e: any) {
      setValidationError(e?.response?.data?.message ?? 'Error al procesar.');
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
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
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

  /* â”€â”€ SLA helpers â”€â”€ */
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

  const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };
  const VARIANT_BG: Record<string, string> = { success: '#059669', primary: '#ff5e3a', danger: '#ef4444', warning: '#f59e0b', default: '#0e2235' };
  const ownerAssignment = ticket?.assignments?.find(a => a.role === 'owner' && a.is_active);

  function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.08em', margin: '0 0 10px' }}>{label}</p>
        {children}
      </div>
    );
  }

  /* â”€â”€ Render â”€â”€ */
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
            <div style={{ overflowY: 'auto', background: '#fff' }}>

              {/* Asignado a */}
              <SideSection label="Asignado a">
                {ownerAssignment ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#ff5e3a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ownerAssignment.user_name?.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ownerAssignment.user_name}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Técnico asignado</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <UserX size={13} style={{ color: '#94a3b8' }} />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin asignar</span>
                  </div>
                )}
              </SideSection>

              {/* Solicitante */}
              <SideSection label="Solicitante">
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ticket.creator_name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ticket.creator_name}</p>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Solicitante</p>
                  </div>
                </div>
              </SideSection>

              {/* Cambiar estado */}
              <PermissionGate perm="helpdesk:tickets:edit">
              {!ticket.is_final && ticket.transitions.length > 0 && (
                <SideSection label="Cambiar estado">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ticket.transitions.map(tr => {
                      const VBGS: Record<string, string> = { success: '#059669', primary: '#ff5e3a', danger: '#ef4444', warning: '#f59e0b', default: '#0e2235' };
                      const bg = VBGS[tr.variant ?? 'default'] ?? '#0e2235';
                      const isAct = activeTransId === tr.id;
                      return (
                        <button key={tr.id} type="button"
                          onClick={() => setActiveTransId(isAct ? null : tr.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, border: 'none', background: isAct ? '#475569' : bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                          {tr.variant === 'success' ? <CheckCircle2 size={12} /> : tr.variant === 'danger' ? <XCircle size={12} /> : <ChevronRight size={12} />}
                          {tr.to_label}
                        </button>
                      );
                    })}
                  </div>
                </SideSection>
              )}
              </PermissionGate>

              {/* Detalles */}
              <SideSection label="Detalles">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    ['Módulo',      ticket.module_name],
                    ['Categoría',   ticket.category_name],
                    ['Tipo de daño', ticket.damage_type_label],
                    ['Prioridad', ticket.priority],
                    ['Urgencia',  ticket.urgency],
                    ['Impacto',   ticket.impact],
                    ['Creado',    fmtDate(ticket.created_at)],
                    ['ID',        '#' + ticket.id.slice(0, 8).toUpperCase()],
                    ...(ticket.reprocess_count > 0 ? [['Reaperturas', String(ticket.reprocess_count)]] : []),
                  ] as [string, string | null | undefined][]).map(([lbl, val]) => val ? (
                    <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{lbl}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{val}</span>
                    </div>
                  ) : null)}
                </div>
              </SideSection>

              {/* SLA */}
              <SideSection label="SLA">
                {ticket.sla_deadline_tracked ? (
                  <div style={{ padding: '10px 11px', background: `${slaColor}08`, borderRadius: 8, border: `1px solid ${slaColor}25` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Deadline</span>
                      {slaLabel && <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 3px' }}>{fmtDate(ticket.sla_deadline_tracked)}</p>
                    {slaCountdown && <p style={{ fontSize: 13, fontWeight: 800, color: slaColor, margin: 0 }}>{slaCountdown}</p>}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Sin SLA configurado</p>
                )}
                {ticket.escalated && ticket.escalation_note?.startsWith('Auto-escalado') && (
                  <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 7, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', gap: 6 }}>
                    <AlertTriangle size={11} style={{ color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 10, color: '#9a3412', margin: 0, lineHeight: 1.4 }}>Auto-escalado por recurrencia</p>
                  </div>
                )}
              </SideSection>

              {/* Activo */}
              {linkedAssets.length > 0 && (
                <SideSection label={`Activo (${linkedAssets.length})`}>
                  {linkedAssets.map(asset => {
                    const sc = ASSET_STATUS_COLORS[asset.status] ?? '#94a3b8';
                    return (
                      <div key={asset.id} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 6 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
                            {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                          </span>
                          <button type="button" onClick={() => router.push('/inventory/' + asset.id)}
                            style={{ fontSize: 10, fontWeight: 700, color: '#ff5e3a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                            Ver <ChevronRight size={10} />
                          </button>
                        </div>
                        {asset.assigned_to_name && (
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>Custodio: {asset.assigned_to_name}</p>
                        )}
                      </div>
                    );
                  })}
                </SideSection>
              )}

              {/* Participantes */}
              <SideSection label={`Participantes (${allGuests.length})`}>
                {allGuests.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
                    {allGuests.map(g => (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{g.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                          <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>{g.role}</p>
                        </div>
                        {g.isLocal && (
                          <button type="button" onClick={() => removeGuest(g.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0 }}>
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                  style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', marginBottom: 6, boxSizing: 'border-box' as const }}>
                  <option value="">Invitar tecnico...</option>
                  {technicians.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
                <button type="button" disabled={!selectedUserId || isCalling} onClick={handleInstantCall}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '6px', borderRadius: 7, border: 'none', background: selectedUserId && !isCalling ? '#0e2235' : '#e2e8f0', color: selectedUserId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: selectedUserId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  <Phone size={11} /> {isCalling ? 'Invitando...' : 'Invitar'}
                </button>
              </SideSection>

              {/* Reuniones */}
              <SideSection label={meetings.length > 0 ? `Reuniones (${meetings.length})` : 'Reuniones'}>
                {meetings.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
                    {meetings.map(m => {
                      const pc = PROVIDER_COLORS[m.provider] ?? '#64748b';
                      const sc2 = STATUS_COLORS[m.status] ?? '#64748b';
                      const dt = new Date(m.scheduled_at);
                      return (
                        <div key={m.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0', opacity: m.status === 'cancelled' ? .5 : 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: pc, textTransform: 'uppercase' as const }}>{PROVIDER_LABELS[m.provider]}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: sc2 }}>{STATUS_LABELS[m.status]}</span>
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 1px' }}>{m.reason}</p>
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} - {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                          {m.meeting_url && m.status !== 'cancelled' && <a href={m.meeting_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: pc, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>Unirse</a>}
                          {m.status === 'scheduled' && (
                            <button type="button" onClick={() => cancelMeetMut.mutate(m.id)} disabled={cancelMeetMut.isPending}
                              style={{ display: 'block', marginTop: 3, fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                              Cancelar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <select value={meetingProvider} onChange={e => setMeetingProvider(e.target.value as typeof meetingProvider)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' as const }}>
                    <option value="google_meet">Google Meet</option>
                    <option value="teams">Microsoft Teams</option>
                    <option value="zoom">Zoom</option>
                    <option value="internal">Enlace interno</option>
                  </select>
                  <input value={meetingReason} onChange={e => setMeetingReason(e.target.value)} placeholder="Motivo *"
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', boxSizing: 'border-box' as const, outline: 'none' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                      style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none' }} />
                    <select value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                      style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                      {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <button type="button" disabled={!scheduledDate || !meetingReason.trim() || scheduleMut.isPending} onClick={() => scheduleMut.mutate()}
                    style={{ width: '100%', padding: '6px', borderRadius: 7, border: 'none', background: scheduledDate && meetingReason.trim() ? '#ff5e3a' : '#e2e8f0', color: scheduledDate && meetingReason.trim() ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {scheduleMut.isPending ? 'Programando...' : 'Programar reunion'}
                  </button>
                </div>
              </SideSection>

              {/* Relacionados */}
              {(relations.length > 0 || !ticket.is_final) && (
                <SideSection label={relations.length > 0 ? `Relacionados (${relations.length})` : 'Relacionados'}>
                  {relations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                      {relations.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.related_title ?? r.id.slice(0,8)}</p>
                            <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>{r.relation_type}</p>
                          </div>
                          <button type="button" onClick={() => router.push('/helpdesk/ticket/' + r.related_id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                            <ChevronRight size={11} />
                          </button>
                          {!ticket.is_final && (
                            <button type="button" onClick={() => removeRelMut.mutate(r.id)} disabled={removeRelMut.isPending}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0 }}>
                              <Unlink size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!ticket.is_final && !showRelForm && (
                    <button type="button" onClick={() => setShowRelForm(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#64748b', background: 'none', border: '1px dashed #e2e8f0', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                      <Link2 size={10} /> Vincular ticket
                    </button>
                  )}
                  {!ticket.is_final && showRelForm && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 11px' }}>
                      <div style={{ position: 'relative', marginBottom: 5 }}>
                        <Search size={10} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input type="text" placeholder="Buscar ticket..." value={relSearch} onChange={e => handleRelSearch(e.target.value)}
                          style={{ width: '100%', padding: '5px 7px 5px 22px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      {relSearchResults.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 5 }}>
                          {relSearchResults.map(r => (
                            <button key={r.id} type="button" onClick={() => setRelTarget(r)}
                              style={{ fontSize: 10, padding: '4px 7px', borderRadius: 5, border: `1px solid ${relTarget?.id === r.id ? '#6366f1' : '#e2e8f0'}`, background: relTarget?.id === r.id ? '#eef2ff' : '#fff', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              #{r.id.slice(0,6)} - {r.title}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" onClick={() => { setShowRelForm(false); setRelSearch(''); setRelTarget(null); setRelSearchResults([]); }}
                          style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                          Cancelar
                        </button>
                        <button type="button" disabled={!relTarget || addRelMut.isPending} onClick={() => { if (relTarget) addRelMut.mutate(); }}
                          style={{ flex: 1, padding: '5px', borderRadius: 5, border: 'none', background: relTarget ? '#6366f1' : '#e2e8f0', color: '#fff', fontSize: 10, fontWeight: 700, cursor: relTarget ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                          {addRelMut.isPending ? '...' : 'Vincular'}
                        </button>
                      </div>
                    </div>
                  )}
                </SideSection>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
