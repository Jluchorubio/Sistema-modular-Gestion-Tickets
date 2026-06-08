'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Network, CalendarClock, History, SlidersHorizontal,
  Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight,
  ExternalLink, Shield, Users, ShieldCheck, ShieldAlert,
  Upload, Zap, AlertTriangle, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Lock,
  type LucideIcon,
} from 'lucide-react';
import { uploadService } from '@/services/upload.service';
import { systemConfigService } from '@/services/system-config.service';
import { usePermission }        from '@/hooks/usePermission';
import { usePermissionsStore }  from '@/stores/permissions.store';
import { useSuperadminGuard }   from '@/hooks/useSuperadminGuard';
import { Spinner }              from '@/components/ui/Spinner';
import { useCriticalChange }    from '@/hooks/useCriticalChange';
import { CriticalChangeModal }  from '@/components/config/CriticalChangeModal';
import { PendingChangesBar }    from '@/components/config/PendingChangesBar';
import { useConfigPending }     from '@/stores/configPending.store';
import { OrgFlowTab }           from '@/components/config/OrgFlowTab';
import type {
  Company, BusinessHour, Holiday, AuditLog,
  PriorityFormula, PriorityPreview,
  SlaRule, OrgNode,
} from '@/services/system-config.service';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';
import styles from './config.module.css';
import Link from 'next/link';

type Tab = 'empresa' | 'organigrama' | 'prioridad' | 'calendario' | 'auditoria' | 'seguridad';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'empresa',     label: 'Empresa',         Icon: Building2         },
  { key: 'organigrama', label: 'Organigrama',     Icon: Network           },
  { key: 'prioridad',   label: 'Motor Prioridad', Icon: SlidersHorizontal },
  { key: 'calendario',  label: 'Calendario SLA',  Icon: CalendarClock     },
  { key: 'auditoria',   label: 'Auditoría',       Icon: History           },
  { key: 'seguridad',   label: 'Seguridad',       Icon: Shield            },
];

/* ── Quick links ────────────────────────────────────────────────── */

function QuickLinks() {
  const links = [
    {
      href:  '/roles',
      Icon:  Shield,
      label: 'Roles y Permisos',
      desc:  'Roles globales y de módulo, asignación de permisos',
    },
    {
      href:  '/users',
      Icon:  Users,
      label: 'Gestión de Usuarios',
      desc:  'Importación masiva, activación, asignación de roles',
    },
    {
      href:  '/helpdesk/config',
      Icon:  Zap,
      label: 'Config Helpdesk',
      desc:  'SLA tickets, tipos de daño, sedes y calendario del módulo',
    },
    {
      href:  '/inventory/config',
      Icon:  CheckCircle2,
      label: 'Config Inventario',
      desc:  'Categorías de activos, sedes, SLA y calendario del módulo',
    },
    {
      href:  '/requests/config',
      Icon:  AlertTriangle,
      label: 'Config Solicitudes',
      desc:  'SLA solicitudes, tipos de solicitud, calendario del módulo',
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {links.map(({ href, Icon, label, desc }) => (
        <Link key={href} href={href} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          textDecoration: 'none', color: 'inherit', flex: '1 1 200px',
          transition: 'border-color .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,94,58,.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} style={{ color: '#0e2235' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
          </div>
          <ExternalLink size={11} style={{ color: '#cbd5e1', flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}

/* ── Setup checklist ────────────────────────────────────────────── */

function SetupChecklist({ setTab }: { setTab: (t: Tab) => void }) {
  const [open, setOpen] = useState(true);

  const { data: tree  = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const { data: hours = [] } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
    staleTime: 60_000,
  });

  const activeHours = (hours as BusinessHour[]).filter(h => h.is_active);
  const rootNodes   = (tree  as OrgNode[]).length;
  const hasOrg      = rootNodes > 0;

  const checks: { key: string; label: string; done: boolean; info: string; tab: Tab }[] = [
    {
      key:   'org',
      label: 'Estructura organizacional',
      done:  hasOrg,
      info:  hasOrg
        ? `${rootNodes} nodo${rootNodes !== 1 ? 's' : ''} raíz configurado${rootNodes !== 1 ? 's' : ''}`
        : 'Sin nodos — motor de prioridad no puede operar',
      tab: 'organigrama',
    },
    {
      key:   'hours',
      label: 'Horario laboral global',
      done:  activeHours.length > 0,
      info:  activeHours.length > 0
        ? `${activeHours.length} día${activeHours.length !== 1 ? 's' : ''} configurado${activeHours.length !== 1 ? 's' : ''}`
        : 'Sin horario — SLA calculará como 24/7',
      tab: 'calendario',
    },
  ];

  const pending = checks.filter(c => !c.done).length;
  const allDone = pending === 0;

  useEffect(() => { if (allDone) setOpen(false); }, [allDone]);

  const borderColor = allDone ? '#bbf7d0' : pending === checks.length ? '#fca5a5' : '#fde68a';
  const headerBg    = allDone ? '#f0fdf4' : pending === checks.length ? '#fef2f2' : '#fffbeb';

  return (
    <div style={{ marginBottom: 20, border: `1px solid ${borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: headerBg, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}>
        {allDone
          ? <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          : <AlertCircle  size={16} style={{ color: pending === checks.length ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#0e2235' }}>
          {allDone
            ? 'Sistema configurado correctamente'
            : `${pending} configuración${pending !== 1 ? 'es' : ''} pendiente${pending !== 1 ? 's' : ''}`}
        </span>
        {open
          ? <ChevronUp   size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
          : <ChevronDown size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />}
      </button>

      {/* Body */}
      {open && (
        <div style={{ background: '#fff' }}>
          {checks.map((c, i) => (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px',
              borderTop: i === 0 ? `1px solid ${borderColor}` : '1px solid #f1f5f9',
            }}>
              {c.done
                ? <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                : <AlertCircle  size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0e2235' }}>{c.label}</span>
                <span style={{ fontSize: 11, color: c.done ? '#94a3b8' : '#d97706', marginLeft: 8 }}>
                  {c.info}
                </span>
              </div>
              {!c.done && (
                <button
                  onClick={() => setTab(c.tab)}
                  style={{
                    padding: '4px 12px', background: '#fff7ed', color: '#d97706',
                    border: '1px solid #fed7aa', borderRadius: 8, fontSize: 11,
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}>
                  Configurar →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Company tab ────────────────────────────────────────────────── */

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

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

interface CompanyFormErrors {
  name?: string;
  primary_color?: string;
  contact_email?: string;
  contact_phone?: string;
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

function CompanyTab() {
  const qc       = useQueryClient();
  const pending  = useConfigPending();

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

  /* updateMut mantenido para isPending state, pero execute usa snapshot directo */
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
    setLogoPreview(null);
    setEditing(false);
    setErrors({});
  }

  function startEdit() {
    setForm(company!);
    setHexInput(company?.primary_color ?? '');
    setErrors({});
    setEditing(true);
  }

  function handleSave() {
    const errs = validateCompanyForm(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    // Solo campos que acepta UpdateCompanyDto — strip id/slug/created_at/updated_at etc.
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
    if (isValidHex(normalized)) {
      setForm(f => ({ ...f, primary_color: normalized }));
    }
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
                <div style={{
                  width: 14, height: 14, borderRadius: 3, background: brandColor,
                  border: '1px solid rgba(0,0,0,.12)', flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{brandColor}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{company.timezone}</span>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{company.language}</span>
              </div>
            </div>
          </div>
          <button className={styles.btnEdit} onClick={startEdit}>
            <Pencil size={13} /> Editar
          </button>
        </div>
        <dl className={styles.dl}>
          <dt>Web</dt>           <dd>{company.website      ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt>      <dd>{company.contact_phone ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const currentLogo    = logoPreview ?? form.logo_url ?? null;
  const currentColor   = isValidHex(form.primary_color ?? '') ? form.primary_color! : '#0e2235';
  const colorValid     = !form.primary_color || isValidHex(form.primary_color);

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

      {/* Nombre */}
      <div style={fRow}>
        <label style={fLabel}>Nombre de la empresa *</label>
        <input style={{ ...fInput, borderColor: errors.name ? '#ef4444' : '#e2e8f0' }}
          value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        {errors.name && <div style={fError}>{errors.name}</div>}
      </div>

      {/* Color de marca */}
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

      {/* Zona horaria */}
      <div style={fRow}>
        <label style={fLabel}>Zona horaria</label>
        <select style={{ ...fInput }}
          value={form.timezone ?? ''}
          onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      {/* Idioma */}
      <div style={fRow}>
        <label style={fLabel}>Idioma</label>
        <select style={{ ...fInput }}
          value={form.language ?? ''}
          onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Sitio web */}
      <div style={fRow}>
        <label style={fLabel}>Sitio web</label>
        <input style={fInput} value={form.website ?? ''}
          placeholder="https://ejemplo.com"
          onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
      </div>

      {/* Email contacto */}
      <div style={fRow}>
        <label style={fLabel}>Email de contacto</label>
        <input style={{ ...fInput, borderColor: errors.contact_email ? '#ef4444' : '#e2e8f0' }}
          type="email" value={form.contact_email ?? ''}
          placeholder="contacto@empresa.com"
          onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
        {errors.contact_email && <div style={fError}>{errors.contact_email}</div>}
      </div>

      {/* Teléfono */}
      <div style={fRow}>
        <label style={fLabel}>Teléfono de contacto</label>
        <input style={{ ...fInput, borderColor: errors.contact_phone ? '#ef4444' : '#e2e8f0' }}
          value={form.contact_phone ?? ''}
          placeholder="+57 300 000 0000"
          onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
        {errors.contact_phone && <div style={fError}>{errors.contact_phone}</div>}
      </div>

      <div className={styles.inlineActions}>
        <button className={styles.btnSave} disabled={logoUploading}
          onClick={handleSave}>
          <Check size={13} />
          {pending.hasStaged('empresa') ? 'Actualizar cambio' : 'Guardar'}
        </button>
        <button className={styles.btnCancel} onClick={handleCancel}>
          <X size={13} /> Cancelar
        </button>
      </div>
      {pending.hasStaged('empresa') && (
        <div style={{ fontSize: 11, color: '#ff5e3a', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={12} /> Cambio en cola — aplícalo desde la barra inferior
        </div>
      )}
    </div>
  );
}

/* ── Priority formula helpers (used below) ────────────────────── */

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#94a3b8';

/* ── Priority formula tab ───────────────────────────────────────── */

const PRIORITY_COLOR: Record<string, string> = {
  baja: '#94a3b8', media: '#f59e0b', alta: '#f97316', critica: '#ef4444',
};

function deadlineLabel(hours: number): string {
  const d      = new Date(Date.now() + hours * 3_600_000);
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const diff   = Math.round((new Date(d.toDateString()).getTime() - today.getTime()) / 86_400_000);
  const time   = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `mañana ${time}`;
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`;
}

const PRESETS = [
  { label: 'Balanceado',    cargo: 33, nodo: 33, daño: 34 },
  { label: 'Por daño',      cargo: 20, nodo: 20, daño: 60 },
  { label: 'Por jerarquía', cargo: 55, nodo: 25, daño: 20 },
  { label: 'Por ubicación', cargo: 20, nodo: 55, daño: 25 },
] as const;

const WEIGHT_META = [
  { key: 'cargo' as const, label: 'Jerarquía del cargo', desc: 'Rango jerárquico del solicitante en el organigrama', color: '#0e2235' },
  { key: 'nodo'  as const, label: 'Criticidad del nodo', desc: 'Importancia del nodo organizacional afectado',       color: '#0ea5e9' },
  { key: 'daño'  as const, label: 'Severidad del daño',  desc: 'Gravedad del daño o problema reportado',             color: '#f97316' },
];

const SIM_LABELS: Record<string, string> = {
  cargo: 'Rango del solicitante',
  nodo:  'Criticidad del nodo',
  daño:  'Gravedad del daño',
};

function PrioridadTab() {
  const qc       = useQueryClient();
  const pending  = useConfigPending();

  const { data: formula, isLoading } = useQuery<PriorityFormula | null>({
    queryKey: ['priority-formula'],
    queryFn:  systemConfigService.getPriorityFormula,
  });

  const [w, setW] = useState({ cargo: 25, nodo: 35, daño: 40 });
  const [t, setT] = useState({ critica: 9, alta: 7, media: 5 });
  const [desc, setDesc] = useState('');

  const [sim, setSim]         = useState({ cargo: 5, nodo: 5, daño: 5, urgency: 'media', impact: 'medio' });
  const [preview, setPreview] = useState<PriorityPreview | null>(null);
  const debounceRef           = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!formula) return;
    setW({
      cargo: Math.round(formula.w_cargo * 100),
      nodo:  Math.round(formula.w_nodo  * 100),
      daño:  Math.round(formula.w_daño  * 100),
    });
    setT({
      critica: Number(formula.threshold_critica),
      alta:    Number(formula.threshold_alta),
      media:   Number(formula.threshold_media),
    });
    setDesc(formula.description ?? '');
  }, [formula]);

  const wSum        = w.cargo + w.nodo + w.daño;
  const wValid      = wSum === 100;
  const activePreset = PRESETS.find(p => p.cargo === w.cargo && p.nodo === w.nodo && p.daño === w.daño)?.label ?? null;

  const saveMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.updatePriorityFormula({
        w_cargo: w.cargo / 100, w_nodo: w.nodo / 100, w_daño: w.daño / 100,
        threshold_critica: t.critica, threshold_alta: t.alta, threshold_media: t.media,
        description: desc || undefined,
      }, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priority-formula'] }),
  });

  const previewMut = useMutation({
    mutationFn: () => systemConfigService.previewPriority({
      peso_cargo: sim.cargo, peso_nodo: sim.nodo, peso_daño: sim.daño,
      urgency: sim.urgency, impact: sim.impact,
    }),
    onSuccess: data => setPreview(data),
  });

  // Live simulator: debounced auto-preview
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { previewMut.mutate(); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.cargo, sim.nodo, sim.daño, sim.urgency, sim.impact]);

  const { data: slaRules = [] } = useQuery<SlaRule[]>({
    queryKey: ['sys-sla-rules'],
    queryFn:  systemConfigService.getSlaRules,
    staleTime: 60_000,
  });

  const matchedSla = useMemo(() => {
    if (!preview) return null;
    return (slaRules as SlaRule[]).find(
      r => r.is_active && r.priority === preview.priority && !r.request_type,
    ) ?? null;
  }, [preview, slaRules]);

  if (isLoading) return <Spinner />;

  const tInput: React.CSSProperties = {
    width: 64, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', textAlign: 'center',
  };
  const num: React.CSSProperties = {
    fontSize: 12, fontWeight: 800, minWidth: 38, textAlign: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 6px',
  };

  return (
    <div>
      {/* ── Formula weights ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pesos de la fórmula
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              score = Σ(peso_i × w_i) + urgency_bonus + impact_bonus
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Suma:</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: wValid ? '#22c55e' : '#ef4444' }}>{wSum}%</span>
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => setW({ cargo: p.cargo, nodo: p.nodo, daño: p.daño })}
              style={{
                padding: '4px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s',
                border: activePreset === p.label ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                background: activePreset === p.label ? 'rgba(255,94,58,.08)' : '#f8fafc',
                color: activePreset === p.label ? '#ff5e3a' : '#64748b',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Weight cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {WEIGHT_META.map(({ key, label, desc: metaDesc, color }) => (
            <div key={key} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0e2235', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 12, lineHeight: 1.4 }}>{metaDesc}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color, textAlign: 'center', lineHeight: 1, marginBottom: 10 }}>
                {w[key]}%
              </div>
              <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${w[key]}%`, background: color, borderRadius: 3, transition: 'width .2s' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button
                  onClick={() => setW(p => ({ ...p, [key]: Math.max(0, p[key] - 5) }))}
                  style={{ width: 32, height: 28, border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#fff', fontSize: 18, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  −
                </button>
                <input type="number" min={0} max={100} value={w[key]}
                  onChange={e => setW(p => ({ ...p, [key]: Math.min(100, Math.max(0, +e.target.value)) }))}
                  style={{ width: 52, textAlign: 'center', border: `1px solid ${color}60`, borderRadius: 8,
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', padding: '3px 4px', color }} />
                <button
                  onClick={() => setW(p => ({ ...p, [key]: Math.min(100, p[key] + 5) }))}
                  style={{ width: 32, height: 28, border: '1px solid #e2e8f0', borderRadius: 8,
                    background: '#fff', fontSize: 18, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {!wValid && (
          <div style={{ marginTop: 12, fontSize: 11, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={12} /> Los pesos deben sumar 100%. Faltan/sobran {Math.abs(100 - wSum)}%.
          </div>
        )}
      </div>

      {/* ── Thresholds ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
          Umbrales de prioridad
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {(['critica', 'alta', 'media'] as const).map(k => (
            <div key={k}>
              <div style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[k], marginBottom: 4, textTransform: 'uppercase' }}>
                {k} ≥
              </div>
              <input type="number" min={0} max={15} step={0.5} value={t[k]}
                style={tInput}
                onChange={e => setT(prev => ({ ...prev, [k]: +e.target.value }))} />
            </div>
          ))}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Descripción</div>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              style={{ ...tInput, width: '100%', textAlign: 'left' }}
              placeholder="ej. Fórmula ajustada Q2 2026" />
          </div>
        </div>
      </div>

      {/* ── Save ── */}
      <div style={{ marginBottom: 24 }}>
        <button
          disabled={!wValid}
          onClick={() => {
            const wSnap = { ...w }; const tSnap = { ...t }; const dSnap = desc;
            pending.stage({
              id:    'prioridad',
              label: 'Fórmula de Prioridad',
              execute: async (auth) => {
                await systemConfigService.updatePriorityFormula({
                  w_cargo: wSnap.cargo / 100, w_nodo: wSnap.nodo / 100, w_daño: wSnap.daño / 100,
                  threshold_critica: tSnap.critica, threshold_alta: tSnap.alta, threshold_media: tSnap.media,
                  description: dSnap || undefined,
                }, auth);
                qc.invalidateQueries({ queryKey: ['priority-formula'] });
              },
            });
          }}
          style={{
            padding: '8px 20px',
            background: !wValid ? '#e2e8f0' : pending.hasStaged('prioridad') ? '#20c933' : '#0e2235',
            color: wValid ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: wValid ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Check size={13} /> {pending.hasStaged('prioridad') ? 'En cola ✓' : 'Guardar fórmula'}
        </button>
        {saveMut.isSuccess && (
          <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>Fórmula actualizada correctamente.</p>
        )}
      </div>

      {/* ── Live Simulator ── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Simulador de prioridad
          </div>
          <span style={{ fontSize: 10, color: previewMut.isPending ? '#ff5e3a' : '#94a3b8' }}>
            {previewMut.isPending ? 'Calculando…' : 'Actualiza automáticamente'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
          Ajusta los parámetros y el resultado se calcula en tiempo real con la fórmula guardada.
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['cargo', 'nodo', 'daño'] as const).map(k => (
            <div key={k} style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                {SIM_LABELS[k]}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={1} max={10} step={1} value={sim[k]}
                  onChange={e => setSim(p => ({ ...p, [k]: +e.target.value }))}
                  style={{ flex: 1 }} />
                <span style={{ ...num, color: weightColor(sim[k]) }}>{sim[k]}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: preview ? 16 : 0 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Urgencia del caso</div>
            <select value={sim.urgency} onChange={e => setSim(p => ({ ...p, urgency: e.target.value }))}
              style={{ ...tInput, width: 130, textAlign: 'left' }}>
              <option value="urgente">Urgente (+1.5)</option>
              <option value="alta">Alta (+1.0)</option>
              <option value="media">Media (+0.5)</option>
              <option value="baja">Baja (+0)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Impacto operativo</div>
            <select value={sim.impact} onChange={e => setSim(p => ({ ...p, impact: e.target.value }))}
              style={{ ...tInput, width: 130, textAlign: 'left' }}>
              <option value="critico">Crítico (+1.5)</option>
              <option value="alto">Alto (+1.0)</option>
              <option value="medio">Medio (+0.5)</option>
              <option value="bajo">Bajo (+0)</option>
            </select>
          </div>
        </div>

        {preview && (
          <div style={{
            background: '#fff', border: `2px solid ${PRIORITY_COLOR[preview.priority]}30`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
              flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9',
            }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Score</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#0e2235', lineHeight: 1 }}>{preview.score}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Base</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>{preview.base}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Bonos</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  urgencia +{preview.urgency_bonus} · impacto +{preview.impact_bonus}
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  fontSize: 15, fontWeight: 900, padding: '5px 16px', borderRadius: 8,
                  background: `${PRIORITY_COLOR[preview.priority]}18`,
                  color: PRIORITY_COLOR[preview.priority],
                  border: `1.5px solid ${PRIORITY_COLOR[preview.priority]}40`,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {preview.priority}
                </span>
              </div>
            </div>

            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                SLA estimado
              </div>
              {matchedSla ? (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Primera respuesta</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>{matchedSla.hours_to_first_response}h</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {deadlineLabel(matchedSla.hours_to_first_response)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 2 }}>Resolución</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>{matchedSla.hours_to_resolve}h</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {deadlineLabel(matchedSla.hours_to_resolve)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>regla global · prioridad {preview.priority}</span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={12} />
                  Sin regla SLA para prioridad <strong>{preview.priority}</strong>. Configura en /requests/config.
                </div>
              )}
            </div>

            <div style={{ padding: '10px 16px', background: '#f8fafc' }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Routing automático
              </div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                El ticket se asignaría al <strong>administrador del módulo destino</strong>.
                Sin admin activo → escalado automático a superadmin.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Calendar SLA tab ───────────────────────────────────────────── */

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function SyncColombiaBtn({ onSync }: { onSync: () => void }) {
  const year = new Date().getFullYear();
  const [result, setResult] = useState<{ synced: number; skipped: number } | null>(null);
  const mut = useMutation({
    mutationFn: () => systemConfigService.syncColombiaHolidays(year),
    onSuccess: (data) => { setResult(data); onSync(); setTimeout(() => setResult(null), 4_000); },
  });
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      title={`Importar feriados de Colombia ${year} desde Nager.Date`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
        background: mut.isPending ? '#f8fafc' : '#fff', border: '1px solid #e2e8f0',
        borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit', color: result ? '#22c55e' : '#475569',
      }}>
      {mut.isPending
        ? <><Spinner /><span>Sincronizando…</span></>
        : result
        ? <><Check size={12} /> {result.synced} feriados importados</>
        : <>🇨🇴 Sync CO {year}</>}
    </button>
  );
}

function CalendarioTab() {
  const qc       = useQueryClient();
  const critical = useCriticalChange();

  const { data: hours    = [], isLoading: loadingHours    } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
    staleTime: 60_000,
  });
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery<Holiday[]>({
    queryKey: ['sys-sla-holidays'],
    queryFn:  () => systemConfigService.getHolidays(),
    staleTime: 60_000,
  });

  const hourMap = useMemo(() => {
    const m = new Map<number, BusinessHour>();
    (hours as BusinessHour[]).forEach(h => m.set(h.day_of_week, h));
    return m;
  }, [hours]);

  const [editDay, setEditDay] = useState<number | null>(null);
  const [dayForm, setDayForm] = useState({ start_time: '07:00', end_time: '17:00', is_active: true });

  const upsertMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.upsertBusinessHour(
        { day_of_week: editDay!, ...dayForm }, auth,
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-sla-hours'] }); setEditDay(null); },
  });

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm,    setHolidayForm]    = useState({ holiday_date: '', name: '' });

  const addHolidayMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.createHoliday(holidayForm, auth),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] });
      setShowAddHoliday(false);
      setHolidayForm({ holiday_date: '', name: '' });
    },
  });
  const delHolidayMut = useMutation({
    mutationFn: ({ id, auth }: { id: string; auth: CriticalAuthData }) =>
      systemConfigService.deleteHoliday(id, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] }),
  });

  function openEditDay(dow: number) {
    const existing = hourMap.get(dow);
    setDayForm({
      start_time: existing?.start_time ?? '07:00',
      end_time:   existing?.end_time   ?? '17:00',
      is_active:  existing?.is_active  ?? true,
    });
    setEditDay(dow);
  }

  if (loadingHours || loadingHolidays) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Horario laboral</div>
        <span className={styles.listMeta}>Base global — cada módulo puede sobreescribirlo en su propia config</span>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Los días sin configurar se tratan como no laborales. El sistema salta feriados y horas fuera de rango.
      </div>

      <div className={styles.list}>
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const bh        = hourMap.get(dow);
          const isEditing = editDay === dow;
          return (
            <div key={dow} className={styles.listRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <span className={styles.listName} style={{ minWidth: 96, opacity: bh?.is_active === false ? 0.45 : 1 }}>
                  {DAY_NAMES[dow]}
                </span>
                {!isEditing && (
                  bh
                    ? <span className={styles.listMeta} style={{ color: bh.is_active ? '#22c55e' : '#94a3b8' }}>
                        {bh.is_active ? `${bh.start_time.slice(0, 5)} – ${bh.end_time.slice(0, 5)}` : 'Inactivo'}
                      </span>
                    : <span className={styles.listMeta} style={{ color: '#94a3b8' }}>Sin configurar</span>
                )}
              </div>

              {isEditing ? (
                <div className={styles.slaEditRow}>
                  <label className={styles.fieldLabel}>Inicio</label>
                  <input type="time" className={styles.slaInput} value={dayForm.start_time}
                    onChange={e => setDayForm(f => ({ ...f, start_time: e.target.value }))} />
                  <label className={styles.fieldLabel}>Fin</label>
                  <input type="time" className={styles.slaInput} value={dayForm.end_time}
                    onChange={e => setDayForm(f => ({ ...f, end_time: e.target.value }))} />
                  <button className={styles.iconBtn}
                    title={dayForm.is_active ? 'Activo' : 'Inactivo'}
                    onClick={() => setDayForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ color: dayForm.is_active ? '#22c55e' : '#94a3b8' }}>
                    {dayForm.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button className={styles.btnSave} disabled={upsertMut.isPending}
                    onClick={() => critical.triggerCritical(
                      { entityLabel: 'Horario Laboral', description: `Modifica el horario del ${DAY_NAMES[dow]} — afecta el cálculo de SLA activo` },
                      async (auth) => { await upsertMut.mutateAsync(auth); },
                    )}>
                    <Check size={13} />
                  </button>
                  <button className={styles.btnCancel} onClick={() => setEditDay(null)}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button className={styles.btnEdit} onClick={() => openEditDay(dow)}>
                  <Pencil size={12} /> {bh ? 'Editar' : 'Configurar'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Holidays */}
      <div className={styles.sectionHeader} style={{ marginTop: 32 }}>
        <div className={styles.sectionTitle}>Feriados globales</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SyncColombiaBtn onSync={() => qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] })} />
          {!showAddHoliday && (
            <button className={styles.btnPrimary} onClick={() => setShowAddHoliday(true)}>
              <Plus size={13} /> Agregar
            </button>
          )}
        </div>
      </div>

      {showAddHoliday && (
        <div className={styles.inlineForm}>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Fecha</label>
            <input type="date" className={styles.fieldInput} value={holidayForm.holiday_date}
              onChange={e => setHolidayForm(f => ({ ...f, holiday_date: e.target.value }))} />
          </div>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Nombre</label>
            <input className={styles.fieldInput} placeholder="ej. Día de la Independencia"
              value={holidayForm.name}
              onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className={styles.inlineActions}>
            <button className={styles.btnSave}
              disabled={addHolidayMut.isPending || !holidayForm.holiday_date || !holidayForm.name.trim()}
              onClick={() => critical.triggerCritical(
                { entityLabel: 'Festivo', description: `Agregar "${holidayForm.name}" al calendario global — afecta el cálculo de SLA` },
                async (auth) => { await addHolidayMut.mutateAsync(auth); },
              )}>
              <Check size={13} /> {addHolidayMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => setShowAddHoliday(false)}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(holidays as Holiday[]).filter(h => !h.module_id).length === 0 ? (
        <div className={styles.empty}>Sin feriados globales configurados.</div>
      ) : (
        <div className={styles.list}>
          {(holidays as Holiday[]).filter(h => !h.module_id).map(h => (
            <div key={h.id} className={styles.listRow} style={{ opacity: h.is_active ? 1 : 0.45 }}>
              <div>
                <span className={styles.listName}>
                  {new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className={styles.listMeta}> · {h.name}</span>
              </div>
              <button className={styles.iconBtnDanger} title="Eliminar"
                disabled={delHolidayMut.isPending}
                onClick={() => critical.triggerCritical(
                  { entityLabel: 'Eliminar Festivo', description: `Quitar "${h.name}" del calendario global` },
                  async (auth) => { await delHolidayMut.mutateAsync({ id: h.id, auth }); },
                )}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <CriticalChangeModal {...critical} />
    </div>
  );
}

/* ── Auditoría tab ──────────────────────────────────────────────── */

const ACTION_STYLE: Record<string, React.CSSProperties> = {
  CREATE: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
  UPDATE: { background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' },
  DELETE: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

function AuditoriaTab() {
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['sys-config-audit'],
    queryFn:  () => systemConfigService.getAuditLogs({ limit: 100 }),
    staleTime: 30_000,
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Historial de cambios críticos
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
        Todos los cambios en SLA, tipos de daño y tipos de solicitud quedan registrados con motivo y verificación.
      </div>

      {logs.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
          Sin registros de auditoría aún.
        </div>
      ) : (
        <div>
          {logs.map(log => {
            const aStyle = ACTION_STYLE[log.action] ?? ACTION_STYLE.UPDATE;
            const date   = new Date(log.created_at);
            return (
              <div key={log.id} style={{
                padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0',
                borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, ...aStyle }}>
                    {log.action}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0e2235' }}>
                    {log.entity_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ flex: 1 }} />
                  {log.verified_2fa ? (
                    <span title="Verificado con 2FA">
                      <ShieldCheck size={13} style={{ color: '#22c55e' }} />
                    </span>
                  ) : (
                    <span title="Sin 2FA">
                      <ShieldAlert size={13} style={{ color: '#f59e0b' }} />
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                    {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
                  <strong style={{ color: '#0e2235' }}>{log.user_name}</strong>
                  {log.username && <span style={{ color: '#94a3b8' }}> (@{log.username})</span>}
                  {log.ip_address && <span style={{ color: '#94a3b8' }}> · {log.ip_address}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', background: '#f8fafc',
                  padding: '6px 10px', borderRadius: 4, borderLeft: '3px solid #e2e8f0' }}>
                  "{log.reason}"
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Security tab ───────────────────────────────────────────────── */

const CRITICAL_OPS = [
  'Configuración de Empresa',
  'Fórmula de Prioridad',
  'Horario Laboral Global',
  'Festivos del Calendario',
  'Reglas SLA',
  'Tipos de daño',
  'Tipos de solicitud',
  'Nodos organizacionales',
  'Tipos de estructura',
] as const;

const ACTIVE_PROTECTIONS = [
  {
    key:   'totp',
    label: 'Re-autenticación 2FA para operaciones críticas',
    desc:  'Contraseña + TOTP requeridos para cambios irreversibles',
    icon:  'totp',
    ok:    true,
  },
  {
    key:   'rbac',
    label: 'Motor RBAC activo',
    desc:  '60 permisos granulares · roles globales + por módulo',
    icon:  'rbac',
    ok:    true,
  },
  {
    key:   'audit',
    label: 'Auditoría de cambios críticos',
    desc:  'Cada operación crítica registra IP, usuario y diff',
    icon:  'audit',
    ok:    true,
  },
  {
    key:   'bcrypt',
    label: 'Contraseñas hasheadas con bcrypt',
    desc:  'Ninguna contraseña se almacena en texto claro',
    icon:  'bcrypt',
    ok:    true,
  },
  {
    key:   'jwt',
    label: 'Tokens JWT firmados por servidor',
    desc:  'Access token de corta vida + refresh token rotativo',
    icon:  'jwt',
    ok:    true,
  },
] as const;

function SeguridadTab() {
  const { data: recentCritical = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', { critical: true }],
    queryFn:  () => systemConfigService.getAuditLogs({ limit: 8 }),
    staleTime: 30_000,
  });

  const criticalLogs = (recentCritical as AuditLog[]).filter(l => l.verified_2fa);

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: 16, marginBottom: 12,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 900, color: '#0e2235',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
  };

  return (
    <div>
      {/* ── Active protections ── */}
      <div style={card}>
        <div style={sectionTitle}>Protecciones activas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACTIVE_PROTECTIONS.map(p => (
            <div key={p.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', background: '#f0fdf4',
              border: '1px solid #bbf7d0', borderRadius: 8,
            }}>
              <ShieldCheck size={16} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0e2235' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Ops requiring re-auth ── */}
      <div style={card}>
        <div style={sectionTitle}>Operaciones que requieren re-autenticación</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
          Estas operaciones exigen contraseña + código TOTP antes de ejecutarse.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CRITICAL_OPS.map(op => (
            <span key={op} style={{
              padding: '3px 10px', background: 'rgba(255,94,58,.06)',
              border: '1px solid rgba(255,94,58,.2)', borderRadius: 8,
              fontSize: 10, fontWeight: 700, color: '#ff5e3a',
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              {op}
            </span>
          ))}
        </div>
      </div>

      {/* ── Recent critical operations ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={sectionTitle}>Operaciones críticas recientes</div>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>Últimas verificadas con 2FA</span>
        </div>
        {isLoading ? (
          <Spinner />
        ) : criticalLogs.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 12,
            background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
            Sin operaciones críticas registradas aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {criticalLogs.map(log => (
              <div key={log.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8,
              }}>
                <ShieldCheck size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0e2235' }}>
                    {log.entity_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                    {log.action} · {log.user_name}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleString('es-CO', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                {log.ip_address && (
                  <span style={{
                    fontSize: 10, color: '#94a3b8', flexShrink: 0,
                    fontFamily: 'monospace', background: '#f1f5f9',
                    padding: '1px 5px', borderRadius: 3,
                  }}>
                    {log.ip_address}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Future policies placeholder ── */}
      <div style={{ ...card, borderStyle: 'dashed', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShieldAlert size={14} style={{ color: '#94a3b8' }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Política de contraseñas — Próximamente
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
          Longitud mínima, complejidad, expiración, 2FA obligatorio para todos los usuarios.
          En desarrollo para la próxima fase.
        </div>
      </div>
    </div>
  );
}

/* ── Org-required screen ────────────────────────────────────────── */

const GUARDED_TABS: Tab[] = ['prioridad', 'calendario', 'auditoria'];

function OrgRequiredScreen({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 20px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <Lock size={24} style={{ color: '#94a3b8' }} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0e2235', marginBottom: 8 }}>
        Requiere estructura organizacional
      </div>
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.6 }}>
        El motor de prioridad, el calendario SLA y la auditoría necesitan al menos un nodo
        en el organigrama para operar correctamente.
      </p>
      <button
        onClick={onConfigure}
        style={{
          padding: '9px 22px', background: '#0e2235', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex',
          alignItems: 'center', gap: 6,
        }}>
        <Network size={14} /> Configurar organigrama
      </button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function GlobalConfigPage() {
  const { status } = useSuperadminGuard();
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:config');
  const [tab, setTab] = useState<Tab>('empresa');

  const { data: orgTree = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const hasOrg = (orgTree as OrgNode[]).length > 0;

  // Auto-redirect if active tab becomes blocked (e.g. org nodes deleted)
  useEffect(() => {
    if (!hasOrg && GUARDED_TABS.includes(tab)) setTab('organigrama');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOrg]);

  if (status === 'loading') return null;
  if (status === 'unauthorized') return null;
  if (loaded && !canView) return null;

  const isBlocked = (t: Tab) => !hasOrg && GUARDED_TABS.includes(t);

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Configuración del Sistema</h1>
            <p className={styles.subtitle}>Solo superadmin · Cambios aplicados inmediatamente</p>
          </div>
        </div>

        <QuickLinks />

        <SetupChecklist setTab={setTab} />

        <div className={styles.tabBar}>
          {TABS.map(({ key, label, Icon }) => {
            const blocked = isBlocked(key);
            return (
              <button
                key={key}
                type="button"
                className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
                style={blocked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                title={blocked ? 'Requiere estructura organizacional configurada' : undefined}
                onClick={() => blocked ? setTab('organigrama') : setTab(key)}
              >
                {blocked ? <Lock size={12} /> : <Icon size={13} />}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.content}>
          {tab === 'empresa'     && <CompanyTab />}
          {tab === 'organigrama' && <OrgFlowTab />}
          {tab === 'prioridad'   && (hasOrg ? <PrioridadTab />   : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'calendario'  && (hasOrg ? <CalendarioTab />  : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'auditoria'   && (hasOrg ? <AuditoriaTab />   : <OrgRequiredScreen onConfigure={() => setTab('organigrama')} />)}
          {tab === 'seguridad'   && <SeguridadTab />}
        </div>

      </div>

      {/* Barra de cambios pendientes — aparece cuando hay cambios en cola */}
      <PendingChangesBar />
    </div>
  );
}
