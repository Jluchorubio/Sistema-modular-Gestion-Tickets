'use client';

import { type ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import styles from './modal.module.css';

interface ConfirmModalProps {
  open:          boolean;
  title:         string;
  message:       ReactNode;
  onConfirm:     () => void;
  onClose:       () => void;
  variant?:      'confirm' | 'danger';
  loading?:      boolean;
  confirmLabel?: string;
  cancelLabel?:  string;
}

export function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onClose,
  variant      = 'confirm',
  loading      = false,
  confirmLabel = variant === 'danger' ? 'Eliminar' : 'Confirmar',
  cancelLabel  = 'Cancelar',
}: ConfirmModalProps) {
  const isDanger = variant === 'danger';

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div style={{
        display:    'flex',
        alignItems: 'flex-start',
        gap:        12,
        marginBottom: 20,
      }}>
        <div style={{
          width:        36,
          height:       36,
          borderRadius: 8,
          background:   isDanger ? '#fef2f2' : '#fff8f0',
          display:      'grid',
          placeItems:   'center',
          flexShrink:   0,
        }}>
          {isDanger
            ? <Trash2    size={16} color="#ef4444" />
            : <AlertTriangle size={16} color="#f59e0b" />
          }
        </div>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.55 }}>{message}</div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actCancel}
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={isDanger ? styles.actDanger : styles.actConfirm}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
