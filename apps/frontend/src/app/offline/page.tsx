export const metadata = { title: 'Sin conexión — Tickets System' };

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0e2235',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      gap: 16,
      padding: 24,
      textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72,
        background: '#17384a',
        borderRadius: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        marginBottom: 8,
      }}>
        📡
      </div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sin conexión</h1>
      <p style={{ margin: 0, color: '#94a3b8', maxWidth: 320, lineHeight: 1.6 }}>
        No hay conexión a internet. Verifica tu red y vuelve a intentarlo.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8,
          padding: '10px 24px',
          background: '#0f2a3d',
          color: '#e2e8f0',
          border: '1.5px solid #334155',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
