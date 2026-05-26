'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Search, SlidersHorizontal, ChevronDown,
  Plus, Eye, ShieldCheck, Lock, Trash2, UserPlus, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { socketService } from '@/services/socket.service';
import { tokens } from '@/lib/tokens';
import { usersService, type UserListItem } from '@/services/users.service';
import type { User } from '@/types/user.types';
import { adminService } from '@/services/admin.service';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import styles from '@/app/(app)/users/users.module.css';
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
  online: 'connOnline', away: 'connAway', offline: 'connOffline',
};
const CONN_LABEL: Record<ConnStatus, string> = {
  online: 'En línea', away: 'Ausente', offline: 'Desconectado',
};

/* Normalise module users (role_name field, no `roles` array) into UserListItem */
function normaliseModuleUser(u: User & { role_name: string }): UserListItem {
  return {
    ...u,
    email:            (u as any).email ?? '',
    is_active:        (u as any).is_active ?? true,
    is_superadmin:    (u as any).is_superadmin ?? false,
    profile_complete: true,
    global_role:      null,
    global_role_id:   null,
    last_login_at:    null,
    last_seen_at:     (u as any).last_seen_at ?? null,
    roles:            u.role_name ? [{ module: 'este módulo', role: u.role_name }] : [],
  } as UserListItem;
}

/* ── Props ── */
interface Props {
  moduleId: string;
  /** 'module-only' = fetch only members of this module (helpdesk)
   *  'all'         = fetch all system users (inventory, gestión) */
  scope: 'module-only' | 'all';
  /** Base path for user profile links, e.g. '/helpdesk/users'. Defaults to '/users'. */
  profileBasePath?: string;
}

export function ModuleScopedUsersClient({ moduleId, scope, profileBasePath = '/users' }: Props) {
  const router  = useRouter();
  const qc      = useQueryClient();
  const authUser    = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;
  const isAdminModulo = authUser?.module_roles?.some(
    (r) => r.module_id === moduleId && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;
  const canAct = isSuperadmin || isAdminModulo;

  /* ── Filters ── */
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortVal,      setSortVal]      = useState('name_asc');
  const [advOpen,      setAdvOpen]      = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Realtime presence ── */
  const [wsConnected, setWsConnected] = useState<Set<string>>(new Set());

  const updatePresence = useCallback((userId: string, connected: boolean) => {
    setWsConnected((prev) => {
      const next = new Set(prev);
      if (connected) next.add(userId); else next.delete(userId);
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
  const [createOpen,  setCreateOpen]  = useState(false);
  const [editUser,    setEditUser]    = useState<UserListItem | null>(null);
  const [deleteUser,  setDeleteUser]  = useState<UserListItem | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [modalMsg,    setModalMsg]    = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  /* ── Data fetching ── */
  const { data: moduleUsers = [], isLoading: loadingModule } = useQuery({
    queryKey: ['module-users-scoped', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    enabled:  scope === 'module-only',
  });

  const { data: allUsersData, isLoading: loadingAll } = useQuery({
    queryKey: ['users-scoped-all'],
    queryFn:  () => usersService.getUsers({ limit: 300, page: 1 }),
    enabled:  scope === 'all',
  });

  const isLoading = scope === 'module-only' ? loadingModule : loadingAll;
  const isError   = false;

  const rawUsers: UserListItem[] = useMemo(() => {
    if (scope === 'module-only') return moduleUsers.map(normaliseModuleUser);
    return allUsersData?.data ?? [];
  }, [scope, moduleUsers, allUsersData]);

  const invalidate = () => {
    if (scope === 'module-only') qc.invalidateQueries({ queryKey: ['module-users-scoped', moduleId] });
    else qc.invalidateQueries({ queryKey: ['users-scoped-all'] });
  };

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
    searchDebounce.current = setTimeout(() => setSearch(val), 350);
  }

  function openEdit(u: UserListItem) {
    setEditUser(u);
    setModalMsg(null);
    editForm.reset({
      first_name:   u.first_name,
      last_name:    u.last_name,
      phone:        (u as any).phone        ?? '',
      username:     (u as any).username     ?? '',
      job_title:    (u as any).job_title    ?? '',
      department:   (u as any).department   ?? '',
      primary_sede: (u as any).primary_sede ?? '',
      address:      (u as any).address      ?? '',
      is_superadmin: u.is_superadmin,
    });
  }

  function openCreate() {
    setCreateOpen(true);
    setModalMsg(null);
    createForm.reset({ first_name: '', last_name: '', email: '', is_superadmin: false });
  }

  /* ── Client-side filter + sort ── */
  const sortedUsers = useMemo(() => {
    let list = [...rawUsers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
      );
    }
    if (statusFilter) {
      list = list.filter(u => String(u.is_active) === statusFilter);
    }
    list.sort((a, b) => {
      const na = `${a.first_name} ${a.last_name}`;
      const nb = `${b.first_name} ${b.last_name}`;
      if (sortVal === 'name_asc')  return na.localeCompare(nb);
      if (sortVal === 'name_desc') return nb.localeCompare(na);
      if (sortVal === 'email_asc') return a.email.localeCompare(b.email);
      return 0;
    });
    return list;
  }, [rawUsers, search, statusFilter, sortVal]);

  const deleteTarget = deleteUser ? `${deleteUser.first_name} ${deleteUser.last_name}` : '';
  const deleteMatch  = deleteInput === deleteTarget;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Usuarios</h1>
            <p className={styles.count}>
              {rawUsers.length} usuario{rawUsers.length !== 1 ? 's' : ''} en este módulo
            </p>
          </div>
          {canAct && (
            <button type="button" className={styles.btnCreate} onClick={openCreate}>
              <Plus size={11} />
              <span>Crear usuario</span>
            </button>
          )}
        </div>

        {/* ── Filter card ── */}
        <div className={styles.filterCard}>
          <div className={styles.filterTopRow}>
            <div className={styles.searchWrap}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar por nombre o email…"
                onChange={onSearchChange}
              />
            </div>
            <div className={styles.filterRightControls}>
              <button
                type="button"
                className={styles.btnAdvFilters}
                onClick={() => setAdvOpen((v) => !v)}
              >
                <SlidersHorizontal size={12} style={{ color: '#ff5e3a' }} />
                <span>Filtros</span>
                <ChevronDown className={`${styles.filterChevron}${advOpen ? ` ${styles.filterChevronOpen}` : ''}`} />
              </button>
              <select className={styles.sortSelect} value={sortVal} onChange={(e) => setSortVal(e.target.value)}>
                <option value="name_asc">Nombre A-Z</option>
                <option value="name_desc">Nombre Z-A</option>
                <option value="email_asc">Email</option>
              </select>
            </div>
          </div>

          <div className={advOpen ? `${styles.advPanel} ${styles.advPanelOpen}` : styles.advPanel}>
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Estado de Cuenta</label>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
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
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Rol Global</th>
                    <th>Módulos / Roles</th>
                    <th>Estado</th>
                    {canAct && <th style={{ textAlign: 'center', paddingRight: 24 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {!sortedUsers.length && (
                    <tr className={styles.emptyRow}>
                      <td colSpan={canAct ? 6 : 5}>
                        No se encontraron usuarios.
                      </td>
                    </tr>
                  )}
                  {sortedUsers.map((u) => {
                    const initials    = getInitials(u.first_name, u.last_name);
                    const connStatus  = deriveConnStatus(u.last_seen_at ?? null, wsConnected.has(u.id));
                    const connDotCls  = `${styles.connDot} ${styles[CONN_DOT_CLASS[connStatus]]}`;

                    return (
                      <tr
                        key={u.id}
                        onClick={() => router.push(`${profileBasePath}/${u.id}/profile`)}
                      >
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
                              <p className={styles.userName}>{u.first_name} {u.last_name}</p>
                              <p className={styles.userConnLabel}>{CONN_LABEL[connStatus]}</p>
                            </div>
                          </div>
                        </td>

                        <td className={styles.emailCell}>{u.email}</td>

                        <td>
                          <span className={styles.badgeGlobal}>
                            {u.is_superadmin ? 'superadmin' : (u.global_role ?? 'usuario')}
                          </span>
                        </td>

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

                        <td>
                          <span className={`${styles.badge} ${u.is_active ? styles.badgeActivo : styles.badgeInactivo}`}>
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>

                        {canAct && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className={styles.actionsCell}>
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnEye}`}
                                title="Ver Perfil Completo"
                                onClick={() => router.push(`${profileBasePath}/${u.id}/profile`)}
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${u.is_active ? styles.actionBtnOn : styles.actionBtnOff}`}
                                title={u.is_active ? 'Desactivar cuenta' : 'Activar cuenta'}
                                onClick={() => toggleMut.mutate({ id: u.id, active: u.is_active })}
                                disabled={toggleMut.isPending}
                              >
                                {u.is_active ? <ShieldCheck size={16} /> : <Lock size={16} />}
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnDel}`}
                                title="Eliminar registro"
                                onClick={() => { setDeleteUser(u); setDeleteInput(''); }}
                              >
                                <Trash2 size={16} />
                              </button>
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
      </div>

      {/* ── CREATE MODAL ── */}
      {createOpen && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <UserPlus size={20} className={styles.modalHeaderIcon} style={{ color: '#ff5e3a' }} />
                <h3 className={styles.modalTitle}>Crear Nuevo Usuario</h3>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setCreateOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createForm.handleSubmit((v) => createMut.mutate(v))}>
              <div className={styles.modalBody}>
                <div className={styles.formRow2}>
                  <div>
                    <label className={styles.fieldLabel}>Nombre *</label>
                    <input className={styles.fieldInput} placeholder="Ej: Natalia" {...createForm.register('first_name')} />
                    {createForm.formState.errors.first_name && (
                      <p className={styles.fieldError}>{createForm.formState.errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Apellido *</label>
                    <input className={styles.fieldInput} placeholder="Ej: López" {...createForm.register('last_name')} />
                    {createForm.formState.errors.last_name && (
                      <p className={styles.fieldError}>{createForm.formState.errors.last_name.message}</p>
                    )}
                  </div>
                </div>
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
                </div>
                <p className={styles.fieldHint}>
                  El usuario recibirá el email para acceder. Contraseña inicial: <strong>Ticket2026!</strong>
                </p>
                {modalMsg && (
                  <p className={modalMsg.type === 'ok' ? styles.msgOk : styles.msgErr}>{modalMsg.text}</p>
                )}
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.modalBtnCancel} onClick={() => setCreateOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnSave} disabled={createMut.isPending}>
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
    </div>
  );
}
