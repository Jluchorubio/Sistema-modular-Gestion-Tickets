'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, ChevronRight, ChevronDown, ToggleLeft, ToggleRight, ShieldAlert } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import { modulesService }      from '@/services/modules.service';
import { ticketsService }      from '@/services/tickets.service';
import type { TicketSlaRule, SlaCondition, DamageType, TicketCategory } from '@/services/system-config.service';
import type { ModuleCategory } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange, type CriticalAuthData } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

interface Props { moduleId: string }
type TriggerFn = ReturnType<typeof useCriticalChange>['triggerCritical'];

/* ── Design tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

const SLA_FIELDS = [
  { value: 'priority',       label: 'Prioridad'    },
  { value: 'urgency',        label: 'Urgencia'     },
  { value: 'impact',         label: 'Impacto'      },
  { value: 'category_id',    label: 'Categoría'    },
  { value: 'damage_type_id', label: 'Tipo de daño' },
  { value: 'environment_id', label: 'Ambiente'     },
];

const SLA_OPERATORS    = ['=', '!=', 'IN', '>', '<', '>=', '<='];
const PRIORITY_OPTIONS = ['baja', 'media', 'alta', 'critica'];
const URGENCY_OPTIONS  = ['baja', 'media', 'alta'];
const IMPACT_OPTIONS   = ['bajo', 'medio', 'alto'];

const PRIORITY_COLORS: Record<string, string> = {
  baja: '#94a3b8', media: '#3b82f6', alta: '#f59e0b', critica: '#ef4444',
};

const inp: React.CSSProperties = {
  border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px',
  fontSize: 12, fontFamily: 'inherit', background: '#fff', outline: 'none',
};

/* ── Multi-select chip picker (for IN operator) ── */
function MultiChipPicker({
  options, selected, onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(o => {
        const active = selected.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)}
            style={{
              padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 700,
              border: `1px solid ${active ? C.coral : C.border}`,
              background: active ? `${C.coral}18` : '#fff',
              color: active ? C.coral : C.sub,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Smart value picker ── */
function ConditionValuePicker({
  field, operator, value, onChange,
  modCategories, damageTypes, ticketCategories,
}: {
  field:            string;
  operator:         string;
  value:            string;
  onChange:         (v: string) => void;
  modCategories:    ModuleCategory[];
  damageTypes:      DamageType[];
  ticketCategories: TicketCategory[];
}) {
  const isIN = operator === 'IN';

  const enumOpts = (vals: string[]) => vals.map(v => ({ value: v, label: v }));
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const setSelected = (vals: string[]) => onChange(vals.join(','));

  if (field === 'priority') {
    const opts = enumOpts(PRIORITY_OPTIONS);
    if (isIN) return <MultiChipPicker options={opts} selected={selected} onChange={setSelected} />;
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, minWidth: 110 }}>
        <option value="">Seleccionar…</option>
        {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    );
  }

  if (field === 'urgency') {
    const opts = enumOpts(URGENCY_OPTIONS);
    if (isIN) return <MultiChipPicker options={opts} selected={selected} onChange={setSelected} />;
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, minWidth: 110 }}>
        <option value="">Seleccionar…</option>
        {URGENCY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    );
  }

  if (field === 'impact') {
    const opts = enumOpts(IMPACT_OPTIONS);
    if (isIN) return <MultiChipPicker options={opts} selected={selected} onChange={setSelected} />;
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, minWidth: 110 }}>
        <option value="">Seleccionar…</option>
        {IMPACT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    );
  }

  if (field === 'category_id') {
    const opts = modCategories.filter(c => c.is_active).map(c => ({ value: c.id, label: c.name }));
    if (isIN) return <MultiChipPicker options={opts} selected={selected} onChange={setSelected} />;
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, minWidth: 160 }}>
        <option value="">Seleccionar categoría…</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  if (field === 'damage_type_id') {
    const grouped = damageTypes.reduce<Record<string, DamageType[]>>((acc, d) => {
      (acc[d.category_label] ??= []).push(d);
      return acc;
    }, {});
    if (isIN) {
      const opts = damageTypes.map(d => ({ value: d.id, label: `${d.category_label} › ${d.label}` }));
      return <MultiChipPicker options={opts} selected={selected} onChange={setSelected} />;
    }
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, minWidth: 200 }}>
        <option value="">Seleccionar tipo de daño…</option>
        {Object.entries(grouped).map(([cat, items]) => (
          <optgroup key={cat} label={cat}>
            {items.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }

  /* environment_id / fallback: text input */
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field === 'environment_id' ? 'UUID del ambiente' : 'Valor…'}
      style={{ ...inp, minWidth: 160 }}
    />
  );
}

/* ── Condition display helpers ── */
function fieldLabel(field: string, modCategories: ModuleCategory[], damageTypes: DamageType[]) {
  const f = SLA_FIELDS.find(x => x.value === field);
  if (f) return f.label;
  return field;
}

function valueLabel(field: string, value: string, modCategories: ModuleCategory[], damageTypes: DamageType[]) {
  if (field === 'category_id') {
    const names = value.split(',').map(v => modCategories.find(c => c.id === v.trim())?.name ?? v.trim());
    return names.join(', ');
  }
  if (field === 'damage_type_id') {
    const names = value.split(',').map(v => damageTypes.find(d => d.id === v.trim())?.label ?? v.trim());
    return names.join(', ');
  }
  return value;
}

/* ── Condition chip ── */
function ConditionChip({
  cond, onDelete, modCategories, damageTypes,
}: {
  cond:          SlaCondition;
  onDelete:      () => void;
  modCategories: ModuleCategory[];
  damageTypes:   DamageType[];
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 99, background: '#f1f5f9', border: `1px solid ${C.border}`,
      fontSize: 11, fontWeight: 600, color: '#334155',
    }}>
      <span style={{ color: C.sub, fontSize: 10 }}>{fieldLabel(cond.field, modCategories, damageTypes)}</span>
      <span style={{ color: C.muted, fontWeight: 400 }}>{cond.operator}</span>
      <span style={{ color: C.navy, fontWeight: 700 }}>
        {valueLabel(cond.field, cond.value, modCategories, damageTypes)}
      </span>
      <button onClick={onDelete} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#ef4444', padding: '0 1px', lineHeight: 1, fontSize: 14, marginLeft: 2,
      }}>×</button>
    </span>
  );
}

/* ── Grouped conditions display ── */
function ConditionsDisplay({
  conditions, onDeleteCond, modCategories, damageTypes,
}: {
  conditions:    SlaCondition[];
  onDeleteCond:  (c: SlaCondition) => void;
  modCategories: ModuleCategory[];
  damageTypes:   DamageType[];
}) {
  if (conditions.length === 0) {
    return <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>Sin condiciones — regla aplica siempre</span>;
  }

  const sorted = [...conditions].sort((a, b) => a.logical_group - b.logical_group || a.sort_order - b.sort_order);
  const groups = sorted.reduce<Record<number, SlaCondition[]>>((acc, c) => {
    (acc[c.logical_group] ??= []).push(c);
    return acc;
  }, {});
  const groupKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {groupKeys.map((gk, gi) => (
        <div key={gk} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {gi > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 800,
              background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a',
              textTransform: 'uppercase', letterSpacing: '.05em',
            }}>OR</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
            padding: '4px 8px', borderRadius: 8, background: '#f8fafc', border: `1px solid ${C.border}` }}>
            {groups[gk].map((c, ci) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {ci > 0 && (
                  <span style={{
                    padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800,
                    background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                    textTransform: 'uppercase', letterSpacing: '.05em',
                  }}>AND</span>
                )}
                <ConditionChip cond={c} onDelete={() => onDeleteCond(c)} modCategories={modCategories} damageTypes={damageTypes} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Add condition form ── */
function AddConditionForm({
  ruleId, onDone, triggerCritical, modCategories, damageTypes, ticketCategories,
}: {
  ruleId:           string;
  onDone:           () => void;
  triggerCritical:  TriggerFn;
  modCategories:    ModuleCategory[];
  damageTypes:      DamageType[];
  ticketCategories: TicketCategory[];
}) {
  const qc = useQueryClient();
  const [field, setField] = useState('priority');
  const [op,    setOp]    = useState('=');
  const [value, setValue] = useState('');
  const [group, setGroup] = useState(1);

  /* Reset value on field/op change */
  function handleFieldChange(f: string) { setField(f); setValue(''); }
  function handleOpChange(o: string)    { setOp(o);    setValue(''); }

  const mut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.createTicketSlaCondition(ruleId, { field, operator: op, value, logical_group: group }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setValue(''); onDone(); },
  });

  const handleAdd = () => {
    triggerCritical(
      { entityLabel: `Condición SLA — ${fieldLabel(field, modCategories, damageTypes)} ${op} ${valueLabel(field, value, modCategories, damageTypes)}` },
      async (auth) => { await mut.mutateAsync(auth); },
    );
  };

  const canSubmit = value.trim().length > 0;

  return (
    <div style={{ padding: '12px 14px', background: '#fff', borderRadius: 10,
      border: `1.5px dashed ${C.border}`, marginTop: 10 }}>
      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 800, color: C.muted,
        textTransform: 'uppercase', letterSpacing: '.06em' }}>Nueva condición</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }}>
        {/* Field */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>Campo</span>
          <select value={field} onChange={e => handleFieldChange(e.target.value)} style={inp}>
            {SLA_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {/* Operator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>Operador</span>
          <select value={op} onChange={e => handleOpChange(e.target.value)} style={{ ...inp, width: 72 }}>
            {SLA_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Value — smart picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 140 }}>
          <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>Valor</span>
          <ConditionValuePicker
            field={field} operator={op} value={value} onChange={setValue}
            modCategories={modCategories} damageTypes={damageTypes} ticketCategories={ticketCategories}
          />
        </div>

        {/* Logical group */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>
            Grupo <span style={{ color: C.muted, fontWeight: 400 }}>(AND dentro, OR entre)</span>
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3].map(g => (
              <button key={g} type="button" onClick={() => setGroup(g)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${group === g ? C.navy : C.border}`,
                  background: group === g ? C.navy : '#fff',
                  color: group === g ? '#fff' : C.sub,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                {g}
              </button>
            ))}
            <input type="number" min={1} max={10} value={group}
              onChange={e => setGroup(Math.max(1, Math.min(10, Number(e.target.value))))}
              style={{ ...inp, width: 48, textAlign: 'center' as const }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button disabled={!canSubmit || mut.isPending} onClick={handleAdd}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none',
            background: canSubmit ? C.coral : C.border,
            color: canSubmit ? '#fff' : C.muted,
            fontSize: 12, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', opacity: mut.isPending ? 0.6 : 1 }}>
          {mut.isPending ? '…' : '+ Agregar condición'}
        </button>
        <button onClick={onDone}
          style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: '#fff', color: C.sub, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── SLA Rule row ── */
function SlaRuleRow({
  rule, triggerCritical, modCategories, damageTypes, ticketCategories,
}: {
  rule:             TicketSlaRule;
  triggerCritical:  TriggerFn;
  modCategories:    ModuleCategory[];
  damageTypes:      DamageType[];
  ticketCategories: TicketCategory[];
}) {
  const qc = useQueryClient();
  const [expanded,     setExpanded]     = useState(false);
  const [addingCond,   setAddingCond]   = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hours,        setHours]        = useState(rule.hours_to_resolve);
  const prioColor = PRIORITY_COLORS[rule.priority_result] ?? C.sub;

  const deleteRuleMut = useMutation({
    mutationFn: (auth: CriticalAuthData) => systemConfigService.deleteTicketSlaRule(rule.id, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });
  const updateHoursMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.updateTicketSlaRule(rule.id, { hours_to_resolve: hours }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setEditingHours(false); },
  });
  const toggleActiveMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.updateTicketSlaRule(rule.id, { is_active: !rule.is_active }, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });
  const deleteCondMut = useMutation({
    mutationFn: ({ condId, auth }: { condId: string; auth: CriticalAuthData }) =>
      systemConfigService.deleteTicketSlaCondition(condId, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });

  const handleDeleteRule = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerCritical(
      { entityLabel: `Eliminar regla SLA — ${rule.name}`, description: 'Regla quedará desactivada.' },
      async (auth) => { await deleteRuleMut.mutateAsync(auth); },
    );
  };

  const handleToggleActive = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerCritical(
      { entityLabel: `${rule.is_active ? 'Desactivar' : 'Activar'} regla — ${rule.name}` },
      async (auth) => { await toggleActiveMut.mutateAsync(auth); },
    );
  };

  const handleUpdateHours = () => {
    triggerCritical(
      { entityLabel: `Regla SLA — ${rule.name}`, description: `Cambiar a ${hours}h de resolución` },
      async (auth) => { await updateHoursMut.mutateAsync(auth); },
    );
  };

  const handleDeleteCond = (cond: SlaCondition) => {
    triggerCritical(
      { entityLabel: `Condición — ${cond.field} ${cond.operator} ${cond.value}`, description: `Eliminar de "${rule.name}"` },
      async (auth) => { await deleteCondMut.mutateAsync({ condId: cond.id, auth }); },
    );
  };

  return (
    <div style={{
      border: `1px solid ${rule.is_active ? C.border : '#f1d0d0'}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 10,
      opacity: rule.is_active ? 1 : 0.65,
    }}>
      {/* Header */}
      <div onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          background: rule.is_active ? '#fff' : '#fff5f5', cursor: 'pointer', userSelect: 'none' }}>

        {expanded
          ? <ChevronDown  size={13} style={{ color: C.muted, flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: C.muted, flexShrink: 0 }} />}

        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.navy,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rule.name}
        </span>

        {/* Conditions count */}
        <span style={{ fontSize: 10, background: '#f1f5f9', color: C.sub,
          padding: '2px 8px', borderRadius: 99, fontWeight: 600, flexShrink: 0 }}>
          {rule.conditions.length} cond.
        </span>

        {/* Hours */}
        <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, flexShrink: 0 }}>
          {rule.hours_to_resolve}h
        </span>

        {/* Priority badge */}
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
          background: `${prioColor}18`, color: prioColor, border: `1px solid ${prioColor}40`, flexShrink: 0 }}>
          → {rule.priority_result}
        </span>

        {/* Active toggle */}
        <button
          onClick={handleToggleActive}
          disabled={toggleActiveMut.isPending}
          title={rule.is_active ? 'Desactivar regla' : 'Activar regla'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0,
            color: rule.is_active ? '#22c55e' : C.muted }}
        >
          {rule.is_active
            ? <ToggleRight size={18} />
            : <ToggleLeft  size={18} />}
        </button>

        {/* Delete */}
        <button onClick={handleDeleteRule}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 4px', flexShrink: 0 }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '14px 16px', background: C.bg, borderTop: `1px solid ${C.border}` }}>

          {/* Hours editor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>Horas SLA:</span>
            {editingHours ? (
              <>
                <input type="number" min={1} value={hours} onChange={e => setHours(Number(e.target.value))}
                  style={{ ...inp, width: 70 }} />
                <button onClick={handleUpdateHours} disabled={updateHoursMut.isPending}
                  style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: C.navy,
                    color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Check size={11} />
                </button>
                <button onClick={() => { setHours(rule.hours_to_resolve); setEditingHours(false); }}
                  style={{ padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`,
                    background: '#fff', color: C.sub, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <strong style={{ fontSize: 12, color: C.navy }}>{rule.hours_to_resolve}h</strong>
                <button onClick={() => setEditingHours(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '2px 4px' }}>
                  <Pencil size={11} />
                </button>
              </>
            )}
          </div>

          {/* Conditions */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 800, color: C.muted,
              textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Condiciones
            </p>
            <ConditionsDisplay
              conditions={rule.conditions}
              onDeleteCond={handleDeleteCond}
              modCategories={modCategories}
              damageTypes={damageTypes}
            />
          </div>

          {/* Add condition */}
          {addingCond ? (
            <AddConditionForm
              ruleId={rule.id}
              onDone={() => setAddingCond(false)}
              triggerCritical={triggerCritical}
              modCategories={modCategories}
              damageTypes={damageTypes}
              ticketCategories={ticketCategories}
            />
          ) : (
            <button onClick={() => setAddingCond(true)}
              style={{ marginTop: 6, padding: '5px 12px', borderRadius: 8, border: `1px dashed ${C.border}`,
                background: 'transparent', color: C.sub, fontSize: 11, cursor: 'pointer',
                fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Plus size={10} /> Agregar condición
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Add rule form ── */
function AddRuleForm({
  policyId, onDone, triggerCritical, existingCount,
}: {
  policyId:      string;
  onDone:        () => void;
  triggerCritical: TriggerFn;
  existingCount: number;
}) {
  const qc = useQueryClient();
  const [name,  setName]  = useState('');
  const [prio,  setPrio]  = useState('media');
  const [hours, setHours] = useState(24);

  const mut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.createTicketSlaRule(
        policyId,
        { name, priority_result: prio, hours_to_resolve: hours, sort_order: existingCount + 1 },
        auth,
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setName(''); onDone(); },
  });

  const handleCreate = () => {
    triggerCritical(
      { entityLabel: `Nueva regla SLA — ${name}`, description: `Prioridad: ${prio}, ${hours}h` },
      async (auth) => { await mut.mutateAsync(auth); },
    );
  };

  return (
    <div style={{ padding: '14px 16px', background: '#fff', borderRadius: 12,
      border: `1.5px solid ${C.navy}`, marginBottom: 12 }}>
      <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: C.navy }}>Nueva regla SLA</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 160px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: C.sub }}>Nombre *</p>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Ej: Daño crítico de hardware"
            style={{ ...inp, width: '100%', boxSizing: 'border-box' as const }} autoFocus />
        </div>
        <div style={{ flex: '1 1 110px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: C.sub }}>Prioridad resultado</p>
          <select value={prio} onChange={e => setPrio(e.target.value)} style={inp}>
            {PRIORITY_OPTIONS.map(p => (
              <option key={p} value={p} style={{ color: PRIORITY_COLORS[p] }}>{p}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 90px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: C.sub }}>Horas SLA</p>
          <input type="number" min={1} value={hours} onChange={e => setHours(Number(e.target.value))}
            style={{ ...inp, width: '100%', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={!name.trim() || mut.isPending} onClick={handleCreate}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none',
              background: name.trim() ? C.coral : C.border,
              color: name.trim() ? '#fff' : C.muted,
              fontSize: 12, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', opacity: mut.isPending ? 0.6 : 1 }}>
            {mut.isPending ? '…' : 'Crear regla'}
          </button>
          <button onClick={onDone}
            style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${C.border}`,
              background: '#fff', color: C.sub, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main tab ── */
export function SlaTicketsTab({ moduleId }: Props) {
  const [addingRule,   setAddingRule]   = useState(false);
  const [breachResult, setBreachResult] = useState<{ checked: number; breached: number } | null>(null);
  const critical = useCriticalChange();

  const breachCheckMut = useMutation({
    mutationFn: () => ticketsService.triggerBreachCheck(),
    onSuccess:  (res) => setBreachResult(res),
  });

  const { data: policies = [], isLoading: loadingPolicies } = useQuery({
    queryKey: ['ticket-sla-policies', moduleId],
    queryFn:  () => systemConfigService.getTicketSlaPolicies(moduleId),
    staleTime: 30_000,
  });

  const { data: modCategories = [] } = useQuery({
    queryKey: ['module-categories', moduleId],
    queryFn:  () => modulesService.getCategories(moduleId),
    staleTime: 300_000,
  });

  const { data: damageTypes = [] } = useQuery({
    queryKey: ['damage-types-admin'],
    queryFn:  () => systemConfigService.getDamageTypesAdmin(),
    staleTime: 300_000,
  });

  const { data: ticketCategories = [] } = useQuery({
    queryKey: ['ticket-categories'],
    queryFn:  () => systemConfigService.getTicketCategories(),
    staleTime: 300_000,
  });

  const activePolicy = useMemo(
    () => policies.find(p => p.is_active) ?? policies[0] ?? null,
    [policies],
  );

  if (loadingPolicies) return <Spinner />;

  if (!activePolicy) {
    return (
      <div style={{ padding: '16px 20px', borderRadius: 12, background: '#fff5f5',
        border: '1px solid #fecaca', color: '#ef4444', fontSize: 13 }}>
        Sin política SLA activa. Aplica la migración 007 para crear la política por defecto.
      </div>
    );
  }

  const activeRules   = activePolicy.rules.filter(r =>  r.is_active);
  const inactiveRules = activePolicy.rules.filter(r => !r.is_active);

  return (
    <>
      <CriticalChangeModal {...critical} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Policy header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.navy }}>
              {activePolicy.name}{' '}
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>v{activePolicy.version}</span>
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted }}>
              {activePolicy.rules.length} regla(s) · {activeRules.length} activa(s)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {breachResult && (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Revisados: <strong>{breachResult.checked}</strong> · Vencidos: <strong style={{ color: '#ef4444' }}>{breachResult.breached}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={() => breachCheckMut.mutate()}
              disabled={breachCheckMut.isPending}
              style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #fecaca',
                background: '#fff', color: '#ef4444', fontSize: 12, fontWeight: 700,
                cursor: breachCheckMut.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 5,
                opacity: breachCheckMut.isPending ? 0.6 : 1 }}>
              <ShieldAlert size={12} /> {breachCheckMut.isPending ? 'Verificando…' : 'Check SLA'}
            </button>
            {!addingRule && (
              <button onClick={() => setAddingRule(true)}
                style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: C.coral,
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} /> Nueva regla
              </button>
            )}
          </div>
        </div>

        {addingRule && (
          <AddRuleForm
            policyId={activePolicy.id}
            onDone={() => setAddingRule(false)}
            triggerCritical={critical.triggerCritical}
            existingCount={activePolicy.rules.length}
          />
        )}

        {/* Active rules */}
        {activeRules.length === 0 && !addingRule ? (
          <div style={{ padding: 20, borderRadius: 12, background: C.bg,
            border: `1px dashed ${C.border}`, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            Sin reglas activas — todos los tickets usarán las horas por defecto del sistema.
          </div>
        ) : (
          <div>
            {activeRules.map(rule => (
              <SlaRuleRow
                key={rule.id} rule={rule}
                triggerCritical={critical.triggerCritical}
                modCategories={modCategories}
                damageTypes={damageTypes}
                ticketCategories={ticketCategories}
              />
            ))}
          </div>
        )}

        {/* Inactive rules (collapsed section) */}
        {inactiveRules.length > 0 && (
          <details style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px' }}>
            <summary style={{ fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer',
              listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
              <span style={{ fontSize: 10 }}>▶</span>
              Reglas inactivas ({inactiveRules.length})
            </summary>
            <div style={{ marginTop: 10 }}>
              {inactiveRules.map(rule => (
                <SlaRuleRow
                  key={rule.id} rule={rule}
                  triggerCritical={critical.triggerCritical}
                  modCategories={modCategories}
                  damageTypes={damageTypes}
                  ticketCategories={ticketCategories}
                />
              ))}
            </div>
          </details>
        )}

        {/* Legend */}
        <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0f4f8',
          border: `1px solid ${C.border}`, fontSize: 11, color: C.sub, lineHeight: 1.7 }}>
          <strong style={{ color: C.navy }}>Cómo funciona:</strong> Reglas evaluadas en orden. Primera coincidencia define el plazo SLA.<br />
          Condiciones del mismo grupo =
          <span style={{ margin: '0 4px', padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800,
            background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>AND</span>
          · grupos distintos =
          <span style={{ margin: '0 4px', padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 800,
            background: '#fef9c3', color: '#a16207', border: '1px solid #fde68a' }}>OR</span>
          · operator <code>IN</code> acepta múltiples valores.
        </div>

      </div>
    </>
  );
}
