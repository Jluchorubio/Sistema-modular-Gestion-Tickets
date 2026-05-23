import { Modal } from '@/components/ui/Modal';
import mstyles from '@/components/ui/modal.module.css';
import styles from '../requests.module.css';

interface Props {
  open:          boolean;
  notes:         string;
  isPending:     boolean;
  onChangeNotes: (v: string) => void;
  onClose:       () => void;
  onConfirm:     () => void;
}

export function RejectRequestModal({ open, notes, isPending, onChangeNotes, onClose, onConfirm }: Props) {
  return (
    <Modal open={open} title="Rechazar solicitud" onClose={onClose}>
      <div style={{ padding: '0 0 4px' }}>
        <label className={mstyles.fieldLabel}>Motivo del rechazo (opcional)</label>
        <textarea
          className={styles.rejectNotes}
          placeholder="Explica el motivo del rechazo…"
          value={notes}
          onChange={e => onChangeNotes(e.target.value)}
        />
      </div>
      <div className={mstyles.actions}>
        <button type="button" className={mstyles.actCancel} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={mstyles.actDanger} onClick={onConfirm} disabled={isPending}>
          Confirmar rechazo
        </button>
      </div>
    </Modal>
  );
}
