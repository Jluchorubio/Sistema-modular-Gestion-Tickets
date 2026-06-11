'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck, ShieldOff, Monitor, Smartphone, Globe, Wifi, WifiOff, X } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { authService } from '@/services/auth.service';
import { fmtDate, fmtRelative, type ProfileUser } from './profile.types';
import dynamic from 'next/dynamic';

const MiniMap = dynamic(() => import('./MiniMap').then(m => ({ default: m.MiniMap })), { ssr: false });
import styles from './profile.module.css';

function parseUA(ua: string | null): { browser: string; os: string; isMobile: boolean } {
  if (!ua) return { browser: 'Navegador desconocido', os: 'SO desconocido', isMobile: false };
  let browser = 'Otro';
  if (/Edg\//i.test(ua))          browser = 'Edge';
  else if (/OPR\//i.test(ua))     browser = 'Opera';
  else if (/Chrome\//i.test(ua))  browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua))  browser = 'Safari';
  let os = 'Otro';
  if (/Windows NT/i.test(ua))        os = 'Windows';
  else if (/Macintosh/i.test(ua))    os = 'macOS';
  else if (/Android/i.test(ua))      os = 'Android';
  else if (/iPhone|iPad/i.test(ua))  os = 'iOS';
  else if (/Linux/i.test(ua))        os = 'Linux';
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  return { browser, os, isMobile };
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return '🌐';
  return code.toUpperCase().replace(/./g, (c) =>
    String.fromCodePoint(127397 + c.charCodeAt(0)),
  );
}

const pwdSchema = z.object({
  current: z.string().min(1, 'Requerido'),
  newPwd:  z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
    .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
    .regex(/[0-9]/, 'Debe incluir al menos un número'),
  confirm: z.string(),
}).refine(d => d.newPwd === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path:    ['confirm'],
});
type PwdForm = z.infer<typeof pwdSchema>;

interface Props {
  user:          ProfileUser;
  isOwnProfile:  boolean;
  onTotpToggled: (enabled: boolean) => void;
}

export function ProfileSecurityTab({ user, isOwnProfile, onTotpToggled }: Props) {
  const qc = useQueryClient();

  const { data: sessionsData } = useQuery({
    queryKey:  ['my-sessions'],
    queryFn:   () => usersService.getMySessions(),
    enabled:   isOwnProfile,
    staleTime: 30_000,
  });

  const sessions   = sessionsData?.sessions  ?? [];
  const isOnline   = sessionsData?.is_online ?? false;
  const lastSeenAt = sessionsData?.last_seen_at ?? null;

  const terminateMut = useMutation({
    mutationFn: (id: string) => authService.terminateSession(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['my-sessions'] }),
  });
  const [terminatingId, setTerminatingId] = useState<string | null>(null);

  // ── Password change ───────────────────────────────────────────────────────────
  const [showPwd,     setShowPwd]     = useState({ current: false, newPwd: false, confirm: false });
  const [pwdMsg,      setPwdMsg]      = useState<{ ok: boolean; text: string } | null>(null);

  const { register: regPwd, handleSubmit: submitPwd, reset: resetPwd, watch: watchPwd,
    formState: { errors: pwdErr, isSubmitting: pwdPending } } =
    useForm<PwdForm>({ resolver: zodResolver(pwdSchema) });

  const newPwdVal = watchPwd('newPwd', '');

  const pwdReqs = [
    { label: 'Al menos 8 caracteres', ok: newPwdVal.length >= 8 },
    { label: 'Una mayúscula',          ok: /[A-Z]/.test(newPwdVal) },
    { label: 'Una minúscula',          ok: /[a-z]/.test(newPwdVal) },
    { label: 'Un número',              ok: /[0-9]/.test(newPwdVal) },
  ];
  const pwdStrength = pwdReqs.filter(r => r.ok).length;

  const pwdColors = ['#D8E0EA', '#EF4444', '#F59E0B', '#22C55E', '#16A34A'];
  const pwdLabels = ['', 'Débil', 'Regular', 'Buena', 'Excelente'];

  const changePasswordMut = useMutation({
    mutationFn: ({ current, newPwd }: PwdForm) => usersService.changeMyPassword(current, newPwd),
    onSuccess: () => {
      setPwdMsg({ ok: true, text: 'Contraseña actualizada correctamente' });
      resetPwd();
    },
    onError: (e: Error) => setPwdMsg({ ok: false, text: e.message ?? 'Error al cambiar contraseña' }),
  });

  // ── Email OTP 2FA toggle ──────────────────────────────────────────────────────
  const [otpEnabled,   setOtpEnabled]   = useState(user.otp_enabled ?? true);
  const [disableStep,  setDisableStep]  = useState<'idle' | 'confirm'>('idle');
  const [disablePwd,   setDisablePwd]   = useState('');
  const [showDisPwd,   setShowDisPwd]   = useState(false);
  const [otpMsg,       setOtpMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const enableOtpMut = useMutation({
    mutationFn: () => authService.setOtpSetting(true),
    onSuccess: () => {
      setOtpEnabled(true);
      setOtpMsg({ ok: true, text: '2FA activado. Tu próximo inicio de sesión requerirá verificación por email.' });
      onTotpToggled(true);
    },
    onError: () => setOtpMsg({ ok: false, text: 'Error al activar 2FA. Intenta de nuevo.' }),
  });

  const disableOtpMut = useMutation({
    mutationFn: async (pwd: string) => {
      await authService.verifyCredentials(pwd);
      await authService.setOtpSetting(false);
    },
    onSuccess: () => {
      setOtpEnabled(false);
      setDisableStep('idle');
      setDisablePwd('');
      setOtpMsg({ ok: true, text: '2FA desactivado. El inicio de sesión ya no requerirá verificación por email.' });
      onTotpToggled(false);
    },
    onError: (e: Error) => setOtpMsg({ ok: false, text: e.message?.includes('ncorrecta') ? 'Contraseña incorrecta.' : (e.message ?? 'Error al desactivar 2FA') }),
  });

  function cancelDisable() {
    setDisableStep('idle');
    setDisablePwd('');
    setShowDisPwd(false);
    setOtpMsg(null);
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
            {newPwdVal.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '6px 0 10px' }}>
                {pwdReqs.map((r) => (
                  <span key={r.label} style={{ fontSize: 11, color: r.ok ? '#22c55e' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontWeight: 700 }}>{r.ok ? '✓' : '○'}</span> {r.label}
                  </span>
                ))}
              </div>
            )}
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

      {/* ── 2FA via email OTP ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Autenticación de dos factores (2FA)</p>
          <span className={`${styles.badge} ${otpEnabled ? styles.badgeGreen : styles.badgeYellow}`}>
            {otpEnabled ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <div style={{ padding: '16px 22px 20px' }}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.6 }}>
            {otpEnabled
              ? 'Tu cuenta está protegida con verificación en dos pasos. Al iniciar sesión recibirás un código de 6 dígitos en tu correo electrónico.'
              : 'La verificación en dos pasos está desactivada. Actívala para recibir un código de verificación por email cada vez que inicies sesión.'}
          </p>

          {otpMsg && (
            <p className={otpMsg.ok ? styles.msgOk : styles.msgErr} style={{ marginBottom: 14 }}>
              {otpMsg.text}
            </p>
          )}

          {/* ── Idle — show toggle button ── */}
          {disableStep === 'idle' && (
            <>
              {otpEnabled ? (
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', background: '#FEF2F2', color: '#B91C1C',
                    border: '1px solid #FECACA', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onClick={() => { setDisableStep('confirm'); setOtpMsg(null); }}
                >
                  <ShieldOff size={15} /> Desactivar 2FA
                </button>
              ) : (
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', background: '#F0FDF4', color: '#15803D',
                    border: '1px solid #BBF7D0', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  disabled={enableOtpMut.isPending}
                  onClick={() => { setOtpMsg(null); enableOtpMut.mutate(); }}
                >
                  <ShieldCheck size={15} />
                  {enableOtpMut.isPending ? 'Activando…' : 'Activar 2FA'}
                </button>
              )}
            </>
          )}

          {/* ── Confirm disable — require password ── */}
          {disableStep === 'confirm' && (
            <div>
              <p style={{ fontSize: 13, color: '#475569', marginBottom: 12, lineHeight: 1.5 }}>
                Ingresa tu contraseña actual para confirmar la desactivación del 2FA.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <div className={styles.pwdWrap} style={{ flex: 1, minWidth: 200 }}>
                  <input
                    className={styles.formInput}
                    type={showDisPwd ? 'text' : 'password'}
                    placeholder="Contraseña actual"
                    autoFocus
                    value={disablePwd}
                    onChange={e => { setDisablePwd(e.target.value); setOtpMsg(null); }}
                    onKeyDown={e => { if (e.key === 'Enter' && disablePwd) disableOtpMut.mutate(disablePwd); }}
                  />
                  <button
                    type="button"
                    className={styles.pwdEye}
                    onClick={() => setShowDisPwd(p => !p)}
                  >
                    {showDisPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  style={{
                    padding: '10px 16px', background: '#B91C1C', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                    opacity: (!disablePwd || disableOtpMut.isPending) ? 0.6 : 1,
                  }}
                  disabled={!disablePwd || disableOtpMut.isPending}
                  onClick={() => disableOtpMut.mutate(disablePwd)}
                >
                  {disableOtpMut.isPending ? 'Verificando…' : 'Confirmar desactivación'}
                </button>
                <button
                  type="button"
                  onClick={cancelDisable}
                  style={{
                    padding: '10px 16px', background: 'none', border: '1px solid #E2E8F0',
                    borderRadius: 8, fontSize: 13, color: '#64748B', cursor: 'pointer',
                    fontFamily: 'inherit', flexShrink: 0,
                  }}
                >
                  Cancelar
                </button>
              </div>
              {otpMsg && (
                <p className={otpMsg.ok ? styles.msgOk : styles.msgErr}>{otpMsg.text}</p>
              )}
            </div>
          )}

          <div style={{
            marginTop: 20, padding: '12px 14px', background: '#F8FAFC',
            border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#64748B', lineHeight: 1.6,
          }}>
            <strong style={{ color: '#0F172A' }}>¿Cómo funciona?</strong><br />
            Cuando está activo, después de ingresar tu contraseña recibirás un código de 6 dígitos
            en <strong>{user.email}</strong>. El código expira en 10 minutos y solo puede usarse una vez.
          </div>
        </div>
      </div>

      {/* ── Session history ── */}
      <div className={styles.card} style={{ marginBottom: 22, overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p className={styles.sectionTitle}>Sesiones activas</p>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: isOnline ? '#F0FDF4' : '#F8FAFC',
                color:      isOnline ? '#15803D' : '#64748B',
                border:     `1px solid ${isOnline ? '#BBF7D0' : '#E2E8F0'}`,
              }}
            >
              {isOnline
                ? <><Wifi size={10} /> En línea</>
                : <><WifiOff size={10} /> {lastSeenAt ? `Última vez ${fmtRelative(lastSeenAt)}` : 'Sin actividad'}</>
              }
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#94A3B8' }}>Últimas 20</span>
        </div>

        <div className={styles.securityItem}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
            <div>
              <p className={styles.securityLabel}>Cuenta creada</p>
              <p className={styles.securitySub}>{fmtDate(user.created_at)}</p>
            </div>
          </div>
        </div>

        {sessions.length === 0 && (
          <div style={{ padding: '20px 22px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
            Sin sesiones registradas.
          </div>
        )}

        {sessions.map((s) => {
          const { browser, os, isMobile } = parseUA(s.user_agent);
          const isActive    = s.is_active;
          const isClosed    = !!s.ended_at;
          const statusLabel = isActive ? 'Activa' : isClosed ? 'Cerrada' : 'Expirada';
          const statusCls   = isActive ? styles.badgeGreen : styles.badgeGray;
          const hasGeo      = s.geo_lat != null && s.geo_lon != null;
          const isTerminating = terminatingId === s.id && terminateMut.isPending;

          return (
            <div key={s.id} style={{ borderTop: '1px solid #F1F5F9', padding: '14px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Device icon */}
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: isActive ? '#EFF6FF' : '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isMobile
                    ? <Smartphone size={16} style={{ color: isActive ? '#3B82F6' : '#94A3B8' }} />
                    : <Monitor    size={16} style={{ color: isActive ? '#3B82F6' : '#94A3B8' }} />
                  }
                </div>

                {/* Session info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <p className={styles.securityLabel} style={{ fontWeight: 600, margin: 0 }}>
                      {browser} · {os}
                    </p>
                    <span className={`${styles.badge} ${statusCls}`} style={{ fontSize: 10 }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Location line */}
                  {(s.geo_city || s.geo_country) && (
                    <p className={styles.securitySub} style={{ margin: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13 }}>{countryFlag(s.geo_country_code)}</span>
                      {s.geo_city && s.geo_country
                        ? `${s.geo_city}, ${s.geo_country}`
                        : (s.geo_country ?? s.geo_city)}
                    </p>
                  )}

                  <p className={styles.securitySub} style={{ margin: '4px 0 0' }}>
                    Inicio: {fmtRelative(s.created_at)}
                    {isClosed && ` · Cerrada: ${fmtRelative(s.ended_at)}`}
                    {!isClosed && !isActive && ` · Expiró: ${fmtDate(s.expires_at)}`}
                  </p>
                </div>

                {/* Terminate button */}
                {isActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerminatingId(s.id);
                      terminateMut.mutate(s.id, { onSettled: () => setTerminatingId(null) });
                    }}
                    disabled={isTerminating}
                    title="Cerrar esta sesión"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: 6,
                      background: 'none', border: '1px solid #FECACA',
                      color: '#EF4444', cursor: isTerminating ? 'not-allowed' : 'pointer',
                      opacity: isTerminating ? 0.5 : 1, flexShrink: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Mini map */}
              {hasGeo && (
                <div style={{ marginTop: 10, marginLeft: 46 }}>
                  <MiniMap lat={s.geo_lat!} lon={s.geo_lon!} city={s.geo_city} country={s.geo_country} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
