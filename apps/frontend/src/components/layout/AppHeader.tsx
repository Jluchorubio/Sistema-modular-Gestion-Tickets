'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, User, LogOut, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { authService } from '@/services/auth.service';
import { tokens } from '@/lib/tokens';
import { getInitials } from '@/lib/utils';
import styles from './header.module.css';

export function AppHeader() {
  const router  = useRouter();
  const user    = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : '';
  const initials = user ? getInitials(user.first_name, user.last_name) : '?';

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>T</div>
          <span className={styles.brandName}>Tickets System</span>
        </div>

        <div className={styles.right}>
          <button className={styles.notifBtn} title="Notificaciones" type="button">
            <Bell size={16} />
          </button>

          <div className={styles.profileWrap} ref={wrapRef}>
            <button
              type="button"
              className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ''}`}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
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
                className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`}
              />
            </button>

            <div className={`${styles.dropdown}${open ? ` ${styles.dropdownOpen}` : ''}`}>
              <div className={styles.ddInfo}>
                <div className={styles.ddName}>{fullName || '—'}</div>
                <div className={styles.ddUser}>{user?.username ? `@${user.username}` : user?.email ?? '—'}</div>
              </div>
              <div className={styles.ddSep} />
              <Link href="/profile" className={styles.ddItem} onClick={() => setOpen(false)}>
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
