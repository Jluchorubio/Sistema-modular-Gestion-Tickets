'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { modulesService } from '@/services/modules.service';
import { useFileUpload } from '@/hooks/useFileUpload';
import { FileUpload } from '@/components/ui/FileUpload';
import { Modal } from '@/components/ui/Modal';
import type { SystemModule } from '@/types/module.types';
import styles from './module-form.module.css';

const MODULE_TYPES = [
  { value: '',           label: 'Sin tipo'    },
  { value: 'tickets',   label: 'Tickets'     },
  { value: 'helpdesk',  label: 'Helpdesk'    },
  { value: 'inventario',label: 'Inventario'  },
  { value: 'crm',       label: 'CRM'         },
  { value: 'rrhh',      label: 'RRHH'        },
  { value: 'custom',    label: 'Personalizado'},
];

const PRESET_COLORS = [
  { hex: '',        label: 'Sin color' },
  { hex: '#6366f1', label: 'Índigo'   },
  { hex: '#0ea5e9', label: 'Azul'     },
  { hex: '#10b981', label: 'Verde'    },
  { hex: '#f59e0b', label: 'Ámbar'   },
  { hex: '#ef4444', label: 'Rojo'     },
  { hex: '#8b5cf6', label: 'Violeta'  },
  { hex: '#0f172a', label: 'Negro'    },
];

const schema = z.object({
  name:        z.string().min(1, 'Nombre requerido'),
  description: z.string().optional(),
  type:        z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open:      boolean;
  module?:   SystemModule | null;
  onClose:   () => void;
  onSuccess: () => void;
}

export function ModuleFormModal({ open, module: mod, onClose, onSuccess }: Props) {
  const qc      = useQueryClient();
  const isEdit  = !!mod;

  const [color,    setColor]    = useState(mod?.color    ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(mod?.image_url ?? null);
  const [msg,      setMsg]      = useState<{ ok: boolean; text: string } | null>(null);

  const imgUpload = useFileUpload({
    accept:    ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMb: 5,
    onSuccess: (url) => setImageUrl(url),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', type: '' },
  });

  // Sync form when modal opens/module changes
  useEffect(() => {
    if (open) {
      reset({
        name:        mod?.name        ?? '',
        description: mod?.description ?? '',
        type:        mod?.type        ?? '',
      });
      setColor(mod?.color    ?? '');
      setImageUrl(mod?.image_url ?? null);
      setMsg(null);
      imgUpload.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mod]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['modules'] });

  const createMut = useMutation({
    mutationFn: (vals: FormValues) =>
      modulesService.createModule({ ...vals, color: color || undefined, image_url: imageUrl }),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Módulo creado' });
      setTimeout(() => { onClose(); onSuccess(); invalidate(); }, 700);
    },
    onError: (e: unknown) => setMsg({
      ok: false,
      text: (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear',
    }),
  });

  const updateMut = useMutation({
    mutationFn: (vals: FormValues) =>
      modulesService.updateModule(mod!.id, { ...vals, color: color || undefined, image_url: imageUrl }),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Módulo actualizado' });
      setTimeout(() => { onClose(); onSuccess(); invalidate(); }, 700);
    },
    onError: (e: unknown) => setMsg({
      ok: false,
      text: (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar',
    }),
  });

  const isPending = createMut.isPending || updateMut.isPending || imgUpload.isUploading;

  function onSubmit(vals: FormValues) {
    setMsg(null);
    if (isEdit) updateMut.mutate(vals);
    else        createMut.mutate(vals);
  }

  function removeImage() {
    setImageUrl(null);
    imgUpload.reset();
  }

  const displayImageUrl = imgUpload.preview ?? imageUrl;

  return (
    <Modal
      open={open}
      title={isEdit ? 'Editar módulo' : 'Crear módulo'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)}>

        {/* Name */}
        <div className={styles.field}>
          <label className={`${styles.label} ${styles.labelRequired}`}>Nombre</label>
          <input className={styles.input} placeholder="Ej: Soporte Técnico" {...register('name')} />
          {errors.name && <span className={styles.fieldError}>{errors.name.message}</span>}
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label}>Descripción</label>
          <textarea className={styles.textarea} placeholder="Descripción breve del módulo…" {...register('description')} />
        </div>

        {/* Type + Color */}
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Tipo</label>
            <select className={styles.select} {...register('type')}>
              {MODULE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Color</label>
            <div className={styles.swatches}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  className={`${styles.swatch} ${color === c.hex ? styles.swatchActive : ''} ${!c.hex ? styles.swatchNone : ''}`}
                  style={c.hex ? { background: c.hex } : undefined}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Image upload */}
        <div className={styles.imageSection}>
          <p className={styles.imageLabel}>Imagen del módulo</p>

          {displayImageUrl ? (
            <div className={styles.currentImage}>
              <img src={displayImageUrl} alt="preview" className={styles.currentImageThumb} />
              <span className={styles.currentImageName}>
                {imgUpload.isUploading ? 'Subiendo imagen…' : 'Imagen seleccionada'}
              </span>
              <button type="button" className={styles.removeImgBtn} onClick={removeImage} title="Quitar imagen">
                <X size={14} />
              </button>
            </div>
          ) : (
            <FileUpload
              onFile={(file) => imgUpload.upload(file)}
              preview={null}
              isUploading={imgUpload.isUploading}
              error={imgUpload.error}
              accept="image/jpeg,image/png,image/webp"
              maxSizeMb={5}
              label="Arrastra la imagen o haz clic"
              hint="JPG, PNG, WEBP · Máx. 5MB"
            />
          )}
        </div>

        {msg && <p className={msg.ok ? styles.msgOk : styles.msgErr}>{msg.text}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnSubmit} disabled={isPending}>
            {isPending ? (isEdit ? 'Guardando…' : 'Creando…') : (isEdit ? 'Guardar cambios' : 'Crear módulo')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
