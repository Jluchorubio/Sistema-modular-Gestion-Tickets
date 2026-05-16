'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Controller, UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Smartphone, Briefcase, Building2, MapPin, Home, ChevronDown, Globe,
} from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { useGeoData } from '@/hooks/useGeoData';
import { GeoCombobox } from '@/components/ui/GeoCombobox';
import styles from '../complete-profile.module.css';

type ProfileForm = {
  phone_prefix?:  string;
  phone:          string;
  username?:      string;
  job_title:      string;
  department:     string;
  primary_sede:   string;
  address:        string;
  country?:       string;
  state_province?: string;
  city?:          string;
};

type CountryOption = { name: string; dialCode: string; flag: string };
let _cache: CountryOption[] | null = null;

async function loadCountries(): Promise<CountryOption[]> {
  if (_cache) return _cache;
  const res = await fetch('https://restcountries.com/v3.1/all?fields=name,idd,flag');
  const raw: Array<{ name: { common: string }; idd: { root: string; suffixes: string[] }; flag: string }> = await res.json();
  _cache = raw
    .filter(c => c.idd?.root && c.idd?.suffixes?.length)
    .map(c => ({
      name:     c.name.common,
      dialCode: c.idd.suffixes.length === 1 ? `${c.idd.root}${c.idd.suffixes[0]}` : c.idd.root,
      flag:     c.flag,
    }))
    .filter(c => /^\+\d/.test(c.dialCode))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return _cache;
}

interface Props {
  form:         UseFormReturn<ProfileForm>;
  progressPct:  number;
  isSubmitting: boolean;
  errorBanner:  string;
  onSubmit:     (e: React.FormEvent) => void;
}

export function ProfileFormStep({ form, progressPct, isSubmitting, errorBanner, onSubmit }: Props) {
  const { register, control, formState: { errors }, watch, setValue } = form;
  const sede           = watch('primary_sede', '');
  const watchedCountry = watch('country', '');
  const watchedState   = watch('state_province', '');

  const [countries,    setCountries]    = useState<CountryOption[]>([]);
  const [prefixOpen,   setPrefixOpen]   = useState(false);
  const [prefixSearch, setPrefixSearch] = useState('');
  const prefixRef = useRef<HTMLDivElement>(null);
  const watchedPrefix = watch('phone_prefix', '');

  const { countryOptions, stateOptions, cityOptions, statesLoading, citiesLoading } =
    useGeoData(watchedCountry ?? '', watchedState ?? '');

  useEffect(() => { loadCountries().then(setCountries).catch(() => {}); }, []);

  useEffect(() => {
    if (!prefixOpen) return;
    function handler(e: MouseEvent) {
      if (prefixRef.current && !prefixRef.current.contains(e.target as Node)) {
        setPrefixOpen(false); setPrefixSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prefixOpen]);

  const filteredCountries = useMemo(() =>
    countries.filter(c =>
      !prefixSearch ||
      c.name.toLowerCase().includes(prefixSearch.toLowerCase()) ||
      c.dialCode.includes(prefixSearch)
    ).slice(0, 60),
  [countries, prefixSearch]);

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
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Prefix picker */}
              <div ref={prefixRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  className={styles.fieldInput}
                  style={{ width: 96, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', paddingRight: 6, height: '100%' }}
                  onClick={() => { setPrefixOpen(v => !v); setPrefixSearch(''); }}
                >
                  <Globe size={12} style={{ flexShrink: 0, color: '#94A3B8' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {watchedPrefix || '+'}
                  </span>
                  <ChevronDown size={11} style={{ flexShrink: 0, color: '#94A3B8' }} />
                </button>
                {prefixOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
                    background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 260, overflow: 'hidden',
                  }}>
                    <div style={{ padding: 8, borderBottom: '1px solid #F1F5F9' }}>
                      <input
                        autoFocus
                        placeholder="Buscar país o código…"
                        value={prefixSearch}
                        onChange={e => setPrefixSearch(e.target.value)}
                        style={{
                          width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 12,
                          border: '1px solid #E2E8F0', outline: 'none', fontFamily: 'inherit',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                      {filteredCountries.length === 0 && (
                        <p style={{ fontSize: 12, color: '#94A3B8', padding: '10px 12px', margin: 0 }}>Sin resultados</p>
                      )}
                      {filteredCountries.map(c => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => { setValue('phone_prefix', c.dialCode, { shouldDirty: true }); setPrefixOpen(false); setPrefixSearch(''); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', border: 'none', background: 'none',
                            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <span>{c.flag}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{c.name}</span>
                          <span style={{ color: '#64748B', flexShrink: 0 }}>{c.dialCode}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Phone number */}
              <div className={styles.inputWrap} style={{ flex: 1 }}>
                <input
                  {...register('phone')}
                  id="phone"
                  type="tel"
                  placeholder="300 000 0000"
                  autoComplete="tel"
                  inputMode="tel"
                  className={`${styles.fieldInput} ${errors.phone ? styles.isErr : ''}`}
                />
                <span className={styles.fieldIcon}><Smartphone size={15} /></span>
              </div>
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

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              País <span className={styles.opt}>opcional</span>
            </label>
            <Controller
              control={control}
              name="country"
              render={({ field }) => (
                <GeoCombobox
                  value={field.value ?? ''}
                  onChange={val => {
                    field.onChange(val);
                    setValue('state_province', '');
                    setValue('city', '');
                  }}
                  options={countryOptions}
                  placeholder="Colombia"
                  icon={<Globe size={15} />}
                  inputClass={styles.fieldInput}
                />
              )}
            />
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Departamento / Estado <span className={styles.opt}>opcional</span>
              </label>
              <Controller
                control={control}
                name="state_province"
                render={({ field }) => (
                  <GeoCombobox
                    value={field.value ?? ''}
                    onChange={val => {
                      field.onChange(val);
                      setValue('city', '');
                    }}
                    options={stateOptions}
                    loading={statesLoading}
                    placeholder={watchedCountry ? 'Cundinamarca' : 'Selecciona un país primero'}
                    disabled={!watchedCountry}
                    icon={<MapPin size={15} />}
                    inputClass={styles.fieldInput}
                  />
                )}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Ciudad <span className={styles.opt}>opcional</span>
              </label>
              <Controller
                control={control}
                name="city"
                render={({ field }) => (
                  <GeoCombobox
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={cityOptions}
                    loading={citiesLoading}
                    placeholder={watchedState ? 'Bogotá' : 'Selecciona un departamento'}
                    disabled={!watchedState}
                    icon={<Building2 size={15} />}
                    inputClass={styles.fieldInput}
                  />
                )}
              />
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
                placeholder="Calle 123 # 45-67"
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
