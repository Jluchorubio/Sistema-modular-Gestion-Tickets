'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ticket, LogOut, CheckCircle } from 'lucide-react';
import { tokens } from '@/lib/tokens';
import { authService } from '@/services/auth.service';
import { systemConfigService } from '@/services/system-config.service';
import { ROUTES } from '@/constants/routes';
import { CompanyStep } from './CompanyStep';
import { OrgStep, type OrgData } from './OrgStep';
import { FinalizeStep } from './FinalizeStep';
import styles from '../../complete-profile/complete-profile.module.css';

type Stage = 'loading' | 'company' | 'org' | 'finalize' | 'done';
type StepState = 'default' | 'active' | 'done';

const companySchema = z.object({
  name:          z.string().min(2, 'Mínimo 2 caracteres'),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  website:       z.string().optional(),
  primary_color: z.string().optional(),
});

export type CompanyForm = z.infer<typeof companySchema>;

export function SetupWizardClient() {
  const router = useRouter();
  const [stage,        setStage]       = useState<Stage>('loading');
  const [orgData,      setOrgData]     = useState<OrgData | null>(null);
  const [finalError,   setFinalError]  = useState('');
  const [isFinalizing, setIsFinalizing]= useState(false);

  const companyForm = useForm<CompanyForm>({ resolver: zodResolver(companySchema) });

  useEffect(() => {
    if (!tokens.getAccess()) { router.replace(ROUTES.AUTH.LOGIN); return; }
    if (!tokens.getNeedsSetup()) { router.replace(ROUTES.APP.DASHBOARD); return; }
    setStage('company');
  }, [router]);

  function doLogout() {
    const rt = tokens.getRefresh();
    if (rt) authService.logout(rt).catch(() => {});
    tokens.clear();
    router.push(ROUTES.AUTH.LOGIN);
  }

  async function onCompanySubmit(values: CompanyForm) {
    try {
      await systemConfigService.setupCompany({
        name:          values.name,
        contact_email: values.contact_email || undefined,
        contact_phone: values.contact_phone || undefined,
        website:       values.website       || undefined,
        primary_color: values.primary_color || undefined,
      });
      setStage('org');
    } catch {
      companyForm.setError('name', { message: 'Error al guardar. Intenta de nuevo.' });
    }
  }

  function onOrgNext(data: OrgData) {
    setOrgData(data);
    setStage('finalize');
  }

  async function onConfirm() {
    setFinalError('');
    setIsFinalizing(true);
    try {
      await systemConfigService.initializeSystem();
      tokens.clearNeedsSetup();
      setStage('done');
      setTimeout(() => router.push(ROUTES.APP.DASHBOARD), 2200);
    } catch {
      setFinalError('Error al activar el sistema. Intenta de nuevo.');
    } finally {
      setIsFinalizing(false);
    }
  }

  if (stage === 'loading') return null;

  const step1State: StepState = stage === 'org' || stage === 'finalize' || stage === 'done' ? 'done' : stage === 'company' ? 'active' : 'default';
  const step2State: StepState = stage === 'finalize' || stage === 'done' ? 'done' : stage === 'org' ? 'active' : 'default';
  const step3State: StepState = stage === 'done' ? 'done' : stage === 'finalize' ? 'active' : 'default';

  const STEPS = [
    { num: '01', label: 'Empresa',       sub: 'Información corporativa', state: step1State },
    { num: '02', label: 'Organización',  sub: 'Sedes y estructura',       state: step2State },
    { num: '03', label: 'Activar',       sub: 'Confirmación final',       state: step3State },
  ];

  return (
    <div className={styles.root}>
      <aside className={styles.leftPanel}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <Ticket size={17} color="rgba(255,255,255,0.85)" />
          </div>
          <span className={styles.brandName}>NEXO</span>
        </div>

        <div className={styles.leftHeadline}>
          <h1>Configuración<br /><em>inicial del sistema</em></h1>
          <p>
            Establece la información corporativa y la estructura organizacional.
            Podrás modificar todo esto desde <strong style={{ color: 'rgba(255,255,255,0.7)' }}>/config</strong> una vez activo el sistema.
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

          {stage === 'done' && (
            <div className={styles.successOverlay}>
              <div className={styles.successRing}>
                <CheckCircle size={32} color="#22c55e" />
              </div>
              <div className={styles.successTitle}>¡Sistema activado!</div>
              <div className={styles.successSub}>
                La configuración fue guardada correctamente. Redirigiendo al dashboard...
              </div>
              <div className={styles.successDots}>
                <span /><span /><span />
              </div>
            </div>
          )}

          {stage === 'company' && (
            <CompanyStep
              form={companyForm}
              isSubmitting={companyForm.formState.isSubmitting}
              errorBanner=""
              onSubmit={companyForm.handleSubmit(onCompanySubmit)}
            />
          )}

          {stage === 'org' && (
            <OrgStep
              onNext={onOrgNext}
              onBack={() => setStage('company')}
            />
          )}

          {stage === 'finalize' && orgData && (
            <FinalizeStep
              company={companyForm.getValues()}
              org={orgData}
              isSubmitting={isFinalizing}
              error={finalError}
              onConfirm={onConfirm}
              onBack={() => setStage('org')}
            />
          )}
        </div>
      </main>
    </div>
  );
}
