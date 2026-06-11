/**
 * Shared UI primitives.
 * Use these instead of re-defining inline styles in every module.
 * Colors: use var(--app-*) tokens from globals.css
 */

import React from 'react';

/* ── SectionCard ────────────────────────────────────────────────────────────
   Standard card wrapper used throughout the app.
   Usage: <SectionCard>...</SectionCard>
   Variants: "default" | "warning" | "danger" | "info"
   ────────────────────────────────────────────────────────────────────────── */

const CARD_BORDER: Record<string, string> = {
  default: 'var(--app-border,      #e2e8f0)',
  warning: 'var(--status-warning-border, #fde68a)',
  danger:  'var(--status-danger-border,  #fecaca)',
  info:    'var(--status-info-border,    #bfdbfe)',
  success: 'var(--status-success-border, #bbf7d0)',
};
const CARD_BG: Record<string, string> = {
  default: 'var(--app-card,         #ffffff)',
  warning: 'var(--status-warning-bg, #fffbeb)',
  danger:  'var(--status-danger-bg,  #fef2f2)',
  info:    'var(--status-info-bg,    #eff6ff)',
  success: 'var(--status-success-bg, #f0fdf4)',
};

export function SectionCard({
  children,
  variant = 'default',
  style,
}: {
  children: React.ReactNode;
  variant?: keyof typeof CARD_BORDER;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: CARD_BG[variant] ?? '#fff',
      border:     `1px solid ${CARD_BORDER[variant] ?? '#e2e8f0'}`,
      borderRadius: 10,
      padding: '14px 16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── SectionLabel ───────────────────────────────────────────────────────────
   Overline label used at the top of sections / cards.
   ────────────────────────────────────────────────────────────────────────── */

export function SectionLabel({
  children,
  color = '#94a3b8',
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p style={{
      fontSize: 10,
      fontWeight: 800,
      color,
      textTransform: 'uppercase',
      letterSpacing: '.08em',
      margin: '0 0 10px',
      ...style,
    }}>
      {children}
    </p>
  );
}

/* ── InfoRow ────────────────────────────────────────────────────────────────
   Horizontal label + value pair.
   Usage: <InfoRow label="Prioridad" value="Alta" />
   ────────────────────────────────────────────────────────────────────────── */

export function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
}) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: valueColor ?? '#334155', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
        {value}
      </span>
    </div>
  );
}

/* ── AvatarInitials ─────────────────────────────────────────────────────────
   Circle avatar with initials. Consistent across all modules.
   ────────────────────────────────────────────────────────────────────────── */

export function AvatarInitials({
  name,
  size = 30,
  bg = '#ff5e3a',
  fontSize,
}: {
  name: string | null | undefined;
  size?: number;
  bg?: string;
  fontSize?: number;
}) {
  const initials = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const fs = fontSize ?? Math.max(9, Math.round(size * 0.4));
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: fs, fontWeight: 700, color: '#fff' }}>{initials}</span>
    </div>
  );
}

/* ── ColorBadge ─────────────────────────────────────────────────────────────
   Legacy pill badge taking a raw hex color. Prefer StatusBadge (StatusConfig)
   from '@/components/ui/StatusBadge' for new components.
   ────────────────────────────────────────────────────────────────────────── */

export function ColorBadge({
  label,
  color,
  size = 'md',
}: {
  label: string;
  color: string;
  size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? '1px 6px' : '2px 8px';
  const fs  = size === 'sm' ? 9 : 10;
  return (
    <span style={{
      fontSize: fs,
      padding: pad,
      borderRadius: 99,
      fontWeight: 700,
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

/* ── CountBadge ─────────────────────────────────────────────────────────────
   Small numeric badge (tabs, icons, counters).
   ────────────────────────────────────────────────────────────────────────── */

export function CountBadge({ count, color = '#ff5e3a' }: { count: number; color?: string }) {
  if (count <= 0) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 16,
      height: 16,
      borderRadius: 99,
      background: color,
      color: '#fff',
      fontSize: 10,
      fontWeight: 800,
      padding: '0 4px',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────────
   Centered empty state with icon + message + optional CTA.
   ────────────────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  padding = '60px 20px',
}: {
  icon?:        React.ReactNode;
  title:        string;
  description?: string;
  action?:      { label: string; onClick: () => void };
  padding?:     string;
}) {
  return (
    <div style={{ padding, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {icon && (
        <div style={{ color: 'var(--app-border, #e2e8f0)', marginBottom: 2 }}>{icon}</div>
      )}
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text, #334155)', margin: 0 }}>{title}</p>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--app-text-muted, #94a3b8)', margin: 0, maxWidth: 320 }}>{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            marginTop:    6,
            padding:      '8px 18px',
            background:   'var(--app-coral, #ff5e3a)',
            color:        '#fff',
            border:       'none',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize:     13,
            fontWeight:   600,
            cursor:       'pointer',
            fontFamily:   'inherit',
            transition:   'opacity .15s',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── SectionTitle ────────────────────────────────────────────────────────────
   Overline + heading + optional count badge. Consistent section headers.
   ────────────────────────────────────────────────────────────────────────── */

export function SectionTitle({
  label,
  title,
  count,
  style,
}: {
  label?:  string;
  title:   string;
  count?:  number;
  style?:  React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      {label && (
        <p style={{
          fontSize:      10,
          fontWeight:    'var(--fw-heavy, 800)' as React.CSSProperties['fontWeight'],
          color:         'var(--app-text-muted, #94a3b8)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-widest, .10em)',
          margin:        '0 0 4px',
        }}>
          {label}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{
          fontSize:   18,
          fontWeight: 'var(--fw-bold, 700)' as React.CSSProperties['fontWeight'],
          color:      'var(--app-text-main, #0e2235)',
          margin:     0,
          lineHeight: 1.2,
        }}>
          {title}
        </h2>
        {count !== undefined && (
          <span style={{
            fontSize:   11,
            fontWeight: 700,
            color:      'var(--app-text-muted, #94a3b8)',
            background: 'var(--app-border-soft, #f1f5f9)',
            border:     '1px solid var(--app-border, #e2e8f0)',
            borderRadius: 'var(--radius-pill, 9999px)',
            padding:    '1px 7px',
          }}>
            {count}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────────────
   Top-of-page title + description + actions. Replaces per-module header rows.
   ────────────────────────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  style,
}: {
  title:        string;
  description?: string;
  actions?:     React.ReactNode;
  style?:       React.CSSProperties;
}) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'flex-start',
      justifyContent: 'space-between',
      gap:            16,
      marginBottom:   20,
      ...style,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{
          fontSize:   20,
          fontWeight: 'var(--fw-bold, 700)' as React.CSSProperties['fontWeight'],
          color:      'var(--app-text-main, #0e2235)',
          margin:     description ? '0 0 4px' : 0,
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 13, color: 'var(--app-text-sub, #64748b)', margin: 0 }}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

/* ── Divider ────────────────────────────────────────────────────────────────
   Horizontal rule with optional label.
   ────────────────────────────────────────────────────────────────────────── */

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '8px 0' }} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
    </div>
  );
}
