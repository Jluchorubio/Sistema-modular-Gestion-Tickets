'use client';

import Link      from 'next/link';
import { useQuery }          from '@tanstack/react-query';
import { ArrowRight }        from 'lucide-react';
import { reportingService }  from '@/services/reporting.service';

const ITEMS = [
  { key: 'total',                    label: 'Total',               color: '#0e2235' },
  { key: 'open',                     label: 'Abiertos',            color: '#3b82f6' },
  { key: 'today',                    label: 'Hoy',                 color: '#22c55e' },
  { key: 'breach_active',            label: 'SLA en riesgo',       color: '#ef4444' },
  { key: 'avg_resolution_hours',     label: 'Avg. resolución (h)', color: '#f59e0b',  fmt: (v: string | null) => v ? Number(v).toFixed(1) : '—' },
  { key: 'avg_first_response_hours', label: '1ª respuesta (h)',    color: '#8b5cf6',  fmt: (v: string | null) => v ? Number(v).toFixed(1) : '—' },
  { key: 'escalation_rate',          label: 'Escalados (%)',        color: '#f97316', fmt: (v: string | null) => v != null ? `${Number(v).toFixed(1)}%` : '—' },
] as const;

export function HelpdeskKpiBar({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['helpdesk-metrics-mini', moduleId],
    queryFn:  () => reportingService.getHelpdeskMetrics(moduleId),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const kpis = data?.kpis;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Resumen operativo
        </span>
        <Link href="/helpdesk/reports" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#ff5e3a', textDecoration: 'none' }}>
          Reportes completos <ArrowRight size={11} />
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
        {ITEMS.map(item => {
          const rawVal = kpis?.[item.key as keyof typeof kpis] as string | null | undefined;
          const display = isLoading ? '…'
            : 'fmt' in item ? item.fmt(rawVal ?? null)
            : (rawVal ?? '—');

          return (
            <div key={item.key} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: item.color, lineHeight: 1 }}>
                {display}
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 5 }}>
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
