'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Bell, User, LogOut, ChevronDown,
  CalendarDays, Clock, ClipboardList, LayoutGrid,
  ChevronRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { authService } from '@/services/auth.service';
import { notificationsService, type AppNotification } from '@/services/notifications.service';
import { requestsService, type AdmRequest } from '@/services/requests.service';
import { tokens } from '@/lib/tokens';
import { getInitials } from '@/lib/utils';
import styles from './header.module.css';

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function getNotifMessage(n: AppNotification): string {
  const p = n.payload;
  if (typeof p.message === 'string') return p.message;
  if (typeof p.body === 'string')    return p.body;
  if (typeof p.subject === 'string') return p.subject;
  return n.event_type.replace(/_/g, ' ');
}

const STATUS_COLORS: Record<string, string> = {
  pending:     '#F59E0B',
  taken:       '#8B5CF6',
  in_progress: '#3B82F6',
  completed:   '#22C55E',
  approved:    '#16A34A',
  rejected:    '#EF4444',
  cancelled:   '#94A3B8',
};

const STATUS_LABELS: Record<string, string> = {
  pending:     'Pendiente',
  taken:       'Tomado',
  in_progress: 'En proceso',
  completed:   'Finalizado',
  approved:    'Aprobado',
  rejected:    'Rechazado',
  cancelled:   'Cancelado',
};

interface Props {
  noSidebar?: boolean;
}

export function AppHeader({ noSidebar = false }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const qc          = useQueryClient();
  const user        = useAuthStore((s) => s.user);
  const clearAuth   = useAuthStore((s) => s.clearAuth);

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen,   setNotifOpen]   = useState(false);
  const [calOpen,     setCalOpen]     = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);
  const calRef     = useRef<HTMLDivElement>(null);

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : '';
  const initials = user ? getInitials(user.first_name, user.last_name) : '?';

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

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard',   Icon: LayoutGrid },
    { href: '/requests',  label: 'Solicitudes', Icon: ClipboardList },
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
            {navLinks.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className={`${styles.centerNavLink}${pathname.startsWith(href) ? ` ${styles.centerNavLinkActive}` : ''}`}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </nav>
        )}

        <div className={styles.right}>
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
              {/* Header */}
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

              {/* Items */}
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

              {/* Footer */}
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
              <div className={styles.ddInfo}>
                <div className={styles.ddName}>{fullName || '—'}</div>
                <div className={styles.ddUser}>{user?.username ? `@${user.username}` : user?.email ?? '—'}</div>
              </div>
              <div className={styles.ddSep} />
              <Link href="/profile" className={styles.ddItem} onClick={() => setProfileOpen(false)}>
                <User size={14} />
                Mi perfil
              </Link>
              <div className={styles.ddSep} />
              <button
                type="button"
                className={`${styles.ddItem} ${styles.ddDanger}`}
                onClick={handleLogout}
              >
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
