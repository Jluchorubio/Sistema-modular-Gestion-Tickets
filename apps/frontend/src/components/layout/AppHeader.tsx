'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell, User, LogOut, ChevronDown,
  CalendarDays, Clock, ChevronRight,
  Ticket, Sun, Moon, Monitor, Download,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import type { AppTheme } from '@/stores/ui.store';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { authService } from '@/services/auth.service';
import { notificationsService, type AppNotification } from '@/services/notifications.service';
import { requestsService, type AdmRequest } from '@/services/requests.service';
import { tokens } from '@/lib/tokens';
import { getInitials } from '@/lib/utils';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import { REQUEST_STATUS_COLORS as STATUS_COLORS, REQUEST_STATUS_LABELS as STATUS_LABELS } from '@/constants/requests';
import styles from './header.module.css';

function getNotifMessage(n: AppNotification): string {
  const p = n.payload;
  if (typeof p.message === 'string') return p.message;
  if (typeof p.body === 'string')    return p.body;
  if (typeof p.subject === 'string') return p.subject;
  return n.event_type.replace(/_/g, ' ');
}

interface Props {
  noSidebar?: boolean;
}

export function AppHeader({ noSidebar = false }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const qc          = useQueryClient();
  const user        = useAuthStore((s) => s.user);
  const clearAuth   = useAuthStore((s) => s.clearAuth);
  const theme       = useUIStore((s) => s.theme);
  const setTheme    = useUIStore((s) => s.setTheme);

  const THEME_ICON: Record<AppTheme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
  const ThemeIcon = THEME_ICON[theme];

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [calOpen,     setCalOpen]     = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);
  const calRef     = useRef<HTMLDivElement>(null);

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : '';
  const initials = user ? getInitials(user.first_name, user.last_name) : '?';
  const roleName = user?.is_superadmin ? 'Superadmin' : 'Usuario';

  const today = new Date();
  const todayLabel = today.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const todayDay = today.getDate();

  /* ── Notifications ───────────────────────────────────────────────────────── */
  const { data: notifData } = useQuery({
    queryKey: ['notifications-me'],
    queryFn:  () => notificationsService.getMyNotifications(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => notificationsService.markAllAsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
  });

  /* ── Mini calendar ───────────────────────────────────────────────────────── */
  const { data: miniCalData } = useQuery({
    queryKey: ['mini-calendar'],
    queryFn:  () => requestsService.getMine(10),
    enabled:  calOpen,
    staleTime: 60_000,
  });

  const upcomingItems: AdmRequest[] = (miniCalData?.data ?? [])
    .filter((r) => ['pending', 'taken', 'in_progress'].includes(r.status))
    .slice(0, 5);

  /* ── Click outside ───────────────────────────────────────────────────────── */
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target as Node))   setNotifOpen(false);
      if (calRef.current     && !calRef.current.contains(e.target as Node))     setCalOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleLogout = useCallback(async () => {
    const rt = tokens.getRefresh();
    try { if (rt) await authService.logout(rt); } catch {}
    clearAuth();
    router.push('/login');
  }, [clearAuth, router]);

  const unread = notifData?.unread_count ?? 0;
  const notifications = notifData?.notifications ?? [];

  const { canInstall, install } = usePWAInstall();

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/requests',  label: 'Solicitudes' },
  ];

  return (
    <header className={`${styles.header}${noSidebar ? ` ${styles.headerFull}` : ''}`}>
      <div className={styles.inner}>
        {/* ── Brand ── */}
        <div className={styles.brand}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <div className={styles.brandIcon}>T</div>
            <span className={styles.brandName}>Tickets System</span>
          </Link>
        </div>

        {/* ── Centro nav (solo no-sidebar) ── */}
        {noSidebar && (
          <nav className={styles.centerNav}>
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.centerNavLink}${pathname.startsWith(href) ? ` ${styles.centerNavLinkActive}` : ''}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}

        <div className={styles.right}>
          {/* ── PWA install button ── */}
          {canInstall && (
            <button
              type="button"
              className={styles.installBtn}
              onClick={install}
              title="Instalar aplicación"
            >
              <Download size={14} />
              <span className={styles.installBtnLabel}>Instalar</span>
            </button>
          )}

          {/* ── Calendar mini-popover ── */}
          <div className={styles.calWrap} ref={calRef}>
            <button
              type="button"
              className={`${styles.calBtn}${calOpen ? ` ${styles.calBtnOpen}` : ''}`}
              title="Calendario"
              onClick={() => setCalOpen((v) => !v)}
            >
              <span className={styles.calBtnDay}>{todayDay}</span>
              <CalendarDays size={14} />
            </button>

            <div className={`${styles.calDropdown}${calOpen ? ` ${styles.calDropdownOpen}` : ''}`}>
              <div className={styles.calHeader}>
                <div className={styles.calTodayLabel}>{todayLabel}</div>
                <Link
                  href="/calendar"
                  className={styles.calViewAll}
                  onClick={() => setCalOpen(false)}
                >
                  Ver todo <ChevronRight size={11} />
                </Link>
              </div>

              <div className={styles.calList}>
                {upcomingItems.length === 0 && !miniCalData && (
                  <p className={styles.calEmpty}>Cargando…</p>
                )}
                {upcomingItems.length === 0 && miniCalData && (
                  <p className={styles.calEmpty}>Sin pendientes activos</p>
                )}
                {upcomingItems.map((r) => (
                  <div key={r.id} className={styles.calItem}>
                    <span
                      className={styles.calDot}
                      style={{ background: STATUS_COLORS[r.status] ?? '#94A3B8' }}
                    />
                    <div className={styles.calItemBody}>
                      <p className={styles.calItemTitle}>{r.title}</p>
                      <p className={styles.calItemMeta}>
                        {STATUS_LABELS[r.status] ?? r.status}
                        {r.sla_due_at && (
                          <span className={styles.calSla}>
                            <Clock size={9} />
                            {fmtRelative(r.sla_due_at)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.calFooter}>
                <Link
                  href="/calendar"
                  className={styles.calFooterBtn}
                  onClick={() => setCalOpen(false)}
                >
                  <CalendarDays size={13} />
                  Abrir calendario
                </Link>
              </div>
            </div>
          </div>

          {/* ── Notification bell ── */}
          <div className={styles.notifWrap} ref={notifRef}>
            <button
              className={styles.notifBtn}
              title="Notificaciones"
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
            >
              <Bell size={16} />
              {unread > 0 && (
                <span className={styles.notifBadge}>{unread > 99 ? '99+' : unread}</span>
              )}
            </button>

            <div className={`${styles.notifDropdown}${notifOpen ? ` ${styles.notifDropdownOpen}` : ''}`}>
              <div className={styles.notifHeader}>
                <span className={styles.notifTitle}>
                  Notificaciones{unread > 0 ? ` (${unread})` : ''}
                </span>
                {unread > 0 && (
                  <button
                    className={styles.notifMarkAll}
                    type="button"
                    onClick={() => markAllMut.mutate()}
                    disabled={markAllMut.isPending}
                  >
                    Marcar todo leído
                  </button>
                )}
              </div>

              <div className={styles.notifList}>
                {notifications.length === 0 && (
                  <p className={styles.notifEmpty}>Sin notificaciones</p>
                )}
                {notifications.map((n) => {
                  const isUnread = n.status === 'pending';
                  return (
                    <div
                      key={n.id}
                      className={`${styles.notifItem}${isUnread ? ` ${styles.notifItemUnread}` : ''}`}
                      onClick={() => isUnread && markReadMut.mutate(n.id)}
                    >
                      <span className={`${styles.notifDot}${!isUnread ? ` ${styles.notifDotRead}` : ''}`} />
                      <div className={styles.notifBody}>
                        <p className={styles.notifEvt}>{n.event_type.replace(/_/g, ' ')}</p>
                        <p className={styles.notifMsg}>{getNotifMessage(n)}</p>
                      </div>
                      <span className={styles.notifTime}>{fmtRelative(n.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Profile dropdown ── */}
          <div className={styles.profileWrap} ref={profileRef}>
            <button
              type="button"
              className={`${styles.trigger}${profileOpen ? ` ${styles.triggerOpen}` : ''}`}
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((v) => !v)}
            >
              <div className={styles.avatar}>
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className={styles.avatarImg}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <span className={styles.uname}>{(user?.username ?? fullName) || 'Cargando…'}</span>
              <ChevronDown
                size={13}
                className={`${styles.chevron}${profileOpen ? ` ${styles.chevronOpen}` : ''}`}
              />
            </button>

            <div className={`${styles.dropdown}${profileOpen ? ` ${styles.dropdownOpen}` : ''}`}>
              {/* ── Profile card ── */}
              <div className={styles.ddCard}>
                <div className={styles.ddCardAvatar}>
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className={styles.ddCardAvatarImg} />
                  ) : (
                    <span className={styles.ddCardAvatarInitials}>{initials}</span>
                  )}
                  <span className={styles.ddOnlineDot} />
                </div>
                <div className={styles.ddCardInfo}>
                  <div className={styles.ddCardName}>{fullName || '—'}</div>
                  <div className={styles.ddCardSub}>{user?.username ? `@${user.username}` : user?.email ?? '—'}</div>
                  <span className={styles.ddRoleBadge}>{roleName}</span>
                </div>
              </div>

              <div className={styles.ddSep} />

              {/* ── Navigation ── */}
              <div className={styles.ddSection}>
                <Link
                  href="/profile"
                  className={styles.ddItem}
                  onClick={() => setProfileOpen(false)}
                >
                  <span className={styles.ddItemIcon}><User size={14} /></span>
                  Mi perfil
                </Link>
                <Link
                  href="/my-tickets"
                  className={styles.ddItem}
                  onClick={() => setProfileOpen(false)}
                >
                  <span className={styles.ddItemIcon}><Ticket size={14} /></span>
                  Historial de tickets
                </Link>
              </div>

              <div className={styles.ddSep} />

              {/* ── Preferences ── */}
              <div className={styles.ddSection}>
                <div className={styles.ddItem} style={{ cursor: 'default' }}>
                  <span className={styles.ddItemIcon}><ThemeIcon size={14} /></span>
                  Tema
                  <div className={styles.themeSwitch}>
                    {([
                      ['light',  Sun,     'Claro' ],
                      ['dark',   Moon,    'Oscuro'],
                      ['system', Monitor, 'Sistema'],
                    ] as [AppTheme, typeof Sun, string][]).map(([t, Icon, label]) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.themeBtn}${theme === t ? ` ${styles.themeBtnActive}` : ''}`}
                        onClick={() => setTheme(t)}
                        title={label}
                      >
                        <Icon size={12} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`${styles.ddItem} ${styles.ddItemDisabled}`}>
                  <span className={styles.ddItemIcon}><Download size={14} /></span>
                  Descargar aplicación
                  <span className={styles.ddProxBadge}>Próximamente</span>
                </div>
              </div>

              <div className={styles.ddSep} />

              {/* ── Logout ── */}
              <div className={styles.ddSection}>
                <button
                  type="button"
                  className={`${styles.ddItem} ${styles.ddDanger}`}
                  onClick={handleLogout}
                >
                  <span className={styles.ddItemIcon}><LogOut size={14} /></span>
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
