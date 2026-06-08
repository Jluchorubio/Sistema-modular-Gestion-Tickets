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
  default: '#e2e8f0',
  warning: '#fed7aa',
  danger:  '#fecaca',
  info:    '#bfdbfe',
  success: '#bbf7d0',
};
const CARD_BG: Record<string, string> = {
  default: '#ffffff',
  warning: '#fffbeb',
  danger:  '#fef2f2',
  info:    '#eff6ff',
  success: '#f0fdf4',
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

/* ── StatusBadge ────────────────────────────────────────────────────────────
   Pill badge with bg tint. Used for states, statuses, labels.
   ────────────────────────────────────────────────────────────────────────── */

export function StatusBadge({
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
   Centered empty state with icon + message.
   ────────────────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {icon && <div style={{ color: '#e2e8f0', marginBottom: 4 }}>{icon}</div>}
      <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', margin: 0 }}>{title}</p>
      {description && <p style={{ fontSize: 11, color: '#cbd5e1', margin: 0 }}>{description}</p>}
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
