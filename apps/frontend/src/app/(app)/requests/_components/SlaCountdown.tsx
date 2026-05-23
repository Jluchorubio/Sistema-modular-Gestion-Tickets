'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

function diffPct(sla_due_at: string): number {
  const total = 4 * 3_600_000;
  const left  = new Date(sla_due_at).getTime() - Date.now();
  return Math.max(0, left / total);
}

export function SlaCountdown({ sla_due_at }: { sla_due_at: string }) {
  const [label,  setLabel]  = useState('');
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

  const pct = diffPct(sla_due_at);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
      color:       overdue ? '#EF4444' : pct < 0.25 ? '#F59E0B' : '#22C55E',
      background:  overdue ? '#450a0a' : pct < 0.25 ? '#451a03' : '#052e16',
      border: `1px solid ${overdue ? '#7f1d1d' : pct < 0.25 ? '#78350f' : '#14532d'}`,
      padding: '2px 8px', borderRadius: 6,
    }}>
      {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
      {label}
    </span>
  );
}
