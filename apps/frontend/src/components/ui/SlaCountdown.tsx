'use client';
import { useState, useEffect } from 'react';

const R = 14;
const C = 2 * Math.PI * R;

function diffPct(sla_due_at: string, created_at?: string): number {
  const due   = new Date(sla_due_at).getTime();
  const now   = Date.now();
  const left  = due - now;
  if (left <= 0) return 0;
  const start = created_at ? new Date(created_at).getTime() : due - 4 * 3_600_000;
  const total = Math.max(due - start, 1);
  return Math.min(left / total, 1);
}

function shortLabel(diffMs: number, overdue: boolean): string {
  const abs = Math.abs(diffMs);
  const h   = Math.floor(abs / 3_600_000);
  const m   = Math.floor((abs % 3_600_000) / 60_000);
  const s   = Math.floor((abs % 60_000) / 1_000);
  if (overdue) return h > 0 ? `+${h}h` : `+${m}m`;
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  if (h > 0)   return `${h}h`;
  if (m > 0)   return `${m}m`;
  return `${s}s`;
}

function longLabel(diffMs: number, overdue: boolean): string {
  const abs = Math.abs(diffMs);
  const h   = Math.floor(abs / 3_600_000);
  const m   = Math.floor((abs % 3_600_000) / 60_000);
  const s   = Math.floor((abs % 60_000) / 1_000);
  if (overdue) return `SLA vencido hace ${h}h ${m.toString().padStart(2, '0')}m`;
  return `SLA restante: ${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

export function SlaCountdown({ sla_due_at, created_at }: { sla_due_at: string; created_at?: string }) {
  const [diffMs, setDiffMs] = useState(() => new Date(sla_due_at).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setDiffMs(new Date(sla_due_at).getTime() - Date.now());
    }, 1_000);
    return () => clearInterval(id);
  }, [sla_due_at]);

  const overdue = diffMs <= 0;
  const pct     = diffPct(sla_due_at, created_at);
  const urgent  = !overdue && pct < 0.25;

  const stroke = overdue ? '#ef4444' : urgent ? '#f59e0b' : '#22c55e';
  const trackC = overdue ? '#fee2e2' : urgent ? '#fef3c7' : '#dcfce7';
  const textC  = overdue ? '#ef4444' : urgent ? '#b45309' : '#15803d';
  const dash   = C * (1 - pct);

  return (
    <span
      title={longLabel(diffMs, overdue)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'default' }}
    >
      <svg
        width={34} height={34}
        viewBox="0 0 34 34"
        style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={17} cy={17} r={R}
          fill="none"
          stroke={trackC}
          strokeWidth={4}
        />
        <circle
          cx={17} cy={17} r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={4}
          strokeDasharray={C}
          strokeDashoffset={dash}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s' }}
        />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color: textC, fontFamily: 'monospace', minWidth: 26 }}>
        {shortLabel(diffMs, overdue)}
      </span>
    </span>
  );
}
