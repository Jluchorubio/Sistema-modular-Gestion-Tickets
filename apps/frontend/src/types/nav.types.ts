import type { LucideIcon } from 'lucide-react';

export interface ModuleNavItem {
  key:            string;
  label:          string;
  Icon:           LucideIcon;
  href:           string;
  superadminOnly?: boolean;
  permKey?:        string;
}

export interface ModuleNavConfig {
  name:  string;
  items: ModuleNavItem[];
}
