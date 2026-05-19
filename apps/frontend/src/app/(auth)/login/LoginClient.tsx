'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';
import type { LoginResponse } from '@/types/auth.types';
import { LoginForm } from './_components/LoginForm';
import { OtpForm } from './_components/OtpForm';
import { ForgotForm } from './_components/ForgotForm';
import { ResetForm } from './_components/ResetForm';
import styles from './login.module.css';

type AuthView = 'login' | 'otp' | 'forgot' | 'reset' | 'error' | 'pw_changed';

const TITLES: Record<AuthView, string> = {
  login:      '¡Bienvenido de vuelta!',
  otp:        'Verificación en dos pasos',
  forgot:     'Recuperar acceso',
  reset:      'Nueva contraseña',
  error:      'Algo salió mal',
  pw_changed: '¡Contraseña actualizada!',
};

const SUBS: Record<AuthView, string> = {
  login:      'Inicia sesión para continuar',
  otp:        'Código enviado a tu correo',
  forgot:     'Te enviaremos un enlace de recuperación',
  reset:      'Elige una contraseña segura',
  error:      'Ocurrió un error inesperado',
  pw_changed: 'Inicia sesión con tu nueva contraseña',
};

function handleAuthRedirect(data: LoginResponse, push: (href: string) => void) {
  const { access_token, refresh_token, user } = data;
  const needsProfile = !user.profile_complete && !user.is_superadmin;
  useAuthStore.getState().setTokens(access_token, refresh_token, user.force_password_change, needsProfile);
  push(!user.profile_complete && !user.is_superadmin
    ? ROUTES.AUTH.COMPLETE_PROFILE
    : ROUTES.APP.DASHBOARD,
  );
}

/* ── Right panel (static branding) ─────────────────────────────────────────── */

function RightPanel() {
  return (
    <div className={styles.right}>
      <div className={styles.logoWrap}>
        <div className={styles.logoCircle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" className={styles.logoImg} />
        </div>
      </div>

      <div className={styles.rightContent}>
        <p className={styles.rightSub}>Sistema Modular</p>
        <h2 className={styles.rightTitle}>Gestión operativa centralizada</h2>
        <p className={styles.rightDesc}>
          Tickets, inventario, solicitudes y reportes en una sola plataforma.
        </p>
      </div>

      {/* Decorative dots */}
      <div className={styles.dots}>
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className={styles.dot} />
        ))}
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */

export function LoginClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [view,       setView]       = useState<AuthView>('login');
  const [otpToken,   setOtpToken]   = useState('');
  const [resetToken, setResetToken] = useState('');
  const [errorData,  setErrorData]  = useState('');

  useEffect(() => {
    const rt    = searchParams.get('reset_token');
    const err   = searchParams.get('error');
    const pwChg = searchParams.get('pw_changed');
    if (rt) {
      setResetToken(rt);
      window.history.replaceState(null, '', window.location.pathname);
      setView('reset');
    } else if (err) {
      setErrorData(decodeURIComponent(err));
      window.history.replaceState(null, '', window.location.pathname);
      setView('error');
    } else {
      setView(pwChg === '1' ? 'pw_changed' : 'login');
      if (pwChg === '1') window.history.replaceState(null, '', window.location.pathname);
      if (!pwChg && tokens.getAccess()) router.replace(ROUTES.APP.DASHBOARD);
    }
  }, [searchParams, router]);

  const redirect = (data: LoginResponse) =>
    handleAuthRedirect(data, (href) => router.push(href));

  return (
    <div className={styles.root}>
      {/* ── Left: form ── */}
      <div className={styles.left}>
        <div className={styles.formWrap}>
          {/* Brand */}
          <div className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" className={styles.brandLogo} />
            <span className={styles.brandName}>Tickets System</span>
          </div>

          {/* Heading */}
          <div className={styles.heading}>
            <h1 className={styles.title}>{TITLES[view]}</h1>
            <p className={styles.sub}>{SUBS[view]}</p>
          </div>

          {/* Views */}
          {view === 'login' && (
            <LoginForm
              onOtp={(t) => { setOtpToken(t); setView('otp'); }}
              onForgot={() => setView('forgot')}
              onRedirect={redirect}
            />
          )}
          {view === 'otp' && (
            <OtpForm
              otpToken={otpToken}
              onBack={() => setView('login')}
              onSuccess={redirect}
            />
          )}
          {view === 'forgot' && (
            <ForgotForm onBack={() => setView('login')} />
          )}
          {view === 'reset' && (
            <ResetForm
              resetToken={resetToken}
              onSuccess={() => router.push(ROUTES.AUTH.LOGIN)}
            />
          )}
          {view === 'pw_changed' && (
            <div>
              <p className={`${styles.msg} ${styles.msgOk}`} style={{ marginBottom: 20 }}>
                Contraseña actualizada. Inicia sesión con tu nueva contraseña.
              </p>
              <LoginForm
                onOtp={(t) => { setOtpToken(t); setView('otp'); }}
                onForgot={() => setView('forgot')}
                onRedirect={redirect}
              />
            </div>
          )}
          {view === 'error' && (
            <div>
              <span className={`${styles.tag} ${styles.tagErr}`}>
                <X size={11} /> Error
              </span>
              <pre className={styles.pre}>{errorData}</pre>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => setView('login')}
              >
                ← Volver al login
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: branding ── */}
      <RightPanel />
    </div>
  );
}
