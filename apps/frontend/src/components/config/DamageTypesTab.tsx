'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { DamageType } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

const weightColor = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#64748b';

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  critica: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  alta:    { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  media:   { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  baja:    { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
};

export function DamageTypesTab() {
  const qc       = useQueryClient();
  const critical  = useCriticalChange();

  const { data: allTypes = [], isLoading } = useQuery<DamageType[]>({
    queryKey: ['sys-damage-types'],
    queryFn:  () => systemConfigService.getDamageTypes(),
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', weight: 5 });

  const updateMut = useMutation({
    mutationFn: ({ id, dto, auth }: { id: string; dto: { label?: string; weight?: number; is_active?: boolean }; auth?: any }) =>
      systemConfigService.updateDamageType(id, dto, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-damage-types'] }); setEditId(null); },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; types: DamageType[] }>();
    (allTypes as DamageType[]).forEach(dt => {
      if (!map.has(dt.category_slug)) map.set(dt.category_slug, { label: dt.category_label, types: [] });
      map.get(dt.category_slug)!.types.push(dt);
    });
    return map;
  }, [allTypes]);

  if (isLoading) return <Spinner />;

  const handleToggle = (dt: DamageType) => {
    const nextActive = !dt.is_active;
    critical.triggerCritical(
      { entityLabel: `Tipo de daño — ${dt.label}`, description: `${nextActive ? 'Activar' : 'Desactivar'} este tipo de daño` },
      async (auth) => { await updateMut.mutateAsync({ id: dt.id, dto: { is_active: nextActive }, auth }); },
    );
  };

  const handleSave = (dt: DamageType) => {
    critical.triggerCritical(
      { entityLabel: `Tipo de daño — ${dt.label}`, description: `Etiqueta: "${editForm.label}", Peso: ${editForm.weight}` },
      async (auth) => { await updateMut.mutateAsync({ id: dt.id, dto: editForm, auth }); },
    );
  };

  const fieldInput: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 4,
    fontSize: 13, color: '#0e2235', background: '#fff', boxSizing: 'border-box',
    outline: 'none', fontFamily: 'inherit',
  };

  return (
    <>
      <CriticalChangeModal {...critical} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Tipos de daño
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
          El <strong>peso</strong> (1–10) alimenta el score de prioridad automática.
          Desactivar un tipo lo oculta en formularios sin borrar historial.
        </div>

        {Array.from(grouped.entries()).map(([catSlug, cat]) => (
          <div key={catSlug} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0e2235', marginBottom: 6 }}>
              {cat.label}
            </div>

            <div>
              {cat.types.map(dt => {
                const isEditing = editId === dt.id;
                const prioStyle = { fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4, ...(PRIORITY_STYLE[dt.default_priority] ?? PRIORITY_STYLE.baja) };

                return (
                  <div key={dt.id} style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 4, marginBottom: 8, opacity: dt.is_active ? 1 : 0.45,
                  }}>
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: dt.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}
                        title={dt.is_active ? 'Desactivar' : 'Activar'}
                        disabled={updateMut.isPending}
                        onClick={() => handleToggle(dt)}
                      >
                        {dt.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>

                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0e2235' }}>{dt.label}</span>
                        {dt.is_other && <span style={{ fontSize: 11, color: '#6366f1' }}> · libre</span>}
                      </div>

                      <span style={prioStyle}>{dt.default_priority}</span>

                      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center',
                        color: weightColor(dt.weight), background: '#f1f5f9', borderRadius: 6, padding: '2px 6px' }}>
                        {dt.weight}
                      </span>

                      {!isEditing && (
                        <button
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                            background: 'transparent', color: '#4f46e5', border: '1px solid #e2e8f0',
                            borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                          onClick={() => { setEditId(dt.id); setEditForm({ label: dt.label, weight: dt.weight }); }}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: 16, marginTop: 4 }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Etiqueta</label>
                          <input style={fieldInput} value={editForm.label}
                            onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                            Peso (1–10)
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="range" min={1} max={10} style={{ flex: 1 }}
                              value={editForm.weight}
                              onChange={e => setEditForm(f => ({ ...f, weight: Number(e.target.value) }))} />
                            <span style={{ minWidth: 24, fontWeight: 700, color: weightColor(editForm.weight) }}>
                              {editForm.weight}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            disabled={updateMut.isPending || !editForm.label.trim()}
                            onClick={() => handleSave(dt)}>
                            <Check size={13} /> Guardar
                          </button>
                          <button
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
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
          </div>
        ))}
      </div>
    </>
  );
}
