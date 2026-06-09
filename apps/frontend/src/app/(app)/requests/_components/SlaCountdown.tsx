'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

function diffPct(sla_due_at: string, created_at?: string): number {
  const due  = new Date(sla_due_at).getTime();
  const now  = Date.now();
  const left = due - now;
  if (left <= 0) return 0;
  /* Use created_at → due window; fallback to 4-hour default if unavailable */
  const start = created_at ? new Date(created_at).getTime() : due - 4 * 3_600_000;
  const total = Math.max(due - start, 1);
  return left / total;
}

export function SlaCountdown({ sla_due_at, created_at }: { sla_due_at: string; created_at?: string }) {
  const [label,   setLabel]   = useState('');
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    function tick() {
      const diff = new Date(sla_due_at).getTime() - Date.now();
      if (diff <= 0) {
        setOverdue(true);
        const abs = Math.abs(diff);
        const h = Math.floor(abs / 3_600_000);
        const m = Math.floor((abs % 3_600_000) / 60_000);
        setLabel(`Vencido +${h}h ${m}m`);
      } else {
        setOverdue(false);
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const s = Math.floor((diff % 60_000) / 1_000);
        setLabel(`SLA: ${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
      }
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [sla_due_at]);

  const pct    = diffPct(sla_due_at, created_at);
  const urgent = pct < 0.25;
  const color  = overdue ? 'var(--status-breached-text)' : urgent ? 'var(--status-warning-text)' : 'var(--status-success-text)';
  const bg     = overdue ? 'var(--status-breached-bg)'   : urgent ? 'var(--status-warning-bg)'   : 'var(--status-success-bg)';
  const border = overdue ? 'var(--status-breached-border)': urgent ? 'var(--status-warning-border)': 'var(--status-success-border)';
  const glow   = overdue ? '0 0 0 2px var(--status-breached-glow)' : urgent ? '0 0 0 2px var(--status-escalated-glow)' : undefined;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
      color, background: bg,
      border: `1px solid ${border}`,
      boxShadow: glow,
      padding: '2px 8px', borderRadius: 'var(--radius-md, 8px)',
    }}>
      {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
      {label}
    </span>
  );
}
