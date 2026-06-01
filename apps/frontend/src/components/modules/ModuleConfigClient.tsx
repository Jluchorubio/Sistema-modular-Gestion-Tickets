'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { modulesService } from '@/services/modules.service';
import type { ModuleDetail } from '@/types/module.types';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  module: ModuleDetail;
  moduleId: string;
  isSuperadmin: boolean;
  isAdminModulo: boolean;
}

const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

const PRIORITY_COLOR: Record<string, string> = {
  baja: '#15803d', media: '#b45309', alta: '#c2410c', critica: '#991b1b',
};

function RadioOption({
  name, value, checked, onChange, label, desc, disabled,
}: {
  name: string; value: string; checked: boolean;
  onChange: () => void; label: string; desc?: string; disabled?: boolean;
}) {
  return (
    <label style={{
      display: 'flex', gap: 10, cursor: disabled ? 'default' : 'pointer',
      alignItems: 'flex-start', padding: '10px 14px', borderRadius: 2,
      background: checked ? 'rgba(255,94,58,0.05)' : 'transparent',
      border: checked ? '1px solid rgba(255,94,58,0.25)' : '1px solid transparent',
      transition: 'all 0.15s',
    }}>
      <input
        type="radio" name={name} value={value} checked={checked}
        onChange={onChange} disabled={disabled}
        style={{ marginTop: 3, accentColor: '#ff5e3a', cursor: disabled ? 'default' : 'pointer' }}
      />
      <div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#0e2235' }}>{label}</span>
        {desc && (
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, lineHeight: 1.5, margin: '3px 0 0' }}>
            {desc}
          </p>
        )}
      </div>
    </label>
  );
}

export function ModuleConfigClient({ module: mod, moduleId, isSuperadmin, isAdminModulo }: Props) {
  const qc      = useQueryClient();
  const canEdit = isSuperadmin || isAdminModulo;

  const [accessMode, setAccessMode]               = useState<'open' | 'request'>((mod as any).access_mode ?? 'request');
  const [assignmentMode, setAssignmentMode]       = useState<'manual' | 'round_robin' | 'hybrid'>((mod as any).assignment_mode ?? 'manual');
  const [priorityMode, setPriorityMode]           = useState<'auto' | 'manual'>((mod as any).priority_mode ?? 'auto');
  const [priorityEditors, setPriorityEditors]     = useState<'jefe_tecnico' | 'any_tech'>((mod as any).priority_editors ?? 'jefe_tecnico');
  const [periodStart, setPeriodStart]             = useState<string>((mod as any).priority_period_start ?? '');
  const [periodEnd, setPeriodEnd]                 = useState<string>((mod as any).priority_period_end ?? '');
  const [specializationMode, setSpecializationMode] = useState<'general' | 'specialist' | 'hybrid'>((mod as any).specialization_mode ?? 'general');
  const [autoCloseHours, setAutoCloseHours]       = useState<number>((mod as any).auto_close_hours ?? 48);
  const [saved, setSaved]                         = useState(false);

  const [slaEditing, setSlaEditing] = useState<Record<string, { hrs: string; hfr: string }>>({});

  const updateMut = useMutation({
    mutationFn: (dto: Record<string, unknown>) => modulesService.updateModule(moduleId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module', moduleId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const { data: rules, isLoading: slaLoading } = useQuery({
    queryKey: ['module-sla', moduleId],
    queryFn:  () => modulesService.getModuleSlaRules(moduleId),
  });

  const slaSaveMut = useMutation({
    mutationFn: ({ priority, dto }: { priority: string; dto: { hours_to_resolve: number; hours_to_first_response: number } }) =>
      modulesService.upsertModuleSlaRule(moduleId, priority, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-sla', moduleId] }),
  });

  const slaResetMut = useMutation({
    mutationFn: (priority: string) => modulesService.deleteModuleSlaRule(moduleId, priority),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-sla', moduleId] }),
  });

  function saveConfig() {
    updateMut.mutate({
      access_mode:           accessMode,
      assignment_mode:       assignmentMode,
      priority_mode:         priorityMode,
      priority_editors:      priorityMode === 'manual' ? priorityEditors : undefined,
      priority_period_start: priorityMode === 'manual' && periodStart ? periodStart : null,
      priority_period_end:   priorityMode === 'manual' && periodEnd   ? periodEnd   : null,
      specialization_mode:   specializationMode,
      auto_close_hours:      autoCloseHours,
    });
  }

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e9eef4',
    borderRadius: 2,
    padding: '20px 24px',
    marginBottom: 16,
  };

  const sectionHead: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#ff5e3a',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '1px solid #f1f5f9',
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: '#0e2235',
    display: 'block',
    marginBottom: 6,
  };

  const radioGroup: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 6,
  };

  return (
    <div style={{ padding: '20px 0', maxWidth: 740, minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0e2235', marginBottom: 4 }}>
        Configuración del módulo
      </div>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 28, margin: '4px 0 28px' }}>
        Comportamiento operativo de <strong>{mod.name}</strong>.
      </p>

      {/* ── Acceso al módulo ── */}
      <div style={card}>
        <div style={sectionHead}>Acceso al módulo</div>
        <span style={fieldLabel}>Modo de acceso para nuevos usuarios</span>
        <div style={radioGroup}>
          <RadioOption
            name="access" value="request"
            checked={accessMode === 'request'}
            onChange={() => setAccessMode('request')}
            disabled={!canEdit}
            label="Requiere solicitud (recomendado)"
            desc="Los usuarios solicitan acceso y un administrador lo aprueba."
          />
          <RadioOption
            name="access" value="open"
            checked={accessMode === 'open'}
            onChange={() => setAccessMode('open')}
            disabled={!canEdit}
            label="Acceso libre"
            desc="Cualquier usuario de la organización puede entrar sin aprobación previa."
          />
        </div>
      </div>

      {/* ── Asignación de tickets ── */}
      <div style={card}>
        <div style={sectionHead}>Asignación de tickets</div>
        <span style={fieldLabel}>Formato de entrega a técnicos</span>
        <div style={radioGroup}>
          <RadioOption
            name="assignment" value="manual"
            checked={assignmentMode === 'manual'}
            onChange={() => setAssignmentMode('manual')}
            disabled={!canEdit}
            label="Manual"
            desc="El administrador o jefe técnico asigna cada ticket a mano."
          />
          <RadioOption
            name="assignment" value="round_robin"
            checked={assignmentMode === 'round_robin'}
            onChange={() => setAssignmentMode('round_robin')}
            disabled={!canEdit}
            label="Round Robin"
            desc="Distribución rotativa automática entre técnicos disponibles."
          />
          <RadioOption
            name="assignment" value="hybrid"
            checked={assignmentMode === 'hybrid'}
            onChange={() => setAssignmentMode('hybrid')}
            disabled={!canEdit}
            label="Híbrido"
            desc="Round Robin automático con opción de reasignación manual posterior."
          />
        </div>
      </div>

      {/* ── Gestión de prioridad ── */}
      <div style={card}>
        <div style={sectionHead}>Gestión de prioridad</div>
        <span style={fieldLabel}>Modo de asignación de prioridad</span>
        <div style={radioGroup}>
          <RadioOption
            name="priority" value="auto"
            checked={priorityMode === 'auto'}
            onChange={() => setPriorityMode('auto')}
            disabled={!canEdit}
            label="Automática (sistema)"
            desc="El sistema calcula la prioridad según las reglas SLA configuradas."
          />
          <RadioOption
            name="priority" value="manual"
            checked={priorityMode === 'manual'}
            onChange={() => setPriorityMode('manual')}
            disabled={!canEdit}
            label="Manual"
            desc="Los usuarios autorizados definen la prioridad de cada ticket."
          />
        </div>

        {priorityMode === 'manual' && (
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
            <span style={fieldLabel}>¿Quiénes pueden editar la prioridad?</span>
            <div style={radioGroup}>
              <RadioOption
                name="editors" value="jefe_tecnico"
                checked={priorityEditors === 'jefe_tecnico'}
                onChange={() => setPriorityEditors('jefe_tecnico')}
                disabled={!canEdit}
                label="Solo jefe técnico"
                desc="Únicamente el Jefe Técnico puede modificar la prioridad."
              />
              <RadioOption
                name="editors" value="any_tech"
                checked={priorityEditors === 'any_tech'}
                onChange={() => setPriorityEditors('any_tech')}
                disabled={!canEdit}
                label="Cualquier técnico"
                desc="Cualquier técnico asignado al ticket puede modificar la prioridad."
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <span style={fieldLabel}>Período de organización</span>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14, lineHeight: 1.55 }}>
                Los tickets se agrupan por día dentro de este período y se ordenan por prioridad dentro de cada día.
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                    Fecha de inicio
                  </label>
                  <input
                    type="date" value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    disabled={!canEdit}
                    style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 13, color: '#0e2235', fontFamily: 'inherit', background: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>
                    Fecha de cierre
                  </label>
                  <input
                    type="date" value={periodEnd} min={periodStart}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    disabled={!canEdit}
                    style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 13, color: '#0e2235', fontFamily: 'inherit', background: '#fff' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Especialización de técnicos ── */}
      <div style={card}>
        <div style={sectionHead}>Especialización de técnicos</div>
        <span style={fieldLabel}>¿Cómo se asignan los técnicos según su especialidad?</span>
        <div style={radioGroup}>
          <RadioOption
            name="specialization" value="general"
            checked={specializationMode === 'general'}
            onChange={() => setSpecializationMode('general')}
            disabled={!canEdit}
            label="Técnicos generales"
            desc="Cualquier técnico puede atender cualquier tipo de ticket sin filtro por especialidad."
          />
          <RadioOption
            name="specialization" value="specialist"
            checked={specializationMode === 'specialist'}
            onChange={() => setSpecializationMode('specialist')}
            disabled={!canEdit}
            label="Por especialización"
            desc="El sistema solo asigna técnicos que tengan la categoría del ticket entre sus especialidades."
          />
          <RadioOption
            name="specialization" value="hybrid"
            checked={specializationMode === 'hybrid'}
            onChange={() => setSpecializationMode('hybrid')}
            disabled={!canEdit}
            label="Híbrido"
            desc="Se intenta asignar por especialización; si no hay especialista disponible, se usa un técnico general."
          />
        </div>
      </div>

      {/* ── Auto-cierre de tickets ── */}
      <div style={card}>
        <div style={sectionHead}>Auto-cierre de tickets</div>
        <span style={fieldLabel}>Horas de espera antes del cierre automático</span>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14, lineHeight: 1.55 }}>
          Cuando un ticket está en estado <strong>Realizado</strong> y el usuario no responde,
          el sistema lo cierra automáticamente tras este período.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={720}
              value={autoCloseHours}
              disabled={!canEdit}
              onChange={e => setAutoCloseHours(Math.max(1, Math.min(720, +e.target.value)))}
              style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', color: '#0e2235' }}
            />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>horas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[24, 48, 72, 168].map(h => (
              <button key={h} type="button" disabled={!canEdit}
                onClick={() => setAutoCloseHours(h)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                  border: autoCloseHours === h ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                  background: autoCloseHours === h ? 'rgba(255,94,58,.08)' : '#f8fafc',
                  color: autoCloseHours === h ? '#ff5e3a' : '#64748b',
                }}>
                {h === 24 ? '1 día' : h === 48 ? '2 días' : h === 72 ? '3 días' : '1 semana'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Guardar configuración general ── */}
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 20 }}>
          {saved && (
            <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600, alignSelf: 'center' }}>
              Guardado ✓
            </span>
          )}
          <button
            type="button" onClick={saveConfig}
            disabled={updateMut.isPending}
            style={{
              padding: '9px 22px', background: '#ff5e3a', color: '#fff',
              border: 'none', borderRadius: 2, fontSize: 13, fontWeight: 700,
              cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: updateMut.isPending ? 0.7 : 1,
            }}
          >
            {updateMut.isPending ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      )}

      {/* ── Reglas SLA ── */}
      <div style={card}>
        <div style={sectionHead}>Reglas SLA</div>
        {slaLoading ? <Spinner /> : !rules?.length ? (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>No hay reglas SLA configuradas para este módulo.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Prioridad', 'Horas p/ resolver', 'Horas p/ 1ra resp.', 'Fuente', ''].map((h) => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', fontSize: 10.5,
                      fontWeight: 800, color: '#94a3b8', borderBottom: '1px solid #f1f5f9',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const isDirty = rule.priority in slaEditing;
                  const hrs = slaEditing[rule.priority]?.hrs ?? String(rule.hours_to_resolve);
                  const hfr = slaEditing[rule.priority]?.hfr ?? String(rule.hours_to_first_response);
                  return (
                    <tr key={rule.priority} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontWeight: 700, color: PRIORITY_COLOR[rule.priority] }}>
                          {PRIORITY_LABEL[rule.priority] ?? rule.priority}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number" min={1} value={hrs} disabled={!canEdit}
                          onChange={(e) => setSlaEditing((p) => ({
                            ...p,
                            [rule.priority]: { hrs: e.target.value, hfr: p[rule.priority]?.hfr ?? String(rule.hours_to_first_response) },
                          }))}
                          style={{ width: 68, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 13, fontFamily: 'inherit' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number" min={1} value={hfr} disabled={!canEdit}
                          onChange={(e) => setSlaEditing((p) => ({
                            ...p,
                            [rule.priority]: { hrs: p[rule.priority]?.hrs ?? String(rule.hours_to_resolve), hfr: e.target.value },
                          }))}
                          style={{ width: 68, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 13, fontFamily: 'inherit' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {rule.is_override ? (
                          <span style={{ background: '#312e81', color: '#c7d2fe', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Override</span>
                        ) : (
                          <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: '1px solid #e2e8f0' }}>Global</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {isDirty && (
                              <button
                                type="button" disabled={slaSaveMut.isPending}
                                onClick={() => {
                                  const h = parseInt(hrs, 10);
                                  const r = parseInt(hfr, 10);
                                  if (!h || !r || h < 1 || r < 1) return;
                                  slaSaveMut.mutate(
                                    { priority: rule.priority, dto: { hours_to_resolve: h, hours_to_first_response: r } },
                                    { onSuccess: () => setSlaEditing((p) => { const n = { ...p }; delete n[rule.priority]; return n; }) },
                                  );
                                }}
                                style={{ padding: '4px 10px', background: '#ff5e3a', color: '#fff', border: 'none', borderRadius: 2, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                Guardar
                              </button>
                            )}
                            {rule.is_override && (
                              <button
                                type="button" disabled={slaResetMut.isPending}
                                onClick={() => slaResetMut.mutate(rule.priority, {
                                  onSuccess: () => setSlaEditing((p) => { const n = { ...p }; delete n[rule.priority]; return n; }),
                                })}
                                style={{ padding: '4px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 2, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                Restablecer
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
