import { Home, Users, Tag, BarChart2, Settings2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const INVENTORY_MODULE_NAME = 'Inventario';

export const INVENTORY_SLUGS = ['inventario', 'inventory'];
export const INVENTORY_TYPES = ['inventario', 'inventory'];

export function isInventoryModule(m: { slug: string; type?: string | null }): boolean {
  return INVENTORY_SLUGS.includes(m.slug) || INVENTORY_TYPES.includes(m.type ?? '');
}

export const INVENTORY_NAV: ModuleNavItem[] = [
  { key: 'inicio',  label: 'Inicio',       Icon: Home,      href: '/inventory'         },
  { key: 'users',   label: 'Usuarios',     Icon: Users,     href: '/inventory/users'   },
  { key: 'roles',   label: 'Roles',        Icon: Tag,       href: '/inventory/roles'   },
  { key: 'reports', label: 'Reportes',     Icon: BarChart2, href: '/inventory/reports' },
  { key: 'config',  label: 'Configuración',Icon: Settings2, href: '/inventory/config'  },
];
