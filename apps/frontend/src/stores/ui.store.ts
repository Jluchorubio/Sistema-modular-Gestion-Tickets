import { create } from 'zustand';
import type { ModuleNavItem } from '@/types/nav.types';

interface UIState {
  sidebarExpanded: boolean;
  moduleNav:       ModuleNavItem[] | null;
  moduleName:      string | null;

  toggleSidebar:    () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setModuleNav:     (name: string, items: ModuleNavItem[]) => void;
  clearModuleNav:   () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarExpanded: false,
  moduleNav:       null,
  moduleName:      null,

  toggleSidebar:      () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setModuleNav:       (name, items) => set({ moduleName: name, moduleNav: items }),
  clearModuleNav:     () => set({ moduleName: null, moduleNav: null }),
}));
