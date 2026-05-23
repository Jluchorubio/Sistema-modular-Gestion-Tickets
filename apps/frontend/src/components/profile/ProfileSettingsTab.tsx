'use client';
import { type ProfileUser } from './profile.types';
import styles from './profile.module.css';

interface Props {
  user: ProfileUser;
}

export function ProfileSettingsTab({ user }: Props) {
  return (
    <>
      <div className={styles.card} style={{ overflow: 'hidden', marginBottom: 22 }}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Preferencias de notificaciones</p>
        </div>
        {([
          ['email',    'Notificaciones por correo',  'Recibe alertas de tickets y eventos por email'],
          ['inapp',    'Notificaciones en app',       'Alertas dentro del sistema'],
          ['whatsapp', 'Notificaciones WhatsApp',     'Mensajes para tickets urgentes'],
        ] as [string, string, string][]).map(([id, label, sub]) => (
          <div key={id} className={styles.securityItem}>
            <div>
              <p className={styles.securityLabel}>{label}</p>
              <p className={styles.securitySub}>{sub}</p>
            </div>
            <label className={styles.prefToggle}>
              <input
                type="checkbox"
                defaultChecked={
                  id === 'email'   ? (user.notification_email    !== false) :
                  id === 'inapp'   ? (user.notification_in_app   !== false) :
                  (user.notification_whatsapp === true)
                }
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
            <select className={styles.formInput} defaultValue={user.preferences?.language ?? 'es'}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className={styles.formGroup} style={{ margin: 0 }}>
            <label className={styles.formLabel}>Zona horaria</label>
            <select className={styles.formInput} defaultValue={user.preferences?.timezone ?? 'America/Bogota'}>
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
        </div>
      </div>
    </>
  );
}
