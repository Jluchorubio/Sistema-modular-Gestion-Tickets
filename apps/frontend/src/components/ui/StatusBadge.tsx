import type { CSSProperties } from 'react';
import type { StatusConfig, PriorityConfig } from '@/constants/status';

interface StatusBadgeProps {
  config: StatusConfig;
  size?: 'xs' | 'sm' | 'md';
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}

const SIZE: Record<NonNullable<StatusBadgeProps['size']>, CSSProperties> = {
  xs: { fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-pill, 9999px)', fontWeight: 700 },
  sm: { fontSize: 11, padding: '2px 8px',  borderRadius: 'var(--radius-pill, 9999px)', fontWeight: 700 },
  md: { fontSize: 12, padding: '3px 10px', borderRadius: 'var(--radius-pill, 9999px)', fontWeight: 600 },
};

export function StatusBadge({ config, size = 'sm', glow, className, style }: StatusBadgeProps) {
  const s = SIZE[size];
  return (
    <span
      className={className}
      style={{
        display:     'inline-flex',
        alignItems:  'center',
        whiteSpace:  'nowrap',
        flexShrink:  0,
        color:       config.text,
        background:  config.bg,
        border:      `1px solid ${config.border}`,
        boxShadow:   (glow && config.glow) ? `0 0 0 3px ${config.glow}` : undefined,
        ...s,
        ...style,
      }}
    >
      {config.label}
    </span>
  );
}

interface PriorityDotProps {
  config: PriorityConfig;
  showLabel?: boolean;
  size?: number;
  title?: string;
}

export function PriorityDot({ config, showLabel, size = 7, title }: PriorityDotProps) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span
        style={{
          display:      'inline-block',
          width:        size,
          height:       size,
          borderRadius: '50%',
          background:   config.color,
          flexShrink:   0,
        }}
      />
      {showLabel && (
        <span style={{ fontSize: 11, color: 'var(--app-text-sub, #64748b)' }}>
          {config.label}
        </span>
      )}
    </span>
  );
}
