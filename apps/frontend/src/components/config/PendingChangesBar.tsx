'use client';
import { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';
import { useConfigPending } from '@/stores/configPending.store';
import { CriticalChangeModal } from './CriticalChangeModal';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

export function PendingChangesBar() {
  const { items, applying, results, applyAll, unstage, clearAll, clearResults } = useConfigPending();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  if (items.length === 0 && results.length === 0) return null;

  async function handleConfirm(auth: CriticalAuthData) {
    setModalError(null);
    try {
      await applyAll(auth);
      setModalOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error al aplicar cambios';
      setModalError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    }
  }

  const hasFailed  = results.some((r) => !r.ok);
  const allOk      = results.length > 0 && results.every((r) => r.ok);

  return (
    <>
      {/* Floating bar */}
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 500, display: 'flex', alignItems: 'center', gap: 10,
        background: '#0e2235', color: '#fff',
        borderRadius: 12, padding: '12px 18px',
        boxShadow: '0 8px 32px rgba(14,34,53,0.35)',
        fontSize: 13, fontWeight: 600, maxWidth: '90vw',
        animation: 'fadeSlideUp .2s ease',
      }}>
        {/* Results state */}
        {results.length > 0 && items.length === 0 && (
          <>
            {allOk ? (
              <CheckCircle2 size={16} color="#20c933" />
            ) : (
              <AlertCircle size={16} color="#ff5e3a" />
            )}
            <span>
              {allOk
                ? `${results.length} cambio${results.length > 1 ? 's' : ''} aplicado${results.length > 1 ? 's' : ''} correctamente`
                : `${results.filter(r => r.ok).length} ok · ${results.filter(r => !r.ok).length} falló`}
            </span>
            {hasFailed && (
              <div style={{ fontSize: 11, color: '#ff5e3a', maxWidth: 260 }}>
                {results.filter(r => !r.ok).map(r => (
                  <div key={r.label}>{r.label}: {r.error}</div>
                ))}
              </div>
            )}
            <button
              onClick={clearResults}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8fa0af', padding: '0 2px', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </>
        )}

        {/* Pending state */}
        {items.length > 0 && (
          <>
            <div style={{
              width: 22, height: 22, background: '#ff5e3a', borderRadius: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 900, flexShrink: 0,
            }}>
              {items.length}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {items.length === 1 ? '1 cambio pendiente' : `${items.length} cambios pendientes`}
              </div>
              <div style={{ fontSize: 10, color: '#8fa0af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {items.map(i => i.label).join(' · ')}
              </div>
            </div>

            {/* Individual discard */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => unstage(item.id)}
                  title={`Descartar: ${item.label}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 8px', background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, cursor: 'pointer', color: '#94a3b8', fontSize: 10,
                    fontFamily: 'inherit',
                  }}
                >
                  <XCircle size={10} />
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={clearAll}
                style={{
                  padding: '7px 14px', background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, cursor: 'pointer', color: '#94a3b8',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                Descartar todo
              </button>
              <button
                onClick={() => { setModalError(null); setModalOpen(true); }}
                disabled={applying}
                style={{
                  padding: '7px 18px', background: '#ff5e3a', border: 'none',
                  borderRadius: 8, cursor: applying ? 'not-allowed' : 'pointer',
                  color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  opacity: applying ? 0.7 : 1,
                }}
              >
                {applying ? 'Aplicando…' : 'Aplicar cambios →'}
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
