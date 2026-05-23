'use client';

import { CheckCircle, Building2, MapPin, Layers, Grid3X3, Briefcase } from 'lucide-react';
import styles from '../../complete-profile/complete-profile.module.css';
import finalStyles from './finalize-step.module.css';
import type { CompanyForm } from './SetupWizardClient';
import type { OrgData } from './OrgStep';

interface Props {
  company:     CompanyForm;
  org:         OrgData;
  isSubmitting: boolean;
  error:       string;
  onConfirm:   () => void;
  onBack:      () => void;
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className={finalStyles.row}>
      <span className={finalStyles.rowIcon}>{icon}</span>
      <div>
        <div className={finalStyles.rowLabel}>{label}</div>
        <div className={finalStyles.rowValue}>{value}</div>
      </div>
    </div>
  );
}

export function FinalizeStep({ company, org, isSubmitting, error, onConfirm, onBack }: Props) {
  return (
    <div>
      <div className={styles.progressWrap}>
        <div className={styles.progressHeader}>
          <span className={styles.progressTitle}>Paso 3 de 3</span>
          <span className={styles.progressPct}>100%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: '100%' }} />
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionNum}>03 — FINALIZAR</div>
            <div className={styles.sectionTitle}>Resumen de configuración</div>
            <div className={styles.sectionSub}>
              Confirma la información antes de activar el sistema
            </div>
          </div>
        </div>
        <div className={styles.sectionDivider} />

        {error && <div className={styles.errorBanner}>{error}</div>}

        <div className={finalStyles.summaryCard}>
          <div className={finalStyles.summaryTitle}>Empresa</div>
          <SummaryRow icon={<Building2 size={13} />} label="Nombre" value={company.name} />
          {company.contact_email && (
            <SummaryRow icon={<Building2 size={13} />} label="Correo" value={company.contact_email} />
          )}
          {company.website && (
            <SummaryRow icon={<Building2 size={13} />} label="Sitio web" value={company.website} />
          )}
        </div>

        <div className={finalStyles.summaryCard}>
          <div className={finalStyles.summaryTitle}>Estructura organizacional</div>
          <SummaryRow
            icon={<MapPin size={13} />}
            label="Sedes"
            value={org.headquarters.join(' · ')}
          />
          {org.departments.length > 0 && (
            <SummaryRow
              icon={<Layers size={13} />}
              label="Departamentos"
              value={org.departments.join(' · ')}
            />
          )}
          {org.areas.length > 0 && (
            <SummaryRow
              icon={<Grid3X3 size={13} />}
              label="Áreas"
              value={org.areas.join(' · ')}
            />
          )}
          {org.positions.length > 0 && (
            <SummaryRow
              icon={<Briefcase size={13} />}
              label="Cargos"
              value={org.positions.join(' · ')}
            />
          )}
        </div>

        <div className={finalStyles.infoBox}>
          <CheckCircle size={15} color="#059669" />
          <span>
            Al confirmar, el sistema quedará activado y podrás acceder al dashboard operativo.
            Toda esta configuración es editable después desde <strong>/config</strong>.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className={styles.submitBtn}
          style={{ background: 'var(--border2)', color: 'var(--text)', flex: '0 0 120px' }}
        >
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className={styles.submitBtn}
          style={{ flex: 1, background: '#059669' }}
        >
          {isSubmitting ? 'Activando sistema...' : '✓ Activar sistema'}
        </button>
      </div>
    </div>
  );
}
