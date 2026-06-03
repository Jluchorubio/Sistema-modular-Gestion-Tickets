import { Home, BarChart2, Users, Tag, Settings2, Clock, Headset } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const HELPDESK_MODULE_NAME = 'Mesa de Ayuda';

export const HELPDESK_SLUGS = ['helpdesk', 'tickets', 'soporte', 'support'];
export const HELPDESK_TYPES = ['helpdesk', 'soporte'];

export function isHelpdeskModule(m: { slug: string; type?: string | null }): boolean {
  return HELPDESK_SLUGS.includes(m.slug) || HELPDESK_TYPES.includes(m.type ?? '');
}

export const HELPDESK_NAV: ModuleNavItem[] = [
  { key: 'inicio',       label: 'Inicio',         Icon: Home,      href: '/helpdesk'              },
  { key: 'technicians',  label: 'Técnicos',        Icon: Headset,   href: '/helpdesk/technicians'  },
  { key: 'sla',          label: 'SLA',             Icon: Clock,     href: '/helpdesk/sla'          },
  { key: 'users',        label: 'Usuarios',        Icon: Users,     href: '/helpdesk/users'        },
  { key: 'roles',        label: 'Roles',           Icon: Tag,       href: '/helpdesk/roles'        },
  { key: 'reports',      label: 'Reportes',        Icon: BarChart2, href: '/helpdesk/reports'      },
  { key: 'config',       label: 'Configuración',   Icon: Settings2, href: '/helpdesk/config'       },
];
