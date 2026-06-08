'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Check, X, Upload, AlertTriangle } from 'lucide-react';
import { uploadService }       from '@/services/upload.service';
import { systemConfigService } from '@/services/system-config.service';
import { useConfigPending }    from '@/stores/configPending.store';
import { Spinner }             from '@/components/ui/Spinner';
import type { Company }        from '@/services/system-config.service';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';
import styles from '../../config.module.css';

const TIMEZONES = [
  'America/Bogota', 'America/Lima', 'America/Caracas', 'America/La_Paz',
  'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo',
  'America/Mexico_City', 'America/New_York', 'America/Los_Angeles',
  'Europe/Madrid', 'Europe/London', 'UTC',
] as const;

const LANGUAGES = [
  { value: 'es-CO', label: 'Español (Colombia)' },
  { value: 'es-ES', label: 'Español (España)'   },
  { value: 'en-US', label: 'English (US)'        },
] as const;

function isValidHex(v: string) { return /^#([A-Fa-f0-9]{6})$/.test(v); }

interface CompanyFormErrors {
  name?: string; primary_color?: string; contact_email?: string; contact_phone?: string;
}

function validateCompanyForm(form: Partial<Company>): CompanyFormErrors {
  const errs: CompanyFormErrors = {};
  if (!form.name?.trim() || form.name.trim().length < 2)
    errs.name = 'El nombre debe tener al menos 2 caracteres';
  if (form.primary_color && !isValidHex(form.primary_color))
    errs.primary_color = 'Debe ser un color hex válido (#RRGGBB)';
  if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email))
    errs.contact_email = 'Email inválido';
  if (form.contact_phone && form.contact_phone.length > 30)
    errs.contact_phone = 'Máximo 30 caracteres';
  return errs;
}

const fRow:   React.CSSProperties = { marginBottom: 14 };
const fLabel: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 };
const fInput: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', color: '#0e2235', boxSizing: 'border-box',
};
const fError: React.CSSProperties = { fontSize: 11, color: '#ef4444', marginTop: 3 };

export function CompanyTab() {
  const qc      = useQueryClient();
  const pending = useConfigPending();

  const { data: company, isLoading } = useQuery({
    queryKey: ['sys-config-company'],
    queryFn:  systemConfigService.getCompany,
  });

  const [editing,       setEditing]       = useState(false);
  const [form,          setForm]          = useState<Partial<Company>>({});
  const [errors,        setErrors]        = useState<CompanyFormErrors>({});
  const [logoPreview,   setLogoPreview]   = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [hexInput,      setHexInput]      = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  /* updateMut kept for isPending state; execute uses snapshot directly */
  const updateMut = useMutation({
    mutationFn: (p: { data: typeof form; auth: CriticalAuthData }) =>
      systemConfigService.updateCompany(p.data, p.auth),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-config-company'] });
      qc.invalidateQueries({ queryKey: ['company-public'] });
    },
  });

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
    setLogoUploading(true);
    try {
      const url = await uploadService.uploadFile(file);
      setForm(f => ({ ...f, logo_url: url }));
    } catch {
      setLogoPreview(null);
    } finally {
      setLogoUploading(false);
    }
  }

  function handleCancel() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null); setEditing(false); setErrors({});
  }

  function startEdit() {
    setForm(company!);
    setHexInput(company?.primary_color ?? '');
    setErrors({}); setEditing(true);
  }

  function handleSave() {
    const errs = validateCompanyForm(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    const { name, timezone, language, logo_url, primary_color, website, contact_email, contact_phone } = form;
    const snapshot = { name, timezone, language, logo_url, primary_color, website, contact_email, contact_phone };
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    pending.stage({
      id:    'empresa',
      label: 'Configuración de Empresa',
      execute: async (auth) => {
        await systemConfigService.updateCompany(snapshot, auth);
        qc.invalidateQueries({ queryKey: ['sys-config-company'] });
        qc.invalidateQueries({ queryKey: ['company-public'] });
      },
    });
    setEditing(false);
  }

  function handleColorPickerChange(hex: string) {
    setHexInput(hex);
    setForm(f => ({ ...f, primary_color: hex }));
  }

  function handleHexInputChange(val: string) {
    const normalized = val.startsWith('#') ? val : `#${val}`;
    setHexInput(val);
    if (isValidHex(normalized)) setForm(f => ({ ...f, primary_color: normalized }));
  }

  if (isLoading) return <Spinner />;
  if (!company)  return <p className={styles.empty}>No hay datos de empresa.</p>;

  if (!editing) {
    const brandColor = company.primary_color ?? '#0e2235';
    return (
      <div>
        <div className={styles.sectionHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 8, border: '1px solid #e2e8f0',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f8fafc', flexShrink: 0,
            }}>
              {company.logo_url
                ? <img src={company.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Building2 size={22} style={{ color: '#94a3b8' }} />}
            </div>
            <div>
              <div className={styles.sectionTitle} style={{ margin: 0 }}>{company.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: brandColor, border: '1px solid rgba(0,0,0,.12)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{brandColor}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{company.timezone}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{company.language}</span>
              </div>
            </div>
          </div>
          <button className={styles.btnEdit} onClick={startEdit}><Pencil size={13} /> Editar</button>
        </div>
        <dl className={styles.dl}>
          <dt>Web</dt>           <dd>{company.website      ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt>      <dd>{company.contact_phone ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const currentLogo  = logoPreview ?? form.logo_url ?? null;
  const currentColor = isValidHex(form.primary_color ?? '') ? form.primary_color! : '#0e2235';
  const colorValid   = !form.primary_color || isValidHex(form.primary_color);

  return (
    <div>
      <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Editar empresa</div>

      {pending.hasStaged('empresa') && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fff7ed',
          border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412',
          display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} />
          Cambio en cola — aplícalo desde la barra inferior para guardar en la base de datos.
        </div>
      )}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <div
          onClick={() => !logoUploading && logoInputRef.current?.click()}
          style={{
            width: 72, height: 72, borderRadius: 8, border: '2px dashed #cbd5e1',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff', flexShrink: 0, cursor: logoUploading ? 'wait' : 'pointer',
          }}>
          {currentLogo
            ? <img src={currentLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Building2 size={24} style={{ color: '#cbd5e1' }} />}
        </div>
        <div>
          <button type="button" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: '#0e2235', fontWeight: 600,
            }}>
            <Upload size={13} /> {logoUploading ? 'Subiendo…' : 'Cambiar logo'}
          </button>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>JPG, PNG, WebP · máx 5 MB</div>
        </div>
        <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }} onChange={handleLogoChange} />
      </div>

      <div style={fRow}>
        <label style={fLabel}>Nombre de la empresa *</label>
        <input style={{ ...fInput, borderColor: errors.name ? '#ef4444' : '#e2e8f0' }}
          value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        {errors.name && <div style={fError}>{errors.name}</div>}
      </div>

      <div style={fRow}>
        <label style={fLabel}>Color de marca</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={currentColor}
            onChange={e => handleColorPickerChange(e.target.value)}
            style={{ width: 40, height: 36, padding: 2, border: '1px solid #e2e8f0',
              borderRadius: 8, cursor: 'pointer', background: '#fff' }} />
          <input style={{ ...fInput, width: 120, borderColor: colorValid ? '#e2e8f0' : '#ef4444' }}
            value={hexInput} placeholder="#0e2235"
            onChange={e => handleHexInputChange(e.target.value)} />
          {colorValid && form.primary_color && (
            <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> Válido
            </span>
          )}
        </div>
        {errors.primary_color && <div style={fError}>{errors.primary_color}</div>}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          Se aplica en tiempo real a toda la UI. Formato #RRGGBB.
        </div>
      </div>

      <div style={fRow}>
        <label style={fLabel}>Zona horaria</label>
        <select style={{ ...fInput }} value={form.timezone ?? ''}
          onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      <div style={fRow}>
        <label style={fLabel}>Idioma</label>
        <select style={{ ...fInput }} value={form.language ?? ''}
          onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      <div style={fRow}>
        <label style={fLabel}>Sitio web</label>
        <input style={fInput} value={form.website ?? ''} placeholder="https://ejemplo.com"
          onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
      </div>

      <div style={fRow}>
        <label style={fLabel}>Email de contacto</label>
        <input style={{ ...fInput, borderColor: errors.contact_email ? '#ef4444' : '#e2e8f0' }}
          type="email" value={form.contact_email ?? ''} placeholder="contacto@empresa.com"
          onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
        {errors.contact_email && <div style={fError}>{errors.contact_email}</div>}
      </div>

      <div style={fRow}>
        <label style={fLabel}>Teléfono de contacto</label>
        <input style={{ ...fInput, borderColor: errors.contact_phone ? '#ef4444' : '#e2e8f0' }}
          value={form.contact_phone ?? ''} placeholder="+57 300 000 0000"
          onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
        {errors.contact_phone && <div style={fError}>{errors.contact_phone}</div>}
      </div>

      <div className={styles.inlineActions}>
        <button className={styles.btnSave} disabled={logoUploading} onClick={handleSave}>
          <Check size={13} />
          {pending.hasStaged('empresa') ? 'Actualizar cambio' : 'Guardar'}
        </button>
        <button className={styles.btnCancel} onClick={handleCancel}><X size={13} /> Cancelar</button>
      </div>
      {pending.hasStaged('empresa') && (
        <div style={{ fontSize: 11, color: '#ff5e3a', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={12} /> Cambio en cola — aplícalo desde la barra inferior
        </div>
      )}
      {/* suppress unused-variable warning — updateMut kept for isPending */}
      <span style={{ display: 'none' }}>{String(updateMut.isPending)}</span>
    </div>
  );
}
