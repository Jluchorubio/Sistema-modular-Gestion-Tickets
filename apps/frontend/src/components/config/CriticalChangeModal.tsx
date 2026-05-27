'use client';
import { useState } from 'react';
import { ShieldAlert, X, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

interface Props {
  isOpen:    boolean;
  meta:      { entityLabel: string; description?: string } | null;
  onConfirm: (auth: CriticalAuthData) => void;
  onCancel:  () => void;
  error:     string | null;
  loading:   boolean;
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(14,34,53,.55)', backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 10, width: '100%', maxWidth: 440,
  padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.18)',
  display: 'flex', flexDirection: 'column', gap: 16,
};
const input: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
};
const btnBase: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
};

export function CriticalChangeModal({ isOpen, meta, onConfirm, onCancel, error, loading }: Props) {
  const user         = useAuthStore(s => s.user);
  const totpEnabled  = user?.totp_enabled ?? false;

  const [password,  setPassword]  = useState('');
  const [totp,      setTotp]      = useState('');
  const [reason,    setReason]    = useState('');
  const [showPw,    setShowPw]    = useState(false);

  if (!isOpen || !meta) return null;

  const reasonValid = reason.trim().length >= 20;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm({
      password,
      reason:    reason.trim(),
      ...(totpEnabled ? { totp_code: totp } : {}),
    });
  }

  function handleClose() {
    setPassword(''); setTotp(''); setReason(''); setShowPw(false);
    onCancel();
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert size={20} color="#dc2626" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0e2235' }}>
              Confirmar cambio crítico
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {meta.entityLabel}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <X size={18} />
          </button>
        </div>

        {meta.description && (
          <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px' }}>
            {meta.description}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Tu contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ ...input, paddingRight: 36 }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {totpEnabled && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Código 2FA (autenticador)
              </label>
              <input
                type="text"
                value={totp}
                onChange={e => setTotp(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                placeholder="123456"
                required
                style={{ ...input, letterSpacing: '0.2em', fontFamily: 'monospace' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Motivo del cambio
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>
                (mínimo 20 caracteres — {reason.trim().length}/20)
              </span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              required
              style={{ ...input, resize: 'vertical', minHeight: 70 }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleClose}
              style={{ ...btnBase, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0' }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!password || !reasonValid || loading || (totpEnabled && totp.length < 6)}
              style={{ ...btnBase, background: '#dc2626', color: '#fff',
                opacity: (!password || !reasonValid || loading || (totpEnabled && totp.length < 6)) ? 0.5 : 1 }}>
              {loading ? 'Verificando…' : 'Confirmar cambio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
