'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Send, LockKeyhole } from 'lucide-react';
import { requestsService } from '@/services/requests.service';

interface Props {
  moduleName: string;
  moduleId:   string;
  onClose:    () => void;
}

export function RequestModuleAccessModal({ moduleName, moduleId, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);

  const mut = useMutation({
    mutationFn: () => requestsService.create({
      type:        'module_access',
      title:       `Solicitud de acceso: ${moduleName}`,
      description: description.trim() || 'Sin descripción adicional.',
      metadata:    { module_id: moduleId, module_name: moduleName },
    }),
    onSuccess: () => setSent(true),
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
        zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
          padding: '28px 28px 24px', position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
        >
          <X size={16} />
        </button>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#22c55e15', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Send size={20} style={{ color: '#22c55e' }} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Solicitud enviada</p>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              Un administrador revisará tu solicitud y recibirás una notificación.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,94,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LockKeyhole size={16} style={{ color: '#ff5e3a' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>Solicitar acceso</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{moduleName}</p>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#475569', margin: '0 0 14px' }}>
              No tienes acceso a este módulo. Puedes solicitar acceso y un administrador lo revisará.
            </p>

            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
              ¿Por qué necesitas acceso? (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe brevemente para qué usarás este módulo…"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                border: '1px solid #e2e8f0', outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />

            {mut.isError && (
              <p style={{ fontSize: 11, color: '#dc2626', margin: '8px 0 0' }}>
                {(mut.error as any)?.response?.data?.message ?? 'Error al enviar la solicitud.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={mut.isPending}
                onClick={() => mut.mutate()}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#ff5e3a', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                  opacity: mut.isPending ? .7 : 1,
                }}
              >
                <Send size={12} />
                {mut.isPending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
