'use client';

import { UseFormReturn } from 'react-hook-form';
import { Building2, Mail, Phone, Globe, Palette } from 'lucide-react';
import styles from '../../complete-profile/complete-profile.module.css';
import type { CompanyForm } from './SetupWizardClient';

interface Props {
  form: UseFormReturn<CompanyForm>;
  isSubmitting: boolean;
  errorBanner: string;
  onSubmit: () => void;
}

export function CompanyStep({ form, isSubmitting, errorBanner, onSubmit }: Props) {
  const { register, formState: { errors } } = form;

  return (
    <div>
      <div className={styles.progressWrap}>
        <div className={styles.progressHeader}>
          <span className={styles.progressTitle}>Paso 1 de 3</span>
          <span className={styles.progressPct}>33%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: '33%' }} />
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionNum}>01 — EMPRESA</div>
            <div className={styles.sectionTitle}>Información corporativa</div>
            <div className={styles.sectionSub}>Estos datos identifican tu organización en el sistema</div>
          </div>
        </div>
        <div className={styles.sectionDivider} />

        {errorBanner && <div className={styles.errorBanner}>{errorBanner}</div>}

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Nombre de la empresa <span className={styles.req}>*</span>
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.fieldIcon}><Building2 size={15} /></span>
            <input
              {...register('name')}
              className={`${styles.fieldInput} ${errors.name ? styles.isErr : ''}`}
              placeholder="Ej: Acme Corp S.A.S."
            />
          </div>
          {errors.name && <span className={styles.fieldError}>{errors.name.message}</span>}
        </div>

        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Correo de soporte <span className={styles.opt}>opt</span>
            </label>
            <div className={styles.inputWrap}>
              <span className={styles.fieldIcon}><Mail size={15} /></span>
              <input
                {...register('contact_email')}
                type="email"
                className={`${styles.fieldInput} ${errors.contact_email ? styles.isErr : ''}`}
                placeholder="soporte@empresa.com"
              />
            </div>
            {errors.contact_email && <span className={styles.fieldError}>{errors.contact_email.message}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              Teléfono corporativo <span className={styles.opt}>opt</span>
            </label>
            <div className={styles.inputWrap}>
              <span className={styles.fieldIcon}><Phone size={15} /></span>
              <input
                {...register('contact_phone')}
                className={styles.fieldInput}
                placeholder="+57 300 000 0000"
              />
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Sitio web <span className={styles.opt}>opt</span>
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.fieldIcon}><Globe size={15} /></span>
            <input
              {...register('website')}
              className={styles.fieldInput}
              placeholder="https://www.empresa.com"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Color principal <span className={styles.opt}>opt</span>
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.fieldIcon}><Palette size={15} /></span>
            <input
              {...register('primary_color')}
              className={styles.fieldInput}
              placeholder="#6366f1"
            />
          </div>
          <span className={styles.fieldHint}>Código hexadecimal. Usado en branding del sistema.</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className={styles.submitBtn}
      >
        Continuar → Estructura organizacional
      </button>
    </div>
  );
}
