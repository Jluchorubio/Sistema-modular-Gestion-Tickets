'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ShieldCheck, User, Users, Crown,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { usePermissions } from '@/hooks/usePermissions';
import { usersService, type UserListItem } from '@/services/users.service';
import { requestsService, type AdmRequest } from '@/services/requests.service';
import { modulesService } from '@/services/modules.service';
import { getInitials } from '@/lib/utils';
import { fmtDate } from '@/lib/formatters';
import {
  REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS,
} from '@/constants/requests';
import { Spinner } from '@/components/ui/Spinner';
import { AssignUsersModal } from '@/app/(app)/modules/[id]/AssignUsersModal';
import { RequestDetailModal } from './RequestDetailModal';
import styles from './dynamicUsers.module.css';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface AdminModule { module_id: string; module_name: string; }

/* ── Role banner ────────────────────────────────────────────────────────────── */

function RoleBanner({
  isSuperadmin,
  adminModules,
}: {
  isSuperadmin: boolean;
  adminModules: AdminModule[];
}) {
  if (isSuperadmin) {
    return (
      <div className={`${styles.banner} ${styles.bannerSuper}`}>
        <Crown size={15} />
        <span><strong>Superadmin</strong> — Acceso global completo. Puedes gestionar usuarios, roles y solicitudes de cualquier módulo.</span>
      </div>
    );
  }
  if (adminModules.length > 0) {
    return (
      <div className={`${styles.banner} ${styles.bannerAdmin}`}>
        <ShieldCheck size={15} />
        <span>
          <strong>Admin de módulo</strong> — Gestionas:{' '}
          {adminModules.map(m => m.module_name).join(', ')}.
          Solo ves solicitudes y usuarios relacionados a tus módulos.
        </span>
      </div>
    );
  }
  return (
    <div className={`${styles.banner} ${styles.bannerUser}`}>
      <User size={15} />
      <span><strong>Usuario</strong> — Puedes ver el directorio y gestionar tus propias solicitudes.</span>
    </div>
  );
}

/* ── Request pill ───────────────────────────────────────────────────────────── */

function RequestPill({ req }: { req: AdmRequest }) {
  const color = REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
  return (
    <span
      className={styles.reqPill}
      style={{ background: `${color}20`, color, border: `1px solid ${color}44` }}
      title={req.title}
    >
      {REQUEST_TYPE_LABELS[req.type] ?? req.type}
    </span>
  );
}

/* ── User row ───────────────────────────────────────────────────────────────── */

function UserRow({
  user,
  requests,
  isSuperadmin,
  adminModuleIds,
  moduleId,
  onAssignRole,
  onManageRequest,
}: {
  user:             UserListItem;
  requests:         AdmRequest[];
  isSuperadmin:     boolean;
  adminModuleIds:   Set<string>;
  moduleId:         string | null;
  onAssignRole:     (u: UserListItem) => void;
  onManageRequest:  (r: AdmRequest) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const userRequests   = requests.filter(r => (r as any).requester_id === user.id);
  const pendingCount   = userRequests.filter(r => ['pending', 'taken', 'in_progress'].includes(r.status)).length;
  const moduleRoleHere = user.roles?.find(r => adminModuleIds.has('') || isSuperadmin)?.role;

  const isInAdminModule = isSuperadmin || user.roles?.some(r =>
    Array.from(adminModuleIds).some(mid => (r as any).module_id === mid)
  );

  return (
    <div className={`${styles.row}${expanded ? ` ${styles.rowExpanded}` : ''}`}>
      <div className={styles.rowMain}>
        {/* Avatar */}
        <div className={styles.avatar}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className={styles.avatarImg} />
            : <span>{getInitials(user.first_name, user.last_name)}</span>
          }
          {!user.is_active && <span className={styles.inactiveDot} title="Inactivo" />}
        </div>

        {/* Info */}
        <div className={styles.userInfo}>
          <div className={styles.userName}>
            {user.first_name} {user.last_name}
            {user.is_superadmin && <span className={styles.superBadge}><Crown size={10} /> SA</span>}
          </div>
          <div className={styles.userMeta}>
            <span>{user.email}</span>
            {user.job_title && <><span>·</span><span>{user.job_title}</span></>}
            {user.department && <><span>·</span><span>{user.department}</span></>}
          </div>
          {/* Module roles */}
          {user.roles && user.roles.length > 0 && (
            <div className={styles.moduleRoles}>
              {user.roles.slice(0, 3).map((r, i) => (
                <span key={i} className={styles.modulePill}>{r.module}: <strong>{r.role}</strong></span>
              ))}
              {user.roles.length > 3 && <span className={styles.moreRoles}>+{user.roles.length - 3}</span>}
            </div>
          )}
        </div>

        {/* Pending requests badge */}
        <div className={styles.statsCol}>
          {pendingCount > 0 && (
            <span className={styles.pendingBadge}>
              <AlertCircle size={12} />
              {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
            </span>
          )}
          {userRequests.length > 0 && (
            <span className={styles.totalReqs}>{userRequests.length} solicitud{userRequests.length !== 1 ? 'es' : ''}</span>
          )}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          {(isSuperadmin || isInAdminModule) && (
            <button
              type="button"
              className={styles.btnAction}
              onClick={() => onAssignRole(user)}
              title="Gestionar rol en módulo"
            >
              <ShieldCheck size={13} />
              {isSuperadmin ? 'Gestionar' : 'Asignar rol'}
            </button>
          )}
          {userRequests.length > 0 && (
            <button
              type="button"
              className={`${styles.btnAction} ${styles.btnActionSecondary}`}
              onClick={() => setExpanded(v => !v)}
              title={expanded ? 'Ocultar solicitudes' : 'Ver solicitudes'}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Ocultar' : `Ver ${userRequests.length}`}
            </button>
          )}
        </div>
      </div>

      {/* Expanded requests */}
      {expanded && userRequests.length > 0 && (
        <div className={styles.requestsPanel}>
          <div className={styles.requestsPanelTitle}>Solicitudes de {user.first_name}</div>
          {userRequests.map(req => (
            <div key={req.id} className={styles.reqRow}>
              <div className={styles.reqLeft}>
                <RequestPill req={req} />
                <span className={styles.reqTitle}>{req.title}</span>
              </div>
              <div className={styles.reqRight}>
                <span className={styles.reqDate}>{fmtDate(req.created_at)}</span>
                {req.escalated && (
                  <span className={styles.escalatedTag}>
                    <AlertCircle size={10} /> Escalada
                  </span>
                )}
                {(isSuperadmin || isInAdminModule) && (
                  <button
                    type="button"
                    className={styles.btnManage}
                    onClick={() => onManageRequest(req)}
                    title="Ver y gestionar solicitud"
                  >
                    Gestionar →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Own profile card (usuario view) ────────────────────────────────────────── */

function OwnProfileCard({
  user,
  requests,
}: {
  user: UserListItem;
  requests: AdmRequest[];
}) {
  const pending   = requests.filter(r => ['pending', 'taken', 'in_progress'].includes(r.status));
  const completed = requests.filter(r => r.status === 'completed');

  return (
    <div className={styles.ownCard}>
      <div className={styles.ownTop}>
        <div className={styles.ownAvatar}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className={styles.ownAvatarImg} />
            : <span>{getInitials(user.first_name, user.last_name)}</span>
          }
        </div>
        <div>
          <div className={styles.ownName}>{user.first_name} {user.last_name}</div>
          <div className={styles.ownEmail}>{user.email}</div>
          {user.roles && user.roles.length > 0 && (
            <div className={styles.moduleRoles}>
              {user.roles.map((r, i) => (
                <span key={i} className={styles.modulePill}>{r.module}: <strong>{r.role}</strong></span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.ownStats}>
        <div className={styles.ownStat}>
          <Clock size={14} />
          <span><strong>{pending.length}</strong> en curso</span>
        </div>
        <div className={styles.ownStat}>
          <CheckCircle2 size={14} />
          <span><strong>{completed.length}</strong> completadas</span>
        </div>
      </div>

      {requests.length > 0 && (
        <div className={styles.ownRequests}>
          <div className={styles.requestsPanelTitle}>Mis solicitudes</div>
          {requests.slice(0, 10).map(req => (
            <div key={req.id} className={styles.reqRow}>
              <div className={styles.reqLeft}>
                <RequestPill req={req} />
                <span className={styles.reqTitle}>{req.title}</span>
              </div>
              <div className={styles.reqRight}>
                <span
                  className={styles.reqStatus}
                  style={{ color: REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8' }}
                >
                  {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                </span>
                <span className={styles.reqDate}>{fmtDate(req.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function DynamicUsersClient() {
  const authUser   = useAuthStore(s => s.user);
  const moduleId   = useUIStore(s => s.moduleId);
  const { isSuperadmin, isModuleAdmin } = usePermissions();

  const adminModules: AdminModule[] = useMemo(() =>
    (authUser?.module_roles ?? [])
      .filter(r => r.role_name === 'admin_modulo' && r.status === 'active')
      .map(r => ({ module_id: r.module_id, module_name: r.module_name })),
    [authUser]
  );

  const adminModuleIds = useMemo(() => new Set(adminModules.map(m => m.module_id)), [adminModules]);

  const isAdminModulo = !isSuperadmin && adminModules.length > 0;
  const isUsuario     = !isSuperadmin && !isAdminModulo;

  const [search,        setSearch]        = useState('');
  const [assignTarget,  setAssignTarget]  = useState<UserListItem | null>(null);
  const [detailRequest, setDetailRequest] = useState<AdmRequest | null>(null);

  /* ── Data fetching ── */
  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ['users-list-dyn', search],
    queryFn:  () => usersService.getUsers({ limit: 150, page: 1 }),
    enabled:  !isUsuario,
    staleTime: 30_000,
  });

  // Admin inbox (auto-filtered by module in backend)
  const { data: inboxData, isLoading: loadingReqs } = useQuery({
    queryKey: ['requests-inbox-dyn'],
    queryFn:  () => requestsService.getAll({ limit: 500 }),
    enabled:  isAdminModulo || isSuperadmin,
    staleTime: 30_000,
  });

  // Own requests (for usuario or to show in header stats)
  const { data: mineData } = useQuery({
    queryKey: ['requests-mine-dyn'],
    queryFn:  () => requestsService.getMine(100),
    staleTime: 30_000,
  });

  // Own user data (for usuario view)
  const ownUser = useMemo(() => {
    if (!authUser || !usersData?.data) return null;
    return usersData.data.find(u => u.id === authUser.id) ?? null;
  }, [authUser, usersData]);

  const allUsers   = usersData?.data ?? [];
  const inboxReqs  = inboxData?.data ?? [];
  const mineReqs   = mineData?.data ?? [];

  /* ── Filter + search ── */
  const filtered = useMemo(() => {
    if (!search) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(u =>
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.job_title ?? '').toLowerCase().includes(q) ||
      (u.department ?? '').toLowerCase().includes(q)
    );
  }, [allUsers, search]);

  /* ── Stats ── */
  const totalPending = isSuperadmin || isAdminModulo
    ? inboxReqs.filter(r => ['pending', 'taken', 'in_progress'].includes(r.status)).length
    : mineReqs.filter(r => ['pending', 'taken', 'in_progress'].includes(r.status)).length;

  const isLoading = loadingUsers || loadingReqs;

  /* ── Usuario view ── */
  if (isUsuario) {
    return (
      <div className={styles.wrap}>
        <RoleBanner isSuperadmin={false} adminModules={[]} />
        <div className={styles.pageHeader}>
          <h2 className={styles.title}>Directorio de usuarios</h2>
          <p className={styles.sub}>Vista de lectura — tus solicitudes activas: <strong>{totalPending}</strong></p>
        </div>

        {authUser && (
          <OwnProfileCard
            user={{ ...authUser, global_role: null, global_role_id: null, last_login_at: null, roles: (authUser as any).module_roles?.map((r: any) => ({ module: r.module_name, role: r.role_name })) ?? [] }}
            requests={mineReqs}
          />
        )}
      </div>
    );
  }

  /* ── Admin / Superadmin view ── */
  return (
    <div className={styles.wrap}>
      <RoleBanner isSuperadmin={isSuperadmin} adminModules={adminModules} />

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.stat}>
          <Users size={14} />
          <span><strong>{allUsers.length}</strong> usuarios</span>
        </div>
        <div className={styles.stat}>
          <AlertCircle size={14} />
          <span><strong>{totalPending}</strong> solicitudes pendientes</span>
        </div>
        {isSuperadmin && (
          <div className={styles.stat}>
            <ShieldCheck size={14} />
            <span><strong>{allUsers.filter(u => u.is_superadmin).length}</strong> superadmins</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nombre, email, cargo, área…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && filtered.length === 0 && (
        <div className={styles.empty}>Sin resultados para "{search}"</div>
      )}

      {!isLoading && (
        <div className={styles.list}>
          {filtered.map(user => (
            <UserRow
              key={user.id}
              user={user}
              requests={inboxReqs}
              isSuperadmin={isSuperadmin}
              adminModuleIds={adminModuleIds}
              moduleId={moduleId}
              onAssignRole={setAssignTarget}
              onManageRequest={setDetailRequest}
            />
          ))}
        </div>
      )}

      {/* Assign/manage modal */}
      {assignTarget && moduleId && (
        <AssignUsersModal
          moduleId={isSuperadmin ? (moduleId ?? assignTarget.id) : Array.from(adminModuleIds)[0] ?? moduleId}
          existingUserIds={new Set()}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {/* Request detail modal */}
      {detailRequest && (
        <RequestDetailModal
          request={detailRequest}
          onClose={() => setDetailRequest(null)}
          onUpdated={() => setDetailRequest(null)}
          showAdminActions={true}
          isSuperadmin={isSuperadmin}
        />
      )}
    </div>
  );
}
