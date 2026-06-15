'use client';

import Link from 'next/link';
import { AlertTriangle, Clock, FileText, Ticket, ArrowRight } from 'lucide-react';
import { MetricCard } from '@/components/ui/MetricCard';
import { fmtRelative } from '@/lib/formatters';
import { getPriorityConfig, getRequestStatusConfig, getTicketPortalState } from '@/constants/status';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

type OpsData = {
  urgent_tickets:    number;
  sla_breached:      number;
  sla_at_risk:       number;
  pending_approvals: number;
  recent_tickets: {
    id: string; title: string; priority: string; created_at: string;
    state_label: string; is_final: boolean; is_approval_state: boolean; is_pause_state: boolean;
    created_by_name: string;
  }[];
  recent_requests: {
    id: string; title: string; status: string; priority: string;
    created_at: string; requester_name: string;
  }[];
};



function RecentTicket({ t }: { t: OpsData['recent_tickets'][0] }) {
  const pc = getPriorityConfig(t.priority).color;
  const sc = getTicketPortalState(t);
  return (
    <Link href={`/helpdesk/ticket/${t.id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderRadius: 9, background: '#fff', border: `1px solid ${C.border}`,
        marginBottom: 6, cursor: 'pointer',
      }}>
        <div style={{ width: 3, height: 32, borderRadius: 2, background: pc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.title}
          </p>
          <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>
            {t.created_by_name} · {fmtRelative(t.created_at)}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
          flexShrink: 0,
        }}>
          {t.state_label}
        </span>
      </div>
    </Link>
  );
}

function RecentRequest({ r }: { r: OpsData['recent_requests'][0] }) {
  const pc  = getPriorityConfig(r.priority).color;
  const sc  = getRequestStatusConfig(r.status);
  return (
    <Link href={`/requests`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderRadius: 9, background: '#fff', border: `1px solid ${C.border}`,
        marginBottom: 6, cursor: 'pointer',
      }}>
        <div style={{ width: 3, height: 32, borderRadius: 2, background: pc, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.title}
          </p>
          <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>
            {r.requester_name} · {fmtRelative(r.created_at)}
          </p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
          flexShrink: 0,
        }}>
          {sc.label}
        </span>
      </div>
    </Link>
  );
}

export function DashboardOpsPanel({ ops }: { ops: OpsData }) {
  const hasTickets  = ops.recent_tickets.length  > 0;
  const hasRequests = ops.recent_requests.length > 0;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* KPI chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginBottom: 20 }}>
        <MetricCard icon={<AlertTriangle size={16} />} label="Tickets urgentes / críticos" value={ops.urgent_tickets} href="/helpdesk/queue" warn size="sm" />
        <MetricCard icon={<Clock        size={16} />} label="SLA incumplidos"              value={ops.sla_breached}   href="/helpdesk/sla"   warn size="sm" />
        <MetricCard icon={<Clock        size={16} />} label="SLA en riesgo (< 2h)"         value={ops.sla_at_risk}    href="/helpdesk/sla"   warn size="sm" />
        <MetricCard icon={<FileText     size={16} />} label="Solicitudes pendientes"        value={ops.pending_approvals} href="/requests"   warn size="sm" />
      </div>

      {/* Recent activity columns */}
      {(hasTickets || hasRequests) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Recent tickets */}
          <div style={{ background: C.bg, borderRadius: 12, padding: '16px 16px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ticket size={13} style={{ color: C.coral }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Tickets recientes</span>
              </div>
              <Link href="/helpdesk/queue" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.coral, textDecoration: 'none', fontWeight: 600 }}>
                Ver todos <ArrowRight size={11} />
              </Link>
            </div>
            {hasTickets
              ? ops.recent_tickets.map(t => <RecentTicket key={t.id} t={t} />)
              : <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '12px 0', margin: 0 }}>Sin actividad reciente</p>
            }
          </div>

          {/* Recent requests */}
          <div style={{ background: C.bg, borderRadius: 12, padding: '16px 16px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} style={{ color: C.coral }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Solicitudes recientes</span>
              </div>
              <Link href="/requests" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.coral, textDecoration: 'none', fontWeight: 600 }}>
                Ver todas <ArrowRight size={11} />
              </Link>
            </div>
            {hasRequests
              ? ops.recent_requests.map(r => <RecentRequest key={r.id} r={r} />)
              : <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '12px 0', margin: 0 }}>Sin actividad reciente</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}
