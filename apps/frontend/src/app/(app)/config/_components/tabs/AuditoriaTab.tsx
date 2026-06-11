'use client';

import { useQuery }           from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import { Spinner }             from '@/components/ui/Spinner';
import type { AuditLog }       from '@/services/system-config.service';

const ACTION_STYLE: Record<string, React.CSSProperties> = {
  CREATE: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
  UPDATE: { background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' },
  DELETE: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

export function AuditoriaTab() {
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['sys-config-audit'],
    queryFn:  () => systemConfigService.getAuditLogs({ limit: 100 }),
    staleTime: 30_000,
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Historial de cambios críticos
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
        Todos los cambios en SLA, tipos de daño y tipos de solicitud quedan registrados con motivo y verificación.
      </div>

      {logs.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
          Sin registros de auditoría aún.
        </div>
      ) : (
        <div>
          {logs.map(log => {
            const aStyle = ACTION_STYLE[log.action] ?? ACTION_STYLE.UPDATE;
            const date   = new Date(log.created_at);
            return (
              <div key={log.id} style={{
                padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, ...aStyle }}>
                    {log.action}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0e2235' }}>
                    {log.entity_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ flex: 1 }} />
                  {log.verified_2fa
                    ? <span title="Verificado con 2FA"><ShieldCheck size={13} style={{ color: '#22c55e' }} /></span>
                    : <span title="Sin 2FA"><ShieldAlert size={13} style={{ color: '#f59e0b' }} /></span>}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                    {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                  <strong style={{ color: '#0e2235' }}>{log.user_name}</strong>
                  {log.username    && <span style={{ color: '#94a3b8' }}> (@{log.username})</span>}
                  {log.ip_address  && <span style={{ color: '#94a3b8' }}> · {log.ip_address}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', background: '#f8fafc',
                  padding: '6px 10px', borderRadius: 4, borderLeft: '3px solid #e2e8f0' }}>
                  "{log.reason}"
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
