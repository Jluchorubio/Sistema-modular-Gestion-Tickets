'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, MapPin, Layers, Briefcase, Clock, Shield,
  Plus, Trash2, Pencil, Check, X, Upload, AlertCircle, Tags, ToggleLeft, ToggleRight,
  ChevronRight, ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { systemConfigService }  from '@/services/system-config.service';
import { permissionsService }   from '@/services/permissions.service';
import type { PermissionDef, RoleInfo, ModuleScope } from '@/services/permissions.service';
import { useSuperadminGuard }   from '@/hooks/useSuperadminGuard';
import { Spinner }              from '@/components/ui/Spinner';
import type {
  Headquarter, Department, Position, SlaRule, Company, RequestTypeConfig,
} from '@/services/system-config.service';
import styles from './config.module.css';

type Tab = 'empresa' | 'sedes' | 'departamentos' | 'cargos' | 'sla' | 'tipos' | 'permisos' | 'importar';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'empresa',       label: 'Empresa',        Icon: Building2 },
  { key: 'sedes',         label: 'Sedes',          Icon: MapPin    },
  { key: 'departamentos', label: 'Departamentos',  Icon: Layers    },
  { key: 'cargos',        label: 'Cargos',         Icon: Briefcase },
  { key: 'sla',           label: 'SLA',            Icon: Clock     },
  { key: 'tipos',         label: 'Tipos',          Icon: Tags      },
  { key: 'permisos',      label: 'Roles y Permisos', Icon: Shield  },
  { key: 'importar',      label: 'Importar',       Icon: Upload    },
];

/* ── Company tab ───────────────────────────────────────────────── */

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
          <dt>Nombre</dt><dd>{company.name}</dd>
          <dt>Zona horaria</dt><dd>{company.timezone}</dd>
          <dt>Idioma</dt><dd>{company.language}</dd>
          <dt>Web</dt><dd>{company.website ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt><dd>{company.contact_phone ?? '—'}</dd>
          <dt>RUT / Fiscal ID</dt><dd>{company.fiscal_id ?? '—'}</dd>
          <dt>Industria</dt><dd>{company.industry ?? '—'}</dd>
          <dt>Empleados</dt><dd>{company.employee_count ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const textFields = ['name','timezone','language','website','contact_email','contact_phone','fiscal_id','industry'] as const;

  return (
    <div>
      <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Editar empresa</div>
      {textFields.map(k => (
        <div key={k} className={styles.formRow}>
          <label className={styles.fieldLabel}>{k.replace(/_/g,' ')}</label>
          <input
            className={styles.fieldInput}
            value={(form as any)[k] ?? ''}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div className={styles.formRow}>
        <label className={styles.fieldLabel}>Nº empleados</label>
        <input
          type="number"
          className={styles.fieldInput}
          value={form.employee_count ?? ''}
          onChange={e => setForm(f => ({ ...f, employee_count: e.target.value ? Number(e.target.value) : undefined }))}
        />
      </div>
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

/* ── Generic CRUD list tab ──────────────────────────────────────── */

interface ListField {
  key:      string;
  label:    string;
  type?:    string;
  required?: boolean;
  min?:     number;
  max?:     number;
}

function ListTab<T extends { id: string; name: string }>({
  queryKey, queryFn, createFn, deleteFn, label, fields,
}: {
  queryKey: string[];
  queryFn:  () => Promise<T[]>;
  createFn: (data: any) => Promise<T>;
  deleteFn: (id: string) => Promise<any>;
  label:    string;
  fields:   ListField[];
}) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey, queryFn });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState<Record<string, any>>({});

  const createMut = useMutation({
    mutationFn: createFn,
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setShowCreate(false); setForm({}); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const requiredField = fields.find(f => f.required);
  const canSave = requiredField ? !!form[requiredField.key] : !!form['name'];

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{label}</div>
        {!showCreate && (
          <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {showCreate && (
        <div className={styles.inlineForm}>
          {fields.map(f => (
            <div key={f.key} className={styles.formRow}>
              <label className={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</label>
              <input
                type={f.type ?? 'text'}
                className={styles.fieldInput}
                min={f.min}
                max={f.max}
                value={form[f.key] ?? ''}
                onChange={e => setForm(v => ({
                  ...v,
                  [f.key]: f.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value,
                }))}
              />
            </div>
          ))}
          <div className={styles.inlineActions}>
            <button
              className={styles.btnSave}
              disabled={createMut.isPending || !canSave}
              onClick={() => createMut.mutate(form)}
            >
              <Check size={13} /> {createMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => { setShowCreate(false); setForm({}); }}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(data as any[]).length === 0 ? (
        <div className={styles.empty}>No hay {label.toLowerCase()} registradas.</div>
      ) : (
        <div className={styles.list}>
          {(data as any[]).map(item => (
            <div key={item.id} className={styles.listRow}>
              <div>
                <span className={styles.listName}>{item.name}</span>
                {item.level       !== undefined && <span className={styles.listMeta}> · Nivel {item.level}</span>}
                {item.city        && <span className={styles.listMeta}> · {item.city}</span>}
                {item.department_name && <span className={styles.listMeta}> · {item.department_name}</span>}
                {item.area_count  !== undefined && <span className={styles.listMeta}> · {item.area_count} áreas</span>}
              </div>
              <button
                className={styles.iconBtnDanger}
                title="Desactivar"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(item.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SLA tab ────────────────────────────────────────────────────── */

const SLA_PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

function SlaTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['sys-config-sla'],
    queryFn:  systemConfigService.getSlaRules,
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ hours_to_resolve: 24, hours_to_first_response: 1 });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: typeof editForm }) =>
      systemConfigService.updateSlaRule(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-sla'] }); setEditId(null); },
  });

  if (isLoading) return <Spinner />;

  const generic  = (rules as SlaRule[]).filter(r => !r.request_type);
  const specific = (rules as SlaRule[]).filter(r =>  r.request_type);

  const renderRule = (r: SlaRule) => {
    const isEditing = editId === r.id;
    return (
      <div key={r.id} className={styles.slaRow}>
        <div className={styles.slaMeta}>
          <span className={styles.slaPriority} data-priority={r.priority}>
            {SLA_PRIORITY_LABEL[r.priority]}
          </span>
          {r.request_type && <span className={styles.slaType}>{r.request_type}</span>}
        </div>
        {isEditing ? (
          <div className={styles.slaEditRow}>
            <label className={styles.fieldLabel} style={{ minWidth: 120 }}>Horas resolución</label>
            <input type="number" className={styles.slaInput} min={1}
              value={editForm.hours_to_resolve}
              onChange={e => setEditForm(f => ({ ...f, hours_to_resolve: Number(e.target.value) }))}
            />
            <label className={styles.fieldLabel} style={{ minWidth: 140 }}>Horas 1ª respuesta</label>
            <input type="number" className={styles.slaInput} min={1}
              value={editForm.hours_to_first_response}
              onChange={e => setEditForm(f => ({ ...f, hours_to_first_response: Number(e.target.value) }))}
            />
            <button className={styles.btnSave} disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({ id: r.id, dto: editForm })}>
              <Check size={13} />
            </button>
            <button className={styles.btnCancel} onClick={() => setEditId(null)}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className={styles.slaValues}>
            <span>{r.hours_to_resolve}h resolución</span>
            <span>{r.hours_to_first_response}h primera respuesta</span>
            <button className={styles.btnEdit}
              onClick={() => {
                setEditId(r.id);
                setEditForm({ hours_to_resolve: r.hours_to_resolve, hours_to_first_response: r.hours_to_first_response });
              }}>
              <Pencil size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className={styles.sectionTitle}>Reglas SLA globales</div>
      <div className={styles.slaSub}>Aplican a todos los tipos de solicitud según prioridad</div>
      <div className={styles.slaGroup}>{generic.map(renderRule)}</div>

      {specific.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Reglas SLA específicas</div>
          <div className={styles.slaSub}>Sobreescriben las reglas globales para tipos específicos</div>
          <div className={styles.slaGroup}>{specific.map(renderRule)}</div>
        </>
      )}
    </div>
  );
}

/* ── Request types tab ──────────────────────────────────────────── */

function RequestTypesTab() {
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useQuery<RequestTypeConfig[]>({
    queryKey: ['sys-config-request-types'],
    queryFn:  () => systemConfigService.getRequestTypes(false),
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; description: string }>({ label: '', description: '' });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) =>
      systemConfigService.updateRequestType(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-config-request-types'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      systemConfigService.updateRequestType(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-config-request-types'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Tipos de solicitud</div>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Activa/desactiva tipos o edita su etiqueta. Los tipos inactivos no aparecen al crear solicitudes.
      </div>

      <div className={styles.list}>
        {(types as RequestTypeConfig[]).sort((a, b) => a.sort_order - b.sort_order).map(t => {
          const isEditing = editId === t.id;
          return (
            <div key={t.id} className={styles.listRow} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                <button
                  className={styles.iconBtn}
                  title={t.is_active ? 'Desactivar' : 'Activar'}
                  disabled={toggleMut.isPending}
                  onClick={() => toggleMut.mutate({ id: t.id, is_active: !t.is_active })}
                  style={{ color: t.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}
                >
                  {t.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <div style={{ flex: 1 }}>
                  <span className={styles.listName} style={{ opacity: t.is_active ? 1 : 0.45 }}>
                    {t.label}
                  </span>
                  <span className={styles.listMeta}> · <code style={{ fontSize: 11 }}>{t.type_key}</code></span>
                  {t.requires_module && (
                    <span className={styles.listMeta} style={{ color: '#6366f1' }}> · módulo requerido</span>
                  )}
                  {t.allows_manual_priority && (
                    <span className={styles.listMeta} style={{ color: '#f59e0b' }}> · prioridad manual</span>
                  )}
                </div>
                {!isEditing && (
                  <button
                    className={styles.btnEdit}
                    onClick={() => { setEditId(t.id); setEditForm({ label: t.label, description: t.description ?? '' }); }}
                  >
                    <Pencil size={12} /> Editar
                  </button>
                )}
              </div>
              {isEditing && (
                <div className={styles.inlineForm} style={{ width: '100%', marginTop: 4 }}>
                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Etiqueta</label>
                    <input className={styles.fieldInput} value={editForm.label}
                      onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Descripción</label>
                    <input className={styles.fieldInput} value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className={styles.inlineActions}>
                    <button className={styles.btnSave} disabled={updateMut.isPending || !editForm.label.trim()}
                      onClick={() => { updateMut.mutate({ id: t.id, dto: editForm }); setEditId(null); }}>
                      <Check size={13} /> Guardar
                    </button>
                    <button className={styles.btnCancel} onClick={() => setEditId(null)}>
                      <X size={13} /> Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Import tab ─────────────────────────────────────────────────── */

function ImportTab() {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<any[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result,   setResult]  = useState<any | null>(null);

  const importMut = useMutation({
    mutationFn: (users: any[]) => systemConfigService.bulkImport(users),
    onSuccess: (data) => { setResult(data); setPreview(null); },
  });

  function parseCSV() {
    setParseErr(null);
    setResult(null);
    try {
      const lines = rawText.trim().split('\n').filter(Boolean);
      if (lines.length < 2) throw new Error('El CSV debe tener encabezado + al menos 1 fila');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
        return obj;
      });
      if (!rows[0]?.email)      throw new Error('Columna "email" requerida');
      if (!rows[0]?.first_name) throw new Error('Columna "first_name" requerida');
      if (!rows[0]?.last_name)  throw new Error('Columna "last_name" requerida');
      setPreview(rows);
    } catch (e: any) {
      setParseErr(e.message);
    }
  }

  return (
    <div>
      <div className={styles.sectionTitle}>Importación masiva de usuarios</div>
      <div className={styles.importInstructions}>
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Pega el contenido de tu CSV. Columnas requeridas: <code>email, first_name, last_name</code>.
          Opcionales: <code>username, phone, job_title, department, headquarters_name, position_name, global_role_name</code>.
        </span>
      </div>

      <textarea
        className={styles.csvTextarea}
        placeholder={'email,first_name,last_name,job_title,headquarters_name\njuan@empresa.com,Juan,Pérez,Analista,Bogotá'}
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        rows={8}
      />

      <div className={styles.importActions}>
        <button className={styles.btnSecondary} onClick={parseCSV} disabled={!rawText.trim()}>
          Vista previa
        </button>
        {preview && (
          <button
            className={styles.btnPrimary}
            disabled={importMut.isPending}
            onClick={() => importMut.mutate(preview)}
          >
            <Upload size={13} /> {importMut.isPending ? 'Importando…' : `Importar ${preview.length} usuarios`}
          </button>
        )}
      </div>

      {parseErr && (
        <div className={styles.importErr}><AlertCircle size={13} /> {parseErr}</div>
      )}

      {preview && !result && (
        <div className={styles.previewTable}>
          <div className={styles.previewTitle}>Vista previa — {preview.length} filas</div>
          <table>
            <thead>
              <tr>
                <th>Email</th><th>Nombre</th><th>Apellido</th><th>Cargo</th><th>Sede</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td>{r.email}</td><td>{r.first_name}</td><td>{r.last_name}</td>
                  <td>{r.job_title ?? r.position_name ?? '—'}</td>
                  <td>{r.headquarters_name ?? r.primary_sede ?? '—'}</td>
                </tr>
              ))}
              {preview.length > 10 && (
                <tr><td colSpan={5} className={styles.previewMore}>+{preview.length - 10} más…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className={styles.importResult}>
          <div className={styles.importSummary}>
            <span className={styles.importCreated}>✓ {result.summary.created} creados</span>
            <span className={styles.importExists}> {result.summary.exists} ya existían</span>
            {result.summary.errors > 0 && (
              <span className={styles.importErrors}>✗ {result.summary.errors} errores</span>
            )}
          </div>
          {result.results
            .filter((r: any) => r.status === 'error')
            .map((r: any) => (
              <div key={r.email} className={styles.importErrRow}>
                ✗ {r.email}: {r.detail}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── Permission tree helpers ────────────────────────────────────── */

interface TreeNode extends PermissionDef {
  children: TreeNode[];
}

function buildTree(perms: PermissionDef[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  perms.forEach(p => map.set(p.key, { ...p, children: [] }));
  const roots: TreeNode[] = [];
  const sorted = [...perms].sort((a, b) => a.sort_order - b.sort_order);
  sorted.forEach(p => {
    const node = map.get(p.key)!;
    if (!p.parent_key || !map.has(p.parent_key)) {
      roots.push(node);
    } else {
      map.get(p.parent_key)!.children.push(node);
    }
  });
  return roots;
}

const SCOPE_LABELS: Record<string, string> = {
  global:     'Global',
  gestion:    'Gestión Administrativa',
  helpdesk:   'Helpdesk',
  inventario: 'Inventario',
};

/* ── Permission tree node ───────────────────────────────────────── */

interface PermNodeProps {
  node:       TreeNode;
  depth:      number;
  granted:    Set<string>;
  roleId:     string;
  roleType:   'global' | 'module';
  isPending:  boolean;
  onToggle:         (args: { roleId: string; permKey: string; granted: boolean; roleType: 'global' | 'module' }) => void;
  onGrantChildren:  (args: { roleId: string; parentKey: string; roleType: 'global' | 'module' }) => void;
  onRevokeChildren: (args: { roleId: string; parentKey: string }) => void;
}

function PermNode({ node, depth, granted, roleId, roleType, isPending, onToggle, onGrantChildren, onRevokeChildren }: PermNodeProps) {
  const [collapsed, setCollapsed] = useState(depth > 0);
  const isGranted   = granted.has(node.key);
  const hasChildren = node.children.length > 0;

  return (
    <div className={styles.permNode}>
      <div className={styles.permNodeRow}>
        <div style={{ width: 18, flexShrink: 0 }}>
          {hasChildren && (
            <button className={styles.permCollapseBtn} onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>

        <input
          type="checkbox"
          className={styles.permCheckbox}
          checked={isGranted}
          disabled={isPending}
          onChange={() => onToggle({ roleId, permKey: node.key, granted: !isGranted, roleType })}
        />

        <div className={styles.permNodeLabel}>
          <span style={{ fontWeight: hasChildren ? 600 : 400 }}>{node.label}</span>
          <span className={styles.permNodeKey}>{node.key}</span>
        </div>

        {hasChildren && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className={styles.permGrantAll}
              disabled={isPending}
              title="Otorgar este permiso y todos sus hijos"
              onClick={() => onGrantChildren({ roleId, parentKey: node.key, roleType })}
            >
              ↓ todos
            </button>
            <button
              className={styles.permRevokeAll}
              disabled={isPending}
              title="Revocar este permiso y todos sus hijos"
              onClick={() => onRevokeChildren({ roleId, parentKey: node.key })}
            >
              ✕ todos
            </button>
          </div>
        )}
      </div>

      {hasChildren && !collapsed && (
        <div className={styles.permChildren}>
          {node.children.map(child => (
            <PermNode
              key={child.key}
              node={child}
              depth={depth + 1}
              granted={granted}
              roleId={roleId}
              roleType={roleType}
              isPending={isPending}
              onToggle={onToggle}
              onGrantChildren={onGrantChildren}
              onRevokeChildren={onRevokeChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Roles & Permissions tab ────────────────────────────────────── */

function RolesPermissionsTab() {
  const qc = useQueryClient();
  const [roleTab,         setRoleTab]         = useState<'global' | 'module'>('global');
  const [selectedRoleId,  setSelectedRoleId]  = useState<string | null>(null);
  const [selectedModId,   setSelectedModId]   = useState<string | null>(null);

  const { data: permTree = [],    isLoading: loadingTree }    = useQuery<PermissionDef[]>({
    queryKey: ['perm-tree'],
    queryFn:  permissionsService.getPermissionTree,
  });

  const { data: globalRoles = [], isLoading: loadingGlobal } = useQuery<RoleInfo[]>({
    queryKey: ['perm-global-roles'],
    queryFn:  permissionsService.getGlobalRoles,
  });

  const { data: modules = [],     isLoading: loadingModules } = useQuery<ModuleScope[]>({
    queryKey: ['perm-modules'],
    queryFn:  permissionsService.getModulesWithScopes,
  });

  const { data: moduleRoles = [] } = useQuery<RoleInfo[]>({
    queryKey: ['perm-module-roles', selectedModId],
    queryFn:  () => permissionsService.getModuleRoles(selectedModId!),
    enabled:  !!selectedModId,
  });

  const { data: grants = [], isLoading: loadingGrants } = useQuery<string[]>({
    queryKey: ['perm-grants', selectedRoleId, roleTab],
    queryFn:  () => roleTab === 'global'
      ? permissionsService.getGlobalRoleGrants(selectedRoleId!)
      : permissionsService.getModuleRoleGrants(selectedRoleId!),
    enabled:  !!selectedRoleId,
  });

  const grantedSet = useMemo(() => new Set(grants), [grants]);

  const invalidateGrants = () => qc.invalidateQueries({ queryKey: ['perm-grants', selectedRoleId, roleTab] });

  const toggleMut = useMutation({
    mutationFn: (args: { roleId: string; permKey: string; granted: boolean; roleType: 'global' | 'module' }) =>
      permissionsService.toggleGrant(args.roleId, args.permKey, args.granted, args.roleType),
    onSuccess: invalidateGrants,
  });

  const grantChildrenMut = useMutation({
    mutationFn: (args: { roleId: string; parentKey: string; roleType: 'global' | 'module' }) =>
      permissionsService.grantAllChildren(args.roleId, args.parentKey, args.roleType),
    onSuccess: invalidateGrants,
  });

  const revokeChildrenMut = useMutation({
    mutationFn: (args: { roleId: string; parentKey: string }) =>
      permissionsService.revokeAllChildren(args.roleId, args.parentKey),
    onSuccess: invalidateGrants,
  });

  const isPending = toggleMut.isPending || grantChildrenMut.isPending || revokeChildrenMut.isPending;

  // Build tree + group by scope
  const treeByScope = useMemo(() => {
    const roots = buildTree(permTree);
    const grouped: Record<string, TreeNode[]> = {};
    roots.forEach(node => {
      if (!grouped[node.scope]) grouped[node.scope] = [];
      grouped[node.scope].push(node);
    });
    return grouped;
  }, [permTree]);

  const scopeOrder = ['global', 'gestion', 'helpdesk', 'inventario'];

  function selectRole(id: string) {
    setSelectedRoleId(id);
  }

  if (loadingTree || loadingGlobal || loadingModules) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Roles y Permisos</div>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Selecciona un rol para gestionar qué permisos tiene. Los cambios se aplican de inmediato.
      </div>

      <div className={styles.permLayout}>
        {/* ── Left: role selector ── */}
        <div className={styles.permRoles}>
          <div className={styles.permRoleTabs}>
            <button
              className={`${styles.permRoleTabBtn}${roleTab === 'global' ? ` ${styles.permRoleTabBtnActive}` : ''}`}
              onClick={() => { setRoleTab('global'); setSelectedRoleId(null); }}
            >
              Global
            </button>
            <button
              className={`${styles.permRoleTabBtn}${roleTab === 'module' ? ` ${styles.permRoleTabBtnActive}` : ''}`}
              onClick={() => { setRoleTab('module'); setSelectedRoleId(null); }}
            >
              Módulo
            </button>
          </div>

          {roleTab === 'global' && (
            <div className={styles.permRoleList}>
              {globalRoles.map(role => (
                <div
                  key={role.id}
                  className={`${styles.permRoleItem}${selectedRoleId === role.id ? ` ${styles.permRoleItemActive}` : ''}`}
                  onClick={() => selectRole(role.id)}
                >
                  <span style={{ flex: 1 }}>{role.name}</span>
                  {!role.is_active && <span className={styles.permBadgeInactive}>inact.</span>}
                  {role.is_admin  && <span className={styles.permBadgeAdmin}>adm</span>}
                </div>
              ))}
            </div>
          )}

          {roleTab === 'module' && (
            <>
              <select
                className={styles.permModuleSelect}
                value={selectedModId ?? ''}
                onChange={e => { setSelectedModId(e.target.value || null); setSelectedRoleId(null); }}
              >
                <option value="">Seleccionar módulo…</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              {selectedModId && (
                <div className={styles.permRoleList}>
                  {moduleRoles.map(role => (
                    <div
                      key={role.id}
                      className={`${styles.permRoleItem}${selectedRoleId === role.id ? ` ${styles.permRoleItemActive}` : ''}`}
                      onClick={() => selectRole(role.id)}
                    >
                      <span style={{ flex: 1 }}>{role.name}</span>
                      {!role.is_active && <span className={styles.permBadgeInactive}>inact.</span>}
                    </div>
                  ))}
                  {moduleRoles.length === 0 && (
                    <div className={styles.permEmpty} style={{ height: 'auto', padding: '12px 0' }}>
                      Sin roles
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: permission tree ── */}
        <div className={styles.permTree}>
          {!selectedRoleId ? (
            <div className={styles.permEmpty}>
              Selecciona un rol para gestionar sus permisos
            </div>
          ) : loadingGrants ? (
            <Spinner />
          ) : (
            <div>
              {scopeOrder
                .filter(scope => treeByScope[scope]?.length)
                .map(scope => (
                  <div key={scope}>
                    <div className={styles.permScopeHeader}>
                      {SCOPE_LABELS[scope] ?? scope}
                    </div>
                    {treeByScope[scope].map(node => (
                      <PermNode
                        key={node.key}
                        node={node}
                        depth={0}
                        granted={grantedSet}
                        roleId={selectedRoleId}
                        roleType={roleTab}
                        isPending={isPending}
                        onToggle={toggleMut.mutate}
                        onGrantChildren={grantChildrenMut.mutate}
                        onRevokeChildren={revokeChildrenMut.mutate}
                      />
                    ))}
                  </div>
                ))}

              {/* Unknown scopes */}
              {Object.keys(treeByScope)
                .filter(s => !scopeOrder.includes(s))
                .map(scope => (
                  <div key={scope}>
                    <div className={styles.permScopeHeader}>{scope}</div>
                    {treeByScope[scope].map(node => (
                      <PermNode
                        key={node.key}
                        node={node}
                        depth={0}
                        granted={grantedSet}
                        roleId={selectedRoleId}
                        roleType={roleTab}
                        isPending={isPending}
                        onToggle={toggleMut.mutate}
                        onGrantChildren={grantChildrenMut.mutate}
                        onRevokeChildren={revokeChildrenMut.mutate}
                      />
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function GlobalConfigPage() {
  const { status } = useSuperadminGuard();
  const [tab, setTab] = useState<Tab>('empresa');

  if (status === 'loading')       return <Spinner />;
  if (status === 'unauthorized')  return null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>Configuración del Sistema</div>
        <div className={styles.subtitle}>Solo superadmin · Cambios aplicados inmediatamente</div>
      </div>

      <div className={styles.tabBar}>
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === 'empresa'       && <CompanyTab />}
        {tab === 'sedes'         && (
          <ListTab<Headquarter>
            queryKey={['sys-config-hq']}
            queryFn={systemConfigService.getHeadquarters}
            createFn={systemConfigService.createHeadquarter}
            deleteFn={systemConfigService.deleteHeadquarter}
            label="Sedes"
            fields={[
              { key: 'name',    label: 'Nombre',   required: true },
              { key: 'city',    label: 'Ciudad' },
              { key: 'address', label: 'Dirección' },
              { key: 'phone',   label: 'Teléfono' },
              { key: 'email',   label: 'Email' },
            ]}
          />
        )}
        {tab === 'departamentos' && (
          <ListTab<Department>
            queryKey={['sys-config-depts']}
            queryFn={systemConfigService.getDepartments}
            createFn={systemConfigService.createDepartment}
            deleteFn={systemConfigService.deleteDepartment}
            label="Departamentos"
            fields={[
              { key: 'name',        label: 'Nombre',      required: true },
              { key: 'description', label: 'Descripción' },
            ]}
          />
        )}
        {tab === 'cargos'        && (
          <ListTab<Position>
            queryKey={['sys-config-positions']}
            queryFn={systemConfigService.getPositions}
            createFn={systemConfigService.createPosition}
            deleteFn={systemConfigService.deletePosition}
            label="Cargos"
            fields={[
              { key: 'name',        label: 'Nombre',                   required: true },
              { key: 'level',       label: 'Nivel jerárquico (1–10)',  type: 'number', required: true, min: 1, max: 10 },
              { key: 'description', label: 'Descripción' },
            ]}
          />
        )}
        {tab === 'sla'           && <SlaTab />}
        {tab === 'tipos'         && <RequestTypesTab />}
        {tab === 'permisos'      && <RolesPermissionsTab />}
        {tab === 'importar'      && <ImportTab />}
      </div>
    </div>
  );
}
