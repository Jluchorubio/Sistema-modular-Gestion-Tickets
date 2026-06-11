'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut, CheckCircle } from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { usersService } from '@/services/users.service';
import { authService } from '@/services/auth.service';
import { ROUTES } from '@/constants/routes';
import { ProfileFormStep } from './ProfileFormStep';
import { SecurityStep } from './SecurityStep';
import { SuccessStep } from './SuccessStep';
import styles from '../complete-profile.module.css';

type Stage = 'loading' | 'form' | 'security' | 'success';
type StepState = 'default' | 'active' | 'done';

const profileSchema = z.object({
  phone_prefix:     z.string().max(10).optional(),
  phone:            z.string().min(7, 'Mínimo 7 dígitos'),
  username: z.string().optional().refine(
    (v) => !v || (v.length >= 3 && /^[a-z0-9_]+$/.test(v)),
    'Mínimo 3 caracteres, solo letras minúsculas, números y _',
  ),
  job_title:        z.string().min(2, 'Mínimo 2 caracteres'),
  department:       z.string().min(1, 'Requerido'),
  primary_sede:     z.string().min(1, 'Selecciona una sede'),
  address:          z.string().min(5, 'Mínimo 5 caracteres'),
  country:          z.string().max(100).optional(),
  state_province:   z.string().max(150).optional(),
  city:             z.string().max(150).optional(),
  org_node_id:      z.string().optional(),
  position_node_id: z.string().optional(),
});

const securitySchema = z.object({
  newPassword: z.string().optional().refine(
    (v) => !v || (
      v.length >= 8 &&
      /[A-Z]/.test(v) &&
      /[a-z]/.test(v) &&
      /[0-9]/.test(v)
    ),
    'Mínimo 8 caracteres, una mayúscula, una minúscula y un número',
  ),
  confirmPassword: z.string().optional(),
}).refine((d) => !d.newPassword || d.newPassword === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path:    ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type SecurityForm = z.infer<typeof securitySchema>;

export function CompleteProfileClient() {
  const router = useRouter();
  const [stage,          setStage]          = useState<Stage>('loading');
  const [forcePwChange,  setForcePwChange]  = useState(false);
  const [otpEnabled,     setOtpEnabled]     = useState(false);
  const [errorBanner,    setErrorBanner]    = useState('');
  const [secErrorBanner, setSecErrorBanner] = useState('');
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [isSecSubmitting,setIsSecSubmitting]= useState(false);

  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });
  const secForm     = useForm<SecurityForm>({ resolver: zodResolver(securitySchema) });

  const phone      = profileForm.watch('phone', '');
  const jobTitle   = profileForm.watch('job_title', '');
  const department = profileForm.watch('department', '');
  const sede       = profileForm.watch('primary_sede', '');
  const address    = profileForm.watch('address', '');

  const s1 = phone.replace(/\D/g, '').length >= 7;
  const s2 = jobTitle.length >= 2 && department.length >= 1 && sede !== '';
  const s3 = address.length >= 5;

  const progressPct = useMemo(() => {
    if (stage === 'success')  return 100;
    if (stage === 'security') return 75;
    return Math.round(([s1, s2, s3].filter(Boolean).length / 3) * 75);
  }, [s1, s2, s3, stage]);

  const step1State: StepState = stage === 'security' || stage === 'success' ? 'done' : s1 ? 'done' : 'active';
  const step2State: StepState = stage === 'security' || stage === 'success' ? 'done' : s2 ? 'done' : s1 ? 'active' : 'default';
  const step3State: StepState = stage === 'security' || stage === 'success' ? 'done' : s3 ? 'done' : s2 ? 'active' : 'default';
  const step4State: StepState = stage === 'success' ? 'done' : stage === 'security' ? 'active' : 'default';

  useEffect(() => {
    if (!tokens.getAccess()) { router.replace(ROUTES.AUTH.LOGIN); return; }
    usersService.getMe().then((user) => {
      if (user.profile_complete) { router.replace(ROUTES.APP.DASHBOARD); return; }
      setForcePwChange(user.force_password_change);
      profileForm.reset({
        phone_prefix:     user.phone_prefix     ?? '',
        phone:            user.phone            ?? '',
        username:         user.username         ?? '',
        job_title:        user.job_title        ?? '',
        department:       user.department       ?? '',
        primary_sede:     user.primary_sede     ?? '',
        address:          user.address          ?? '',
        country:          user.country          ?? '',
        state_province:   user.state_province   ?? '',
        city:             user.city             ?? '',
        org_node_id:      user.org_node_id      ?? '',
        position_node_id: user.position_node_id ?? '',
      });
      setStage('form');
    }).catch(() => router.replace(ROUTES.AUTH.LOGIN));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileForm.reset]);

  async function onSubmitProfile(values: ProfileForm) {
    setErrorBanner('');
    setIsSubmitting(true);
    try {
      await usersService.completeProfile({
        phone_prefix:     values.phone_prefix     || undefined,
        phone:            values.phone,
        username:         values.username          || undefined,
        job_title:        values.job_title,
        department:       values.department,
        primary_sede:     values.primary_sede,
        address:          values.address,
        country:          values.country           || undefined,
        state_province:   values.state_province    || undefined,
        city:             values.city              || undefined,
        org_node_id:      values.org_node_id       || undefined,
        position_node_id: values.position_node_id  || undefined,
      });
      setStage('security');
    } catch (err: unknown) {
      setErrorBanner(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al guardar el perfil. Inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onSubmitSecurity(values: SecurityForm) {
    if (forcePwChange && !values.newPassword) {
      secForm.setError('newPassword', { message: 'La contraseña es requerida.' });
      return;
    }
    setSecErrorBanner('');
    setIsSecSubmitting(true);
    try {
      if (values.newPassword) await authService.setupPassword(values.newPassword);
      await authService.setOtpSetting(otpEnabled);
      tokens.clearNeedsProfile();
      setStage('success');
      setTimeout(() => router.push(ROUTES.APP.DASHBOARD), 2200);
    } catch (err: unknown) {
      setSecErrorBanner(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al guardar la configuración.',
      );
    } finally {
      setIsSecSubmitting(false);
    }
  }

  function doLogout() {
    const rt = tokens.getRefresh();
    if (rt) authService.logout(rt).catch(() => {});
    tokens.clear();
    router.push(ROUTES.AUTH.LOGIN);
  }

  if (stage === 'loading') return null;

  const STEPS = [
    { num: '01', label: 'Contacto',     sub: 'Teléfono y usuario', state: step1State },
    { num: '02', label: 'Organización', sub: 'Cargo, área y sede', state: step2State },
    { num: '03', label: 'Residencia',   sub: 'Dirección',          state: step3State },
    { num: '04', label: 'Seguridad',    sub: 'Contraseña y 2FA',   state: step4State },
  ];

  return (
    <div className={styles.root}>
      <aside className={styles.leftPanel}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            {/* Brand mark — two bars */}
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
              <rect x="0" y="1" width="5" height="12" rx="2.5" fill="rgba(255,255,255,0.9)" transform="rotate(-8 3 7)" />
              <rect x="7" y="1" width="5" height="12" rx="2.5" fill="rgba(255,255,255,0.75)" transform="rotate(-8 10 7)" />
            </svg>
          </div>
          <span className={styles.brandName}>Nexo</span>
        </div>

        <div className={styles.leftHeadline}>
          <h1>Configura tu<br /><em>perfil organizacional</em></h1>
          <p>
            Necesitamos tu información para habilitar el acceso a módulos, tickets y
            comunicación interna de la empresa.
          </p>
        </div>

        <div className={styles.stepper}>
          {STEPS.map(({ num, label, sub, state }) => (
            <div
              key={num}
              className={`${styles.stepItem} ${state === 'active' ? styles.active : ''} ${state === 'done' ? styles.done : ''}`}
            >
              <div className={styles.stepDotWrap}>
                <div className={styles.stepDot}>
                  {state === 'done' ? <CheckCircle size={14} color="#fff" strokeWidth={2.5} /> : num}
                </div>
              </div>
              <div className={styles.stepInfo}>
                <div className={styles.stepLabel}>{label}</div>
                <div className={styles.stepSub}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.leftFooter}>
          <button className={styles.logoutBtn} onClick={doLogout} type="button">
            <LogOut size={14} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className={styles.rightPanel}>
        <div className={styles.formCard}>
          {stage === 'success' && <SuccessStep />}

          {stage === 'security' && (
            <SecurityStep
              secForm={secForm}
              forcePwChange={forcePwChange}
              otpEnabled={otpEnabled}
              onToggleOtp={() => setOtpEnabled(v => !v)}
              isSubmitting={isSecSubmitting}
              errorBanner={secErrorBanner}
              onSubmit={secForm.handleSubmit(onSubmitSecurity)}
            />
          )}

          {stage === 'form' && (
            <ProfileFormStep
              form={profileForm}
              progressPct={progressPct}
              isSubmitting={isSubmitting}
              errorBanner={errorBanner}
              onSubmit={profileForm.handleSubmit(onSubmitProfile)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
