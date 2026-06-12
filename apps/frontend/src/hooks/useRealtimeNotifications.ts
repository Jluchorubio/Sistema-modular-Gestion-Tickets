'use client';
import { useEffect, useRef } from 'react';
import { useQueryClient }   from '@tanstack/react-query';
import { socketService }    from '@/services/socket.service';
import { tokens }           from '@/lib/tokens';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';

export function useRealtimeNotifications() {
  const qc           = useQueryClient();
  const connectedRef = useRef(false);

  useEffect(() => {
    const token = tokens.getAccess();
    if (!token || connectedRef.current) return;

    const socket = socketService.connect(token);
    connectedRef.current = true;

    socket.on('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications-me'] });
      qc.invalidateQueries({ queryKey: ['notifications-history'] });
    });

    socket.on('config:branding:updated', () => {
      qc.invalidateQueries({ queryKey: ['company-public'] });
    });

    /* ── Tech presence: status change from availability update ── */
    socket.on('tech:status_changed', ({ userId, status }: { userId: string; status: string }) => {
      qc.setQueriesData<ModuleTechnician[]>(
        { queryKey: ['module-technicians'], exact: false },
        (old) => old?.map(t => t.id === userId
          ? { ...t, avail_status: status as TechAvailStatus, is_available: !['fuera_horario','ausente','offline'].includes(status) }
          : t,
        ),
      );
    });

    /* ── Presence: connect/disconnect ── */
    socket.on('presence:change', ({ userId, connected, lastSeenAt }: { userId: string; connected: boolean; lastSeenAt?: string }) => {
      if (!connected) {
        qc.setQueriesData<ModuleTechnician[]>(
          { queryKey: ['module-technicians'], exact: false },
          (old) => old?.map(t => t.id === userId
            ? { ...t, avail_status: 'offline' as TechAvailStatus, is_available: false, last_seen_at: lastSeenAt ?? null }
            : t,
          ),
        );
      }
    });

    /* ── Ticket queue updated (assign/transition) → refresh queue ── */
    socket.on('ticket:queue_updated', () => {
      qc.invalidateQueries({ queryKey: ['queue-unassigned'],    exact: false });
      qc.invalidateQueries({ queryKey: ['my-assigned-tickets'], exact: false });
      qc.invalidateQueries({ queryKey: ['tickets'],             exact: false });
    });

    /* ── Ticket state changed → invalidate detail + assignment lists ── */
    socket.on('ticket:state_changed', (payload: { ticketId?: string }) => {
      if (payload?.ticketId) {
        qc.invalidateQueries({ queryKey: ['ticket-detail', payload.ticketId] });
        qc.invalidateQueries({ queryKey: ['ticket-timeline', payload.ticketId] });
      }
      qc.invalidateQueries({ queryKey: ['tickets'], exact: false });
    });

    /* ── New comment → invalidate timeline ── */
    socket.on('ticket:comment_added', (payload: { ticketId?: string }) => {
      if (payload?.ticketId) {
        qc.invalidateQueries({ queryKey: ['ticket-timeline', payload.ticketId] });
        qc.invalidateQueries({ queryKey: ['ticket-detail', payload.ticketId] });
      }
    });

    /* ── Assignment → invalidate detail + queue ── */
    socket.on('ticket:assigned', (payload: { ticketId?: string }) => {
      if (payload?.ticketId) {
        qc.invalidateQueries({ queryKey: ['ticket-detail', payload.ticketId] });
      }
      qc.invalidateQueries({ queryKey: ['queue-unassigned'],    exact: false });
      qc.invalidateQueries({ queryKey: ['my-assigned-tickets'], exact: false });
    });

    socket.on('connect', () => {
      qc.invalidateQueries({ queryKey: ['notifications-me'] });
    });

    socket.on('disconnect', () => {
      connectedRef.current = false;
    });

    return () => {
      socket.off('notification');
      socket.off('config:branding:updated');
      socket.off('tech:status_changed');
      socket.off('presence:change');
      socket.off('ticket:queue_updated');
      socket.off('ticket:state_changed');
      socket.off('ticket:comment_added');
      socket.off('ticket:assigned');
      socket.off('connect');
      socket.off('disconnect');
      socketService.disconnect();
      connectedRef.current = false;
    };
  }, [qc]);
}
