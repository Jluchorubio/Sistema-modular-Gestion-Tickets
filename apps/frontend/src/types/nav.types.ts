import type { LucideIcon } from 'lucide-react';

export interface ModuleNavItem {
  key:           string;
  label:         string;
  Icon:          LucideIcon;
  href:          string;
  permKey?:      string;
  allowedRoles?: string[];
}

export interface ModuleNavConfig {
  name:  string;
  items: ModuleNavItem[];
}
