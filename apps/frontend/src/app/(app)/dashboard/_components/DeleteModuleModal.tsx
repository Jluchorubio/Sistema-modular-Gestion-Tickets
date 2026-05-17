'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesService } from '@/services/modules.service';
import { Modal } from '@/components/ui/Modal';
import type { SystemModule } from '@/types/module.types';
import mstyles from '@/components/ui/modal.module.css';

interface Props {
  target:   SystemModule | null;
  username: string;
  onClose:  () => void;
}

export function DeleteModuleModal({ target, username, onClose }: Props) {
  const qc = useQueryClient();
  const [nameInput, setNameInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (target) { setNameInput(''); setUserInput(''); setError(''); }
  }, [target?.id]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => modulesService.deleteModule(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['modules'] }); onClose(); },
    onError:    () => setError('Error al eliminar el módulo. Intenta de nuevo.'),
  });

  function confirm() {
    if (!target) return;
    if (nameInput !== target.name) {
      setError(`El nombre del módulo no coincide. Escribe exactamente: "${target.name}"`);
      return;
    }
    if (!username || userInput !== username) {
      setError(`El nombre de usuario no coincide. Escribe exactamente: "${username}"`);
      return;
    }
    deleteMut.mutate(target.id);
  }

  return (
    <Modal open={!!target} title="Eliminar módulo" onClose={onClose}>
      <div style={{ padding: '0 0 4px' }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          background: '#450a0a', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: '12px 14px', marginBottom: 18,
        }}>
          <AlertTriangle size={16} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: '#fca5a5', margin: 0, lineHeight: 1.5 }}>
            Esta acción moverá el módulo a la papelera. Se conservará 90 días antes del borrado definitivo.
          </p>
        </div>

        <label className={mstyles.fieldLabel}>
          Escribe el nombre del módulo: <strong>{target?.name}</strong>
        </label>
        <input
          className={mstyles.fieldInput}
          placeholder={target?.name ?? ''}
          value={nameInput}
          onChange={e => { setNameInput(e.target.value); setError(''); }}
        />

        <label className={mstyles.fieldLabel} style={{ marginTop: 14 }}>
          Escribe tu nombre de usuario: <strong>{username}</strong>
        </label>
        <input
          className={mstyles.fieldInput}
          placeholder={username}
          value={userInput}
          onChange={e => { setUserInput(e.target.value); setError(''); }}
        />

        {error && (
          <div className={mstyles.msgErr} style={{ marginTop: 10 }}>{error}</div>
        )}
      </div>

      <div className={mstyles.actions}>
        <button type="button" className={mstyles.actCancel} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={mstyles.actDanger}
          onClick={confirm}
          disabled={deleteMut.isPending || !nameInput || !userInput}
        >
          {deleteMut.isPending ? 'Eliminando…' : 'Eliminar módulo'}
        </button>
      </div>
    </Modal>
  );
}
