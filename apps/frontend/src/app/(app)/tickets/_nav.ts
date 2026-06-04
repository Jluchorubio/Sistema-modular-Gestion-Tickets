import { Home, BarChart2, UserCog, ShieldCheck, Settings2, Clock, Headset, Inbox, LayoutDashboard, BookOpen } from 'lucide-react';
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
  { key: 'users',    label: 'Usuarios',         Icon: UserCog,      href: '/helpdesk/users',    permKey: 'helpdesk:users:view'   },
  { key: 'roles',    label: 'Roles',            Icon: ShieldCheck,  href: '/helpdesk/roles',    permKey: 'helpdesk:roles:view'   },
  { key: 'reports',  label: 'Reportes',         Icon: BarChart2,href: '/helpdesk/reports',  permKey: 'helpdesk:reports:view' },
  { key: 'config',   label: 'Configuración',    Icon: Settings2,href: '/helpdesk/config',   permKey: 'helpdesk:config:view'  },
];

/** Operational header: shown in the horizontal sub-header above content, Helpdesk only.
 *  allowedRoles = module roles that can see this item (superadmin always sees all). */
export const HELPDESK_OPERATIONAL_NAV: ModuleNavItem[] = [
  {
    key: 'inicio', label: 'Inicio', Icon: Home, href: '/helpdesk',
    allowedRoles: ['admin_modulo', 'jefe_tecnico', 'tecnico', 'usuario'],
    exact: true,
  },
  {
    key: 'workspace', label: 'Mi bandeja', Icon: LayoutDashboard, href: '/helpdesk/workspace',
    allowedRoles: ['admin_modulo', 'jefe_tecnico', 'tecnico'],
  },
  {
    key: 'queue', label: 'Cola', Icon: Inbox, href: '/helpdesk/queue',
    allowedRoles: ['admin_modulo', 'jefe_tecnico'],
  },
  {
    key: 'technicians', label: 'Técnicos', Icon: Headset, href: '/helpdesk/technicians',
    allowedRoles: ['admin_modulo', 'jefe_tecnico', 'tecnico'],
  },
  {
    key: 'sla', label: 'SLA', Icon: Clock, href: '/helpdesk/sla',
    allowedRoles: ['admin_modulo', 'jefe_tecnico', 'tecnico'],
  },
  {
    key: 'knowledge', label: 'Conocimiento', Icon: BookOpen, href: '/helpdesk/knowledge',
    allowedRoles: ['admin_modulo', 'jefe_tecnico', 'tecnico', 'usuario'],
  },
];
