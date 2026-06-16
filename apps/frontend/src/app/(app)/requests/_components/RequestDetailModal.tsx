'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  X, Play, Loader2, CheckCircle2, TrendingUp, TrendingDown,
  AlertCircle, ShieldCheck, Globe, MapPin, User, Zap, Clock,
  ChevronDown, ChevronUp, ExternalLink, Info, Eye, Undo2,
} from 'lucide-react';
import { requestsService, type AdmRequest, type RequestStatus } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import { usePermission } from '@/hooks/usePermission';
import { useAuthStore } from '@/stores/auth.store';
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
  'role_change', 'module_access', 'permission_adjustment',
  'reactivation', 'access_revocation', 'user_transfer',
]);

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface Props {
  request:          AdmRequest;
  onClose:          () => void;
  onUpdated:        () => void;
  showAdminActions: boolean;
  isSuperadmin:     boolean;
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

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

/* ── Execution form ─────────────────────────────────────────────────────────── */

interface ExecFormProps {
  request:         AdmRequest;
  requesterId:     string | null;
  roleChange:      { moduleId: string; roleId: string };
  setRoleChange:   (v: { moduleId: string; roleId: string }) => void;
  moduleAccess:    { moduleId: string; roleId: string };
  setModuleAccess: (v: { moduleId: string; roleId: string }) => void;
  targetDept:      string;
  setTargetDept:   (v: string) => void;
}

function ExecForm({
  request, requesterId,
  roleChange, setRoleChange,
  moduleAccess, setModuleAccess,
  targetDept, setTargetDept,
}: ExecFormProps) {
  const type = request.type;

  /* ── Load all modules for pickers ── */
  const { data: modules = [], isLoading: loadingModules } = useQuery({
    queryKey: ['modules-exec-detail'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 60_000,
    enabled:   type === 'role_change' || type === 'module_access',
  });

  /* ── Load roles for whichever module is selected ── */
  const activeModuleId = type === 'role_change' ? roleChange.moduleId : moduleAccess.moduleId;
  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['module-roles-exec', activeModuleId],
    queryFn:  () => modulesService.getModuleRoles(activeModuleId),
    enabled:  !!activeModuleId && (type === 'role_change' || type === 'module_access'),
    staleTime: 30_000,
  });

  /* ── Find module name for display ── */
  const activeModule = useMemo(
    () => modules.find(m => m.id === activeModuleId),
    [modules, activeModuleId]
  );

  /* ── Metadata hints ── */
  const meta         = request.metadata ?? {};
  const metaModuleId = meta.module_id as string | undefined;

  if (!requesterId) {
    return (
      <div className={styles.execNote} style={{ color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10 }}>
        Sin usuario solicitante vinculado — no se puede ejecutar automáticamente.
      </div>
    );
  }

  /* ── role_change / module_access ── */
  if (type === 'role_change' || type === 'module_access') {
    const val    = type === 'role_change' ? roleChange    : moduleAccess;
    const setVal = type === 'role_change' ? setRoleChange : setModuleAccess;
    const modLocked = !!metaModuleId; // module was set when request was created

    return (
      <div className={styles.execFields}>
        {/* Module picker — read-only if metadata has it */}
        <Field label={type === 'role_change' ? 'Módulo destino' : 'Módulo de acceso'}>
          {modLocked ? (
            activeModule ? (
              <div className={styles.lockedField}>
                <Globe size={13} />
                <span>{activeModule.name}</span>
                <span className={styles.lockedNote}>— solicitado por el usuario</span>
              </div>
            ) : (
              <div className={styles.selectPlaceholder}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cargando módulo…
              </div>
            )
          ) : (
            <select
              className={styles.select}
              value={val.moduleId}
              onChange={e => setVal({ moduleId: e.target.value, roleId: '' })}
              disabled={loadingModules}
            >
              <option value="">{loadingModules ? 'Cargando módulos…' : 'Seleccionar módulo…'}</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
        </Field>

        {/* Roles for selected module */}
        <Field label="Rol a asignar">
          {!val.moduleId ? (
            <div className={styles.selectPlaceholder}>Selecciona un módulo primero</div>
          ) : loadingRoles ? (
            <div className={styles.selectPlaceholder}><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Cargando roles…</div>
          ) : roles.length === 0 ? (
            <div className={styles.selectPlaceholder} style={{ color: '#ef4444' }}>Este módulo no tiene roles definidos</div>
          ) : (
            <select
              className={styles.select}
              value={val.roleId}
              onChange={e => setVal({ ...val, roleId: e.target.value })}
            >
              <option value="">Seleccionar rol…</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
        </Field>
      </div>
    );
  }

  /* ── reactivation ── */
  if (type === 'reactivation') {
    return (
      <div className={styles.execNote}>
        La cuenta de <strong>{request.requester_name ?? 'este usuario'}</strong> será reactivada y podrá iniciar sesión de inmediato.
      </div>
    );
  }

  /* ── permission_adjustment ── */
  if (type === 'permission_adjustment') {
    return (
      <div className={styles.execNote}>
        Revisa la descripción del usuario y ajusta sus permisos manualmente desde el módulo correspondiente.
        Luego finaliza esta solicitud.
      </div>
    );
  }

  /* ── access_revocation ── */
  if (type === 'access_revocation') {
    const metaModule = meta.module_id as string | undefined;
    return (
      <div className={styles.execNote}>
        {metaModule ? (
          <>Se revocará el acceso de <strong>{request.requester_name ?? 'este usuario'}</strong> al módulo solicitado. Esta acción no puede deshacerse desde aquí.</>
        ) : (
          <span style={{ color: '#dc2626' }}>La solicitud no especifica el módulo a revocar. Completa manualmente y finaliza.</span>
        )}
      </div>
    );
  }

  /* ── user_transfer ── */
  if (type === 'user_transfer') {
    return (
      <div>
        <div className={styles.execNote} style={{ marginBottom: 10 }}>
          Se actualizará el departamento del usuario en su perfil. Especifica el destino del traslado.
        </div>
        <Field label="Departamento / área de destino *">
          <input
            className={styles.input}
            type="text"
            placeholder="Ej: Recursos Humanos, TI, Logística…"
            value={targetDept}
            onChange={e => setTargetDept(e.target.value)}
          />
        </Field>
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

  const permTake     = usePermission('gestion:requests:take');
  const permProgress = usePermission('gestion:requests:progress');
  const permApprove  = usePermission('gestion:requests:approve');
  const permEscalate = usePermission('gestion:requests:escalate');

  const currentUser  = useAuthStore((s) => s.user);
  const requesterId  = (request as any).requester_id as string | null;
  const isOwnRequest = !!currentUser?.id && currentUser.id === requesterId;
  const meta         = request.metadata ?? {};
  const metaModuleId = (meta.module_id ?? '') as string;
  const metaRoleId   = (meta.role_id   ?? '') as string;

  const isExecutable = EXECUTABLE_TYPES.has(request.type);
  const isActionable = ['taken', 'in_progress'].includes(request.status);
  const canExecute   = showAdminActions && isExecutable && isActionable && !!requesterId;

  /* ── Local state — pre-populated from metadata ── */
  const [rejectNotes,     setRejectNotes]     = useState('');
  const [escalateNote,    setEscalateNote]    = useState('');
  const [showTimeline,    setShowTimeline]    = useState(false);
  const [showRejectBox,   setShowRejectBox]   = useState(false);
  const [showEscalateBox, setShowEscalateBox] = useState(false);
  const [execError,       setExecError]       = useState('');
  const [resolveNotes,    setResolveNotes]    = useState('');

  const [roleChange,    setRoleChange]    = useState({ moduleId: metaModuleId, roleId: metaRoleId });
  const [moduleAccess,  setModuleAccess]  = useState({ moduleId: metaModuleId, roleId: metaRoleId });
  const [targetDept,    setTargetDept]    = useState((meta.target_department ?? '') as string);

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

  const untakeMut = useMutation({
    mutationFn: () => requestsService.untake(request.id),
    onSuccess:  invalidate,
  });

  const progressMut = useMutation({
    mutationFn: ({ status, notes }: { status: 'in_progress' | 'completed'; notes?: string }) =>
      requestsService.updateProgress(request.id, status, notes),
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

  const underReviewMut = useMutation({
    mutationFn: () => requestsService.review(request.id, 'under_review'),
    onSuccess:  invalidate,
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      if (!requesterId) throw new Error('Sin usuario vinculado.');

      switch (request.type) {
        case 'role_change':
          if (!roleChange.moduleId || !roleChange.roleId)
            throw new Error('Selecciona el módulo y el rol.');
          await usersService.assignUserRole(requesterId, roleChange.moduleId, roleChange.roleId);
          break;

        case 'module_access':
          if (!moduleAccess.moduleId || !moduleAccess.roleId)
            throw new Error('Selecciona el módulo y el rol de acceso.');
          await usersService.assignUserRole(requesterId, moduleAccess.moduleId, moduleAccess.roleId);
          break;

        case 'reactivation':
          await usersService.updateUser(requesterId, { is_active: true });
          break;

        case 'access_revocation': {
          const meta       = request.metadata ?? {};
          const moduleId   = meta.module_id as string | undefined;
          if (!moduleId) throw new Error('La solicitud no especifica el módulo a revocar.');
          const userRoles  = await usersService.getUserRoles(requesterId);
          const targetRole = userRoles.find((r: any) => r.module_id === moduleId && r.status === 'active');
          if (!targetRole) throw new Error('El usuario no tiene acceso activo al módulo indicado.');
          await usersService.removeRole(requesterId, targetRole.umr_id);
          break;
        }

        case 'user_transfer': {
          const dept = targetDept.trim();
          if (!dept) throw new Error('Ingresa el departamento/área de destino del traslado.');
          await usersService.updateUser(requesterId, { department: dept });
          break;
        }
      }

      await requestsService.updateProgress(request.id, 'completed', resolveNotes || undefined);
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

  /* ── execReady ── */
  function execReady(): boolean {
    if (!requesterId) return false;
    switch (request.type) {
      case 'role_change':           return !!(roleChange.moduleId && roleChange.roleId);
      case 'module_access':         return !!(moduleAccess.moduleId && moduleAccess.roleId);
      case 'reactivation':          return true;
      case 'permission_adjustment': return true;
      case 'access_revocation':     return true;
      case 'user_transfer':         return !!targetDept.trim();
      default:                      return false;
    }
  }

  /* ── Derived ── */
  const statusColor   = REQUEST_STATUS_COLORS[request.status] ?? '#94a3b8';
  const isEscalated   = request.escalated === true;
  const canUntake     = request.status === 'taken' && permTake &&
    (isSuperadmin || currentUser?.id === request.taken_by);
  const hasSla        = isActionable && !!request.sla_due_at;
  const canEscalate   = showAdminActions && !isSuperadmin && !isEscalated && ['pending', 'taken', 'in_progress'].includes(request.status);
  const canDeescalate = isSuperadmin && isEscalated;

  const typeIcons: Record<string, React.ReactNode> = {
    role_change:            <ShieldCheck size={12} />,
    module_access:          <Globe size={12} />,
    permission_adjustment:  <ShieldCheck size={12} />,
    reactivation:           <Zap size={12} />,
    access_revocation:      <MapPin size={12} />,
    user_transfer:          <User size={12} />,
  };

  /* ── Render ── */
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Escalated banner */}
        {isEscalated && (
          <div className={styles.escalatedBanner}>
            <TrendingUp size={12} />
            ESCALADA{request.escalated_by_name ? ` por ${request.escalated_by_name}` : ''}
            {request.escalation_note && (
              <span className={styles.escalationNote}>· "{request.escalation_note}"</span>
            )}
          </div>
        )}

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.typeBadge}>
              {typeIcons[request.type]}
              {REQUEST_TYPE_LABELS[request.type] ?? request.type}
            </span>
            <StatusPill status={request.status} />
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Title */}
          <h2 className={styles.title}>{request.title}</h2>

          {/* Meta */}
          <div className={styles.metaRow}>
            {request.requester_name && (
              <span className={styles.metaChip}><User size={11} />{request.requester_name}</span>
            )}
            <span className={styles.metaChip}>
              <Clock size={11} />{fmtDate(request.created_at)}
            </span>
            <span
              className={styles.priorityChip}
              style={{
                color: REQUEST_PRIORITY_COLORS[request.priority],
                background: `${REQUEST_PRIORITY_COLORS[request.priority]}18`,
              }}
            >
              {REQUEST_PRIORITY_LABELS[request.priority]}
            </span>
            {request.taken_by_name && (
              <span className={styles.metaChip} style={{ color: '#8b5cf6' }}>
                Asignado a {request.taken_by_name}
              </span>
            )}
          </div>

          {hasSla && (
            <div><SlaCountdown sla_due_at={request.sla_due_at!} created_at={request.created_at} /></div>
          )}

          {/* Description */}
          <div className={styles.description}>{request.description}</div>

          {request.reviewer_name && (
            <div className={styles.reviewNote}>
              Revisado por <strong>{request.reviewer_name}</strong>
              {request.review_notes && ` · "${request.review_notes}"`}
            </div>
          )}

          {/* Admin section */}
          {showAdminActions && request.type !== 'task' && (
            <div className={styles.adminSection}>

              {/* Execution section */}
              {canExecute && (
                <div className={styles.execSection}>
                  <div className={styles.execTitle}>
                    <Zap size={12} />
                    Ejecutar cambio solicitado
                  </div>

                  <ExecForm
                    request={request}
                    requesterId={requesterId}
                    roleChange={roleChange}      setRoleChange={setRoleChange}
                    moduleAccess={moduleAccess}  setModuleAccess={setModuleAccess}
                    targetDept={targetDept}      setTargetDept={setTargetDept}
                  />

                  <Field label="Notas de resolución (opcional)">
                    <textarea
                      className={styles.textarea}
                      placeholder="Qué cambio se aplicó, observaciones…"
                      value={resolveNotes}
                      onChange={e => setResolveNotes(e.target.value)}
                      rows={2}
                    />
                  </Field>

                  {execError && <div className={styles.errorBox}>{execError}</div>}
                </div>
              )}

              {/* No requester_id + executable type → info box */}
              {showAdminActions && isExecutable && isActionable && !requesterId && (
                <div className={styles.execSection} style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
                  <div className={styles.execTitle} style={{ color: '#c2410c' }}>
                    <Info size={12} />
                    Ejecución manual requerida
                  </div>
                  <div className={styles.execNote}>
                    Esta solicitud no tiene usuario vinculado. Aplica el cambio manualmente y luego finaliza la solicitud con el botón "Finalizar".
                  </div>
                </div>
              )}

              {/* Reject box */}
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

              {/* Escalate box */}
              {showEscalateBox && (
                <div className={styles.rejectBox} style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
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

              {/* Action buttons */}
              <div className={styles.actions}>
                {/* Take */}
                {request.status === 'pending' && permTake && (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={takeMut.isPending}
                    onClick={() => takeMut.mutate()}
                  >
                    <Play size={11} />
                    {takeMut.isPending ? 'Tomando…' : 'Tomar'}
                  </button>
                )}

                {/* En revisión — pending */}
                {request.status === 'pending' && permApprove && (
                  <button
                    type="button"
                    style={{ background: '#0c4a6e', color: '#7dd3fc', border: '1px solid #0369a1' }}
                    className={styles.btnSecondary}
                    disabled={underReviewMut.isPending}
                    onClick={() => underReviewMut.mutate()}
                  >
                    <Eye size={11} />
                    {underReviewMut.isPending ? '…' : 'En revisión'}
                  </button>
                )}

                {/* Liberar — devuelve a pendiente */}
                {canUntake && (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={untakeMut.isPending}
                    onClick={() => untakeMut.mutate()}
                    title="Liberar solicitud — vuelve a estado pendiente"
                  >
                    <Undo2 size={11} />
                    {untakeMut.isPending ? '…' : 'Liberar'}
                  </button>
                )}

                {/* In progress */}
                {request.status === 'taken' && permProgress && (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={progressMut.isPending}
                    onClick={() => progressMut.mutate({ status: 'in_progress' })}
                  >
                    <Loader2 size={11} />
                    {progressMut.isPending ? '…' : 'Iniciar'}
                  </button>
                )}

                {/* En revisión — taken */}
                {request.status === 'taken' && permApprove && (
                  <button
                    type="button"
                    style={{ background: '#0c4a6e', color: '#7dd3fc', border: '1px solid #0369a1' }}
                    className={styles.btnSecondary}
                    disabled={underReviewMut.isPending}
                    onClick={() => underReviewMut.mutate()}
                  >
                    <Eye size={11} />
                    {underReviewMut.isPending ? '…' : 'En revisión'}
                  </button>
                )}

                {/* Execute + complete */}
                {canExecute && permProgress && (
                  <button
                    type="button"
                    className={styles.btnSuccess}
                    disabled={!execReady() || executeMut.isPending}
                    onClick={() => { setExecError(''); executeMut.mutate(); }}
                  >
                    <Zap size={11} />
                    {executeMut.isPending ? 'Aplicando…' : 'Ejecutar y resolver'}
                  </button>
                )}

                {/* Complete without auto-exec */}
                {(isActionable || request.status === 'under_review') && permProgress && (
                  <button
                    type="button"
                    className={canExecute ? styles.btnGhost : styles.btnSuccess}
                    disabled={progressMut.isPending}
                    onClick={() => { progressMut.mutate({ status: 'completed', notes: resolveNotes || undefined }); onClose(); }}
                    title={canExecute ? 'Finalizar sin aplicar cambio automático' : undefined}
                  >
                    <CheckCircle2 size={11} />
                    {progressMut.isPending ? '…' : canExecute ? 'Solo resolver' : 'Resolver'}
                  </button>
                )}

                {/* Reject */}
                {['pending', 'taken', 'in_progress', 'under_review'].includes(request.status) && permApprove && !isOwnRequest && (
                  <button
                    type="button"
                    className={styles.btnDangerOutline}
                    onClick={() => { setShowRejectBox(v => !v); setShowEscalateBox(false); }}
                  >
                    <X size={11} />
                    Rechazar
                  </button>
                )}

                {/* Escalate */}
                {canEscalate && permEscalate && (
                  <button
                    type="button"
                    className={styles.btnWarningOutline}
                    onClick={() => { setShowEscalateBox(v => !v); setShowRejectBox(false); }}
                  >
                    <TrendingUp size={11} />
                    Escalar
                  </button>
                )}

                {/* De-escalate — superadmin only, always has * */}
                {canDeescalate && (
                  <button
                    type="button"
                    className={styles.btnSuccessOutline}
                    disabled={deescalateMut.isPending}
                    onClick={() => deescalateMut.mutate()}
                  >
                    <TrendingDown size={11} />
                    {deescalateMut.isPending ? '…' : 'Resolver escalación'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className={styles.timelineSection}>
            <button
              type="button"
              className={styles.timelineToggle}
              onClick={() => setShowTimeline(v => !v)}
            >
              {showTimeline ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showTimeline ? 'Ocultar historial' : 'Ver historial de cambios'}
            </button>
            {showTimeline && <TimelinePanel requestId={request.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}
