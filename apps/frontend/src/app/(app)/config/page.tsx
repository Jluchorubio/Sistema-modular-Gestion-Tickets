'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Network, CalendarClock, History, SlidersHorizontal,
  Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight,
  ExternalLink, Shield, Users, ShieldCheck, ShieldAlert,
  Upload, Zap, AlertTriangle, Tag, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp,
  type LucideIcon,
} from 'lucide-react';
import { uploadService } from '@/services/upload.service';
import { systemConfigService } from '@/services/system-config.service';
import { modulesService }       from '@/services/modules.service';
import { usePermission }        from '@/hooks/usePermission';
import { usePermissionsStore }  from '@/stores/permissions.store';
import { Spinner }              from '@/components/ui/Spinner';
import { useCriticalChange }    from '@/hooks/useCriticalChange';
import { CriticalChangeModal }  from '@/components/config/CriticalChangeModal';
import { SlaRequestsTab }       from '@/components/config/SlaRequestsTab';
import { DamageTypesTab }       from '@/components/config/DamageTypesTab';
import { RequestTypesTab }      from '@/components/config/RequestTypesTab';
import { SlaTicketsTab }        from '@/components/config/SlaTicketsTab';
import { OrgFlowTab }           from '@/components/config/OrgFlowTab';
import type {
  Company, BusinessHour, Holiday, AuditLog,
  PriorityFormula, PriorityPreview,
  SlaRule, OrgNode,
} from '@/services/system-config.service';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';
import type { SystemModule } from '@/types/module.types';
import styles from './config.module.css';
import Link from 'next/link';

type Tab = 'empresa' | 'organigrama' | 'prioridad' | 'sla-solicitudes' | 'sla-tickets' | 'catalogo' | 'calendario' | 'auditoria';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'empresa',         label: 'Empresa',          Icon: Building2         },
  { key: 'organigrama',     label: 'Organigrama',      Icon: Network           },
  { key: 'prioridad',       label: 'Motor Prioridad',  Icon: SlidersHorizontal },
  { key: 'sla-solicitudes', label: 'SLA Solicitudes',  Icon: AlertTriangle     },
  { key: 'sla-tickets',     label: 'SLA Tickets',      Icon: AlertTriangle     },
  { key: 'catalogo',        label: 'Catálogo',         Icon: Tag               },
  { key: 'calendario',      label: 'Calendario SLA',   Icon: CalendarClock     },
  { key: 'auditoria',       label: 'Auditoría',        Icon: History           },
];

/* ── Quick links ────────────────────────────────────────────────── */

function QuickLinks() {
  const links = [
    {
      href:  '/roles',
      Icon:  Shield,
      label: 'Roles y Permisos',
      desc:  'Gestionar roles globales y de módulo, asignar permisos',
    },
    {
      href:  '/users',
      Icon:  Users,
      label: 'Importar Usuarios',
      desc:  'Importación masiva de usuarios desde CSV',
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {links.map(({ href, Icon, label, desc }) => (
        <Link key={href} href={href} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          textDecoration: 'none', color: 'inherit', flex: '1 1 220px',
          transition: 'border-color .15s, box-shadow .15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#4f46e5'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px rgba(79,70,229,.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(79,70,229,.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} style={{ color: '#4f46e5' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{label}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{desc}</div>
          </div>
          <ExternalLink size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}

/* ── Setup checklist ────────────────────────────────────────────── */

function SetupChecklist({ setTab }: { setTab: (t: Tab) => void }) {
  const [open, setOpen] = useState(true);

  const { data: tree     = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
    staleTime: 60_000,
  });
  const { data: hours    = [] } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
    staleTime: 60_000,
  });
  const { data: slaRules = [] } = useQuery<SlaRule[]>({
    queryKey: ['sys-sla-rules'],
    queryFn:  systemConfigService.getSlaRules,
    staleTime: 60_000,
  });

  const activeHours = (hours    as BusinessHour[]).filter(h => h.is_active);
  const activeSla   = (slaRules as SlaRule[]).filter(r => r.is_active);
  const rootNodes   = (tree     as OrgNode[]).length;
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
      label: 'Horario laboral',
      done:  activeHours.length > 0,
      info:  activeHours.length > 0
        ? `${activeHours.length} día${activeHours.length !== 1 ? 's' : ''} configurado${activeHours.length !== 1 ? 's' : ''}`
        : 'Sin horario — SLA calculará como 24/7',
      tab: 'calendario',
    },
    {
      key:   'sla',
      label: 'Reglas SLA de solicitudes',
      done:  activeSla.length > 0,
      info:  activeSla.length > 0
        ? `${activeSla.length} regla${activeSla.length !== 1 ? 's' : ''} activa${activeSla.length !== 1 ? 's' : ''}`
        : 'Sin reglas — deadlines de solicitudes no configurados',
      tab: 'sla-solicitudes',
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
                    border: '1px solid #fed7aa', borderRadius: 5, fontSize: 11,
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

function CompanyTab() {
  const qc = useQueryClient();
  const { data: company, isLoading } = useQuery({
    queryKey: ['sys-config-company'],
    queryFn:  systemConfigService.getCompany,
  });

  const [editing,      setEditing]      = useState(false);
  const [form,         setForm]         = useState<Partial<Company>>({});
  const [logoPreview,  setLogoPreview]  = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const updateMut = useMutation({
    mutationFn: (dto: Partial<Company>) => systemConfigService.updateCompany(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-config-company'] });
      qc.invalidateQueries({ queryKey: ['company-public'] });
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      setEditing(false);
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
  }

  if (isLoading) return <Spinner />;
  if (!company)  return <p className={styles.empty}>No hay datos de empresa.</p>;

  if (!editing) {
    return (
      <div>
        <div className={styles.sectionHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 10, border: '1px solid #e2e8f0',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f8fafc', flexShrink: 0,
            }}>
              {company.logo_url
                ? <img src={company.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Building2 size={22} style={{ color: '#94a3b8' }} />}
            </div>
            <div>
              <div className={styles.sectionTitle} style={{ margin: 0 }}>{company.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {company.timezone} · {company.language}
              </div>
            </div>
          </div>
          <button className={styles.btnEdit} onClick={() => { setForm(company); setEditing(true); }}>
            <Pencil size={13} /> Editar
          </button>
        </div>
        <dl className={styles.dl}>
          <dt>Web</dt>           <dd>{company.website ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt>      <dd>{company.contact_phone ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const textFields = ['name', 'timezone', 'language', 'website', 'contact_email', 'contact_phone'] as const;
  const currentLogo = logoPreview ?? form.logo_url ?? null;

  return (
    <div>
      <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Editar empresa</div>

      {/* Logo upload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <div
          onClick={() => !logoUploading && logoInputRef.current?.click()}
          style={{
            width: 72, height: 72, borderRadius: 10, border: '2px dashed #cbd5e1',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#fff', flexShrink: 0, cursor: logoUploading ? 'wait' : 'pointer',
            transition: 'border-color .15s',
          }}>
          {currentLogo
            ? <img src={currentLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <Building2 size={24} style={{ color: '#cbd5e1' }} />}
        </div>
        <div>
          <button type="button" disabled={logoUploading}
            onClick={() => logoInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6,
              background: '#fff', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', color: '#0e2235',
              fontWeight: 600,
            }}>
            <Upload size={13} /> {logoUploading ? 'Subiendo…' : 'Cambiar logo'}
          </button>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5 }}>
            JPG, PNG, WebP · máx 5 MB
          </div>
        </div>
        <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }} onChange={handleLogoChange} />
      </div>

      {textFields.map(k => (
        <div key={k} className={styles.formRow}>
          <label className={styles.fieldLabel}>{k.replace(/_/g, ' ')}</label>
          <input
            className={styles.fieldInput}
            value={(form as Record<string, string | null>)[k] ?? ''}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div className={styles.inlineActions}>
        <button className={styles.btnSave} disabled={updateMut.isPending || logoUploading}
          onClick={() => updateMut.mutate(form)}>
          <Check size={13} /> {updateMut.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button className={styles.btnCancel} onClick={handleCancel}>
          <X size={13} /> Cancelar
        </button>
      </div>
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

function PrioridadTab() {
  const qc       = useQueryClient();
  const critical = useCriticalChange();

  const { data: formula, isLoading } = useQuery<PriorityFormula | null>({
    queryKey: ['priority-formula'],
    queryFn:  systemConfigService.getPriorityFormula,
  });

  // Local edit state (percentages * 100 for display, stored as 0-1)
  const [w, setW] = useState({ cargo: 25, nodo: 35, daño: 40 });
  const [t, setT] = useState({ critica: 9, alta: 7, media: 5 });
  const [desc, setDesc] = useState('');

  // Simulator
  const [sim, setSim]     = useState({ cargo: 5, nodo: 5, daño: 5, urgency: 'media', impact: 'medio' });
  const [preview, setPreview] = useState<PriorityPreview | null>(null);

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

  const wSum    = w.cargo + w.nodo + w.daño;
  const wValid  = wSum === 100;

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

  if (isLoading) return <Spinner />;

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 0', borderBottom: '1px solid #f1f5f9',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 80 };
  const num: React.CSSProperties   = {
    fontSize: 12, fontWeight: 800, minWidth: 38, textAlign: 'center',
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '3px 6px',
  };
  const tInput: React.CSSProperties = {
    width: 64, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 12, fontFamily: 'inherit', textAlign: 'center',
  };

  return (
    <div>
      <CriticalChangeModal {...critical} />

      {/* ── Coefficients ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Pesos de la fórmula
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
          score = peso_cargo × w_cargo + peso_nodo × w_nodo + peso_daño × w_daño + urgency_bonus + impact_bonus
        </div>

        {(['cargo', 'nodo', 'daño'] as const).map(k => (
          <div key={k} style={row}>
            <span style={label}>w_{k}</span>
            <input type="range" min={0} max={100} step={1} value={w[k]}
              onChange={e => setW(prev => ({ ...prev, [k]: +e.target.value }))}
              style={{ flex: 1 }} />
            <span style={{ ...num, color: w[k] >= 40 ? '#ff5e3a' : '#0e2235' }}>{w[k]}%</span>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 0' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Suma:</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: wValid ? '#22c55e' : '#ef4444' }}>
            {wSum}%
          </span>
          {!wValid && <span style={{ fontSize: 11, color: '#ef4444' }}>← debe ser exactamente 100%</span>}
        </div>
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

      {/* ── Save button ── */}
      <div style={{ marginBottom: 24 }}>
        <button
          disabled={!wValid || saveMut.isPending}
          onClick={() => critical.triggerCritical(
            { entityLabel: 'Fórmula de Prioridad', description: 'Cambia los pesos y umbrales que determinan la prioridad automática de tickets' },
            async (auth) => { await saveMut.mutateAsync(auth); },
          )}
          style={{
            padding: '8px 20px', background: wValid ? '#0e2235' : '#e2e8f0',
            color: wValid ? '#fff' : '#94a3b8', border: 'none', borderRadius: 7,
            fontSize: 12, fontWeight: 700, cursor: wValid ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <Check size={13} /> {saveMut.isPending ? 'Guardando…' : 'Guardar fórmula'}
        </button>
        {saveMut.isSuccess && (
          <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>Fórmula actualizada correctamente.</p>
        )}
      </div>

      {/* ── Simulator ── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Simulador de prioridad
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
          Ingresa pesos de cargo, nodo y daño (1–10) para ver el score resultante con la fórmula actual.
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          {(['cargo', 'nodo', 'daño'] as const).map(k => (
            <div key={k} style={{ flex: '1 1 120px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                Peso {k}
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

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Urgencia</div>
            <select value={sim.urgency} onChange={e => setSim(p => ({ ...p, urgency: e.target.value }))}
              style={{ ...tInput, width: 110, textAlign: 'left' }}>
              <option value="urgente">urgente (+1.5)</option>
              <option value="alta">alta (+1.0)</option>
              <option value="media">media (+0.5)</option>
              <option value="baja">baja (+0)</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Impacto</div>
            <select value={sim.impact} onChange={e => setSim(p => ({ ...p, impact: e.target.value }))}
              style={{ ...tInput, width: 110, textAlign: 'left' }}>
              <option value="critico">crítico (+1.5)</option>
              <option value="alto">alto (+1.0)</option>
              <option value="medio">medio (+0.5)</option>
              <option value="bajo">bajo (+0)</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}
              style={{ padding: '6px 16px', background: '#ff5e3a', color: '#fff', border: 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 5 }}>
              <Zap size={12} /> {previewMut.isPending ? '…' : 'Simular'}
            </button>
          </div>
        </div>

        {preview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
            background: '#fff', border: `2px solid ${PRIORITY_COLOR[preview.priority]}30`,
            borderRadius: 8, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Score</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0e2235', lineHeight: 1 }}>{preview.score}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Base</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>{preview.base}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Bonos</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                urgency +{preview.urgency_bonus} · impact +{preview.impact_bonus}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span style={{
                fontSize: 14, fontWeight: 900, padding: '4px 14px', borderRadius: 6,
                background: `${PRIORITY_COLOR[preview.priority]}18`,
                color: PRIORITY_COLOR[preview.priority],
                border: `1.5px solid ${PRIORITY_COLOR[preview.priority]}40`,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {preview.priority}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Calendar SLA tab ───────────────────────────────────────────── */

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function CalendarioTab() {
  const qc = useQueryClient();

  const { data: hours    = [], isLoading: loadingHours    } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
  });
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery<Holiday[]>({
    queryKey: ['sys-sla-holidays'],
    queryFn:  () => systemConfigService.getHolidays(),
  });

  const hourMap = useMemo(() => {
    const m = new Map<number, BusinessHour>();
    (hours as BusinessHour[]).forEach(h => m.set(h.day_of_week, h));
    return m;
  }, [hours]);

  const [editDay,  setEditDay]  = useState<number | null>(null);
  const [dayForm,  setDayForm]  = useState({ start_time: '07:00', end_time: '17:00', is_active: true });

  const upsertMut = useMutation({
    mutationFn: (dto: Parameters<typeof systemConfigService.upsertBusinessHour>[0]) =>
      systemConfigService.upsertBusinessHour(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-sla-hours'] }); setEditDay(null); },
  });

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm,    setHolidayForm]    = useState({ holiday_date: '', name: '' });

  const addHolidayMut = useMutation({
    mutationFn: systemConfigService.createHoliday,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] });
      setShowAddHoliday(false);
      setHolidayForm({ holiday_date: '', name: '' });
    },
  });
  const delHolidayMut = useMutation({
    mutationFn: systemConfigService.deleteHoliday,
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
        <span className={styles.listMeta}>Afecta cálculo de deadlines SLA globales</span>
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
                    onClick={() => upsertMut.mutate({ day_of_week: dow, ...dayForm })}>
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
        <div className={styles.sectionTitle}>Feriados</div>
        {!showAddHoliday && (
          <button className={styles.btnPrimary} onClick={() => setShowAddHoliday(true)}>
            <Plus size={13} /> Agregar
          </button>
        )}
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
              onClick={() => addHolidayMut.mutate(holidayForm)}>
              <Check size={13} /> {addHolidayMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => setShowAddHoliday(false)}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(holidays as Holiday[]).length === 0 ? (
        <div className={styles.empty}>Sin feriados configurados.</div>
      ) : (
        <div className={styles.list}>
          {(holidays as Holiday[]).map(h => (
            <div key={h.id} className={styles.listRow} style={{ opacity: h.is_active ? 1 : 0.45 }}>
              <div>
                <span className={styles.listName}>
                  {new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className={styles.listMeta}> · {h.name}</span>
                {h.module_id && <span className={styles.listMeta} style={{ color: '#6366f1' }}> · módulo</span>}
              </div>
              <button className={styles.iconBtnDanger} title="Desactivar"
                disabled={delHolidayMut.isPending} onClick={() => delHolidayMut.mutate(h.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
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
                borderRadius: 6, marginBottom: 8,
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

/* ── SLA Tickets tab (requires module selection) ───────────────── */

function SlaTicketsModuleTab() {
  const [moduleId, setModuleId] = useState<string>('');

  const { data: modules = [], isLoading } = useQuery<SystemModule[]>({
    queryKey: ['modules-list'],
    queryFn:  modulesService.getModules,
    staleTime: 2 * 60_000,
  });

  const helpdesk = modules.filter(m => m.is_active && ['helpdesk', 'soporte'].includes(m.type ?? ''));

  if (isLoading) return <Spinner />;

  if (helpdesk.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13,
        background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
        Sin módulos Helpdesk activos.
      </div>
    );
  }

  const selected = moduleId || helpdesk[0].id;

  return (
    <div>
      {helpdesk.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Módulo:</span>
          <select
            value={selected}
            onChange={e => setModuleId(e.target.value)}
            style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
              fontSize: 12, fontFamily: 'inherit', background: '#fff' }}
          >
            {helpdesk.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      <SlaTicketsTab moduleId={selected} />
    </div>
  );
}

/* ── Catálogo tab (damage types + request types) ────────────────── */

function CatalogoTab() {
  const [section, setSection] = useState<'damage' | 'request'>('damage');

  const sBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: active ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
    background: active ? 'rgba(255,94,58,.07)' : '#fff',
    color: active ? '#ff5e3a' : '#64748b',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={sBtn(section === 'damage')}  onClick={() => setSection('damage')}>
          Tipos de daño
        </button>
        <button style={sBtn(section === 'request')} onClick={() => setSection('request')}>
          Tipos de solicitud
        </button>
      </div>
      {section === 'damage'  && <DamageTypesTab />}
      {section === 'request' && <RequestTypesTab />}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function GlobalConfigPage() {
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:config');
  const [tab, setTab] = useState<Tab>('empresa');

  if (loaded && !canView) return null;

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
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'empresa'         && <CompanyTab />}
          {tab === 'organigrama'     && <OrgFlowTab />}
          {tab === 'prioridad'       && <PrioridadTab />}
          {tab === 'sla-solicitudes' && <SlaRequestsTab />}
          {tab === 'sla-tickets'     && <SlaTicketsModuleTab />}
          {tab === 'catalogo'        && <CatalogoTab />}
          {tab === 'calendario'      && <CalendarioTab />}
          {tab === 'auditoria'       && <AuditoriaTab />}
        </div>

      </div>
    </div>
  );
}
