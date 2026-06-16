'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, X, Ticket, BarChart2, Clock } from 'lucide-react';
import {
  type TicketPriority,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
  TICKET_PRIORITY_ORDER,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import type { CurrentUser } from '@/types/user.types';
import type { TechAvailStatus } from '@/types/module.types';
import styles from '../../tickets.module.css';
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

  const { data: assigned, isLoading, isError, refetch } = useQuery({
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
    const byPriority = (a: AssignedTicket, b: AssignedTicket) => {
      const pDiff = PRIORITY_ORDER[a.priority as TicketPriority] - PRIORITY_ORDER[b.priority as TicketPriority];
      if (pDiff !== 0) return pDiff;
      const aD = a.sla_deadline_tracked ? new Date(a.sla_deadline_tracked).getTime() : Infinity;
      const bD = b.sla_deadline_tracked ? new Date(b.sla_deadline_tracked).getTime() : Infinity;
      return aD - bD;
    };
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
                <div style={{ background: 'var(--app-card)', padding: 14, borderRadius: 14, border: `1.5px solid ${color}30`, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, color: 'var(--app-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>SLA mis tickets</p>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
                    {label}
                  </span>
                  {breached === 0 && critical === 0 && (
                    <span style={{ fontSize: 10, color: 'var(--app-text-muted)' }}>Todos en tiempo</span>
                  )}
                </div>
              );
            })()}

            {/* Quick links */}
            <div style={{ background: 'var(--app-card)', padding: 14, borderRadius: 14, border: '1px solid var(--app-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, color: 'var(--app-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Accesos rápidos</p>
              <button type="button" onClick={() => router.push(`/helpdesk/tech/${user.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-page)', fontSize: 11, fontWeight: 700, color: 'var(--app-text-main)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Mi perfil operativo →
              </button>
              <button type="button" onClick={() => router.push('/helpdesk/sla')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--app-border)', background: 'var(--app-page)', fontSize: 11, fontWeight: 700, color: 'var(--app-text-main)', cursor: 'pointer', fontFamily: 'inherit' }}>
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
          ) : isError ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 8px' }}>Error al cargar tickets</p>
              <button type="button" onClick={() => refetch()} style={{ fontSize: 11, color: '#ff5e3a', background: 'none', border: '1px solid #ff5e3a', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
            </div>
          ) : (() => {
            const all = (assigned ?? []) as AssignedTicket[];
            const breached   = all.filter(t => t.sla_status === 'breached' && !t.is_final);
            const approvals  = all.filter(t => t.is_approval_state);
            const prevNormal = previous.filter(t => !t.is_approval_state && t.sla_status !== 'breached');
            const todayNormal= today.filter(t => !t.is_approval_state && t.sla_status !== 'breached');

            function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{count} ticket{count !== 1 ? 's' : ''}</span>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* URGENTE — SLA vencido */}
                {breached.length > 0 && (
                  <div style={{ background: '#fff5f5', borderRadius: 10, padding: '12px', border: '1.5px solid #fecaca' }}>
                    <SectionHeader label="⚡ SLA Vencido — Atención inmediata" count={breached.length} color="#ef4444" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {breached.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                    </div>
                  </div>
                )}

                {/* POR APROBAR */}
                {approvals.length > 0 && (
                  <div style={{ background: 'var(--status-approval-bg)', borderRadius: 10, padding: '12px', border: '1.5px solid var(--status-approval-border)' }}>
                    <SectionHeader label="✓ Esperando aprobación del usuario" count={approvals.length} color="var(--status-approval-text)" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {approvals.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                    </div>
                  </div>
                )}

                {/* ANTERIORES normales */}
                {prevNormal.length > 0 && (
                  <div>
                    <SectionHeader label="Anteriores · pendientes" count={prevNormal.length} color="#ff5e3a" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {prevNormal.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                    </div>
                  </div>
                )}

                {/* HOY normales */}
                <div>
                  <SectionHeader label="Hoy · actuales" count={todayNormal.length} color="#0e2235" />
                  {todayNormal.length === 0 ? (
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '24px', textAlign: 'center', border: '1px solid #eef2f6', color: '#94a3b8', fontSize: 12 }}>Sin tickets nuevos hoy</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {todayNormal.map((t) => <TechQueueItem key={t.id} ticket={t} basePath={basePath} />)}
                    </div>
                  )}
                </div>

                {breached.length === 0 && approvals.length === 0 && prevNormal.length === 0 && todayNormal.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Ticket size={32} style={{ color: '#e2e8f0' }} />
                    <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 12 }}>Sin tickets asignados</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  const infoStyle: React.CSSProperties = { background: 'var(--app-card)', padding: '14px', borderRadius: 14, border: '1px solid var(--app-border)', fontSize: 11, color: 'var(--app-text)', lineHeight: 1.6 };
  const groupHeader = (label: string, count: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--app-border)', paddingBottom: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={11} />{label}
      </span>
      <span style={{ fontSize: 10, color: 'var(--app-text-muted)', fontWeight: 700 }}>{count} ticket{count !== 1 ? 's' : ''}</span>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: profile panel */}
        <div style={{ width: 260, flexShrink: 0, background: 'var(--app-page)', borderRight: '1px solid var(--app-border)', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>

          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 12px' }}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={fullName} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--app-card)', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }} />
              ) : (
                <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--app-card)', boxShadow: '0 4px 16px rgba(14,34,53,.15)' }}>
                  {initials(fullName)}
                </div>
              )}
              <span style={{ position: 'absolute', bottom: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: AVAIL_COLORS[myAvailStatus], border: '2px solid var(--app-page)' }} title={AVAIL_LABELS[myAvailStatus]} />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: 'var(--app-text-main)' }}>{fullName}</p>
            {user.username && <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--app-text-muted)' }}>@{user.username}</p>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Stars rating={avgRating} size={14} />
            </div>
          </div>

          <div style={infoStyle}>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 800, color: 'var(--app-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Rol en módulo</p>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--app-text-main)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0, display: 'inline-block' }} />
              {roleLabel}
            </p>
            {user.job_title && (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, color: 'var(--app-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Especialidad</p>
                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, background: 'var(--app-border)', color: 'var(--app-text-sub)', padding: '2px 8px', borderRadius: 5 }}>
                  {user.job_title.toUpperCase()}
                </span>
              </>
            )}
          </div>

          <div style={{ ...infoStyle, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: 'var(--app-text-main)' }}>{previous.length + today.length}</p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--app-text-muted)', fontWeight: 700 }}>Pendientes</p>
            </div>
            <div style={{ width: 1, background: 'var(--app-border)' }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: 'var(--app-text-main)' }}>{ratedCount}</p>
              <p style={{ margin: 0, fontSize: 10, color: 'var(--app-text-muted)', fontWeight: 700 }}>Calificados</p>
            </div>
          </div>

          <AvailabilityWidget userId={user.id} moduleId={moduleId} />
        </div>

        {/* Center: queue */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--app-card)', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--app-border)', paddingBottom: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--app-text-main)' }}>TICKETS ASIGNADOS</span>
            {canCreate && moduleId && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#ff5e3a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Plus size={11} /> Reportar Nuevo Incidente
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Cargando cola de trabajo…</div>
          ) : isError ? (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: '0 0 8px' }}>Error al cargar tickets</p>
              <button type="button" onClick={() => refetch()} style={{ fontSize: 11, color: '#ff5e3a', background: 'none', border: '1px solid #ff5e3a', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Reintentar</button>
            </div>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,53,.5)', zIndex: 151, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setShowDrawer(false)}>
          <div style={{ width: 360, background: 'var(--app-card, #fff)', padding: '32px 28px', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,.12)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--app-text-main)' }}>Rendimiento</h2>
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
                <div key={s.label} style={{ background: 'var(--app-page)', borderRadius: 12, padding: '16px', border: `2px solid ${s.accent}22` }}>
                  <p style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: s.accent }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--app-page)', borderRadius: 12, padding: 16, border: '1px solid var(--app-border)' }}>
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
