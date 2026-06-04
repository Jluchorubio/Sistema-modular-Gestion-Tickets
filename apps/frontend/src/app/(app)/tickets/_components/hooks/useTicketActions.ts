'use client';

import { useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ticketsService, type RateTicketDto } from '@/services/tickets.service';
import { meetingsService } from '@/services/meetings.service';
import type { ModuleTechnician } from '@/types/module.types';
import type { LocalGuest } from './useTicketData';

interface UseTicketActionsProps {
  ticketId:      string;
  helpdeskId:    string | undefined;
  technicians:   ModuleTechnician[];
  qc:            QueryClient;
  /* meeting state (read) */
  meetingReason:   string;
  meetingProvider: 'google_meet' | 'teams' | 'zoom' | 'internal';
  meetingUrl:      string;
  scheduledDate:   string;
  scheduledTime:   string;
  /* meeting state (setters) */
  setScheduledDate:  React.Dispatch<React.SetStateAction<string>>;
  setScheduledTime:  React.Dispatch<React.SetStateAction<string>>;
  setMeetingUrl:     React.Dispatch<React.SetStateAction<string>>;
  setMeetingReason:  React.Dispatch<React.SetStateAction<string>>;
  /* reply / comment state */
  replyText:         string;
  commentType:       'public' | 'internal';
  /* reply state setters */
  setReplyText:      React.Dispatch<React.SetStateAction<string>>;
  /* transition state setters */
  setActiveTransId:  React.Dispatch<React.SetStateAction<string | null>>;
  setTransReason:    React.Dispatch<React.SetStateAction<string>>;
  /* guests */
  localGuests:       LocalGuest[];
  setLocalGuests:    React.Dispatch<React.SetStateAction<LocalGuest[]>>;
  /* upload error */
  setUploadError:    React.Dispatch<React.SetStateAction<string>>;
  /* relation state */
  relTarget:         { id: string; title: string } | null;
  relType:           string;
  relNotes:          string;
  setRelTarget:      React.Dispatch<React.SetStateAction<{ id: string; title: string } | null>>;
  setRelSearch:      React.Dispatch<React.SetStateAction<string>>;
  setRelNotes:       React.Dispatch<React.SetStateAction<string>>;
  setRelSearchResults: React.Dispatch<React.SetStateAction<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>>;
  setShowRelForm:    React.Dispatch<React.SetStateAction<boolean>>;
  /* validation state */
  ratingScore:       number;
  ratingComment:     string;
  rejectReason:      string;
  setIsApproving:    React.Dispatch<React.SetStateAction<boolean>>;
  setIsRejecting:    React.Dispatch<React.SetStateAction<boolean>>;
  setValidationError: React.Dispatch<React.SetStateAction<string>>;
  setShowRejectForm:  React.Dispatch<React.SetStateAction<boolean>>;
  setRejectReason:    React.Dispatch<React.SetStateAction<string>>;
}

export function useTicketActions({
  ticketId,
  technicians,
  qc,
  meetingReason,
  meetingProvider,
  meetingUrl,
  scheduledDate,
  scheduledTime,
  setScheduledDate,
  setScheduledTime,
  setMeetingUrl,
  setMeetingReason,
  replyText,
  commentType,
  setReplyText,
  setActiveTransId,
  setTransReason,
  localGuests,
  setLocalGuests,
  setUploadError,
  relTarget,
  relType,
  relNotes,
  setRelTarget,
  setRelSearch,
  setRelNotes,
  setRelSearchResults,
  setShowRelForm,
  ratingScore,
  ratingComment,
  rejectReason,
  setIsApproving,
  setIsRejecting,
  setValidationError,
  setShowRejectForm,
  setRejectReason,
}: UseTicketActionsProps) {

  /* ── Upload attachment ── */
  const uploadMut = useMutation({
    mutationFn: (file: File) => ticketsService.uploadAttachment(ticketId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setUploadError('');
    },
    onError: (e: any) =>
      setUploadError(e?.response?.data?.message ?? 'Error al subir archivo.'),
  });

  /* ── Delete attachment ── */
  const deletAttMut = useMutation({
    mutationFn: (attId: string) => ticketsService.deleteAttachment(ticketId, attId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    },
  });

  /* ── Rate ticket ── */
  const rateMut = useMutation({
    mutationFn: (dto: RateTicketDto) => ticketsService.rate(ticketId, dto),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ticket-rating', ticketId] }),
  });

  /* ── Add comment ── */
  const addCommentMut = useMutation({
    mutationFn: () =>
      ticketsService.addComment(ticketId, replyText.trim(), commentType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setReplyText('');
    },
  });

  /* ── Schedule meeting ── */
  const scheduleMut = useMutation({
    mutationFn: () =>
      meetingsService.createMeeting(ticketId, {
        reason:       meetingReason.trim() || 'Reunión de soporte',
        provider:     meetingProvider,
        meeting_url:  meetingUrl.trim() || undefined,
        scheduled_at: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setScheduledDate('');
      setScheduledTime('10:00');
      setMeetingUrl('');
      setMeetingReason('Asesoramiento técnico');
    },
  });

  /* ── Cancel meeting ── */
  const cancelMeetMut = useMutation({
    mutationFn: (meetingId: string) => meetingsService.cancelMeeting(meetingId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ticket-meetings', ticketId] }),
  });

  /* ── Add relation ── */
  const addRelMut = useMutation({
    mutationFn: () =>
      ticketsService.addRelation(ticketId, {
        target_ticket_id: relTarget!.id,
        relation_type:    relType,
        notes:            relNotes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] });
      setRelTarget(null);
      setRelSearch('');
      setRelNotes('');
      setRelSearchResults([]);
      setShowRelForm(false);
    },
  });

  /* ── Remove relation ── */
  const removeRelMut = useMutation({
    mutationFn: (relId: string) =>
      ticketsService.removeRelation(ticketId, relId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ticket-relations', ticketId] }),
  });

  /* ── FSM transition ── */
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

  /* ── Handlers ── */

  async function handleInstantCall(selectedUserId: string, setSelectedUserId: React.Dispatch<React.SetStateAction<string>>, setIsCalling: React.Dispatch<React.SetStateAction<boolean>>) {
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

  function handleSchedule() {
    if (!scheduledDate || !scheduledTime) return;
    scheduleMut.mutate();
  }

  function removeGuest(id: string) {
    setLocalGuests((prev) => prev.filter((g) => g.id !== id));
  }

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
    if (ratingScore === 0) {
      setValidationError('Selecciona una calificación para aceptar.');
      return;
    }
    setIsApproving(true);
    setValidationError('');
    try {
      await ticketsService.rate(ticketId, {
        score_overall: ratingScore,
        comment: ratingComment || undefined,
      });
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
    if (!rejectReason.trim()) {
      setValidationError('Justificación requerida.');
      return;
    }
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

  async function handleRelSearch(q: string) {
    setRelSearch(q);
    setRelTarget(null);
    if (q.trim().length < 2) {
      setRelSearchResults([]);
      return;
    }
    // setRelSearching is not passed as prop — caller must manage via wrapper if needed
    try {
      const res = await ticketsService.searchTickets(q.trim(), ticketId);
      setRelSearchResults(res);
    } catch {
      // swallow search errors silently
    }
  }

  function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Máximo 10 MB.');
      return;
    }
    setUploadError('');
    uploadMut.mutate(file);
    e.target.value = '';
  }

  return {
    /* mutations (exposed so JSX can access isPending, isError, etc.) */
    uploadMut,
    deletAttMut,
    rateMut,
    addCommentMut,
    scheduleMut,
    cancelMeetMut,
    addRelMut,
    removeRelMut,
    transMut,
    /* handlers */
    handleInstantCall,
    handleSchedule,
    removeGuest,
    handleApprove,
    handleAcceptAndRate,
    handleReject,
    handleRelSearch,
    handleFileChange,
  };
}
