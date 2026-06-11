'use client';
import { useState }                                       from 'react';
import { useQuery, useMutation, useQueryClient }          from '@tanstack/react-query';
import { ArrowRight, Pencil, Check, X }                   from 'lucide-react';
import { ticketsService }                                 from '@/services/tickets.service';
import type { TicketTransition, TicketState }             from '@/services/tickets.service';
import { Spinner }                                        from '@/components/ui/Spinner';

interface Props { moduleId: string }

const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

const ROLES = [
  { value: 'admin_modulo', label: 'Admin módulo' },
  { value: 'jefe_tecnico', label: 'Jefe técnico' },
  { value: 'tecnico',      label: 'Técnico'       },
  { value: 'usuario',      label: 'Usuario'       },
];

const VARIANTS = ['primary', 'success', 'danger', 'warning', 'default'] as const;
type Variant = typeof VARIANTS[number];

const VARIANT_COLORS: Record<Variant, { bg: string; text: string; border: string }> = {
  primary: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  success: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  danger:  { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  warning: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  default: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

function StatesPills({ states }: { states: TicketState[] }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 10 }}>
        Estados del flujo
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {states.map(s => (
          <span
            key={s.id}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 500,
              background: s.is_initial   ? '#ecfdf5' :
                          s.is_final     ? '#fff1f2' :
                          s.is_pause_state ? '#fffbeb' : '#f1f5f9',
              color:      s.is_initial   ? '#065f46' :
                          s.is_final     ? '#9f1239' :
                          s.is_pause_state ? '#92400e' : '#475569',
              border: `1px solid ${
                          s.is_initial   ? '#a7f3d0' :
                          s.is_final     ? '#fecdd3' :
                          s.is_pause_state ? '#fde68a' : '#e2e8f0'}`,
            }}
          >
            {s.label}
            {s.is_initial    ? ' · inicial'   : ''}
            {s.is_final      ? ' · final'     : ''}
            {s.is_pause_state ? ' · pausa'    : ''}
            {s.is_approval_state ? ' · aprobación' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

interface EditState {
  name:          string;
  variant:       Variant;
  allowed_roles: string[];
}

function TransitionRow({
  tr,
  statesMap,
  moduleId,
}: {
  tr: TicketTransition;
  statesMap: Map<string, TicketState>;
  moduleId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<EditState>({
    name:          tr.name,
    variant:       tr.variant as Variant,
    allowed_roles: tr.allowed_roles ?? [],
  });

  const mut = useMutation({
    mutationFn: () => ticketsService.updateTransition(tr.id, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', moduleId] });
      setEditing(false);
    },
  });

  const fromState = statesMap.get(tr.from_state_id);
  const toState   = statesMap.get(tr.to_state_id);
  const vc        = VARIANT_COLORS[draft.variant] ?? VARIANT_COLORS.default;

  const toggleRole = (role: string) =>
    setDraft(d => ({
      ...d,
      allowed_roles: d.allowed_roles.includes(role)
        ? d.allowed_roles.filter(r => r !== role)
        : [...d.allowed_roles, role],
    }));

  return (
    <div
      style={{
        border: `1px solid ${editing ? C.coral : C.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        background: '#fff',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editing ? 14 : 0 }}>
        {/* From → To */}
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>
          {fromState?.label ?? tr.from_state_id}
        </span>
        <ArrowRight size={13} color={C.muted} />
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>
          {toState?.label ?? tr.to_label}
        </span>

        <div style={{ flex: 1 }} />

        {/* Variant badge */}
        {!editing && (
          <span style={{
            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
            background: VARIANT_COLORS[tr.variant as Variant]?.bg ?? VARIANT_COLORS.default.bg,
            color:      VARIANT_COLORS[tr.variant as Variant]?.text ?? VARIANT_COLORS.default.text,
            border:     `1px solid ${VARIANT_COLORS[tr.variant as Variant]?.border ?? VARIANT_COLORS.default.border}`,
          }}>
            {tr.variant}
          </span>
        )}

        {/* Edit / Save / Cancel */}
        {!editing ? (
          <button
            type="button"
            onClick={() => { setDraft({ name: tr.name, variant: tr.variant as Variant, allowed_roles: tr.allowed_roles ?? [] }); setEditing(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4 }}
          >
            <Pencil size={14} />
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              style={{
                background: C.coral, border: 'none', borderRadius: 6, padding: '4px 10px',
                color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Check size={13} /> Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '4px 10px',
                fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <X size={13} /> Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Transition name (read) */}
      {!editing && (
        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, marginTop: 4 }}>
          {tr.name}
        </div>
      )}

      {/* Roles (read) */}
      {!editing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {(tr.allowed_roles ?? []).length === 0
            ? <span style={{ fontSize: 11, color: C.muted }}>Sin roles asignados</span>
            : (tr.allowed_roles ?? []).map(r => (
              <span key={r} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                {ROLES.find(x => x.value === r)?.label ?? r}
              </span>
            ))
          }
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <label style={{ fontSize: 12, fontWeight: 600, color: C.navy, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Nombre
            <input
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              style={{
                border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px',
                fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </label>

          {/* Variant */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Variante</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {VARIANTS.map(v => {
                const active = draft.variant === v;
                const colors = VARIANT_COLORS[v];
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, variant: v }))}
                    style={{
                      padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.1s',
                      background: active ? colors.bg   : '#f1f5f9',
                      color:      active ? colors.text : C.sub,
                      border:     `2px solid ${active ? colors.border : 'transparent'}`,
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Roles */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 6 }}>Roles permitidos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ROLES.map(role => {
                const checked = draft.allowed_roles.includes(role.value);
                return (
                  <label key={role.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRole(role.value)}
                      style={{ accentColor: C.coral, width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 13, color: C.navy }}>{role.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {mut.isError && (
            <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>Error al guardar. Intenta de nuevo.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkflowTab({ moduleId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflow', moduleId],
    queryFn:  () => ticketsService.getWorkflow(moduleId),
    enabled:  !!moduleId,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return (
    <p style={{ color: '#dc2626', fontSize: 13 }}>Error al cargar el flujo de trabajo.</p>
  );

  const statesMap = new Map(data.states.map(s => [s.id, s]));

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: 0 }}>
          Flujo de trabajo
        </h2>
        <p style={{ fontSize: 13, color: C.sub, margin: '4px 0 0' }}>
          Versión {data.workflow.version}
          {data.workflow.description ? ` · ${data.workflow.description}` : ''}
        </p>
      </div>

      <StatesPills states={data.states} />

      <h3 style={{ fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 10 }}>
        Transiciones ({data.transitions.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.transitions.map(tr => (
          <TransitionRow key={tr.id} tr={tr} statesMap={statesMap} moduleId={moduleId} />
        ))}
      </div>
    </div>
  );
}
