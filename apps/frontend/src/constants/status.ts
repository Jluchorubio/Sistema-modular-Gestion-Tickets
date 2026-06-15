/**
 * Semantic status system — single source of truth.
 * All values reference CSS variables defined in globals.css (:root).
 * Use StatusBadge component or spread config into inline styles.
 */

export interface StatusConfig {
  text:   string;
  bg:     string;
  border: string;
  glow?:  string;
  label:  string;
}

// ── Request statuses ─────────────────────────────────────────────────────────

export const REQUEST_STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    text:   'var(--status-warning-text)',
    bg:     'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label:  'Pendiente',
  },
  taken: {
    text:   'var(--status-info-text)',
    bg:     'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label:  'Tomado',
  },
  in_progress: {
    text:   'var(--status-info-text)',
    bg:     'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label:  'En proceso',
  },
  completed: {
    text:   'var(--status-success-text)',
    bg:     'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label:  'Finalizado',
  },
  under_review: {
    text:   'var(--status-approval-text)',
    bg:     'var(--status-approval-bg)',
    border: 'var(--status-approval-border)',
    label:  'En revisión',
  },
  approved: {
    text:   'var(--status-success-text)',
    bg:     'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label:  'Aprobada',
  },
  rejected: {
    text:   'var(--status-danger-text)',
    bg:     'var(--status-danger-bg)',
    border: 'var(--status-danger-border)',
    label:  'Rechazada',
  },
  cancelled: {
    text:   'var(--status-closed-text)',
    bg:     'var(--status-closed-bg)',
    border: 'var(--status-closed-border)',
    label:  'Cancelada',
  },
  escalated: {
    text:   'var(--status-escalated-text)',
    bg:     'var(--status-escalated-bg)',
    border: 'var(--status-escalated-border)',
    glow:   'var(--status-escalated-glow)',
    label:  'Escalada',
  },
};

// ── Ticket SLA statuses ───────────────────────────────────────────────────────

export const SLA_STATUS_CONFIG: Record<string, StatusConfig> = {
  active: {
    text:   'var(--status-info-text)',
    bg:     'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label:  'En tiempo',
  },
  paused: {
    text:   'var(--status-paused-text)',
    bg:     'var(--status-paused-bg)',
    border: 'var(--status-paused-border)',
    label:  'Pausado',
  },
  met: {
    text:   'var(--status-success-text)',
    bg:     'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label:  'Cumplido',
  },
  breached: {
    text:   'var(--status-breached-text)',
    bg:     'var(--status-breached-bg)',
    border: 'var(--status-breached-border)',
    glow:   'var(--status-breached-glow)',
    label:  'Vencido',
  },
};

// ── Priority configs (shared: tickets + requests) ─────────────────────────────

export interface PriorityConfig {
  color:  string;
  label:  string;
  weight: number; // 1=lowest → 4=highest
}

export const PRIORITY_CONFIG: Record<string, PriorityConfig> = {
  baja: {
    color:  'var(--status-neutral-text)',
    label:  'Baja',
    weight: 1,
  },
  media: {
    color:  'var(--status-info-text)',
    label:  'Media',
    weight: 2,
  },
  alta: {
    color:  'var(--status-warning-text)',
    label:  'Alta',
    weight: 3,
  },
  critica: {
    color:  'var(--status-danger-text)',
    label:  'Crítica',
    weight: 4,
  },
};

// ── Asset statuses ─────────────────────────────────────────────────────────────

export const ASSET_STATUS_CONFIG: Record<string, StatusConfig> = {
  disponible: {
    text:   'var(--status-success-text)',
    bg:     'var(--status-success-bg)',
    border: 'var(--status-success-border)',
    label:  'Disponible',
  },
  asignado: {
    text:   'var(--status-info-text)',
    bg:     'var(--status-info-bg)',
    border: 'var(--status-info-border)',
    label:  'Asignado',
  },
  en_reparacion: {
    text:   'var(--status-warning-text)',
    bg:     'var(--status-warning-bg)',
    border: 'var(--status-warning-border)',
    label:  'En reparación',
  },
  dado_de_baja: {
    text:   'var(--status-closed-text)',
    bg:     'var(--status-closed-bg)',
    border: 'var(--status-closed-border)',
    label:  'Dado de baja',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getRequestStatusConfig(status: string): StatusConfig {
  return REQUEST_STATUS_CONFIG[status] ?? {
    text:   'var(--status-neutral-text)',
    bg:     'var(--status-neutral-bg)',
    border: 'var(--status-neutral-border)',
    label:  status,
  };
}

export function getSlaStatusConfig(status: string): StatusConfig {
  return SLA_STATUS_CONFIG[status] ?? {
    text:   'var(--status-neutral-text)',
    bg:     'var(--status-neutral-bg)',
    border: 'var(--status-neutral-border)',
    label:  status,
  };
}

export function getPriorityConfig(priority: string): PriorityConfig {
  return PRIORITY_CONFIG[priority] ?? {
    color:  'var(--status-neutral-text)',
    label:  priority,
    weight: 0,
  };
}

export function getAssetStatusConfig(status: string): StatusConfig {
  return ASSET_STATUS_CONFIG[status] ?? {
    text:   'var(--status-neutral-text)',
    bg:     'var(--status-neutral-bg)',
    border: 'var(--status-neutral-border)',
    label:  status,
  };
}

// ── Ticket portal state (derived from booleans on TicketListItem) ─────────────

export function getTicketPortalState(t: {
  is_final:          boolean;
  is_approval_state?: boolean;
  is_pause_state?:    boolean;
  assignee_name?:     string | null;
}): StatusConfig {
  if (t.is_final)          return { text: 'var(--status-neutral-text)',   bg: 'var(--status-neutral-bg)',   border: 'var(--status-neutral-border)',   label: 'Cerrado'    };
  if (t.is_approval_state) return { text: 'var(--status-success-text)',   bg: 'var(--status-success-bg)',   border: 'var(--status-success-border)',   label: 'Resuelto'   };
  if (t.is_pause_state)    return { text: 'var(--status-paused-text)',    bg: 'var(--status-paused-bg)',    border: 'var(--status-paused-border)',    label: 'En espera'  };
  if (t.assignee_name)     return { text: 'var(--status-info-text)',      bg: 'var(--status-info-bg)',      border: 'var(--status-info-border)',      label: 'En proceso' };
  return                          { text: 'var(--status-escalated-text)', bg: 'var(--status-escalated-bg)', border: 'var(--status-escalated-border)', label: 'Abierto'    };
}
