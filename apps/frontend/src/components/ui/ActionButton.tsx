import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background:  'var(--app-coral, #ff5e3a)',
    color:       '#fff',
    border:      '1.5px solid transparent',
  },
  secondary: {
    background:  'var(--app-navy, #0e2235)',
    color:       '#fff',
    border:      '1.5px solid transparent',
  },
  danger: {
    background:  'var(--status-danger-bg, #fef2f2)',
    color:       'var(--status-danger-text, #991b1b)',
    border:      '1.5px solid var(--status-danger-border, #fecaca)',
  },
  ghost: {
    background:  'transparent',
    color:       'var(--app-text-sub, #64748b)',
    border:      '1.5px solid transparent',
  },
  outline: {
    background:  '#ffffff',
    color:       'var(--app-text, #334155)',
    border:      '1.5px solid var(--app-border, #e2e8f0)',
  },
};

const HOVER_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary:   { opacity: '.88' },
  secondary: { opacity: '.88' },
  danger:    { background: 'var(--status-danger-bg)' },
  ghost:     { background: 'var(--app-border-soft, #f1f5f9)', color: 'var(--app-text)' },
  outline:   { borderColor: '#94a3b8', color: 'var(--app-text-main, #0e2235)' },
};

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  xs: { fontSize: 11, padding: '4px 9px',  gap: 4, borderRadius: 'var(--radius-sm, 6px)' },
  sm: { fontSize: 12, padding: '6px 12px', gap: 5, borderRadius: 'var(--radius-md, 8px)' },
  md: { fontSize: 13, padding: '8px 16px', gap: 6, borderRadius: 'var(--radius-md, 8px)' },
  lg: { fontSize: 14, padding: '10px 20px',gap: 7, borderRadius: 'var(--radius-lg, 12px)' },
};

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  icon?:     ReactNode;
  iconEnd?:  ReactNode;
  loading?:  boolean;
  children?: ReactNode;
}

export function ActionButton({
  variant = 'outline',
  size    = 'md',
  icon,
  iconEnd,
  loading,
  children,
  disabled,
  style,
  ...rest
}: ActionButtonProps) {
  const vs = VARIANT_STYLE[variant];
  const ss = SIZE_STYLE[size];

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontFamily:     'inherit',
        fontWeight:     500,
        whiteSpace:     'nowrap',
        cursor:         (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity:        (disabled || loading) ? .55 : 1,
        transition:     'opacity .15s, background .15s, border-color .15s, color .15s',
        flexShrink:     0,
        outline:        'none',
        ...vs,
        ...ss,
        ...style,
      }}
    >
      {icon && !loading && icon}
      {loading && (
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {children}
      {iconEnd && iconEnd}
    </button>
  );
}

/* Inject keyframe once — only runs in browser */
if (typeof document !== 'undefined') {
  const id = '__ab_spin';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }
}
