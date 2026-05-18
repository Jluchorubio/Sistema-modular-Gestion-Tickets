'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, X, Clock } from 'lucide-react';
import { adminService, type TrashItem } from '@/services/users.service';
import { Spinner } from '@/components/ui/Spinner';
import styles from './moduleTrash.module.css';

function daysLabel(days: number | null) {
  if (days === null) return 'Sin fecha';
  if (days < 0) return 'Expirado';
  if (days < 1) return 'Hoy';
  return `${Math.floor(days)} día${Math.floor(days) !== 1 ? 's' : ''}`;
}

export function GestionTrashClient({ moduleId }: { moduleId: string }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['gestion-trash', moduleId],
    queryFn:  () => adminService.getModuleTrash(moduleId),
    staleTime: 30_000,
  });

  const restoreMut = useMutation({
    mutationFn: (ids: string[]) => adminService.restoreItems('request', ids),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['gestion-trash', moduleId] });
      qc.invalidateQueries({ queryKey: ['requests-inbox-dyn'] });
      setSelected(new Set());
    },
  });

  const items = data?.data ?? [];

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Papelera del módulo</h2>
          {!isLoading && (
            <p className={styles.sub}>
              {items.length} solicitud{items.length !== 1 ? 'es' : ''} eliminada{items.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {selected.size > 0 && (
          <div className={styles.bulkActions}>
            <span className={styles.selectedCount}>{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
            <button
              type="button"
              className={styles.btnRestore}
              disabled={restoreMut.isPending}
              onClick={() => restoreMut.mutate(Array.from(selected))}
            >
              <RotateCcw size={13} />
              {restoreMut.isPending ? 'Restaurando…' : 'Restaurar'}
            </button>
            <button type="button" className={styles.btnClear} onClick={() => setSelected(new Set())}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {isLoading && <Spinner />}
      {error && <div className={styles.errorMsg}>Error cargando papelera</div>}

      {!isLoading && !error && items.length === 0 && (
        <div className={styles.empty}>
          <Trash2 size={32} className={styles.emptyIcon} />
          <p>La papelera está vacía</p>
          <p className={styles.emptyNote}>Las solicitudes eliminadas aparecen aquí durante 90 días</p>
        </div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <>
          <div className={styles.selectAll}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={selected.size === items.length && items.length > 0}
                onChange={toggleAll}
              />
              Seleccionar todo
            </label>
          </div>

          <div className={styles.list}>
            {items.map((item: TrashItem) => (
              <div
                key={item.id}
                className={`${styles.row}${selected.has(item.id) ? ` ${styles.rowSelected}` : ''}`}
              >
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <div className={styles.icon}><Trash2 size={14} /></div>
                <div className={styles.info}>
                  <p className={styles.name}>{item.display_name}</p>
                  {item.extra && <p className={styles.meta}>{item.extra}</p>}
                </div>
                <div className={styles.expiry}>
                  <Clock size={11} />
                  <span className={item.days_remaining !== null && item.days_remaining < 3 ? styles.expiryUrgent : ''}>
                    {daysLabel(item.days_remaining)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.btnRestoreSingle}
                  onClick={() => restoreMut.mutate([item.id])}
                  disabled={restoreMut.isPending}
                  title="Restaurar"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
