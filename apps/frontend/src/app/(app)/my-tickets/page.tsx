'use client';

import { useState, useMemo }                     from 'react';
import { useQuery }                               from '@tanstack/react-query';
import { useRouter }                              from 'next/navigation';
import { Clock, Ticket, ChevronRight, CheckCircle2 } from 'lucide-react';
import { usersService }                           from '@/services/users.service';
import { TICKET_PRIORITY_ORDER }                  from '@/services/tickets.service';
import { getPriorityConfig, getSlaStatusConfig }  from '@/constants/status';
import { fmtRelativeCompact }                     from '@/lib/formatters';
import { ContextNav }                             from '@/components/ui/ContextNav';
import styles                                     from './my-tickets.module.css';

/* ── Types ────────────────────────────────────────────────────────────────── */

type Tab = 'created' | 'assigned';

const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

function ticketHref(moduleSlug: string | null, ticketId: string) {
  if (moduleSlug) return `/${moduleSlug}/ticket/${ticketId}`;
  return `/helpdesk/ticket/${ticketId}`;
}

interface TicketRowItem {
  id:                       string;
  title:                    string;
  priority:                 string;
  created_at:               string;
  updated_at:               string;
  module_name:              string;
  module_slug:              string | null;
  state_label:              string;
  is_final:                 boolean;
  is_pause_state:           boolean;
  is_approval_state:        boolean;
  sla_status?:              string | null;
  sla_deadline_tracked?:    string | null;
  approval_expires_at?:     string | null;
  assignment_role?:         string;
  last_transition_reason?:  string | null;
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function GroupHeader({ label, accent, cls }: { label: string; accent: string; cls?: string }) {
  return (
    <div className={`${styles.groupHead} ${cls ?? ''}`}>
      <span className={styles.groupHeadLabel} style={{ color: accent }}>{label}</span>
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
  const pCfg    = getPriorityConfig(t.priority);
  const pColor  = pCfg.color;
  const pLabel  = pCfg.label;
  const slaCfg  = t.sla_status ? getSlaStatusConfig(t.sla_status) : null;
  const slaLabel = slaCfg?.label ?? null;

  return (
    <div
      className={`${styles.ticketRow} ${isApproval ? styles.ticketRowApproval : ''}`}
      style={{ borderLeft: `3px solid ${isApproval ? '#22c55e' : pColor}` }}
      onClick={onClick}
    >
      {/* Left */}
      <div className={styles.ticketLeft}>
        <div className={styles.ticketIndicator}>
          {isApproval
            ? <CheckCircle2 size={13} style={{ color: '#22c55e' }} />
            : <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pColor }} />
          }
        </div>

        <div className={styles.ticketBody}>
          <p className={`${styles.ticketTitle} ${isApproval ? styles.ticketTitleApproval : ''}`}>
            {t.title}
          </p>
          <div className={styles.ticketMeta}>
            {isApproval && (
              <span className={styles.metaBadgeGreen}>Revisa y califica</span>
            )}
            <span className={styles.metaModule}>{t.module_name}</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaTime}>{fmtRelativeCompact(t.updated_at)}</span>
            {t.is_pause_state && t.last_transition_reason && (
              <>
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaPause}>⏸ {t.last_transition_reason}</span>
              </>
            )}
            {t.assignment_role && !isApproval && (
              <>
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaRole}>{t.assignment_role}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right — badges */}
      <div className={styles.ticketRight}>
        {slaLabel && slaCfg && !t.is_final && !t.is_approval_state && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: slaCfg.bg, color: slaCfg.text, border: `1px solid ${slaCfg.border}`, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
            <Clock size={9} />{slaLabel}
          </span>
        )}
        {!isApproval && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: `color-mix(in srgb, ${pColor} 15%, transparent)`, color: pColor, border: `1px solid color-mix(in srgb, ${pColor} 25%, transparent)` }}>
            {pLabel}
          </span>
        )}
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap',
          background: (t.is_final || isApproval) ? 'var(--status-success-bg)' : 'var(--status-info-bg)',
          color:      (t.is_final || isApproval) ? 'var(--status-success-text)' : 'var(--status-info-text)',
          border:     `1px solid ${(t.is_final || isApproval) ? 'var(--status-success-border)' : 'var(--status-info-border)'}`,
        }}>
          {t.state_label}
        </span>
        {isApproval
          ? <span className={styles.approvalCta}>Ir →</span>
          : <ChevronRight size={14} style={{ color: '#cbd5e1' }} />
        }
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function MyTicketsPage() {
  const router        = useRouter();
  const [tab, setTab] = useState<Tab>('created');

  const { data: created, isLoading: loadingCreated, isError: errorCreated, refetch: refetchCreated } = useQuery({
    queryKey:  ['my-created-tickets'],
    queryFn:   () => usersService.getMyRecentTickets(100),
    staleTime: 60_000,
  });

  const { data: assigned, isLoading: loadingAssigned, isError: errorAssigned, refetch: refetchAssigned } = useQuery({
    queryKey:  ['my-assigned-tickets'],
    queryFn:   () => usersService.getMyAssignedTickets(undefined, 100),
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
      closed:   all.filter(t => t.is_final)
                   .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                   .slice(0, 10),
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

  return (
    <div className={styles.pageWrap}>

      <ContextNav
        back
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Mis Tickets' },
        ]}
      />

      <div className={styles.pageContent}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <div className={styles.iconBadge}>
                <Ticket size={15} style={{ color: '#ff5e3a' }} />
              </div>
              <h1 className={styles.title}>Mis Tickets</h1>
            </div>
            <p className={styles.subtitle}>Incidentes y solicitudes registrados</p>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === 'created' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('created')}
          >
            Reportados por mí
            {!loadingCreated && (
              <span className={`${styles.tabCount} ${tab !== 'created' ? styles.tabCountInactive : ''}`}>
                {(created ?? []).length}
              </span>
            )}
            {pendingApproval > 0 && (
              <span className={styles.tabAlert}>{pendingApproval}</span>
            )}
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${tab === 'assigned' ? styles.tabBtnActive : ''}`}
            onClick={() => setTab('assigned')}
          >
            Asignados a mí
            {!loadingAssigned && (
              <span className={`${styles.tabCount} ${tab !== 'assigned' ? styles.tabCountInactive : ''}`}>
                {(assigned ?? []).length}
              </span>
            )}
          </button>
        </div>

        {/* ══ CREATED TAB ══ */}
        {tab === 'created' && (
          <div className={styles.lists}>
            {loadingCreated && <div className={styles.loadCard}>Cargando…</div>}
            {!loadingCreated && errorCreated && (
              <div className={styles.emptyCard} style={{ borderColor: '#fecaca' }}>
                <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>Error al cargar tickets.</p>
                <button type="button" onClick={() => refetchCreated()} style={{ fontSize: 11, color: '#ff5e3a', background: 'none', border: '1px solid #ff5e3a', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
              </div>
            )}

            {/* Action required — approval */}
            {!loadingCreated && createdGroups.approval.length > 0 && (
              <div className={`${styles.group} ${styles.groupApproval}`}>
                <div className={`${styles.groupHead} ${styles.groupHeadApproval}`}>
                  <CheckCircle2 size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <span className={`${styles.groupHeadLabel} ${styles.colorGreen}`}>
                    Solución aplicada — revisa y califica ({createdGroups.approval.length})
                  </span>
                  <span className={styles.groupHeadAction}>Acepta o reabre →</span>
                </div>
                {createdGroups.approval.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    onClick={() => router.push(ticketHref(t.module_slug, t.id))}
                    isApproval
                  />
                ))}
              </div>
            )}

            {/* Active */}
            {!loadingCreated && createdGroups.active.length > 0 && (
              <div className={styles.group}>
                <GroupHeader
                  label={`En proceso — ${createdGroups.active.length}`}
                  accent="#0e2235"
                />
                {createdGroups.active.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    onClick={() => router.push(ticketHref(t.module_slug, t.id))}
                  />
                ))}
              </div>
            )}

            {/* Closed recent */}
            {!loadingCreated && createdGroups.closed.length > 0 && (
              <div className={styles.group}>
                <GroupHeader
                  label={`Cerrados recientes — ${createdGroups.closed.length}`}
                  accent="#64748b"
                />
                {createdGroups.closed.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    onClick={() => router.push(ticketHref(t.module_slug, t.id))}
                  />
                ))}
              </div>
            )}

            {!loadingCreated && !createdGroups.approval.length && !createdGroups.active.length && !createdGroups.closed.length && (
              <div className={styles.emptyCard}>
                <Ticket size={32} className={styles.emptyIcon} />
                <p className={styles.emptyText}>No has reportado ningún ticket.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ ASSIGNED TAB ══ */}
        {tab === 'assigned' && (
          <div className={styles.lists}>
            {loadingAssigned && <div className={styles.loadCard}>Cargando…</div>}
            {!loadingAssigned && errorAssigned && (
              <div className={styles.emptyCard} style={{ borderColor: '#fecaca' }}>
                <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px' }}>Error al cargar tickets asignados.</p>
                <button type="button" onClick={() => refetchAssigned()} style={{ fontSize: 11, color: '#ff5e3a', background: 'none', border: '1px solid #ff5e3a', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
              </div>
            )}

            {/* Waiting user approval */}
            {!loadingAssigned && assignedGroups.approval.length > 0 && (
              <div className={`${styles.group} ${styles.groupWaiting}`}>
                <div className={`${styles.groupHead} ${styles.groupHeadWaiting}`}>
                  <CheckCircle2 size={13} style={{ color: '#92400e', flexShrink: 0 }} />
                  <span className={`${styles.groupHeadLabel} ${styles.colorAmber}`}>
                    Esperando aprobación del usuario — {assignedGroups.approval.length}
                  </span>
                </div>
                {assignedGroups.approval.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    onClick={() => router.push(ticketHref(t.module_slug, t.id))}
                  />
                ))}
              </div>
            )}

            {/* Active assigned */}
            {!loadingAssigned && assignedGroups.active.length > 0 && (
              <div className={styles.group}>
                <GroupHeader
                  label={`Activos — ${assignedGroups.active.length}`}
                  accent="#0e2235"
                />
                {assignedGroups.active.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    onClick={() => router.push(ticketHref(t.module_slug, t.id))}
                  />
                ))}
              </div>
            )}

            {!loadingAssigned && !assignedGroups.approval.length && !assignedGroups.active.length && (
              <div className={styles.emptyCard}>
                <Ticket size={32} className={styles.emptyIcon} />
                <p className={styles.emptyText}>No tienes tickets asignados activos.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
