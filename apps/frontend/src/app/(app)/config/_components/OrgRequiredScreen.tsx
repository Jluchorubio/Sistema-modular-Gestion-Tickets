'use client';

import { Lock, Network } from 'lucide-react';

export function OrgRequiredScreen({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 20px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Lock size={24} style={{ color: '#94a3b8' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0e2235', marginBottom: 8 }}>
        Requiere estructura organizacional
      </div>
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.6 }}>
        El motor de prioridad, el calendario SLA y la auditoría necesitan al menos un nodo
        en el organigrama para operar correctamente.
      </p>
      <button
        onClick={onConfigure}
        style={{
          padding: '9px 22px', background: '#0e2235', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
          alignItems: 'center', gap: 6,
        }}>
        <Network size={14} /> Configurar organigrama
      </button>
    </div>
  );
}
