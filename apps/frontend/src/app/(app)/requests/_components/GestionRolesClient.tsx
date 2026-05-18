'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, ShieldCheck, User, Users, type LucideIcon } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { getInitials } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import styles from './gestionRoles.module.css';

/* ── Config ─────────────────────────────────────────────────────────────────── */

const ROLE_CONFIG: Record<string, { label: string; desc: string; Icon: LucideIcon; color: string }> = {
  superadmin: {
    label: 'Superadmin',
    desc:  'Acceso global completo. Gestiona módulos, usuarios y todas las solicitudes del sistema.',
    Icon:  Crown,
    color: '#6366f1',
  },
  admin_modulo: {
    label: 'Admin de módulo',
    desc:  'Gestiona solicitudes de su módulo. Puede tomar, rechazar, escalar y ejecutar cambios.',
    Icon:  ShieldCheck,
    color: '#0ea5e9',
  },
  jefe_tecnico: {
    label: 'Jefe técnico',
    desc:  'Supervisa al equipo técnico del módulo y puede reasignar tickets.',
    Icon:  ShieldCheck,
    color: '#f59e0b',
  },
  tecnico: {
    label: 'Técnico',
    desc:  'Resuelve tickets y solicitudes asignadas en su módulo.',
    Icon:  User,
    color: '#10b981',
  },
  usuario: {
    label: 'Usuario',
    desc:  'Puede crear solicitudes, ver su historial y responder observaciones.',
    Icon:  User,
    color: '#94a3b8',
  },
};

const ROLE_ORDER = ['superadmin', 'admin_modulo', 'jefe_tecnico', 'tecnico', 'usuario'];

/* ── Member chip ────────────────────────────────────────────────────────────── */

function MemberChip({ firstName, lastName, avatarUrl }: { firstName: string; lastName: string; avatarUrl: string | null }) {
  return (
    <div className={styles.chip}>
      <div className={styles.chipAvatar}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" className={styles.chipAvatarImg} />
          : <span>{getInitials(firstName, lastName)}</span>
        }
      </div>
      <span className={styles.chipName}>{firstName} {lastName}</span>
    </div>
  );
}

/* ── Role card ──────────────────────────────────────────────────────────────── */

function RoleCard({
  roleKey,
  members,
}: {
  roleKey:  string;
  members:  Array<{ id: string; first_name: string; last_name: string; avatar_url: string | null }>;
}) {
  const cfg  = ROLE_CONFIG[roleKey];
  const label = cfg?.label ?? roleKey;
  const desc  = cfg?.desc  ?? '';
  const Icon  = cfg?.Icon  ?? User;
  const color = cfg?.color ?? '#94a3b8';

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <div className={styles.roleIconWrap} style={{ background: `${color}18`, color }}>
          <Icon size={18} />
        </div>
        <div className={styles.roleInfo}>
          <div className={styles.roleName}>{label}</div>
          {desc && <div className={styles.roleDesc}>{desc}</div>}
        </div>
        <div className={styles.memberCount} style={{ color }}>
          <Users size={13} />
          {members.length}
        </div>
      </div>

      {members.length > 0 && (
        <div className={styles.memberGrid}>
          {members.map(u => (
            <MemberChip
              key={u.id}
              firstName={u.first_name}
              lastName={u.last_name}
              avatarUrl={u.avatar_url}
            />
          ))}
        </div>
      )}

      {members.length === 0 && (
        <div className={styles.noMembers}>Sin miembros con este rol</div>
      )}
    </div>
  );
}

/* ── Main ───────────────────────────────────────────────────────────────────── */

export function GestionRolesClient({ moduleId }: { moduleId: string }) {
  const { data: moduleUsers = [], isLoading: loadingModule } = useQuery({
    queryKey: ['module-users', moduleId],
    queryFn:  () => usersService.getModuleUsers(moduleId),
    staleTime: 30_000,
  });

  const { data: allUsersData, isLoading: loadingAll } = useQuery({
    queryKey: ['users-list-roles'],
    queryFn:  () => usersService.getUsers({ limit: 500 }),
    staleTime: 30_000,
  });

  const allUsers = allUsersData?.data ?? [];
  const isLoading = loadingModule || loadingAll;

  const grouped = useMemo(() => {
    const map: Record<string, Array<{ id: string; first_name: string; last_name: string; avatar_url: string | null }>> = {};

    // Superadmins come from the full user list
    map.superadmin = allUsers
      .filter(u => u.is_superadmin)
      .map(u => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, avatar_url: u.avatar_url }));

    // All other roles come from module members
    for (const u of moduleUsers) {
      const role = (u as any).role_name as string;
      if (role === 'superadmin') continue; // already covered
      if (!map[role]) map[role] = [];
      map[role].push({ id: u.id, first_name: u.first_name, last_name: u.last_name, avatar_url: u.avatar_url });
    }

    return map;
  }, [moduleUsers, allUsers]);

  // Ordered roles: predefined order first, then any extra from DB
  const roles = [
    ...ROLE_ORDER.filter(r => grouped[r] !== undefined || r === 'superadmin'),
    ...Object.keys(grouped).filter(r => !ROLE_ORDER.includes(r)),
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Roles del sistema</h2>
        <p className={styles.sub}>Gestión Administrativa — distribución de roles y miembros</p>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && (
        <div className={styles.list}>
          {roles.map(role => (
            <RoleCard
              key={role}
              roleKey={role}
              members={grouped[role] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
