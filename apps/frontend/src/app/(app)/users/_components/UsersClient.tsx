'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search, SlidersHorizontal, ChevronDown,
  FileSpreadsheet, Plus, Eye, ShieldCheck, Lock, Trash2, UserPlus, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { socketService } from '@/services/socket.service';
import { tokens } from '@/lib/tokens';
import { usersService, type UserListItem } from '@/services/users.service';
import { adminService } from '@/services/admin.service';
import { useUsers } from '@/hooks/useUsers';
import { useSelection } from '@/hooks/useSelection';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { BulkActionsBar } from '@/components/ui/BulkActionsBar';
import { BulkImportModal } from './BulkImportModal';
import styles from '../users.module.css';
import mstyles from '@/components/ui/modal.module.css';

/* ── Schemas ── */
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

/* ── Helpers ── */
function getStatusBadgeClass(isActive: boolean) {
  return isActive ? styles.badgeActivo : styles.badgeInactivo;
}

function getStatusLabel(isActive: boolean) {
  return isActive ? 'Activo' : 'Inactivo';
}

type ConnStatus = 'online' | 'away' | 'offline';

function deriveConnStatus(lastSeenAt: string | null, wsConnected: boolean): ConnStatus {
  if (wsConnected) return 'online';
  if (!lastSeenAt) return 'offline';
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  if (diffMs < 5 * 60_000)  return 'online';
  if (diffMs < 30 * 60_000) return 'away';
  return 'offline';
}

const CONN_DOT_CLASS: Record<ConnStatus, string> = {
  online:  'connOnline',
  away:    'connAway',
  offline: 'connOffline',
};

const CONN_LABEL: Record<ConnStatus, string> = {
  online:  'En línea',
  away:    'Ausente',
  offline: 'Desconectado',
};

export function UsersClient() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const isSA        = useAuthStore((s) => s.user?.is_superadmin ?? false);
  const canCreate   = usePermission('global:users:create');
  const canEdit     = usePermission('global:users:edit');
  const canDelete   = usePermission('global:users:delete');

  /* ── Filters ── */
  const [page,         setPage]         = useState(1);
  const [limit,        setLimit]        = useState(20);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [superFilter,  setSuperFilter]  = useState('');
  const [connFilter,   setConnFilter]   = useState('todos');
  const [sortVal,      setSortVal]      = useState('name_asc');
  const [advOpen,      setAdvOpen]      = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Realtime presence ── */
  const [wsConnected, setWsConnected] = useState<Set<string>>(new Set());

  const updatePresence = useCallback((userId: string, connected: boolean) => {
    setWsConnected((prev) => {
      const next = new Set(prev);
      if (connected) next.add(userId);
      else next.delete(userId);
      return next;
    });
  }, []);

  useEffect(() => {
    const token = tokens.getAccess();
    if (!token) return;

    const socket = socketService.connect(token);

    const onPresence = ({ userId, connected }: { userId: string; connected: boolean }) => {
      updatePresence(userId, connected);
    };
    socket.on('presence:change', onPresence);

    return () => { socket.off('presence:change', onPresence); };
  }, [updatePresence]);

  /* ── Modal states ── */
  const [createOpen,      setCreateOpen]      = useState(false);
  const [importOpen,      setImportOpen]      = useState(false);
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

  /* ── Mutations ── */
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
      setModalMsg({ type: 'ok', text: 'Usuario creado exitosamente' });
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

  /* ── Forms ── */
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
  const bulkPending  = bulkActivateMut.isPending || bulkDeactivateMut.isPending || bulkDeleteMut.isPending;

  /* ── Sort + presence filter (client-side on current page) ── */
  const sortedUsers = [...users]
    .filter((u) => {
      if (connFilter === 'todos') return true;
      const status = deriveConnStatus(u.last_seen_at ?? null, wsConnected.has(u.id));
      return status === connFilter;
    })
    .sort((a, b) => {
      const na = `${a.first_name} ${a.last_name}`;
      const nb = `${b.first_name} ${b.last_name}`;
      if (sortVal === 'name_asc')  return na.localeCompare(nb);
      if (sortVal === 'name_desc') return nb.localeCompare(na);
      if (sortVal === 'email_asc') return a.email.localeCompare(b.email);
      return 0;
    });

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Usuarios</h1>
            <p className={styles.count}>
              {meta ? `${meta.total} usuario${meta.total !== 1 ? 's' : ''} registrado${meta.total !== 1 ? 's' : ''} en el sistema` : '—'}
            </p>
          </div>
          {canCreate && (
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.btnImport}
                onClick={() => setImportOpen(true)}
              >
                <FileSpreadsheet size={13} style={{ color: '#16a34a' }} />
                <span>Importar CSV / Excel</span>
              </button>
              <button type="button" className={styles.btnCreate} onClick={openCreate}>
                <Plus size={11} />
                <span>Crear usuario</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Filter card ── */}
        <div className={styles.filterCard}>
          <div className={styles.filterTopRow}>
            {/* Search input with icon */}
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por nombre, email, iniciales de usuario..."
                onChange={onSearchChange}
              />
            </div>

            {/* Right controls */}
            <div className={styles.filterRightControls}>
              <button
                type="button"
                className={styles.btnAdvFilters}
                onClick={() => setAdvOpen((v) => !v)}
              >
                <SlidersHorizontal size={12} style={{ color: '#ff5e3a' }} />
                <span>Filtros Avanzados</span>
                <ChevronDown
                  className={`${styles.filterChevron}${advOpen ? ` ${styles.filterChevronOpen}` : ''}`}
                />
              </button>
              <select
                className={styles.sortSelect}
                value={sortVal}
                onChange={(e) => setSortVal(e.target.value)}
              >
                <option value="name_asc">Ordenar: Nombre A-Z</option>
                <option value="name_desc">Ordenar: Nombre Z-A</option>
                <option value="email_asc">Ordenar: Email</option>
              </select>
            </div>
          </div>

          {/* Advanced filters panel */}
          <div className={advOpen ? `${styles.advPanel} ${styles.advPanelOpen}` : styles.advPanel}>
            {/* Estado de Cuenta */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Estado de Cuenta</label>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); clearSelection(); }}
              >
                <option value="">Todos los Estados</option>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>

            {/* Rol Global */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Rol Global</label>
              <select
                className={styles.filterSelect}
                value={superFilter}
                onChange={(e) => { setSuperFilter(e.target.value); setPage(1); clearSelection(); }}
              >
                <option value="">Todos los Roles</option>
                <option value="false">usuario</option>
                <option value="true">superadmin</option>
              </select>
            </div>

            {/* Disponibilidad / Conexión */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Disponibilidad / Conexión</label>
              <select
                className={styles.filterSelect}
                value={connFilter}
                onChange={(e) => setConnFilter(e.target.value)}
              >
                <option value="todos">Todas las conexiones</option>
                <option value="online">Online (Activos)</option>
                <option value="away">Ausente (Away)</option>
                <option value="offline">Desconectado (Offline)</option>
              </select>
            </div>

            {/* Paginación por página */}
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Registros por Página</label>
              <select
                className={styles.filterSelect}
                value={String(limit)}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); clearSelection(); }}
              >
                <option value="10">10 registros</option>
                <option value="20">20 registros</option>
                <option value="50">50 registros</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading && <Spinner />}
        {isError   && <p className={styles.errorMsg}>Error cargando usuarios.</p>}

        {/* ── Table ── */}
        {!isLoading && !isError && (
          <div className={styles.tableWrap}>
            <div className={styles.tableScroll}>
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
                    {isSA && <th style={{ textAlign: 'center', paddingRight: 24 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {!sortedUsers.length && (
                    <tr className={styles.emptyRow}>
                      <td colSpan={isSA ? 7 : 5}>
                        No se encontraron usuarios con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                  {sortedUsers.map((u) => {
                    const initials  = getInitials(u.first_name, u.last_name);
                    const isChecked = selected.has(u.id);
                    const connStatus = deriveConnStatus(u.last_seen_at ?? null, wsConnected.has(u.id));
                    const connDotCls = `${styles.connDot} ${styles[CONN_DOT_CLASS[connStatus]]}`;

                    return (
                      <tr
                        key={u.id}
                        onClick={() => router.push(`/users/${u.id}/profile`)}
                        style={isChecked ? { background: '#f5f3ff' } : undefined}
                      >
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

                        {/* Usuario */}
                        <td>
                          <div className={styles.userCell}>
                            <div className={styles.avatarWrap}>
                              <div className={styles.avatar}>
                                {u.avatar_url
                                  ? <img src={u.avatar_url} alt="" className={styles.avatarImg} />
                                  : initials}
                              </div>
                              <span className={connDotCls} title={CONN_LABEL[connStatus]} />
                            </div>
                            <div>
                              <p className={styles.userName}>
                                {u.first_name} {u.last_name}
                              </p>
                              <p className={styles.userConnLabel}>{CONN_LABEL[connStatus]}</p>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className={styles.emailCell}>{u.email}</td>

                        {/* Rol Global */}
                        <td>
                          <span className={styles.badgeGlobal}>
                            {u.is_superadmin ? 'superadmin' : (u.global_role ?? 'usuario')}
                          </span>
                        </td>

                        {/* Módulos / Roles */}
                        <td>
                          <div className={styles.rolesWrap}>
                            {(u.roles ?? []).slice(0, 3).map((r, i) => (
                              <span key={i} className={styles.badgeRole}>
                                <span>{r.module}</span>
                                <span className={styles.badgeRoleSep}>•</span>
                                <span className={styles.badgeRoleVal}>{r.role}</span>
                              </span>
                            ))}
                            {(u.roles?.length ?? 0) > 3 && (
                              <span className={styles.badgeRole}>+{u.roles.length - 3} más</span>
                            )}
                            {!(u.roles?.length) && (
                              <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>—</span>
                            )}
                          </div>
                        </td>

                        {/* Estado */}
                        <td>
                          <span className={`${styles.badge} ${getStatusBadgeClass(u.is_active)}`}>
                            {getStatusLabel(u.is_active)}
                          </span>
                          {!u.profile_complete && (
                            <span className={`${styles.badge} ${styles.badgeIncomplete}`} style={{ marginLeft: 4 }}>
                              Incompleto
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        {isSA && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className={styles.actionsCell}>
                              {/* Ver perfil */}
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnEye}`}
                                title="Ver Perfil Completo"
                                onClick={() => router.push(`/users/${u.id}/profile`)}
                              >
                                <Eye size={16} />
                              </button>

                              {/* Activar / Desactivar */}
                              {canEdit && (
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} ${u.is_active ? styles.actionBtnOn : styles.actionBtnOff}`}
                                  title={u.is_active ? 'Desactivar cuenta' : 'Activar cuenta'}
                                  onClick={() => toggleMut.mutate({ id: u.id, active: u.is_active })}
                                  disabled={toggleMut.isPending}
                                >
                                  {u.is_active ? <ShieldCheck size={16} /> : <Lock size={16} />}
                                </button>
                              )}

                              {/* Eliminar */}
                              {canDelete && (
                                <button
                                  type="button"
                                  className={`${styles.actionBtn} ${styles.actionBtnDel}`}
                                  title="Eliminar registro"
                                  onClick={() => { setDeleteUser(u); setDeleteInput(''); }}
                                >
                                  <Trash2 size={16} />
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
          </div>
        )}

        {/* Pagination */}
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

        {/* Bulk actions bar */}
        {isSA && (
          <BulkActionsBar
            selectedCount={selected.size}
            onClear={() => clearSelection()}
            actions={[
              { label: 'Activar',    variant: 'success', loading: bulkActivateMut.isPending,   disabled: bulkPending, onClick: () => bulkActivateMut.mutate(selectedIds) },
              { label: 'Desactivar', variant: 'warning', loading: bulkDeactivateMut.isPending, disabled: bulkPending, onClick: () => bulkDeactivateMut.mutate(selectedIds) },
              { label: 'Eliminar',   variant: 'danger',  disabled: bulkPending,               onClick: () => setBulkDeleteOpen(true) },
            ]}
          />
        )}
      </div>

      {/* ════════════════════════════════════════════════
          CREATE USER MODAL — matches EstructuraGen.html
          ════════════════════════════════════════════════ */}
      {createOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}
        >
          <div className={styles.modalBox}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <UserPlus size={20} className={styles.modalHeaderIcon} style={{ color: '#ff5e3a' }} />
                <h3 className={styles.modalTitle}>Crear Nuevo Usuario</h3>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setCreateOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={createForm.handleSubmit((v) => createMut.mutate(v))}>
              <div className={styles.modalBody}>

                {/* Nombre + Apellido */}
                <div className={styles.formRow2}>
                  <div>
                    <label className={styles.fieldLabel}>Nombre *</label>
                    <input
                      className={styles.fieldInput}
                      placeholder="Ej: Natalia"
                      {...createForm.register('first_name')}
                    />
                    {createForm.formState.errors.first_name && (
                      <p className={styles.fieldError}>{createForm.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Apellido *</label>
                    <input
                      className={styles.fieldInput}
                      placeholder="Ej: López"
                      {...createForm.register('last_name')}
                    />
                    {createForm.formState.errors.last_name && (
                      <p className={styles.fieldError}>{createForm.formState.errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className={styles.fieldLabel}>Correo Electrónico *</label>
                  <input
                    className={styles.fieldInput}
                    type="email"
                    placeholder="Ej: natalia.lopez@empresa.co"
                    autoComplete="off"
                    {...createForm.register('email')}
                  />
                  {createForm.formState.errors.email && (
                    <p className={styles.fieldError}>{createForm.formState.errors.email.message}</p>
                  )}
                </div>

                {/* Rol Global + Estado Inicial */}
                <div className={styles.formRow2}>
                  <div>
                    <label className={styles.fieldLabel}>Rol Global *</label>
                    <select
                      className={styles.fieldSelect}
                      value={createForm.watch('is_superadmin') ? 'superadmin' : 'usuario'}
                      onChange={(e) => createForm.setValue('is_superadmin', e.target.value === 'superadmin')}
                    >
                      <option value="usuario">usuario</option>
                      <option value="superadmin">superadmin</option>
                    </select>
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Estado Inicial *</label>
                    <select className={styles.fieldSelect} defaultValue="Activo">
                      <option value="Activo">Activo</option>
                      <option value="Pendiente">Pendiente</option>
                    </select>
                  </div>
                </div>

                {/* Módulos / Roles */}
                <div>
                  <label className={styles.moduleSectionLabel}>Módulos / Roles Permitidos</label>
                  <div className={styles.modulesBox}>
                    <div className={styles.moduleRow}>
                      <label className={styles.moduleCheckLabel}>
                        <input type="checkbox" className={styles.moduleCheck} />
                        <span>Helpdesk</span>
                      </label>
                      <select className={styles.moduleRoleSelect}>
                        <option value="usuario">usuario</option>
                        <option value="tecnico">tecnico</option>
                        <option value="jefe_tecnico">jefe_tecnico</option>
                      </select>
                    </div>
                    <div className={styles.moduleRow}>
                      <label className={styles.moduleCheckLabel}>
                        <input type="checkbox" className={styles.moduleCheck} />
                        <span>Gestión Administrativa</span>
                      </label>
                      <select className={styles.moduleRoleSelect}>
                        <option value="usuario">usuario</option>
                        <option value="admin_modulo">admin_modulo</option>
                      </select>
                    </div>
                    <div className={styles.moduleRow}>
                      <label className={styles.moduleCheckLabel}>
                        <input type="checkbox" className={styles.moduleCheck} />
                        <span>Inventario de Activos</span>
                      </label>
                      <select className={styles.moduleRoleSelect}>
                        <option value="usuario">usuario</option>
                        <option value="tecnico">tecnico</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Info hint */}
                <p className={styles.fieldHint}>
                  El usuario recibirá el email para acceder. Contraseña inicial: <strong>Ticket2026!</strong>
                </p>

                {/* Feedback */}
                {modalMsg && (
                  <p className={modalMsg.type === 'ok' ? styles.msgOk : styles.msgErr}>
                    {modalMsg.text}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.modalBtnCancel}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.modalBtnSave}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? 'Guardando…' : 'Guardar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
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
            <button type="button" className={mstyles.actCancel}
              onClick={() => { setEditUser(null); setModalMsg(null); }}>Cancelar</button>
            <button type="submit" className={mstyles.actConfirm} disabled={updateMut.isPending}>
              {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── DELETE MODAL ── */}
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
          <button type="button" className={mstyles.actCancel}
            onClick={() => { setDeleteUser(null); setDeleteInput(''); }}>Cancelar</button>
          <button type="button" className={mstyles.actDanger}
            disabled={!deleteMatch || deleteMut.isPending}
            onClick={() => deleteUser && deleteMut.mutate(deleteUser.id)}>
            {deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Modal>

      {/* ── BULK DELETE CONFIRM MODAL ── */}
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

      {importOpen && <BulkImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
