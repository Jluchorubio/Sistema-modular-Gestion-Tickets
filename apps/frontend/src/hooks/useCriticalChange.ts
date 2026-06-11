'use client';
import { useState, useCallback } from 'react';

export interface CriticalAuthData {
  password:   string;
  totp_code?: string;
  reason:     string;
}

interface PendingCritical {
  meta:      { entityLabel: string; description?: string };
  onConfirm: (auth: CriticalAuthData) => Promise<void>;
}

export function useCriticalChange() {
  const [pending, setPending] = useState<PendingCritical | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const triggerCritical = useCallback(
    (
      meta:      PendingCritical['meta'],
      onConfirm: PendingCritical['onConfirm'],
    ) => {
      setError(null);
      setPending({ meta, onConfirm });
    },
    [],
  );

  const handleConfirm = useCallback(async (auth: CriticalAuthData) => {
    if (!pending) return;
    setLoading(true);
    setError(null);
    try {
      await pending.onConfirm(auth);
      setPending(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message
        ?? err?.message
        ?? 'Error al verificar credenciales';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }, [pending]);

  const handleCancel = useCallback(() => {
    setPending(null);
    setError(null);
  }, []);

  return {
    triggerCritical,
    isOpen:    !!pending,
    meta:      pending?.meta ?? null,
    onConfirm: handleConfirm,
    onCancel:  handleCancel,
    error,
    loading,
  };
}
