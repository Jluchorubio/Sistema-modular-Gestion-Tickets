import { create } from 'zustand';
import { tokens } from '@/lib/tokens';
import type { CurrentUser } from '@/types/user.types';

interface AuthState {
  user: CurrentUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string, forcePw?: boolean, needsProfile?: boolean, needsSetup?: boolean) => void;
  setUser: (user: CurrentUser) => void;
  clearAuth: () => void;
  initFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  setTokens(access, refresh, forcePw, needsProfile, needsSetup) {
    tokens.set(access, refresh, forcePw, needsProfile, needsSetup);
    set({ accessToken: access, isAuthenticated: true });
  },

  setUser(user) {
    set({ user });
  },

  clearAuth() {
    tokens.clear();
    set({ user: null, accessToken: null, isAuthenticated: false });
  },

  initFromStorage() {
    const access = tokens.getAccess();
    if (access) {
      set({ accessToken: access, isAuthenticated: true });
    }
  },
}));

// Eager sync: runs before any React render so isAuthenticated is correct on first paint (no flash/redirect loop)
if (typeof window !== 'undefined') {
  useAuthStore.getState().initFromStorage();
}
