import { create } from 'zustand';

export interface SystemBranding {
  name:          string;
  slug:          string;
  logo_url:      string | null;
  primary_color: string | null;
  timezone:      string;
  language:      string;
}

const DEFAULT_PRIMARY = '#0e2235';

interface SystemConfigState {
  branding:  SystemBranding | null;
  hydrated:  boolean;

  setBranding:  (b: SystemBranding) => void;
  patchBranding:(partial: Partial<SystemBranding>) => void;
}

function applyCSSVars(branding: SystemBranding | null): void {
  if (typeof document === 'undefined') return;

  const hex = (branding?.primary_color ?? DEFAULT_PRIMARY).replace('#', '');
  const r   = parseInt(hex.slice(0, 2), 16);
  const g   = parseInt(hex.slice(2, 4), 16);
  const b   = parseInt(hex.slice(4, 6), 16);
  const rgb = isNaN(r + g + b) ? '14,34,53' : `${r},${g},${b}`;
  const raw = isNaN(r + g + b) ? DEFAULT_PRIMARY : `#${hex}`;

  const root = document.documentElement;
  root.style.setProperty('--brand-primary',      raw);
  root.style.setProperty('--brand-primary-rgb',  rgb);
  root.style.setProperty('--brand-primary-10',   `rgba(${rgb},0.10)`);
  root.style.setProperty('--brand-primary-20',   `rgba(${rgb},0.20)`);
  root.style.setProperty('--brand-primary-hover',`rgba(${rgb},0.85)`);

  if (branding?.name) {
    document.title = branding.name;
  }
}

export const useSystemConfigStore = create<SystemConfigState>((set) => ({
  branding: null,
  hydrated: false,

  setBranding: (branding) => {
    applyCSSVars(branding);
    set({ branding, hydrated: true });
  },

  patchBranding: (partial) =>
    set((s) => {
      const next = s.branding ? { ...s.branding, ...partial } : null;
      applyCSSVars(next);
      return { branding: next };
    }),
}));
