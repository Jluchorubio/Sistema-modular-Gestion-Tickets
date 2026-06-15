'use client';

import { Star, ChevronDown, Ticket, Clock } from 'lucide-react';
import {
  type TicketListItem, type TicketPriority,
} from '@/services/tickets.service';
import { getPriorityConfig, getSlaStatusConfig } from '@/constants/status';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../../tickets.module.css';

/* ─────────────────── Types ──────────────────────────────────────────────── */

export type QuickFilter = 'waiting' | 'mine' | 'breached' | 'unassigned' | 'in_espera' | 'approvals';

export interface AssignedTicket {
  id: string; title: string; priority: string;
  created_at: string; updated_at: string;
  module_id: string; module_name: string; module_slug: string | null;
  category_name: string | null; environment_name: string | null;
  current_state_id: string; state_label: string; state_name: string; is_final: boolean;
  is_approval_state: boolean; is_pause_state: boolean;
  created_by: string; creator_name: string;
  sla_status: string | null; sla_deadline_tracked: string | null;
  assignment_role: string;
  last_transition_reason?: string | null;
}

/* ─────────────────── Constants ──────────────────────────────────────────── */

export const STAT_CARDS: { key: QuickFilter; label: string; accent: string; desc: string }[] = [
  { key: 'waiting',    label: 'Esperándome', accent: '#ff5e3a', desc: 'Requieren tu acción' },
  { key: 'mine',       label: 'Mis tickets', accent: '#0e2235', desc: 'A mi cargo'          },
  { key: 'breached',   label: 'SLA Vencido', accent: '#ef4444', desc: 'Incumplidos'         },
  { key: 'unassigned', label: 'Sin asignar', accent: '#a855f7', desc: 'Sin responsable'     },
  { key: 'in_espera',  label: 'En espera',   accent: '#f59e0b', desc: 'Esperando respuesta' },
  { key: 'approvals',  label: 'Por aprobar', accent: '#3b82f6', desc: 'Pendientes'          },
];

/* ─────────────────── Helpers ────────────────────────────────────────────── */

export function initials(name: string | null | undefined) {
  return (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
}

/* ─────────────────── PriorityBadge ─────────────────────────────────────── */

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const cfg = getPriorityConfig(priority);
  return (
    <span
      className={styles.priorityBadge}
      style={{ background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`, color: cfg.color, borderColor: `color-mix(in srgb, ${cfg.color} 30%, transparent)` }}
    >
      {cfg.label}
    </span>
  );
}

/* ─────────────────── Stars ──────────────────────────────────────────────── */

export function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          fill={n <= rounded ? '#f59e0b' : 'none'}
          color={n <= rounded ? '#f59e0b' : '#e2e8f0'}
        />
      ))}
      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, fontWeight: 700 }}>
        ({rating.toFixed(1)})
      </span>
    </span>
  );
}

/* ─────────────────── TicketCard ─────────────────────────────────────────── */

export function TicketCard({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const overdue  = ticket.sla_status === 'breached';
  const slaCfg   = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status) : null;
  const slaLabel = ticket.sla_status ? (getSlaStatusConfig(ticket.sla_status).label ?? null) : null;

  return (
    <div className={`${styles.ticketCard}${overdue ? ` ${styles.ticketCardOverdue}` : ''}`} onClick={onClick}>
      <div className={styles.cardHeader}>
        <div className={styles.assigneeBadge}>
          <div className={styles.assigneeAvatar}>{initials(ticket.assignee_name)}</div>
          <span className={styles.assigneeLabel}>{ticket.assignee_name ?? 'Sin asignar'}</span>
          <ChevronDown size={10} style={{ flexShrink: 0 }} />
        </div>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <h3 className={styles.cardTitle}>{ticket.title}</h3>
      {ticket.is_approval_state && (
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--status-approval-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          Esperando aprobación del usuario
        </p>
      )}
      {ticket.is_pause_state && ticket.last_transition_reason && (
        <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--status-paused-text)', fontWeight: 600 }}>⏸ {ticket.last_transition_reason}</p>
      )}
      <div className={styles.cardBreadcrumb}>
        <Ticket size={10} /><span>{ticket.category_name}</span>
        {ticket.environment_name && (<><span className={styles.breadcrumbSep}>›</span><span>{ticket.environment_name}</span></>)}
      </div>
      <div className={styles.cardFooter}>
        <div className={styles.cardOwner}>
          <div className={styles.ownerAvatar}>{initials(ticket.creator_name)}</div>
          <div className={styles.ownerInfo}>
            <span className={styles.ownerName}>{ticket.creator_name}</span>
            <span className={styles.ownerMeta}>{fmtRelative(ticket.created_at)}</span>
          </div>
        </div>
        <div className={styles.cardStats}>
          {slaLabel && slaCfg && (
            <span className={styles.slaStat} style={{ color: slaCfg.text }}>
              <Clock size={9} />{slaLabel}
            </span>
          )}
          <span className={styles.ticketIdBadgeSm}>#{ticket.id.slice(-6).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
