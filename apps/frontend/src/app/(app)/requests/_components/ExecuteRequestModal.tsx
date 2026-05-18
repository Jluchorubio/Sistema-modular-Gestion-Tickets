'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ShieldCheck, Globe, MapPin, User, Zap } from 'lucide-react';
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
  'role_change', 'module_access', 'sede_change', 'info_correction', 'permission_adjustment', 'reactivation',
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

function SedeChangeForm({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="Nueva sede">
      <input
        type="text"
        className={styles.input}
        placeholder="Ej: Sede Norte, Barranquilla…"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </Field>
  );
}

function InfoCorrectionForm({
  value,
  onChange,
}: {
  value: { field: string; newValue: string };
  onChange: (v: { field: string; newValue: string }) => void;
}) {
  const CORRECTABLE_FIELDS = [
    { key: 'first_name',   label: 'Nombre' },
    { key: 'last_name',    label: 'Apellido' },
    { key: 'email',        label: 'Email' },
    { key: 'phone',        label: 'Teléfono' },
    { key: 'job_title',    label: 'Cargo' },
    { key: 'department',   label: 'Departamento' },
    { key: 'primary_sede', label: 'Sede' },
    { key: 'address',      label: 'Dirección' },
    { key: 'national_id',  label: 'Cédula / ID Nacional' },
  ];

  return (
    <>
      <Field label="Campo a corregir">
        <select
          className={styles.select}
          value={value.field}
          onChange={e => onChange({ ...value, field: e.target.value })}
        >
          <option value="">Seleccionar campo…</option>
          {CORRECTABLE_FIELDS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Nuevo valor">
        <input
          type="text"
          className={styles.input}
          placeholder="Valor corregido…"
          value={value.newValue}
          onChange={e => onChange({ ...value, newValue: e.target.value })}
          disabled={!value.field}
        />
      </Field>
    </>
  );
}

/* ── Main modal ─────────────────────────────────────────────────────────────── */

export function ExecuteRequestModal({ request, onClose }: Props) {
  const qc = useQueryClient();

  const requesterId = (request as any).requester_id as string | null;

  const [roleChange,     setRoleChange]     = useState({ moduleId: '', roleId: '' });
  const [moduleAccess,   setModuleAccess]   = useState({ moduleId: '', roleId: '' });
  const [sede,           setSede]           = useState('');
  const [infoCorrection, setInfoCorrection] = useState({ field: '', newValue: '' });
  const [notes,          setNotes]          = useState('');
  const [error,          setError]          = useState('');

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

      if (request.type === 'sede_change') {
        if (!sede.trim()) throw new Error('Escribe la nueva sede.');
        await usersService.updateUser(requesterId, { primary_sede: sede.trim() });
      }

      if (request.type === 'info_correction') {
        if (!infoCorrection.field || !infoCorrection.newValue.trim()) throw new Error('Selecciona campo y valor.');
        await usersService.updateUser(requesterId, { [infoCorrection.field]: infoCorrection.newValue.trim() } as any);
      }

      if (request.type === 'reactivation') {
        await usersService.updateUser(requesterId, { is_active: true });
      }

      // Mark request as completed
      await requestsService.updateProgress(request.id, 'completed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests-inbox-dyn'] });
      qc.invalidateQueries({ queryKey: ['module-users'] });
      qc.invalidateQueries({ queryKey: ['users-list-dyn'] });
      onClose();
    },
    onError: (e: any) => setError(e?.message ?? 'Error ejecutando cambio.'),
  });

  function isReady(): boolean {
    if (!requesterId) return false;
    if (request.type === 'role_change')     return !!(roleChange.moduleId && roleChange.roleId);
    if (request.type === 'module_access')   return !!(moduleAccess.moduleId && moduleAccess.roleId);
    if (request.type === 'sede_change')     return !!sede.trim();
    if (request.type === 'info_correction') return !!(infoCorrection.field && infoCorrection.newValue.trim());
    if (request.type === 'reactivation')    return true;
    if (request.type === 'permission_adjustment') return true;
    return false;
  }

  const typeIcon: Record<string, React.ReactNode> = {
    role_change:            <ShieldCheck size={16} />,
    module_access:          <Globe size={16} />,
    sede_change:            <MapPin size={16} />,
    info_correction:        <User size={16} />,
    permission_adjustment:  <ShieldCheck size={16} />,
    reactivation:           <Zap size={16} />,
  };

  const typeTitle: Record<string, string> = {
    role_change:            'Asignar nuevo rol',
    module_access:          'Dar acceso a módulo',
    sede_change:            'Cambiar sede',
    info_correction:        'Corregir información',
    permission_adjustment:  'Ajustar permisos',
    reactivation:           'Reactivar cuenta',
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
          {request.type === 'sede_change' && (
            <SedeChangeForm value={sede} onChange={setSede} />
          )}
          {request.type === 'info_correction' && (
            <InfoCorrectionForm value={infoCorrection} onChange={setInfoCorrection} />
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
