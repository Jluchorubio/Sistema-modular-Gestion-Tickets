'use client';
import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Ticket, FileText, ShieldCheck, Star } from 'lucide-react';
import { fmtDate, fmtRelative, getActiveModules, type ProfileUser } from './profile.types';
import { usersService } from '@/services/users.service';
import styles from './profile.module.css';

/* ── Activity feed helpers ───────────────────────────────────────────────── */

// login events intentionally excluded — they belong in the Security tab (sessions)
const FEED_EVENT_CONFIG: Record<string, { icon: typeof Ticket; color: string; label: string }> = {
  ticket_created:      { icon: Ticket,     color: '#1d4ed8', label: 'Ticket creado'      },
  request_pending:     { icon: FileText,   color: '#F59E0B', label: 'Solicitud enviada'  },
  request_approved:    { icon: Star,       color: '#22C55E', label: 'Solicitud aprobada' },
  request_rejected:    { icon: FileText,   color: '#EF4444', label: 'Solicitud rechazada'},
  request_taken:       { icon: ShieldCheck,color: '#3B82F6', label: 'Solicitud tomada'   },
  request_in_progress: { icon: FileText,   color: '#8B5CF6', label: 'En revisión'        },
  account_created:     { icon: Star,       color: '#22C55E', label: 'Cuenta creada'      },
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

  /* ── Online status (shared cache key with SecurityTab, no duplicate request) ── */
  const { data: sessionsData } = useQuery({
    queryKey:  ['my-sessions'],
    queryFn:   () => usersService.getMySessions(),
    enabled:   isOwnProfile,
    staleTime: 30_000,
  });
  const isOnline = sessionsData?.is_online ?? false;

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

  /* ── Tech rating (own profile, tech roles only) ── */
  const isTech = useMemo(
    () => (user.module_roles ?? []).some(r => r.status === 'active' && ['tecnico', 'jefe_tecnico'].includes(r.role_name)),
    [user.module_roles],
  );

  const { data: techStats } = useQuery({
    queryKey:  ['tech-stats', uid],
    queryFn:   () => usersService.getMyTechStats(),
    enabled:   isOwnProfile && isTech,
    staleTime: 60_000,
  });

  /* ── Activity heatmap (26 weeks) ── */
  const { data: activityData = [] } = useQuery({
    queryKey:  ['activity-heatmap', uid],
    queryFn:   () => usersService.getMyActivity(),
    enabled:   isOwnProfile,
    staleTime: 300_000,
  });

  const heatmapWeeks = useMemo(() => {
    const map = new Map(activityData.map(d => [d.day, d.count]));
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 181);
    const weeks: { iso: string; count: number; dow: number }[][] = [];
    let week: { iso: string; count: number; dow: number }[] = [];
    for (let i = 0; i < 182; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      if (i > 0 && d.getDay() === 0) { weeks.push(week); week = []; }
      week.push({ iso, count: map.get(iso) ?? 0, dow: d.getDay() });
    }
    if (week.length) weeks.push(week);
    return weeks;
  }, [activityData]);

  const heatColor = useCallback((count: number): string => {
    if (count === 0) return '#f1f5f9';
    if (count <= 2)  return '#bfdbfe';
    if (count <= 5)  return '#60a5fa';
    return '#1d4ed8';
  }, []);

  // operational feed excludes login/session events (those live in Security tab)
  const operationalFeed = useMemo(
    () => (feedData ?? []).filter(e => e.type !== 'login'),
    [feedData],
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
            <p className={styles.infoLabel}>Estado</p>
            {isOwnProfile ? (
              <span className={`${styles.badge} ${isOnline ? styles.badgeGreen : styles.badgeGray}`}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#22C55E' : '#94A3B8', display: 'inline-block' }} />
                {isOnline ? 'En línea' : 'Sin conexión'}
              </span>
            ) : (
              <span className={`${styles.badge} ${user.is_active ? styles.badgeGreen : styles.badgeRed}`}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: user.is_active ? '#22C55E' : '#EF4444', display: 'inline-block' }} />
                {user.is_active ? 'Activo' : 'Inactivo'}
              </span>
            )}
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
            ['Tickets creados', stats.tickets_total,                        '#1d4ed8'],
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

      {/* ── Tech rating (own profile, tech roles only) ── */}
      {isOwnProfile && isTech && techStats && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Rendimiento técnico</p>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>{techStats.rated_tickets} ticket{techStats.rated_tickets !== 1 ? 's' : ''} valorado{techStats.rated_tickets !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ padding: '14px 22px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1,2,3,4,5].map(n => (
                <Star
                  key={n} size={20}
                  fill={n <= Math.round(techStats.avg_rating) ? '#F59E0B' : 'none'}
                  stroke={n <= Math.round(techStats.avg_rating) ? '#F59E0B' : '#CBD5E1'}
                />
              ))}
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0e2235' }}>
              {techStats.avg_rating > 0 ? techStats.avg_rating.toFixed(1) : '—'}
            </span>
            {techStats.rated_tickets === 0 && (
              <span style={{ fontSize: 12, color: '#94A3B8' }}>Sin valoraciones aún</span>
            )}
          </div>
        </div>
      )}

      {/* ── Activity heatmap (own profile only) ── */}
      {isOwnProfile && heatmapWeeks.length > 0 && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Actividad</p>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>{activityData.reduce((s, d) => s + d.count, 0)} acciones en 26 semanas</span>
          </div>
          <div style={{ padding: '14px 22px 16px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              {heatmapWeeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {week.map((day) => (
                    <div
                      key={day.iso}
                      title={`${day.iso}: ${day.count} acción${day.count !== 1 ? 'es' : ''}`}
                      style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: heatColor(day.count),
                        cursor: 'default',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Menos</span>
              {['#f1f5f9', '#bfdbfe', '#60a5fa', '#1d4ed8'].map(c => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              ))}
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Más</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent tickets ── */}
      {canSeeOps && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Últimos tickets</p>
            {isOwnProfile && (
              <button
                style={{ fontSize: 11, color: '#0e2235', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0 }}
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
                  onClick={() => router.push(`/helpdesk/ticket/${t.id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : undefined, gap: 12, cursor: 'pointer' }}
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
                    <span className={styles.badge} style={{ fontSize: 10, background: t.is_final ? '#22C55E22' : 'var(--status-info-bg)', color: t.is_final ? '#22C55E' : 'var(--status-info-text)', border: `1px solid ${t.is_final ? '#22C55E44' : 'var(--status-info-border)'}` }}>
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

          {!operationalFeed.length && (
            <div style={{ padding: '24px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Sin actividad reciente.
            </div>
          )}

          {operationalFeed.length > 0 && (
            <div>
              {/* Static events from user object */}
              {([
                user.profile_complete ? { type: 'request_approved', title: 'Perfil completado', context: 'Cuenta', ts: user.updated_at } : null,
                { type: 'account_created', title: 'Cuenta creada', context: '', ts: user.created_at },
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
              {operationalFeed.map((event, i) => {
                const cfg  = feedConfig(event.type);
                const Icon = cfg.icon;
                return (
                  <div
                    key={`feed-${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderBottom: i < operationalFeed.length - 1 ? '1px solid #F1F5F9' : undefined }}
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

    </>
  );
}
