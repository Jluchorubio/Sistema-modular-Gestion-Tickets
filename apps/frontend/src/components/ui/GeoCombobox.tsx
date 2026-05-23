'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

interface Props {
  value:       string;
  onChange:    (val: string) => void;
  options:     string[];
  loading?:    boolean;
  placeholder?: string;
  icon?:       React.ReactNode;
  inputClass?: string;
  disabled?:   boolean;
}

export function GeoCombobox({ value, onChange, options, loading, placeholder, icon, inputClass, disabled }: Props) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync search field when external value changes (form reset)
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        // On blur, commit whatever is typed (free-text allowed)
        setSearch(value);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, value]);

  const filtered = useMemo(() => {
    if (!search) return options.slice(0, 100);
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 100);
  }, [options, search]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setSearch(v);
    onChange(v);
    setOpen(true);
  }

  function handleSelect(option: string) {
    setSearch(option);
    onChange(option);
    setOpen(false);
  }

  function handleFocus() {
    if (!disabled) setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setSearch(value); }
  }

  const showDropdown = open && (loading || filtered.length > 0);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <span style={{
            position: 'absolute', left: 11, top: 0, bottom: 0,
            display: 'flex', alignItems: 'center',
            color: '#94A3B8', pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Cargando…' : placeholder}
          disabled={disabled || (loading && options.length === 0)}
          className={inputClass}
          style={{ paddingLeft: icon ? 34 : undefined, paddingRight: 28 }}
          autoComplete="off"
        />
        <span style={{
          position: 'absolute', right: 8, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          color: '#94A3B8', pointerEvents: 'none',
        }}>
          {loading
            ? <Loader2 size={13} style={{ animation: 'geo-spin 1s linear infinite' }} />
            : <ChevronDown size={13} />
          }
        </span>
      </div>

      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 60, marginTop: 3,
          background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.1)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {loading && filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={11} style={{ animation: 'geo-spin 1s linear infinite' }} /> Cargando…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94A3B8' }}>Sin resultados</div>
          )}
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
              style={{
                width: '100%', display: 'block', padding: '8px 12px',
                textAlign: 'left', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                color: opt === value ? '#6366F1' : '#0F172A',
                fontWeight: opt === value ? 600 : 400,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes geo-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
