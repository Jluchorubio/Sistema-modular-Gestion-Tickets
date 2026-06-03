import { Home, BarChart2, Users, Tag, Settings2, Clock, Headset, Inbox, LayoutDashboard, BookOpen } from 'lucide-react';
import type { ModuleNavItem } from '@/types/nav.types';

export const HELPDESK_MODULE_NAME = 'Mesa de Ayuda';

export const HELPDESK_SLUGS = ['helpdesk', 'tickets', 'soporte', 'support'];
export const HELPDESK_TYPES = ['helpdesk', 'soporte'];

export function isHelpdeskModule(m: { slug: string; type?: string | null }): boolean {
  return HELPDESK_SLUGS.includes(m.slug) || HELPDESK_TYPES.includes(m.type ?? '');
}

/** Sidebar: management items shown in the left sidebar when inside Helpdesk */
export const HELPDESK_NAV: ModuleNavItem[] = [
  { key: 'inicio',   label: 'Inicio',          Icon: Home,     href: '/helpdesk'                                        },
  { key: 'users',    label: 'Usuarios',         Icon: Users,    href: '/helpdesk/users',    permKey: 'helpdesk:users:view'   },
  { key: 'roles',    label: 'Roles',            Icon: Tag,      href: '/helpdesk/roles',    permKey: 'helpdesk:roles:view'   },
  { key: 'reports',  label: 'Reportes',         Icon: BarChart2,href: '/helpdesk/reports',  permKey: 'helpdesk:reports:view' },
  { key: 'config',   label: 'Configuración',    Icon: Settings2,href: '/helpdesk/config',   permKey: 'helpdesk:config:view'  },
];

/** Operational header: shown in the horizontal sub-header above content, Helpdesk only */
export const HELPDESK_OPERATIONAL_NAV: ModuleNavItem[] = [
  { key: 'workspace',   label: 'Mi bandeja',   Icon: LayoutDashboard, href: '/helpdesk/workspace'  },
  { key: 'queue',       label: 'Cola',          Icon: Inbox,           href: '/helpdesk/queue'      },
  { key: 'technicians', label: 'Técnicos',      Icon: Headset,         href: '/helpdesk/technicians'},
  { key: 'sla',         label: 'SLA',           Icon: Clock,           href: '/helpdesk/sla'        },
  { key: 'knowledge',   label: 'Conocimiento',  Icon: BookOpen,        href: '/helpdesk/knowledge'  },
];
