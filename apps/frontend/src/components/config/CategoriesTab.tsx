'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Check, X,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight, SlidersHorizontal,
} from 'lucide-react';
import { modulesService, type ModuleCategory, type FieldDef } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';

interface Props { moduleId: string }

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 2,
  fontSize: 13, fontFamily: 'inherit', color: '#0e2235', background: 'var(--app-card)',
  boxSizing: 'border-box', outline: 'none',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

const FIELD_TYPES: { value: FieldDef['type']; label: string }[] = [
  { value: 'text',    label: 'Texto' },
  { value: 'number',  label: 'Número' },
  { value: 'date',    label: 'Fecha' },
  { value: 'select',  label: 'Lista' },
  { value: 'boolean', label: 'Sí / No' },
];

const TYPE_COLOR: Record<FieldDef['type'], string> = {
  text:    '#3b82f6',
  number:  '#8b5cf6',
  date:    '#ec4899',
  select:  '#f59e0b',
  boolean: '#22c55e',
};

function slugKey(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/* ─────────────────────────────────────────────────────────── FieldSchemaPanel */

function FieldSchemaPanel({
  catId, fields, onSave, isPending,
}: {
  catId: string;
  fields: FieldDef[];
  onSave: (id: string, fields: FieldDef[]) => void;
  isPending: boolean;
}) {
  const [adding,     setAdding]     = useState(false);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType,  setFieldType]  = useState<FieldDef['type']>('text');
  const [required,   setRequired]   = useState(false);
  const [options,    setOptions]    = useState('');

  function confirmAdd() {
    if (!fieldLabel.trim()) return;
    const key = slugKey(fieldLabel);
    if (!key || fields.some(f => f.key === key)) return;
    const newField: FieldDef = {
      key,
      label:    fieldLabel.trim(),
      type:     fieldType,
      required,
      ...(fieldType === 'select'
        ? { options: options.split(',').map(o => o.trim()).filter(Boolean) }
        : {}),
    };
    onSave(catId, [...fields, newField]);
    setFieldLabel(''); setFieldType('text'); setRequired(false); setOptions('');
    setAdding(false);
  }

  function removeField(key: string) {
    onSave(catId, fields.filter(f => f.key !== key));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...fields];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onSave(catId, next);
  }

  const keyConflict = !!fieldLabel.trim() && fields.some(f => f.key === slugKey(fieldLabel));

  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none',
      borderRadius: '0 0 6px 6px', padding: '10px 12px', marginBottom: 4,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        Campos dinámicos
        {isPending && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>guardando…</span>}
      </div>

      {fields.length === 0 && !adding && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
          Sin campos. Los campos aquí aparecen en el formulario cuando el usuario elige esta categoría.
        </div>
      )}

      {fields.map((f, idx) => (
        <div key={f.key} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px', background: 'var(--app-card)', border: '1px solid #e2e8f0',
          borderRadius: 2, marginBottom: 4,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0e2235' }}>{f.label}</span>
            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>·{f.key}</span>
            {f.type === 'select' && f.options && f.options.length > 0 && (
              <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>
                [{f.options.slice(0, 3).join(', ')}{f.options.length > 3 ? '…' : ''}]
              </span>
            )}
          </div>

          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
            background: TYPE_COLOR[f.type] + '18', color: TYPE_COLOR[f.type],
            textTransform: 'uppercase', flexShrink: 0,
          }}>
            {FIELD_TYPES.find(t => t.value === f.type)?.label}
          </span>

          {f.required && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
              background: '#fef2f2', color: '#ef4444', textTransform: 'uppercase', flexShrink: 0,
            }}>req</span>
          )}

          <button type="button" disabled={idx === 0 || isPending} onClick={() => move(idx, -1)}
            title="Subir"
            style={{ background: 'none', border: 'none', cursor: idx > 0 ? 'pointer' : 'default', padding: 2, color: '#94a3b8', opacity: idx === 0 ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↑
          </button>
          <button type="button" disabled={idx === fields.length - 1 || isPending} onClick={() => move(idx, 1)}
            title="Bajar"
            style={{ background: 'none', border: 'none', cursor: idx < fields.length - 1 ? 'pointer' : 'default', padding: 2, color: '#94a3b8', opacity: idx === fields.length - 1 ? 0.3 : 1, fontSize: 13, lineHeight: 1 }}>
            ↓
          </button>

          <button type="button" disabled={isPending} onClick={() => removeField(f.key)}
            title="Eliminar campo"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', padding: '3px 6px', color: '#ef4444', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Trash2 size={10} />
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 2, padding: 10, marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={lbl}>Etiqueta *</label>
              <input
                style={{ ...inp, borderColor: keyConflict ? '#fca5a5' : '#e2e8f0' }}
                value={fieldLabel}
                onChange={e => setFieldLabel(e.target.value)}
                placeholder="Ej: Marca"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setAdding(false); }}
              />
              {fieldLabel.trim() && (
                <span style={{ fontSize: 10, color: keyConflict ? '#ef4444' : '#94a3b8' }}>
                  clave: {slugKey(fieldLabel)}{keyConflict ? ' — ya existe' : ''}
                </span>
              )}
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              <select style={inp} value={fieldType} onChange={e => setFieldType(e.target.value as FieldDef['type'])}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {fieldType === 'select' && (
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Opciones (separar con coma)</label>
              <input style={inp} value={options} onChange={e => setOptions(e.target.value)} placeholder="Ej: Rojo, Verde, Azul" />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} />
              Obligatorio
            </label>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              disabled={!fieldLabel.trim() || keyConflict || isPending}
              onClick={confirmAdd}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 12px', background: '#0e2235', color: '#fff',
                border: 'none', borderRadius: 2, fontSize: 11, fontWeight: 700,
                cursor: fieldLabel.trim() && !keyConflict ? 'pointer' : 'not-allowed',
                opacity: fieldLabel.trim() && !keyConflict ? 1 : 0.5, fontFamily: 'inherit',
              }}>
              <Check size={11} /> Agregar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setFieldLabel(''); setFieldType('text'); setRequired(false); setOptions(''); }}
              style={{ padding: '5px 8px', background: 'var(--app-card)', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', background: 'var(--app-card)', color: '#475569',
            border: '1px dashed #cbd5e1', borderRadius: 2,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', marginTop: fields.length > 0 ? 4 : 0,
          }}>
          <Plus size={11} /> Agregar campo
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── CategoryForm */

function CategoryForm({
  parentId, parentOptions, onSave, onCancel, initial,
}: {
  parentId?: string | null;
  parentOptions: ModuleCategory[];
  onSave: (dto: { name: string; description: string; parent_id: string | null }) => void;
  onCancel: () => void;
  initial?: Partial<{ name: string; description: string; parent_id: string | null }>;
}) {
  const [name,   setName]   = useState(initial?.name        ?? '');
  const [desc,   setDesc]   = useState(initial?.description ?? '');
  const [parent, setParent] = useState<string>(initial?.parent_id ?? parentId ?? '');

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Nombre *</label>
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Dispositivos" autoFocus />
        </div>
        <div>
          <label style={lbl}>Categoría padre</label>
          <select style={inp} value={parent} onChange={e => setParent(e.target.value)}>
            <option value="">— Ninguna (categoría raíz) —</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Descripción</label>
        <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción opcional…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onSave({ name, description: desc, parent_id: parent || null })}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: name.trim() ? 1 : 0.5 }}>
          <Check size={13} /> Guardar
        </button>
        <button type="button" onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--app-card)', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── CategoriesTab */

export function CategoriesTab({ moduleId }: Props) {
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useQuery<ModuleCategory[]>({
    queryKey: ['module-categories', moduleId],
    queryFn:  () => modulesService.getCategories(moduleId),
    staleTime: 60_000,
  });

  const [showCreate,   setShowCreate]   = useState(false);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [fieldsOpenId, setFieldsOpenId] = useState<string | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [error,        setError]        = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['module-categories', moduleId] });

  const createMut = useMutation({
    mutationFn: (dto: Parameters<typeof modulesService.createCategory>[1]) =>
      modulesService.createCategory(moduleId, dto),
    onSuccess: () => { invalidate(); setShowCreate(false); setError(''); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof modulesService.updateCategory>[1] }) =>
      modulesService.updateCategory(id, dto),
    onSuccess: () => { invalidate(); setEditId(null); setError(''); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al actualizar'),
  });

  const fieldsMut = useMutation({
    mutationFn: ({ id, field_schema }: { id: string; field_schema: FieldDef[] }) =>
      modulesService.updateCategory(id, { field_schema }),
    onSuccess: () => invalidate(),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al guardar campos'),
  });

  const deleteMut = useMutation({
    mutationFn: modulesService.deleteCategory,
    onSuccess: () => { invalidate(); setError(''); },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al eliminar'),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      modulesService.updateCategory(id, { is_active }),
    onSuccess: () => invalidate(),
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error'),
  });

  const { roots, childrenMap } = useMemo(() => {
    const roots: ModuleCategory[] = [];
    const childrenMap = new Map<string, ModuleCategory[]>();
    categories.forEach(c => {
      if (!c.parent_id) roots.push(c);
      else {
        const arr = childrenMap.get(c.parent_id) ?? [];
        arr.push(c);
        childrenMap.set(c.parent_id, arr);
      }
    });
    return { roots, childrenMap };
  }, [categories]);

  const parentOptions = roots;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openEdit(id: string)   { setEditId(id);   setFieldsOpenId(null); }
  function openFields(id: string) { setFieldsOpenId(prev => prev === id ? null : id); setEditId(null); }

  function CategoryRow({ cat, depth = 0 }: { cat: ModuleCategory; depth?: number }) {
    const children    = childrenMap.get(cat.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen      = expanded.has(cat.id);
    const isEditing   = editId       === cat.id;
    const isFields    = fieldsOpenId === cat.id;
    const [confirmDel, setConfirmDel] = useState(false);

    const fieldCount = cat.field_schema?.length ?? 0;

    return (
      <div>
        {/* ── Row ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `9px 12px 9px ${12 + depth * 20}px`,
          background: 'var(--app-card)',
          border: '1px solid #f1f5f9',
          borderRadius: (confirmDel || isEditing || isFields) ? '6px 6px 0 0' : 6,
          marginBottom: (confirmDel || isEditing || isFields) ? 0 : 4,
          opacity: cat.is_active ? 1 : 0.5,
        }}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(cat.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94a3b8', flexShrink: 0 }}>
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <div style={{ width: 17, flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0e2235' }}>{cat.name}</span>
            {cat.description && (
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{cat.description}</span>
            )}
            {!cat.is_active && (
              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8, fontStyle: 'italic' }}>inactiva</span>
            )}
          </div>

          {depth === 0 && (
            <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 2, fontWeight: 600, flexShrink: 0 }}>
              {children.length} sub
            </span>
          )}

          {/* Campos button */}
          <button
            type="button"
            title={`Campos dinámicos${fieldCount > 0 ? ` (${fieldCount})` : ''}`}
            onClick={() => openFields(cat.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px',
              background: isFields ? '#ede9fe' : 'transparent',
              color: isFields ? '#7c3aed' : (fieldCount > 0 ? '#7c3aed' : '#94a3b8'),
              border: `1px solid ${isFields ? '#c4b5fd' : (fieldCount > 0 ? '#ddd6fe' : '#e2e8f0')}`,
              borderRadius: 2, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
            <SlidersHorizontal size={11} />
            {fieldCount > 0 && <span>{fieldCount}</span>}
          </button>

          <button type="button" onClick={() => openEdit(cat.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: '#ff5e3a', border: '1px solid rgba(255,94,58,.2)', borderRadius: 2, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            <Pencil size={11} />
          </button>

          <button type="button"
            onClick={() => { setConfirmDel(v => !v); setEditId(null); setFieldsOpenId(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 2, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            <Trash2 size={11} />
          </button>

          <button type="button"
            title={cat.is_active ? 'Desactivar' : 'Activar'}
            disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate({ id: cat.id, is_active: !cat.is_active })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: cat.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}>
            {cat.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>
        </div>

        {/* ── Confirm delete ── */}
        {confirmDel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderTop: 'none', borderRadius: '0 0 6px 6px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#991b1b', flex: 1 }}>
              ¿Eliminar <strong>{cat.name}</strong>?
            </span>
            <button type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(cat.id, { onSuccess: () => setConfirmDel(false) })}
              style={{ padding: '3px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {deleteMut.isPending ? '...' : 'Eliminar'}
            </button>
            <button type="button" onClick={() => setConfirmDel(false)}
              style={{ padding: '3px 8px', background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
              Cancelar
            </button>
          </div>
        )}

        {/* ── Edit form ── */}
        {isEditing && (
          <div style={{ paddingLeft: 12 + depth * 20 }}>
            <CategoryForm
              parentOptions={parentOptions.filter(p => p.id !== cat.id)}
              initial={{ name: cat.name, description: cat.description ?? '', parent_id: cat.parent_id }}
              onSave={dto => updateMut.mutate({ id: cat.id, dto })}
              onCancel={() => setEditId(null)}
            />
          </div>
        )}

        {/* ── Field schema panel ── */}
        {isFields && (
          <FieldSchemaPanel
            catId={cat.id}
            fields={cat.field_schema ?? []}
            onSave={(id, fs) => fieldsMut.mutate({ id, field_schema: fs })}
            isPending={fieldsMut.isPending}
          />
        )}

        {/* ── Children ── */}
        {isOpen && hasChildren && (
          <div style={{ paddingLeft: 12 }}>
            {children.map(child => <CategoryRow key={child.id} cat={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        Categorías de activos
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
        Define los tipos de activos del módulo. Máx 2 niveles. Usa{' '}
        <SlidersHorizontal size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
        para agregar campos que aparecen en el formulario al elegir esta categoría.
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {showCreate && (
        <CategoryForm
          parentOptions={parentOptions}
          onSave={dto => createMut.mutate(dto)}
          onCancel={() => { setShowCreate(false); setError(''); }}
        />
      )}

      {roots.length === 0 && !showCreate ? (
        <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: 2, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Sin categorías configuradas.</div>
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> Crear primera categoría
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            {roots.map(cat => <CategoryRow key={cat.id} cat={cat} />)}
          </div>
          {!showCreate && (
            <button type="button" onClick={() => setShowCreate(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--app-card)', color: '#0e2235', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Nueva categoría
            </button>
          )}
        </>
      )}
    </div>
  );
}
