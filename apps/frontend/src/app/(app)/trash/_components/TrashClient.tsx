'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { adminService, type TrashType, type TrashItem } from '@/services/admin.service';
import { authService } from '@/services/auth.service';
import { useSelection } from '@/hooks/useSelection';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { BulkActionsBar } from '@/components/ui/BulkActionsBar';
import { usePermission } from '@/hooks/usePermission';
import { usePermissionsStore } from '@/stores/permissions.store';
import styles from '../trash.module.css';
import mstyles from '@/components/ui/modal.module.css';

const TABS: { label: string; value: TrashType }[] = [
  { label: 'Todos',       value: 'all'     },
  { label: 'Módulos',     value: 'module'  },
  { label: 'Usuarios',    value: 'user'    },
  { label: 'Roles',       value: 'role'    },
  { label: 'Solicitudes', value: 'request' },
];

const TYPE_LABELS: Record<string, string> = {
  module: 'Módulo', user: 'Usuario', role: 'Rol', request: 'Solicitud',
};

const TYPE_BADGE: Record<string, string> = {
  module: styles.typeModule, user: styles.typeUser, role: styles.typeRole, request: styles.typeRequest,
};

export function TrashClient() {
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:trash');
  const qc      = useQueryClient();

  const [filter, setFilter] = useState<TrashType>('all');

  // ── re-auth modal ─────────────────────────────────────────────────────────────
  const [reAuthOpen,       setReAuthOpen]       = useState(false);
  const [reAuthPwd,        setReAuthPwd]        = useState('');
  const [showReAuthPwd,    setShowReAuthPwd]    = useState(false);
  const [reAuthErr,        setReAuthErr]        = useState<string | null>(null);
  const [reAuthBusy,       setReAuthBusy]       = useState(false);
  const [pendingItem,      setPendingItem]      = useState<TrashItem | null>(null);
  const [pendingBulkDel,   setPendingBulkDel]   = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['trash', filter],
    queryFn:  () => adminService.getTrash(filter),
    enabled:  canView,
  });

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  const visibleIds = items.map((i) => i.id);
  const { selected, allChecked, someChecked, toggleAll, toggleRow, clear: clearSelection } =
    useSelection(visibleIds);

  const selectedItems = items.filter((i) => selected.has(i.id));

  // ── mutations ─────────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ['trash'] });

  const restoreMut = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) => adminService.restore(type, id),
    onSuccess:  invalidate,
  });

  const permDeleteMut = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) => adminService.permanentDelete(type, id),
    onSuccess:  invalidate,
  });

  const bulkRestoreMut = useMutation({
    mutationFn: async (its: TrashItem[]) => {
      const byType: Record<string, string[]> = {};
      its.forEach((it) => {
        if (!byType[it.item_type]) byType[it.item_type] = [];
        byType[it.item_type].push(it.id);
      });
      await Promise.all(
        Object.entries(byType).map(([type, ids]) => adminService.bulkRestore(type, ids)),
      );
    },
    onSuccess: () => { clearSelection(); invalidate(); },
  });

  // ── re-auth flow ──────────────────────────────────────────────────────────────
  function openReAuthFor(item: TrashItem | null, isBulk: boolean) {
    setPendingItem(item);
    setPendingBulkDel(isBulk);
    setReAuthPwd('');
    setReAuthErr(null);
    setShowReAuthPwd(false);
    setReAuthOpen(true);
  }

  async function confirmReAuth() {
    setReAuthBusy(true);
    setReAuthErr(null);
    try {
      await authService.verifyCredentials(reAuthPwd);

      if (pendingItem) {
        await permDeleteMut.mutateAsync({ type: pendingItem.item_type, id: pendingItem.id });
      } else if (pendingBulkDel) {
        const byType: Record<string, string[]> = {};
        selectedItems.forEach((it) => {
          if (!byType[it.item_type]) byType[it.item_type] = [];
          byType[it.item_type].push(it.id);
        });
        await Promise.all(
          Object.entries(byType).map(([type, ids]) => adminService.bulkPermanentDelete(type, ids)),
        );
        clearSelection();
        invalidate();
      }

      setReAuthOpen(false);
      setPendingItem(null);
      setPendingBulkDel(false);
    } catch {
      setReAuthErr('Contraseña incorrecta. Intenta de nuevo.');
    } finally {
      setReAuthBusy(false);
    }
  }

  if (loaded && !canView) return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>
        <p className={styles.errorMsg}>No tienes permiso para ver esta sección.</p>
      </div>
    </div>
  );

  const bulkPending = bulkRestoreMut.isPending;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Papelera</h1>
          <p className={styles.count}>
            {data
              ? `${total} elemento${total !== 1 ? 's' : ''} en papelera · conservados 90 días`
              : 'Items eliminados. Se conservan 90 días antes del borrado permanente.'}
          </p>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            className={`${styles.tab}${filter === tab.value ? ` ${styles.tabActive}` : ''}`}
            onClick={() => { setFilter(tab.value); clearSelection(); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {error     && <div className={styles.errorMsg}>Error cargando papelera</div>}

      {!isLoading && !error && items.length === 0 && (
        <div className={styles.emptyMsg}>La papelera está vacía.</div>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div className={styles.selectAllBar}>
          <input
            type="checkbox"
            className={styles.rowCb}
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
            onChange={toggleAll}
            id="trash-select-all"
          />
          <label htmlFor="trash-select-all" style={{ cursor: 'pointer', userSelect: 'none' }}>
            {allChecked
              ? `Deseleccionar todos (${items.length})`
              : someChecked
                ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`
                : `Seleccionar todos (${items.length})`}
          </label>
        </div>
      )}

      {items.map((item) => {
        const isSelected = selected.has(item.id);
        const days    = Math.ceil(Number(item.days_remaining ?? 0));
        const urgent  = days <= 7;
        const deleted = new Date(item.deleted_at).toLocaleDateString('es', {
          day: '2-digit', month: 'short', year: 'numeric',
        });
        const extra = item.extra ? ` · ${item.extra}` : '';

        return (
          <div
            key={item.id}
            className={`${styles.card}${isSelected ? ` ${styles.cardSelected}` : ''}`}
          >
            <div
              className={styles.cbWrap}
              onClick={() => toggleRow(item.id)}
            >
              <input
                type="checkbox"
                className={styles.rowCb}
                checked={isSelected}
                onChange={() => toggleRow(item.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className={styles.cardInfo}>
              <div className={styles.cardName}>
                <span className={`${styles.typeBadge} ${TYPE_BADGE[item.item_type] ?? ''}`}>
                  {TYPE_LABELS[item.item_type] ?? item.item_type}
                </span>
                {item.display_name}
              </div>
              <div className={styles.cardMeta}>Eliminado el {deleted}{extra}</div>
            </div>

            <div className={styles.cardRight}>
              <span className={`${styles.daysPill}${urgent ? ` ${styles.daysPillUrgent}` : ''}`}>
                {days}d restantes
              </span>
              <button
                className={styles.btnSecondary}
                onClick={() => restoreMut.mutate({ type: item.item_type, id: item.id })}
                disabled={restoreMut.isPending}
              >
                Restaurar
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => openReAuthFor(item, false)}
                disabled={permDeleteMut.isPending}
              >
                Eliminar def.
              </button>
            </div>
          </div>
        );
      })}

      {/* ── BULK ACTIONS BAR ── */}
      <BulkActionsBar
        selectedCount={selected.size}
        onClear={() => clearSelection()}
        actions={[
          {
            label:   'Restaurar',
            variant: 'success',
            loading: bulkRestoreMut.isPending,
            disabled: bulkPending,
            onClick: () => bulkRestoreMut.mutate(selectedItems),
          },
          {
            label:   'Eliminar definitivamente',
            variant: 'danger',
            disabled: bulkPending,
            onClick: () => openReAuthFor(null, true),
          },
        ]}
      />

      {/* ── RE-AUTH MODAL ── */}
      <Modal
        open={reAuthOpen}
        title="Confirma tu identidad"
        onClose={() => { setReAuthOpen(false); setPendingItem(null); setPendingBulkDel(false); }}
      >
        <div className={mstyles.deleteBanner}>
          {pendingItem
            ? <>Vas a eliminar permanentemente <strong>"{pendingItem.display_name}"</strong>. Esta acción es <strong>irreversible</strong>.</>
            : <>Vas a eliminar permanentemente <strong>{selected.size} item{selected.size !== 1 ? 's' : ''}</strong>. Esta acción es <strong>irreversible</strong>.</>}
        </div>

        <label className={mstyles.fieldLabel}>
          Introduce tu contraseña para continuar
        </label>
        <div className={styles.reAuthPwdWrap}>
          <input
            className={styles.reAuthPwdInput}
            type={showReAuthPwd ? 'text' : 'password'}
            placeholder="Tu contraseña actual"
            value={reAuthPwd}
            onChange={(e) => { setReAuthPwd(e.target.value); setReAuthErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && reAuthPwd) confirmReAuth(); }}
            autoFocus
          />
          <button
            type="button"
            className={styles.reAuthEye}
            onClick={() => setShowReAuthPwd((v) => !v)}
          >
            {showReAuthPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {reAuthErr && <p className={mstyles.msgErr}>{reAuthErr}</p>}

        <div className={mstyles.actions}>
          <button
            type="button"
            className={mstyles.actCancel}
            onClick={() => { setReAuthOpen(false); setPendingItem(null); setPendingBulkDel(false); }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={mstyles.actDanger}
            disabled={!reAuthPwd || reAuthBusy}
            onClick={confirmReAuth}
          >
            {reAuthBusy ? 'Verificando…' : 'Eliminar permanentemente'}
          </button>
        </div>
      </Modal>
      </div>
    </div>
  );
}
