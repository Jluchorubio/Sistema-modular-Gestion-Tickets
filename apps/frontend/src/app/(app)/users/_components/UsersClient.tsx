'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { usersService, type UserListItem } from '@/services/users.service';
import { adminService } from '@/services/admin.service';
import { useUsers } from '@/hooks/useUsers';
import { useSelection } from '@/hooks/useSelection';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { BulkActionsBar } from '@/components/ui/BulkActionsBar';
import styles from '../users.module.css';
import mstyles from '@/components/ui/modal.module.css';

const createSchema = z.object({
  first_name:    z.string().min(1, 'Requerido'),
  last_name:     z.string().min(1, 'Requerido'),
  email:         z.string().min(1, 'El email es requerido').email('Email inválido'),
  is_superadmin: z.boolean(),
});

const editSchema = z.object({
  first_name:    z.string().min(1, 'Requerido'),
  last_name:     z.string().min(1, 'Requerido'),
  phone:         z.string().optional(),
  username:      z.string().optional(),
  job_title:     z.string().optional(),
  department:    z.string().optional(),
  primary_sede:  z.string().optional(),
  address:       z.string().optional(),
  is_superadmin: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

export function UsersClient() {
  const router = useRouter();
  const qc     = useQueryClient();
  const isSA        = useAuthStore((s) => s.user?.is_superadmin ?? false);
  const canCreate   = usePermission('global:users:create');
  const canEdit     = usePermission('global:users:edit');
  const canDelete   = usePermission('global:users:delete');

  const [page,         setPage]         = useState(1);
  const [limit,        setLimit]        = useState(20);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [superFilter,  setSuperFilter]  = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createOpen,      setCreateOpen]      = useState(false);
  const [editUser,        setEditUser]        = useState<UserListItem | null>(null);
  const [deleteUser,      setDeleteUser]      = useState<UserListItem | null>(null);
  const [deleteInput,     setDeleteInput]     = useState('');
  const [modalMsg,        setModalMsg]        = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [bulkDeleteOpen,  setBulkDeleteOpen]  = useState(false);

  const { users, meta, isLoading, isError } = useUsers({ page, limit, search, statusFilter, superFilter });

  const visibleIds = users.map((u) => u.id);
  const { selected, selectedIds, allChecked, someChecked, toggleAll, toggleRow, clear: clearSelection } =
    useSelection(visibleIds);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersService.updateUser(id, { is_active: !active }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersService.deleteUser(id),
    onSuccess: () => { setDeleteUser(null); setDeleteInput(''); invalidate(); },
  });

  const createMut = useMutation({
    mutationFn: (vals: CreateForm) => usersService.createUser(vals),
    onSuccess: () => {
      setModalMsg({ type: 'ok', text: 'Usuario creado' });
      setTimeout(() => { setCreateOpen(false); setModalMsg(null); invalidate(); }, 800);
    },
    onError: (e: unknown) => setModalMsg({
      type: 'err',
      text: (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear',
    }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, vals }: { id: string; vals: EditForm }) => usersService.updateUser(id, vals),
    onSuccess: () => {
      setModalMsg({ type: 'ok', text: 'Guardado correctamente' });
      setTimeout(() => { setEditUser(null); setModalMsg(null); invalidate(); }, 800);
    },
    onError: (e: unknown) => setModalMsg({
      type: 'err',
      text: (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar',
    }),
  });

  // ── bulk mutations ───────────────────────────────────────────────────────────
  const bulkActivateMut = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => usersService.updateUser(id, { is_active: true }))),
    onSuccess: () => { clearSelection(); invalidate(); },
  });

  const bulkDeactivateMut = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => usersService.updateUser(id, { is_active: false }))),
    onSuccess: () => { clearSelection(); invalidate(); },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) => adminService.bulkSoftDelete('user', ids),
    onSuccess: () => { clearSelection(); setBulkDeleteOpen(false); invalidate(); },
  });

  // ── forms ────────────────────────────────────────────────────────────────────
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { first_name: '', last_name: '', email: '', is_superadmin: false },
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { first_name: '', last_name: '', phone: '', username: '', job_title: '', department: '', primary_sede: '', address: '', is_superadmin: false },
  });

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setSearch(val); setPage(1); clearSelection(); }, 350);
  }

  function openEdit(u: UserListItem) {
    setEditUser(u);
    setModalMsg(null);
    editForm.reset({
      first_name:   u.first_name,
      last_name:    u.last_name,
      phone:        u.phone        ?? '',
      username:     u.username     ?? '',
      job_title:    u.job_title    ?? '',
      department:   u.department   ?? '',
      primary_sede: u.primary_sede ?? '',
      address:      u.address      ?? '',
      is_superadmin: u.is_superadmin,
    });
  }

  function openCreate() {
    setCreateOpen(true);
    setModalMsg(null);
    createForm.reset({ first_name: '', last_name: '', email: '', is_superadmin: false });
  }

  const deleteTarget = deleteUser ? `${deleteUser.first_name} ${deleteUser.last_name}` : '';
  const deleteMatch  = deleteInput === deleteTarget;

  const bulkPending = bulkActivateMut.isPending || bulkDeactivateMut.isPending || bulkDeleteMut.isPending;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Usuarios</div>
          <div className={styles.count}>
            {meta ? `${meta.total} usuario${meta.total !== 1 ? 's' : ''}` : '—'}
          </div>
        </div>
        {canCreate && (
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>
            + Crear usuario
          </button>
        )}
      </div>

      <div className={styles.filterRow}>
        <input className={styles.searchBar} placeholder="Buscar por nombre o email…" onChange={onSearchChange} />
        <select className={styles.filterSelect} value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); clearSelection(); }}>
          <option value="">Estado: Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
        <select className={styles.filterSelect} value={superFilter}
          onChange={(e) => { setSuperFilter(e.target.value); setPage(1); clearSelection(); }}>
          <option value="">Tipo: Todos</option>
          <option value="true">Superadmin</option>
          <option value="false">Usuarios</option>
        </select>
        <select className={styles.filterSelect} value={String(limit)}
          onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); clearSelection(); }}>
          <option value="10">10 / pág</option>
          <option value="20">20 / pág</option>
          <option value="50">50 / pág</option>
        </select>
      </div>

      {isLoading && <Spinner />}
      {isError   && <p className={styles.errorMsg}>Error cargando usuarios.</p>}

      {!isLoading && !isError && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {isSA && (
                  <th className={styles.cbTh}>
                    <input
                      type="checkbox"
                      className={styles.rowCb}
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol Global</th>
                <th>Módulos / Roles</th>
                <th>Estado</th>
                {isSA && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {!users.length && (
                <tr className={styles.emptyRow}>
                  <td colSpan={isSA ? 7 : 5}>
                    {search ? 'Sin resultados' : 'No hay usuarios aún'}
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const initials  = getInitials(u.first_name, u.last_name);
                const isChecked = selected.has(u.id);
                return (
                  <tr key={u.id} onClick={() => router.push(`/users/${u.id}/profile`)}
                    style={isChecked ? { background: '#f5f3ff' } : undefined}>
                    {isSA && (
                      <td className={styles.cbTd} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={styles.rowCb}
                          checked={isChecked}
                          onChange={() => toggleRow(u.id)}
                        />
                      </td>
                    )}
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt="" className={styles.avatarImg} />
                            : <span>{initials}</span>}
                        </div>
                        <div>
                          <div className={styles.userName}>
                            {u.first_name} {u.last_name}
                            {u.is_superadmin && (
                              <span className={styles.badgeSuper} style={{ marginLeft: 6 }}>Superadmin</span>
                            )}
                          </div>
                          <div className={styles.userSub}>
                            {u.last_login_at ? `Último acceso: ${new Date(u.last_login_at).toLocaleDateString('es')}` : 'Sin accesos'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: '#64748b' }}>{u.email}</td>
                    <td>
                      {u.global_role
                        ? <span className={styles.badgeGlobal}>{u.global_role}</span>
                        : <span style={{ color: '#94a3b8', fontSize: 11 }}>usuario</span>}
                    </td>
                    <td>
                      <div className={styles.rolesWrap}>
                        {(u.roles ?? []).slice(0, 3).map((r, i) => (
                          <span key={i} className={styles.badgeRole}>{r.module} · {r.role}</span>
                        ))}
                        {(u.roles?.length ?? 0) > 3 && (
                          <span className={styles.badgeRole}>+{u.roles.length - 3} más</span>
                        )}
                        {!(u.roles?.length) && <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={u.is_active ? styles.badgeActive : styles.badgeInactive}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {!u.profile_complete && (
                        <span className={styles.badgeIncomplete} style={{ marginLeft: 4 }}>Perfil incompleto</span>
                      )}
                    </td>
                    {isSA && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className={styles.actionsCell}>
                          <button type="button" className={`${styles.btnSm} ${styles.btnEdit}`}
                            onClick={() => router.push(`/users/${u.id}/profile`)}>
                            Ver perfil
                          </button>
                          {canEdit && (
                            <button type="button"
                              className={`${styles.btnSm} ${u.is_active ? styles.btnToggleOff : styles.btnToggleOn}`}
                              onClick={() => toggleMut.mutate({ id: u.id, active: u.is_active })}
                              disabled={toggleMut.isPending}>
                              {u.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className={`${styles.btnSm} ${styles.btnDanger}`}
                              onClick={() => { setDeleteUser(u); setDeleteInput(''); }}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.pages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Página {page} de {meta.pages} ({meta.total} total)
          </span>
          <div className={styles.paginationBtns}>
            <button type="button" className={styles.btnSecondary}
              onClick={() => { setPage((p) => Math.max(1, p - 1)); clearSelection(); }}
              disabled={page === 1}>
              ← Anterior
            </button>
            <button type="button" className={styles.btnSecondary}
              onClick={() => { setPage((p) => Math.min(meta.pages, p + 1)); clearSelection(); }}
              disabled={page === meta.pages}>
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ── BULK ACTIONS BAR ── */}
      {isSA && (
        <BulkActionsBar
          selectedCount={selected.size}
          onClear={() => clearSelection()}
          actions={[
            {
              label: 'Activar',
              variant: 'success',
              loading: bulkActivateMut.isPending,
              disabled: bulkPending,
              onClick: () => bulkActivateMut.mutate(selectedIds),
            },
            {
              label: 'Desactivar',
              variant: 'warning',
              loading: bulkDeactivateMut.isPending,
              disabled: bulkPending,
              onClick: () => bulkDeactivateMut.mutate(selectedIds),
            },
            {
              label: 'Eliminar',
              variant: 'danger',
              disabled: bulkPending,
              onClick: () => setBulkDeleteOpen(true),
            },
          ]}
        />
      )}

      {/* CREATE MODAL */}
      <Modal open={createOpen} title="Crear usuario" onClose={() => setCreateOpen(false)}>
        <form onSubmit={createForm.handleSubmit((v) => createMut.mutate(v))}>
          <div className={mstyles.formRow}>
            <div>
              <label className={mstyles.fieldLabel}>Nombre</label>
              <input className={mstyles.fieldInput} placeholder="Juan" {...createForm.register('first_name')} />
              {createForm.formState.errors.first_name && (
                <p className={mstyles.fieldHint} style={{ color: '#ef4444' }}>{createForm.formState.errors.first_name.message}</p>
              )}
            </div>
            <div>
              <label className={mstyles.fieldLabel}>Apellido</label>
              <input className={mstyles.fieldInput} placeholder="García" {...createForm.register('last_name')} />
              {createForm.formState.errors.last_name && (
                <p className={mstyles.fieldHint} style={{ color: '#ef4444' }}>{createForm.formState.errors.last_name.message}</p>
              )}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className={mstyles.fieldLabel}>
              Email <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              className={mstyles.fieldInput}
              type="email"
              placeholder="juan.garcia@empresa.com"
              autoComplete="off"
              {...createForm.register('email')}
            />
            {createForm.formState.errors.email && (
              <p className={mstyles.fieldHint} style={{ color: '#ef4444' }}>{createForm.formState.errors.email.message}</p>
            )}
          </div>
          <p className={mstyles.fieldHint} style={{ marginTop: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '9px 12px', color: '#0369a1' }}>
            El usuario recibirá este email para acceder. Contraseña inicial: <strong>Ticket2026!</strong>
          </p>
          <div className={mstyles.toggleWrap}>
            <button type="button"
              className={`${mstyles.toggle}${createForm.watch('is_superadmin') ? ` ${mstyles.toggleOn}` : ''}`}
              onClick={() => createForm.setValue('is_superadmin', !createForm.getValues('is_superadmin'))}
            />
            <span className={mstyles.toggleLabel}>Superadmin</span>
          </div>
          {modalMsg && <p className={modalMsg.type === 'ok' ? mstyles.msgOk : mstyles.msgErr}>{modalMsg.text}</p>}
          <div className={mstyles.actions}>
            <button type="button" className={mstyles.actCancel} onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" className={mstyles.actConfirm} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT MODAL */}
      <Modal open={!!editUser} title="Editar usuario" onClose={() => { setEditUser(null); setModalMsg(null); }}>
        <form onSubmit={editForm.handleSubmit((v) => editUser && updateMut.mutate({ id: editUser.id, vals: v }))}>
          <div className={mstyles.formRow}>
            <div>
              <label className={mstyles.fieldLabel}>Nombre</label>
              <input className={mstyles.fieldInput} {...editForm.register('first_name')} />
            </div>
            <div>
              <label className={mstyles.fieldLabel}>Apellido</label>
              <input className={mstyles.fieldInput} {...editForm.register('last_name')} />
            </div>
          </div>
          <div className={mstyles.formRow}>
            <div>
              <label className={mstyles.fieldLabel}>Celular</label>
              <input className={mstyles.fieldInput} placeholder="+57 300 000 0000" {...editForm.register('phone')} />
            </div>
            <div>
              <label className={mstyles.fieldLabel}>Username</label>
              <input className={mstyles.fieldInput} placeholder="juangarcia" {...editForm.register('username')} />
            </div>
          </div>
          <div className={mstyles.formRow}>
            <div>
              <label className={mstyles.fieldLabel}>Cargo</label>
              <input className={mstyles.fieldInput} placeholder="Técnico Senior" {...editForm.register('job_title')} />
            </div>
            <div>
              <label className={mstyles.fieldLabel}>Área / Dept.</label>
              <input className={mstyles.fieldInput} placeholder="Soporte TI" {...editForm.register('department')} />
            </div>
          </div>
          <div className={mstyles.formRow}>
            <div>
              <label className={mstyles.fieldLabel}>Sede principal</label>
              <input className={mstyles.fieldInput} placeholder="Sede Norte" {...editForm.register('primary_sede')} />
            </div>
            <div>
              <label className={mstyles.fieldLabel}>Dirección</label>
              <input className={mstyles.fieldInput} placeholder="Calle 123…" {...editForm.register('address')} />
            </div>
          </div>
          <div className={mstyles.toggleWrap}>
            <button type="button"
              className={`${mstyles.toggle}${editForm.watch('is_superadmin') ? ` ${mstyles.toggleOn}` : ''}`}
              onClick={() => editForm.setValue('is_superadmin', !editForm.getValues('is_superadmin'))}
            />
            <span className={mstyles.toggleLabel}>Superadmin</span>
          </div>
          {modalMsg && <p className={modalMsg.type === 'ok' ? mstyles.msgOk : mstyles.msgErr}>{modalMsg.text}</p>}
          <div className={mstyles.actions}>
            <button type="button" className={mstyles.actCancel} onClick={() => { setEditUser(null); setModalMsg(null); }}>Cancelar</button>
            <button type="submit" className={mstyles.actConfirm} disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DELETE MODAL */}
      <Modal open={!!deleteUser} title="Eliminar usuario" onClose={() => { setDeleteUser(null); setDeleteInput(''); }}>
        <div className={mstyles.deleteBanner}>
          Esta acción moverá al usuario a la papelera. Escribe su nombre completo para confirmar.
        </div>
        <label className={mstyles.fieldLabel}>
          Escribe <strong>{deleteTarget}</strong> para confirmar
        </label>
        <input
          className={`${mstyles.fieldInput} ${deleteInput ? (deleteMatch ? mstyles.deleteInputOk : mstyles.deleteInputBad) : mstyles.deleteInput}`}
          value={deleteInput}
          onChange={(e) => setDeleteInput(e.target.value)}
          placeholder={deleteTarget}
        />
        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => { setDeleteUser(null); setDeleteInput(''); }}>Cancelar</button>
          <button type="button" className={mstyles.actDanger}
            disabled={!deleteMatch || deleteMut.isPending}
            onClick={() => deleteUser && deleteMut.mutate(deleteUser.id)}>
            {deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      {/* BULK DELETE CONFIRM MODAL */}
      <Modal
        open={bulkDeleteOpen}
        title={`Eliminar ${selected.size} usuario${selected.size !== 1 ? 's' : ''}`}
        onClose={() => setBulkDeleteOpen(false)}
      >
        <div className={mstyles.deleteBanner}>
          Los {selected.size} usuarios seleccionados se moverán a la papelera.
          Podrás restaurarlos desde la sección Papelera durante 90 días.
        </div>
        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={() => setBulkDeleteOpen(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className={mstyles.actDanger}
            disabled={bulkDeleteMut.isPending}
            onClick={() => bulkDeleteMut.mutate(selectedIds)}
          >
            {bulkDeleteMut.isPending ? 'Eliminando…' : `Eliminar ${selected.size}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}
