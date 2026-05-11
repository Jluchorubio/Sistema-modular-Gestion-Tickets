const KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
  FORCE_PW: 'force_pw_change',
} as const;

const COOKIE_OPTS = 'path=/; SameSite=Lax';
const COOKIE_MAX  = `${COOKIE_OPTS}; max-age=604800`;
const COOKIE_EXP  = `${COOKIE_OPTS}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export const tokens = {
  getAccess(): string | null {
    return isBrowser() ? localStorage.getItem(KEYS.ACCESS) : null;
  },

  getRefresh(): string | null {
    return isBrowser() ? localStorage.getItem(KEYS.REFRESH) : null;
  },

  getForcePw(): boolean {
    return isBrowser() ? localStorage.getItem(KEYS.FORCE_PW) === '1' : false;
  },

  set(access: string, refresh: string, forcePw?: boolean, needsProfile?: boolean): void {
    if (!isBrowser()) return;
    localStorage.setItem(KEYS.ACCESS, access);
    localStorage.setItem(KEYS.REFRESH, refresh);
    if (forcePw === true)  localStorage.setItem(KEYS.FORCE_PW, '1');
    else if (forcePw === false) localStorage.removeItem(KEYS.FORCE_PW);
    document.cookie = `has_session=1; ${COOKIE_MAX}`;
    document.cookie = needsProfile
      ? `needs_profile=1; ${COOKIE_MAX}`
      : `needs_profile=; ${COOKIE_EXP}`;
  },

  clearNeedsProfile(): void {
    if (!isBrowser()) return;
    document.cookie = `needs_profile=; ${COOKIE_EXP}`;
  },

  clear(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(KEYS.ACCESS);
    localStorage.removeItem(KEYS.REFRESH);
    localStorage.removeItem(KEYS.FORCE_PW);
    document.cookie = `has_session=; ${COOKIE_EXP}`;
    document.cookie = `needs_profile=; ${COOKIE_EXP}`;
  },
};
