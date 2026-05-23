'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AlertTriangle, Lock, Mail } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { OtpInput } from '@/components/auth/OtpInput';
import type { LockoutInfo, LoginResponse } from '@/types/auth.types';
import { MsgBanner, type Msg } from './MsgBanner';
import styles from '../login.module.css';

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `Código válido por: ${m}:${s}`;
}

interface Props {
  otpToken:  string;
  onBack:    () => void;
  onSuccess: (data: LoginResponse) => void;
}

export function OtpForm({ otpToken: initialToken, onBack, onSuccess }: Props) {
  const [otpToken,      setOtpToken]      = useState(initialToken);
  const [otpDigits,     setOtpDigits]     = useState(['', '', '', '', '', '']);
  const [msg,           setMsg]           = useState<Msg | null>(null);
  const [countdown,     setCountdown]     = useState(600);
  const [resendCooldown,setResendCooldown]= useState(60);
  const [attemptsLeft,  setAttemptsLeft]  = useState(3);
  const [lockout,       setLockout]       = useState<LockoutInfo | null>(null);
  const [loading,       setLoading]       = useState(false);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const resendRef    = useRef<NodeJS.Timeout | null>(null);

  const startCountdown = useCallback((seconds = 600) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startResendCooldown = useCallback((seconds = 60) => {
    if (resendRef.current) clearInterval(resendRef.current);
    setResendCooldown(seconds);
    resendRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(resendRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startCountdown(600);
    startResendCooldown(60);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (resendRef.current)    clearInterval(resendRef.current);
    };
  }, [startCountdown, startResendCooldown]);

  async function onVerify() {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setMsg({ type: 'err', text: 'Ingresa el código completo de 6 dígitos.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const data = await authService.verifyOtp(code, otpToken);
      if (countdownRef.current) clearInterval(countdownRef.current);
      onSuccess(data as LoginResponse);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (body) {
        if ('locked' in body && body.locked) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setLockout(body as unknown as LockoutInfo);
          setMsg(null);
          return;
        }
        if ('attempts_remaining' in body) setAttemptsLeft(body.attempts_remaining as number);
        setMsg({ type: 'err', text: (body as { message?: string }).message ?? 'Código inválido o expirado.' });
      } else {
        setMsg({ type: 'err', text: 'Error de red.' });
      }
      setOtpDigits(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setMsg(null);
    try {
      const data = await authService.resendOtp(otpToken);
      setOtpToken(data.otp_token);
      setAttemptsLeft(3);
      setLockout(null);
      setOtpDigits(['', '', '', '', '', '']);
      setMsg({ type: 'ok', icon: 'check', text: 'Código reenviado a tu correo.' });
      startCountdown(600);
      startResendCooldown(60);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (body && 'locked' in body && body.locked) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setLockout(body as unknown as LockoutInfo);
      } else {
        setMsg({ type: 'err', text: (body as { message?: string })?.message ?? 'Error al reenviar.' });
      }
    }
  }

  return (
    <div>
      <span className={`${styles.tag} ${styles.tagOtp}`}>
        <Mail size={11} />
        Verificación por email
      </span>
      <p className={styles.sectionDesc}>Te enviamos un código de 6 dígitos a tu correo.</p>

      {countdown > 0
        ? <p className={`${styles.otpCountdown} ${countdown <= 60 ? styles.otpCountdownExpiring : ''}`}>{formatCountdown(countdown)}</p>
        : <p className={`${styles.otpCountdown} ${styles.otpCountdownExpiring}`}>Código expirado. Solicita uno nuevo.</p>
      }

      <OtpInput
        value={otpDigits}
        onChange={setOtpDigits}
        onComplete={onVerify}
        wrapClassName={styles.otpWrap}
        digitClassName={styles.otpDigit}
        disabled={loading || countdown === 0 || !!lockout}
      />

      {attemptsLeft < 3 && !lockout && (
        <div className={`${styles.msg} ${styles.msgWarn}`}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>Te queda{attemptsLeft !== 1 ? 'n' : ''} <strong>{attemptsLeft}</strong> intento{attemptsLeft !== 1 ? 's' : ''}</span>
        </div>
      )}

      {lockout && (
        <div className={`${styles.msg} ${styles.msgErr}`}>
          <Lock size={14} style={{ flexShrink: 0 }} />
          <span>
            Cuenta bloqueada temporalmente
            {lockout.locked_until
              ? ` hasta las ${new Date(lockout.locked_until).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
            . Demasiados intentos fallidos.
          </span>
        </div>
      )}

      <MsgBanner msg={msg} />

      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onVerify} disabled={loading || countdown === 0 || !!lockout}>
        {loading ? 'Verificando...' : 'Verificar código'}
      </button>
      <button type="button" className={`${styles.btn} ${styles.btnResend}`} onClick={onResend} disabled={resendCooldown > 0 || !!lockout}>
        {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : 'Reenviar código'}
      </button>
      <button type="button" className={`${styles.btn} ${styles.btnBack}`} onClick={onBack}>
        ← Volver al inicio
      </button>
    </div>
  );
}
