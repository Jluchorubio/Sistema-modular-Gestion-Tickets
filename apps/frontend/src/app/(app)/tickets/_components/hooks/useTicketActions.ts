'use client';

import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ticketsService, type RateTicketDto } from '@/services/tickets.service';
import { meetingsService } from '@/services/meetings.service';
import type { ModuleTechnician } from '@/types/module.types';
import type { LocalGuest } from './useTicketData';

interface ScheduleMeetingData {
  provider:    string;
  reason:      string;
  scheduledAt: string;
  url?:        string;
}

interface AddRelationData {
  targetId:     string;
  relationType: string;
  notes?:       string;
}

interface UseTicketActionsProps {
  ticketId:    string;
  technicians: ModuleTechnician[];
  qc:          QueryClient;
  /* Left panel state (comment box) */
  replyText:   string;
  commentType: 'public' | 'internal';
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  /* Validation state (approve/reject flow) */
  ratingScore:        number;
  ratingComment:      string;
  rejectReason:       string;
  setIsApproving:     React.Dispatch<React.SetStateAction<boolean>>;
  setIsRejecting:     React.Dispatch<React.SetStateAction<boolean>>;
  setValidationError: React.Dispatch<React.SetStateAction<string>>;
  setShowRejectForm:  React.Dispatch<React.SetStateAction<boolean>>;
  setRejectReason:    React.Dispatch<React.SetStateAction<string>>;
  /* Upload error */
  setUploadError: React.Dispatch<React.SetStateAction<string>>;
  /* Guests (instant call) */
  localGuests:    LocalGuest[];
  setLocalGuests: React.Dispatch<React.SetStateAction<LocalGuest[]>>;
}

export function useTicketActions({
  ticketId, technicians, qc,
  replyText, commentType, setReplyText,
  ratingScore, ratingComment, rejectReason,
  setIsApproving, setIsRejecting, setValidationError,
  setShowRejectForm, setRejectReason,
  setUploadError,
  localGuests, setLocalGuests,
}: UseTicketActionsProps) {

  /* ── Left panel: attachments ─────────────────────────────────────── */

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

  /* ── Left panel: comments ────────────────────────────────────────── */

  const addCommentMut = useMutation({
    mutationFn: () => ticketsService.addComment(ticketId, replyText.trim(), commentType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setReplyText('');
    },
  });

  /* ── Left panel: rating ──────────────────────────────────────────── */

  const rateMut = useMutation({
    mutationFn: (dto: RateTicketDto) => ticketsService.rate(ticketId, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-rating', ticketId] }),
  });

  /* ── Left panel: FSM transition ──────────────────────────────────── */

  const transMut = useMutation({
    mutationFn: ({ transId, reason }: { transId: string; reason?: string }) =>
      ticketsService.transition(ticketId, transId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    },
  });

  /* ── Sidebar: meetings ───────────────────────────────────────────── */

  const scheduleMut = useMutation({
    mutationFn: (data: ScheduleMeetingData) =>
      meetingsService.createMeeting(ticketId, {
        reason:       data.reason || 'Reunión de soporte',
        provider:     data.provider as any,
        meeting_url:  data.url || undefined,
        scheduled_at: data.scheduledAt,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    },
  });

  const cancelMeetMut = useMutation({
    mutationFn: (meetingId: string) => meetingsService.cancelMeeting(meetingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] }),
  });

  /* ── Sidebar: relations ──────────────────────────────────────────── */

  const addRelMut = useMutation({
    mutationFn: (data: AddRelationData) =>
      ticketsService.addRelation(ticketId, {
        target_ticket_id: data.targetId,
        relation_type:    data.relationType,
        notes:            data.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] }),
  });

  const removeRelMut = useMutation({
    mutationFn: (relId: string) => ticketsService.removeRelation(ticketId, relId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] }),
  });

  /* ── Sidebar: instant call (add collaborator) ────────────────────── */

  async function handleInstantCall(
    selectedUserId: string,
    setSelectedUserId: (v: string) => void,
    setIsCalling:      (v: boolean) => void,
  ) {
    if (!selectedUserId) return;
    setIsCalling(true);
    const user = technicians.find(u => u.id === selectedUserId);
    if (!user) { setIsCalling(false); return; }
    try {
      await ticketsService.addAssignment(ticketId, selectedUserId, 'collaborator');
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    } catch { /* still add to UI list */ }
    setTimeout(() => {
      setIsCalling(false);
      const name = `${user.first_name} ${user.last_name}`.trim();
      setLocalGuests(prev => {
        if (prev.some(g => g.id === user.id)) return prev;
        return [...prev, { id: user.id, name, role: user.role_name, isLocal: true }];
      });
    }, 2000);
  }

  function removeGuest(id: string) {
    setLocalGuests(prev => prev.filter(g => g.id !== id));
  }

  /* ── Left panel: validation (approve / reject) ───────────────────── */

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
    } finally { setIsApproving(false); }
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
    } finally { setIsApproving(false); }
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
      if (result.escalated) alert('Ticket escalado al Jefe Técnico con prioridad Alta.');
    } catch (e: any) {
      setValidationError(e?.response?.data?.message ?? 'Error al rechazar.');
    } finally { setIsRejecting(false); }
  }

  /* ── File input handler ──────────────────────────────────────────── */

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Máximo 10 MB.'); return; }
    setUploadError('');
    uploadMut.mutate(file);
    e.target.value = '';
  }

  return {
    /* mutations */
    uploadMut, deletAttMut, addCommentMut, rateMut, transMut,
    scheduleMut, cancelMeetMut, addRelMut, removeRelMut,
    /* handlers */
    handleInstantCall, removeGuest,
    handleApprove, handleAcceptAndRate, handleReject, handleFileChange,
  };
}
