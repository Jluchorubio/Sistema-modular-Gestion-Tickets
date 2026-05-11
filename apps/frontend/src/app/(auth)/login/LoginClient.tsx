'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Ticket, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';
import type { LoginResponse } from '@/types/auth.types';
import { LoginForm } from './_components/LoginForm';
import { OtpForm } from './_components/OtpForm';
import { ForgotForm } from './_components/ForgotForm';
import { ResetForm } from './_components/ResetForm';
import styles from './login.module.css';

type AuthView = 'login' | 'otp' | 'forgot' | 'reset' | 'error';

const SUBTITLES: Record<AuthView, string> = {
  login:  'Inicia sesión para continuar',
  otp:    'Código enviado a tu correo',
  forgot: 'Recuperar acceso',
  reset:  'Nueva contraseña',
  error:  'Error',
};

function handleAuthRedirect(data: LoginResponse, push: (href: string) => void) {
  const { access_token, refresh_token, user } = data;
  const needsProfile = !user.profile_complete && !user.is_superadmin;
  useAuthStore.getState().setTokens(access_token, refresh_token, user.force_password_change, needsProfile);
  useAuthStore.getState().setUser({
    ...user,
    first_name:   user.first_name   || '',
    last_name:    user.last_name    || '',
    username:     null,
    phone:        null,
    is_active:    true,
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
    deleted_at:   null,
    job_title:    null,
    department:   null,
    primary_sede: null,
    address:      null,
    module_roles: [],
    preferences:  null,
  });
  push(!user.profile_complete && !user.is_superadmin
    ? ROUTES.AUTH.COMPLETE_PROFILE
    : ROUTES.APP.DASHBOARD,
  );
}

export function LoginClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [view,       setView]       = useState<AuthView>('login');
  const [otpToken,   setOtpToken]   = useState('');
  const [resetToken, setResetToken] = useState('');
  const [errorData,  setErrorData]  = useState('');

  useEffect(() => {
    const rt  = searchParams.get('reset_token');
    const err = searchParams.get('error');
    if (rt) {
      setResetToken(rt);
      window.history.replaceState(null, '', window.location.pathname);
      setView('reset');
    } else if (err) {
      setErrorData(decodeURIComponent(err));
      window.history.replaceState(null, '', window.location.pathname);
      setView('error');
    } else {
      setView('login');
      if (tokens.getAccess()) router.replace(ROUTES.APP.DASHBOARD);
    }
  }, [searchParams, router]);

  const redirect = (data: LoginResponse) =>
    handleAuthRedirect(data, (href) => router.push(href));

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          <Ticket size={20} />
          Tickets System
        </h1>
        <p className={styles.sub}>{SUBTITLES[view]}</p>

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
  );
}
