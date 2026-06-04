'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Search, Filter, ChevronDown, Ticket, Users,
  Home, ArrowLeftRight, Layers, Settings, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  ticketsService,
  type TicketListItem, type TicketPriority, type SlaStatus,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_LABELS,
  TICKET_PRIORITY_ORDER, TICKET_PRIORITIES,
} from '@/services/tickets.service';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';
import { STAT_CARDS, isToday, initials, TicketCard, type QuickFilter } from './shared';
import { TechCard } from './TechPanels';
import { CreateDrawer } from './CreateDrawer';

const PRIORITIES = TICKET_PRIORITIES;
const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

/* ─────────────────── AdminViewProps ─────────────────────────────────────── */

export interface AdminViewProps {
  moduleId:  string;
  basePath:  string;
  canCreate: boolean;
  visualVariant?: 'helpdeskMockup' | 'default';
}

/* ─────────────────── AdminView ──────────────────────────────────────────── */

export function AdminView({ moduleId, basePath, canCreate, visualVariant = 'default' }: AdminViewProps) {
  const user         = useAuthStore((s) => s.user);
  const router       = useRouter();
  const [stateFilter,     setStateFilter]    = useState('');
  const [priorityFilter,  setPriorityFilter] = useState<TicketPriority | ''>('');
  const [categoryFilter,  setCategoryFilter] = useState('');
  const [assigneeFilter,  setAssigneeFilter] = useState('');
  const [slaFilter,   setSlaFilter]   = useState<SlaStatus | ''>('');
  const [showCreate,  setShowCreate]  = useState(false);
  const [page,            setPage]           = useState(1);
  const [search,          setSearch]         = useState('');
  const [sortBy,          setSortBy]         = useState('auto');
  const [quickFilter,     setQuickFilter]    = useState<QuickFilter | null>(null);
  const [techSearch,      setTechSearch]     = useState('');
  const [showFilters,     setShowFilters]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', moduleId, stateFilter, priorityFilter, categoryFilter, assigneeFilter, slaFilter, page],
    queryFn:  () => ticketsService.getAll({
      module_id:   moduleId    || undefined,
      state_id:    stateFilter || undefined,
      priority:    priorityFilter || undefined,
      category_id: categoryFilter || undefined,
      assignee_id: assigneeFilter || undefined,
      sla_status:  slaFilter      || undefined,
      page,
      limit: 24,
    }),
    staleTime: 60_000,
  });

  const { data: workflow } = useQuery({
    queryKey: ['ticket-workflow', moduleId],
    queryFn:  () => ticketsService.getWorkflow(moduleId),
    staleTime: 5 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: techs } = useQuery({
    queryKey: ['module-technicians', moduleId],
    queryFn:  () => modulesService.getModuleTechnicians(moduleId),
    staleTime: 2 * 60_000,
    enabled:  !!moduleId,
  });

  const { data: myAssignedTickets = [] } = useQuery({
    queryKey: ['my-assigned-tickets', moduleId],
    queryFn:  () => usersService.getMyAssignedTickets(moduleId, 200),
    staleTime: 60_000,
    enabled:  !!user?.id,
  });


  const allTickets = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 24);

  const { ticketsOld, ticketsToday } = useMemo(() => {
    let list = allTickets;
    const ownerIds = new Set(myAssignedTickets.filter((t) => t.assignment_role === 'owner').map((t) => t.id));
    const esprIds  = new Set(myAssignedTickets.filter((t) => t.is_pause_state).map((t) => t.id));
    if (quickFilter === 'waiting')   list = list.filter((t) => ownerIds.has(t.id) && !t.is_final && !t.is_approval_state);
    if (quickFilter === 'mine')      list = list.filter((t) => ownerIds.has(t.id));
    if (quickFilter === 'breached')  list = list.filter((t) => t.sla_status === 'breached' && !t.is_final);
    if (quickFilter === 'unassigned')list = list.filter((t) => t.assignee_name === null && !t.is_final);
    if (quickFilter === 'in_espera') list = list.filter((t) => esprIds.has(t.id));
    if (quickFilter === 'approvals') list = list.filter((t) => t.is_approval_state);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
    }

    if (sortBy === 'priority') {
      list = [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      return { ticketsOld: list, ticketsToday: [] };
    }
    if (sortBy === 'newest') {
      return { ticketsOld: list, ticketsToday: [] };
    }

    // auto: split by today vs previous, sort each group by priority
    const byPriority = (a: TicketListItem, b: TicketListItem) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    const old:   TicketListItem[] = [];
    const today: TicketListItem[] = [];
    for (const t of list) {
      (isToday(t.created_at) ? today : old).push(t);
    }
    old.sort(byPriority);
    today.sort(byPriority);
    return { ticketsOld: old, ticketsToday: today };
  }, [allTickets, myAssignedTickets, quickFilter, search, sortBy, user?.id, user?.first_name, user?.last_name]);

  const statCounts = useMemo(() => {
    const waiting   = myAssignedTickets.filter((t) => t.assignment_role === 'owner' && !t.is_final && !t.is_approval_state).length;
    const mine      = myAssignedTickets.filter((t) => t.assignment_role === 'owner').length;
    const breached  = allTickets.filter((t) => t.sla_status === 'breached' && !t.is_final).length;
    const unassigned= allTickets.filter((t) => t.assignee_name === null && !t.is_final).length;
    const inEspera  = myAssignedTickets.filter((t) => t.is_pause_state).length;
    const approvals = allTickets.filter((t) => t.is_approval_state).length;
    return [waiting, mine, breached, unassigned, inEspera, approvals];
  }, [allTickets, myAssignedTickets]);

  const filteredTechs = useMemo(() => {
    const list = techs ?? [];
    if (!techSearch.trim()) return list;
    const q = techSearch.toLowerCase();
    return list.filter((t) => `${t.first_name} ${t.last_name}`.toLowerCase().includes(q));
  }, [techs, techSearch]);

  function toggleQuickFilter(key: QuickFilter) { setQuickFilter((p) => p === key ? null : key); }
  const isHelpdeskMockup = visualVariant === 'helpdeskMockup';

  function renderHDCardGrid(tickets: TicketListItem[]) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {tickets.map(t => {
          const pColor = TICKET_PRIORITY_COLORS[t.priority];
          return (
            <div key={t.id} className={styles.helpdeskCard}
              onClick={() => router.push(`${basePath}/ticket/${t.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', fontWeight: 700, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {t.assignee_name ?? '? Sin asignar'}
                  <ChevronDown size={9} style={{ color: '#94a3b8' }} />
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: `${pColor}15`, color: pColor, border: `1px solid ${pColor}40` }}>
                  {TICKET_PRIORITY_LABELS[t.priority]}
                </span>
              </div>
              <h4 style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 900, color: '#0e2235', lineHeight: 1.3 }}>{t.title}</h4>
              <p style={{ margin: '0 0 14px', fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{t.category_name}{t.environment_name ? ` • ${t.environment_name}` : ''}</p>
              <div style={{ borderTop: '1px solid #eef2f6', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(14,34,53,.1)', color: '#0e2235', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {initials(t.creator_name)}
                  </div>
                  <div>
                    <p style={{ margin: '0 0 1px', fontSize: 10, fontWeight: 800, color: '#0e2235' }}>{t.creator_name}</p>
                    <p style={{ margin: 0, fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{fmtRelative(t.created_at)}</p>
                  </div>
                </div>
                <span style={{ fontSize: 10, background: '#0f172a', color: '#fff', fontWeight: 900, padding: '3px 9px', borderRadius: 6 }}>
                  #{t.id.slice(-6).toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── Helpdesk mockup view ────────────────────────────────────────── */
  if (isHelpdeskMockup) {
    /* ── Admin bandeja ── */

    return (
      <>
        <div className={styles.helpdeskAdminShell}>

          {/* Main content */}
          <div className={styles.helpdeskAdminMain}>

            {/* ── SLA breach alert banner ── */}
            {(() => {
              const breached = allTickets.filter(t => t.sla_status === 'breached' && !t.is_final).length;
              const critical = allTickets.filter(t => {
                if (t.sla_status !== 'active' || t.is_final) return false;
                const h = t.sla_deadline_tracked ? (new Date(t.sla_deadline_tracked).getTime() - Date.now()) / 3_600_000 : null;
                return h !== null && h < 2;
              }).length;
              if (breached === 0 && critical === 0) return null;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 10, background: breached > 0 ? '#fef2f2' : '#fff7ed', border: `1.5px solid ${breached > 0 ? '#fecaca' : '#fed7aa'}`, marginBottom: 4, cursor: 'pointer' }}
                  onClick={() => setQuickFilter('breached')}>
                  <AlertTriangle size={16} style={{ color: breached > 0 ? '#ef4444' : '#f97316', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    {breached > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#ef4444' }}>
                        {breached} ticket{breached > 1 ? 's' : ''} con SLA vencido
                      </span>
                    )}
                    {critical > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginLeft: breached > 0 ? 12 : 0 }}>
                        {critical} crítico{critical > 1 ? 's' : ''} &lt;2h
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Clic para filtrar →</span>
                </div>
              );
            })()}

            {/* Stats — sticky */}
            <div className={styles.helpdeskStatsStickyWrap}>
              <div className={styles.helpdeskStatsGrid}>
                {STAT_CARDS.map((card, i) => (
                  <div key={card.key}
                    className={`${styles.statCard}${quickFilter === card.key ? ` ${styles.statCardActive}` : ''}`}
                    style={{ '--accent': card.accent } as React.CSSProperties}
                    onClick={() => toggleQuickFilter(card.key)}>
                    <p className={styles.statCount}>{statCounts[i]}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                    <p className={styles.statDesc}>{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Search + actions row */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', padding: '10px 14px', borderRadius: 12, border: '1px solid #eef2f6', boxShadow: '0 1px 3px rgba(15,23,42,.04)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tickets..."
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#334155' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {canCreate && moduleId && (
                  <button type="button" onClick={() => setShowCreate(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#ff5e3a', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(255,94,58,.25)' }}>
                    <Plus size={12} /> Reportar Nuevo Incidente
                  </button>
                )}
                <button type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: showFilters ? '1px solid #ff5e3a' : '1px solid #e2e8f0', background: showFilters ? '#fff5f0' : '#fff', color: showFilters ? '#ff5e3a' : '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Filter size={10} /> Filtros{(priorityFilter || stateFilter || categoryFilter) ? ' ●' : ''}
                </button>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit', cursor: 'pointer', background: '#f8fafc', color: '#475569', fontWeight: 700 }}>
                  <option value="auto">Automático (SLA)</option>
                  <option value="newest">Recientes</option>
                  <option value="priority">Prioridad</option>
                </select>
              </div>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className={styles.helpdeskFilterPanel}>
                {/* Priority chips */}
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Prioridad</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PRIORITIES.map((p) => {
                      const c = TICKET_PRIORITY_COLORS[p];
                      const active = priorityFilter === p;
                      return (
                        <button key={p} type="button"
                          onClick={() => setPriorityFilter(active ? '' : p)}
                          style={{ fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 99, border: `1px solid ${active ? c : c + '60'}`, background: active ? c : `${c}15`, color: active ? '#fff' : c, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {TICKET_PRIORITY_LABELS[p]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* State chips */}
                {(workflow?.states ?? []).length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Estado</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(workflow?.states ?? []).map((s) => {
                        const active = stateFilter === s.id;
                        return (
                          <button key={s.id} type="button"
                            onClick={() => setStateFilter(active ? '' : s.id)}
                            style={{ fontSize: 10, fontWeight: 700, padding: '3px 12px', borderRadius: 99, border: `1px solid ${active ? '#0e2235' : '#e2e8f0'}`, background: active ? '#0e2235' : '#f8fafc', color: active ? '#fff' : '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category */}
                {(categories ?? []).length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Categoría</p>
                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                      style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', background: '#f8fafc', color: '#475569', fontWeight: 600 }}>
                      <option value="">Todas las categorías</option>
                      {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Reset */}
                {(priorityFilter || stateFilter || categoryFilter) && (
                  <button type="button"
                    onClick={() => { setPriorityFilter(''); setStateFilter(''); setCategoryFilter(''); }}
                    style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', fontFamily: 'inherit' }}>
                    × Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {/* Ticket sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>BANDEJA DE CASOS ACTIVOS</span>
                <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>
                  Consola Global • {total}
                </span>
              </div>

              {isLoading ? (
                <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Cargando tickets…</p>
              ) : (
                <>
                  {/* Anteriores / vencidos */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#e53e3e', textTransform: 'uppercase', letterSpacing: '.04em' }}>● ANTERIORES — VENCIDOS / ALTA PRIORIDAD</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{ticketsOld.length} tickets</span>
                    </div>
                    {ticketsOld.length === 0 ? (
                      <div style={{ background: '#fff', borderRadius: 16, padding: '24px', textAlign: 'center', border: '1px solid #eef2f6', color: '#94a3b8', fontSize: 12 }}>
                        Sin tickets anteriores
                      </div>
                    ) : renderHDCardGrid(ticketsOld)}
                  </div>

                  {/* Hoy / actuales */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>● HOY — ACTUALES</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{ticketsToday.length} tickets</span>
                    </div>
                    {ticketsToday.length === 0 ? (
                      <div style={{ background: '#fff', borderRadius: 16, padding: '28px', textAlign: 'center', border: '1px solid #eef2f6', color: '#94a3b8', fontSize: 12 }}>
                        Sin tickets nuevos hoy
                      </div>
                    ) : renderHDCardGrid(ticketsToday)}
                  </div>
                </>
              )}

              {/* Footer note */}
              <div style={{ textAlign: 'center', paddingBottom: 8, flexShrink: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: 0 }}>
                  ☉ TODOS LOS TICKETS DE ESTE MÓDULO (SOLO ACCESIBLE PARA ADMIN, SUPERADMIN Y JEFE TÉCNICO)
                </p>
              </div>
            </div>
          </div>

        </div>
        {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  const iconBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 9, border: '1.5px solid #e2e8f0',
    background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#64748b', transition: 'background .15s, color .15s, border-color .15s',
    flexShrink: 0,
  };

  return (
    <>
      {/* ── Stats row ── */}
      {!isHelpdeskMockup && <div className={styles.statsRow}>
        {STAT_CARDS.map((card, i) => {
          const isActive = quickFilter === card.key;
          return (
            <div
              key={i}
              className={`${styles.statCard}${isActive ? ` ${styles.statCardActive}` : ''}`}
              style={{ '--accent': card.accent } as React.CSSProperties}
              onClick={() => toggleQuickFilter(card.key)}
            >
              <p className={styles.statCount}>{statCounts[i]}</p>
              <p className={styles.statLabel}>{card.label}</p>
              <p className={styles.statDesc}>{card.desc}</p>
            </div>
          );
        })}
      </div>}

      {/* ── Main area: inner sidebar + ticket list + tech panel ── */}
      <div
        className={isHelpdeskMockup ? styles.helpdeskAdminShell : undefined}
        style={!isHelpdeskMockup ? { display: 'flex', flex: 1, gap: 0, overflow: 'hidden' } : undefined}
      >

        {/* Inner left sidebar (64px) */}
        {!isHelpdeskMockup && <div style={{ width: 64, flexShrink: 0, background: '#f8fafc', borderRight: '1px solid #eef2f6', borderLeft: '1px solid #eef2f6', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 14 }}>
          <button type="button" title="Módulo Principal" style={iconBtn} onClick={() => router.push(basePath)}>
            <Home size={15} />
          </button>
          <button type="button" title="Historial de tickets" style={iconBtn} onClick={() => router.push(`${basePath}`)}>
            <ArrowLeftRight size={15} />
          </button>
          <button type="button" title="Estructura de equipos" style={iconBtn}>
            <Layers size={15} />
          </button>
          <button type="button" title="Configuración del módulo" style={iconBtn}>
            <Settings size={15} />
          </button>
          {canCreate && moduleId && (
            <button
              type="button"
              title="Crear nuevo ticket"
              style={{ ...iconBtn, background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' }}
              onClick={() => setShowCreate(true)}
            >
              <Plus size={15} />
            </button>
          )}
        </div>}

        {/* Central: ticket list (flex-1) */}
        <div
          className={isHelpdeskMockup ? styles.helpdeskAdminMain : undefined}
          style={!isHelpdeskMockup ? { flex: 1, minWidth: 0, padding: '20px 24px 0', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 12 } : undefined}
        >
          {isHelpdeskMockup && (
            <div className={styles.helpdeskStatsGrid}>
              {STAT_CARDS.map((card, i) => {
                const isActive = quickFilter === card.key;
                return (
                  <div
                    key={card.key}
                    className={`${styles.statCard}${isActive ? ` ${styles.statCardActive}` : ''}`}
                    style={{ '--accent': card.accent } as React.CSSProperties}
                    onClick={() => toggleQuickFilter(card.key)}
                  >
                    <p className={styles.statCount}>{statCounts[i]}</p>
                    <p className={styles.statLabel}>{card.label}</p>
                    <p className={styles.statDesc}>{card.desc}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search + filter toggle */}
          {(() => {
            const activeFilterCount = [priorityFilter, stateFilter, categoryFilter, assigneeFilter, slaFilter].filter(Boolean).length;
            const selStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px', fontSize: 11, color: '#475569', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ background: '#fff', borderRadius: 14, padding: '10px 16px', border: '1px solid #e8edf3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar tickets…"
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#0f172a', fontFamily: 'inherit', background: 'transparent' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isHelpdeskMockup && canCreate && moduleId && (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 1px 4px rgba(255,94,58,.25)' }}
                      >
                        <Plus size={12} />Reportar Nuevo Incidente
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFilters((v) => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${showFilters || activeFilterCount > 0 ? '#ff5e3a' : '#e2e8f0'}`, background: showFilters ? '#fff5f3' : '#fff', color: showFilters || activeFilterCount > 0 ? '#ff5e3a' : '#64748b', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <Filter size={11} />
                      Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selStyle}>
                      <option value="auto">Automático (SLA)</option>
                      <option value="newest">Más recientes</option>
                      <option value="priority">Por prioridad</option>
                    </select>
                  </div>
                </div>

                {showFilters && (
                  <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', border: '1.5px solid #ffe8e3', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value as TicketPriority | ''); setPage(1); }} style={selStyle}>
                      <option value="">Prioridad</option>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
                    </select>

                    <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Estado</option>
                      {(workflow?.states ?? []).filter((s) => !s.is_final).map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>

                    <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Categoría</option>
                      {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <select value={assigneeFilter} onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }} style={selStyle}>
                      <option value="">Técnico asignado</option>
                      {(techs ?? []).map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                    </select>

                    <select value={slaFilter} onChange={(e) => { setSlaFilter(e.target.value as SlaStatus | ''); setPage(1); }} style={selStyle}>
                      <option value="">SLA</option>
                      {(['active', 'paused', 'met', 'breached'] as SlaStatus[]).map((s) => (
                        <option key={s} value={s}>{SLA_STATUS_LABELS[s]}</option>
                      ))}
                    </select>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { setPriorityFilter(''); setStateFilter(''); setCategoryFilter(''); setAssigneeFilter(''); setSlaFilter(''); setPage(1); }}
                        style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>Bandeja de Casos Activos</span>
            <span style={{
              fontSize: 10,
              color: isHelpdeskMockup ? '#4a5568' : '#94a3b8',
              background: isHelpdeskMockup ? '#f1f5f9' : '#fff',
              border: isHelpdeskMockup ? 'none' : '1px solid #e2e8f0',
              padding: isHelpdeskMockup ? '2px 8px' : '3px 10px',
              borderRadius: 6,
              fontWeight: isHelpdeskMockup ? 900 : 700,
            }}>Consola Global · {total}</span>
          </div>

          {/* Cards */}
          {isLoading ? (
            <div className={styles.loadingState}>Cargando tickets…</div>
          ) : ticketsOld.length === 0 && ticketsToday.length === 0 ? (
            <div className={styles.emptyState}>
              <Ticket size={28} className={styles.emptyIcon} />
              <p className={styles.emptyText}>{search || quickFilter || priorityFilter || stateFilter || categoryFilter || assigneeFilter || slaFilter ? 'Sin tickets con esos filtros.' : 'No hay tickets activos en este módulo.'}</p>
              {canCreate && moduleId && !search && !quickFilter && (
                <button type="button" className={styles.newTicketBtn} onClick={() => setShowCreate(true)}>
                  <Plus size={13} />Crear primer ticket
                </button>
              )}
            </div>
          ) : sortBy !== 'auto' ? (
            <div className={styles.cardGrid}>
              {ticketsOld.map((t) => (
                <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
              ))}
            </div>
          ) : (
            <>
              {ticketsOld.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: isHelpdeskMockup ? '#e53e3e' : '#ff5e3a', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: isHelpdeskMockup ? '#e53e3e' : '#ff5e3a', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      Anteriores — Vencidos / Alta Prioridad
                    </span>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>{ticketsOld.length} ticket{ticketsOld.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className={styles.cardGrid}>
                    {ticketsOld.map((t) => (
                      <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isHelpdeskMockup ? '#94a3b8' : '#3b82f6', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: isHelpdeskMockup ? '#94a3b8' : '#3b82f6', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    Hoy — Actuales
                  </span>
                  <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginLeft: 'auto' }}>{ticketsToday.length} ticket{ticketsToday.length !== 1 ? 's' : ''}</span>
                </div>
                {ticketsToday.length === 0 ? (
                  isHelpdeskMockup ? (
                    <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid #f1f5f9', color: '#94a3b8' }}>
                      <p style={{ fontSize: 12, fontWeight: 500, margin: 0 }}>Sin tickets nuevos hoy</p>
                    </div>
                  ) : (
                  <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '16px 0' }}>Sin tickets nuevos hoy</p>
                  )
                ) : (
                  <div className={styles.cardGrid}>
                    {ticketsToday.map((t) => (
                      <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
              <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
              <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
            </div>
          )}

          {/* Footer note */}
          <div style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em', color: '#cbd5e1', borderTop: '1px solid #f1f5f9', padding: '14px 0 20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textTransform: 'uppercase' }}>
            <ShieldCheck size={12} />
            Todos los tickets de este módulo (solo accesible para admin, superadmin y jefe técnico)
          </div>
        </div>

        {/* Right: tech panel (300px) */}
        <div
          className={isHelpdeskMockup ? styles.helpdeskTechPanel : undefined}
          style={!isHelpdeskMockup ? { width: 300, flexShrink: 0, background: '#f8fafc', borderLeft: '1px solid #eef2f6', padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 } : undefined}
        >

          {/* Search techs */}
          <div style={{ background: '#fff', borderRadius: isHelpdeskMockup ? 12 : 10, border: '1px solid #e2e8f0', padding: isHelpdeskMockup ? '8px 12px' : '9px 14px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: isHelpdeskMockup ? '0 1px 3px rgba(0,0,0,.04)' : 'none' }}>
            <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="text"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              placeholder="Buscar técnico…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#0f172a' }}
            />
          </div>

          {/* Filter row */}
          {isHelpdeskMockup ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '.05em', cursor: 'default' }}>
                <Filter size={10} /> Filtros
              </span>
              <span style={{ fontSize: 9.5, background: '#e0f2fe', color: '#0369a1', padding: '2px 10px', borderRadius: 99, fontWeight: 800 }}>
                Mesa de Ayuda
              </span>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #e2e8f0', padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#334155', letterSpacing: '.05em' }}>
                <Filter size={11} /> Filtros
              </span>
              <span style={{ fontSize: 9.5, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 5, fontWeight: 800 }}>
                Mesa de Ayuda
              </span>
            </div>
          )}

          {/* Techs header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isHelpdeskMockup ? '1px solid #eef2f6' : 'none', paddingBottom: isHelpdeskMockup ? 8 : 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#475569', letterSpacing: '.05em' }}>
              {!isHelpdeskMockup && <Users size={12} />} Técnicos
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, background: '#20c933', color: '#fff', padding: '2px 9px', borderRadius: isHelpdeskMockup ? 4 : 99 }}>
              {filteredTechs.filter((t) => t.is_available).length}/{filteredTechs.length} disp.
            </span>
          </div>

          {/* Tech cards */}
          {filteredTechs.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 16 }}>Sin técnicos asignados</p>
          ) : filteredTechs.map((tech) => (
            <TechCard
              key={tech.id}
              tech={tech}
              isSelected={false}
              onVerProcesos={() => router.push(`${basePath}/tech/${tech.id}`)}
              isHelpdeskMockup={isHelpdeskMockup}
            />
          ))}
        </div>
      </div>

      {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}
