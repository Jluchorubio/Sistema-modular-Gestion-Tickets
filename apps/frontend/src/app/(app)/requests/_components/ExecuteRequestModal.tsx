'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ShieldCheck, Globe, MapPin, User, Zap } from 'lucide-react'; // MapPin/User used in typeIcon
import { type AdmRequest } from '@/services/requests.service';
import { usersService } from '@/services/users.service';
import { modulesService } from '@/services/modules.service';
import { requestsService } from '@/services/requests.service';
import styles from './executeRequest.module.css';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface Props {
  request: AdmRequest;
  onClose: () => void;
}

const ACTIONABLE_TYPES = new Set([
  'role_change', 'module_access', 'permission_adjustment', 'reactivation',
  'access_revocation', 'user_transfer',
]);

export function canExecuteRequest(req: AdmRequest): boolean {
  return ACTIONABLE_TYPES.has(req.type) && ['taken', 'in_progress'].includes(req.status);
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  );
}

/* ── Sub-forms per type ─────────────────────────────────────────────────────── */

function RoleChangeForm({
  requesterId,
  value,
  onChange,
}: {
  requesterId: string | null;
  value: { moduleId: string; roleId: string };
  onChange: (v: { moduleId: string; roleId: string }) => void;
}) {
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-list-exec'],
    queryFn:  () => modulesService.getModules(),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['module-roles-exec', value.moduleId],
    queryFn:  () => modulesService.getModuleRoles(value.moduleId),
    enabled:  !!value.moduleId,
  });

  return (
    <>
      <Field label="Módulo">
        <select
          className={styles.select}
          value={value.moduleId}
          onChange={e => onChange({ moduleId: e.target.value, roleId: '' })}
        >
          <option value="">Seleccionar módulo…</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Nuevo rol">
        <select
          className={styles.select}
          value={value.roleId}
          onChange={e => onChange({ ...value, roleId: e.target.value })}
          disabled={!value.moduleId}
        >
          <option value="">Seleccionar rol…</option>
          {roles.map((r: any) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
    </>
  );
}

function ModuleAccessForm({
  value,
  onChange,
}: {
  value: { moduleId: string; roleId: string };
  onChange: (v: { moduleId: string; roleId: string }) => void;
}) {
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-list-exec'],
    queryFn:  () => modulesService.getModules(),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['module-roles-exec', value.moduleId],
    queryFn:  () => modulesService.getModuleRoles(value.moduleId),
    enabled:  !!value.moduleId,
  });

  return (
    <>
      <Field label="Módulo de acceso">
        <select
          className={styles.select}
          value={value.moduleId}
          onChange={e => onChange({ moduleId: e.target.value, roleId: '' })}
        >
          <option value="">Seleccionar módulo…</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Rol asignado">
        <select
          className={styles.select}
          value={value.roleId}
          onChange={e => onChange({ ...value, roleId: e.target.value })}
          disabled={!value.moduleId}
        >
          <option value="">Seleccionar rol…</option>
          {roles.map((r: any) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </Field>
    </>
  );
}

/* ── Main modal ─────────────────────────────────────────────────────────────── */

export function ExecuteRequestModal({ request, onClose }: Props) {
  const qc = useQueryClient();

  const requesterId  = (request as any).requester_id as string | null;
  const metaModuleId = (request.metadata?.module_id ?? '') as string;

  const [roleChange,   setRoleChange]   = useState({ moduleId: '', roleId: '' });
  const [moduleAccess, setModuleAccess] = useState({ moduleId: '', roleId: '' });
  const [notes,        setNotes]        = useState('');
  const [error,        setError]        = useState('');

  const { data: allModules = [] } = useQuery({
    queryKey: ['modules-list-exec'],
    queryFn:  () => modulesService.getModules(),
  });

  const { data: userRoles = [], isLoading: rolesLoading } = useQuery<any[]>({
    queryKey: ['user-roles-exec', requesterId],
    queryFn:  () => usersService.getUserRoles(requesterId!) as unknown as Promise<any[]>,
    enabled:  !!requesterId && request.type === 'access_revocation',
  });

  const targetUmr = userRoles.find((r) => r.module_id === metaModuleId && r.is_active) ?? null;
  const targetModuleName = allModules.find((m: any) => m.id === metaModuleId)?.name ?? metaModuleId;

  const completeMut = useMutation({
    mutationFn: async () => {
      if (!requesterId) throw new Error('Sin usuario solicitante.');

      if (request.type === 'role_change') {
        if (!roleChange.moduleId || !roleChange.roleId) throw new Error('Selecciona módulo y rol.');
        await usersService.assignUserRole(requesterId, roleChange.moduleId, roleChange.roleId);
      }

      if (request.type === 'module_access') {
        if (!moduleAccess.moduleId || !moduleAccess.roleId) throw new Error('Selecciona módulo y rol.');
        await usersService.assignUserRole(requesterId, moduleAccess.moduleId, moduleAccess.roleId);
      }

      if (request.type === 'reactivation') {
        await usersService.updateUser(requesterId, { is_active: true });
      }

      if (request.type === 'access_revocation') {
        if (!targetUmr) throw new Error(`El usuario no tiene acceso activo al módulo "${targetModuleName}".`);
        await usersService.removeRole(requesterId, targetUmr.id);
      }

      await requestsService.updateProgress(request.id, 'completed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests-inbox-dyn'] });
      qc.invalidateQueries({ queryKey: ['module-users'] });
      qc.invalidateQueries({ queryKey: ['users-list-dyn'] });
      qc.invalidateQueries({ queryKey: ['user-roles-exec', requesterId] });
      onClose();
    },
    onError: (e: any) => setError(e?.message ?? 'Error ejecutando cambio.'),
  });

  function isReady(): boolean {
    if (!requesterId) return false;
    if (request.type === 'role_change')           return !!(roleChange.moduleId && roleChange.roleId);
    if (request.type === 'module_access')         return !!(moduleAccess.moduleId && moduleAccess.roleId);
    if (request.type === 'reactivation')          return true;
    if (request.type === 'permission_adjustment') return true;
    if (request.type === 'access_revocation')     return !rolesLoading && !!targetUmr;
    if (request.type === 'user_transfer')         return true;
    return false;
  }

  const typeIcon: Record<string, React.ReactNode> = {
    role_change:            <ShieldCheck size={16} />,
    module_access:          <Globe size={16} />,
    permission_adjustment:  <ShieldCheck size={16} />,
    access_revocation:      <MapPin size={16} />,
    user_transfer:          <User size={16} />,
    reactivation:           <Zap size={16} />,
  };

  const typeTitle: Record<string, string> = {
    role_change:            'Asignar nuevo rol',
    module_access:          'Dar acceso a módulo',
    permission_adjustment:  'Ajustar permisos',
    reactivation:           'Reactivar cuenta',
    access_revocation:      'Revocar acceso',
    user_transfer:          'Trasladar usuario',
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.typeIcon}>{typeIcon[request.type] ?? <Zap size={16} />}</span>
            <div>
              <h3 className={styles.title}>{typeTitle[request.type] ?? 'Ejecutar cambio'}</h3>
              <p className={styles.sub}>{request.requester_name ?? 'Usuario'} · {request.title}</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Cerrar">
            <X size={16} />
          </button>
        </div>

        {/* Request description */}
        <div className={styles.reqDesc}>{request.description}</div>

        {/* Type-specific form */}
        <div className={styles.form}>
          {request.type === 'role_change' && (
            <RoleChangeForm
              requesterId={requesterId}
              value={roleChange}
              onChange={setRoleChange}
            />
          )}
          {request.type === 'module_access' && (
            <ModuleAccessForm value={moduleAccess} onChange={setModuleAccess} />
          )}
          {request.type === 'reactivation' && (
            <div className={styles.reactivationNote}>
              Se reactivará la cuenta del usuario. Podrá volver a iniciar sesión inmediatamente.
            </div>
          )}
          {request.type === 'permission_adjustment' && (
            <div className={styles.reactivationNote}>
              Revisa los permisos actuales del usuario y realiza los ajustes necesarios desde el módulo correspondiente.
            </div>
          )}
          {request.type === 'access_revocation' && (
            <div className={styles.reactivationNote}>
              {rolesLoading ? (
                <span style={{ color: '#94a3b8' }}>Verificando acceso del usuario…</span>
              ) : targetUmr ? (
                <>
                  <strong style={{ color: '#0e2235' }}>Se eliminará el acceso a: {targetModuleName}</strong>
                  <br />
                  <span style={{ fontSize: 12, color: '#64748b' }}>Rol actual: {targetUmr.role_name}</span>
                </>
              ) : (
                <span style={{ color: '#ef4444' }}>
                  El usuario no tiene acceso activo al módulo solicitado
                  {targetModuleName ? ` (${targetModuleName})` : ''}.
                  No hay acción que ejecutar.
                </span>
              )}
            </div>
          )}

          <Field label="Notas de resolución (opcional)">
            <textarea
              className={styles.textarea}
              placeholder="Describe qué cambio se aplicó o por qué…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </Field>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {!requesterId && (
          <div className={styles.error}>No se puede ejecutar: la solicitud no tiene usuario vinculado.</div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!isReady() || completeMut.isPending}
            onClick={() => { setError(''); completeMut.mutate(); }}
          >
            {completeMut.isPending ? 'Aplicando…' : 'Ejecutar y completar'}
          </button>
        </div>
      </div>
    </div>
  );
}
