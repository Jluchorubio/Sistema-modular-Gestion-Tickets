'use client';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '@/services/socket.service';
import { tokens } from '@/lib/tokens';

export function useRealtimeNotifications() {
  const qc          = useQueryClient();
  const connectedRef = useRef(false);

  useEffect(() => {
    const token = tokens.getAccess();
    if (!token || connectedRef.current) return;

    const socket = socketService.connect(token);
    connectedRef.current = true;

    socket.on('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications-me'] });
    });

    socket.on('disconnect', () => {
      connectedRef.current = false;
    });

    return () => {
      socket.off('notification');
      socket.off('disconnect');
      socketService.disconnect();
      connectedRef.current = false;
    };
  }, [qc]);
}
