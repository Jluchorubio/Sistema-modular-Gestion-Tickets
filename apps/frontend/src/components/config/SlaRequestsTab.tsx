'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { SlaRule } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  critica: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
  alta:    { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
  media:   { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  baja:    { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
};

const s = {
  sectionTitle: {
    fontSize: 11, fontWeight: 900, color: '#0e2235',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4,
  } satisfies React.CSSProperties,
  sub: { fontSize: 11, color: '#94a3b8', marginBottom: 12 } satisfies React.CSSProperties,
  row: {
    background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 4, padding: '10px 14px', marginBottom: 8,
  } satisfies React.CSSProperties,
  badge: {
    fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 4,
    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  } satisfies React.CSSProperties,
  btn: (variant: 'save' | 'cancel' | 'edit') => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', border: 'none',
    ...(variant === 'save'   && { background: '#059669', color: '#fff' }),
    ...(variant === 'cancel' && { background: '#fff', color: '#64748b', border: '1px solid #e2e8f0' }),
    ...(variant === 'edit'   && { background: 'transparent', color: '#4f46e5', border: '1px solid #e2e8f0' }),
  } as React.CSSProperties),
};

export function SlaRequestsTab() {
  const qc      = useQueryClient();
  const critical = useCriticalChange();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['sys-config-sla'],
    queryFn:  systemConfigService.getSlaRules,
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ hours_to_resolve: 24, hours_to_first_response: 1 });

  const updateMut = useMutation({
    mutationFn: ({ id, dto, auth }: { id: string; dto: typeof editForm; auth: any }) =>
      systemConfigService.updateSlaRule(id, dto, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-sla'] }); setEditId(null); },
  });

  if (isLoading) return <Spinner />;

  const generic  = (rules as SlaRule[]).filter(r => !r.request_type);
  const specific = (rules as SlaRule[]).filter(r =>  r.request_type);

  const handleSave = (r: SlaRule) => {
    critical.triggerCritical(
      { entityLabel: `Regla SLA — ${PRIORITY_LABEL[r.priority] ?? r.priority}`, description: `Cambiar a ${editForm.hours_to_resolve}h resolución / ${editForm.hours_to_first_response}h primera respuesta` },
      async (auth) => {
        await updateMut.mutateAsync({ id: r.id, dto: editForm, auth });
      },
    );
  };

  const renderRule = (r: SlaRule) => {
    const isEditing = editId === r.id;
    const pStyle    = { ...s.badge, ...(PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.baja) };

    return (
      <div key={r.id} style={s.row}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isEditing ? 10 : 0 }}>
          <span style={pStyle}>{PRIORITY_LABEL[r.priority]}</span>
          {r.request_type && (
            <span style={{ fontSize: 11, color: '#4f46e5', fontFamily: 'monospace',
              background: 'rgba(79,70,229,.06)', padding: '1px 6px', borderRadius: 4, border: '1px solid #c7d2fe' }}>
              {r.request_type}
            </span>
          )}
        </div>

        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 120 }}>Horas resolución</label>
            <input type="number" min={1} value={editForm.hours_to_resolve}
              onChange={e => setEditForm(f => ({ ...f, hours_to_resolve: Number(e.target.value) }))}
              style={{ width: 80, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 140 }}>Horas 1ª respuesta</label>
            <input type="number" min={1} value={editForm.hours_to_first_response}
              onChange={e => setEditForm(f => ({ ...f, hours_to_first_response: Number(e.target.value) }))}
              style={{ width: 80, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
            <button style={s.btn('save')} onClick={() => handleSave(r)}>
              <Check size={13} />
            </button>
            <button style={s.btn('cancel')} onClick={() => setEditId(null)}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#475569', marginTop: 6 }}>
            <span>{r.hours_to_resolve}h resolución</span>
            <span>{r.hours_to_first_response}h primera respuesta</span>
            <button style={s.btn('edit')} onClick={() => {
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
    <>
      <CriticalChangeModal {...critical} />
      <div>
        <div style={s.sectionTitle}>Reglas SLA — Solicitudes administrativas</div>
        <div style={s.sub}>Aplican a todas las solicitudes según prioridad calculada</div>
        <div style={{ marginBottom: 16 }}>{generic.map(renderRule)}</div>

        {specific.length > 0 && (
          <>
            <div style={{ ...s.sectionTitle, marginTop: 24 }}>Reglas SLA específicas</div>
            <div style={s.sub}>Sobreescriben las reglas globales para tipos específicos</div>
            {specific.map(renderRule)}
          </>
        )}
      </div>
    </>
  );
}
