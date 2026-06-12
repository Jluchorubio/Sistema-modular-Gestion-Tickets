'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Globe2, X } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import { useAuthStore } from '@/stores/auth.store';
import { tokens } from '@/lib/tokens';
import { ROUTES } from '@/constants/routes';
import { authService } from '@/services/auth.service';
import type { LoginResponse } from '@/types/auth.types';
import { LoginForm } from './_components/LoginForm';
import { OtpForm } from './_components/OtpForm';
import { TotpForm } from './_components/TotpForm';
import { ForgotForm } from './_components/ForgotForm';
import { ResetForm } from './_components/ResetForm';
import styles from './login.module.css';

type AuthView = 'login' | 'otp' | 'forgot' | 'reset' | 'error' | 'pw_changed';
type VisualSlide = 'tickets' | 'modules' | 'security';

const VISUAL_SLIDES: Array<{
  key: VisualSlide;
  kicker: string;
  title: string;
  text: string;
  metric: string;
}> = [
  {
    key: 'tickets',
    kicker: 'Mesa de ayuda',
    title: 'Tickets priorizados',
    text: 'Seguimiento de incidentes, responsables y tiempos de atención desde un solo entorno operativo.',
    metric: 'SLA 96.3%',
  },
  {
    key: 'modules',
    kicker: 'Operación modular',
    title: 'Módulos conectados',
    text: 'Acceso directo a soporte, inventario, gestión administrativa y reportes según permisos.',
    metric: '3 entornos',
  },
  {
    key: 'security',
    kicker: 'Acceso corporativo',
    title: 'Identidad protegida',
    text: 'Inicio con credenciales internas, MFA y proveedores externos autorizados por el backend.',
    metric: 'SSO + MFA',
  },
];

const TITLES: Record<AuthView, string> = {
  login:      'Hi Operator',
  otp:        'Verificación en dos pasos',
  forgot:     'Recuperar acceso',
  reset:      'Nueva contraseña',
  error:      'Algo salió mal',
  pw_changed: 'Contraseña actualizada',
};

const SUBS: Record<AuthView, string> = {
  login:      'Bienvenido al Portal Integrado de Operaciones.',
  otp:        'Código enviado a tu correo',
  forgot:     'Te enviaremos un enlace de recuperación',
  reset:      'Elige una contraseña segura',
  error:      'Ocurrió un error inesperado',
  pw_changed: 'Inicia sesión con tu nueva contraseña',
};

function handleAuthRedirect(data: LoginResponse, push: (href: string) => void) {
  const { access_token, refresh_token, user } = data;
  const needsProfile = !user.profile_complete && !user.is_superadmin;
  const needsSetup   = !!user.needs_setup;
  const forcePw      = !!user.force_password_change;
  useAuthStore.getState().setTokens(access_token, refresh_token, forcePw, needsProfile, needsSetup);
  if (needsSetup)   return push(ROUTES.AUTH.SETUP);
  if (needsProfile) return push(ROUTES.AUTH.COMPLETE_PROFILE);
  if (forcePw)      return push(ROUTES.AUTH.CHANGE_PASSWORD);
  push(ROUTES.APP.DASHBOARD);
}

export function LoginClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const { data: company } = useQuery({
    queryKey: ['company-public'],
    queryFn:  systemConfigService.getPublicCompanyInfo,
    staleTime: 600_000,
  });
  const companyName = company?.name ?? '';

  const [view,       setView]       = useState<AuthView>('login');
  const [otpToken,   setOtpToken]   = useState('');
  const [mfaType,    setMfaType]    = useState<'email_otp' | 'totp'>('email_otp');
  const [resetToken, setResetToken] = useState('');
  const [errorData,  setErrorData]  = useState('');
  const [slideIndex, setSlideIndex] = useState(0);
  const [accessEmail, setAccessEmail] = useState<string | null>(null);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % VISUAL_SLIDES.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    authService.getAccessContact()
      .then((data) => setAccessEmail(data.email))
      .catch(() => setAccessEmail(null));
  }, []);

  // Hard navigation ensures the browser sends the newly-set has_session cookie
  // with the next request, avoiding middleware race conditions.
  const redirect = (data: LoginResponse) =>
    handleAuthRedirect(data, (href) => { window.location.href = href; });

  const activeSlide = VISUAL_SLIDES[slideIndex];

  function openAccessRequestEmail() {
    const to = accessEmail ?? '';
    const subject = 'Solicitud de acceso a plataforma ITSM';
    const body = [
      'Hola,',
      '',
      'Solicito la activación/creación de acceso a la plataforma ITSM.',
      '',
      'Correo a activar:',
      'Nombre completo:',
      'Área o dependencia:',
      'Módulo requerido:',
      'Justificación:',
      '',
      'Gracias.',
    ].join('\n');

    const href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  return (
    <main className={styles.root}>
      <aside className={styles.showcasePanel} aria-label="Estado de plataforma ITSM">
        <div className={styles.watermark} aria-hidden="true" />

        <div className={styles.visualCarousel}>
          <div className={styles.visualStage}>
            {VISUAL_SLIDES.map((slide, index) => (
              <article
                key={slide.key}
                className={`${styles.visualSlide} ${index === slideIndex ? styles.visualSlideActive : ''}`}
                aria-hidden={index !== slideIndex}
              >
                <div className={styles.visualMockup}>
                  {slide.key === 'tickets' && (
                    <>
                      <div className={styles.mockTopbar} />
                      <div className={styles.ticketStack}>
                        <span className={styles.ticketHigh} />
                        <span className={styles.ticketMid} />
                        <span className={styles.ticketLow} />
                      </div>
                      <div className={styles.slaRing}>96</div>
                    </>
                  )}
                  {slide.key === 'modules' && (
                    <>
                      <div className={styles.moduleGrid}>
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className={styles.modulePath} />
                    </>
                  )}
                  {slide.key === 'security' && (
                    <>
                      <div className={styles.securityShield} />
                      <div className={styles.securityRows}>
                        <span />
                        <span />
                        <span />
                      </div>
                    </>
                  )}
                </div>
                <div className={styles.visualCopy}>
                  <span>{slide.kicker}</span>
                  <h2>{slide.title}</h2>
                  <p>{slide.text}</p>
                  <strong>{slide.metric}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.carouselDots} aria-label="Diapositivas del panel visual">
            {VISUAL_SLIDES.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                className={index === slideIndex ? styles.carouselDotActive : ''}
                aria-label={`Ver ${slide.title}`}
                onClick={() => setSlideIndex(index)}
              />
            ))}
          </div>
        </div>
      </aside>

      <section className={styles.formCol}>
        <header className={styles.formHeader}>
          <div className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nexo-logo.png" alt="Nexo" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span className={styles.brandName} style={{ color: '#FF6B00', letterSpacing: '0.18em' }}>
              {companyName || 'NEXO'}
            </span>
          </div>
          <button type="button" className={styles.langBtn} aria-label="Idioma actual: español">
            <Globe2 size={12} />
            <span>ES</span>
            <ChevronRight size={10} className={styles.langChevron} />
          </button>
        </header>

        <div className={styles.formWrap}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{TITLES[view]}</h1>
            <p className={styles.sub}>{SUBS[view]}</p>
          </div>

          {view === 'login' && (
            <LoginForm
              onOtp={(t, type) => { setOtpToken(t); setMfaType(type); setView('otp'); }}
              onForgot={() => setView('forgot')}
              onRedirect={redirect}
            />
          )}
          {view === 'otp' && mfaType === 'totp' && (
            <TotpForm
              otpToken={otpToken}
              onBack={() => setView('login')}
              onSuccess={redirect}
            />
          )}
          {view === 'otp' && mfaType === 'email_otp' && (
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
                onOtp={(t, type) => { setOtpToken(t); setMfaType(type); setView('otp'); }}
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
                Volver al login
              </button>
            </div>
          )}
        </div>

        <footer className={styles.formFooter}>
          <span>
            ¿No tienes cuenta?{' '}
            <button type="button" onClick={openAccessRequestEmail}>
              Solicitar acceso
            </button>
          </span>
          <div className={styles.socialLinks} aria-label="Canales corporativos">
            <button type="button" title="X Corporativo" aria-label="X Corporativo">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
              </svg>
            </button>
            <button type="button" title="Canal Discord" aria-label="Canal Discord">
              <svg viewBox="0 0 127.14 96.36" aria-hidden="true">
                <path d="M107.7 8.07A105.15 105.15 0 0 0 77.26 0a77.19 77.19 0 0 0-3.3 6.83 96.67 96.67 0 0 0-20.74 0A77.19 77.19 0 0 0 49.88 0 105.15 105.15 0 0 0 19.44 8.07C3.66 31.58-1.86 54.65 1 77.53a105.73 105.73 0 0 0 31 18.83 77.7 77.7 0 0 0 6.63-10.85 68.43 68.43 0 0 1-10.5-5c.9-.65 1.76-1.34 2.58-2a75.58 75.58 0 0 0 73 0c.83.68 1.69 1.37 2.58 2a68.12 68.12 0 0 1-10.5 5 77.11 77.11 0 0 0 6.63 10.85 105.73 105.73 0 0 0 31-18.83c2.86-22.88-2.66-45.95-18.44-69.46ZM42.45 65.69C36.18 65.69 31 60 31 53s5.18-12.64 11.45-12.64S53.83 46 53.83 53s-5.11 12.69-11.38 12.69Zm42.24 0C78.41 65.69 73.24 60 73.24 53s5.17-12.64 11.45-12.64S96.07 46 96.07 53s-5.07 12.69-11.38 12.69Z" />
              </svg>
            </button>
            <button type="button" title="Instagram" aria-label="Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5" />
                <circle cx="12" cy="12" r="4.1" />
                <circle cx="17.35" cy="6.65" r="1.05" />
              </svg>
            </button>
            <button type="button" title="GitHub" aria-label="GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.14c-3.2.69-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.74 2.67 1.24 3.32.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.17.92-.25 1.9-.38 2.88-.38.98 0 1.96.13 2.88.38 2.2-1.48 3.16-1.17 3.16-1.17.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.04.77 2.1v3.18c0 .31.21.67.79.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
