import { Modal } from '@/components/ui/Modal';
import mstyles from '@/components/ui/modal.module.css';

interface Props {
  open:      boolean;
  isPending: boolean;
  onClose:   () => void;
  onConfirm: () => void;
}

export function CancelRequestModal({ open, isPending, onClose, onConfirm }: Props) {
  return (
    <Modal open={open} title="Cancelar solicitud" onClose={onClose}>
      <p style={{ fontSize: 14, color: '#374151', marginBottom: 4 }}>
        ¿Seguro que quieres cancelar esta solicitud? Esta acción no se puede deshacer.
      </p>
      <div className={mstyles.actions}>
        <button type="button" className={mstyles.actCancel} onClick={onClose}>
          Volver
        </button>
        <button type="button" className={mstyles.actDanger} onClick={onConfirm} disabled={isPending}>
          Confirmar cancelación
        </button>
      </div>
    </Modal>
  );
}
