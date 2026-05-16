'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Ticket, FileText, LogIn, ShieldCheck, Star,
} from 'lucide-react';
import {
  fmtDate, fmtRelative, getActiveModules,
  CONTRIB_COLORS,
  type ProfileUser,
} from './profile.types';
import { usersService } from '@/services/users.service';
import styles from './profile.module.css';

/* ── Activity graph helpers ──────────────────────────────────────────────── */

function getGraphStartDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - dayOfWeek - 25 * 7);
  return start;
}

function toISODay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2)  return 1;
  if (count <= 5)  return 2;
  if (count <= 9)  return 3;
  return 4;
}

/* ── Activity feed helpers ───────────────────────────────────────────────── */

const FEED_EVENT_CONFIG: Record<string, { icon: typeof Ticket; color: string; label: string }> = {
  ticket_created:    { icon: Ticket,    color: '#6366F1', label: 'Ticket creado'      },
  request_pending:   { icon: FileText,  color: '#F59E0B', label: 'Solicitud enviada'  },
  request_approved:  { icon: Star,      color: '#22C55E', label: 'Solicitud aprobada' },
  request_rejected:  { icon: FileText,  color: '#EF4444', label: 'Solicitud rechazada'},
  request_taken:     { icon: ShieldCheck,color:'#3B82F6', label: 'Solicitud tomada'   },
  request_in_progress:{ icon: FileText, color: '#8B5CF6', label: 'En revisión'        },
  login:             { icon: LogIn,     color: '#10B981', label: 'Inicio de sesión'   },
};

function feedConfig(type: string) {
  return FEED_EVENT_CONFIG[type] ?? { icon: FileText, color: '#94A3B8', label: type };
}

/* ── Role color ──────────────────────────────────────────────────────────── */

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  admin_modulo:  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  jefe_tecnico:  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  tecnico:       { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  usuario:       { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
};

function roleColor(name: string) {
  return ROLE_COLORS[name] ?? { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
}

/* ── Component ───────────────────────────────────────────────────────────── */

interface Props {
  user:                 ProfileUser;
  isOwnProfile:         boolean;
  fullName:             string;
  viewerIsSuperadmin?:  boolean;
  targetUserId?:        string;
}

export function ProfileOverviewTab({ user, isOwnProfile, fullName, viewerIsSuperadmin = false, targetUserId }: Props) {
  const router        = useRouter();
  const activeModules = getActiveModules(user);
  const canSeeOps     = isOwnProfile || (viewerIsSuperadmin && !!targetUserId);
  const uid           = targetUserId ?? user.id;

  /* ── Tickets ── */
  const { data: recentTickets } = useQuery({
    queryKey:  ['recent-tickets', uid],
    queryFn:   () => isOwnProfile
      ? usersService.getMyRecentTickets(6)
      : usersService.getUserRecentTickets(uid, 6),
    enabled:   canSeeOps,
    staleTime: 60_000,
  });

  /* ── Activity graph ── */
  const { data: activityData } = useQuery({
    queryKey:  ['activity-graph', uid],
    queryFn:   () => usersService.getMyActivity(),
    enabled:   isOwnProfile,
    staleTime: 5 * 60_000,
  });

  /* ── Activity feed ── */
  const { data: feedData } = useQuery({
    queryKey:  ['activity-feed', uid],
    queryFn:   () => isOwnProfile
      ? usersService.getMyActivityFeed()
      : usersService.getUserActivityFeed(uid),
    enabled:   canSeeOps,
    staleTime: 60_000,
  });

  /* ── Stats ── */
  const { data: stats } = useQuery({
    queryKey:  ['request-stats', uid],
    queryFn:   () => isOwnProfile
      ? usersService.getMyRequestStats()
      : usersService.getUserRequestStats(uid),
    enabled:   canSeeOps,
    staleTime: 60_000,
  });

  const activityMap = useMemo(() => {
    const map: Record<string, number> = {};
    (activityData ?? []).forEach(({ day, count }) => { map[day] = count; });
    return map;
  }, [activityData]);

  const graphStart    = useMemo(() => getGraphStartDate(), []);
  const totalActivity = useMemo(
    () => Object.values(activityMap).reduce((s, v) => s + v, 0),
    [activityMap],
  );

  const pColor: Record<string, string> = {
    baja: '#94A3B8', media: '#3B82F6', alta: '#F59E0B', critica: '#EF4444',
  };

  return (
    <>
      {isOwnProfile && !user.profile_complete && (
        <div className={styles.incompleteBanner}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>
            Perfil incompleto — acceso al sistema limitado.
          </span>
          <button
            className={styles.btnPrimary}
            style={{ fontSize: 12, padding: '7px 14px', background: '#D97706', whiteSpace: 'nowrap' }}
            onClick={() => router.push('/profile/complete')}
          >
            Completar ahora
          </button>
        </div>
      )}

      {/* ── Profile info ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Información del perfil</p>
          <span className={styles.sectionMeta}>VERIFICADO</span>
        </div>
        <div className={styles.infoGrid}>
          {([
            ['Nombre completo',       fullName],
            ['Nombre de usuario',     user.username ? `@${user.username}` : '—'],
            ['Correo electrónico',    user.email          || '—'],
            ['Teléfono celular',      user.phone ? `${user.phone_prefix ? user.phone_prefix + ' ' : ''}${user.phone}` : '—'],
            ['Género',                user.gender ? (({masculino:'Masculino',femenino:'Femenino',no_binario:'No binario',prefiero_no_decir:'Prefiero no decir',otro:'Otro'} as Record<string,string>)[user.gender] ?? user.gender) : '—'],
            ['Fecha de nacimiento',   user.birth_date ? new Date(user.birth_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
            ['Nro. documento',        user.national_id    || '—'],
            ['País',                  user.country        || '—'],
            ['Departamento / Estado', user.state_province || '—'],
            ['Ciudad',                user.city           || '—'],
            ['Dirección',             user.address        || '—'],
            ['Área / Departamento',   user.department     || '—'],
            ['Cargo actual',          user.job_title      || '—'],
            ['Sede principal',        user.primary_sede   || '—'],
            ['Contacto emergencia',   user.emergency_contact_name ? `${user.emergency_contact_name}${user.emergency_contact_phone ? ' · ' + user.emergency_contact_phone : ''}` : '—'],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <p className={styles.infoLabel}>{label}</p>
              <p className={styles.infoValue}>{value}</p>
            </div>
          ))}
          <div>
            <p className={styles.infoLabel}>Estado de cuenta</p>
            <span className={`${styles.badge} ${user.is_active ? styles.badgeGreen : styles.badgeRed}`}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: user.is_active ? '#22C55E' : '#EF4444', display: 'inline-block' }} />
              {user.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div>
            <p className={styles.infoLabel}>Último acceso</p>
            <p className={styles.infoValue}>{fmtRelative(user.last_login_at)}</p>
          </div>
        </div>
      </div>

      {/* ── Module roles (visible a superadmin viendo otro usuario) ── */}
      {viewerIsSuperadmin && !isOwnProfile && activeModules.length > 0 && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Roles en módulos</p>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>{activeModules.length} asignación{activeModules.length !== 1 ? 'es' : ''}</span>
          </div>
          <div style={{ padding: '14px 22px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeModules.map((r) => {
              const c = roleColor(r.role_name);
              return (
                <div
                  key={r.umr_id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 20,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    fontSize: 12, fontWeight: 500,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{r.module_name}</span>
                  <span style={{ opacity: 0.7 }}>·</span>
                  <span>{r.role_name.replace('_', ' ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Stats (tickets + requests) ── */}
      {canSeeOps && stats && (
        <div className={styles.ticketStatGrid} style={{ marginBottom: 22 }}>
          {([
            ['Tickets creados', stats.tickets_total,                        '#6366F1'],
            ['Solicitudes',     stats.requests_total,                       '#0D1B2A'],
            ['Aprobadas',       stats.requests_by_status['approved']  ?? 0, '#22C55E'],
            ['Pendientes',      stats.requests_by_status['pending']   ?? 0, '#F59E0B'],
            ['Rechazadas',      stats.requests_by_status['rejected']  ?? 0, '#EF4444'],
            ['Canceladas',      stats.requests_by_status['cancelled'] ?? 0, '#94A3B8'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} className={styles.ticketStatItem}>
              <div className={styles.ticketStatLabel}>{label}</div>
              <div className={styles.ticketStatValue} style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent tickets ── */}
      {canSeeOps && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Últimos tickets</p>
            {isOwnProfile && (
              <button
                style={{ fontSize: 11, color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0 }}
                onClick={() => router.push('/my-tickets')}
              >
                Ver más →
              </button>
            )}
          </div>

          {!recentTickets || recentTickets.length === 0 ? (
            <div style={{ padding: '24px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Sin tickets aún.
            </div>
          ) : (
            <div>
              {recentTickets.map((t, i, arr) => (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : undefined, gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                      {t.module_name} · {fmtRelative(t.created_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    <span className={styles.badge} style={{ fontSize: 10, background: `${pColor[t.priority] ?? '#94A3B8'}22`, color: pColor[t.priority] ?? '#94A3B8', border: `1px solid ${pColor[t.priority] ?? '#94A3B8'}44` }}>
                      {t.priority}
                    </span>
                    <span className={styles.badge} style={{ fontSize: 10, background: t.is_final ? '#22C55E22' : '#6366F122', color: t.is_final ? '#22C55E' : '#6366F1', border: `1px solid ${t.is_final ? '#22C55E44' : '#6366F144'}` }}>
                      {t.state_label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Activity feed ── */}
      {canSeeOps && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Actividad operativa</p>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>Últimos 90 días</span>
          </div>

          {(!feedData || feedData.length === 0) && (
            <div style={{ padding: '24px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Sin actividad reciente.
            </div>
          )}

          {feedData && feedData.length > 0 && (
            <div>
              {/* Static events from user object */}
              {([
                user.last_login_at    ? { type: 'login',    title: 'Inicio de sesión',  context: '', ts: user.last_login_at } : null,
                user.profile_complete ? { type: 'request_approved', title: 'Perfil completado', context: 'Cuenta', ts: user.updated_at } : null,
                { type: 'login', title: 'Cuenta creada', context: '', ts: user.created_at },
              ].filter(Boolean) as { type: string; title: string; context: string; ts: string }[]).map((e, i) => {
                const cfg = feedConfig(e.type);
                const Icon = cfg.icon;
                return (
                  <div
                    key={`static-${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderBottom: '1px solid #F1F5F9' }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${cfg.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={13} style={{ color: cfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0 }}>{e.title}</p>
                      {e.context && <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{e.context}</p>}
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{fmtRelative(e.ts)}</span>
                  </div>
                );
              })}

              {/* Dynamic events from API */}
              {feedData.map((event, i) => {
                const cfg  = feedConfig(event.type);
                const Icon = cfg.icon;
                return (
                  <div
                    key={`feed-${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderBottom: i < feedData.length - 1 ? '1px solid #F1F5F9' : undefined }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${cfg.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={13} style={{ color: cfg.color }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.title}
                      </p>
                      {event.context && (
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                          {cfg.label}{event.context ? ` · ${event.context}` : ''}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{fmtRelative(event.ts)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Activity graph (heatmap) — solo perfil propio ── */}
      {isOwnProfile && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Historial de actividad</p>
            <span style={{ fontSize: 10, color: '#64748B' }}>
              {totalActivity} eventos · últimas 26 semanas
            </span>
          </div>
          <div style={{ padding: '18px 22px 20px' }}>
            <div className={styles.contribGraph}>
              {Array.from({ length: 26 }, (_, w) => (
                <div key={w} className={styles.contribCol}>
                  {Array.from({ length: 7 }, (_, d) => {
                    const date  = new Date(graphStart);
                    date.setDate(graphStart.getDate() + w * 7 + d);
                    const key   = toISODay(date);
                    const count = activityMap[key] ?? 0;
                    const level = countToLevel(count);
                    return (
                      <div
                        key={d}
                        className={styles.contribCell}
                        style={{ background: CONTRIB_COLORS[level] }}
                        title={count > 0 ? `${count} eventos · ${key}` : key}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
              <span>Menos</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {CONTRIB_COLORS.map(c => (
                  <div key={c} style={{ width: 11, height: 11, borderRadius: 2, background: c }} />
                ))}
              </div>
              <span>Más</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
