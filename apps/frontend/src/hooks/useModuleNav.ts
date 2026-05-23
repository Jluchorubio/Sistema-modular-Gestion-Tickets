'use client';
import { useEffect } from 'react';
import { useUIStore } from '@/stores/ui.store';
import type { ModuleNavItem } from '@/types/nav.types';

export function useModuleNav(name: string, items: ModuleNavItem[], moduleId?: string) {
  const setModuleNav   = useUIStore((s) => s.setModuleNav);
  const clearModuleNav = useUIStore((s) => s.clearModuleNav);

  useEffect(() => {
    setModuleNav(name, items, moduleId);
    return () => clearModuleNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);
}
