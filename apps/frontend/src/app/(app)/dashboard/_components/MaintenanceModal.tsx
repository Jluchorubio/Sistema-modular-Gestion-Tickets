'use client';

import { useState, useEffect } from 'react';
import { WrenchIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesService } from '@/services/modules.service';
import { Modal } from '@/components/ui/Modal';
import type { SystemModule } from '@/types/module.types';
import mstyles from '@/components/ui/modal.module.css';

interface Props {
  target:  SystemModule | null;
  onClose: () => void;
}

export function MaintenanceModal({ target, onClose }: Props) {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (target) setMessage(target.maintenance_message ?? '');
  }, [target?.id]);

  const maintMut = useMutation({
    mutationFn: ({ id, enabled, msg }: { id: string; enabled: boolean; msg?: string }) =>
      modulesService.toggleMaintenance(id, enabled, msg),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); onClose(); },
  });

  const enabling = !target?.maintenance_mode;

  return (
    <Modal
      open={!!target}
      title={enabling ? 'Activar modo mantenimiento' : 'Desactivar mantenimiento'}
      onClose={onClose}
    >
      <div style={{ padding: '0 0 4px' }}>
        {enabling ? (
          <>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: '#451a03', border: '1px solid #78350f',
              borderRadius: 8, padding: '12px 14px', marginBottom: 18,
            }}>
              <WrenchIcon size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: '#fde68a', margin: 0, lineHeight: 1.5 }}>
                Los usuarios sin rol de admin no podrán acceder al módulo{' '}
                <strong>{target?.name}</strong> mientras esté en mantenimiento.
              </p>
            </div>
            <label className={mstyles.fieldLabel}>Mensaje de mantenimiento (opcional)</label>
            <textarea
              className={mstyles.fieldInput}
              placeholder="Ej: Estamos realizando actualizaciones. Volvemos en breve."
              style={{ minHeight: 80, resize: 'vertical' }}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </>
        ) : (
          <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
            ¿Desactivar el modo mantenimiento del módulo{' '}
            <strong>{target?.name}</strong>? Los usuarios podrán acceder nuevamente.
          </p>
        )}
      </div>

      <div className={mstyles.actions}>
        <button type="button" className={mstyles.actCancel} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={enabling ? mstyles.actDanger : mstyles.actConfirm}
          disabled={maintMut.isPending}
          onClick={() => target && maintMut.mutate({ id: target.id, enabled: enabling, msg: message || undefined })}
        >
          {maintMut.isPending
            ? 'Procesando…'
            : enabling ? 'Activar mantenimiento' : 'Desactivar mantenimiento'}
        </button>
      </div>
    </Modal>
  );
}
