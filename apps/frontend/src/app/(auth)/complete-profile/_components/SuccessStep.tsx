'use client';
import styles from '../complete-profile.module.css';

export function SuccessStep() {
  return (
    <div className={styles.successOverlay}>
      <div className={styles.successRing}>
        <svg viewBox="0 0 52 52" fill="none" width="34" height="34">
          <path
            d="M14 26L22 34L38 18"
            stroke="#22C55E"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className={styles.successTitle}>¡Perfil completado!</div>
      <div className={styles.successSub}>
        Tu información ha sido guardada. Redirigiendo al dashboard...
      </div>
      <div className={styles.successDots}>
        <span /><span /><span />
      </div>
    </div>
  );
}
