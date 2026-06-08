import type { CSSProperties, ReactNode } from 'react';

export type AlertVariant = 'info' | 'warning' | 'success' | 'danger' | 'escalated' | 'breached';

const VARIANT: Record<AlertVariant, { bg: string; border: string; text: string; subtext: string }> = {
  info: {
    bg:      'var(--status-info-bg,     #eff6ff)',
    border:  'var(--status-info-border, #bfdbfe)',
    text:    'var(--status-info-text,   #1d4ed8)',
    subtext: 'var(--app-text-sub,       #64748b)',
  },
  warning: {
    bg:      'var(--status-warning-bg,     #fffbeb)',
    border:  'var(--status-warning-border, #fde68a)',
    text:    'var(--status-warning-text,   #92400e)',
    subtext: 'var(--app-text-sub,          #64748b)',
  },
  success: {
    bg:      'var(--status-success-bg,     #f0fdf4)',
    border:  'var(--status-success-border, #bbf7d0)',
    text:    'var(--status-success-text,   #15803d)',
    subtext: 'var(--app-text-sub,          #64748b)',
  },
  danger: {
    bg:      'var(--status-danger-bg,     #fef2f2)',
    border:  'var(--status-danger-border, #fecaca)',
    text:    'var(--status-danger-text,   #991b1b)',
    subtext: 'var(--app-text-sub,         #64748b)',
  },
  escalated: {
    bg:      '#431407',
    border:  '#7c2d12',
    text:    '#fb923c',
    subtext: '#fed7aa',
  },
  breached: {
    bg:      '#450a0a',
    border:  '#991b1b',
    text:    '#f87171',
    subtext: '#fecaca',
  },
};

interface AlertBannerProps {
  variant:   AlertVariant;
  icon?:     ReactNode;
  children:  ReactNode;
  action?:   { label: string; onClick: () => void };
  onDismiss?: () => void;
  style?:    CSSProperties;
  className?: string;
}

export function AlertBanner({
  variant, icon, children, action, onDismiss, style, className,
}: AlertBannerProps) {
  const v = VARIANT[variant];
  return (
    <div
      role="alert"
      className={className}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '8px 14px',
        background:   v.bg,
        border:       `1px solid ${v.border}`,
        borderRadius: 'var(--radius-md, 8px)',
        ...style,
      }}
    >
      {icon && (
        <span style={{ color: v.text, flexShrink: 0, display: 'flex' }}>{icon}</span>
      )}
      <span style={{ fontSize: 13, fontWeight: 600, color: v.subtext, flex: 1 }}>
        {children}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            padding:      '3px 10px',
            border:       `1px solid ${v.border}`,
            borderRadius: 'var(--radius-sm, 6px)',
            background:   'transparent',
            fontSize:     11,
            fontWeight:   700,
            color:        v.text,
            cursor:       'pointer',
            fontFamily:   'inherit',
            transition:   'opacity .15s',
            flexShrink:   0,
          }}
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onDismiss}
          style={{
            display:      'flex',
            alignItems:   'center',
            justifyContent:'center',
            width:        20,
            height:       20,
            border:       'none',
            background:   'transparent',
            color:        v.text,
            cursor:       'pointer',
            borderRadius: 4,
            opacity:      .7,
            flexShrink:   0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
