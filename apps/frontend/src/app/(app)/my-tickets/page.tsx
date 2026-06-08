'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Clock, Ticket, ArrowLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { usersService } from '@/services/users.service';
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, SLA_STATUS_COLORS, SLA_STATUS_LABELS, TICKET_PRIORITY_ORDER } from '@/services/tickets.service';
import { fmtRelativeCompact } from '@/lib/formatters';

type Tab = 'created' | 'assigned';

const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

function ticketHref(moduleSlug: string | null, ticketId: string) {
  if (moduleSlug) return `/${moduleSlug}/ticket/${ticketId}`;
  return `/helpdesk/ticket/${ticketId}`;
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
  is_pause_state: boolean;
  is_approval_state: boolean;
  sla_status: string | null;
  sla_deadline_tracked: string | null;
  approval_expires_at?: string | null;
  assignment_role?: string;
  last_transition_reason?: string | null;
}

function GroupHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{ padding: '9px 18px 7px', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '.07em' }}>
        {label}
      </span>
    </div>
  );
}

function TicketRow({
  t, onClick, isApproval,
}: {
  t: TicketRowItem;
  onClick: () => void;
  isApproval?: boolean;
}) {
  const pColor   = (TICKET_PRIORITY_COLORS as Record<string, string>)[t.priority] ?? '#94a3b8';
  const pLabel   = (TICKET_PRIORITY_LABELS as Record<string, string>)[t.priority] ?? t.priority;
  const slaColor = t.sla_status ? ((SLA_STATUS_COLORS as Record<string, string>)[t.sla_status] ?? null) : null;
  const slaLabel = t.sla_status ? ((SLA_STATUS_LABELS as Record<string, string>)[t.sla_status] ?? null) : null;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        cursor: 'pointer',
        borderLeft: `3px solid ${isApproval ? '#22c55e' : pColor}`,
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = isApproval ? '#f0fdf4' : '#f8fafc'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
        <div style={{ marginTop: 3, flexShrink: 0 }}>
          {isApproval
            ? <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
            : <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pColor }} />
          }
        </div>

        <div style={{ minWidth: 0 }}>
          <p style={{
            fontSize: 13.5, fontWeight: isApproval ? 700 : 600,
            color: isApproval ? '#15803d' : '#0f172a',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {t.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            {isApproval && (
              <span style={{ fontSize: 10, fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 5 }}>
                Revisa y califica
              </span>
            )}
            <span style={{ fontSize: 11, color: '#64748b' }}>{t.module_name}</span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtRelativeCompact(t.updated_at)}</span>
            {t.is_pause_state && t.last_transition_reason && (
              <><span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
              <span style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>⏸ {t.last_transition_reason}</span></>
            )}
            {t.assignment_role && !isApproval && (
              <><span style={{ fontSize: 11, color: '#cbd5e1' }}>·</span>
              <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {t.assignment_role}
              </span></>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
        {slaLabel && slaColor && !t.is_final && !t.is_approval_state && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${slaColor}18`, color: slaColor, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
            <Clock size={9} />{slaLabel}
          </span>
        )}
        {!isApproval && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30` }}>
            {pLabel}
          </span>
        )}
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap',
          background: t.is_final ? '#22c55e18' : isApproval ? '#22c55e18' : '#6366f118',
          color:      t.is_final ? '#22c55e'   : isApproval ? '#22c55e'   : '#6366f1',
          border:     `1px solid ${t.is_final ? '#22c55e30' : isApproval ? '#22c55e30' : '#6366f130'}`,
        }}>
          {t.state_label}
        </span>
        {isApproval
          ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>Ir →</span>
          : <ChevronRight size={14} style={{ color: '#cbd5e1' }} />
        }
      </div>
    </div>
  );
}

export default function MyTicketsPage() {
  const router      = useRouter();
  const [tab, setTab] = useState<Tab>('created');

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

  const createdGroups = useMemo(() => {
    const all = (created ?? []) as TicketRowItem[];
    const sortByPriority = (a: TicketRowItem, b: TicketRowItem) =>
      ((PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9)
      - ((PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9);
    return {
      approval: all.filter(t => t.is_approval_state),
      active:   all.filter(t => !t.is_approval_state && !t.is_final).sort(sortByPriority),
      closed:   all.filter(t => t.is_final).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10),
    };
  }, [created]);

  const assignedGroups = useMemo(() => {
    const all = (assigned ?? []) as TicketRowItem[];
    const sortByPriority = (a: TicketRowItem, b: TicketRowItem) =>
      ((PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9)
      - ((PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9);
    return {
      approval: all.filter(t => t.is_approval_state),
      active:   all.filter(t => !t.is_approval_state && !t.is_final).sort(sortByPriority),
    };
  }, [assigned]);

  const pendingApproval = createdGroups.approval.length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: 'inherit',
    background: active ? '#0e2235' : 'transparent',
    color:      active ? '#fff'    : '#64748b',
    transition: 'all 0.15s',
    position: 'relative',
  });

  function Group({ children, border, bg }: { children: React.ReactNode; border: string; bg: string }) {
    return (
      <div style={{ background: bg, borderRadius: 14, border: `1.5px solid ${border}`, overflow: 'hidden' }}>
        {children}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button type="button" onClick={() => router.back()}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', fontFamily: 'inherit' }}>
          <ArrowLeft size={14} /> Volver
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,94,58,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ticket size={15} style={{ color: '#ff5e3a' }} />
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: '#0d1b2a', margin: 0 }}>Mis tickets</h1>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0 38px' }}>
            Incidentes y solicitudes registrados
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        <button type="button" style={tabStyle(tab === 'created')} onClick={() => setTab('created')}>
          Reportados por mí
          {!loadingCreated && (
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, background: tab === 'created' ? 'rgba(255,255,255,0.2)' : '#e2e8f0', color: tab === 'created' ? '#fff' : '#64748b', borderRadius: 99, padding: '1px 6px' }}>
              {(created ?? []).length}
            </span>
          )}
          {pendingApproval > 0 && (
            <span style={{ marginLeft: 3, fontSize: 10, fontWeight: 800, background: '#22c55e', color: '#fff', borderRadius: 99, padding: '1px 5px' }}>
              {pendingApproval}
            </span>
          )}
        </button>
        <button type="button" style={tabStyle(tab === 'assigned')} onClick={() => setTab('assigned')}>
          Asignados a mí
          {!loadingAssigned && (
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, background: tab === 'assigned' ? 'rgba(255,255,255,0.2)' : '#e2e8f0', color: tab === 'assigned' ? '#fff' : '#64748b', borderRadius: 99, padding: '1px 6px' }}>
              {(assigned ?? []).length}
            </span>
          )}
        </button>
      </div>

      {/* ── CREATED ── */}
      {tab === 'created' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingCreated && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8edf3', padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Cargando…
            </div>
          )}

          {/* ACTION REQUIRED — approval pending */}
          {!loadingCreated && createdGroups.approval.length > 0 && (
            <Group border="#bbf7d0" bg="#f0fdf4">
              <div style={{ padding: '11px 18px', borderBottom: '1.5px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  Solución aplicada — revisa y califica ({createdGroups.approval.length})
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Acepta o reabre →
                </span>
              </div>
              {createdGroups.approval.map((t, i) => (
                <div key={t.id} style={{ borderBottom: i < createdGroups.approval.length - 1 ? '1px solid #dcfce7' : undefined }}>
                  <TicketRow t={t} onClick={() => router.push(ticketHref(t.module_slug, t.id))} isApproval />
                </div>
              ))}
            </Group>
          )}

          {!loadingCreated && createdGroups.active.length > 0 && (
            <Group border="#e8edf3" bg="#fff">
              <GroupHeader label={`En proceso — ${createdGroups.active.length}`} accent="#0e2235" />
              {createdGroups.active.map((t, i) => (
                <div key={t.id} style={{ borderBottom: i < createdGroups.active.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                  <TicketRow t={t} onClick={() => router.push(ticketHref(t.module_slug, t.id))} />
                </div>
              ))}
            </Group>
          )}

          {!loadingCreated && createdGroups.closed.length > 0 && (
            <Group border="#e8edf3" bg="#fff">
              <GroupHeader label={`Cerrados recientes — ${createdGroups.closed.length}`} accent="#64748b" />
              {createdGroups.closed.map((t, i) => (
                <div key={t.id} style={{ borderBottom: i < createdGroups.closed.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                  <TicketRow t={t} onClick={() => router.push(ticketHref(t.module_slug, t.id))} />
                </div>
              ))}
            </Group>
          )}

          {!loadingCreated && !createdGroups.approval.length && !createdGroups.active.length && !createdGroups.closed.length && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8edf3', padding: '52px 24px', textAlign: 'center' }}>
              <Ticket size={32} style={{ color: '#cbd5e1', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No has reportado ningún ticket.</p>
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNED ── */}
      {tab === 'assigned' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingAssigned && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8edf3', padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Cargando…
            </div>
          )}

          {/* Waiting user approval */}
          {!loadingAssigned && assignedGroups.approval.length > 0 && (
            <Group border="#fde68a" bg="#fffbeb">
              <div style={{ padding: '11px 18px', borderBottom: '1.5px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={14} style={{ color: '#92400e', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  Esperando aprobación del usuario — {assignedGroups.approval.length}
                </span>
              </div>
              {assignedGroups.approval.map((t, i) => (
                <div key={t.id} style={{ borderBottom: i < assignedGroups.approval.length - 1 ? '1px solid #fef3c7' : undefined }}>
                  <TicketRow t={t} onClick={() => router.push(ticketHref(t.module_slug, t.id))} />
                </div>
              ))}
            </Group>
          )}

          {!loadingAssigned && assignedGroups.active.length > 0 && (
            <Group border="#e8edf3" bg="#fff">
              <GroupHeader label={`Activos — ${assignedGroups.active.length}`} accent="#0e2235" />
              {assignedGroups.active.map((t, i) => (
                <div key={t.id} style={{ borderBottom: i < assignedGroups.active.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                  <TicketRow t={t} onClick={() => router.push(ticketHref(t.module_slug, t.id))} />
                </div>
              ))}
            </Group>
          )}

          {!loadingAssigned && !assignedGroups.approval.length && !assignedGroups.active.length && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8edf3', padding: '52px 24px', textAlign: 'center' }}>
              <Ticket size={32} style={{ color: '#cbd5e1', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No tienes tickets asignados activos.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
