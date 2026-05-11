'use client';

import styles from './bulkActionsBar.module.css';

export interface BulkAction {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction[];
}

export function BulkActionsBar({ selectedCount, onClear, actions }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.badge}>{selectedCount}</span>
        <span className={styles.label}>
          seleccionado{selectedCount !== 1 ? 's' : ''}
        </span>
        <button type="button" className={styles.clearBtn} onClick={onClear} title="Limpiar selección">
          ✕
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.actions}>
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.actionBtn} ${styles[action.variant ?? 'default']}`}
            onClick={action.onClick}
            disabled={action.disabled || action.loading}
          >
            {action.loading ? '…' : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
