import { create } from 'zustand';
import type { ModuleNavItem } from '@/types/nav.types';

export type AppTheme = 'light' | 'dark' | 'system';

interface UIState {
  sidebarExpanded: boolean;
  moduleNav:       ModuleNavItem[] | null;
  moduleName:      string | null;
  moduleId:        string | null;
  theme:           AppTheme;

  toggleSidebar:      () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setModuleNav:       (name: string, items: ModuleNavItem[], moduleId?: string) => void;
  clearModuleNav:     () => void;
  setTheme:           (t: AppTheme) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarExpanded: false,
  moduleNav:       null,
  moduleName:      null,
  moduleId:        null,
  theme:           'light',

  toggleSidebar:      () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setModuleNav:       (name, items, moduleId) => set({ moduleName: name, moduleNav: items, moduleId: moduleId ?? null }),
  clearModuleNav:     () => set({ moduleName: null, moduleNav: null, moduleId: null }),
  setTheme: (t) => {
    if (typeof window !== 'undefined') localStorage.setItem('app-theme', t);
    set({ theme: t });
  },
}));
