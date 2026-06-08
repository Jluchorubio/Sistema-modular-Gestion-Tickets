'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ticketsService,
  type TicketAttachment,
  type TicketComment,
  type TicketAsset,
  type TicketRating,
  type RateTicketDto,
  type TicketTimelineEvent,
  SLA_STATUS_LABELS,
} from '@/services/tickets.service';
import { getSlaStatusConfig, type StatusConfig } from '@/constants/status';
import { modulesService } from '@/services/modules.service';
import { meetingsService, type TicketMeeting } from '@/services/meetings.service';
import type { ModuleTechnician } from '@/types/module.types';
import { useTicketRealtime } from './useTicketRealtime';

export interface LocalGuest {
  id:      string;
  name:    string;
  role:    string;
  isLocal: boolean;
}

interface UseTicketDataProps {
  ticketId:   string;
  helpdeskId: string | undefined;
}

export function useTicketData({ ticketId, helpdeskId }: UseTicketDataProps) {
  const qc = useQueryClient();

  /* ── Realtime — join ticket room, listen for push events ── */
  useTicketRealtime(ticketId);

  /* ── Ticket detail ── */
  const {
    data: ticket,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn:  () => ticketsService.getOne(ticketId),
    staleTime: 30_000,
    retry: 1,
  });

  /* ── Technicians ── */
  const { data: technicians = [] } = useQuery<ModuleTechnician[]>({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 5 * 60_000,
  });

  /* ── Attachments ── */
  const { data: attachments = [] } = useQuery<TicketAttachment[]>({
    queryKey: ['ticket-attachments', ticketId],
    queryFn:  () => ticketsService.getAttachments(ticketId),
    staleTime: 60_000,
  });

  /* ── Rating ── */
  const { data: existingRating } = useQuery<TicketRating | null>({
    queryKey: ['ticket-rating', ticketId],
    queryFn:  () => ticketsService.getRating(ticketId),
    enabled:  !!ticket?.is_final,
    staleTime: Infinity,
  });

  /* ── Comments ── */
  const { data: comments = [] } = useQuery<TicketComment[]>({
    queryKey: ['ticket-comments', ticketId],
    queryFn:  () => ticketsService.getComments(ticketId),
    staleTime: 30_000,
  });

  /* ── Timeline ── */
  const { data: timeline = [], isLoading: timelineLoading } = useQuery<TicketTimelineEvent[]>({
    queryKey: ['ticket-timeline', ticketId],
    queryFn:  () => ticketsService.getTimeline(ticketId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  /* ── Meetings ── */
  const { data: meetings = [] } = useQuery<TicketMeeting[]>({
    queryKey: ['ticket-meetings', ticketId],
    queryFn:  () => meetingsService.getMeetings(ticketId),
    staleTime: 30_000,
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

  /* ── Linked assets ── */
  const { data: linkedAssets = [] } = useQuery<TicketAsset[]>({
    queryKey: ['ticket-assets', ticketId],
    queryFn:  () => ticketsService.getTicketAssets(ticketId),
    staleTime: 60_000,
  });

  /* ── SLA countdown clock ── */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const slaCfg: StatusConfig | null = ticket?.sla_status
    ? getSlaStatusConfig(ticket.sla_status)
    : null;

  const slaLabel = ticket?.sla_status
    ? (SLA_STATUS_LABELS[ticket.sla_status as keyof typeof SLA_STATUS_LABELS] ?? ticket.sla_status)
    : null;

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
    if (h === 0)  return past ? `Vencido hace ${m}m`       : `Vence en ${m}m`;
    if (h < 24)   return past ? `Vencido hace ${h}h ${m}m` : `Vence en ${h}h ${m}m`;
    const d    = Math.floor(h / 24);
    const remH = h % 24;
    return past
      ? `Vencido hace ${d}d ${remH}h`
      : (remH > 0 ? `Vence en ${d}d ${remH}h` : `Vence en ${d}d`);
  }, [ticket?.sla_deadline_tracked, ticket?.sla_status, now]);

  /* ── Derived values ── */
  const ownerAssignment = ticket?.assignments?.find(
    (a: { role: string; is_active: boolean; user_id: string; user_name: string }) => a.role === 'owner' && a.is_active,
  );

  /* ── invalidateTimeline helper ── */
  const invalidateTimeline = () =>
    qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });

  /* ── allGuests computed from ticket assignments + localGuests ── */
  function computeAllGuests(
    assignments: { id: string; user_name: string; role: string; is_active: boolean }[] | undefined,
    localGuests: LocalGuest[],
  ): LocalGuest[] {
    const fromAssignments: LocalGuest[] = (assignments ?? [])
      .filter((a) => a.is_active)
      .map((a) => ({ id: a.id, name: a.user_name, role: a.role, isLocal: false }));

    const localIds = new Set(fromAssignments.map((g) => g.id));
    const merged   = [...fromAssignments];
    for (const g of localGuests) {
      if (!localIds.has(g.id)) merged.push(g);
    }
    return merged;
  }

  return {
    /* queries */
    ticket,
    isLoading,
    isError,
    error,
    technicians,
    attachments,
    existingRating,
    comments,
    timeline,
    timelineLoading,
    meetings,
    relations,
    linkedAssets,
    /* SLA */
    slaCfg,
    slaLabel,
    slaCountdown,
    /* derived */
    ownerAssignment,
    /* helpers */
    invalidateTimeline,
    computeAllGuests,
    qc,
  };
}
