'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { modulesService, type ModuleCategory } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';

interface Props { moduleId: string }

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit', color: '#0e2235', background: '#fff',
  boxSizing: 'border-box', outline: 'none',
};
const label: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

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
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div>
          <label style={label}>Nombre *</label>
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Dispositivos" autoFocus />
        </div>
        <div>
          <label style={label}>Categoría padre</label>
          <select style={inp} value={parent} onChange={e => setParent(e.target.value)}>
            <option value="">— Ninguna (categoría raíz) —</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={label}>Descripción</label>
        <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción opcional…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => onSave({ name, description: desc, parent_id: parent || null })}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: name.trim() ? 1 : 0.5 }}>
          <Check size={13} /> Guardar
        </button>
        <button type="button" onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

export function CategoriesTab({ moduleId }: Props) {
  const qc = useQueryClient();

  const { data: categories = [], isLoading } = useQuery<ModuleCategory[]>({
    queryKey: ['module-categories', moduleId],
    queryFn:  () => modulesService.getCategories(moduleId),
    staleTime: 60_000,
  });

  const [showCreate,  setShowCreate]  = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set());
  const [error,       setError]       = useState('');

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

  // Build tree: roots first, then children
  const { roots, childrenMap } = useMemo(() => {
    const roots: ModuleCategory[] = [];
    const childrenMap = new Map<string, ModuleCategory[]>();
    categories.forEach(c => {
      if (!c.parent_id) {
        roots.push(c);
      } else {
        const arr = childrenMap.get(c.parent_id) ?? [];
        arr.push(c);
        childrenMap.set(c.parent_id, arr);
      }
    });
    return { roots, childrenMap };
  }, [categories]);

  // Only root categories available as parent options (no deep nesting > 2 levels)
  const parentOptions = roots;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function CategoryRow({ cat, depth = 0 }: { cat: ModuleCategory; depth?: number }) {
    const children = childrenMap.get(cat.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(cat.id);
    const isEditing = editId === cat.id;
    const [confirmDel, setConfirmDel] = useState(false);

    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `9px 12px 9px ${12 + depth * 20}px`,
          background: '#fff', border: '1px solid #f1f5f9',
          borderRadius: confirmDel ? '6px 6px 0 0' : 6, marginBottom: confirmDel ? 0 : 4,
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
            <span style={{
              fontSize: 10, color: '#64748b', background: '#f1f5f9',
              padding: '2px 8px', borderRadius: 99, fontWeight: 600, flexShrink: 0,
            }}>
              {children.length} sub
            </span>
          )}

          <button type="button"
            title={cat.is_active ? 'Desactivar' : 'Activar'}
            disabled={toggleMut.isPending}
            onClick={() => toggleMut.mutate({ id: cat.id, is_active: !cat.is_active })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: cat.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}>
            {cat.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>

          <button type="button" onClick={() => setEditId(cat.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: '#4f46e5', border: '1px solid #e0e7ff', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            <Pencil size={11} />
          </button>

          <button type="button"
            onClick={() => setConfirmDel(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            <Trash2 size={11} />
          </button>
        </div>

        {confirmDel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderTop: 'none', borderRadius: '0 0 6px 6px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#991b1b', flex: 1 }}>
              ¿Eliminar categoría <strong>{cat.name}</strong>?
            </span>
            <button type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate(cat.id, { onSuccess: () => setConfirmDel(false) })}
              style={{ padding: '3px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {deleteMut.isPending ? '...' : 'Eliminar'}
            </button>
            <button type="button" onClick={() => setConfirmDel(false)}
              style={{ padding: '3px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 10, cursor: 'pointer', color: '#64748b', fontFamily: 'inherit' }}>
              Cancelar
            </button>
          </div>
        )}

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
        Define los tipos de activos del módulo. Máximo 2 niveles (categoría → subcategoría).
        Desactivar oculta la categoría en formularios sin borrar el historial.
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CategoryForm
          parentOptions={parentOptions}
          onSave={dto => createMut.mutate(dto)}
          onCancel={() => { setShowCreate(false); setError(''); }}
        />
      )}

      {/* Category tree */}
      {roots.length === 0 && !showCreate ? (
        <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>Sin categorías configuradas.</div>
          <button type="button" onClick={() => setShowCreate(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#0e2235', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', color: '#0e2235', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Nueva categoría
            </button>
          )}
        </>
      )}
    </div>
  );
}
