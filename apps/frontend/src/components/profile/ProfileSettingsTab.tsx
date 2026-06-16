'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import api from '@/services/api';
import { type ProfileUser } from './profile.types';
import styles from './profile.module.css';

interface Props {
  user: ProfileUser;
}

export function ProfileSettingsTab({ user }: Props) {
  const qc = useQueryClient();

  const [notifEmail,    setNotifEmail]    = useState(user.notification_email    !== false);
  const [notifInApp,    setNotifInApp]    = useState(user.notification_in_app   !== false);
  const [notifWhatsapp, setNotifWhatsapp] = useState(user.notification_whatsapp === true);

  const { data: channels } = useQuery({
    queryKey: ['notification-channels'],
    queryFn:  () => api.get('/notifications/channels').then(r => r.data as { in_app: boolean; email: boolean; whatsapp: boolean }),
    staleTime: 10 * 60_000,
  });
  const whatsappAvailable = channels?.whatsapp ?? false;
  const [language,      setLanguage]      = useState(user.preferences?.language  ?? 'es');
  const [timezone,      setTimezone]      = useState(user.preferences?.timezone  ?? 'America/Bogota');
  const [saved,         setSaved]         = useState(false);

  const mut = useMutation({
    mutationFn: () => usersService.upsertPreferences({
      language,
      timezone,
      notification_email:    notifEmail,
      notification_whatsapp: notifWhatsapp,
      notification_in_app:   notifInApp,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <>
      <div className={styles.card} style={{ overflow: 'hidden', marginBottom: 22 }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Preferencias de notificaciones</p>
        </div>
        {([
          ['email',    'Notificaciones por correo',  'Recibe alertas de tickets y eventos por email',   notifEmail,    setNotifEmail,    true],
          ['inapp',    'Notificaciones en app',       'Alertas dentro del sistema',                      notifInApp,    setNotifInApp,    true],
          ['whatsapp', 'Notificaciones WhatsApp',     'Mensajes para tickets urgentes',                  notifWhatsapp, setNotifWhatsapp, whatsappAvailable],
        ] as [string, string, string, boolean, (v: boolean) => void, boolean][]).map(([id, label, sub, val, setter, available]) => (
          <div key={id} className={styles.securityItem} style={{ opacity: available ? 1 : 0.55 }}>
            <div>
              <p className={styles.securityLabel}>{label}</p>
              <p className={styles.securitySub}>
                {!available ? 'Canal no disponible — requiere configuración del sistema' : sub}
              </p>
            </div>
            <label className={styles.prefToggle} style={{ pointerEvents: available ? 'auto' : 'none' }}>
              <input
                type="checkbox"
                checked={val && available}
                onChange={(e) => setter(e.target.checked)}
                disabled={!available}
              />
              <span className={styles.prefSlider} />
            </label>
          </div>
        ))}
      </div>

      <div className={styles.card} style={{ overflow: 'hidden' }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Idioma y zona horaria</p>
        </div>
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.formGroup} style={{ margin: 0 }}>
            <label className={styles.formLabel}>Idioma</label>
            <select className={styles.formInput} value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className={styles.formGroup} style={{ margin: 0 }}>
            <label className={styles.formLabel}>Zona horaria</label>
            <select className={styles.formInput} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="America/Bogota">América/Bogotá (UTC-5)</option>
              <option value="America/Mexico_City">América/Ciudad de México (UTC-6)</option>
              <option value="America/Lima">América/Lima (UTC-5)</option>
              <option value="America/Santiago">América/Santiago (UTC-3)</option>
              <option value="America/Buenos_Aires">América/Buenos Aires (UTC-3)</option>
              <option value="America/Caracas">América/Caracas (UTC-4)</option>
              <option value="Europe/Madrid">Europa/Madrid (UTC+1)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            style={{
              alignSelf: 'flex-start', marginTop: 4, padding: '8px 20px',
              background: saved ? '#22c55e' : mut.isPending ? '#94a3b8' : '#ff5e3a',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: mut.isPending ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
            }}
          >
            {mut.isPending ? 'Guardando...' : saved ? 'Guardado' : 'Guardar preferencias'}
          </button>
          {mut.isError && (
            <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>
              {(mut.error as any)?.response?.data?.message ?? 'Error al guardar'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
