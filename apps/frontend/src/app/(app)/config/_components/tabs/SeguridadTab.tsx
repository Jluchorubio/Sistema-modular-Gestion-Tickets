'use client';

import { useState }  from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import { useCriticalChange }   from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from '@/components/config/CriticalChangeModal';
import { Spinner }             from '@/components/ui/Spinner';
import type { AuditLog, PasswordPolicy } from '@/services/system-config.service';

const CRITICAL_OPS = [
  'Configuración de Empresa', 'Fórmula de Prioridad', 'Horario Laboral Global',
  'Festivos del Calendario', 'Reglas SLA', 'Tipos de daño',
  'Tipos de solicitud', 'Nodos organizacionales', 'Tipos de estructura',
] as const;

const ACTIVE_PROTECTIONS = [
  { key: 'totp',   label: 'Re-autenticación 2FA para operaciones críticas', desc: 'Contraseña + TOTP requeridos para cambios irreversibles', ok: true },
  { key: 'rbac',   label: 'Motor RBAC activo',                              desc: '60 permisos granulares · roles globales + por módulo',  ok: true },
  { key: 'audit',  label: 'Auditoría de cambios críticos',                  desc: 'Cada operación crítica registra IP, usuario y diff',    ok: true },
  { key: 'bcrypt', label: 'Contraseñas hasheadas con bcrypt',               desc: 'Ninguna contraseña se almacena en texto claro',         ok: true },
  { key: 'jwt',    label: 'Tokens JWT firmados por servidor',               desc: 'Access token de corta vida + refresh token rotativo',   ok: true },
] as const;

const DEFAULT_POLICY: PasswordPolicy = {
  min_length: 8, require_uppercase: true, require_lowercase: true,
  require_number: true, require_special: false, expiry_days: 0, totp_required: false,
};

export function SeguridadTab() {
  const qc       = useQueryClient();
  const critical = useCriticalChange();

  const { data: recentCritical = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', { critical: true }],
    queryFn:  () => systemConfigService.getAuditLogs({ limit: 8 }),
    staleTime: 30_000,
  });

  const { data: policy, isLoading: policyLoading } = useQuery<PasswordPolicy>({
    queryKey: ['password-policy'],
    queryFn:  () => systemConfigService.getPasswordPolicy(),
    staleTime: 60_000,
  });

  const [policyForm, setPolicyForm] = useState<Partial<PasswordPolicy> | null>(null);
  const form: PasswordPolicy | null = policyForm !== null ? { ...(policy ?? DEFAULT_POLICY), ...policyForm } : (policy ?? null);

  function savePolicy() {
    if (!policyForm) return;
    critical.triggerCritical(
      { entityLabel: 'Política de contraseñas', description: 'Cambia los requisitos de seguridad para todos los usuarios.' },
      async (auth) => {
        await systemConfigService.updatePasswordPolicy(policyForm, auth);
        await qc.invalidateQueries({ queryKey: ['password-policy'] });
        setPolicyForm(null);
      },
    );
  }

  const criticalLogs = (recentCritical as AuditLog[]).filter(l => l.verified_2fa);

  const card: React.CSSProperties = { background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 12 };
  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 900, color: 'var(--app-text-main)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };

  return (
    <div>
      {/* ── Active protections ── */}
      <div style={card}>
        <div style={sectionTitle}>Protecciones activas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACTIVE_PROTECTIONS.map(p => (
            <div key={p.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
            }}>
              <ShieldCheck size={16} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text-main)' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ops requiring re-auth ── */}
      <div style={card}>
        <div style={sectionTitle}>Operaciones que requieren re-autenticación</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          Estas operaciones exigen contraseña + código TOTP antes de ejecutarse.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CRITICAL_OPS.map(op => (
            <span key={op} style={{
              padding: '3px 10px', background: 'rgba(255,94,58,.06)',
              border: '1px solid rgba(255,94,58,.2)', borderRadius: 8,
              fontSize: 10, fontWeight: 700, color: '#ff5e3a',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {op}
            </span>
          ))}
        </div>
      </div>

      {/* ── Recent critical operations ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={sectionTitle}>Operaciones críticas recientes</div>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Últimas verificadas con 2FA</span>
        </div>
        {isLoading ? (
          <Spinner />
        ) : criticalLogs.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 12,
            background: 'var(--app-page)', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
            Sin operaciones críticas registradas aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {criticalLogs.map(log => (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'var(--app-page)', border: '1px solid #e2e8f0', borderRadius: 8,
              }}>
                <ShieldCheck size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--app-text-main)' }}>
                    {log.entity_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    {log.action} · {log.user_name}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                {log.ip_address && (
                  <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>
                    {log.ip_address}
                  </span>
                )}
                {log.verified_2fa
                  ? <ShieldCheck size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                  : <ShieldAlert  size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Password policy ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={sectionTitle}>Política de contraseñas</div>
          {policyForm !== null && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPolicyForm(null)}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'var(--app-card)', cursor: 'pointer', color: '#64748b' }}>
                Cancelar
              </button>
              <button onClick={savePolicy}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0e2235', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                Guardar
              </button>
            </div>
          )}
        </div>

        {policyLoading || !form ? (
          <Spinner />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-main)' }}>Longitud mínima</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Número mínimo de caracteres requeridos</div>
              </div>
              <input type="number" min={6} max={128} value={form.min_length}
                onChange={e => setPolicyForm(p => ({ ...(p ?? policy ?? DEFAULT_POLICY), min_length: Number(e.target.value) }))}
                style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, textAlign: 'center' }} />
            </div>

            {([
              ['require_uppercase', 'Requiere mayúscula',          'Al menos una letra A–Z'],
              ['require_lowercase', 'Requiere minúscula',          'Al menos una letra a–z'],
              ['require_number',    'Requiere número',             'Al menos un dígito 0–9'],
              ['require_special',   'Requiere carácter especial',  'Al menos un símbolo (!@#$%…)'],
              ['totp_required',     '2FA obligatorio',             'Todos los usuarios deben activar TOTP para acceder'],
            ] as [keyof PasswordPolicy, string, string][]).map(([key, label, desc]) => {
              const val = form[key] as boolean;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-main)' }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{desc}</div>
                  </div>
                  <button type="button"
                    onClick={() => setPolicyForm(p => ({ ...(p ?? policy ?? DEFAULT_POLICY), [key]: !val }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: val ? '#22c55e' : '#cbd5e1' }}>
                    {val ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              );
            })}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--app-text-main)' }}>Expiración (días)</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Días hasta que la contraseña expira. 0 = sin expiración</div>
              </div>
              <input type="number" min={0} max={365} value={form.expiry_days}
                onChange={e => setPolicyForm(p => ({ ...(p ?? policy ?? DEFAULT_POLICY), expiry_days: Number(e.target.value) }))}
                style={{ width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, textAlign: 'center' }} />
            </div>
          </div>
        )}
      </div>

      <CriticalChangeModal {...critical} />
    </div>
  );
}
