'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, X, Ticket, BarChart2, Clock, ChevronDown } from 'lucide-react';
import {
  type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
  TICKET_PRIORITY_ORDER,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import type { CurrentUser } from '@/types/user.types';
import type { TechAvailStatus } from '@/types/module.types';
import styles from '../tickets.module.css';
import { isToday, initials, Stars, type AssignedTicket } from './shared';
import { TechQueueItem, AvailabilityWidget } from './TechPanels';
import { CreateDrawer } from './CreateDrawer';

const AVAIL_COLORS = TECH_AVAIL_COLORS;
const AVAIL_LABELS = TECH_AVAIL_LABELS;
const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

/* ─────────────────── TechViewProps ─────────────────────────────────────── */

export interface TechViewProps {
  user:          CurrentUser;
  moduleId:      string;
  basePath:      string;
  moduleRole:    string;
  canCreate:     boolean;
  visualVariant?: 'helpdeskMockup' | 'default';
}

/* ─────────────────── TechView ───────────────────────────────────────────── */

export function TechView({ user, moduleId, basePath, moduleRole, canCreate, visualVariant = 'default' }: TechViewProps) {
  const router         = useRouter();
  const [showDrawer,   setShowDrawer]   = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);

  const { data: assigned, isLoading } = useQuery({
    queryKey: ['my-assigned-tickets', moduleId],
    queryFn:  () => usersService.getMyAssignedTickets(moduleId, 100),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const { data: techStats } = useQuery({
    queryKey: ['my-tech-stats', moduleId],
    queryFn:  () => usersService.getMyTechStats(moduleId),
    staleTime: 5 * 60_000,
  });

  const { data: availList } = useQuery({
    queryKey: ['my-availability', user.id],
    queryFn:  () => usersService.getMyAvailability(),
    staleTime: 60_000,
  });
  const myAvailStatus = ((availList?.find((a) => a.module_id === moduleId)?.status) ?? 'disponible') as TechAvailStatus;

  const { previous, today } = useMemo(() => {
    const all = assigned ?? [];
    const prev: AssignedTicket[] = [];
    const tod:  AssignedTicket[] = [];
    for (const t of all) {
      (isToday(t.created_at) ? tod : prev).push(t as AssignedTicket);
    }
    const byPriority = (a: AssignedTicket, b: AssignedTicket) =>
      PRIORITY_ORDER[a.priority as TicketPriority] - PRIORITY_ORDER[b.priority as TicketPriority];
    prev.sort(byPriority);
    tod.sort(byPriority);
    return { previous: prev, today: tod };
  }, [assigned]);

  const roleLabel  = MODULE_ROLE_LABELS[moduleRole as keyof typeof MODULE_ROLE_LABELS] ?? moduleRole;
  const fullName   = `${user.first_name} ${user.last_name}`;
  const avgRating  = parseFloat(String(techStats?.avg_rating ?? 0));
  const ratedCount = techStats?.rated_tickets ?? 0;

  const techStatCards = useMemo(() => {
    const all = (assigned ?? []) as AssignedTicket[];
    return [
      { label: 'Pendientes', value: all.filter((t) => !t.is_final).length,                   accent: '#ff5e3a' },
      { label: 'En proceso', value: all.filter((t) => t.state_name === 'en_proceso').length,  accent: '#3b82f6' },
      { label: 'Resueltos',  value: all.filter((t) => t.is_approval_state).length,            accent: '#20c933' },
      { label: 'En espera',  value: all.filter((t) => t.is_pause_state).length,               accent: '#f59e0b' },
      { label: 'Cerrados',   value: all.filter((t) => t.is_final).length,                    accent: '#64748b' },
      { label: 'Tareas',     value: all.filter((t) => t.assignment_role === 'owner').length,  accent: '#a855f7' },
    ];
  }, [assigned]);

  /* ── helpdeskMockup layout: no left profile panel, stats grid ── */
  if (visualVariant === 'helpdeskMockup') {
    return (
      <>
        <div className={styles.helpdeskAdminMain}>

          {/* ── Top row: availability + quick links ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 4 }}>
            {/* Availability widget */}
            <AvailabilityWidget userId={user.id} moduleId={moduleId} />

            {/* SLA urgency summary */}
            {(() => {
              const breached  = (assigned ?? []).filter(t => t.sla_status === 'breached').length;
              const critical  = (assigned ?? []).filter(t => {
                const h = t.sla_deadline_tracked ? (new Date(t.sla_deadline_tracked).getTime() - Date.now()) / 3_600_000 : null;
                return t.sla_status === 'active' && h !== null && h < 2;
              }).length;
              const color = breached > 0 ? '#ef4444' : critical > 0 ? '#f97316' : '#22c55e';
              const label = breached > 0 ? `${breached} vencido${breached > 1 ? 's' : ''}` : critical > 0 ? `${critical} crítico${critical > 1 ? 's' : ''}` : 'SLA al día';
              return (
                <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: `1.5px solid ${color}30`, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>SLA mis tickets</p>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
                    {label}
                  </span>
                  {breached === 0 && critical === 0 && (
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Todos en tiempo</span>
                  )}
                </div>
              );
            })()}

            {/* Quick links */}
            <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e8edf3', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: '0 0 2px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Accesos rápidos</p>
              <button type="button" onClick={() => router.push(`/helpdesk/tech/${user.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#0e2235', cursor: 'pointer', fontFamily: 'inherit' }}>
                Mi perfil operativo →
              </button>
              <button type="button" onClick={() => router.push('/helpdesk/sla')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#0e2235', cursor: 'pointer', fontFamily: 'inherit' }}>
                Ver SLA completo →
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div className={styles.helpdeskStatsGrid}>
            {techStatCards.map((card) => (
              <div key={card.label} className={styles.statCard}
                style={{ '--accent': card.accent } as React.CSSProperties}>
                <p className={styles.statCount}>{card.value}</p>
                <p className={styles.statLabel}>{card.label}</p>
              </div>
            ))}
          </div>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #f1f5f9', paddingBottom: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0e2235' }}>TICKETS ASIGNADOS</span>
            {canCreate && moduleId && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#ff5e3a', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(255,94,58,.25)' }}>
                <Plus size={12} /> Reportar Nuevo Incidente
              </button>
            )}
          </div>

          {isLoading ? (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Cargando cola de trabajo…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* ANTERIORES */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#e53e3e', textTransform: 'uppercase', letterSpacing: '.04em' }}>● ANTERIORES — VENCIDOS / ALTA PRIORIDAD</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{previous.length} tickets</span>
                </div>
                {previous.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 16, padding: '24px', textAlign: 'center', border: '1px solid #eef2f6', color: '#94a3b8', fontSize: 12 }}>Sin tickets anteriores</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {previous.map((t) => {
                      const pColor   = TICKET_PRIORITY_COLORS[t.priority as TicketPriority] ?? '#94a3b8';
                      const slaSt    = t.sla_status;
                      const slaColor = slaSt ? (SLA_STATUS_COLORS[slaSt as keyof typeof SLA_STATUS_COLORS] ?? null) : null;
                      const slaLabel = slaSt ? (SLA_STATUS_LABELS[slaSt as keyof typeof SLA_STATUS_LABELS] ?? null) : null;
                      const isBreached = t.sla_status === 'breached';
                      return (
                        <div key={t.id} className={styles.helpdeskCard}
                          style={isBreached ? { borderColor: '#fecaca', background: '#fff5f5' } : undefined}
                          onClick={() => router.push(`${basePath}/ticket/${t.id}`)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {t.creator_name ?? '?'}<ChevronDown size={9} style={{ color: '#94a3b8' }} />
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: `${pColor}15`, color: pColor, border: `1px solid ${pColor}40` }}>
                              {TICKET_PRIORITY_LABELS[t.priority as TicketPriority] ?? t.priority}
                            </span>
                          </div>
                          <h4 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 900, color: '#0e2235', lineHeight: 1.3 }}>{t.title}</h4>
                          <p style={{ margin: '0 0 10px', fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{t.category_name}{t.environment_name ? ` • ${t.environment_name}` : ''}</p>
                          {slaColor && slaLabel && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: `${slaColor}15`, color: slaColor, border: `1px solid ${slaColor}30`, marginBottom: 10 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: slaColor }} />{slaLabel}
                            </span>
                          )}
                          <div style={{ borderTop: '1px solid #eef2f6', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(14,34,53,.1)', color: '#0e2235', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(t.creator_name)}</div>
                              <div>
                                <p style={{ margin: '0 0 1px', fontSize: 10, fontWeight: 800, color: '#0e2235' }}>{t.creator_name}</p>
                                <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{fmtRelative(t.created_at)}</p>
                              </div>
                            </div>
                            <span style={{ fontSize: 10, background: '#0f172a', color: '#fff', fontWeight: 900, padding: '3px 9px', borderRadius: 6 }}>#{t.id.slice(-6).toUpperCase()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* HOY */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>● HOY — ACTUALES</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{today.length} tickets</span>
                </div>
                {today.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 16, padding: '28px', textAlign: 'center', border: '1px solid #eef2f6', color: '#94a3b8', fontSize: 12 }}>Sin tickets nuevos hoy</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {today.map((t) => {
                      const pColor = TICKET_PRIORITY_COLORS[t.priority as TicketPriority] ?? '#94a3b8';
                      return (
                        <div key={t.id} className={styles.helpdeskCard}
                          onClick={() => router.push(`${basePath}/ticket/${t.id}`)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {t.creator_name ?? '?'}<ChevronDown size={9} style={{ color: '#94a3b8' }} />
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: `${pColor}15`, color: pColor, border: `1px solid ${pColor}40` }}>
                              {TICKET_PRIORITY_LABELS[t.priority as TicketPriority] ?? t.priority}
                            </span>
                          </div>
                          <h4 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 900, color: '#0e2235', lineHeight: 1.3 }}>{t.title}</h4>
                          <p style={{ margin: '0 0 14px', fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{t.category_name}{t.environment_name ? ` • ${t.environment_name}` : ''}</p>
                          <div style={{ borderTop: '1px solid #eef2f6', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(14,34,53,.1)', color: '#0e2235', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(t.creator_name)}</div>
                              <div>
                                <p style={{ margin: '0 0 1px', fontSize: 10, fontWeight: 800, color: '#0e2235' }}>{t.creator_name}</p>
                                <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{fmtRelative(t.created_at)}</p>
                              </div>
                            </div>
                            <span style={{ fontSize: 10, background: '#0f172a', color: '#fff', fontWeight: 900, padding: '3px 9px', borderRadius: 6 }}>#{t.id.slice(-6).toUpperCase()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  const infoStyle: React.CSSProperties = { background: '#fff', padding: '14px', borderRadius: 14, border: '1px solid #e8edf3', fontSize: 11, color: '#475569', lineHeight: 1.6 };
  const groupHeader = (label: string, count: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={11} />{label}
      </span>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{count} ticket{count !== 1 ? 's' : ''}</span>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: profile panel */}
        <div style={{ width: 260, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #eef2f6', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>

          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 12px' }}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={fullName} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }}>
                  {initials(fullName)}
                </div>
              )}
              <span style={{ position: 'absolute', bottom: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: AVAIL_COLORS[myAvailStatus], border: '2px solid #f8fafc' }} title={AVAIL_LABELS[myAvailStatus]} />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: '#0e2235' }}>{fullName}</p>
            {user.username && <p style={{ margin: '0 0 10px', fontSize: 11, color: '#94a3b8' }}>@{user.username}</p>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Stars rating={avgRating} size={14} />
            </div>
          </div>

          <div style={infoStyle}>
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Rol en módulo</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#0e2235', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0, display: 'inline-block' }} />
              {roleLabel}
            </p>
            {user.job_title && (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Especialidad</p>
                <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 5 }}>
                  {user.job_title.toUpperCase()}
                </span>
              </>
            )}
          </div>

          <div style={{ ...infoStyle, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: '#0e2235' }}>{previous.length + today.length}</p>
              <p style={{ margin: 0, fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>Pendientes</p>
            </div>
            <div style={{ width: 1, background: '#e8edf3' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: '#0e2235' }}>{ratedCount}</p>
              <p style={{ margin: 0, fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>Calificados</p>
            </div>
          </div>

          <AvailabilityWidget userId={user.id} moduleId={moduleId} />
        </div>

        {/* Center: queue */}
        <div style={{ flex: 1, minWidth: 0, background: '#fff', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0e2235' }}>TICKETS ASIGNADOS</span>
            {canCreate && moduleId && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#ff5e3a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={11} /> Reportar Nuevo Incidente
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando cola de trabajo…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {previous.length > 0 && (
                <div>
                  {groupHeader('Tickets del Día Anterior · Prioritarios', previous.length, '#ff5e3a')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {previous.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                </div>
              )}
              <div>
                {groupHeader('Tickets del Día Actual', today.length, '#0e2235')}
                {today.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No hay tickets asignados para hoy</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {today.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                )}
              </div>
              {previous.length === 0 && today.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <Ticket size={36} style={{ color: '#e2e8f0' }} />
                  <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>No hay tickets asignados a ti en este módulo</p>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowDrawer(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#0e2235', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <BarChart2 size={13} style={{ color: '#ff5e3a' }} />
              Ver Rendimiento y Estadísticas
            </button>
          </div>
        </div>
      </div>

      {/* Performance drawer */}
      {showDrawer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.5)', zIndex: 40, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowDrawer(false)}>
          <div style={{ width: 360, background: '#fff', padding: '32px 28px', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,.12)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0e2235' }}>Rendimiento</h2>
              <button type="button" onClick={() => setShowDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Rating promedio', value: avgRating.toFixed(1), accent: '#f59e0b' },
                { label: 'Tickets calificados', value: String(ratedCount), accent: '#3b82f6' },
                { label: 'Pendientes hoy', value: String(today.length), accent: '#ff5e3a' },
                { label: 'Del día anterior', value: String(previous.length), accent: '#a855f7' },
              ].map((s) => (
                <div key={s.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '16px', border: `2px solid ${s.accent}22` }}>
                  <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: s.accent }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e8edf3' }}>
              <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.06em' }}>Calificación general</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Stars rating={avgRating} size={16} />
              </div>
              {ratedCount === 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8' }}>Aún no tienes tickets calificados en este módulo</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}
