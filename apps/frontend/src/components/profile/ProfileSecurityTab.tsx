'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck, ShieldOff, Smartphone, Copy, Check } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { authService } from '@/services/auth.service';
import { fmtDate, fmtRelative, type ProfileUser } from './profile.types';
import styles from './profile.module.css';

const pwdSchema = z.object({
  current: z.string().min(1, 'Requerido'),
  newPwd:  z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string(),
}).refine(d => d.newPwd === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path:    ['confirm'],
});
type PwdForm = z.infer<typeof pwdSchema>;

type TotpStep =
  | 'idle'       // show activate / deactivate button
  | 'scanning'   // QR code visible, waiting for user to scan
  | 'verifying'  // code input to confirm activation
  | 'disabling'; // code input to confirm deactivation

interface Props {
  user:          ProfileUser;
  onTotpToggled: (enabled: boolean) => void;
}

export function ProfileSecurityTab({ user, onTotpToggled }: Props) {
  const [showPwd,     setShowPwd]     = useState({ current: false, newPwd: false, confirm: false });
  const [pwdStrength, setPwdStrength] = useState(0);
  const [pwdMsg,      setPwdMsg]      = useState<{ ok: boolean; text: string } | null>(null);

  // TOTP state
  const [totpStep,    setTotpStep]    = useState<TotpStep>('idle');
  const [qrDataUrl,   setQrDataUrl]   = useState<string | null>(null);
  const [totpSecret,  setTotpSecret]  = useState<string | null>(null);
  const [totpCode,    setTotpCode]    = useState('');
  const [totpMsg,     setTotpMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [secretCopied,setSecretCopied]= useState(false);

  const { register: regPwd, handleSubmit: submitPwd, reset: resetPwd, watch: watchPwd,
    formState: { errors: pwdErr, isSubmitting: pwdPending } } =
    useForm<PwdForm>({ resolver: zodResolver(pwdSchema) });

  const newPwdVal = watchPwd('newPwd', '');

  useEffect(() => {
    let score = 0;
    if (newPwdVal.length >= 8)          score++;
    if (/[A-Z]/.test(newPwdVal))        score++;
    if (/[0-9]/.test(newPwdVal))        score++;
    if (/[^a-zA-Z0-9]/.test(newPwdVal)) score++;
    setPwdStrength(score);
  }, [newPwdVal]);

  const pwdColors = ['#D8E0EA', '#EF4444', '#F59E0B', '#22C55E', '#16A34A'];
  const pwdLabels = ['', 'Débil', 'Regular', 'Buena', 'Excelente'];

  const changePasswordMut = useMutation({
    mutationFn: ({ current, newPwd }: PwdForm) => usersService.changeMyPassword(current, newPwd),
    onSuccess: () => {
      setPwdMsg({ ok: true, text: 'Contraseña actualizada correctamente' });
      resetPwd();
      setPwdStrength(0);
    },
    onError: (e: Error) => setPwdMsg({ ok: false, text: e.message ?? 'Error al cambiar contraseña' }),
  });

  const setupTotpMut = useMutation({
    mutationFn: () => authService.setupTotp(),
    onSuccess: ({ qr, secret }) => {
      setQrDataUrl(qr);
      setTotpSecret(secret);
      setTotpStep('scanning');
      setTotpMsg(null);
      setTotpCode('');
    },
    onError: () => setTotpMsg({ ok: false, text: 'Error al generar el código QR' }),
  });

  const enableTotpMut = useMutation({
    mutationFn: (code: string) => authService.enableTotp(code),
    onSuccess: () => {
      setTotpMsg({ ok: true, text: '2FA activado correctamente' });
      setTotpStep('idle');
      setTotpCode('');
      setQrDataUrl(null);
      setTotpSecret(null);
      onTotpToggled(true);
    },
    onError: () => setTotpMsg({ ok: false, text: 'Código incorrecto. Verifica tu aplicación.' }),
  });

  const disableTotpMut = useMutation({
    mutationFn: (code: string) => authService.disableTotp(code),
    onSuccess: () => {
      setTotpMsg({ ok: true, text: '2FA desactivado' });
      setTotpStep('idle');
      setTotpCode('');
      onTotpToggled(false);
    },
    onError: () => setTotpMsg({ ok: false, text: 'Código incorrecto. Verifica tu aplicación.' }),
  });

  function handleTotpCodeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(val);
    setTotpMsg(null);
  }

  function cancelTotp() {
    setTotpStep('idle');
    setTotpCode('');
    setQrDataUrl(null);
    setTotpSecret(null);
    setTotpMsg(null);
  }

  function copySecret() {
    if (!totpSecret) return;
    navigator.clipboard.writeText(totpSecret).then(() => {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    });
  }

  return (
    <>
      {/* ── Change password ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Cambiar contraseña</p>
        </div>
        <div style={{ padding: 22 }}>
          <form onSubmit={submitPwd(data => { setPwdMsg(null); changePasswordMut.mutate(data); })}>
            {([
              ['current', 'Contraseña actual'],
              ['newPwd',  'Nueva contraseña'],
              ['confirm', 'Confirmar contraseña'],
            ] as [keyof PwdForm, string][]).map(([field, label]) => (
              <div key={field} className={styles.formGroup}>
                <label className={styles.formLabel}>{label}</label>
                <div className={styles.pwdWrap}>
                  <input
                    className={styles.formInput}
                    type={showPwd[field] ? 'text' : 'password'}
                    placeholder={field === 'newPwd' ? 'Mínimo 8 caracteres' : ''}
                    {...regPwd(field)}
                  />
                  <button
                    type="button"
                    className={styles.pwdEye}
                    onClick={() => setShowPwd(p => ({ ...p, [field]: !p[field] }))}
                  >
                    {showPwd[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwdErr[field] && <span className={styles.fieldError}>{pwdErr[field]?.message}</span>}
              </div>
            ))}
            <div className={styles.pwdStrengthBar}>
              <div
                className={styles.pwdStrengthFill}
                style={{ width: `${pwdStrength * 25}%`, background: pwdColors[pwdStrength] ?? '#D8E0EA' }}
              />
            </div>
            <p style={{ fontSize: 11, color: '#64748B', marginBottom: 18 }}>{pwdLabels[pwdStrength]}</p>
            {pwdMsg && <p className={pwdMsg.ok ? styles.msgOk : styles.msgErr}>{pwdMsg.text}</p>}
            <button
              type="submit"
              className={styles.btnPrimary}
              style={{ width: '100%', marginTop: 4 }}
              disabled={pwdPending || changePasswordMut.isPending}
            >
              Actualizar contraseña
            </button>
            <p style={{ fontSize: 12, color: '#64748B', marginTop: 12 }}>
              Al cambiar la contraseña se cerrarán todas las sesiones activas.
            </p>
          </form>
        </div>
      </div>

      {/* ── 2FA / TOTP ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Autenticación de dos factores (2FA)</p>
          <span className={`${styles.badge} ${user.totp_enabled ? styles.badgeGreen : styles.badgeYellow}`}>
            {user.totp_enabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div style={{ padding: '16px 22px 20px' }}>

          {/* ── Idle: show status + action button ── */}
          {totpStep === 'idle' && (
            <>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                {user.totp_enabled
                  ? 'Tu cuenta está protegida con TOTP. Usa tu aplicación de autenticación para generar códigos de 6 dígitos.'
                  : 'Protege tu cuenta con Google Authenticator, Authy u otra aplicación TOTP. Recibirás un código de 6 dígitos cada 30 segundos.'}
              </p>
              {totpMsg && (
                <p className={totpMsg.ok ? styles.msgOk : styles.msgErr} style={{ marginBottom: 12 }}>
                  {totpMsg.text}
                </p>
              )}
              {user.totp_enabled ? (
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', background: '#FEF2F2', color: '#B91C1C',
                    border: '1px solid #FECACA', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onClick={() => { setTotpStep('disabling'); setTotpMsg(null); setTotpCode(''); }}
                >
                  <ShieldOff size={15} /> Desactivar 2FA
                </button>
              ) : (
                <button
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', background: '#F0FDF4', color: '#15803D',
                    border: '1px solid #BBF7D0', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  disabled={setupTotpMut.isPending}
                  onClick={() => setupTotpMut.mutate()}
                >
                  <ShieldCheck size={15} />
                  {setupTotpMut.isPending ? 'Generando QR…' : 'Activar 2FA'}
                </button>
              )}
            </>
          )}

          {/* ── Scanning: show QR code ── */}
          {totpStep === 'scanning' && qrDataUrl && (
            <div>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                <strong>Paso 1:</strong> Abre Google Authenticator, Authy u otra aplicación TOTP
                y escanea el código QR.
              </p>

              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
                <div style={{
                  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
                  padding: 12, display: 'inline-block',
                }}>
                  <img src={qrDataUrl} alt="QR 2FA" style={{ width: 160, height: 160, display: 'block' }} />
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
                    ¿No puedes escanear? Introduce este código manualmente:
                  </p>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#F8FAFC', border: '1px solid #E2E8F0',
                    borderRadius: 8, padding: '8px 12px',
                  }}>
                    <Smartphone size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                    <code style={{ fontSize: 12, color: '#0F172A', letterSpacing: 2, flex: 1, wordBreak: 'break-all' }}>
                      {totpSecret}
                    </code>
                    <button
                      type="button"
                      onClick={copySecret}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366F1', padding: 2 }}
                      title="Copiar"
                    >
                      {secretCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
                <strong>Paso 2:</strong> Introduce el código de 6 dígitos que muestra tu app para confirmar.
              </p>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={totpCode}
                  onChange={handleTotpCodeInput}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  style={{
                    width: 130, padding: '10px 14px', fontSize: 22, letterSpacing: 6,
                    textAlign: 'center', border: '1px solid #E2E8F0', borderRadius: 8,
                    fontFamily: 'monospace', outline: 'none', background: '#fff',
                  }}
                />
                <button
                  className={styles.btnPrimary}
                  style={{ padding: '10px 20px' }}
                  disabled={totpCode.length < 6 || enableTotpMut.isPending}
                  onClick={() => enableTotpMut.mutate(totpCode)}
                >
                  {enableTotpMut.isPending ? 'Verificando…' : 'Confirmar y activar'}
                </button>
                <button
                  type="button"
                  onClick={cancelTotp}
                  style={{
                    padding: '10px 16px', background: 'none', border: '1px solid #E2E8F0',
                    borderRadius: 8, fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancelar
                </button>
              </div>
              {totpMsg && (
                <p className={totpMsg.ok ? styles.msgOk : styles.msgErr} style={{ marginTop: 10 }}>
                  {totpMsg.text}
                </p>
              )}
            </div>
          )}

          {/* ── Disabling: verify code before disabling ── */}
          {totpStep === 'disabling' && (
            <div>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                Introduce el código de tu aplicación para <strong>confirmar la desactivación</strong> del 2FA.
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={totpCode}
                  onChange={handleTotpCodeInput}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoFocus
                  style={{
                    width: 130, padding: '10px 14px', fontSize: 22, letterSpacing: 6,
                    textAlign: 'center', border: '1px solid #E2E8F0', borderRadius: 8,
                    fontFamily: 'monospace', outline: 'none', background: '#fff',
                  }}
                />
                <button
                  style={{
                    padding: '10px 20px', background: '#B91C1C', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  disabled={totpCode.length < 6 || disableTotpMut.isPending}
                  onClick={() => disableTotpMut.mutate(totpCode)}
                >
                  {disableTotpMut.isPending ? 'Verificando…' : 'Confirmar desactivación'}
                </button>
                <button
                  type="button"
                  onClick={cancelTotp}
                  style={{
                    padding: '10px 16px', background: 'none', border: '1px solid #E2E8F0',
                    borderRadius: 8, fontSize: 13, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancelar
                </button>
              </div>
              {totpMsg && (
                <p className={totpMsg.ok ? styles.msgOk : styles.msgErr} style={{ marginTop: 10 }}>
                  {totpMsg.text}
                </p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Session info ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Información de sesión</p>
        </div>
        <div className={styles.securityItem}>
          <div>
            <p className={styles.securityLabel}>Último inicio de sesión</p>
            <p className={styles.securitySub}>{fmtRelative(user.last_login_at)}</p>
          </div>
        </div>
        <div className={styles.securityItem}>
          <div>
            <p className={styles.securityLabel}>Cuenta creada</p>
            <p className={styles.securitySub}>{fmtDate(user.created_at)}</p>
          </div>
        </div>
      </div>
    </>
  );
}
