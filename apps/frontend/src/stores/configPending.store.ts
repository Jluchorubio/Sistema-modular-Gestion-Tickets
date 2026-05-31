import { create } from 'zustand';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

export interface PendingChangeItem {
  id:      string;
  label:   string;
  execute: (auth: CriticalAuthData) => Promise<void>;
}

interface ConfigPendingState {
  items:    PendingChangeItem[];
  applying: boolean;
  results:  Array<{ label: string; ok: boolean; error?: string }>;

  stage:    (item: PendingChangeItem) => void;
  unstage:  (id: string) => void;
  clearAll: () => void;
  clearResults: () => void;
  applyAll: (auth: CriticalAuthData) => Promise<void>;
  hasStaged: (id: string) => boolean;
}

export const useConfigPending = create<ConfigPendingState>((set, get) => ({
  items:    [],
  applying: false,
  results:  [],

  stage: (item) =>
    set((s) => ({
      items: s.items.some((i) => i.id === item.id)
        ? s.items.map((i) => (i.id === item.id ? item : i))
        : [...s.items, item],
    })),

  unstage: (id) =>
    set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  clearAll: () => set({ items: [], results: [] }),

  clearResults: () => set({ results: [] }),

  hasStaged: (id) => get().items.some((i) => i.id === id),

  applyAll: async (auth) => {
    const { items } = get();
    set({ applying: true, results: [] });
    const results: Array<{ label: string; ok: boolean; error?: string }> = [];

    for (const item of items) {
      try {
        await item.execute(auth);
        results.push({ label: item.label, ok: true });
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.message ?? 'Error desconocido';
        results.push({ label: item.label, ok: false, error: Array.isArray(msg) ? msg.join(', ') : String(msg) });
      }
    }

    // Remove only successfully applied items
    const failedIds = new Set(
      items.filter((_, i) => !results[i].ok).map((item) => item.id),
    );
    set({
      applying: false,
      results,
      items: items.filter((i) => failedIds.has(i.id)),
    });
  },
}));
