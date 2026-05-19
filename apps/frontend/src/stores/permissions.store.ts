import { create } from 'zustand';

interface PermissionsState {
  permissions: Set<string>;
  loaded:      boolean;
  setPermissions: (perms: string[]) => void;
  hasPermission:  (key: string) => boolean;
  reset:          () => void;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  permissions: new Set(),
  loaded:      false,

  setPermissions: (perms) =>
    set({ permissions: new Set(perms), loaded: true }),

  hasPermission: (key) => {
    const { permissions } = get();
    return permissions.has('*') || permissions.has(key);
  },

  reset: () => set({ permissions: new Set(), loaded: false }),
}));
