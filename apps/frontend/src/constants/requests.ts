import type { RequestType, RequestPriority } from '@/services/requests.service';

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  role_change:           'Cambio de rol',
  module_access:         'Acceso a módulo',
  permission_adjustment: 'Ajuste de permisos',
  account_issue:         'Problema de cuenta',
  reactivation:          'Reactivación',
  access_revocation:     'Revocación de acceso',
  user_transfer:         'Traslado de usuario',
  technical_issue:       'Problema técnico',
  data_correction:       'Corrección de datos',
  other:                 'Otro',
  task:                  'Tarea',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending:      'Pendiente',
  taken:        'Tomado',
  in_progress:  'En proceso',
  completed:    'Finalizado',
  under_review: 'En revisión',
  approved:     'Aprobada',
  rejected:     'Rechazada',
  cancelled:    'Cancelada',
};

export const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending:      '#F59E0B',
  taken:        '#8B5CF6',
  in_progress:  '#3B82F6',
  completed:    '#22C55E',
  under_review: '#0EA5E9',
  approved:     '#22C55E',
  rejected:     '#EF4444',
  cancelled:    '#94A3B8',
};

export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  critica: 'Crítica',
};

export const REQUEST_PRIORITY_COLORS: Record<RequestPriority, string> = {
  baja:    '#94A3B8',
  media:   '#3B82F6',
  alta:    '#F59E0B',
  critica: '#EF4444',
};

export const REQUEST_PRIORITIES: RequestPriority[] = ['baja', 'media', 'alta', 'critica'];

export const REQUEST_TYPES: RequestType[] = [
  'role_change',
  'module_access',
  'permission_adjustment',
  'account_issue',
  'reactivation',
  'access_revocation',
  'user_transfer',
  'technical_issue',
  'data_correction',
  'other',
];

export const TASK_TYPES: RequestType[] = ['task'];
