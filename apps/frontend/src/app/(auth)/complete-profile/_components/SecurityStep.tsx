'use client';
import { useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { Shield, Lock, Info } from 'lucide-react';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import styles from '../complete-profile.module.css';

type SecurityForm = {
  newPassword?:     string;
  confirmPassword?: string;
};

interface Props {
  secForm:         UseFormReturn<SecurityForm>;
  forcePwChange:   boolean;
  otpEnabled:      boolean;
  onToggleOtp:     () => void;
  isSubmitting:    boolean;
  errorBanner:     string;
  onSubmit:        (e: React.FormEvent) => void;
}

export function SecurityStep({ secForm, forcePwChange, otpEnabled, onToggleOtp, isSubmitting, errorBanner, onSubmit }: Props) {
  const newPw = secForm.watch('newPassword', '');

  return (
    <div className={styles.secStep}>
      <form onSubmit={onSubmit} noValidate>
        <div className={styles.secHeading}>
          <div className={styles.secBadge}>
            <Shield size={11} />
            Paso 4 de 4
          </div>
          <div className={styles.sectionTitle} style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            Configuraciones de seguridad
          </div>
          <div className={styles.sectionSub}>
            Establece tu contraseña y activa la verificación en dos pasos
          </div>
          <div style={{ height: 1, background: 'var(--border)', marginTop: 18 }} />
        </div>

        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>
              Cambiar contraseña
              {forcePwChange && <span className={styles.requiredBadge}>Requerido</span>}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              {forcePwChange
                ? 'Debes establecer una nueva contraseña para continuar.'
                : 'Puedes establecer una nueva contraseña ahora o hacerlo más adelante desde tu perfil.'}
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="new-password">
              Nueva contraseña
              {forcePwChange
                ? <span className={styles.req}>*</span>
                : <span className={styles.opt}>opcional</span>}
            </label>
            <div className={styles.inputWrap}>
              <input
                {...secForm.register('newPassword')}
                id="new-password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                className={`${styles.fieldInput} ${secForm.formState.errors.newPassword ? styles.isErr : ''}`}
              />
              <span className={styles.fieldIcon}><Lock size={15} /></span>
            </div>
            {newPw && (
              <PasswordStrengthMeter
                password={newPw}
                wrapClassName={styles.pwStrength}
                barClassName={styles.pwStrengthBar}
              />
            )}
            {secForm.formState.errors.newPassword && (
              <span className={styles.fieldError}>{secForm.formState.errors.newPassword.message}</span>
            )}
          </div>

          {newPw && (
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel} htmlFor="confirm-password">
                Confirmar contraseña <span className={styles.req}>*</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  {...secForm.register('confirmPassword')}
                  id="confirm-password"
                  type="password"
                  placeholder="Repite tu nueva contraseña"
                  className={`${styles.fieldInput} ${secForm.formState.errors.confirmPassword ? styles.isErr : ''}`}
                />
                <span className={styles.fieldIcon}><Lock size={15} /></span>
              </div>
              {secForm.formState.errors.confirmPassword && (
                <span className={styles.fieldError}>{secForm.formState.errors.confirmPassword.message}</span>
              )}
            </div>
          )}
        </div>

        <div className={styles.dividerLine} />

        <div className={`${styles.otpCard} ${otpEnabled ? styles.active : ''}`}>
          <div className={styles.otpCardHeader}>
            <div className={styles.otpCardInfo}>
              <div className={styles.otpCardTitle}>Verificación en dos pasos</div>
              <div className={styles.otpCardDesc}>
                Recibirás un código por email cada vez que inicies sesión.
                Protege tu cuenta frente a accesos no autorizados.
              </div>
            </div>
            <button
              type="button"
              className={`${styles.otpToggleBtn} ${otpEnabled ? styles.enabled : ''}`}
              onClick={onToggleOtp}
            >
              {otpEnabled ? 'Desactivar' : 'Activar'}
            </button>
          </div>
          <div className={`${styles.otpStatus} ${otpEnabled ? styles.otpStatusOn : styles.otpStatusOff}`}>
            <Info size={11} />
            {otpEnabled
              ? 'Activada — se requerirá código al iniciar sesión'
              : 'Desactivada — no se requerirá código al iniciar sesión'}
          </div>
        </div>

        {errorBanner && <div className={styles.errorBanner}>{errorBanner}</div>}

        <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Finalizar y acceder al sistema'}
        </button>
      </form>
    </div>
  );
}
