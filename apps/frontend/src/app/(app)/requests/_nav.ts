import { ClipboardList, Users, Tag, Trash2, BarChart2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const GESTION_MODULE_NAME = 'Gestión Administrativa';

export const GESTION_NAV: ModuleNavItem[] = [
  { key: 'requests', label: 'Solicitudes', Icon: ClipboardList, href: '/requests'       },
  { key: 'users',    label: 'Usuarios',    Icon: Users,         href: '/requests/users'  },
  { key: 'roles',    label: 'Roles',       Icon: Tag,           href: '/requests/roles'  },
  { key: 'trash',    label: 'Papelera',    Icon: Trash2,        href: '/requests/trash'  },
  { key: 'reports',  label: 'Reportes',    Icon: BarChart2,     href: '/requests/reports'},
];
