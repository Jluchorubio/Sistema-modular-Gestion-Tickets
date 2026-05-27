'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { RequestTypeConfig } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

const s = {
  row: {
    display: 'flex' as const, alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: '10px 14px', background: '#f8fafc',
    border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 8,
  } satisfies React.CSSProperties,
  name:  { fontSize: 13, fontWeight: 600, color: '#0e2235' } satisfies React.CSSProperties,
  meta:  { fontSize: 11, color: '#94a3b8' } satisfies React.CSSProperties,
  title: {
    fontSize: 11, fontWeight: 900, color: '#0e2235',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4,
  } satisfies React.CSSProperties,
  sub:   { fontSize: 11, color: '#94a3b8', marginBottom: 16 } satisfies React.CSSProperties,
  btn:   (variant: 'save' | 'cancel' | 'edit') => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    ...(variant === 'save'   && { background: '#059669', color: '#fff', border: 'none' }),
    ...(variant === 'cancel' && { background: '#fff', color: '#64748b', border: '1px solid #e2e8f0' }),
    ...(variant === 'edit'   && { background: 'transparent', color: '#4f46e5', border: '1px solid #e2e8f0' }),
  } as React.CSSProperties),
};

export function RequestTypesTab() {
  const qc       = useQueryClient();
  const critical  = useCriticalChange();

  const { data: types = [], isLoading } = useQuery<RequestTypeConfig[]>({
    queryKey: ['sys-config-request-types'],
    queryFn:  () => systemConfigService.getRequestTypes(false),
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', description: '' });

  const updateMut = useMutation({
    mutationFn: ({ id, dto, auth }: { id: string; dto: any; auth?: any }) =>
      systemConfigService.updateRequestType(id, dto, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-request-types'] }); setEditId(null); },
  });

  if (isLoading) return <Spinner />;

  const fieldInput: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0',
    borderRadius: 4, fontSize: 13, color: '#0e2235', background: '#fff',
    boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  };

  const handleToggle = (t: RequestTypeConfig) => {
    const next = !t.is_active;
    critical.triggerCritical(
      { entityLabel: `Tipo de solicitud — ${t.label}`, description: `${next ? 'Activar' : 'Desactivar'} este tipo` },
      async (auth) => { await updateMut.mutateAsync({ id: t.id, dto: { is_active: next }, auth }); },
    );
  };

  const handleSave = (t: RequestTypeConfig) => {
    critical.triggerCritical(
      { entityLabel: `Tipo de solicitud — ${t.label}`, description: `Etiqueta: "${editForm.label}"` },
      async (auth) => { await updateMut.mutateAsync({ id: t.id, dto: editForm, auth }); },
    );
  };

  return (
    <>
      <CriticalChangeModal {...critical} />
      <div>
        <div style={s.title}>Tipos de solicitud</div>
        <div style={s.sub}>
          Activa/desactiva tipos o edita su etiqueta. Los tipos inactivos no aparecen al crear solicitudes.
        </div>

        <div>
          {(types as RequestTypeConfig[])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(t => {
              const isEditing = editId === t.id;
              return (
                <div key={t.id} style={{ ...s.row, flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: t.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}
                      title={t.is_active ? 'Desactivar' : 'Activar'}
                      disabled={updateMut.isPending}
                      onClick={() => handleToggle(t)}
                    >
                      {t.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...s.name, opacity: t.is_active ? 1 : 0.45 }}>{t.label}</span>
                      <span style={s.meta}> · <code style={{ fontSize: 11 }}>{t.type_key}</code></span>
                      {t.requires_module && (
                        <span style={{ ...s.meta, color: '#6366f1' }}> · módulo requerido</span>
                      )}
                      {t.allows_manual_priority && (
                        <span style={{ ...s.meta, color: '#f59e0b' }}> · prioridad manual</span>
                      )}
                    </div>
                    {!isEditing && (
                      <button style={s.btn('edit')}
                        onClick={() => { setEditId(t.id); setEditForm({ label: t.label, description: t.description ?? '' }); }}>
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div style={{ width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 16, marginTop: 4 }}>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Etiqueta</label>
                        <input style={fieldInput} value={editForm.label}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Descripción</label>
                        <input style={fieldInput} value={editForm.description}
                          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button style={s.btn('save')}
                          disabled={updateMut.isPending || !editForm.label.trim()}
                          onClick={() => handleSave(t)}>
                          <Check size={13} /> Guardar
                        </button>
                        <button style={s.btn('cancel')} onClick={() => setEditId(null)}>
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
    </>
  );
}
