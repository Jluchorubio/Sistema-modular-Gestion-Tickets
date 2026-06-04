'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, Clock, AlertTriangle, CheckCircle2,
  Users, Phone, CalendarDays, X, Paperclip, ScrollText,
  Upload, FileText, ImageIcon, Trash2, HardDrive, History, Link2, Search, Unlink, Star,
} from 'lucide-react';
import { TicketTimeline } from './TicketTimeline';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { useAuthStore } from '@/stores/auth.store';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  ticketsService,
  type TicketPriority, type TicketAttachment, type TicketComment,
  type TicketAsset, type AssetHistoryEntry, type TicketRating, type RateTicketDto,
  type TicketTimelineEvent,
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
  const [transReason,   setTransReason]   = useState('');
  const [activeTransId, setActiveTransId] = useState<string | null>(null);
  const [replyText,     setReplyText]     = useState('');
  const [commentType,   setCommentType]   = useState<'public' | 'internal'>('public');

  /* â”€â”€ Validation state â”€â”€ */
  const [signature,       setSignature]       = useState('');
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
    if (!signature.trim()) { setValidationError('Firma requerida.'); return; }
    setIsApproving(true);
    setValidationError('');
    try {
      await ticketsService.approve(ticketId, signature.trim());
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
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
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8fafc' }}>

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STICKY HEADER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <button type="button" onClick={() => router.push('/helpdesk')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer', flexShrink: 0 }}>
              <ArrowLeft size={12} /> Volver
            </button>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
              <span>Mesa de Ayuda</span>
              <ChevronRight size={11} />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ff5e3a' }}>#{ticket.id.slice(0, 8).toUpperCase()}</span>
            </div>

            {/* Title */}
            <p style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 700, color: '#0e2235', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.title}
            </p>

            {/* State + Priority + SLA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: ticket.is_final ? '#f0fdf4' : '#eff6ff', color: ticket.is_final ? '#16a34a' : '#1d4ed8', border: `1px solid ${ticket.is_final ? '#bbf7d0' : '#bfdbfe'}` }}>
                {ticket.state_label}
              </span>
              <PriorityBadge priority={ticket.priority} />
              {slaCountdown && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: `${slaColor}15`, color: slaColor, border: `1px solid ${slaColor}30` }}>
                  {slaCountdown}
                </span>
              )}
            </div>

            {/* Quick transition buttons — variant-driven, no keyword matching */}
            <PermissionGate perm="helpdesk:tickets:edit">
            {!ticket.is_final && ticket.transitions.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {ticket.transitions.slice(0, 3).map((tr) => {
                  const VARIANT_BG: Record<string, string> = {
                    success: '#059669',
                    primary: '#ff5e3a',
                    danger:  '#ef4444',
                    warning: '#f59e0b',
                    default: '#0e2235',
                  };
                  const bg = VARIANT_BG[tr.variant ?? 'default'] ?? '#0e2235';
                  const isActive = activeTransId === tr.id;
                  return (
                    <button key={tr.id} type="button"
                      onClick={() => setActiveTransId(isActive ? null : tr.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: 'none', background: isActive ? '#475569' : bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {tr.variant === 'success' ? <CheckCircle2 size={11} /> : <ChevronRight size={11} />}
                      {tr.to_label}
                    </button>
                  );
                })}
              </div>
            )}
            </PermissionGate>
          </div>

          {/* Transition confirm bar */}
          {activeTransId && (
            <div style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>Motivo (opcional):</span>
              <input value={transReason} onChange={e => setTransReason(e.target.value)}
                placeholder="Describe el cambio de estado…"
                style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              <button type="button" onClick={() => { setActiveTransId(null); setTransReason(''); }}
                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                Cancelar
              </button>
              <button type="button" onClick={() => transMut.mutate({ transId: activeTransId, reason: transReason })} disabled={transMut.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: transMut.isPending ? .7 : 1 }}>
                <CheckCircle2 size={11} /> {transMut.isPending ? 'Aplicando…' : 'Confirmar'}
              </button>
            </div>
          )}

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• 3-COLUMN BODY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr 256px', flex: 1, overflow: 'hidden' }}>

            {/* â•â•â•â• LEFT PANEL â•â•â•â• */}
            <div style={{ borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 18, background: '#fff' }}>

              {/* Solicitante */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Solicitante</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ticket.creator_name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ticket.creator_name}</p>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Solicitante</p>
                  </div>
                </div>
              </div>

              {/* Activo asociado */}
              {linkedAssets.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Activo asociado</p>
                  {linkedAssets.map((asset) => {
                    const sColor = ASSET_STATUS_COLORS[asset.status] ?? '#94a3b8';
                    return (
                      <div key={asset.id} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 9, border: '1px solid #e2e8f0' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${sColor}18`, color: sColor, border: `1px solid ${sColor}30` }}>
                            {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                          </span>
                          <button type="button" onClick={() => router.push('/inventory/' + asset.id)}
                            style={{ fontSize: 10, fontWeight: 700, color: '#ff5e3a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                            Ver activo <ChevronRight size={10} />
                          </button>
                        </div>
                        {asset.assigned_to_name && (
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>Custodio: {asset.assigned_to_name}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Info */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Información</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    ['Módulo',     ticket.module_name],
                    ['Categoría',  ticket.category_name],
                    ['Ambiente',   ticket.environment_name],
                    ['Creado',     fmtDate(ticket.created_at)],
                    ['ID interno', '#' + ticket.id.slice(0, 8).toUpperCase()],
                    ...((ticket as any).damage_type_label ? [['Tipo daño', (ticket as any).damage_type_label]] : []),
                    ...(ticket.reprocess_count > 0 ? [['Reproces.', `${ticket.reprocess_count} vez${ticket.reprocess_count > 1 ? 'es' : ''}`]] : []),
                  ].map(([lbl, val]) => val ? (
                    <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{lbl}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{val}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* SLA */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>SLA</p>
                {ticket.sla_deadline_tracked ? (
                  <div style={{ padding: '10px 12px', background: `${slaColor}08`, borderRadius: 9, border: `1px solid ${slaColor}25` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Deadline</span>
                      {slaLabel && <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 4px' }}>{fmtDate(ticket.sla_deadline_tracked)}</p>
                    {slaCountdown && <p style={{ fontSize: 13, fontWeight: 800, color: slaColor, margin: 0 }}>{slaCountdown}</p>}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>Sin SLA configurado</p>
                )}
                {ticket.escalated && ticket.escalation_note?.startsWith('Auto-escalado') && (
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', gap: 6 }}>
                    <AlertTriangle size={12} style={{ color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 10, color: '#9a3412', margin: 0, lineHeight: 1.4 }}>Auto-escalado por recurrencia</p>
                  </div>
                )}
              </div>

              {/* Historial estados (vertical) */}
              {ticket.history.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 10px' }}>Historial de estados</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Estado actual */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: ticket.is_final ? '#22c55e' : '#6366f1', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0e2235' }}>{ticket.state_label}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: ticket.is_final ? '#22c55e' : '#6366f1', background: ticket.is_final ? '#f0fdf4' : '#eef2ff', padding: '1px 6px', borderRadius: 4, border: `1px solid ${ticket.is_final ? '#bbf7d0' : '#c7d2fe'}` }}>
                        {ticket.is_final ? 'Final' : 'Actual'}
                      </span>
                    </div>
                    {/* Línea vertical */}
                    {ticket.history.map((h, i) => (
                      <div key={h.id} style={{ display: 'flex', gap: 8, paddingLeft: 4, paddingBottom: 8, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, background: '#e2e8f0' }} />
                        <div style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid #e2e8f0', background: '#fff', flexShrink: 0, marginTop: 2, zIndex: 1 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>{h.to_label}</span>
                          </div>
                          <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>
                            {h.actor_name} · {fmtDate(h.transitioned_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tickets relacionados */}
              {relations.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>
                    Relacionados ({relations.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {relations.map((r) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.related_title ?? r.id.slice(0, 8)}</p>
                          <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>{r.relation_type}</p>
                        </div>
                        <button type="button" onClick={() => router.push('/helpdesk/ticket/' + r.related_id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center' }}>
                          <ChevronRight size={12} />
                        </button>
                        {!ticket.is_final && (
                          <button type="button" onClick={() => removeRelMut.mutate(r.id)} disabled={removeRelMut.isPending}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <Unlink size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Link related ticket form */}
              {!ticket.is_final && (
                <div>
                  {!showRelForm ? (
                    <button type="button" onClick={() => setShowRelForm(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#64748b', background: 'none', border: '1px dashed #e2e8f0', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                      <Link2 size={10} /> Vincular ticket relacionado
                    </button>
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 12px' }}>
                      <div style={{ position: 'relative', marginBottom: 6 }}>
                        <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input type="text" placeholder="Buscar ticket…" value={relSearch} onChange={(e) => handleRelSearch(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px 6px 26px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
                      </div>
                      {relSearchResults.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                          {relSearchResults.map((r) => (
                            <button key={r.id} type="button" onClick={() => setRelTarget(r)}
                              style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${relTarget?.id === r.id ? '#6366f1' : '#e2e8f0'}`, background: relTarget?.id === r.id ? '#eef2ff' : '#fff', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              #{r.id.slice(0, 6)} — {r.title}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button type="button" onClick={() => { setShowRelForm(false); setRelSearch(''); setRelTarget(null); setRelSearchResults([]); }}
                          style={{ flex: 1, padding: '5px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                          Cancelar
                        </button>
                        <button type="button" disabled={!relTarget || addRelMut.isPending} onClick={() => { if (relTarget) { setRelTarget(relTarget); addRelMut.mutate(); } }}
                          style={{ flex: 1, padding: '5px', borderRadius: 6, border: 'none', background: relTarget ? '#6366f1' : '#e2e8f0', color: '#fff', fontSize: 10, fontWeight: 700, cursor: relTarget ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                          {addRelMut.isPending ? '…' : 'Vincular'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* â•â•â•â• CENTER PANEL â•â•â•â• */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Validation banner */}
              {ticket.is_approval_state && currentUser?.id === ticket.created_by && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} /> Validación de solución requerida
                  </p>
                  {!showRejectForm ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                      <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Escribe tu nombre como firma…"
                        style={{ flex: 1, minWidth: 180, padding: '7px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                      <button type="button" onClick={handleApprove} disabled={isApproving || !signature.trim()}
                        style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: isApproving || !signature.trim() ? '#94a3b8' : '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {isApproving ? '…' : '✓ Aprobar'}
                      </button>
                      <button type="button" onClick={() => setShowRejectForm(true)}
                        style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✗ Rechazar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Justificación del rechazo…" rows={2}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #fecaca', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <button type="button" onClick={handleReject} disabled={isRejecting || !rejectReason.trim()}
                          style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {isRejecting ? '…' : 'Confirmar'}
                        </button>
                        <button type="button" onClick={() => { setShowRejectForm(false); setRejectReason(''); }}
                          style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {validationError && <p style={{ fontSize: 11, color: '#dc2626', margin: '6px 0 0' }}>{validationError}</p>}
                </div>
              )}

              {/* Rating banner */}
              {ticket.is_final && currentUser?.id === ticket.created_by && !existingRating && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff7ed', flexShrink: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#92400e', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Star size={13} /> Califica tu experiencia
                  </p>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onClick={() => setRatingScore(s)}
                        onMouseEnter={() => setRatingHover(s)} onMouseLeave={() => setRatingHover(0)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                        <Star size={20} fill={(ratingHover || ratingScore) >= s ? '#f59e0b' : 'none'} stroke={(ratingHover || ratingScore) >= s ? '#f59e0b' : '#d1d5db'} />
                      </button>
                    ))}
                    {ratingScore > 0 && <span style={{ fontSize: 11, color: '#92400e', alignSelf: 'center', marginLeft: 4, fontWeight: 600 }}>
                      {['','Muy malo','Malo','Regular','Bueno','Excelente'][ratingScore]}
                    </span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Comentario opcional…" rows={1}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid #fde68a', fontSize: 11, fontFamily: 'inherit', outline: 'none', resize: 'none' }} />
                    <button type="button" disabled={ratingScore === 0 || rateMut.isPending}
                      onClick={() => rateMut.mutate({ score_overall: ratingScore, comment: ratingComment || undefined })}
                      style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: ratingScore > 0 ? '#f59e0b' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: ratingScore > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                      {rateMut.isPending ? '…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Rating already submitted */}
              {ticket.is_final && currentUser?.id === ticket.created_by && existingRating && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f0fdf4', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>Calificación enviada — {existingRating.score_overall}/5 ⭐</span>
                </div>
              )}

              {/* Timeline — scrollable */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <TicketTimeline events={timeline} isLoading={timelineLoading} autoScroll />
              </div>

              {/* Reply box */}
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
                        <option value="public">Público</option>
                        <option value="internal">Interno</option>
                      </select>
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '3px 8px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Paperclip size={10} /> {uploadMut.isPending ? '…' : 'Adjuntar'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                        placeholder={commentType === 'internal' ? 'Nota interna (solo el equipo técnico)…' : 'Escribe tu respuesta…'}
                        rows={2}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' as const }}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyText.trim()) { e.preventDefault(); addCommentMut.mutate(); } }}
                      />
                      <button type="button" disabled={!replyText.trim() || addCommentMut.isPending} onClick={() => addCommentMut.mutate()}
                        style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: replyText.trim() && !addCommentMut.isPending ? '#0e2235' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: replyText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0 }}>
                        {addCommentMut.isPending ? '…' : 'Enviar'}
                      </button>
                    </div>
                    {addCommentMut.isError && <p style={{ fontSize: 10, color: '#dc2626', margin: '4px 0 0' }}>Error al enviar.</p>}
                    {uploadError && <p style={{ fontSize: 10, color: '#dc2626', margin: '4px 0 0' }}>{uploadError}</p>}
                  </>
                )}
                </PermissionGate>
              </div>
            </div>

            {/* â•â•â•â• RIGHT PANEL â•â•â•â• */}
            <div style={{ borderLeft: '1px solid #e2e8f0', overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16, background: '#fff' }}>

              {/* Transitions */}
              <PermissionGate perm="helpdesk:tickets:edit">
              {!ticket.is_final && ticket.transitions.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Cambiar estado</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ticket.transitions.map((tr) => {
                      const VARIANT_BG: Record<string, string> = {
                        success: '#059669', primary: '#ff5e3a',
                        danger: '#ef4444', warning: '#f59e0b', default: '#0e2235',
                      };
                      const bg = VARIANT_BG[tr.variant ?? 'default'] ?? '#0e2235';
                      return (
                        <button key={tr.id} type="button"
                          onClick={() => setActiveTransId(activeTransId === tr.id ? null : tr.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: activeTransId === tr.id ? '#475569' : bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                          {tr.variant === 'success' ? <CheckCircle2 size={12} /> : <ChevronRight size={12} />}
                          {tr.to_label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </PermissionGate>

              {/* Colaborador */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Solicitar colaborador</p>
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', marginBottom: 6, boxSizing: 'border-box' as const }}>
                  <option value="">Seleccionar técnico…</option>
                  {technicians.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                </select>
                <button type="button" disabled={!selectedUserId || isCalling} onClick={handleInstantCall}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px', borderRadius: 8, border: 'none', background: selectedUserId && !isCalling ? '#0e2235' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: selectedUserId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  <Phone size={11} /> {isCalling ? 'Invitando…' : 'Invitar'}
                </button>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: 0 }} />

              {/* Reunión */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Programar reunión</p>
                <select value={meetingProvider} onChange={e => setMeetingProvider(e.target.value as typeof meetingProvider)}
                  style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', marginBottom: 5, boxSizing: 'border-box' as const }}>
                  <option value="google_meet">Google Meet</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="zoom">Zoom</option>
                  <option value="internal">Enlace interno</option>
                </select>
                <input value={meetingReason} onChange={e => setMeetingReason(e.target.value)} placeholder="Motivo *"
                  style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', marginBottom: 5, boxSizing: 'border-box' as const, outline: 'none' }} />
                <input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="URL reunión (opcional)"
                  style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', marginBottom: 5, boxSizing: 'border-box' as const, outline: 'none' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
                  <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none' }} />
                  <select value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                    {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <button type="button" disabled={!scheduledDate || !meetingReason.trim() || scheduleMut.isPending} onClick={handleSchedule}
                  style={{ width: '100%', padding: '7px', borderRadius: 8, border: 'none', background: scheduledDate && meetingReason.trim() ? '#ff5e3a' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {scheduleMut.isPending ? 'Programando…' : 'Programar'}
                </button>
              </div>

              {/* Meetings list */}
              {meetings.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>Reuniones ({meetings.length})</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {meetings.map(m => {
                      const pc = PROVIDER_COLORS[m.provider] ?? '#64748b';
                      const sc = STATUS_COLORS[m.status] ?? '#64748b';
                      const dt = new Date(m.scheduled_at);
                      return (
                        <div key={m.id} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', opacity: m.status === 'cancelled' ? .5 : 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: pc, textTransform: 'uppercase' }}>{PROVIDER_LABELS[m.provider]}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, color: sc }}>{STATUS_LABELS[m.status]}</span>
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 2px' }}>{m.reason}</p>
                          <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                            {dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {m.meeting_url && m.status !== 'cancelled' && (
                            <a href={m.meeting_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: pc, textDecoration: 'none', display: 'inline-block', marginTop: 3 }}>Unirse →</a>
                          )}
                          {m.status === 'scheduled' && (
                            <button type="button" onClick={() => cancelMeetMut.mutate(m.id)} disabled={cancelMeetMut.isPending}
                              style={{ display: 'block', marginTop: 4, fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                              Cancelar reunión
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: 0 }} />

              {/* Participants */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 8px' }}>
                  Participantes ({allGuests.length})
                </p>
                {allGuests.length === 0 ? (
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>Sin participantes aún.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allGuests.map(g => (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{g.name.charAt(0).toUpperCase()}</span>
                          <span style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, background: '#22c55e', borderRadius: '50%', border: '1.5px solid #fff' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                          <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>{g.role}</p>
                        </div>
                        {g.isLocal && (
                          <button type="button" onClick={() => removeGuest(g.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0, display: 'flex' }}>
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
