'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { usePermission } from '@/hooks/usePermission';
import { usePermissionsStore } from '@/stores/permissions.store';
import type { GlobalRole } from '@/types/user.types';
import styles from '../roles.module.css';
import modalStyles from '@/components/ui/modal.module.css';

const createSchema = z.object({
  name:        z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export function RolesClient() {
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:roles');
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [serverMsg,  setServerMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['global-roles'],
    queryFn:  usersService.getGlobalRoles,
    enabled:  canView,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const createMut = useMutation({
    mutationFn: ({ name, description }: CreateForm) =>
      usersService.createGlobalRole(name, description || undefined),
    onSuccess: () => {
      setServerMsg({ ok: true, text: 'Rol creado' });
      qc.invalidateQueries({ queryKey: ['global-roles'] });
      setTimeout(() => { setCreateOpen(false); reset(); setServerMsg(null); }, 700);
    },
    onError: (e: Error) => setServerMsg({ ok: false, text: e.message ?? 'Error al crear rol' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersService.deleteGlobalRole(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['global-roles'] }),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => usersService.reactivateGlobalRole(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['global-roles'] }),
  });

  const handleDeactivate = useCallback((role: GlobalRole) => {
    if (!confirm(`¿Desactivar el rol "${role.name}"? Los usuarios que lo tienen no serán afectados de inmediato.`)) return;
    deleteMut.mutate(role.id);
  }, [deleteMut]);

  const openCreate = useCallback(() => {
    reset();
    setServerMsg(null);
    setCreateOpen(true);
  }, [reset]);

  if (loaded && !canView) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
      No tienes permiso para ver esta sección.
    </div>
  );

  const sorted = roles
    ? [...roles.filter(r => r.is_active), ...roles.filter(r => !r.is_active)]
    : [];

  return (
    <>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Roles Globales</div>
          {roles && (
            <div className={styles.count}>
              {roles.length} rol{roles.length !== 1 ? 'es' : ''}
            </div>
          )}
        </div>
        <button className={styles.btnPrimary} onClick={openCreate}>
          <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Crear rol
        </button>
      </div>

      {isLoading && <Spinner />}
      {error     && <div className={styles.errorMsg}>Error cargando roles</div>}

      {!isLoading && !error && (
        <div className={styles.list}>
          {sorted.length === 0 && (
            <div className={styles.emptyMsg}>No hay roles globales aún.</div>
          )}
          {sorted.map(r => {
            const isActive  = r.is_active;
            const userCount = r.user_count ?? 0;
            return (
              <div
                key={r.id}
                className={`${styles.row}${isActive ? '' : ` ${styles.rowInactive}`}`}
              >
                <div className={styles.rowLeft}>
                  <div>
                    <div className={styles.name}>
                      {r.name}
                      {!isActive && (
                        <span className={`${styles.badge} ${styles.badgeInactive}`}>Inactivo</span>
                      )}
                    </div>
                    {r.description && <div className={styles.desc}>{r.description}</div>}
                    <div className={styles.userCount}>{userCount} usuario{userCount !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  {isActive ? (
                    <button
                      className={styles.btnIconDanger}
                      onClick={() => handleDeactivate(r)}
                      disabled={deleteMut.isPending}
                    >
                      Desactivar
                    </button>
                  ) : (
                    <button
                      className={styles.btnReactivate}
                      onClick={() => reactivateMut.mutate(r.id)}
                      disabled={reactivateMut.isPending}
                    >
                      Reactivar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Crear rol global" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleSubmit(data => { setServerMsg(null); createMut.mutate(data); })}>
          <label className={modalStyles.fieldLabel}>Nombre *</label>
          <input {...register('name')} className={modalStyles.fieldInput} placeholder="Ej. Coordinador" />
          {errors.name && (
            <div className={modalStyles.msgErr} style={{ marginTop: 6, padding: '6px 10px' }}>
              {errors.name.message}
            </div>
          )}
          <label className={modalStyles.fieldLabel}>Descripción</label>
          <input {...register('description')} className={modalStyles.fieldInput} placeholder="Descripción opcional" />
          {serverMsg && (
            <div className={serverMsg.ok ? modalStyles.msgOk : modalStyles.msgErr}>{serverMsg.text}</div>
          )}
          <div className={modalStyles.actions}>
            <button type="button" className={modalStyles.actCancel} onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className={modalStyles.actConfirm} disabled={isSubmitting || createMut.isPending}>
              Crear rol
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
