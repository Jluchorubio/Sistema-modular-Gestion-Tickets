'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { usersService } from '@/services/users.service';
import { tokens } from '@/lib/tokens';

export function ForcePwModal() {
  const router    = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [show,    setShow]    = useState(false);
  const [current, setCurrent] = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confirm, setConfirm] = useState('');
  const [vis,     setVis]     = useState({ current: false, newPwd: false, confirm: false });
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setShow(tokens.getForcePw());
  }, []);

  if (!show) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (newPwd.length < 8) { setErr('Mínimo 8 caracteres'); return; }
    if (newPwd !== confirm) { setErr('Las contraseñas no coinciden'); return; }
    if (current === newPwd) { setErr('La nueva contraseña debe ser diferente'); return; }
    setLoading(true);
    try {
      await usersService.changeMyPassword(current, newPwd);
      tokens.clearForcePw();
      clearAuth();
      router.push('/login?pw_changed=1');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cambiar contraseña';
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid #E2E8F0', borderRadius: 8,
    background: '#fff', color: '#0F172A', fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  };

  const fields = [
    { key: 'current' as const, label: 'Contraseña actual (temporal)',  value: current, set: setCurrent },
    { key: 'newPwd'  as const, label: 'Nueva contraseña',              value: newPwd,  set: setNewPwd  },
    { key: 'confirm' as const, label: 'Confirmar nueva contraseña',    value: confirm, set: setConfirm },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={18} color="#D97706" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#0F172A', margin: 0 }}>
              Cambio de contraseña requerido
            </p>
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24, lineHeight: 1.6 }}>
          Tu administrador requiere que establezcas una nueva contraseña antes de continuar.
          Ingresa la contraseña temporal que recibiste y elige una nueva.
        </p>

        <form onSubmit={handleSubmit}>
          {fields.map(({ key, label, value, set }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                {label}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={vis[key] ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => { set(e.target.value); setErr(''); }}
                  style={{ ...inputStyle, paddingRight: 40 }}
                  autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setVis((v) => ({ ...v, [key]: !v[key] }))}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2,
                  }}
                >
                  {vis[key] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          {err && (
            <p style={{ fontSize: 13, color: '#B91C1C', marginBottom: 14, padding: '8px 12px', background: '#FEF2F2', borderRadius: 8 }}>
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !current || !newPwd || !confirm}
            style={{
              width: '100%', padding: '11px 0', background: loading ? '#6366F1aa' : '#6366F1',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {loading ? 'Actualizando…' : 'Establecer nueva contraseña'}
          </button>

          <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12 }}>
            Al cambiar la contraseña se cerrarán todas las sesiones activas y deberás iniciar sesión de nuevo.
          </p>
        </form>
      </div>
    </div>
  );
}
