'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { authService } from '@/services/auth.service';
import type { MfaChallenge, LoginResponse } from '@/types/auth.types';
import { MsgBanner, type Msg } from './MsgBanner';
import styles from '../login.module.css';

const loginSchema = z.object({
  email:    z.string().min(1, 'Campo requerido'),
  password: z.string().min(1, 'Campo requerido'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface Props {
  onOtp:      (token: string) => void;
  onForgot:   () => void;
  onRedirect: (data: LoginResponse) => void;
}

export function LoginForm({ onOtp, onForgot, onRedirect }: Props) {
  const [showPw,  setShowPw]  = useState(false);
  const [msg,     setMsg]     = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setMsg(null);
    setLoading(true);
    try {
      const data = await authService.login(values);
      if ('requires_mfa' in data && data.requires_mfa) {
        onOtp((data as MfaChallenge).otp_token);
        return;
      }
      onRedirect(data as LoginResponse);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      if (body) {
        if ('locked' in body && body.locked) {
          const time = 'locked_until' in body && body.locked_until
            ? ` Intenta de nuevo a las ${new Date(body.locked_until as string).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`
            : '';
          setMsg({ type: 'err', icon: 'lock', text: `${(body as { message?: string }).message ?? 'Cuenta bloqueada temporalmente.'}${time}` });
        } else if ('attempts_remaining' in body && body.attempts_remaining !== undefined) {
          const n = body.attempts_remaining as number;
          setMsg({ type: 'warn', icon: 'warn', text: `${(body as { message?: string }).message ?? 'Credenciales incorrectas.'} Te queda${n !== 1 ? 'n' : ''} <strong>${n}</strong> intento${n !== 1 ? 's' : ''}.` });
        } else {
          setMsg({ type: 'err', text: (body as { message?: string }).message ?? 'Error al iniciar sesión.' });
        }
      } else {
        setMsg({ type: 'err', text: 'Error de red.' });
      }
    } finally {
      setLoading(false);
    }
  }

  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

  function doGoogle() {
    window.location.href = `${API_URL}/api/v1/auth/google`;
  }

  function doMicrosoft() {
    window.location.href = `${API_URL}/api/v1/auth/microsoft`;
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className={styles.loginForm}>
      <label className={styles.label}>ID de Operador / Correo</label>
      <input
        {...form.register('email')}
        type="text"
        autoComplete="username"
        placeholder="example@gmail.com"
        className={styles.input}
      />

      <div className={styles.passwordLabelRow}>
        <label className={styles.label}>Contraseña de Dominio</label>
        <button type="button" className={styles.linkBtn} onClick={onForgot}>
          ¿Olvidaste tu contraseña?
        </button>
      </div>
      <div className={styles.pwWrap}>
        <input
          {...form.register('password')}
          type={showPw ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          className={styles.input}
        />
        <button
          type="button"
          className={styles.pwToggle}
          onClick={() => setShowPw((v) => !v)}
          title="Mostrar/ocultar contraseña"
        >
          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      <MsgBanner msg={msg} />

      <button
        type="submit"
        className={`${styles.btn} ${styles.btnPrimary}`}
        disabled={loading}
      >
        {loading ? 'Iniciando sesión...' : 'Login'}
      </button>

      <div className={styles.divider}>O ingresar con</div>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnGoogle}`}
        onClick={doGoogle}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.1-2.7-.4-3.9z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 19 12 24 12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.2 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.3 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.5l6.2 5.2C36.9 36.3 44 31 44 24c0-1.3-.1-2.7-.4-3.9z" />
        </svg>
        Login con Google
      </button>

      <button
        type="button"
        className={`${styles.btn} ${styles.btnMicrosoft}`}
        onClick={doMicrosoft}
      >
        <svg width="18" height="18" viewBox="0 0 21 21" fill="none" aria-hidden="true">
          <rect x="1"  y="1"  width="9" height="9" fill="#F25022" />
          <rect x="11" y="1"  width="9" height="9" fill="#7FBA00" />
          <rect x="1"  y="11" width="9" height="9" fill="#00A4EF" />
          <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
        Login con Microsoft Azure AD
      </button>
    </form>
  );
}
