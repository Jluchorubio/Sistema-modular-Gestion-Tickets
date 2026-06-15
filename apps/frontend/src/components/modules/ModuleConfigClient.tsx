'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesService } from '@/services/modules.service';
import type { ModuleDetail } from '@/types/module.types';
interface Props {
  module: ModuleDetail;
  moduleId: string;
  isSuperadmin: boolean;
  isAdminModulo: boolean;
  isInventory?: boolean;
  isAlwaysOpen?: boolean;
}

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

export function ModuleConfigClient({ module: mod, moduleId, isSuperadmin, isAdminModulo, isInventory = false, isAlwaysOpen = false }: Props) {
  const qc      = useQueryClient();
  const canEdit = isSuperadmin || isAdminModulo;

  const [accessMode, setAccessMode]               = useState<'open' | 'request'>((mod as any).access_mode ?? 'request');
  const [assignmentMode, setAssignmentMode]       = useState<'manual' | 'round_robin' | 'round_robin_skill' | 'skill_only' | 'balanced'>((mod as any).assignment_mode ?? 'manual');
  const [priorityEditors, setPriorityEditors]     = useState<'jefe_tecnico' | 'any_tech'>((mod as any).priority_editors ?? 'jefe_tecnico');
  const [autoCloseHours, setAutoCloseHours]             = useState<number>((mod as any).auto_close_hours ?? 48);
  const [waitingTimeoutHours, setWaitingTimeoutHours]   = useState<number>((mod as any).waiting_timeout_hours ?? 72);
  const [approvalTimeoutHours, setApprovalTimeoutHours] = useState<number>((mod as any).approval_timeout_hours ?? 48);
  const [maxReopenCount, setMaxReopenCount]             = useState<number>((mod as any).max_reopen_count ?? 10);
  const [saved, setSaved]                           = useState(false);

  const updateMut = useMutation({
    mutationFn: (dto: Record<string, unknown>) => modulesService.updateModule(moduleId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module', moduleId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function saveConfig() {
    updateMut.mutate({
      ...(isAlwaysOpen ? {} : { access_mode: accessMode }),
      assignment_mode:       assignmentMode,
      priority_editors:      priorityEditors,
      auto_close_hours:        autoCloseHours,
      waiting_timeout_hours:   waitingTimeoutHours,
      approval_timeout_hours:  approvalTimeoutHours,
      max_reopen_count:        maxReopenCount,
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
        {isAlwaysOpen ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 2, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true">
              <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
            </svg>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0e2235' }}>Acceso libre — permanente</span>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.5, margin: '3px 0 0' }}>
                Este módulo es accesible para todos los usuarios de la organización sin solicitud. No se puede modificar.
              </p>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* ── Asignación de tickets ── */}
      {!isInventory && <div style={card}>
        <div style={sectionHead}>Asignación de tickets</div>
        <span style={fieldLabel}>Formato de entrega a técnicos</span>
        <div style={radioGroup}>
          <RadioOption
            name="assignment" value="manual"
            checked={assignmentMode === 'manual'}
            onChange={() => setAssignmentMode('manual')}
            disabled={!canEdit}
            label="Manual"
            desc="Sin asignación automática. Administrador o jefe técnico asigna cada ticket a mano."
          />
          <RadioOption
            name="assignment" value="round_robin"
            checked={assignmentMode === 'round_robin'}
            onChange={() => setAssignmentMode('round_robin')}
            disabled={!canEdit}
            label="Round Robin"
            desc="Rotación equitativa entre todos los técnicos del módulo. Prioriza al de menor carga y el que lleva más tiempo sin asignación."
          />
          <RadioOption
            name="assignment" value="round_robin_skill"
            checked={assignmentMode === 'round_robin_skill'}
            onChange={() => setAssignmentMode('round_robin_skill')}
            disabled={!canEdit}
            label="Round Robin + Especialización"
            desc="Primero intenta asignar a un técnico especializado en el tipo de daño o categoría. Si no hay especialistas disponibles, aplica Round Robin general."
          />
          <RadioOption
            name="assignment" value="skill_only"
            checked={assignmentMode === 'skill_only'}
            onChange={() => setAssignmentMode('skill_only')}
            disabled={!canEdit}
            label="Solo especialización"
            desc="Asigna únicamente a técnicos con especialización registrada para el tipo de daño o categoría. Sin fallback — el ticket queda sin asignar si no hay especialistas."
          />
          <RadioOption
            name="assignment" value="balanced"
            checked={assignmentMode === 'balanced'}
            onChange={() => setAssignmentMode('balanced')}
            disabled={!canEdit}
            label="Balanceado (score ponderado)"
            desc="Todos los técnicos son elegibles. Los especializados reciben 3× de peso. Se selecciona según carga + especialización combinadas."
          />
        </div>

        {/* Specialization link: visible when mode requires it */}
        {['round_robin_skill', 'skill_only', 'balanced'].includes(assignmentMode) && (
          <div style={{
            marginTop: 14, padding: '10px 14px',
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>
                Especialización de técnicos
              </div>
              <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>
                El modo seleccionado requiere que los técnicos tengan tipos de daño o categorías asignadas.
                Configúralas en la pestaña <strong>Técnicos → Especializaciones</strong>.
              </div>
            </div>
            <a
              href={`/config/modules/${moduleId}/specializations`}
              style={{
                whiteSpace: 'nowrap', fontSize: 11, fontWeight: 700,
                padding: '6px 14px', background: '#1e40af', color: '#fff',
                borderRadius: 6, textDecoration: 'none',
              }}
            >
              Gestionar →
            </a>
          </div>
        )}
      </div>}

      {/* ── Gestión de prioridad ── */}
      {!isInventory && <div style={card}>
        <div style={sectionHead}>Gestión de prioridad</div>
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
      </div>}

      {/* ── Especialización de técnicos (gestionado por modo de asignación) ── */}
      {!isInventory && <div style={{ ...card, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 20, lineHeight: 1 }}>ℹ️</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>
              Especialización de técnicos
            </p>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
              La especialización se controla desde el <strong>Modo de asignación</strong> de arriba.
              Selecciona <em>Skill-based</em> o <em>Híbrido</em> para que el sistema asigne
              técnicos según las categorías configuradas en su perfil.
              Puedes gestionar las habilidades de cada técnico desde
              <strong> Usuarios → perfil del técnico → Habilidades</strong>.
            </p>
          </div>
        </div>
      </div>}

      {/* ── Auto-cierre de tickets ── */}
      {!isInventory && <div style={card}>
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
      </div>}

      {/* ── Timeout por inactividad (Waiting) ── */}
      {!isInventory && <div style={card}>
        <div style={sectionHead}>Escalación por inactividad</div>
        <span style={fieldLabel}>Horas en pausa antes de escalar automáticamente</span>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14, lineHeight: 1.55 }}>
          Si un ticket permanece en estado <strong>En espera</strong> más de este tiempo,
          el sistema notifica al técnico y al jefe técnico. Al doblar el período, escala la prioridad.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={720}
              value={waitingTimeoutHours}
              disabled={!canEdit}
              onChange={e => setWaitingTimeoutHours(Math.max(1, Math.min(720, +e.target.value)))}
              style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', color: '#0e2235' }}
            />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>horas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[24, 48, 72, 168].map(h => (
              <button key={h} type="button" disabled={!canEdit}
                onClick={() => setWaitingTimeoutHours(h)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                  border: waitingTimeoutHours === h ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                  background: waitingTimeoutHours === h ? 'rgba(255,94,58,.08)' : '#f8fafc',
                  color: waitingTimeoutHours === h ? '#ff5e3a' : '#64748b',
                }}>
                {h === 24 ? '1 día' : h === 48 ? '2 días' : h === 72 ? '3 días' : '1 semana'}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
          Fase 1 ({waitingTimeoutHours}h): aviso al técnico y jefe técnico. Fase 2 ({waitingTimeoutHours * 2}h): prioridad escalada automáticamente.
        </p>
      </div>}

      {/* ── Tiempo de expiración de aprobación ── */}
      {!isInventory && <div style={card}>
        <div style={sectionHead}>Expiración de aprobación</div>
        <span style={fieldLabel}>Horas antes de que expire el token de aprobación</span>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14, lineHeight: 1.55 }}>
          Cuando un ticket entra en estado de aprobación, el solicitante recibe un enlace válido por este tiempo.
          Al expirar sin respuesta, el ticket se reabre automáticamente.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={720}
              value={approvalTimeoutHours}
              disabled={!canEdit}
              onChange={e => setApprovalTimeoutHours(Math.max(1, Math.min(720, +e.target.value)))}
              style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', color: '#0e2235' }}
            />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>horas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[24, 48, 72, 168].map(h => (
              <button key={h} type="button" disabled={!canEdit}
                onClick={() => setApprovalTimeoutHours(h)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                  border: approvalTimeoutHours === h ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                  background: approvalTimeoutHours === h ? 'rgba(255,94,58,.08)' : '#f8fafc',
                  color: approvalTimeoutHours === h ? '#ff5e3a' : '#64748b',
                }}>
                {h === 24 ? '1 día' : h === 48 ? '2 días' : h === 72 ? '3 días' : '1 semana'}
              </button>
            ))}
          </div>
        </div>
      </div>}

      {/* ── Límite de reaperturas ── */}
      {!isInventory && <div style={card}>
        <div style={sectionHead}>Límite de reaperturas por aprobación</div>
        <span style={fieldLabel}>Máximo de veces que un ticket puede reabrirse por expiración de aprobación</span>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 14, lineHeight: 1.55 }}>
          Al alcanzar este límite el ticket se escala automáticamente a <strong>Crítica</strong> y se notifica al jefe técnico.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={1} max={100}
              value={maxReopenCount}
              disabled={!canEdit}
              onChange={e => setMaxReopenCount(Math.max(1, Math.min(100, +e.target.value)))}
              style={{ width: 80, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center', color: '#0e2235' }}
            />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>reaperturas</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[3, 5, 10].map(n => (
              <button key={n} type="button" disabled={!canEdit}
                onClick={() => setMaxReopenCount(n)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit',
                  border: maxReopenCount === n ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
                  background: maxReopenCount === n ? 'rgba(255,94,58,.08)' : '#f8fafc',
                  color: maxReopenCount === n ? '#ff5e3a' : '#64748b',
                }}>
                {n === 10 ? 'Sin límite (10)' : `${n} veces`}
              </button>
            ))}
          </div>
        </div>
      </div>}

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

    </div>
  );
}
