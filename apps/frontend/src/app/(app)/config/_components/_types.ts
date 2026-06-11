import { Building2, Network, CalendarClock, History, SlidersHorizontal, Shield, type LucideIcon } from 'lucide-react';

export type Tab = 'empresa' | 'organigrama' | 'prioridad' | 'calendario' | 'auditoria' | 'seguridad';

export const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'empresa',     label: 'Empresa',         Icon: Building2         },
  { key: 'organigrama', label: 'Organigrama',     Icon: Network           },
  { key: 'prioridad',   label: 'Motor Prioridad', Icon: SlidersHorizontal },
  { key: 'calendario',  label: 'Calendario SLA',  Icon: CalendarClock     },
  { key: 'auditoria',   label: 'Auditoría',       Icon: History           },
  { key: 'seguridad',   label: 'Seguridad',       Icon: Shield            },
];

export const GUARDED_TABS: Tab[] = ['prioridad', 'calendario', 'auditoria'];
