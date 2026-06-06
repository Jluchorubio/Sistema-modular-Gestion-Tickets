'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { OtpInput } from '@/components/auth/OtpInput';
import type { LoginResponse } from '@/types/auth.types';
import { MsgBanner, type Msg } from './MsgBanner';
import styles from '../login.module.css';

interface Props {
  otpToken:  string;
  onBack:    () => void;
  onSuccess: (data: LoginResponse) => void;
}

export function TotpForm({ otpToken, onBack, onSuccess }: Props) {
  const [digits,  setDigits]  = useState(['', '', '', '', '', '']);
  const [msg,     setMsg]     = useState<Msg | null>(null);
  const [loading, setLoading] = useState(false);

  async function onVerify() {
    const code = digits.join('');
    if (code.length !== 6) {
      setMsg({ type: 'err', text: 'Ingresa el código de 6 dígitos.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const data = await authService.verifyTotpLogin(code, otpToken);
      onSuccess(data as LoginResponse);
    } catch (err: unknown) {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      setMsg({ type: 'err', text: (body as { message?: string })?.message ?? 'Código inválido.' });
      setDigits(['', '', '', '', '', '']);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <span className={`${styles.tag} ${styles.tagOtp}`}>
        <Shield size={11} />
        Autenticador
      </span>
      <p className={styles.sectionDesc}>
        Ingresa el código de 6 dígitos de tu app autenticadora (Google Authenticator, Authy, etc.).
        El código cambia cada 30 segundos.
      </p>

      <OtpInput
        value={digits}
        onChange={setDigits}
        onComplete={onVerify}
        wrapClassName={styles.otpWrap}
        digitClassName={styles.otpDigit}
        disabled={loading}
      />

      <MsgBanner msg={msg} />

      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={onVerify}
        disabled={loading}
      >
        {loading ? 'Verificando...' : 'Verificar código'}
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnBack}`}
        onClick={onBack}
      >
        ← Volver al inicio
      </button>
    </div>
  );
}
