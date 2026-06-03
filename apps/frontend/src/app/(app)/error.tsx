'use client';

import { useEffect } from 'react';

interface Props {
  error:  Error & { digest?: string };
  reset:  () => void;
}

export default function AppError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center',
      fontFamily: 'inherit',
    }}>
      <p style={{ fontSize: 48, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>Oops</p>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Algo salió mal</h2>
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 360 }}>
        {error.message || 'Error inesperado. Por favor recarga la página.'}
      </p>
      <button
        onClick={() => { reset(); window.location.reload(); }}
        style={{
          padding: '9px 20px', background: '#0e2235', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: 'none', fontFamily: 'inherit',
        }}
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
