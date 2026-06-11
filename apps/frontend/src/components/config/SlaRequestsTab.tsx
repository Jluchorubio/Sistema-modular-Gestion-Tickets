'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Check, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { SlaRule } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

const PRIORITIES = ['critica', 'alta', 'media', 'baja'] as const;
type Priority = typeof PRIORITIES[number];

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
    ...(variant === 'edit'   && { background: 'transparent', color: '#0e2235', border: '1px solid #e2e8f0' }),
  } as React.CSSProperties),
};

function RuleEditRow({ rule, onSave, onCancel }: {
  rule:     SlaRule;
  onSave:   (form: { hours_to_resolve: number; hours_to_first_response: number }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    hours_to_resolve:        rule.hours_to_resolve,
    hours_to_first_response: rule.hours_to_first_response,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 120 }}>Horas resolución</label>
      <input type="number" min={1} value={form.hours_to_resolve}
        onChange={e => setForm(f => ({ ...f, hours_to_resolve: Number(e.target.value) }))}
        style={{ width: 70, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
      <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 130 }}>Horas 1ª respuesta</label>
      <input type="number" min={1} value={form.hours_to_first_response}
        onChange={e => setForm(f => ({ ...f, hours_to_first_response: Number(e.target.value) }))}
        style={{ width: 70, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 13, fontFamily: 'inherit' }} />
      <button style={s.btn('save')} onClick={() => onSave(form)}><Check size={13} /></button>
      <button style={s.btn('cancel')} onClick={onCancel}><X size={13} /></button>
    </div>
  );
}

export function SlaRequestsTab() {
  const qc       = useQueryClient();
  const critical = useCriticalChange();
  const [view, setView] = useState<'chain' | 'list'>('chain');

  const { data: rules = [], isLoading } = useQuery<SlaRule[]>({
    queryKey: ['sys-sla-rules'],
    queryFn:  systemConfigService.getSlaRules,
    staleTime: 60_000,
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [simType,  setSimType]  = useState('');
  const [simPrio,  setSimPrio]  = useState<Priority>('media');

  const updateMut = useMutation({
    mutationFn: ({ id, dto, auth }: { id: string; dto: { hours_to_resolve: number; hours_to_first_response: number }; auth: unknown }) =>
      systemConfigService.updateSlaRule(id, dto, auth as never),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-sla-rules'] }); setEditId(null); },
  });

  const globalByPriority = useMemo(() => {
    const m = new Map<string, SlaRule>();
    (rules as SlaRule[]).filter(r => !r.request_type && r.is_active).forEach(r => m.set(r.priority, r));
    return m;
  }, [rules]);

  const overridesByPriority = useMemo(() => {
    const m = new Map<string, SlaRule[]>();
    (rules as SlaRule[]).filter(r => !!r.request_type).forEach(r => {
      m.set(r.priority, [...(m.get(r.priority) ?? []), r]);
    });
    return m;
  }, [rules]);

  const allRequestTypes = useMemo(() =>
    Array.from(new Set((rules as SlaRule[]).filter(r => r.request_type).map(r => r.request_type as string))),
    [rules],
  );

  const effectiveRule = useMemo(() => {
    if (!simType) return globalByPriority.get(simPrio) ?? null;
    return (rules as SlaRule[]).find(r => r.request_type === simType && r.priority === simPrio && r.is_active)
      ?? globalByPriority.get(simPrio) ?? null;
  }, [simType, simPrio, rules, globalByPriority]);

  const effectiveSource: 'global' | 'type-specific' | 'global-fallback' = useMemo(() => {
    if (!simType) return 'global';
    const hasOverride = (rules as SlaRule[]).some(r => r.request_type === simType && r.priority === simPrio && r.is_active);
    return hasOverride ? 'type-specific' : 'global-fallback';
  }, [simType, simPrio, rules]);

  const handleSave = (r: SlaRule, form: { hours_to_resolve: number; hours_to_first_response: number }) => {
    critical.triggerCritical(
      {
        entityLabel:  `Regla SLA — ${PRIORITY_LABEL[r.priority] ?? r.priority}`,
        description:  `Cambiar a ${form.hours_to_resolve}h resolución / ${form.hours_to_first_response}h primera respuesta`,
      },
      async (auth) => { await updateMut.mutateAsync({ id: r.id, dto: form, auth }); },
    );
  };

  const toggleExpand = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  if (isLoading) return <Spinner />;

  const generic  = (rules as SlaRule[]).filter(r => !r.request_type);
  const specific = (rules as SlaRule[]).filter(r =>  r.request_type);

  return (
    <>
      <CriticalChangeModal {...critical} />

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {([['chain', 'Cadena de herencia'], ['list', 'Editar reglas']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', border: '1px solid',
              background:  view === v ? '#0e2235' : '#fff',
              color:       view === v ? '#fff'    : '#64748b',
              borderColor: view === v ? '#0e2235' : '#e2e8f0',
            }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'chain' ? (
        /* ── Chain view ─────────────────────────────────────────────── */
        <div>
          <div style={s.sectionTitle}>Cadena de herencia SLA</div>
          <div style={s.sub}>
            La regla específica por tipo sobreescribe la global. Sede y módulo = próximamente.
          </div>

          {PRIORITIES.map(prio => {
            const global    = globalByPriority.get(prio);
            const overrides = overridesByPriority.get(prio) ?? [];
            const isOpen    = !!expanded[prio];
            return (
              <div key={prio} style={{ marginBottom: 8, border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <button
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: '#f8fafc', border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                  onClick={() => toggleExpand(prio)}>
                  <span style={{ ...s.badge, ...(PRIORITY_STYLE[prio] ?? PRIORITY_STYLE.baja) }}>
                    {PRIORITY_LABEL[prio]}
                  </span>
                  {global ? (
                    <span style={{ fontSize: 12, color: '#475569', flex: 1 }}>
                      {global.hours_to_resolve}h resolución · {global.hours_to_first_response}h respuesta
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#f59e0b', flex: 1 }}>Sin regla global</span>
                  )}
                  {overrides.length > 0 && (
                    <span style={{ fontSize: 10, color: '#ff5e3a', background: 'rgba(14,34,53,.06)',
                      padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                      {overrides.length} override{overrides.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {isOpen ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                </button>

                {isOpen && (
                  <div style={{ padding: '0 14px 14px', background: '#fff' }}>
                    {/* Global rule */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        Global (base)
                      </div>
                      {global ? (
                        <div style={{ ...s.row, marginBottom: 0 }}>
                          {editId === global.id ? (
                            <RuleEditRow rule={global}
                              onSave={form => handleSave(global, form)}
                              onCancel={() => setEditId(null)} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#475569' }}>
                              <span>{global.hours_to_resolve}h resolución</span>
                              <span>{global.hours_to_first_response}h primera respuesta</span>
                              <button style={s.btn('edit')} onClick={() => setEditId(global.id)}>
                                <Pencil size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No configurada</div>
                      )}
                    </div>

                    {/* Type-specific overrides */}
                    {overrides.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8',
                          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          Overrides por tipo
                        </div>
                        {overrides.map(r => (
                          <div key={r.id} style={{ ...s.row, marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                              marginBottom: editId === r.id ? 4 : 6 }}>
                              <span style={{ fontSize: 11, color: '#0e2235', fontFamily: 'monospace',
                                background: 'rgba(14,34,53,.06)', padding: '1px 6px', borderRadius: 4,
                                border: '1px solid #e2e8f0' }}>
                                {r.request_type}
                              </span>
                              {!r.is_active && (
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>inactivo</span>
                              )}
                            </div>
                            {editId === r.id ? (
                              <RuleEditRow rule={r}
                                onSave={form => handleSave(r, form)}
                                onCancel={() => setEditId(null)} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#475569' }}>
                                <span>{r.hours_to_resolve}h resolución</span>
                                <span>{r.hours_to_first_response}h primera respuesta</span>
                                <button style={s.btn('edit')} onClick={() => setEditId(r.id)}>
                                  <Pencil size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Placeholders for future levels */}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      {['Sede', 'Módulo'].map(label => (
                        <div key={label} style={{ fontSize: 10, color: '#cbd5e1',
                          padding: '4px 10px', border: '1px dashed #e2e8f0', borderRadius: 4,
                          display: 'flex', alignItems: 'center', gap: 4 }}>
                          ↳ {label} <span style={{ fontStyle: 'italic' }}>próximamente</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ¿Qué SLA aplica? simulator */}
          <div style={{ marginTop: 24, border: '1px solid #e0e7ff', borderRadius: 2,
            background: 'rgba(99,102,241,.03)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Search size={13} color="#ff5e3a" />
              <span style={{ fontSize: 11, fontWeight: 900, color: '#0e2235',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ¿Qué SLA aplica?
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  Tipo de solicitud
                </div>
                <select value={simType} onChange={e => setSimType(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4,
                    fontSize: 12, fontFamily: 'inherit', background: '#fff', minWidth: 160 }}>
                  <option value="">— Global —</option>
                  {allRequestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Prioridad</div>
                <select value={simPrio} onChange={e => setSimPrio(e.target.value as Priority)}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 4,
                    fontSize: 12, fontFamily: 'inherit', background: '#fff' }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </div>
            </div>
            {effectiveRule ? (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff',
                border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>
                    {effectiveRule.hours_to_resolve}h resolución
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0e2235' }}>
                    {effectiveRule.hours_to_first_response}h primera respuesta
                  </span>
                  <span style={{
                    fontSize: 10, fontStyle: 'italic',
                    color: effectiveSource === 'type-specific' ? '#059669' : '#ff5e3a',
                  }}>
                    {effectiveSource === 'type-specific'
                      ? `override "${simType}"`
                      : effectiveSource === 'global-fallback'
                      ? `fallback global (sin override para "${simType}")`
                      : 'regla global'}
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, fontSize: 11, color: '#f59e0b' }}>
                Sin regla SLA para esta combinación.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── List / edit view ────────────────────────────────────────── */
        <div>
          <div style={s.sectionTitle}>Reglas SLA globales</div>
          <div style={s.sub}>Aplican a todas las solicitudes según prioridad calculada</div>
          <div style={{ marginBottom: 16 }}>
            {generic.map(r => {
              const pStyle = { ...s.badge, ...(PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.baja) };
              return (
                <div key={r.id} style={s.row}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={pStyle}>{PRIORITY_LABEL[r.priority]}</span>
                  </div>
                  {editId === r.id ? (
                    <RuleEditRow rule={r}
                      onSave={form => handleSave(r, form)}
                      onCancel={() => setEditId(null)} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#475569', marginTop: 6 }}>
                      <span>{r.hours_to_resolve}h resolución</span>
                      <span>{r.hours_to_first_response}h primera respuesta</span>
                      <button style={s.btn('edit')} onClick={() => setEditId(r.id)}>
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {specific.length > 0 && (
            <>
              <div style={{ ...s.sectionTitle, marginTop: 24 }}>Reglas SLA por tipo</div>
              <div style={s.sub}>Sobreescriben las reglas globales para tipos específicos</div>
              {specific.map(r => {
                const pStyle = { ...s.badge, ...(PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.baja) };
                return (
                  <div key={r.id} style={s.row}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editId === r.id ? 4 : 0 }}>
                      <span style={pStyle}>{PRIORITY_LABEL[r.priority]}</span>
                      <span style={{ fontSize: 11, color: '#0e2235', fontFamily: 'monospace',
                        background: 'rgba(14,34,53,.06)', padding: '1px 6px', borderRadius: 4,
                        border: '1px solid #e2e8f0' }}>
                        {r.request_type}
                      </span>
                    </div>
                    {editId === r.id ? (
                      <RuleEditRow rule={r}
                        onSave={form => handleSave(r, form)}
                        onCancel={() => setEditId(null)} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: '#475569', marginTop: 6 }}>
                        <span>{r.hours_to_resolve}h resolución</span>
                        <span>{r.hours_to_first_response}h primera respuesta</span>
                        <button style={s.btn('edit')} onClick={() => setEditId(r.id)}>
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </>
  );
}
