'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Globe2, X } from 'lucide-react';
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
  useAuthStore.getState().setTokens(access_token, refresh_token, user.force_password_change, needsProfile, needsSetup);
  if (needsSetup)   return push(ROUTES.AUTH.SETUP);
  if (needsProfile) return push(ROUTES.AUTH.COMPLETE_PROFILE);
  push(ROUTES.APP.DASHBOARD);
}

export function LoginClient() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [view,       setView]       = useState<AuthView>('login');
  const [otpToken,   setOtpToken]   = useState('');
  const [resetToken, setResetToken] = useState('');
  const [errorData,  setErrorData]  = useState('');
  const [slideIndex, setSlideIndex] = useState(0);

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

  const redirect = (data: LoginResponse) =>
    handleAuthRedirect(data, (href) => router.push(href));

  const activeSlide = VISUAL_SLIDES[slideIndex];

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
            <span className={styles.brandMark} aria-hidden="true">
              <span />
              <span />
            </span>
            <span className={styles.brandName}>LOGOTIPO</span>
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
                Volver al login
              </button>
            </div>
          )}
        </div>

        <footer className={styles.formFooter}>
          <span>
            ¿No tienes cuenta?{' '}
            <button type="button" onClick={() => setView('forgot')}>
              Solicitar acceso
            </button>
          </span>
          <div className={styles.socialLinks} aria-label="Canales corporativos">
            <button type="button" title="X Corporativo">X</button>
            <button type="button" title="Canal Discord">D</button>
            <button type="button" title="Instagram">I</button>
            <button type="button" title="GitHub">G</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
