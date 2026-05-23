import { TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import mstyles from '@/components/ui/modal.module.css';
import styles from '../requests.module.css';

interface Props {
  open:         boolean;
  note:         string;
  isPending:    boolean;
  onChangeNote: (v: string) => void;
  onClose:      () => void;
  onConfirm:    () => void;
}

export function EscalateRequestModal({ open, note, isPending, onChangeNote, onClose, onConfirm }: Props) {
  return (
    <Modal open={open} title="Escalar solicitud al superadmin" onClose={onClose}>
      <div style={{ padding: '0 0 4px' }}>
        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12 }}>
          La solicitud quedará marcada como escalada y el superadmin será notificado.
        </p>
        <label className={mstyles.fieldLabel}>Motivo de la escalación (opcional)</label>
        <textarea
          className={styles.rejectNotes}
          placeholder="Explica por qué necesitas intervención del superadmin…"
          value={note}
          onChange={e => onChangeNote(e.target.value)}
        />
      </div>
      <div className={mstyles.actions}>
        <button type="button" className={mstyles.actCancel} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={mstyles.actConfirm}
          style={{ background: '#ea580c' }}
          onClick={onConfirm}
          disabled={isPending}
        >
          <TrendingUp size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Confirmar escalación
        </button>
      </div>
    </Modal>
  );
}
