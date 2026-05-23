import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', gap: 16, textAlign: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: '#f1f5f9', color: '#0f172a',
    }}>
      <p style={{ fontSize: 72, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>404</p>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Página no encontrada</h1>
      <p style={{ fontSize: 13, color: '#64748b' }}>
        La ruta que buscas no existe o fue movida.
      </p>
      <Link
        href="/dashboard"
        style={{
          padding: '9px 20px', background: '#6366f1', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}
      >
        Ir al dashboard
      </Link>
    </div>
  );
}
