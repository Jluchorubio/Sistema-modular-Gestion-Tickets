'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { fmtDate } from '@/lib/formatters';
import { TICKET_PRIORITY_COLORS as PRIORITY_COLOR } from '@/services/tickets.service';

export default function MyTicketsPage() {
  const router = useRouter();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['my-all-tickets'],
    queryFn:  () => usersService.getMyRecentTickets(100),
    staleTime: 60_000,
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'none', border: '1px solid #E2E8F0', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 6, fontSize: 13, color: '#475569',
          }}
        >
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Mis tickets</h1>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
            {tickets ? `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}` : '—'}
          </p>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EDF3', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            Cargando…
          </div>
        )}

        {!isLoading && (!tickets || tickets.length === 0) && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
            No has creado ningún ticket todavía.
          </div>
        )}

        {tickets && tickets.length > 0 && tickets.map((t, i) => {
          const pColor = (PRIORITY_COLOR as Record<string, string>)[t.priority] ?? '#94A3B8';
          return (
            <div
              key={t.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 22px', gap: 16,
                borderBottom: i < tickets.length - 1 ? '1px solid #F1F5F9' : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 13.5, fontWeight: 500, color: '#0F172A', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {t.title}
                </p>
                <p style={{ fontSize: 11.5, color: '#94A3B8', margin: '3px 0 0' }}>
                  {t.module_name} · {fmtDate(t.created_at)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: `${pColor}22`, color: pColor, border: `1px solid ${pColor}44`,
                }}>
                  {t.priority}
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: t.is_final ? '#22C55E22' : '#6366F122',
                  color: t.is_final ? '#22C55E' : '#6366F1',
                  border: `1px solid ${t.is_final ? '#22C55E44' : '#6366F144'}`,
                }}>
                  {t.state_label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
