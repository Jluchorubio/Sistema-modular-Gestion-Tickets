'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import { ticketsService } from '@/services/tickets.service';
import { PRIORITY_CONFIG } from '@/constants/status';

function minuteLabel(minutes: number): string {
  if (minutes < 1)  return 'menos de 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function SlaAtRiskPanel() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['sla-at-risk'],
    queryFn:  () => ticketsService.getSlaAtRisk(undefined, 2),
    refetchInterval: 3 * 60_000, // refresh every 3 min
    staleTime: 60_000,
  });

  if (isLoading || tickets.length === 0) return null;

  return (
    <div style={{
      background: '#fff7ed',
      border: '1.5px solid #fed7aa',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AlertTriangle size={15} style={{ color: '#f97316', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SLA en riesgo — próximos a vencer ({tickets.length})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tickets.map(t => {
          const pc  = PRIORITY_CONFIG[t.priority];
          const min = t.minutes_left;
          const urgent = min < 30;
          return (
            <Link key={t.ticket_id} href={`/helpdesk/ticket/${t.ticket_id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', borderRadius: 9,
                background: urgent ? '#fff1f0' : '#fff',
                border: `1px solid ${urgent ? '#fca5a5' : '#fed7aa'}`,
                cursor: 'pointer',
              }}>
                <div style={{ width: 3, height: 30, borderRadius: 2, background: pc?.color ?? '#94a3b8', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                    {t.module_name}{t.assignee_name ? ` · ${t.assignee_name}` : ' · Sin asignar'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <Clock size={11} style={{ color: urgent ? '#ef4444' : '#f97316' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: urgent ? '#ef4444' : '#f97316' }}>
                    {minuteLabel(min)}
                  </span>
                </div>
                {pc && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: `${pc.color}18`, color: pc.color, border: `1px solid ${pc.color}40`,
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {t.priority}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
