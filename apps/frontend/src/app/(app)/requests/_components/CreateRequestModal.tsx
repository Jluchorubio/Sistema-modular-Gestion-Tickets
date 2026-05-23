'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Info } from 'lucide-react';
import { requestsService } from '@/services/requests.service';
import { modulesService } from '@/services/modules.service';
import { systemConfigService, type RequestTypeConfig } from '@/services/system-config.service';
import {
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITIES,
} from '@/constants/requests';
import { Modal } from '@/components/ui/Modal';
import mstyles from '@/components/ui/modal.module.css';

/* type_keys that require module selection */
const MODULE_REQUEST_TYPE_KEYS = ['module_access', 'role_change', 'permission_adjustment', 'access_revocation'];

const schema = z.object({
  type:        z.string().min(3),
  title:       z.string().min(5, 'Mínimo 5 caracteres'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
  module_id:   z.string().uuid('ID de módulo inválido').optional().or(z.literal('')),
  role_id:     z.string().uuid().optional().or(z.literal('')),
  priority:    z.enum(['baja', 'media', 'alta', 'critica']).optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export function CreateRequestModal({ open, onClose, onSuccess }: Props) {
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: activeTypes = [], isLoading: loadingTypes } = useQuery<RequestTypeConfig[]>({
    queryKey: ['request-types-active'],
    queryFn:  () => systemConfigService.getRequestTypes(true),
    staleTime: 300_000,
    enabled:   open,
  });

  const defaultType = activeTypes[0]?.type_key ?? 'role_change';

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: { type: defaultType, title: '', description: '', module_id: '', role_id: '' },
    });

  const watchedType        = watch('type');
  const watchedModuleId    = watch('module_id') ?? '';
  const showModuleSelector = MODULE_REQUEST_TYPE_KEYS.includes(watchedType);
  const showRoleSelector   = watchedType === 'role_change' && !!watchedModuleId;
  const activeTypeConfig   = activeTypes.find(t => t.type_key === watchedType);
  const showPriority       = activeTypeConfig?.allows_manual_priority ?? watchedType === 'other';

  const { data: allModules = [] } = useQuery({
    queryKey: ['modules-all'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 120_000,
    enabled:   open && showModuleSelector,
  });

  const { data: moduleRoles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['module-roles-create', watchedModuleId],
    queryFn:  () => modulesService.getModuleRoles(watchedModuleId),
    staleTime: 60_000,
    enabled:   open && showRoleSelector,
  });

  const createMut = useMutation({
    mutationFn: (dto: FormData) => {
      const metadata: Record<string, unknown> = {};
      if (dto.module_id) metadata.module_id = dto.module_id;
      if (dto.role_id)   metadata.role_id   = dto.role_id;
      return requestsService.create({
        type:        dto.type,
        title:       dto.title,
        description: dto.description,
        priority:    dto.type === 'other' ? dto.priority : undefined,
        metadata:    Object.keys(metadata).length ? metadata : undefined,
      });
    },
    onSuccess: () => {
      setServerMsg({ ok: true, text: 'Solicitud enviada' });
      onSuccess();
      setTimeout(() => { handleClose(); }, 800);
    },
    onError: (e: Error) => setServerMsg({ ok: false, text: e.message ?? 'Error al enviar' }),
  });

  function handleClose() {
    onClose();
    reset();
    setServerMsg(null);
  }

  return (
    <Modal open={open} title="Nueva solicitud" onClose={handleClose}>
      <form onSubmit={handleSubmit(dto => { setServerMsg(null); createMut.mutate(dto); })}>
        <label className={mstyles.fieldLabel}>Tipo de solicitud</label>
        {loadingTypes ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', padding: '8px 0' }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            Cargando tipos…
          </div>
        ) : (
          <select className={mstyles.fieldInput} {...register('type')}>
            {activeTypes.map(t => (
              <option key={t.type_key} value={t.type_key}>{t.label}</option>
            ))}
          </select>
        )}

        {showModuleSelector && allModules.length > 0 && (
          <>
            <label className={mstyles.fieldLabel}>Módulo</label>
            <select className={mstyles.fieldInput} {...register('module_id')}>
              <option value="">Selecciona un módulo…</option>
              {(allModules as Array<{ id: string; name: string }>).map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </>
        )}

        {showRoleSelector && (
          <>
            <label className={mstyles.fieldLabel}>Rol solicitado</label>
            {loadingRoles ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', padding: '8px 0' }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                Cargando roles…
              </div>
            ) : moduleRoles.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>
                Este módulo no tiene roles definidos.
              </div>
            ) : (
              <select className={mstyles.fieldInput} {...register('role_id')}>
                <option value="">Selecciona el rol que deseas…</option>
                {moduleRoles.map((r: { id: string; name: string }) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </>
        )}

        {/* Priority manual — only for 'other' type */}
        {showPriority && (
          <>
            <label className={mstyles.fieldLabel}>Prioridad</label>
            <select className={mstyles.fieldInput} {...register('priority')}>
              <option value="">Sistema calculará automáticamente…</option>
              {REQUEST_PRIORITIES.map(p => (
                <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </>
        )}

        {/* Info note about automatic priority */}
        {!showPriority && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: '#f0f9ff', border: '1px solid #bae6fd',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#0369a1',
          }}>
            <Info size={13} style={{ marginTop: 1, flexShrink: 0 }} />
            El sistema calculará la prioridad automáticamente según tu cargo y tipo de solicitud.
          </div>
        )}

        <label className={mstyles.fieldLabel}>Título *</label>
        <input
          className={mstyles.fieldInput}
          placeholder="Resumen breve de tu solicitud…"
          {...register('title')}
        />
        {errors.title && (
          <div className={mstyles.msgErr} style={{ padding: '6px 10px', marginTop: 4 }}>
            {errors.title.message}
          </div>
        )}

        <label className={mstyles.fieldLabel}>Descripción *</label>
        <textarea
          className={mstyles.fieldInput}
          placeholder="Explica tu solicitud con detalle…"
          style={{ minHeight: 100, resize: 'vertical' }}
          {...register('description')}
        />
        {errors.description && (
          <div className={mstyles.msgErr} style={{ padding: '6px 10px', marginTop: 4 }}>
            {errors.description.message}
          </div>
        )}

        {serverMsg && (
          <div className={serverMsg.ok ? mstyles.msgOk : mstyles.msgErr}>
            {serverMsg.text}
          </div>
        )}

        <div className={mstyles.actions}>
          <button type="button" className={mstyles.actCancel} onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className={mstyles.actConfirm}
            disabled={isSubmitting || createMut.isPending}
          >
            Enviar solicitud
          </button>
        </div>
      </form>
    </Modal>
  );
}
