import type { RequestType } from '@/services/requests.service';

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  role_change:           'Cambio de rol',
  module_access:         'Acceso a módulo',
  info_correction:       'Corrección de info',
  sede_change:           'Cambio de sede',
  permission_adjustment: 'Ajuste de permisos',
  account_issue:         'Problema de cuenta',
  reactivation:          'Reactivación',
  other:                 'Otro',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending:      'Pendiente',
  under_review: 'En revisión',
  approved:     'Aprobada',
  rejected:     'Rechazada',
};

export const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending:      '#F59E0B',
  under_review: '#3B82F6',
  approved:     '#22C55E',
  rejected:     '#EF4444',
};

export const REQUEST_TYPES: RequestType[] = [
  'role_change', 'module_access', 'info_correction', 'sede_change',
  'permission_adjustment', 'account_issue', 'reactivation', 'other',
];
