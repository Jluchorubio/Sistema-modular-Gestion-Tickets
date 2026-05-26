import { Home, Users, Tag, BarChart2, Settings2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export function buildDynamicModuleNav(slug: string): ModuleNavItem[] {
  const base = `/${slug}`;
  return [
    { key: 'inicio',  label: 'Inicio',        Icon: Home,      href: base                },
    { key: 'users',   label: 'Usuarios',      Icon: Users,     href: `${base}/users`     },
    { key: 'roles',   label: 'Roles',         Icon: Tag,       href: `${base}/roles`     },
    { key: 'reports', label: 'Reportes',      Icon: BarChart2, href: `${base}/reports`   },
    { key: 'config',  label: 'Configuración', Icon: Settings2, href: `${base}/config`    },
  ];
}
