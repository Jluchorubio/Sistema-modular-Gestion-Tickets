'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { MsgBanner, type Msg } from './MsgBanner';
import styles from '../login.module.css';

const resetSchema = z
  .object({
    newPassword:     z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path:    ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

interface Props {
  resetToken: string;
  onSuccess:  () => void;
}

export function ResetForm({ resetToken, onSuccess }: Props) {
  const [showPw,  setShowPw]  = useState(false);
  const [msg,     setMsg]     = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<ResetFormValues>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(values: ResetFormValues) {
    setMsg(null);
    setLoading(true);
    try {
      await authService.resetPassword(resetToken, values.newPassword);
      setMsg({ type: 'ok', icon: 'check', text: 'Contraseña actualizada. Redirigiendo...' });
      setTimeout(onSuccess, 1800);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: { message?: string } } })?.response?.data;
      setMsg({ type: 'err', text: body?.message ?? 'Token inválido o expirado.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <span className={`${styles.tag} ${styles.tagInfo}`}>
        <KeyRound size={11} />
        Nueva contraseña
      </span>
      <p className={styles.sectionDesc}>Ingresa tu nueva contraseña (mínimo 8 caracteres).</p>

      <label className={styles.label}>Nueva contraseña</label>
      <div className={styles.pwWrap}>
        <input
          {...form.register('newPassword')}
          type={showPw ? 'text' : 'password'}
          placeholder="Mínimo 8 caracteres"
          className={styles.input}
        />
        <button type="button" className={styles.pwToggle} onClick={() => setShowPw((v) => !v)} title="Mostrar/ocultar">
          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {form.formState.errors.newPassword && (
        <p style={{ fontSize: 12, color: '#fca5a5', marginTop: -10, marginBottom: 12 }}>
          {form.formState.errors.newPassword.message}
        </p>
      )}

      <label className={styles.label}>Confirmar contraseña</label>
      <input
        {...form.register('confirmPassword')}
        type="password"
        placeholder="Repite la contraseña"
        className={styles.input}
      />
      {form.formState.errors.confirmPassword && (
        <p style={{ fontSize: 12, color: '#fca5a5', marginTop: -10, marginBottom: 12 }}>
          {form.formState.errors.confirmPassword.message}
        </p>
      )}

      <MsgBanner msg={msg} />

      <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={loading}>
        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
