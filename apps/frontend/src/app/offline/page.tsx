'use client';
export default function OfflinePage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 16,
      textAlign: 'center', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#f1f5f9', color: '#0f172a',
    }}>
      <p style={{ fontSize: 72, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>Sin conexión</p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>No hay conexión a internet</h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
        Verifica tu conexión e intenta de nuevo.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '9px 20px', background: '#0e2235', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
