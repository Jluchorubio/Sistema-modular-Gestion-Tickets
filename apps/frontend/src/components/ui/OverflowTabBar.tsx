'use client';

import { useState, useRef, useEffect, useCallback, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Lock } from 'lucide-react';

export interface OverflowTabDef {
  key:      string;
  label:    string;
  Icon:     ElementType;
  blocked?: boolean;
  title?:   string;
}

interface Props {
  tabs:     OverflowTabDef[];
  active:   string;
  onChange: (key: string) => void;
  cls: {
    bar:    string;
    btn:    string;
    active: string;
  };
}

const MORE_W = 48;

export function OverflowTabBar({ tabs, active, onChange, cls }: Props) {
  const [limit,   setLimit]   = useState(tabs.length);
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  const barRef  = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Portal requires client
  useEffect(() => { setMounted(true); }, []);

  const compute = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const barW = bar.clientWidth;
    let sum = 0;
    let n   = 0;

    for (let i = 0; i < btnRefs.current.length; i++) {
      const el = btnRefs.current[i];
      if (!el) continue;
      const w = el.offsetWidth;
      const needMore = i < tabs.length - 1;
      if (sum + w + (needMore ? MORE_W : 0) > barW) break;
      sum += w;
      n    = i + 1;
    }
    setLimit(Math.max(1, n));
  }, [tabs.length]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(compute);
    ro.observe(bar);
    requestAnimationFrame(compute);
    return () => ro.disconnect();
  }, [compute]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!moreRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Close on scroll/resize to avoid stale position
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function handleMoreClick() {
    if (moreRef.current) {
      const rect = moreRef.current.getBoundingClientRect();
      setDropPos({
        top:   rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(v => !v);
  }

  const overflow       = tabs.slice(limit);
  const hasOverflow    = overflow.length > 0;
  const overflowActive = overflow.some(t => t.key === active);

  return (
    <>
      <div
        ref={barRef}
        className={cls.bar}
        style={{ overflow: 'hidden', flexWrap: 'nowrap', position: 'relative' }}
      >
        {tabs.map((tab, i) => {
          const hidden         = i >= limit;
          const isActive       = active === tab.key;
          const isLastVisible  = i === limit - 1 && !hasOverflow;

          return (
            <button
              key={tab.key}
              ref={el => { btnRefs.current[i] = el; }}
              type="button"
              className={`${cls.btn}${isActive ? ` ${cls.active}` : ''}`}
              title={tab.title}
              style={
                hidden
                  ? { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: 0 }
                  : isLastVisible
                    ? { borderRight: '1px solid #e2e8f0' }
                    : undefined
              }
              onClick={() => { if (!tab.blocked) onChange(tab.key); }}
            >
              {tab.blocked ? <Lock size={12} /> : <tab.Icon size={13} />}
              {tab.label}
            </button>
          );
        })}

        {hasOverflow && (
          <button
            ref={moreRef}
            type="button"
            className={`${cls.btn}${overflowActive ? ` ${cls.active}` : ''}`}
            style={{ borderRight: '1px solid #e2e8f0', padding: '7px 13px', flexShrink: 0 }}
            onClick={handleMoreClick}
            title="Más pestañas"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>

      {/* Dropdown via portal — rendered at body so overflow:hidden no lo recorta */}
      {mounted && hasOverflow && open && createPortal(
        <div
          ref={dropRef}
          style={{
            position:     'fixed',
            top:           dropPos.top,
            right:         dropPos.right,
            background:   '#ffffff',
            border:       '1px solid #e2e8f0',
            borderRadius:  8,
            boxShadow:    '0 4px 16px rgba(14,34,53,.12)',
            zIndex:        9999,
            minWidth:      180,
            overflow:     'hidden',
          }}
        >
          {overflow.map((tab, idx) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (!tab.blocked) { onChange(tab.key); setOpen(false); }
              }}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:            8,
                width:         '100%',
                padding:       '9px 14px',
                background:     active === tab.key ? 'rgba(14,34,53,.04)' : 'transparent',
                border:        'none',
                borderBottom:   idx < overflow.length - 1 ? '1px solid #f1f5f9' : 'none',
                cursor:         tab.blocked ? 'not-allowed' : 'pointer',
                opacity:        tab.blocked ? 0.45 : 1,
                fontSize:       11,
                fontWeight:     active === tab.key ? 800 : 600,
                color:          active === tab.key ? '#0e2235' : '#475569',
                fontFamily:    'inherit',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
                textAlign:     'left' as const,
              }}
            >
              {tab.blocked ? <Lock size={12} /> : <tab.Icon size={13} />}
              {tab.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
