'use client';
import { useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Smartphone, Briefcase, Building2, MapPin, Home, ChevronDown,
} from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import styles from '../complete-profile.module.css';

type ProfileForm = {
  phone:         string;
  username?:     string;
  job_title:     string;
  department:    string;
  primary_sede:  string;
  address:       string;
};

interface Props {
  form:         UseFormReturn<ProfileForm>;
  progressPct:  number;
  isSubmitting: boolean;
  errorBanner:  string;
  onSubmit:     (e: React.FormEvent) => void;
}

export function ProfileFormStep({ form, progressPct, isSubmitting, errorBanner, onSubmit }: Props) {
  const { register, formState: { errors }, watch } = form;
  const sede = watch('primary_sede', '');

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: modulesService.getLocations,
    staleTime: Infinity,
  });

  const { data: environments = [] } = useQuery({
    queryKey: ['environments', sede],
    queryFn: () => modulesService.getEnvironments(sede),
    enabled: !!sede,
  });

  const locationGroups = useMemo(() => {
    const groups: Record<string, typeof locations> = {};
    for (const loc of locations) {
      const key = loc.module_name ?? 'General';
      if (!groups[key]) groups[key] = [];
      groups[key].push(loc);
    }
    return Object.entries(groups);
  }, [locations]);

  const useOptgroups = locationGroups.length > 1;

  return (
    <>
      <div className={styles.progressWrap}>
        <div className={styles.progressHeader}>
          <span className={styles.progressTitle}>Progreso del perfil</span>
          <span className={styles.progressPct}>{progressPct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate>
        {/* Sección 01: Contacto */}
        <div className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionNum}>01</span>
            <div>
              <div className={styles.sectionTitle}>Información de contacto</div>
              <div className={styles.sectionSub}>Tu punto de contacto directo en la organización</div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="phone">
              Teléfono celular <span className={styles.req}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                {...register('phone')}
                id="phone"
                type="tel"
                placeholder="+57 300 000 0000"
                autoComplete="tel"
                inputMode="tel"
                className={`${styles.fieldInput} ${errors.phone ? styles.isErr : ''}`}
              />
              <span className={styles.fieldIcon}><Smartphone size={15} /></span>
            </div>
            {errors.phone && <span className={styles.fieldError}>{errors.phone.message}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="username">
              Nombre de usuario <span className={styles.opt}>opcional</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                {...register('username')}
                id="username"
                type="text"
                placeholder="juan_perez"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                className={`${styles.fieldInput} ${errors.username ? styles.isErr : ''}`}
              />
              <span className={styles.fieldIcon} style={{ fontSize: 13, fontWeight: 700, opacity: 0.45 }}>@</span>
            </div>
            <span className={styles.fieldHint}>Para iniciar sesión sin usar tu email</span>
            {errors.username && <span className={styles.fieldError}>{errors.username.message}</span>}
          </div>
        </div>

        <div className={styles.sectionDivider} />

        {/* Sección 02: Organización */}
        <div className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionNum}>02</span>
            <div>
              <div className={styles.sectionTitle}>Información organizacional</div>
              <div className={styles.sectionSub}>Tu posición dentro de la estructura de la empresa</div>
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="job_title">
                Cargo actual <span className={styles.req}>*</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  {...register('job_title')}
                  id="job_title"
                  type="text"
                  placeholder="Ej: Técnico Senior"
                  className={`${styles.fieldInput} ${errors.job_title ? styles.isErr : ''}`}
                />
                <span className={styles.fieldIcon}><Briefcase size={15} /></span>
              </div>
              {errors.job_title && <span className={styles.fieldError}>{errors.job_title.message}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="department">
                Área / Departamento <span className={styles.req}>*</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  {...register('department')}
                  id="department"
                  type="text"
                  placeholder="Ej: Soporte TI"
                  className={`${styles.fieldInput} ${errors.department ? styles.isErr : ''}`}
                />
                <span className={styles.fieldIcon}><Building2 size={15} /></span>
              </div>
              {errors.department && <span className={styles.fieldError}>{errors.department.message}</span>}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="primary_sede">
              Sede principal <span className={styles.req}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <select
                {...register('primary_sede')}
                id="primary_sede"
                className={`${styles.fieldInput} ${styles.fieldSelect} ${errors.primary_sede ? styles.isErr : ''}`}
              >
                <option value="">
                  {locations.length === 0 ? 'Cargando sedes...' : 'Seleccionar sede...'}
                </option>
                {useOptgroups
                  ? locationGroups.map(([group, locs]) => (
                      <optgroup key={group} label={group}>
                        {locs.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                      </optgroup>
                    ))
                  : (locationGroups[0]?.[1] ?? []).map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
              </select>
              <span className={styles.fieldIcon}><MapPin size={15} /></span>
              <span className={styles.selectArrow}><ChevronDown size={14} /></span>
            </div>
            {errors.primary_sede && <span className={styles.fieldError}>{errors.primary_sede.message}</span>}
          </div>

          {environments.length > 0 && (
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.fieldLabel} htmlFor="ambiente">
                Ambiente <span className={styles.opt}>opcional</span>
              </label>
              <div className={styles.inputWrap}>
                <select id="ambiente" className={`${styles.fieldInput} ${styles.fieldSelect}`}>
                  <option value="">Seleccionar ambiente...</option>
                  {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                </select>
                <span className={styles.fieldIcon}><Building2 size={15} /></span>
                <span className={styles.selectArrow}><ChevronDown size={14} /></span>
              </div>
              <span className={styles.fieldHint}>Espacio físico o lógico dentro de la sede</span>
            </div>
          )}
        </div>

        <div className={styles.sectionDivider} />

        {/* Sección 03: Residencia */}
        <div className={styles.formSection} style={{ marginBottom: 0 }}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionNum}>03</span>
            <div>
              <div className={styles.sectionTitle}>Residencia</div>
              <div className={styles.sectionSub}>Ubicación para trazabilidad y logística interna</div>
            </div>
          </div>

          <div className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel} htmlFor="address">
              Dirección de residencia <span className={styles.req}>*</span>
            </label>
            <div className={styles.inputWrap}>
              <input
                {...register('address')}
                id="address"
                type="text"
                placeholder="Calle 123 # 45-67, Bogotá"
                className={`${styles.fieldInput} ${errors.address ? styles.isErr : ''}`}
              />
              <span className={styles.fieldIcon}><Home size={15} /></span>
            </div>
            <span className={styles.fieldHint}>Se usará para asignación de zonas y cobertura de servicios</span>
            {errors.address && <span className={styles.fieldError}>{errors.address.message}</span>}
          </div>
        </div>

        {errorBanner && <div className={styles.errorBanner} style={{ marginTop: 20 }}>{errorBanner}</div>}

        <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar y continuar'}
        </button>
      </form>
    </>
  );
}
