'use client';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Controller, UseFormReturn } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Smartphone, Briefcase, Building2, MapPin, Home, ChevronDown, Globe, Search,
} from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { systemConfigService } from '@/services/system-config.service';
import { useGeoData } from '@/hooks/useGeoData';
import { GeoCombobox } from '@/components/ui/GeoCombobox';
import styles from '../complete-profile.module.css';

type ProfileForm = {
  phone_prefix?:    string;
  phone:            string;
  username?:        string;
  job_title:        string;
  department:       string;
  primary_sede:     string;
  address:          string;
  country?:         string;
  state_province?:  string;
  city?:            string;
  org_node_id?:     string;
  position_node_id?: string;
};

type CountryOption = { name: string; dialCode: string; flag: string };
let _cache: CountryOption[] | null = null;

const FALLBACK_COUNTRIES: CountryOption[] = [
  { name: 'Colombia',          dialCode: '+57',  flag: '🇨🇴' },
  { name: 'México',            dialCode: '+52',  flag: '🇲🇽' },
  { name: 'Argentina',         dialCode: '+54',  flag: '🇦🇷' },
  { name: 'Chile',             dialCode: '+56',  flag: '🇨🇱' },
  { name: 'Perú',              dialCode: '+51',  flag: '🇵🇪' },
  { name: 'Venezuela',         dialCode: '+58',  flag: '🇻🇪' },
  { name: 'Ecuador',           dialCode: '+593', flag: '🇪🇨' },
  { name: 'Bolivia',           dialCode: '+591', flag: '🇧🇴' },
  { name: 'Paraguay',          dialCode: '+595', flag: '🇵🇾' },
  { name: 'Uruguay',           dialCode: '+598', flag: '🇺🇾' },
  { name: 'España',            dialCode: '+34',  flag: '🇪🇸' },
  { name: 'Estados Unidos',    dialCode: '+1',   flag: '🇺🇸' },
  { name: 'Brasil',            dialCode: '+55',  flag: '🇧🇷' },
  { name: 'Costa Rica',        dialCode: '+506', flag: '🇨🇷' },
  { name: 'Panamá',            dialCode: '+507', flag: '🇵🇦' },
  { name: 'Honduras',          dialCode: '+504', flag: '🇭🇳' },
  { name: 'Guatemala',         dialCode: '+502', flag: '🇬🇹' },
  { name: 'El Salvador',       dialCode: '+503', flag: '🇸🇻' },
  { name: 'Nicaragua',         dialCode: '+505', flag: '🇳🇮' },
  { name: 'República Dominicana', dialCode: '+1',  flag: '🇩🇴' },
  { name: 'Cuba',              dialCode: '+53',  flag: '🇨🇺' },
  { name: 'Puerto Rico',       dialCode: '+1',   flag: '🇵🇷' },
  { name: 'Portugal',          dialCode: '+351', flag: '🇵🇹' },
  { name: 'Reino Unido',       dialCode: '+44',  flag: '🇬🇧' },
  { name: 'Canadá',            dialCode: '+1',   flag: '🇨🇦' },
].sort((a, b) => a.name.localeCompare(b.name, 'es'));

async function loadCountries(): Promise<CountryOption[]> {
  if (_cache) return _cache;
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,idd,flag');
    if (!res.ok) throw new Error('HTTP error');
    const raw: Array<{ name: { common: string }; idd: { root: string; suffixes: string[] }; flag: string }> = await res.json();
    const parsed = raw
      .filter(c => c.idd?.root && c.idd?.suffixes?.length)
      .map(c => ({
        name:     c.name.common,
        dialCode: c.idd.suffixes.length === 1 ? `${c.idd.root}${c.idd.suffixes[0]}` : c.idd.root,
        flag:     c.flag,
      }))
      .filter(c => /^\+\d/.test(c.dialCode))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    _cache = parsed;
  } catch {
    _cache = FALLBACK_COUNTRIES;
  }
  return _cache;
}

/* ── Searchable select dropdown ── */
function OrgSelect({
  value, onChange, options, placeholder, icon, error,
}: {
  value: string;
  onChange: (val: string, name: string) => void;
  options: { id: string; name: string; parent_name?: string | null }[];
  placeholder: string;
  icon?: React.ReactNode;
  error?: string;
}) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() =>
    options.filter(o =>
      !search || o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.parent_name ?? '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 60),
  [options, search]);

  const selected = options.find(o => o.id === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className={`${styles.fieldInput} ${styles.fieldSelect} ${error ? styles.isErr : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textAlign: 'left', width: '100%' }}
      >
        {icon && <span style={{ flexShrink: 0, color: '#94A3B8', display: 'flex' }}>{icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: selected ? '#0F172A' : '#94A3B8' }}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: '#94A3B8', marginLeft: 'auto' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={12} style={{ color: '#94A3B8', flexShrink: 0 }} />
            <input
              autoFocus
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', color: '#0F172A', background: 'none' }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <p style={{ fontSize: 12, color: '#94A3B8', padding: '10px 14px', margin: 0 }}>Sin resultados</p>
            )}
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id, o.name); setOpen(false); setSearch(''); }}
                style={{
                  width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '9px 14px', border: 'none', background: o.id === value ? '#F8FAFC' : 'none',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
                  borderLeft: `3px solid ${o.id === value ? '#ff5e3a' : 'transparent'}`,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                onMouseLeave={e => (e.currentTarget.style.background = o.id === value ? '#F8FAFC' : 'none')}
              >
                <span style={{ color: '#0F172A', fontWeight: o.id === value ? 700 : 400 }}>{o.name}</span>
                {o.parent_name && (
                  <span style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{o.parent_name}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <span className={styles.fieldError}>{error}</span>}
    </div>
  );
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

  /* ── Org data from DB ── */
  const { data: positionNodes = [] } = useQuery({
    queryKey: ['org-nodes', 'cargo'],
    queryFn:  () => systemConfigService.getOrgNodesBySlug('cargo'),
    staleTime: 5 * 60_000,
  });

  const { data: areaNodes = [] } = useQuery({
    queryKey: ['org-nodes', 'area'],
    queryFn:  () => systemConfigService.getOrgNodesBySlug('area'),
    staleTime: 5 * 60_000,
  });

  const { data: deptNodes = [] } = useQuery({
    queryKey: ['org-nodes', 'departamento'],
    queryFn:  () => systemConfigService.getOrgNodesBySlug('departamento'),
    staleTime: 5 * 60_000,
  });

  /* Merge area + department nodes for the department field */
  const deptOptions = useMemo(() => {
    const all = [...deptNodes, ...areaNodes];
    const seen = new Set<string>();
    return all.filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; });
  }, [deptNodes, areaNodes]);

  /* ── Sedes (locations) ── */
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: modulesService.getLocations,
    staleTime: Infinity,
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
        {/* ── Sección 01: Contacto ── */}
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
                  style={{ width: 96, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', paddingLeft: 10, paddingRight: 8, height: '100%' }}
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
              <div className={styles.inputWrap} style={{ flex: 1 }}>
                <input
                  {...register('phone')}
                  id="phone" type="tel" placeholder="300 000 0000"
                  autoComplete="tel" inputMode="tel"
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
                id="username" type="text" placeholder="juan_perez"
                autoComplete="username" autoCorrect="off" autoCapitalize="none"
                className={`${styles.fieldInput} ${errors.username ? styles.isErr : ''}`}
              />
              <span className={styles.fieldIcon} style={{ fontSize: 13, fontWeight: 700, opacity: 0.45 }}>@</span>
            </div>
            <span className={styles.fieldHint}>Para iniciar sesión sin usar tu email</span>
            {errors.username && <span className={styles.fieldError}>{errors.username.message}</span>}
          </div>
        </div>

        <div className={styles.sectionDivider} />

        {/* ── Sección 02: Organización ── */}
        <div className={styles.formSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionNum}>02</span>
            <div>
              <div className={styles.sectionTitle}>Información organizacional</div>
              <div className={styles.sectionSub}>Tu posición dentro de la estructura de la empresa</div>
            </div>
          </div>

          <div className={styles.fieldGrid}>
            {/* Cargo / job title */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Cargo <span className={styles.req}>*</span>
              </label>
              <Controller
                control={control}
                name="job_title"
                render={({ field }) =>
                  positionNodes.length > 0 ? (
                    <OrgSelect
                      value={watch('position_node_id') ?? ''}
                      onChange={(id, name) => {
                        setValue('position_node_id', id, { shouldDirty: true });
                        field.onChange(name);
                      }}
                      options={positionNodes}
                      placeholder="Selecciona tu cargo…"
                      icon={<Briefcase size={14} />}
                      error={errors.job_title?.message}
                    />
                  ) : (
                    <div className={styles.inputWrap}>
                      <input
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        id="job_title" type="text" placeholder="Ej: Técnico Senior"
                        className={`${styles.fieldInput} ${errors.job_title ? styles.isErr : ''}`}
                      />
                      <span className={styles.fieldIcon}><Briefcase size={15} /></span>
                      {errors.job_title && <span className={styles.fieldError}>{errors.job_title.message}</span>}
                    </div>
                  )
                }
              />
            </div>

            {/* Área / Departamento */}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Área / Departamento <span className={styles.req}>*</span>
              </label>
              <Controller
                control={control}
                name="department"
                render={({ field }) =>
                  deptOptions.length > 0 ? (
                    <OrgSelect
                      value={watch('org_node_id') ?? ''}
                      onChange={(id, name) => {
                        setValue('org_node_id', id, { shouldDirty: true });
                        field.onChange(name);
                      }}
                      options={deptOptions}
                      placeholder="Selecciona tu área…"
                      icon={<Building2 size={14} />}
                      error={errors.department?.message}
                    />
                  ) : (
                    <div className={styles.inputWrap}>
                      <input
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        id="department" type="text" placeholder="Ej: Soporte TI"
                        className={`${styles.fieldInput} ${errors.department ? styles.isErr : ''}`}
                      />
                      <span className={styles.fieldIcon}><Building2 size={15} /></span>
                      {errors.department && <span className={styles.fieldError}>{errors.department.message}</span>}
                    </div>
                  )
                }
              />
            </div>
          </div>

          {/* Sede principal */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="primary_sede">
              Sede principal <span className={styles.req}>*</span>
            </label>
            {!locationsLoading && locations.length === 0 ? (
              <>
                <div className={styles.inputWrap}>
                  <input
                    {...register('primary_sede')}
                    id="primary_sede"
                    type="text"
                    placeholder="Ej: Sede Central"
                    className={`${styles.fieldInput} ${errors.primary_sede ? styles.isErr : ''}`}
                  />
                  <span className={styles.fieldIcon}><MapPin size={15} /></span>
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                  No hay sedes configuradas. Escribe el nombre de tu sede.
                </span>
              </>
            ) : (
              <div className={styles.inputWrap}>
                <select
                  {...register('primary_sede')}
                  id="primary_sede"
                  className={`${styles.fieldInput} ${styles.fieldSelect} ${errors.primary_sede ? styles.isErr : ''}`}
                >
                  <option value="">{locationsLoading ? 'Cargando…' : 'Seleccionar sede…'}</option>
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
            )}
            {errors.primary_sede && <span className={styles.fieldError}>{errors.primary_sede.message}</span>}
          </div>

        </div>

        <div className={styles.sectionDivider} />

        {/* ── Sección 03: Residencia ── */}
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
                id="address" type="text" placeholder="Calle 123 # 45-67"
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
