'use client';

import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import styles from '../login.module.css';

export interface Msg {
  type: 'err' | 'ok' | 'warn';
  text: string;
  icon?: 'lock' | 'warn' | 'check';
}

export function MsgBanner({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  const cls = { err: styles.msgErr, ok: styles.msgOk, warn: styles.msgWarn }[msg.type];
  const Icon = msg.icon === 'lock' ? Lock : msg.icon === 'check' ? CheckCircle : AlertTriangle;
  return (
    <div className={`${styles.msg} ${cls}`}>
      <Icon size={14} style={{ flexShrink: 0 }} />
      <span dangerouslySetInnerHTML={{ __html: msg.text }} />
    </div>
  );
}
