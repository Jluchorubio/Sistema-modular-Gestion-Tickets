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

  const isWelcomeView = view === 'login' || view === 'pw_changed';

  return (
    <div className={styles.root}>
      {/* Topography lines */}
      <div className={styles.topoOverlay} aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <defs>
            <linearGradient id="topoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#15271d" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <path d="M-100 200 C 300 150, 400 350, 900 250 C 1400 150, 1600 400, 2000 300" fill="none" stroke="url(#topoGrad)" strokeWidth="2.5" />
          <path d="M-100 300 C 300 250, 400 450, 900 350 C 1400 250, 1600 500, 2000 400" fill="none" stroke="url(#topoGrad)" strokeWidth="2" />
          <path d="M-100 400 C 300 350, 400 550, 900 450 C 1400 350, 1600 600, 2000 500" fill="none" stroke="url(#topoGrad)" strokeWidth="1.5" />
          <path d="M-100 500 C 300 450, 400 650, 900 550 C 1400 450, 1600 700, 2000 600" fill="none" stroke="url(#topoGrad)" strokeWidth="1" />
          <path d="M-100 600 C 300 550, 400 750, 900 650 C 1400 550, 1600 800, 2000 700" fill="none" stroke="url(#topoGrad)" strokeWidth="0.8" />
          <path d="M-100 700 C 300 650, 400 850, 900 750 C 1400 650, 1600 900, 2000 800" fill="none" stroke="url(#topoGrad)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Green glow top-left */}
      <div className={styles.glowTopLeft} aria-hidden="true" />

      {/* ── Main card ── */}
      <main className={styles.card}>

        {/* Header: brand + nav */}
        <header className={styles.cardHeader}>
          <div className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Logo" className={styles.brandLogoImg} />
            <span className={styles.brandName}>
              Tickets<span className={styles.brandDot}>.</span>
            </span>
          </div>
          <nav className={styles.nav}>
            <a href="#" className={styles.navLink}>Inicio</a>
            <a href="#" className={styles.navLink}>Módulos</a>
            <a href="#" className={styles.navLink}>Soporte</a>
          </nav>
        </header>

        {/* Body: form + illustration */}
        <div className={styles.cardBody}>

          {/* Left: forms */}
          <div className={styles.formCol}>
            <div className={styles.formWrap}>
              <div className={styles.heading}>
                <h1 className={isWelcomeView ? styles.titleWelcome : styles.title}>
                  {TITLES[view]}
                </h1>
                <p className={styles.sub}>{SUBS[view]}</p>
              </div>

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

          {/* Right: illustration + social icons */}
          <div className={styles.illustrationCol}>
            <div className={styles.logoWrap}>
              <div className={styles.logoCircle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Mascot" className={styles.logoImg} />
              </div>
            </div>

            <div className={styles.socialPanel}>
              <a href="#" className={styles.socialBtn} aria-label="Twitter">
                <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a href="#" className={styles.socialBtn} aria-label="Discord">
                <svg width="13" height="13" fill="currentColor" viewBox="0 0 127.14 96.36">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.9-.65,1.76-1.34,2.58-2a75.58,75.58,0,0,0,73,0c.83.68,1.69,1.37,2.58,2a68.12,68.12,0,0,1-10.5,5,77.11,77.11,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.87,54.65,123.72,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z"/>
                </svg>
              </a>
              <a href="#" className={styles.socialBtn} aria-label="Instagram">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
              <a href="#" className={styles.socialBtn} aria-label="GitHub">
                <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>

        </div>

        {/* Mobile footer */}
        <footer className={styles.mobileFooter}>
          <a href="#" className={styles.mobileFooterLink}>Inicio</a>
          <a href="#" className={styles.mobileFooterLink}>Módulos</a>
          <a href="#" className={styles.mobileFooterLink}>Soporte</a>
        </footer>

      </main>
    </div>
  );
}
