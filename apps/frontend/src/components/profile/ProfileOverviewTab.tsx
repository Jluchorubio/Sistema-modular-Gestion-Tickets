'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  fmtDate, fmtRelative, getActiveModules,
  CONTRIB_COLORS,
  type ProfileUser,
} from './profile.types';
import { requestsService } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { REQUEST_STATUS_LABELS } from '@/constants/requests';
import styles from './profile.module.css';

const STATUS_CLS: Record<string, string> = {
  pending:      styles.badgeYellow,
  under_review: styles.badgeBlue,
  approved:     styles.badgeGreen,
  rejected:     styles.badgeRed,
  cancelled:    styles.badgeGray,
};

/* ── Activity graph helpers ──────────────────────────────────────────────── */

function getGraphStartDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // align to Monday of 26 weeks ago
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
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

interface Props {
  user:          ProfileUser;
  isOwnProfile:  boolean;
  fullName:      string;
}

export function ProfileOverviewTab({ user, isOwnProfile, fullName }: Props) {
  const router        = useRouter();
  const activeModules = getActiveModules(user);

  const { data: requestsData } = useQuery({
    queryKey: ['my-requests-all'],
    queryFn:  () => requestsService.getMine(200),
    enabled:  isOwnProfile,
    staleTime: 60_000,
  });
  const allRequests    = requestsData?.data ?? [];
  const recentRequests = allRequests.slice(0, 6);

  const reqStats = useMemo(() => ({
    total:        allRequests.length,
    pending:      allRequests.filter(r => r.status === 'pending').length,
    under_review: allRequests.filter(r => r.status === 'under_review').length,
    approved:     allRequests.filter(r => r.status === 'approved').length,
    rejected:     allRequests.filter(r => r.status === 'rejected').length,
    cancelled:    allRequests.filter(r => r.status === 'cancelled').length,
  }), [allRequests]);

  const { data: recentTickets } = useQuery({
    queryKey: ['my-recent-tickets'],
    queryFn:  () => usersService.getMyRecentTickets(6),
    enabled:  isOwnProfile,
    staleTime: 60_000,
  });

  const { data: activityData } = useQuery({
    queryKey: ['my-activity'],
    queryFn:  () => usersService.getMyActivity(),
    enabled:  isOwnProfile,
    staleTime: 5 * 60_000,
  });

  const activityMap = useMemo(() => {
    const map: Record<string, number> = {};
    (activityData ?? []).forEach(({ day, count }) => { map[day] = count; });
    return map;
  }, [activityData]);

  const graphStart   = useMemo(() => getGraphStartDate(), []);
  const totalActivity = useMemo(
    () => Object.values(activityMap).reduce((s, v) => s + v, 0),
    [activityMap],
  );

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

      {/* ── Profile info card ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Información del perfil</p>
          <span className={styles.sectionMeta}>VERIFICADO</span>
        </div>
        <div className={styles.infoGrid}>
          {([
            ['Nombre completo',    fullName],
            ['Nombre de usuario',  user.username ? `@${user.username}` : '—'],
            ['Correo electrónico', user.email        || '—'],
            ['Teléfono celular',   user.phone        || '—'],
            ['Área / Departamento',user.department   || '—'],
            ['Cargo actual',       user.job_title    || '—'],
            ['Sede principal',     user.primary_sede || '—'],
            ['Dirección',          user.address      || '—'],
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

      {/* ── Request stats ── */}
      {isOwnProfile && (
        <div className={styles.ticketStatGrid} style={{ marginBottom: 22 }}>
          {([
            ['Total',       reqStats.total,        '#0D1B2A'],
            ['Pendientes',  reqStats.pending,       '#F59E0B'],
            ['En revisión', reqStats.under_review,  '#6366F1'],
            ['Aprobadas',   reqStats.approved,      '#22C55E'],
            ['Rechazadas',  reqStats.rejected,      '#EF4444'],
            ['Canceladas',  reqStats.cancelled,     '#94A3B8'],
          ] as [string, number, string][]).map(([label, value, color]) => (
            <div key={label} className={styles.ticketStatItem}>
              <div className={styles.ticketStatLabel}>{label}</div>
              <div className={styles.ticketStatValue} style={{ color }}>{value}</div>
              <div className={styles.ticketStatNote}>solicitudes</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent activity (login + account events) ── */}
      <div style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', marginBottom: 14 }}>Actividad reciente</p>
        <div className={styles.card} style={{ overflow: 'hidden' }}>
          {([
            user.last_login_at    ? { color: '#22C55E', label: 'Inicio de sesión',  time: fmtRelative(user.last_login_at) } : null,
            user.profile_complete ? { color: '#2563EB', label: 'Perfil completado', time: fmtDate(user.updated_at) } : null,
            { color: '#8B5CF6', label: 'Cuenta creada', time: fmtDate(user.created_at) },
          ] as ({ color: string; label: string; time: string } | null)[])
            .filter((e): e is { color: string; label: string; time: string } => e !== null)
            .map((e, i, arr) => (
              <div
                key={e.label}
                className={styles.activityRow}
                style={i < arr.length - 1 ? { borderBottom: '1px solid #E8EDF3' } : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className={styles.activityDot} style={{ background: e.color }} />
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: '#0D1B2A' }}>{e.label}</span>
                </div>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{e.time}</span>
              </div>
            ))}
        </div>
      </div>

      {/* ── Recent tickets ── */}
      {isOwnProfile && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Últimos tickets</p>
            <button
              style={{
                fontSize: 11, color: '#6366F1', background: 'none', border: 'none',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0,
              }}
              onClick={() => router.push('/my-tickets')}
            >
              Ver más →
            </button>
          </div>

          {!recentTickets || recentTickets.length === 0 ? (
            <div style={{ padding: '24px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Sin tickets aún.
            </div>
          ) : (
            <div>
              {recentTickets.map((t, i, arr) => {
                const pColor: Record<string, string> = {
                  baja: '#94A3B8', media: '#3B82F6', alta: '#F59E0B', critica: '#EF4444',
                };
                const color = pColor[t.priority] ?? '#94A3B8';
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 22px',
                      borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : undefined,
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                      </p>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                        {t.module_name} · {fmtRelative(t.created_at)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                      <span
                        className={styles.badge}
                        style={{ fontSize: 10, background: `${color}22`, color, border: `1px solid ${color}44` }}
                      >
                        {t.priority}
                      </span>
                      <span
                        className={styles.badge}
                        style={{ fontSize: 10, background: t.is_final ? '#22C55E22' : '#6366F122',
                          color: t.is_final ? '#22C55E' : '#6366F1',
                          border: `1px solid ${t.is_final ? '#22C55E44' : '#6366F144'}` }}
                      >
                        {t.state_label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Recent requests ── */}
      {isOwnProfile && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Últimas solicitudes</p>
            <button
              style={{
                fontSize: 11, color: '#6366F1', background: 'none', border: 'none',
                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0,
              }}
              onClick={() => router.push('/requests')}
            >
              Ver todas →
            </button>
          </div>

          {recentRequests.length === 0 ? (
            <div style={{ padding: '24px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Sin solicitudes aún.{' '}
              <button
                style={{ color: '#6366F1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
                onClick={() => router.push('/requests')}
              >
                Crear solicitud →
              </button>
            </div>
          ) : (
            <div>
              {recentRequests.map((req, i, arr) => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 22px',
                    borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : undefined,
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A', margin: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {req.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                      {fmtRelative(req.created_at)}
                    </p>
                  </div>
                  <span className={`${styles.badge} ${STATUS_CLS[req.status] ?? styles.badgeGray}`}
                    style={{ fontSize: 10, flexShrink: 0 }}>
                    {REQUEST_STATUS_LABELS[req.status] ?? req.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Activity graph ── */}
      {isOwnProfile && (
        <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionTitle}>Actividad operativa</p>
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
