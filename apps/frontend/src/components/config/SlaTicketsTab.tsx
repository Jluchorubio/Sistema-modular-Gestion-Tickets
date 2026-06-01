'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, ChevronRight, ChevronDown } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { TicketSlaRule, SlaCondition } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';
import { useCriticalChange, type CriticalAuthData } from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from './CriticalChangeModal';

interface Props { moduleId: string }
type TriggerFn = ReturnType<typeof useCriticalChange>['triggerCritical'];

const SLA_FIELDS = [
  { value: 'priority',       label: 'Prioridad'       },
  { value: 'urgency',        label: 'Urgencia'        },
  { value: 'impact',         label: 'Impacto'         },
  { value: 'damage_type_id', label: 'Tipo de daño'    },
  { value: 'category_id',    label: 'Categoría'       },
  { value: 'environment_id', label: 'Ambiente'        },
];
const SLA_OPERATORS    = ['=', '!=', 'IN', '>', '<', '>=', '<='];
const PRIORITY_OPTIONS = ['baja', 'media', 'alta', 'critica'];
const URGENCY_OPTIONS  = ['baja', 'media', 'alta'];
const IMPACT_OPTIONS   = ['bajo', 'medio', 'alto'];

function fieldValueHint(field: string) {
  if (field === 'priority') return PRIORITY_OPTIONS.join(' | ');
  if (field === 'urgency')  return URGENCY_OPTIONS.join(' | ');
  if (field === 'impact')   return IMPACT_OPTIONS.join(' | ');
  return 'uuid — o lista separada por coma si operator=IN';
}

const PRIORITY_COLORS: Record<string, string> = {
  baja: '#94a3b8', media: '#3b82f6', alta: '#f59e0b', critica: '#ef4444',
};

const inp: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 2, padding: '5px 9px',
  fontSize: 12, fontFamily: 'inherit', background: '#fff',
};

function ConditionChip({
  cond, onDelete,
}: {
  cond: SlaCondition;
  onDelete: () => void;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
      borderRadius: 2, background: '#f1f5f9', border: '1px solid #e2e8f0',
      fontSize: 11, fontWeight: 600, color: '#334155',
    }}>
      <span style={{ color: '#64748b', fontSize: 10 }}>G{cond.logical_group}</span>
      <span>{cond.field}</span>
      <span style={{ color: '#94a3b8' }}>{cond.operator}</span>
      <span style={{ color: '#0e2235', fontWeight: 700 }}>{cond.value}</span>
      <button onClick={onDelete} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#ef4444', padding: '0 2px', lineHeight: 1, fontSize: 13,
      }}>×</button>
    </span>
  );
}

function AddConditionForm({
  ruleId, onDone, triggerCritical,
}: {
  ruleId:          string;
  onDone:          () => void;
  triggerCritical: TriggerFn;
}) {
  const qc = useQueryClient();
  const [field, setField] = useState('priority');
  const [op,    setOp]    = useState('=');
  const [value, setValue] = useState('');
  const [group, setGroup] = useState(1);

  const mut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.createTicketSlaCondition(ruleId, { field, operator: op, value, logical_group: group }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setValue(''); onDone(); },
  });

  const handleAdd = () => {
    triggerCritical(
      { entityLabel: `Condición SLA — campo "${field}" ${op} ${value}` },
      async (auth) => { await mut.mutateAsync(auth); },
    );
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0', marginTop: 8 }}>
      <select value={field} onChange={e => setField(e.target.value)} style={inp}>
        {SLA_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select value={op} onChange={e => setOp(e.target.value)} style={{ ...inp, width: 60 }}>
        {SLA_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <input value={value} onChange={e => setValue(e.target.value)}
        placeholder={fieldValueHint(field)} style={{ ...inp, minWidth: 140 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Grupo</span>
        <input type="number" min={1} max={10} value={group}
          onChange={e => setGroup(Number(e.target.value))} style={{ ...inp, width: 50 }} />
      </div>
      <button disabled={!value.trim() || mut.isPending} onClick={handleAdd}
        style={{ padding: '5px 12px', borderRadius: 2, border: 'none', background: '#0e2235',
          color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          opacity: !value.trim() || mut.isPending ? 0.6 : 1 }}>
        + Agregar
      </button>
      <button onClick={onDone}
        style={{ padding: '5px 10px', borderRadius: 2, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
        Cancelar
      </button>
    </div>
  );
}

function SlaRuleRow({
  rule, triggerCritical,
}: {
  rule:            TicketSlaRule;
  triggerCritical: TriggerFn;
}) {
  const qc = useQueryClient();
  const [expanded,     setExpanded]     = useState(false);
  const [addingCond,   setAddingCond]   = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hours,        setHours]        = useState(rule.hours_to_resolve);
  const prioColor = PRIORITY_COLORS[rule.priority_result] ?? '#64748b';

  const deleteRuleMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.deleteTicketSlaRule(rule.id, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });
  const updateHoursMut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.updateTicketSlaRule(rule.id, { hours_to_resolve: hours }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setEditingHours(false); },
  });
  const deleteCondMut = useMutation({
    mutationFn: ({ condId, auth }: { condId: string; auth: CriticalAuthData }) =>
      systemConfigService.deleteTicketSlaCondition(condId, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });

  const handleDeleteRule = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerCritical(
      { entityLabel: `Eliminar regla SLA — ${rule.name}`, description: `Esta regla quedará desactivada.` },
      async (auth) => { await deleteRuleMut.mutateAsync(auth); },
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
      { entityLabel: `Condición — ${cond.field} ${cond.operator} ${cond.value}`, description: `Eliminar de la regla "${rule.name}"` },
      async (auth) => { await deleteCondMut.mutateAsync({ condId: cond.id, auth }); },
    );
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      <div onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
          background: '#fff', cursor: 'pointer', userSelect: 'none' }}>
        {expanded
          ? <ChevronDown size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{rule.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 2,
          background: `${prioColor}18`, color: prioColor, border: `1px solid ${prioColor}40` }}>
          → {rule.priority_result}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{rule.hours_to_resolve}h</span>
        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 6 }}>
          {rule.conditions.length} cond.
        </span>
        <button onClick={handleDeleteRule}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 4px' }}>
          <Trash2 size={12} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Horas SLA:</span>
            {editingHours ? (
              <>
                <input type="number" min={1} value={hours} onChange={e => setHours(Number(e.target.value))}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 2, padding: '4px 8px', fontSize: 12, width: 70, fontFamily: 'inherit' }} />
                <button onClick={handleUpdateHours} disabled={updateHoursMut.isPending}
                  style={{ padding: '4px 10px', borderRadius: 2, border: 'none', background: '#0e2235', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Check size={11} />
                </button>
                <button onClick={() => { setHours(rule.hours_to_resolve); setEditingHours(false); }}
                  style={{ padding: '4px 8px', borderRadius: 2, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <strong style={{ fontSize: 12, color: '#0f172a' }}>{rule.hours_to_resolve}h</strong>
                <button onClick={() => setEditingHours(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 4px' }}>
                  <Pencil size={11} />
                </button>
              </>
            )}
          </div>

          <div style={{ marginBottom: 8 }}>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 800, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Condiciones{' '}
              <span style={{ fontWeight: 400, color: '#cbd5e1' }}>(AND dentro del grupo · OR entre grupos)</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rule.conditions.length === 0 ? (
                <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin condiciones — regla aplica siempre</span>
              ) : rule.conditions.map(c => (
                <ConditionChip key={c.id} cond={c} onDelete={() => handleDeleteCond(c)} />
              ))}
            </div>
          </div>

          {addingCond
            ? <AddConditionForm ruleId={rule.id} onDone={() => setAddingCond(false)} triggerCritical={triggerCritical} />
            : (
              <button onClick={() => setAddingCond(true)}
                style={{ padding: '5px 12px', borderRadius: 2, border: '1px dashed #e2e8f0',
                  background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Plus size={10} /> Agregar condición
              </button>
            )
          }
        </div>
      )}
    </div>
  );
}

function AddRuleForm({
  policyId, onDone, triggerCritical,
}: {
  policyId:        string;
  onDone:          () => void;
  triggerCritical: TriggerFn;
}) {
  const qc = useQueryClient();
  const [name,  setName]  = useState('');
  const [prio,  setPrio]  = useState('media');
  const [hours, setHours] = useState(24);

  const mut = useMutation({
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.createTicketSlaRule(policyId, { name, priority_result: prio, hours_to_resolve: hours }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setName(''); onDone(); },
  });

  const handleCreate = () => {
    triggerCritical(
      { entityLabel: `Nueva regla SLA — ${name}`, description: `Prioridad resultado: ${prio}, ${hours}h de resolución` },
      async (auth) => { await mut.mutateAsync(auth); },
    );
  };

  return (
    <div style={{ padding: '14px 16px', background: '#fff', borderRadius: 12,
      border: '1.5px solid #0e2235', marginBottom: 12,
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: '2 1 160px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Nombre *</p>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Ej: Daño crítico de hardware"
          style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ flex: '1 1 100px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Prioridad resultado</p>
        <select value={prio} onChange={e => setPrio(e.target.value)} style={inp}>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ flex: '1 1 80px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Horas SLA</p>
        <input type="number" min={1} value={hours} onChange={e => setHours(Number(e.target.value))}
          style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={!name.trim() || mut.isPending} onClick={handleCreate}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#ff5e3a',
            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            opacity: !name.trim() || mut.isPending ? 0.6 : 1 }}>
          {mut.isPending ? '…' : 'Crear regla'}
        </button>
        <button onClick={onDone}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function SlaTicketsTab({ moduleId }: Props) {
  const [addingRule, setAddingRule] = useState(false);
  const critical = useCriticalChange();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['ticket-sla-policies', moduleId],
    queryFn:  () => systemConfigService.getTicketSlaPolicies(moduleId),
    staleTime: 30_000,
  });

  if (isLoading) return <Spinner />;

  const activePolicy = policies.find(p => p.is_active) ?? policies[0] ?? null;

  return (
    <>
      <CriticalChangeModal {...critical} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!activePolicy ? (
          <div style={{ padding: '16px 20px', borderRadius: 12, background: '#fff5f5',
            border: '1px solid #fecaca', color: '#ef4444', fontSize: 13 }}>
            Sin política SLA activa. Aplica la migración 007 para crear la política por defecto.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0e2235' }}>
                  {activePolicy.name}{' '}
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>v{activePolicy.version}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  {activePolicy.rules.length} regla(s) · AND dentro del grupo / OR entre grupos
                </p>
              </div>
              {!addingRule && (
                <button onClick={() => setAddingRule(true)}
                  style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#ff5e3a',
                    color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={12} /> Nueva regla
                </button>
              )}
            </div>

            {addingRule && (
              <AddRuleForm
                policyId={activePolicy.id}
                onDone={() => setAddingRule(false)}
                triggerCritical={critical.triggerCritical}
              />
            )}

            {activePolicy.rules.length === 0 && !addingRule ? (
              <div style={{ padding: 20, borderRadius: 12, background: '#f8fafc',
                border: '1px dashed #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Sin reglas — todos los tickets usarán las horas por defecto del sistema.
              </div>
            ) : (
              <div>
                {activePolicy.rules.map(rule => (
                  <SlaRuleRow key={rule.id} rule={rule} triggerCritical={critical.triggerCritical} />
                ))}
              </div>
            )}

            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0f4f8',
              border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
              <strong style={{ color: '#0e2235' }}>Cómo funciona:</strong> Las reglas se evalúan en orden.
              La primera que coincida define el plazo SLA.<br />
              Condiciones del mismo grupo = AND · grupos distintos = OR.<br />
              Para múltiples valores usa operator <code>IN</code> con valores separados por coma.
            </div>
          </>
        )}
      </div>
    </>
  );
}
