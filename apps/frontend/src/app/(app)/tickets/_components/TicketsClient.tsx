'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Clock, Ticket, Search, ChevronDown, CheckCircle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  ticketsService,
  type TicketListItem, type TicketPriority,
  type CreateTicketDto,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
} from '@/services/tickets.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';

const PRIORITIES: TicketPriority[] = ['baja', 'media', 'alta', 'critica'];

type QuickFilter = 'waiting' | 'assigned' | 'unassigned';

/* ── Stat card config ────────────────────────────────────────────── */
const STAT_CARDS: {
  key:    QuickFilter | null;
  label:  string;
  accent: string;
  desc:   string;
}[] = [
  { key: 'waiting',   label: 'Esperándome',    accent: '#ff5e3a', desc: 'Requieren tu acción' },
  { key: 'assigned',  label: 'Asignados a mí', accent: '#f59e0b', desc: 'En seguimiento'      },
  { key: null,        label: 'Aprobaciones',   accent: '#3b82f6', desc: 'Pendientes'           },
  { key: null,        label: 'Tareas',          accent: '#fbbf24', desc: 'Por completar'       },
  { key: 'unassigned', label: 'Sin asignar',   accent: '#a855f7', desc: 'Sin responsable'     },
  { key: null,        label: 'Colaboraciones', accent: '#64748b', desc: 'Participando'        },
];

/* ── Priority badge ─────────────────────────────────────────────── */
function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span
      className={styles.priorityBadge}
      style={{ background: `${color}22`, color, borderColor: `${color}44` }}
    >
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

/* ── Create ticket modal ─────────────────────────────────────────── */
interface CreateModalProps {
  moduleId: string;
  onClose:  () => void;
}

function CreateModal({ moduleId, onClose }: CreateModalProps) {
  const qc = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories', moduleId],
    queryFn:  () => ticketsService.getCategories(moduleId),
    staleTime: 5 * 60_000,
  });

  const { data: environments } = useQuery({
    queryKey: ['ticket-environments', moduleId],
    queryFn:  () => ticketsService.getEnvironments(moduleId),
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState<Partial<CreateTicketDto>>({
    module_id: moduleId,
    priority:  'media',
    urgency:   'media',
    impact:    'medio',
  });
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: () => ticketsService.create(form as CreateTicketDto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Error al crear el ticket.'),
  });

  function set(key: keyof CreateTicketDto, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title?.trim())  { setError('Título requerido.'); return; }
    if (!form.category_id)    { setError('Categoría requerida.'); return; }
    if (!form.environment_id) { setError('Ambiente requerido.'); return; }
    setError('');
    createMut.mutate();
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1px solid #E2E8F0', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: '#fff',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4,
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '28px 28px 24px', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <X size={16} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,94,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ticket size={15} style={{ color: '#ff5e3a' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Nuevo ticket</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Completa la información del ticket</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Título *</label>
            <input type="text" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Describe el problema o solicitud…" maxLength={255} style={inp} />
          </div>

          <div>
            <label style={lbl}>Descripción</label>
            <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalles adicionales…" rows={3} style={{ ...inp, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Categoría *</label>
              <select value={form.category_id ?? ''} onChange={(e) => set('category_id', e.target.value)} style={inp}>
                <option value="">Seleccionar…</option>
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ambiente *</label>
              <select value={form.environment_id ?? ''} onChange={(e) => set('environment_id', e.target.value)} style={inp}>
                <option value="">Seleccionar…</option>
                {(environments ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.location_name ? ` — ${e.location_name}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Prioridad</label>
              <select value={form.priority ?? 'media'} onChange={(e) => set('priority', e.target.value)} style={inp}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Urgencia</label>
              <select value={form.urgency ?? 'media'} onChange={(e) => set('urgency', e.target.value)} style={inp}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Impacto</label>
              <select value={form.impact ?? 'medio'} onChange={(e) => set('impact', e.target.value)} style={inp}>
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
              Cancelar
            </button>
            <button type="submit" disabled={createMut.isPending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: createMut.isPending ? .7 : 1 }}>
              <Plus size={13} />
              {createMut.isPending ? 'Creando…' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Ticket card ─────────────────────────────────────────────────── */
function TicketCard({ ticket, onClick }: { ticket: TicketListItem; onClick: () => void }) {
  const overdue = ticket.sla_status === 'breached';

  function initials(name: string | null | undefined) {
    return (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  const slaColor = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status] ?? '#94A3B8') : null;
  const slaLabel = ticket.sla_status ? (SLA_STATUS_LABELS[ticket.sla_status] ?? null) : null;

  return (
    <div
      className={`${styles.ticketCard}${overdue ? ` ${styles.ticketCardOverdue}` : ''}`}
      onClick={onClick}
    >
      {/* Header: assignee chip + priority */}
      <div className={styles.cardHeader}>
        <div className={styles.assigneeBadge}>
          <div className={styles.assigneeAvatar}>{initials(ticket.assignee_name)}</div>
          <span className={styles.assigneeLabel}>{ticket.assignee_name ?? 'Sin asignar'}</span>
          <ChevronDown size={10} style={{ flexShrink: 0 }} />
        </div>
        <PriorityBadge priority={ticket.priority} />
      </div>

      {/* Title */}
      <h3 className={styles.cardTitle}>{ticket.title}</h3>

      {/* Breadcrumb */}
      <div className={styles.cardBreadcrumb}>
        <Ticket size={10} />
        <span>{ticket.category_name}</span>
        {ticket.environment_name && (
          <>
            <span className={styles.breadcrumbSep}>›</span>
            <span>{ticket.environment_name}</span>
          </>
        )}
      </div>

      {/* Footer */}
      <div className={styles.cardFooter}>
        <div className={styles.cardOwner}>
          <div className={styles.ownerAvatar}>{initials(ticket.creator_name)}</div>
          <div className={styles.ownerInfo}>
            <span className={styles.ownerName}>{ticket.creator_name}</span>
            <span className={styles.ownerMeta}>{fmtRelative(ticket.created_at)}</span>
          </div>
        </div>
        <div className={styles.cardStats}>
          {slaLabel && slaColor && (
            <span className={styles.slaStat} style={{ color: slaColor }}>
              <Clock size={9} />
              {slaLabel}
            </span>
          )}
          <span className={styles.ticketIdBadgeSm}>#{ticket.id.slice(-6).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function TicketsClient() {
  const router      = useRouter();
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const activeModules = useMemo(() => {
    const roles = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
    const seen  = new Set<string>();
    const unique: { module_id: string; module_name: string; role_name: string }[] = [];
    for (const r of roles) {
      if (!seen.has(r.module_id)) { seen.add(r.module_id); unique.push(r); }
    }
    return unique;
  }, [user]);

  const [selectedModule, setSelectedModule] = useState<string>(activeModules[0]?.module_id ?? '');
  const [stateFilter,    setStateFilter]    = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [mineOnly,       setMineOnly]       = useState(false);
  const [showCreate,     setShowCreate]     = useState(false);
  const [page,           setPage]           = useState(1);
  const [search,         setSearch]         = useState('');
  const [sortBy,         setSortBy]         = useState('newest');
  const [quickFilter,    setQuickFilter]    = useState<QuickFilter | null>(null);

  const { data: workflow } = useQuery({
    queryKey: ['ticket-workflow', selectedModule],
    queryFn:  () => ticketsService.getWorkflow(selectedModule),
    enabled:  !!selectedModule,
    staleTime: 5 * 60_000,
  });

  // suppress unused-var lint — workflow kept for future filter integration
  void workflow;

  const qk = ['tickets', selectedModule, stateFilter, priorityFilter, mineOnly, page];
  const { data, isLoading } = useQuery({
    queryKey: qk,
    queryFn:  () => ticketsService.getAll({
      module_id: selectedModule || undefined,
      state_id:  stateFilter   || undefined,
      priority:  priorityFilter || undefined,
      mine:      mineOnly,
      page,
      limit: 25,
    }),
    staleTime: 60_000,
  });

  const allTickets = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  // Client-side quick filter + search on current page data
  const tickets = useMemo(() => {
    let list = allTickets;
    const userName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim().toLowerCase();
    if (quickFilter === 'waiting')   list = list.filter((t) => (t.assignee_name ?? '').toLowerCase().includes(userName) && !t.is_final);
    if (quickFilter === 'assigned')  list = list.filter((t) => t.assignee_name !== null);
    if (quickFilter === 'unassigned') list = list.filter((t) => t.assignee_name === null);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
    }
    if (sortBy === 'priority') {
      const ord: Record<TicketPriority, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
      list = [...list].sort((a, b) => ord[a.priority] - ord[b.priority]);
    }
    return list;
  }, [allTickets, quickFilter, search, sortBy, user?.first_name, user?.last_name]);

  // Stat counts derived from current page
  const statCounts = useMemo(() => {
    const uName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim().toLowerCase();
    return [
      allTickets.filter((t) => (t.assignee_name ?? '').toLowerCase().includes(uName) && !t.is_final).length,
      allTickets.filter((t) => t.assignee_name !== null).length,
      allTickets.filter((t) => t.state_label.toLowerCase().includes('aprobac')).length,
      allTickets.filter((t) => !t.is_final).length,
      allTickets.filter((t) => t.assignee_name === null).length,
      0,
    ];
  }, [allTickets, user?.first_name, user?.last_name]);

  // Right panel data
  const pendingActions = useMemo(
    () => allTickets.filter((t) => t.sla_status === 'breached' || t.priority === 'critica').slice(0, 3),
    [allTickets],
  );

  const dueSoon = useMemo(
    () => allTickets
      .filter((t) => t.sla_deadline_tracked && !t.is_final)
      .sort((a, b) => (a.sla_deadline_tracked ?? '').localeCompare(b.sla_deadline_tracked ?? ''))
      .slice(0, 5),
    [allTickets],
  );

  function toggleQuickFilter(key: QuickFilter) {
    setQuickFilter((prev) => prev === key ? null : key);
  }

  const canCreate = isSuperadmin || activeModules.length > 0;

  return (
    <div className={styles.dashboard}>

      {/* ── Header ── */}
      <div className={styles.dashHeader}>
        <div>
          <h1 className={styles.dashTitle}>Mesa de Ayuda</h1>
          <p className={styles.dashSubtitle}>Sistema centralizado de soporte técnico</p>
        </div>
        {canCreate && selectedModule && (
          <button type="button" className={styles.newTicketBtn} onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Nuevo ticket
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {STAT_CARDS.map((card, i) => {
          const isActive = card.key !== null && quickFilter === card.key;
          return (
            <div
              key={i}
              className={`${styles.statCard}${isActive ? ` ${styles.statCardActive}` : ''}`}
              style={{ '--accent': card.accent } as React.CSSProperties}
              onClick={() => card.key !== null && toggleQuickFilter(card.key)}
            >
              <p className={styles.statCount}>{statCounts[i]}</p>
              <p className={styles.statLabel}>{card.label}</p>
              <p className={styles.statDesc}>{card.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ── Main panels ── */}
      <div className={styles.panels}>

        {/* ── Left: ticket list ── */}
        <div className={styles.mainPanel}>

          {/* Module selector tabs */}
          {activeModules.length > 0 && (
            <div className={styles.moduleTabs}>
              {!isSuperadmin && (
                <button
                  type="button"
                  className={`${styles.moduleTab}${!selectedModule ? ` ${styles.moduleTabActive}` : ''}`}
                  onClick={() => { setSelectedModule(''); setPage(1); }}
                >
                  Todos
                </button>
              )}
              {activeModules.map((m) => (
                <button
                  key={m.module_id}
                  type="button"
                  className={`${styles.moduleTab}${selectedModule === m.module_id ? ` ${styles.moduleTabActive}` : ''}`}
                  onClick={() => { setSelectedModule(m.module_id); setPage(1); }}
                >
                  {m.module_name}
                </button>
              ))}
            </div>
          )}

          {/* Search + sort bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <Search size={14} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Buscar tickets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className={styles.filterDivider} />
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Más recientes</option>
              <option value="priority">Por prioridad</option>
            </select>
          </div>

          {/* Cards */}
          {isLoading ? (
            <div className={styles.loadingState}>Cargando tickets…</div>
          ) : tickets.length === 0 ? (
            <div className={styles.emptyState}>
              <Ticket size={28} className={styles.emptyIcon} />
              <p className={styles.emptyText}>
                {search || quickFilter ? 'Sin tickets con esos filtros.' : 'No hay tickets en este módulo.'}
              </p>
              {canCreate && selectedModule && !search && !quickFilter && (
                <button type="button" className={styles.newTicketBtn} onClick={() => setShowCreate(true)}>
                  <Plus size={13} /> Crear primer ticket
                </button>
              )}
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {tickets.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  onClick={() => router.push(`/tickets/ticket/${t.id}`)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Anterior
              </button>
              <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
              <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* ── Right: actions + due soon ── */}
        <div className={styles.rightPanel}>

          {/* Pending actions */}
          <div className={styles.rpCard}>
            <div className={styles.rpCardHeader}>
              <h3 className={styles.rpCardTitle}>Acciones pendientes</h3>
              {pendingActions.length > 0 && (
                <span className={styles.rpBadge}>{pendingActions.length}</span>
              )}
            </div>
            {pendingActions.length === 0 ? (
              <p className={styles.rpEmpty}>Sin acciones pendientes</p>
            ) : pendingActions.map((t) => (
              <div key={t.id} className={styles.pendingItem}>
                <p className={styles.pendingItemTitle}>{t.title}</p>
                <p className={styles.pendingItemMeta}>{t.category_name} · {fmtRelative(t.created_at)}</p>
                <div className={styles.pendingActions}>
                  <button
                    type="button"
                    className={styles.pendingApprove}
                    onClick={() => router.push(`/tickets/ticket/${t.id}`)}
                  >
                    <CheckCircle size={10} /> Ver ticket
                  </button>
                  <button
                    type="button"
                    className={styles.pendingComplete}
                    onClick={() => router.push(`/tickets/ticket/${t.id}`)}
                  >
                    Atender
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Due soon */}
          <div className={styles.rpCard}>
            <div className={styles.rpCardHeader}>
              <h3 className={styles.rpCardTitle}>Vence pronto</h3>
            </div>
            {dueSoon.length === 0 ? (
              <p className={styles.rpEmpty}>Sin vencimientos próximos</p>
            ) : dueSoon.map((t) => {
              const slaColor = t.sla_status ? (SLA_STATUS_COLORS[t.sla_status] ?? '#94a3b8') : '#94a3b8';
              return (
                <div
                  key={t.id}
                  className={styles.dueSoonItem}
                  onClick={() => router.push(`/tickets/ticket/${t.id}`)}
                >
                  <div className={styles.dueSoonDot} style={{ background: slaColor }} />
                  <div className={styles.dueSoonInfo}>
                    <p className={styles.dueSoonTitle}>{t.title}</p>
                    <p className={styles.dueSoonMeta}>{t.module_name}</p>
                  </div>
                  <span className={styles.dueSoonTime} style={{ color: slaColor }}>
                    {fmtRelative(t.sla_deadline_tracked!)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Create modal ── */}
      {showCreate && selectedModule && (
        <CreateModal moduleId={selectedModule} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
