'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Loader2, ShieldAlert } from 'lucide-react';
import { useConfigPending } from '@/stores/configPending.store';
import { CriticalChangeModal } from './CriticalChangeModal';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

/* ── Styles inline siguiendo reference: sharp corners, tipografía técnica ─── */

const BAR: React.CSSProperties = {
  position:    'fixed',
  bottom:      0,
  left:        0,
  right:       0,
  background:  '#ffffff',
  borderTop:   '3px solid #ff5e3a',
  boxShadow:   '0 -2px 20px rgba(14,34,53,0.10)',
  zIndex:      9999,
  padding:     '10px 24px',
  display:     'flex',
  alignItems:  'center',
  gap:         12,
  flexWrap:    'wrap' as const,
  fontFamily:  'inherit',
};

const BADGE: React.CSSProperties = {
  display:        'inline-flex',
  alignItems:     'center',
  justifyContent: 'center',
  width:           22,
  height:          22,
  background:      '#ff5e3a',
  borderRadius:    2,
  fontSize:        11,
  fontWeight:      900,
  color:           '#fff',
  flexShrink:      0,
};

const LABEL_PRIMARY: React.CSSProperties = {
  fontSize:      11,
  fontWeight:    800,
  color:         '#0e2235',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
};

const LABEL_MUTED: React.CSSProperties = {
  fontSize:  11,
  color:     '#64748b',
  fontWeight: 500,
};

function sharpBtn(variant: 'ghost' | 'coral' | 'green' | 'red'): React.CSSProperties {
  const base: React.CSSProperties = {
    display:     'inline-flex',
    alignItems:  'center',
    gap:          4,
    padding:     '6px 14px',
    borderRadius: 2,
    fontSize:    11,
    fontWeight:  700,
    cursor:      'pointer',
    fontFamily:  'inherit',
    border:      'none',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    whiteSpace:  'nowrap' as const,
    transition:  'background .12s, border-color .12s, color .12s',
  };
  if (variant === 'ghost')  return { ...base, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' };
  if (variant === 'coral')  return { ...base, background: 'rgba(255,94,58,0.08)', color: '#ff5e3a', border: '1px solid rgba(255,94,58,0.25)' };
  if (variant === 'green')  return { ...base, background: '#20c933', color: '#fff', padding: '7px 18px', fontSize: 12 };
  if (variant === 'red')    return { ...base, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' };
  return base;
}

const CHIP: React.CSSProperties = {
  display:     'inline-flex',
  alignItems:  'center',
  gap:          4,
  padding:     '3px 8px',
  background:  '#f8fafc',
  border:      '1px solid #e2e8f0',
  borderRadius: 2,
  fontSize:    10,
  fontWeight:  600,
  color:       '#64748b',
  cursor:      'pointer',
  fontFamily:  'inherit',
  whiteSpace:  'nowrap' as const,
};

/* ── Component ────────────────────────────────────────────────────────────── */

export function PendingChangesBar() {
  const { items, applying, results, applyAll, unstage, clearAll, clearResults } = useConfigPending();
  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [mounted,    setMounted]    = useState(false);

  // createPortal needs browser DOM
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;
  if (items.length === 0 && results.length === 0) return null;

  async function handleConfirm(auth: CriticalAuthData) {
    setModalError(null);
    await applyAll(auth);
    setModalOpen(false);
  }

  const failed = results.filter((r) => !r.ok);
  const allOk  = results.length > 0 && failed.length === 0;

  const bar = (
    <>
      <div style={BAR}>

        {/* ── Post-apply results ── */}
        {results.length > 0 && items.length === 0 && (
          <>
            {allOk
              ? <CheckCircle2 size={16} color="#20c933" style={{ flexShrink: 0 }} />
              : <AlertCircle  size={16} color="#ff5e3a" style={{ flexShrink: 0 }} />}

            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={LABEL_PRIMARY}>
                {allOk
                  ? `${results.length} cambio${results.length > 1 ? 's' : ''} guardado${results.length > 1 ? 's' : ''}`
                  : `${results.filter(r => r.ok).length} ok · ${failed.length} con error`}
              </span>
              {failed.map(r => (
                <div key={r.label} style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>
                  {r.label}: {r.error}
                </div>
              ))}
            </div>

            <button onClick={clearResults} style={sharpBtn('ghost')}>
              <X size={11} /> Cerrar
            </button>
          </>
        )}

        {/* ── Pending items ── */}
        {items.length > 0 && (
          <>
            {/* Badge count */}
            <div style={BADGE}>{items.length}</div>

            {/* Labels */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
              <span style={LABEL_PRIMARY}>
                {items.length === 1 ? '1 cambio pendiente' : `${items.length} cambios pendientes`}
              </span>
              <span style={{ color: '#cbd5e1', fontSize: 10 }}>·</span>
              <span style={LABEL_MUTED}>{items.map(i => i.label).join(' · ')}</span>
            </div>

            {/* Discard chips */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, flexShrink: 0 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => unstage(item.id)}
                  style={CHIP}
                  title={`Descartar: ${item.label}`}
                >
                  <X size={9} /> {item.label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 28, background: '#e2e8f0', flexShrink: 0 }} />

            {/* Actions */}
            <button onClick={clearAll} style={sharpBtn('ghost')}>
              Descartar todo
            </button>

            <button
              onClick={() => { setModalError(null); setModalOpen(true); }}
              disabled={applying}
              style={{
                ...sharpBtn('green'),
                opacity: applying ? 0.7 : 1,
                cursor:  applying ? 'not-allowed' : 'pointer',
              }}
            >
              {applying
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Guardando…</>
                : <><ShieldAlert size={12} /> Aplicar y guardar</>
              }
            </button>
          </>
        )}
      </div>

      {/* One shared modal */}
      <CriticalChangeModal
        isOpen={modalOpen}
        meta={{
          entityLabel: `${items.length} cambio${items.length > 1 ? 's' : ''} de configuración`,
          description: items.map(i => `• ${i.label}`).join('\n'),
        }}
        onConfirm={handleConfirm}
        onCancel={() => { setModalOpen(false); setModalError(null); }}
        error={modalError}
        loading={applying}
      />
    </>
  );

  return createPortal(bar, document.body);
}
