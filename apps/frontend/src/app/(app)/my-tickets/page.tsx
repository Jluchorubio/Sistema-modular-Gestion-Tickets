'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Ticket, ArrowLeft, ChevronRight } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, SLA_STATUS_COLORS, SLA_STATUS_LABELS, TICKET_PRIORITY_ORDER } from '@/services/tickets.service';
import { fmtRelativeCompact } from '@/lib/formatters';

type Tab = 'created' | 'assigned';

const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

function ticketHref(moduleSlug: string | null, ticketId: string) {
  if (moduleSlug) return `/${moduleSlug}/ticket/${ticketId}`;
  return `/helpdesk/ticket/${ticketId}`;
}

function PriorityDot({ priority }: { priority: string }) {
  const color = (TICKET_PRIORITY_COLORS as Record<string, string>)[priority] ?? '#94a3b8';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

interface TicketRowItem {
  id: string;
  title: string;
  priority: string;
  created_at: string;
  updated_at: string;
  module_name: string;
  module_slug: string | null;
  state_label: string;
  is_final: boolean;
  sla_status: string | null;
  sla_deadline_tracked: string | null;
  assignment_role?: string;
}

function TicketRow({ t, onClick }: { t: TicketRowItem; onClick: () => void }) {
  const pColor   = (TICKET_PRIORITY_COLORS as Record<string, string>)[t.priority] ?? '#94a3b8';
  const pLabel   = (TICKET_PRIORITY_LABELS as Record<string, string>)[t.priority] ?? t.priority;
  const slaColor = t.sla_status ? ((SLA_STATUS_COLORS as Record<string, string>)[t.sla_status] ?? '#94a3b8') : null;
  const slaLabel = t.sla_status ? ((SLA_STATUS_LABELS as Record<string, string>)[t.sla_status] ?? null) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '13px 18px',
        cursor: 'pointer',
        borderRadius: 10,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
        {/* Priority dot */}
        <div style={{ marginTop: 4, flexShrink: 0 }}>
          <PriorityDot priority={t.priority} />
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 13.5, fontWeight: 600, color: '#0f172a', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {t.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>{t.module_name}</span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtRelativeCompact(t.updated_at)}</span>
            {t.assignment_role && (
              <>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
                <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t.assignment_role}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {/* SLA badge */}
        {slaLabel && slaColor && !t.is_final && (
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 99,
            background: `${slaColor}18`, color: slaColor,
            display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
          }}>
            <Clock size={9} />
            {slaLabel}
          </span>
        )}

        {/* Priority badge */}
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
          background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`,
        }}>
          {pLabel}
        </span>

        {/* State badge */}
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
          background: t.is_final ? '#22c55e18' : '#6366f118',
          color:      t.is_final ? '#22c55e'   : '#6366f1',
          border:     `1px solid ${t.is_final ? '#22c55e30' : '#6366f130'}`,
          whiteSpace: 'nowrap',
        }}>
          {t.state_label}
        </span>

        <ChevronRight size={14} style={{ color: '#cbd5e1' }} />
      </div>
    </div>
  );
}

export default function MyTicketsPage() {
  const router   = useRouter();
  const [tab, setTab] = useState<Tab>('assigned');

  const { data: created, isLoading: loadingCreated } = useQuery({
    queryKey: ['my-created-tickets'],
    queryFn:  () => usersService.getMyRecentTickets(100),
    staleTime: 60_000,
  });

  const { data: assigned, isLoading: loadingAssigned } = useQuery({
    queryKey: ['my-assigned-tickets'],
    queryFn:  () => usersService.getMyAssignedTickets(undefined, 100),
    staleTime: 60_000,
  });

  const sortedCreated = useMemo(
    () => [...(created ?? [])].sort((a, b) =>
      ((PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9) - ((PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9),
    ),
    [created],
  );

  const sortedAssigned = useMemo(
    () => [...(assigned ?? [])].sort((a, b) =>
      ((PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9) - ((PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9),
    ),
    [assigned],
  );

  const activeList = tab === 'assigned' ? sortedAssigned : sortedCreated;
  const isLoading  = tab === 'assigned' ? loadingAssigned : loadingCreated;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
    background: active ? '#0e2235' : 'transparent',
    color:      active ? '#fff'    : '#64748b',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            gap: 6, fontSize: 13, color: '#475569', fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={14} /> Volver
        </button>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(255,94,58,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ticket size={15} style={{ color: '#ff5e3a' }} />
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: '#0d1b2a', margin: 0 }}>
              Cola de trabajo
            </h1>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0 38px' }}>
            Tickets activos que requieren tu atención
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10,
        padding: 4, marginBottom: 16, width: 'fit-content',
      }}>
        <button type="button" style={tabStyle(tab === 'assigned')} onClick={() => setTab('assigned')}>
          Asignados a mí
          {!loadingAssigned && (
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700,
              background: tab === 'assigned' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
              color:      tab === 'assigned' ? '#fff' : '#64748b',
              borderRadius: 99, padding: '1px 6px',
            }}>
              {sortedAssigned.length}
            </span>
          )}
        </button>
        <button type="button" style={tabStyle(tab === 'created')} onClick={() => setTab('created')}>
          Creados por mí
          {!loadingCreated && (
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700,
              background: tab === 'created' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
              color:      tab === 'created' ? '#fff' : '#64748b',
              borderRadius: 99, padding: '1px 6px',
            }}>
              {sortedCreated.length}
            </span>
          )}
        </button>
      </div>

      {/* List */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8edf3', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Cargando…
          </div>
        )}

        {!isLoading && activeList.length === 0 && (
          <div style={{ padding: '52px 24px', textAlign: 'center' }}>
            <Ticket size={32} style={{ color: '#cbd5e1', marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              {tab === 'assigned'
                ? 'No tienes tickets asignados activos.'
                : 'No has creado ningún ticket.'}
            </p>
          </div>
        )}

        {!isLoading && activeList.map((t, i) => (
          <div key={t.id} style={{ borderBottom: i < activeList.length - 1 ? '1px solid #f1f5f9' : undefined }}>
            <TicketRow
              t={t}
              onClick={() => router.push(ticketHref(t.module_slug, t.id))}
            />
          </div>
        ))}
      </div>

      {!isLoading && activeList.length > 0 && (
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, textAlign: 'right' }}>
          {activeList.length} ticket{activeList.length !== 1 ? 's' : ''} · ordenados por prioridad
        </p>
      )}
    </div>
  );
}
