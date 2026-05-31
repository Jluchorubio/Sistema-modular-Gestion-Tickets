'use client';
import { useState } from 'react';
import { CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { useConfigPending } from '@/stores/configPending.store';
import { CriticalChangeModal } from './CriticalChangeModal';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

export function PendingChangesBar() {
  const { items, applying, results, applyAll, unstage, clearAll, clearResults } = useConfigPending();
  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  if (items.length === 0 && results.length === 0) return null;

  async function handleConfirm(auth: CriticalAuthData) {
    setModalError(null);
    await applyAll(auth);
    setModalOpen(false);
  }

  const failed  = results.filter((r) => !r.ok);
  const allOk   = results.length > 0 && failed.length === 0;

  return (
    <>
      {/* ── Full-width action bar ─────────────────────────────────────────────── */}
      <div style={{
        position:   'fixed',
        bottom:     0,
        left:       0,
        right:      0,
        background: '#ffffff',
        borderTop:  '3px solid #ff5e3a',
        boxShadow:  '0 -4px 24px rgba(14,34,53,0.10)',
        zIndex:     500,
        padding:    '12px 32px',
        display:    'flex',
        alignItems: 'center',
        gap:        16,
        flexWrap:   'wrap',
      }}>

        {/* ── Post-apply results ── */}
        {results.length > 0 && items.length === 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              {allOk ? (
                <CheckCircle2 size={18} color="#20c933" style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={18} color="#ff5e3a" style={{ flexShrink: 0 }} />
              )}
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>
                  {allOk
                    ? `${results.length} cambio${results.length > 1 ? 's' : ''} aplicado${results.length > 1 ? 's' : ''} correctamente`
                    : `${results.filter(r => r.ok).length} ok · ${failed.length} con error`}
                </span>
                {failed.map(r => (
                  <div key={r.label} style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                    {r.label}: {r.error}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={clearResults}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                background: '#fff', cursor: 'pointer', color: '#64748b',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <X size={13} /> Cerrar
            </button>
          </>
        )}

        {/* ── Pending items ── */}
        {items.length > 0 && (
          <>
            {/* Count badge */}
            <div style={{
              width: 26, height: 26, background: '#ff5e3a',
              borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 900, color: '#fff', flexShrink: 0,
            }}>
              {items.length}
            </div>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>
                {items.length === 1 ? '1 cambio pendiente' : `${items.length} cambios pendientes`}
                {' '}
              </span>
              <span style={{ fontSize: 12, color: '#8fa0af' }}>
                {items.map(i => i.label).join(' · ')}
              </span>
            </div>

            {/* Individual discard chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => unstage(item.id)}
                  title={`Descartar: ${item.label}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', background: '#f8fafc',
                    border: '1px solid #e2e8f0', borderRadius: 6,
                    cursor: 'pointer', color: '#64748b', fontSize: 11,
                    fontFamily: 'inherit', fontWeight: 500,
                  }}
                >
                  <X size={10} /> {item.label}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={clearAll}
                style={{
                  padding: '8px 16px', background: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  cursor: 'pointer', color: '#64748b',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                Descartar todo
              </button>
              <button
                onClick={() => { setModalError(null); setModalOpen(true); }}
                disabled={applying}
                style={{
                  padding: '8px 20px', background: applying ? '#e2e8f0' : '#20c933',
                  border: 'none', borderRadius: 8,
                  cursor: applying ? 'not-allowed' : 'pointer',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background .15s',
                }}
              >
                {applying
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Aplicando…</>
                  : <>Aplicar cambios →</>
                }
              </button>
            </div>
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
}
