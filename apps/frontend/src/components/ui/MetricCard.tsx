import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

interface MetricCardProps {
  label:    string;
  value:    number | string;
  icon?:    ReactNode;
  color?:   string;
  sub?:     string;
  active?:  boolean;
  warn?:    boolean;
  href?:    string;
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
  sub, active, warn, href, onClick, size = 'md', style, className,
}: MetricCardProps) {
  const isEmpty     = typeof value === 'number' ? value === 0 : false;
  const isWarnActive = warn && !isEmpty;
  const effectiveColor = isWarnActive ? 'var(--app-coral, #ff5e3a)' : color;
  const isActive    = active || isWarnActive;
  const isClickable = !!onClick || !!href;

  const inner = (
    <div
      role={isClickable && !href ? 'button' : undefined}
      tabIndex={isClickable && !href ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable && !href ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
      className={className}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           14,
        flex:          1,
        minWidth:      120,
        padding:       SIZE_PAD[size],
        background:    isActive ? `color-mix(in srgb, ${effectiveColor} 8%, transparent)` : 'var(--app-card, #fff)',
        border:        `1.5px solid ${isActive ? effectiveColor : 'var(--app-border, #e2e8f0)'}`,
        borderRadius:  'var(--radius-lg, 12px)',
        cursor:        isClickable ? 'pointer' : 'default',
        transition:    'border-color .15s, background .15s, box-shadow .15s',
        boxShadow:     isActive ? `0 0 0 3px color-mix(in srgb, ${effectiveColor} 12%, transparent)` : 'var(--shadow-xs)',
        outline:       'none',
        userSelect:    'none',
        textDecoration:'none',
        ...style,
      }}
    >
      {icon && (
        <div style={{
          width:        ICON_SZ[size],
          height:       ICON_SZ[size],
          borderRadius: 'var(--radius-md, 8px)',
          background:   `color-mix(in srgb, ${effectiveColor} 12%, transparent)`,
          display:      'grid',
          placeItems:   'center',
          color:        effectiveColor,
          flexShrink:   0,
        }}>
          {icon}
        </div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          fontSize:   SIZE_VAL[size],
          fontWeight: 'var(--fw-bold, 700)' as CSSProperties['fontWeight'],
          color:      effectiveColor,
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

  if (href) {
    return <Link href={href} style={{ display: 'flex', flex: 1, textDecoration: 'none', minWidth: 120 }}>{inner}</Link>;
  }
  return inner;
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
