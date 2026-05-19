import { ClipboardList, Users, Tag, Trash2, BarChart2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const GESTION_MODULE_NAME = 'Gestión Administrativa';

export const GESTION_SLUGS = ['gestion', 'gestion-adm', 'gestion-administrativa'];
export const GESTION_TYPES = ['administrative', 'gestion'];

export function isGestionModule(m: { slug: string; type?: string | null }): boolean {
  return GESTION_SLUGS.includes(m.slug) || GESTION_TYPES.includes(m.type ?? '');
}

export const GESTION_NAV: ModuleNavItem[] = [
  { key: 'requests', label: 'Solicitudes', Icon: ClipboardList, href: '/requests',         permKey: 'gestion:requests:view_own'  },
  { key: 'users',    label: 'Usuarios',    Icon: Users,         href: '/requests/users',   permKey: 'gestion:users:view'         },
  { key: 'roles',    label: 'Roles',       Icon: Tag,           href: '/requests/roles',   permKey: 'gestion:roles:view'    },
  { key: 'trash',    label: 'Papelera',    Icon: Trash2,        href: '/requests/trash',   permKey: 'gestion:trash:view'    },
  { key: 'reports',  label: 'Reportes',    Icon: BarChart2,     href: '/requests/reports', permKey: 'gestion:reports:view'  },
];
