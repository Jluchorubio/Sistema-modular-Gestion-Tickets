import { LayoutList, BarChart2, Users, Tag, Trash2 } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const HELPDESK_MODULE_NAME = 'Mesa de Ayuda';

export const HELPDESK_SLUGS = ['helpdesk', 'tickets', 'soporte', 'support'];
export const HELPDESK_TYPES = ['helpdesk', 'soporte'];

export function isHelpdeskModule(m: { slug: string; type?: string | null }): boolean {
  return HELPDESK_SLUGS.includes(m.slug) || HELPDESK_TYPES.includes(m.type ?? '');
}

export const HELPDESK_NAV: ModuleNavItem[] = [
  { key: 'all-tickets', label: 'Todos los Tickets', Icon: LayoutList, href: '/helpdesk'        },
  { key: 'users',       label: 'Usuarios',          Icon: Users,      href: '/helpdesk/users'  },
  { key: 'roles',       label: 'Roles',             Icon: Tag,        href: '/helpdesk/roles'  },
  { key: 'trash',       label: 'Papelera',          Icon: Trash2,     href: '/helpdesk/trash'  },
  { key: 'reports',     label: 'Reportes',          Icon: BarChart2,  href: '/reports'         },
];
