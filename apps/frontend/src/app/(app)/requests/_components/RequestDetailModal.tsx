'use client';

import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  X, Play, Loader2, CheckCircle2, TrendingUp, TrendingDown,
  AlertCircle, ShieldCheck, Globe, MapPin, User, Zap, Clock,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { requestsService, type AdmRequest, type RequestStatus } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import {
  REQUEST_TYPE_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_COLORS,
} from '@/constants/requests';
import { fmtDate } from '@/lib/formatters';
import { SlaCountdown } from './SlaCountdown';
import { TimelinePanel } from './TimelinePanel';
import styles from './requestDetail.module.css';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const EXECUTABLE_TYPES = new Set([
  'role_change', 'module_access', 'sede_change', 'info_correction',
  'permission_adjustment', 'reactivation',
]);

const CORRECTABLE_FIELDS = [
  { key: 'first_name',   label: 'Nombre'              },
  { key: 'last_name',    label: 'Apellido'             },
  { key: 'phone',        label: 'Teléfono'             },
  { key: 'job_title',    label: 'Cargo'                },
  { key: 'department',   label: 'Departamento'         },
  { key: 'primary_sede', label: 'Sede'                 },
  { key: 'address',      label: 'Dirección'            },
  { key: 'national_id',  label: 'Cédula / ID Nacional' },
];

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface Props {
  request:          AdmRequest;
  onClose:          () => void;
  onUpdated:        () => void;
  showAdminActions: boolean;
  isSuperadmin:     boolean;
}

/* ── Small helpers ──────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = REQUEST_STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <span
      className={styles.statusPill}
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {REQUEST_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Execution form (embedded) ──────────────────────────────────────────────── */

function ExecForm({
  type,
  requesterId,
  roleChange, setRoleChange,
  moduleAccess, setModuleAccess,
  sede, setSede,
  infoCorrection, setInfoCorrection,
}: {
  type:              string;
  requesterId:       string | null;
  roleChange:        { moduleId: string; roleId: string };
  setRoleChange:     (v: { moduleId: string; roleId: string }) => void;
  moduleAccess:      { moduleId: string; roleId: string };
  setModuleAccess:   (v: { moduleId: string; roleId: string }) => void;
  sede:              string;
  setSede:           (v: string) => void;
  infoCorrection:    { field: string; newValue: string };
  setInfoCorrection: (v: { field: string; newValue: string }) => void;
}) {
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-exec-detail'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 60_000,
  });

  const activeModuleId = type === 'role_change' ? roleChange.moduleId : moduleAccess.moduleId;

  const { data: roles = [] } = useQuery({
    queryKey: ['module-roles-exec-detail', activeModuleId],
    queryFn:  () => modulesService.getModuleRoles(activeModuleId),
    enabled:  !!activeModuleId && (type === 'role_change' || type === 'module_access'),
    staleTime: 60_000,
  });

  if (!requesterId) {
    return (
      <div className={styles.execNote} style={{ color: '#ef4444' }}>
        Sin usuario solicitante vinculado — no se puede ejecutar el cambio.
      </div>
    );
  }

  if (type === 'role_change' || type === 'module_access') {
    const val     = type === 'role_change' ? roleChange     : moduleAccess;
    const setVal  = type === 'role_change' ? setRoleChange  : setModuleAccess;
    const modLabel = type === 'role_change' ? 'Módulo destino' : 'Módulo de acceso';
    return (
      <div className={styles.execFields}>
        <Field label={modLabel}>
          <select
            className={styles.select}
            value={val.moduleId}
            onChange={e => setVal({ moduleId: e.target.value, roleId: '' })}
          >
            <option value="">Seleccionar módulo…</option>
            {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Rol a asignar">
          <select
            className={styles.select}
            value={val.roleId}
            onChange={e => setVal({ ...val, roleId: e.target.value })}
            disabled={!val.moduleId}
          >
            <option value="">Seleccionar rol…</option>
            {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      </div>
    );
  }

  if (type === 'sede_change') {
    return (
      <div className={styles.execFields}>
        <Field label="Nueva sede">
          <input
            type="text"
            className={styles.input}
            placeholder="Ej: Sede Norte, Barranquilla…"
            value={sede}
            onChange={e => setSede(e.target.value)}
          />
        </Field>
      </div>
    );
  }

  if (type === 'info_correction') {
    return (
      <div className={styles.execFields}>
        <Field label="Campo a corregir">
          <select
            className={styles.select}
            value={infoCorrection.field}
            onChange={e => setInfoCorrection({ ...infoCorrection, field: e.target.value })}
          >
            <option value="">Seleccionar campo…</option>
            {CORRECTABLE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Nuevo valor">
          <input
            type="text"
            className={styles.input}
            placeholder="Valor corregido…"
            value={infoCorrection.newValue}
            onChange={e => setInfoCorrection({ ...infoCorrection, newValue: e.target.value })}
            disabled={!infoCorrection.field}
          />
        </Field>
      </div>
    );
  }

  if (type === 'reactivation') {
    return (
      <div className={styles.execNote}>
        La cuenta del usuario será reactivada y podrá iniciar sesión de inmediato.
      </div>
    );
  }

  if (type === 'permission_adjustment') {
    return (
      <div className={styles.execNote}>
        Ajusta los permisos del usuario desde el módulo correspondiente y luego finaliza esta solicitud.
      </div>
    );
  }

  return null;
}

/* ── Main modal ─────────────────────────────────────────────────────────────── */

export function RequestDetailModal({
  request, onClose, onUpdated, showAdminActions, isSuperadmin,
}: Props) {
  const qc = useQueryClient();

  const requesterId = (request as any).requester_id as string | null;
  const isExecutable = EXECUTABLE_TYPES.has(request.type);
  const isActionable = ['taken', 'in_progress'].includes(request.status);
  const canExecute   = showAdminActions && isExecutable && isActionable && !!requesterId;

  /* ── Local state ── */
  const [rejectNotes,    setRejectNotes]    = useState('');
  const [escalateNote,   setEscalateNote]   = useState('');
  const [showTimeline,   setShowTimeline]   = useState(false);
  const [showRejectBox,  setShowRejectBox]  = useState(false);
  const [showEscalateBox,setShowEscalateBox]= useState(false);
  const [execError,      setExecError]      = useState('');

  /* ── Execution form state ── */
  const [roleChange,     setRoleChange]     = useState({ moduleId: '', roleId: '' });
  const [moduleAccess,   setModuleAccess]   = useState({ moduleId: '', roleId: '' });
  const [sede,           setSede]           = useState('');
  const [infoCorrection, setInfoCorrection] = useState({ field: '', newValue: '' });
  const [resolveNotes,   setResolveNotes]   = useState('');

  /* ── Mutations ── */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['requests'] });
    qc.invalidateQueries({ queryKey: ['requests-inbox-dyn'] });
    qc.invalidateQueries({ queryKey: ['requests-mine-dyn'] });
    onUpdated();
  };

  const takeMut = useMutation({
    mutationFn: () => requestsService.take(request.id),
    onSuccess:  invalidate,
  });

  const progressMut = useMutation({
    mutationFn: (status: 'in_progress' | 'completed') =>
      requestsService.updateProgress(request.id, status),
    onSuccess: invalidate,
  });

  const rejectMut = useMutation({
    mutationFn: () => requestsService.review(request.id, 'rejected', rejectNotes || undefined),
    onSuccess:  () => { invalidate(); onClose(); },
  });

  const escalateMut = useMutation({
    mutationFn: () => requestsService.escalate(request.id, escalateNote || undefined),
    onSuccess:  () => { invalidate(); setShowEscalateBox(false); },
  });

  const deescalateMut = useMutation({
    mutationFn: () => requestsService.deescalate(request.id),
    onSuccess:  invalidate,
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      if (!requesterId) throw new Error('Sin usuario vinculado.');

      if (request.type === 'role_change') {
        if (!roleChange.moduleId || !roleChange.roleId) throw new Error('Selecciona módulo y rol.');
        await usersService.assignUserRole(requesterId, roleChange.moduleId, roleChange.roleId);
      } else if (request.type === 'module_access') {
        if (!moduleAccess.moduleId || !moduleAccess.roleId) throw new Error('Selecciona módulo y rol.');
        await usersService.assignUserRole(requesterId, moduleAccess.moduleId, moduleAccess.roleId);
      } else if (request.type === 'sede_change') {
        if (!sede.trim()) throw new Error('Escribe la nueva sede.');
        await usersService.updateUser(requesterId, { primary_sede: sede.trim() });
      } else if (request.type === 'info_correction') {
        if (!infoCorrection.field || !infoCorrection.newValue.trim()) throw new Error('Completa el campo y el valor.');
        await usersService.updateUser(requesterId, { [infoCorrection.field]: infoCorrection.newValue.trim() } as any);
      } else if (request.type === 'reactivation') {
        await usersService.updateUser(requesterId, { is_active: true });
      }

      await requestsService.updateProgress(request.id, 'completed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['requests-inbox-dyn'] });
      qc.invalidateQueries({ queryKey: ['users-list-dyn'] });
      qc.invalidateQueries({ queryKey: ['module-users'] });
      onUpdated();
      onClose();
    },
    onError: (e: any) => setExecError(e?.message ?? 'Error al ejecutar el cambio.'),
  });

  /* ── Helpers ── */
  function execReady(): boolean {
    if (!requesterId) return false;
    if (request.type === 'role_change')     return !!(roleChange.moduleId && roleChange.roleId);
    if (request.type === 'module_access')   return !!(moduleAccess.moduleId && moduleAccess.roleId);
    if (request.type === 'sede_change')     return !!sede.trim();
    if (request.type === 'info_correction') return !!(infoCorrection.field && infoCorrection.newValue.trim());
    if (request.type === 'reactivation')    return true;
    if (request.type === 'permission_adjustment') return true;
    return false;
  }

  const statusColor  = REQUEST_STATUS_COLORS[request.status] ?? '#94a3b8';
  const isEscalated  = request.escalated === true;
  const hasSla       = isActionable && !!request.sla_due_at;
  const canEscalate  = showAdminActions && !isEscalated &&
    ['pending', 'taken', 'in_progress'].includes(request.status);
  const canDeescalate = isSuperadmin && isEscalated;

  const typeIcons: Record<string, React.ReactNode> = {
    role_change:           <ShieldCheck size={13} />,
    module_access:         <Globe size={13} />,
    sede_change:           <MapPin size={13} />,
    info_correction:       <User size={13} />,
    permission_adjustment: <ShieldCheck size={13} />,
    reactivation:          <Zap size={13} />,
  };

  /* ── Render ── */
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* ── Escalated banner ── */}
        {isEscalated && (
          <div className={styles.escalatedBanner}>
            <TrendingUp size={13} />
            ESCALADA{request.escalated_by_name ? ` por ${request.escalated_by_name}` : ''}
            {request.escalation_note && <span className={styles.escalationNote}>· "{request.escalation_note}"</span>}
          </div>
        )}

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.typeBadge}>
              {typeIcons[request.type] ?? null}
              {REQUEST_TYPE_LABELS[request.type] ?? request.type}
            </span>
            <StatusPill status={request.status} />
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
        </div>

        <div className={styles.body}>
          {/* ── Title + meta ── */}
          <h2 className={styles.title}>{request.title}</h2>

          <div className={styles.metaRow}>
            {request.requester_name && (
              <span className={styles.metaChip}>
                <User size={11} />
                {request.requester_name}
              </span>
            )}
            <span className={styles.metaChip}>
              <Clock size={11} />
              {fmtDate(request.created_at)}
            </span>
            <span
              className={styles.priorityChip}
              style={{ color: REQUEST_PRIORITY_COLORS[request.priority], background: `${REQUEST_PRIORITY_COLORS[request.priority]}18` }}
            >
              {REQUEST_PRIORITY_LABELS[request.priority]}
            </span>
            {request.taken_by_name && (
              <span className={styles.metaChip} style={{ color: '#8b5cf6' }}>
                Tomado por {request.taken_by_name}
              </span>
            )}
          </div>

          {hasSla && (
            <div style={{ marginBottom: 10 }}>
              <SlaCountdown sla_due_at={request.sla_due_at!} />
            </div>
          )}

          {/* ── Description ── */}
          <div className={styles.description}>{request.description}</div>

          {request.reviewer_name && (
            <div className={styles.reviewNote}>
              Revisado por <strong>{request.reviewer_name}</strong>
              {request.review_notes && ` · "${request.review_notes}"`}
            </div>
          )}

          {/* ── Admin section ── */}
          {showAdminActions && request.type !== 'task' && (
            <div className={styles.adminSection}>

              {/* Execution form for actionable types */}
              {canExecute && (
                <div className={styles.execSection}>
                  <div className={styles.execTitle}>
                    <Zap size={13} />
                    Ejecutar cambio solicitado
                  </div>
                  <ExecForm
                    type={request.type}
                    requesterId={requesterId}
                    roleChange={roleChange}       setRoleChange={setRoleChange}
                    moduleAccess={moduleAccess}   setModuleAccess={setModuleAccess}
                    sede={sede}                   setSede={setSede}
                    infoCorrection={infoCorrection} setInfoCorrection={setInfoCorrection}
                  />
                  <Field label="Notas de resolución (opcional)">
                    <textarea
                      className={styles.textarea}
                      placeholder="Describe qué cambio se aplicó…"
                      value={resolveNotes}
                      onChange={e => setResolveNotes(e.target.value)}
                      rows={2}
                    />
                  </Field>
                  {execError && <div className={styles.errorBox}>{execError}</div>}
                </div>
              )}

              {/* Reject notes box */}
              {showRejectBox && (
                <div className={styles.rejectBox}>
                  <textarea
                    className={styles.textarea}
                    placeholder="Motivo del rechazo (opcional)…"
                    value={rejectNotes}
                    onChange={e => setRejectNotes(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className={styles.rejectActions}>
                    <button type="button" className={styles.btnGhost} onClick={() => setShowRejectBox(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={rejectMut.isPending}
                      onClick={() => rejectMut.mutate()}
                    >
                      {rejectMut.isPending ? 'Rechazando…' : 'Confirmar rechazo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Escalate notes box */}
              {showEscalateBox && (
                <div className={styles.rejectBox}>
                  <textarea
                    className={styles.textarea}
                    placeholder="Motivo de la escalación (opcional)…"
                    value={escalateNote}
                    onChange={e => setEscalateNote(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                  <div className={styles.rejectActions}>
                    <button type="button" className={styles.btnGhost} onClick={() => setShowEscalateBox(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.btnWarning}
                      disabled={escalateMut.isPending}
                      onClick={() => escalateMut.mutate()}
                    >
                      {escalateMut.isPending ? 'Escalando…' : 'Escalar al superadmin'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Action buttons ── */}
              <div className={styles.actions}>
                {/* Take */}
                {request.status === 'pending' && (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={takeMut.isPending}
                    onClick={() => takeMut.mutate()}
                  >
                    <Play size={12} />
                    {takeMut.isPending ? 'Tomando…' : 'Tomar solicitud'}
                  </button>
                )}

                {/* Mark in progress */}
                {request.status === 'taken' && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={progressMut.isPending}
                    onClick={() => progressMut.mutate('in_progress')}
                  >
                    <Loader2 size={12} />
                    {progressMut.isPending ? 'Actualizando…' : 'Pasar a proceso'}
                  </button>
                )}

                {/* Execute + complete (for actionable types) */}
                {canExecute && (
                  <button
                    type="button"
                    className={styles.btnSuccess}
                    disabled={!execReady() || executeMut.isPending}
                    onClick={() => { setExecError(''); executeMut.mutate(); }}
                  >
                    <Zap size={12} />
                    {executeMut.isPending ? 'Aplicando…' : 'Ejecutar y completar'}
                  </button>
                )}

                {/* Complete without execution (non-actionable or already know it's done) */}
                {isActionable && !canExecute && (
                  <button
                    type="button"
                    className={styles.btnSuccess}
                    disabled={progressMut.isPending}
                    onClick={() => { progressMut.mutate('completed'); onClose(); }}
                  >
                    <CheckCircle2 size={12} />
                    {progressMut.isPending ? 'Finalizando…' : 'Finalizar'}
                  </button>
                )}

                {/* Complete (non-actionable + already handling manually) */}
                {isActionable && canExecute && (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={progressMut.isPending}
                    onClick={() => { progressMut.mutate('completed'); onClose(); }}
                    title="Finalizar sin ejecutar cambio automático"
                  >
                    <CheckCircle2 size={12} />
                    Solo finalizar
                  </button>
                )}

                {/* Reject */}
                {['pending', 'taken', 'in_progress'].includes(request.status) && (
                  <button
                    type="button"
                    className={styles.btnDangerOutline}
                    onClick={() => { setShowRejectBox(v => !v); setShowEscalateBox(false); }}
                  >
                    <X size={12} />
                    Rechazar
                  </button>
                )}

                {/* Escalate */}
                {canEscalate && (
                  <button
                    type="button"
                    className={styles.btnWarningOutline}
                    onClick={() => { setShowEscalateBox(v => !v); setShowRejectBox(false); }}
                  >
                    <TrendingUp size={12} />
                    Escalar
                  </button>
                )}

                {/* De-escalate */}
                {canDeescalate && (
                  <button
                    type="button"
                    className={styles.btnSuccessOutline}
                    disabled={deescalateMut.isPending}
                    onClick={() => deescalateMut.mutate()}
                  >
                    <TrendingDown size={12} />
                    {deescalateMut.isPending ? 'Resolviendo…' : 'Resolver escalación'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          <div className={styles.timelineSection}>
            <button
              type="button"
              className={styles.timelineToggle}
              onClick={() => setShowTimeline(v => !v)}
            >
              {showTimeline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showTimeline ? 'Ocultar historial' : 'Ver historial de cambios'}
            </button>
            {showTimeline && <TimelinePanel requestId={request.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
