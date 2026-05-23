import { LayoutDashboard, Users, Tag, Trash2, BarChart2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export function buildDynamicModuleNav(slug: string): ModuleNavItem[] {
  const base = `/${slug}`;
  return [
    { key: 'overview', label: 'Resumen',  Icon: LayoutDashboard, href: base              },
    { key: 'users',    label: 'Usuarios', Icon: Users,           href: `${base}/users`   },
    { key: 'roles',    label: 'Roles',    Icon: Tag,             href: `${base}/roles`   },
    { key: 'trash',    label: 'Papelera', Icon: Trash2,          href: `${base}/trash`   },
    { key: 'reports',  label: 'Reportes', Icon: BarChart2,       href: `${base}/reports` },
  ];
}
