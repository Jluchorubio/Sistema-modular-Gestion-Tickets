'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { MsgBanner, type Msg } from './MsgBanner';
import styles from '../login.module.css';

const forgotSchema = z.object({
  email: z.string().email('Email inválido'),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

interface Props {
  onBack: () => void;
}

export function ForgotForm({ onBack }: Props) {
  const [msg,     setMsg]     = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<ForgotFormValues>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(values: ForgotFormValues) {
    setMsg(null);
    setLoading(true);
    try {
      await authService.forgotPassword(values.email);
      setMsg({ type: 'ok', icon: 'check', text: 'Si el email existe, recibirás el enlace en unos minutos.' });
    } catch {
      setMsg({ type: 'err', text: 'Error al enviar el enlace.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <span className={`${styles.tag} ${styles.tagInfo}`}>
        <Mail size={11} />
        Recuperar contraseña
      </span>
      <p className={styles.sectionDesc}>Ingresa tu email y recibirás un enlace para resetear tu contraseña.</p>

      <label className={styles.label}>Email</label>
      <input
        {...form.register('email')}
        type="email"
        className={styles.input}
        placeholder="email@ejemplo.com"
      />
      {form.formState.errors.email && (
        <p style={{ fontSize: 12, color: '#fca5a5', marginTop: -10, marginBottom: 12 }}>
          {form.formState.errors.email.message}
        </p>
      )}

      <MsgBanner msg={msg} />

      <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar enlace'}
      </button>
      <button type="button" className={`${styles.btn} ${styles.btnBack}`} onClick={onBack}>
        ← Volver al login
      </button>
    </form>
  );
}
