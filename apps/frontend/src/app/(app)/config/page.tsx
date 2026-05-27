'use client';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Network, CalendarClock, History, SlidersHorizontal,
  Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight,
  ExternalLink, Shield, Users, ShieldCheck, ShieldAlert,
  ChevronRight, ChevronDown, Zap, AlertTriangle, Tag,
  type LucideIcon,
} from 'lucide-react';
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
import type {
  Company, BusinessHour, Holiday, AuditLog,
  StructureType, OrgNode, PriorityFormula, PriorityPreview,
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

/* ── Company tab ────────────────────────────────────────────────── */

function CompanyTab() {
  const qc = useQueryClient();
  const { data: company, isLoading } = useQuery({
    queryKey: ['sys-config-company'],
    queryFn:  systemConfigService.getCompany,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<Partial<Company>>({});

  const updateMut = useMutation({
    mutationFn: (dto: Partial<Company>) => systemConfigService.updateCompany(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-company'] }); setEditing(false); },
  });

  if (isLoading) return <Spinner />;
  if (!company)  return <p className={styles.empty}>No hay datos de empresa.</p>;

  if (!editing) {
    return (
      <div>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Datos de la empresa</div>
          <button className={styles.btnEdit} onClick={() => { setForm(company); setEditing(true); }}>
            <Pencil size={13} /> Editar
          </button>
        </div>
        <dl className={styles.dl}>
          <dt>Nombre</dt>        <dd>{company.name}</dd>
          <dt>Zona horaria</dt>  <dd>{company.timezone}</dd>
          <dt>Idioma</dt>        <dd>{company.language}</dd>
          <dt>Web</dt>           <dd>{company.website ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt>      <dd>{company.contact_phone ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const textFields = ['name', 'timezone', 'language', 'website', 'contact_email', 'contact_phone'] as const;

  return (
    <div>
      <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Editar empresa</div>
      {textFields.map(k => (
        <div key={k} className={styles.formRow}>
          <label className={styles.fieldLabel}>{k.replace(/_/g, ' ')}</label>
          <input
            className={styles.fieldInput}
            value={(form as any)[k] ?? ''}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div className={styles.inlineActions}>
        <button className={styles.btnSave} disabled={updateMut.isPending}
          onClick={() => updateMut.mutate(form)}>
          <Check size={13} /> {updateMut.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button className={styles.btnCancel} onClick={() => setEditing(false)}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Organigrama tab ────────────────────────────────────────────── */

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#94a3b8';

const inp: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 12, fontFamily: 'inherit', background: '#fff', width: '100%', boxSizing: 'border-box',
};

function NodeRow({
  node, types, depth, onDeleted,
}: {
  node:      OrgNode;
  types:     StructureType[];
  depth:     number;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [expanded,  setExpanded]  = useState(depth < 1);
  const [editing,   setEditing]   = useState(false);
  const [editForm,  setEditForm]  = useState({ name: node.name, weight: node.weight, description: node.description ?? '' });

  const updateMut = useMutation({
    mutationFn: (dto: typeof editForm) => systemConfigService.updateOrgNode(node.id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-node-tree'] }); setEditing(false); },
  });
  const deleteMut = useMutation({
    mutationFn: () => systemConfigService.deleteOrgNode(node.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-node-tree'] }); onDeleted(); },
  });

  const hasChildren = node.children && node.children.length > 0;
  const typeColor: Record<string, string> = {
    sede: '#0e2235', departamento: '#4f46e5', area: '#0891b2', cargo: '#059669',
  };
  const color = typeColor[node.type_slug] ?? '#64748b';

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
        marginBottom: 4, cursor: hasChildren ? 'pointer' : 'default',
      }}>
        {hasChildren ? (
          <button onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#94a3b8' }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ width: 18 }} />
        )}

        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
          background: `${color}15`, color, border: `1px solid ${color}30` }}>
          {node.type_slug}
        </span>

        {editing ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              style={{ ...inp, flex: '2 1 120px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 100px' }}>
              <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>Peso</span>
              <input type="range" min={1} max={10} value={editForm.weight}
                onChange={e => setEditForm(f => ({ ...f, weight: +e.target.value }))}
                style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: weightColor(editForm.weight), minWidth: 16 }}>
                {editForm.weight}
              </span>
            </div>
            <button onClick={() => updateMut.mutate(editForm)} disabled={!editForm.name.trim()}
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 5,
                padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Check size={12} />
            </button>
            <button onClick={() => setEditing(false)}
              style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 5,
                padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0e2235' }}>{node.name}</span>
            <span style={{ fontSize: 10, fontWeight: 700, minWidth: 24, textAlign: 'center',
              color: weightColor(node.weight), background: '#f1f5f9', borderRadius: 5, padding: '1px 5px' }}>
              {node.weight}
            </span>
            {node.user_count > 0 && (
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{node.user_count} usuarios</span>
            )}
            <button onClick={() => { setEditForm({ name: node.name, weight: node.weight, description: node.description ?? '' }); setEditing(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 4px' }}>
              <Pencil size={11} />
            </button>
            <button onClick={() => { if (confirm(`Desactivar "${node.name}"?`)) deleteMut.mutate(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 4px' }}>
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>

      {expanded && node.children && node.children.map(child => (
        <NodeRow key={child.id} node={child} types={types} depth={depth + 1} onDeleted={onDeleted} />
      ))}
    </div>
  );
}

function OrganigramaTab() {
  const qc = useQueryClient();
  const [section,  setSection]  = useState<'nodes' | 'types'>('nodes');
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<{ type_id: string; parent_id: string; name: string; weight: number }>({
    type_id: '', parent_id: '', name: '', weight: 5,
  });

  const { data: tree  = [], isLoading: treeLoading  } = useQuery<OrgNode[]>({
    queryKey: ['org-node-tree'],
    queryFn:  systemConfigService.getOrgNodeTree,
  });
  const { data: types = [], isLoading: typesLoading } = useQuery<StructureType[]>({
    queryKey: ['org-structure-types'],
    queryFn:  () => systemConfigService.getStructureTypes(),
  });
  const { data: flatNodes = [] } = useQuery<OrgNode[]>({
    queryKey: ['org-nodes-flat'],
    queryFn:  () => systemConfigService.getOrgNodes({ active: true }),
    enabled:  showForm,
  });

  const createMut = useMutation({
    mutationFn: () => systemConfigService.createOrgNode({
      type_id:   form.type_id,
      parent_id: form.parent_id || undefined,
      name:      form.name,
      weight:    form.weight,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-node-tree'] });
      qc.invalidateQueries({ queryKey: ['org-nodes-flat'] });
      setShowForm(false);
      setForm({ type_id: '', parent_id: '', name: '', weight: 5 });
    },
  });

  const updateTypeMut = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      systemConfigService.updateStructureType(id, { weight }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-structure-types'] }),
  });

  if (treeLoading || typesLoading) return <Spinner />;

  const sBtn = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', border: active ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
    background: active ? 'rgba(255,94,58,.07)' : '#fff',
    color: active ? '#ff5e3a' : '#64748b',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={sBtn(section === 'nodes')} onClick={() => setSection('nodes')}>Árbol de nodos</button>
        <button style={sBtn(section === 'types')} onClick={() => setSection('types')}>Tipos de estructura</button>
      </div>

      {section === 'types' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Tipos de estructura org
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
            El <strong>peso</strong> (1–10) de cada tipo se usa en el cálculo de prioridad automática.
          </div>
          {(types as StructureType[]).map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 8,
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0e2235' }}>{t.name}</span>
                <code style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{t.slug}</code>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>Peso</span>
                <input type="range" min={1} max={10} value={t.weight}
                  onChange={e => updateTypeMut.mutate({ id: t.id, weight: +e.target.value })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 700, minWidth: 18, color: weightColor(t.weight) }}>
                  {t.weight}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'nodes' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Árbol de nodos
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                {(tree as OrgNode[]).reduce((acc, n) => acc + 1 + (n.children?.length ?? 0), 0)} nodos activos
              </span>
            </div>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={12} /> Nuevo nodo
              </button>
            )}
          </div>

          {showForm && (
            <div style={{ padding: '16px', background: '#fff', border: '1.5px solid #0e2235',
              borderRadius: 8, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ flex: '1 1 150px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Tipo *</p>
                <select value={form.type_id} onChange={e => setForm(f => ({ ...f, type_id: e.target.value }))}
                  style={inp}>
                  <option value="">— seleccionar —</option>
                  {(types as StructureType[]).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '2 1 150px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Nombre *</p>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Nodo padre</p>
                <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                  style={inp}>
                  <option value="">— raíz —</option>
                  {(flatNodes as OrgNode[]).map(n => (
                    <option key={n.id} value={n.id}>[{n.type_slug}] {n.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Peso (1–10)</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="range" min={1} max={10} value={form.weight}
                    onChange={e => setForm(f => ({ ...f, weight: +e.target.value }))} style={{ flex: 1 }} />
                  <span style={{ fontWeight: 700, color: weightColor(form.weight), minWidth: 16 }}>{form.weight}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <button disabled={!form.type_id || !form.name.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                  style={{ padding: '7px 14px', background: '#ff5e3a', color: '#fff', border: 'none',
                    borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    opacity: !form.type_id || !form.name.trim() ? 0.5 : 1 }}>
                  {createMut.isPending ? '…' : 'Crear'}
                </button>
                <button onClick={() => setShowForm(false)}
                  style={{ padding: '7px 10px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
                    borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {(tree as OrgNode[]).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13,
              background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
              Sin nodos en el árbol. Usa el botón "Nuevo nodo" para crear la estructura organizacional.
            </div>
          ) : (
            <div>
              {(tree as OrgNode[]).map(node => (
                <NodeRow
                  key={node.id}
                  node={node}
                  types={types as StructureType[]}
                  depth={0}
                  onDeleted={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
          {tab === 'organigrama'     && <OrganigramaTab />}
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
