'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { requestsService, type RequestType } from '@/services/requests.service';
import { modulesService } from '@/services/modules.service';
import {
  REQUEST_TYPE_LABELS, REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITIES,
} from '@/constants/requests';
import { Modal } from '@/components/ui/Modal';
import mstyles from '@/components/ui/modal.module.css';

const MODULE_REQUEST_TYPES: RequestType[] = ['module_access', 'role_change', 'permission_adjustment'];

const schema = z.object({
  type:        z.enum(['role_change', 'module_access', 'info_correction', 'sede_change',
                        'permission_adjustment', 'account_issue', 'reactivation', 'other']),
  priority:    z.enum(['baja', 'media', 'alta', 'critica']),
  title:       z.string().min(5, 'Mínimo 5 caracteres'),
  description: z.string().min(10, 'Mínimo 10 caracteres'),
  module_id:   z.string().uuid('ID de módulo inválido').optional().or(z.literal('')),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export function CreateRequestModal({ open, onClose, onSuccess }: Props) {
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: { type: 'role_change', priority: 'media', title: '', description: '', module_id: '' },
    });

  const watchedType        = watch('type') as RequestType;
  const showModuleSelector = MODULE_REQUEST_TYPES.includes(watchedType);

  const { data: allModules = [] } = useQuery({
    queryKey: ['modules-all'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 120_000,
    enabled:   open && showModuleSelector,
  });

  const createMut = useMutation({
    mutationFn: (dto: FormData) => requestsService.create({
      type:        dto.type,
      title:       dto.title,
      description: dto.description,
      priority:    dto.priority,
      metadata:    dto.module_id ? { module_id: dto.module_id } : undefined,
    }),
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
        <select className={mstyles.fieldInput} {...register('type')}>
          {REQUEST_TYPES.map(t => (
            <option key={t} value={t}>{REQUEST_TYPE_LABELS[t]}</option>
          ))}
        </select>

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

        <label className={mstyles.fieldLabel}>Prioridad</label>
        <select className={mstyles.fieldInput} {...register('priority')}>
          {REQUEST_PRIORITIES.map(p => (
            <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>
          ))}
        </select>

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
