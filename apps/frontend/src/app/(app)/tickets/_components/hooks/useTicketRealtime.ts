'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '@/services/socket.service';

export function useTicketRealtime(ticketId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const socket = socketService.socket;
    if (!socket || !ticketId) return;

    socket.emit('join:ticket', ticketId);

    function onStateChanged() {
      qc.invalidateQueries({ queryKey: ['ticket-detail',   ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
    }

    function onCommentAdded() {
      qc.invalidateQueries({ queryKey: ['ticket-comments',  ticketId] });
      qc.invalidateQueries({ queryKey: ['ticket-timeline',  ticketId] });
    }

    function onAssigned() {
      qc.invalidateQueries({ queryKey: ['ticket-detail',   ticketId] });
    }

    socket.on('ticket:state_changed', onStateChanged);
    socket.on('ticket:comment_added', onCommentAdded);
    socket.on('ticket:assigned',      onAssigned);

    return () => {
      socket.emit('leave:ticket', ticketId);
      socket.off('ticket:state_changed', onStateChanged);
      socket.off('ticket:comment_added', onCommentAdded);
      socket.off('ticket:assigned',      onAssigned);
    };
  }, [ticketId, qc]);
}
