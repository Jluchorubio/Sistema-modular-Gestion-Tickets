'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Check, X, ToggleLeft, ToggleRight,
  ChevronDown, ChevronRight, Globe, Lock,
} from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { DamageType, TicketCategory } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
  green:  '#22c55e',
};

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#64748b';

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  critica: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  alta:    { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  media:   { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  baja:    { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
};

const PRIORITIES = ['baja', 'media', 'alta', 'critica'] as const;

const fieldInput: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 4,
  fontSize: 13, color: C.navy, background: '#fff', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: C.sub,
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
};

interface CategoryGroup {
  id:        string;
  slug:      string;
  label:     string;
  is_active: boolean;
  types:     DamageType[];
}

interface Props {
  /** Undefined = global config mode (superadmin only). Set = module mode (shows global read-only + module editable). */
  moduleId?: string;
}

export function DamageTypesTab({ moduleId }: Props) {
  const qc       = useQueryClient();
  const critical = useCriticalChange();
  const isGlobalMode = !moduleId;

  // Global mode: admin endpoint (includes inactive). Module mode: public endpoint (active only).
  const { data: categories = [], isLoading: loadingCats } =
    useQuery<TicketCategory[]>({
      queryKey: isGlobalMode ? ['ticket-categories-all'] : ['ticket-categories'],
      queryFn:  isGlobalMode
        ? () => systemConfigService.getTicketCategoriesAll()
        : () => systemConfigService.getTicketCategories(),
    });

  const { data: allTypes = [], isLoading: loadingTypes } =
    useQuery<DamageType[]>({
      queryKey: ['sys-damage-types-admin', moduleId ?? 'global'],
      queryFn:  () => systemConfigService.getDamageTypesAdmin(moduleId),
    });

  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editForm,     setEditForm]     = useState({ label: '', weight: 5 });
  const [addingCat,    setAddingCat]    = useState(false);
  const [catLabel,     setCatLabel]     = useState('');
  const [addingTypeIn, setAddingTypeIn] = useState<string | null>(null);
  const [newType,      setNewType]      = useState({ label: '', priority: 'media', weight: 5 });

  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    categories.forEach(cat => {
      map.set(cat.id, { id: cat.id, slug: cat.slug, label: cat.label, is_active: cat.is_active ?? true, types: [] });
    });
    allTypes.forEach(dt => {
      map.get(dt.category_id)?.types.push(dt);
    });
    return Array.from(map.values());
  }, [categories, allTypes]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ticket-categories-all'] });
    qc.invalidateQueries({ queryKey: ['sys-damage-types-admin'] });
    qc.invalidateQueries({ queryKey: ['sys-damage-types'] });
  };

  /* ── Global update (superadmin + critical auth) ── */
  const updateMut = useMutation({
    mutationFn: ({ id, dto, auth }: { id: string; dto: { label?: string; weight?: number; is_active?: boolean }; auth?: any }) =>
      systemConfigService.updateDamageType(id, dto, auth),
    onSuccess: () => { invalidate(); setEditId(null); },
  });

  /* ── Module-specific update (admin_modulo, no critical auth) ── */
  const moduleUpdateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { label?: string; weight?: number; is_active?: boolean } }) =>
      systemConfigService.updateModuleDamageType(id, dto),
    onSuccess: () => { invalidate(); setEditId(null); },
  });

  const createCatMut = useMutation({
    mutationFn: (label: string) => systemConfigService.createTicketCategory({ label }),
    onSuccess: () => { invalidate(); setAddingCat(false); setCatLabel(''); },
  });

  const createTypeMut = useMutation({
    mutationFn: (dto: { category_id: string; label: string; default_priority: string; weight: number; module_id?: string }) =>
      systemConfigService.createDamageType(dto),
    onSuccess: () => { invalidate(); setAddingTypeIn(null); setNewType({ label: '', priority: 'media', weight: 5 }); },
  });

  const isGlobalType = (dt: DamageType) => dt.module_id === null;
  const canEditType  = (dt: DamageType) => isGlobalMode || !isGlobalType(dt);

  const handleToggle = (dt: DamageType) => {
    const next = !dt.is_active;
    if (isGlobalMode || isGlobalType(dt)) {
      // Global type: need critical auth
      critical.triggerCritical(
        { entityLabel: `Tipo de daño — ${dt.label}`, description: `${next ? 'Activar' : 'Desactivar'} este tipo de daño` },
        async (auth) => { await updateMut.mutateAsync({ id: dt.id, dto: { is_active: next }, auth }); },
      );
    } else {
      // Module-specific type: no critical auth needed
      moduleUpdateMut.mutate({ id: dt.id, dto: { is_active: next } });
    }
  };

  const handleSave = (dt: DamageType) => {
    if (isGlobalMode || isGlobalType(dt)) {
      critical.triggerCritical(
        { entityLabel: `Tipo de daño — ${dt.label}`, description: `Etiqueta: "${editForm.label}", Peso: ${editForm.weight}` },
        async (auth) => { await updateMut.mutateAsync({ id: dt.id, dto: editForm, auth }); },
      );
    } else {
      moduleUpdateMut.mutate({ id: dt.id, dto: editForm });
    }
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  if (loadingCats || loadingTypes) return <Spinner />;

  return (
    <>
      <CriticalChangeModal {...critical} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {isGlobalMode ? 'Tipos de daño globales' : 'Tipos de daño del módulo'}
        </div>
        {isGlobalMode && (
          <button
            onClick={() => { setAddingCat(v => !v); setCatLabel(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.coral, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={12} /> Nueva categoría
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 20 }}>
        {isGlobalMode
          ? <>El <strong>peso</strong> (1–10) alimenta el score de prioridad automática. Los tipos globales aplican a todos los módulos.</>
          : <>Los tipos <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Globe size={11} /></span> globales son solo lectura. Agrega tipos específicos de este módulo con <strong>Agregar tipo</strong>.</>
        }
      </div>

      {/* Add category form (global mode only) */}
      {isGlobalMode && addingCat && (
        <div style={{ background: '#fff', border: `1px solid ${C.coral}40`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <label style={lbl}>Nombre de categoría</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              style={{ ...fieldInput, flex: 1 }}
              placeholder="Ej: Conectividad, Seguridad…"
              value={catLabel}
              onChange={e => setCatLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && catLabel.trim()) createCatMut.mutate(catLabel.trim()); }}
            />
            <button
              disabled={!catLabel.trim() || createCatMut.isPending}
              onClick={() => createCatMut.mutate(catLabel.trim())}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 4, border: 'none', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: catLabel.trim() ? 1 : 0.5 }}>
              <Check size={13} /> Crear
            </button>
            <button
              onClick={() => setAddingCat(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Sin categorías. {isGlobalMode ? 'Crea una para empezar.' : 'Contacta al superadmin para crear categorías.'}
        </div>
      )}

      {groups.map(cat => {
        const isCollapsed  = collapsed.has(cat.id);
        const isAddingHere = addingTypeIn === cat.id;

        return (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            {/* Category header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px',
                background: C.navy, borderRadius: isCollapsed ? 8 : '8px 8px 0 0',
                cursor: 'pointer', userSelect: 'none',
              }}
              onClick={() => toggleCollapse(cat.id)}
            >
              {isCollapsed
                ? <ChevronRight size={14} color="#fff" />
                : <ChevronDown size={14} color="#fff" />}

              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff' }}>{cat.label}</span>

              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                {cat.types.filter(t => t.is_active).length} / {cat.types.length}
              </span>

              {!isCollapsed && (
                <button
                  onClick={e => { e.stopPropagation(); setAddingTypeIn(isAddingHere ? null : cat.id); setNewType({ label: '', priority: 'media', weight: 5 }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Plus size={11} /> Agregar tipo
                </button>
              )}
            </div>

            {/* Category body */}
            {!isCollapsed && (
              <div style={{ border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>

                {/* Inline add form */}
                {isAddingHere && (
                  <div style={{ padding: '14px 16px', background: `${C.coral}08`, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>Nombre del tipo</label>
                        <input
                          autoFocus
                          style={fieldInput}
                          placeholder="Ej: Sin señal, Pantalla rota…"
                          value={newType.label}
                          onChange={e => setNewType(f => ({ ...f, label: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={lbl}>Prioridad por defecto</label>
                        <select
                          style={{ ...fieldInput }}
                          value={newType.priority}
                          onChange={e => setNewType(f => ({ ...f, priority: e.target.value }))}>
                          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Peso (1–10): <strong style={{ color: weightColor(newType.weight) }}>{newType.weight}</strong></label>
                        <input type="range" min={1} max={10} style={{ width: '100%', marginTop: 4 }}
                          value={newType.weight}
                          onChange={e => setNewType(f => ({ ...f, weight: Number(e.target.value) }))} />
                      </div>
                    </div>
                    {!isGlobalMode && (
                      <div style={{ marginBottom: 8, padding: '5px 8px', background: '#eff6ff', borderRadius: 4, fontSize: 10, color: '#1d4ed8', fontWeight: 600 }}>
                        Este tipo será específico del módulo actual.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        disabled={!newType.label.trim() || createTypeMut.isPending}
                        onClick={() => createTypeMut.mutate({
                          category_id: cat.id,
                          label: newType.label.trim(),
                          default_priority: newType.priority,
                          weight: newType.weight,
                          module_id: moduleId,
                        })}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 4, border: 'none', background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: newType.label.trim() ? 1 : 0.5 }}>
                        <Check size={13} /> Crear tipo
                      </button>
                      <button
                        onClick={() => setAddingTypeIn(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#fff', color: C.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <X size={13} /> Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {cat.types.length === 0 && !isAddingHere && (
                  <div style={{ padding: '20px 16px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
                    Sin tipos. Usa «Agregar tipo» para crear uno.
                  </div>
                )}

                {cat.types.map((dt, idx) => {
                  const isEditing  = editId === dt.id;
                  const isReadOnly = !canEditType(dt);
                  const prioStyle: React.CSSProperties = {
                    fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                    ...(PRIORITY_STYLE[dt.default_priority] ?? PRIORITY_STYLE.baja),
                  };

                  return (
                    <div key={dt.id} style={{
                      borderBottom: idx < cat.types.length - 1 ? `1px solid ${C.border}` : 'none',
                      opacity: dt.is_active ? 1 : 0.45,
                      background: isReadOnly ? '#fafbfc' : '#fff',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
                        <button
                          style={{ background: 'none', border: 'none', cursor: isReadOnly ? 'default' : 'pointer', padding: 2, color: isReadOnly ? C.muted : (dt.is_active ? C.green : C.muted), flexShrink: 0 }}
                          title={isReadOnly ? 'Tipo global — solo lectura' : (dt.is_active ? 'Desactivar' : 'Activar')}
                          disabled={isReadOnly || updateMut.isPending || moduleUpdateMut.isPending}
                          onClick={() => !isReadOnly && handleToggle(dt)}>
                          {dt.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        </button>

                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{dt.label}</span>
                          {dt.is_other && <span style={{ fontSize: 11, color: 'var(--status-info-text, #1d4ed8)' }}> · libre</span>}
                          {!dt.is_active && <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>inactivo</span>}
                        </div>

                        {/* Global badge in module mode */}
                        {!isGlobalMode && isGlobalType(dt) && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            <Globe size={9} /> Global
                          </span>
                        )}

                        <span style={prioStyle}>{dt.default_priority}</span>

                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center',
                          color: weightColor(dt.weight), background: C.bg, borderRadius: 6, padding: '2px 6px', border: `1px solid ${C.border}` }}>
                          {dt.weight}
                        </span>

                        {!isEditing && !isReadOnly && (
                          <button
                            style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', background: 'transparent', color: '#0e2235', border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}
                            onClick={() => { setEditId(dt.id); setEditForm({ label: dt.label, weight: dt.weight }); }}>
                            <Pencil size={12} />
                          </button>
                        )}

                        {isReadOnly && (
                          <span title="Tipo global — gestionado desde /config" style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', color: C.muted }}>
                            <Lock size={12} />
                          </span>
                        )}
                      </div>

                      {isEditing && (
                        <div style={{ background: '#fff', borderTop: `1px solid ${C.border}`, padding: '14px 14px 14px 48px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 12 }}>
                            <div>
                              <label style={lbl}>Etiqueta</label>
                              <input style={fieldInput} value={editForm.label}
                                onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                            </div>
                            <div>
                              <label style={lbl}>Peso (1–10): <strong style={{ color: weightColor(editForm.weight) }}>{editForm.weight}</strong></label>
                              <input type="range" min={1} max={10} style={{ width: '100%', marginTop: 10 }}
                                value={editForm.weight}
                                onChange={e => setEditForm(f => ({ ...f, weight: Number(e.target.value) }))} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                              disabled={updateMut.isPending || moduleUpdateMut.isPending || !editForm.label.trim()}
                              onClick={() => handleSave(dt)}>
                              <Check size={13} /> Guardar
                            </button>
                            <button
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fff', color: C.sub, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                              onClick={() => setEditId(null)}>
                              <X size={13} /> Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
