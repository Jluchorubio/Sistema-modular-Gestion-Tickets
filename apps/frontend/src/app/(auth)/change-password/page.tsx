'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Eye, EyeOff } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [showCur, setShowCur]       = useState(false);
  const [showNew, setShowNew]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  const strength = (() => {
    if (newPw.length === 0) return 0;
    let s = 0;
    if (newPw.length >= 8)               s++;
    if (/[A-Z]/.test(newPw))             s++;
    if (/[0-9]/.test(newPw))             s++;
    if (/[^A-Za-z0-9]/.test(newPw))      s++;
    return s;
  })();
  const strengthLabel = ['', 'Débil', 'Regular', 'Buena', 'Fuerte'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'][strength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPw.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (newPw === currentPw) {
      setError('La nueva contraseña no puede ser igual a la actual.');
      return;
    }

    setSubmitting(true);
    try {
      await usersService.changeMyPassword(currentPw, newPw);
      tokens.clearForcePw();
      router.push(ROUTES.APP.DASHBOARD);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al cambiar la contraseña. Verifica tu contraseña actual.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0e2235 0%, #1a3a5c 100%)',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: '#fff7ed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <KeyRound size={28} color="#ff5e3a" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0e2235', margin: 0, textAlign: 'center' }}>
            Cambio de contraseña requerido
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
            Tu cuenta requiere que establezcas una nueva contraseña antes de continuar.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#dc2626',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Current password */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Contraseña actual
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCur ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '10px 40px 10px 14px', fontSize: 14,
                  border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
                  boxSizing: 'border-box', color: '#0f172a',
                }}
              />
              <button
                type="button"
                onClick={() => setShowCur((v) => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
              >
                {showCur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Nueva contraseña <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                style={{
                  width: '100%', padding: '10px 40px 10px 14px', fontSize: 14,
                  border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none',
                  boxSizing: 'border-box', color: '#0f172a',
                }}
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newPw.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map((i) => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i <= strength ? strengthColor : '#e2e8f0',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: strengthColor, marginTop: 4, display: 'block' }}>
                  {strengthLabel}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Confirmar nueva contraseña <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              autoComplete="new-password"
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14,
                border: `1.5px solid ${confirmPw && confirmPw !== newPw ? '#ef4444' : '#e2e8f0'}`,
                borderRadius: 8, outline: 'none', boxSizing: 'border-box', color: '#0f172a',
              }}
            />
            {confirmPw && confirmPw !== newPw && (
              <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>
                Las contraseñas no coinciden
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !currentPw || !newPw || !confirmPw}
            style={{
              marginTop: 8, padding: '12px', background: submitting ? '#94a3b8' : '#ff5e3a',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
              letterSpacing: 0.3,
            }}
          >
            {submitting ? 'Cambiando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
