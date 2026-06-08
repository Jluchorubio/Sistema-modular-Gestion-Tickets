import type { CSSProperties, ReactNode } from 'react';

interface MetricCardProps {
  label:    string;
  value:    number | string;
  icon?:    ReactNode;
  color?:   string;
  sub?:     string;
  active?:  boolean;
  onClick?: () => void;
  size?:    'sm' | 'md' | 'lg';
  style?:   CSSProperties;
  className?: string;
}

const SIZE_PAD = { sm: '12px 14px', md: '16px 20px', lg: '20px 24px' };
const SIZE_VAL = { sm: 20,          md: 26,           lg: 32           };
const SIZE_LBL = { sm: 11,          md: 12,           lg: 13           };
const ICON_SZ  = { sm: 32,          md: 40,           lg: 48           };

export function MetricCard({
  label, value, icon, color = 'var(--app-navy, #0e2235)',
  sub, active, onClick, size = 'md', style, className,
}: MetricCardProps) {
  const isClickable = !!onClick;
  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
      className={className}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           14,
        flex:          1,
        minWidth:      120,
        padding:       SIZE_PAD[size],
        background:    active ? `color-mix(in srgb, ${color} 8%, transparent)` : 'var(--app-card, #fff)',
        border:        `1.5px solid ${active ? color : 'var(--app-border, #e2e8f0)'}`,
        borderRadius:  'var(--radius-lg, 12px)',
        cursor:        isClickable ? 'pointer' : 'default',
        transition:    'border-color .15s, background .15s, box-shadow .15s',
        boxShadow:     active ? `0 0 0 3px color-mix(in srgb, ${color} 12%, transparent)` : 'var(--shadow-xs)',
        outline:       'none',
        userSelect:    'none',
        ...style,
      }}
    >
      {icon && (
        <div style={{
          width:        ICON_SZ[size],
          height:       ICON_SZ[size],
          borderRadius: 'var(--radius-md, 8px)',
          background:   `color-mix(in srgb, ${color} 12%, transparent)`,
          display:      'grid',
          placeItems:   'center',
          color,
          flexShrink:   0,
        }}>
          {icon}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontSize:   SIZE_VAL[size],
          fontWeight: 'var(--fw-bold, 700)' as CSSProperties['fontWeight'],
          color,
          lineHeight:  1,
          margin:      '0 0 3px',
        }}>
          {value}
        </p>
        <p style={{
          fontSize:   SIZE_LBL[size],
          color:      'var(--app-text-sub, #64748b)',
          fontWeight: 500,
          margin:      0,
          overflow:    'hidden',
          textOverflow:'ellipsis',
          whiteSpace:  'nowrap',
        }}>
          {label}
        </p>
        {sub && (
          <p style={{ fontSize: 10, color: 'var(--app-text-muted, #94a3b8)', margin: '2px 0 0' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── MetricRow: horizontal strip of MetricCards ─────────────────────────── */

export function MetricRow({
  children, gap = 12, style,
}: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <div style={{
      display:   'flex',
      gap,
      flexWrap:  'wrap',
      alignItems:'stretch',
      ...style,
    }}>
      {children}
    </div>
  );
}
