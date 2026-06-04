'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Ticket, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import {
  ticketsService,
  type TicketListItem, type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
} from '@/services/tickets.service';
import { fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';
import { isToday, TicketCard } from './shared';
import { CreateDrawer } from './CreateDrawer';

export function UserView({ moduleId, basePath, canCreate, visualVariant = 'default' }: { moduleId: string; basePath: string; canCreate: boolean; visualVariant?: 'helpdeskMockup' | 'default' }) {
  const router   = useRouter();
  const { user } = useAuthStore((s) => s);

  const [showCreate,     setShowCreate]     = useState(false);
  const [search,         setSearch]         = useState('');
  const [page,           setPage]           = useState(1);
  const [showFilters,    setShowFilters]    = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');

  const limit = visualVariant === 'helpdeskMockup' ? 100 : 20;

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', moduleId, 'mine', page, limit],
    queryFn:  () => ticketsService.getAll({ module_id: moduleId, mine: true, page, limit }),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const tickets    = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const filtered = useMemo(() => {
    let list = tickets;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || t.category_name.toLowerCase().includes(q));
    }
    if (priorityFilter) list = list.filter((t) => t.priority === priorityFilter);
    return list;
  }, [tickets, search, priorityFilter]);

  const { ticketsOld, ticketsToday } = useMemo(() => {
    const old: typeof filtered = [];
    const today: typeof filtered = [];
    for (const t of filtered) {
      (isToday(t.created_at) ? today : old).push(t);
    }
    return { ticketsOld: old, ticketsToday: today };
  }, [filtered]);

  /* ── Portal stats (helpdeskMockup only) ── */
  const portalStats = useMemo(() => ({
    abiertos:   tickets.filter(t => !t.is_final && !t.is_approval_state && !t.assignee_name && !t.is_pause_state).length,
    enProceso:  tickets.filter(t => !t.is_final && !t.is_approval_state && !!t.assignee_name && !t.is_pause_state).length,
    porAceptar: tickets.filter(t => t.is_approval_state).length,
    cerrados:   tickets.filter(t => t.is_final).length,
  }), [tickets]);

  function portalStateBadge(t: TicketListItem): { label: string; bg: string; color: string; action?: boolean } {
    if (t.is_final)          return { label: 'Cerrado',      bg: '#f1f5f9', color: '#64748b' };
    if (t.is_approval_state) return { label: 'Por aceptar',  bg: '#fff7ed', color: '#c2410c', action: true };
    if (t.is_pause_state)    return { label: 'En espera',    bg: '#fef3c7', color: '#92400e' };
    if (!!t.assignee_name)   return { label: 'En proceso',   bg: '#eff6ff', color: '#1d4ed8' };
    return                          { label: 'Abierto',       bg: '#fff7ed', color: '#c2410c' };
  }

  if (visualVariant === 'helpdeskMockup') {
    const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };
    const firstName = user?.first_name ?? 'Usuario';

    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Hero ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>Portal de Soporte</p>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>Bienvenido, {firstName}</h1>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Gestiona tus solicitudes y encuentra soluciones en nuestra base de conocimiento.</p>
            </div>
            {canCreate && moduleId && (
              <button type="button" onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, background: C.coral, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(255,94,58,.35)', flexShrink: 0 }}>
                <Plus size={15} /> Reportar incidente
              </button>
            )}
          </div>

          {/* ── Stats cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Abiertos',    value: portalStats.abiertos,   color: '#c2410c', bg: '#fff7ed', border: '#fed7aa', action: false },
              { label: 'En proceso',  value: portalStats.enProceso,   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', action: false },
              { label: 'Por aceptar', value: portalStats.porAceptar,  color: '#ff5e3a', bg: '#fff7ed', border: portalStats.porAceptar > 0 ? '#ff5e3a' : '#fed7aa', action: true  },
              { label: 'Cerrados',    value: portalStats.cerrados,    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', action: false },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: '16px 18px', position: 'relative' }}>
                {s.action && s.value > 0 && (
                  <span style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: '50%', background: '#ff5e3a' }} />
                )}
                <p style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{isLoading ? '—' : s.value}</p>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: s.color, opacity: .85, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
                {s.action && s.value > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 9, color: '#ff5e3a', fontWeight: 700 }}>Requiere tu acción</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Action banner: tickets por aceptar ── */}
          {portalStats.porAceptar > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5e3a', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#c2410c', flex: 1 }}>
                Tienes {portalStats.porAceptar} solicitud{portalStats.porAceptar > 1 ? 'es' : ''} resuelta{portalStats.porAceptar > 1 ? 's' : ''} esperando tu aceptación o reapertura.
              </p>
              <ChevronRight size={14} style={{ color: '#c2410c', flexShrink: 0 }} />
            </div>
          )}

          {/* ── Mis solicitudes ── */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>

            {/* Table header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.border}`, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 1px', fontSize: 14, fontWeight: 800, color: C.navy }}>Mis solicitudes</p>
                <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{isLoading ? '…' : `${total} solicitud${total !== 1 ? 'es' : ''} en total`}</p>
              </div>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: 220 }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar solicitudes…"
                  style={{ width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: C.bg, boxSizing: 'border-box' as const }}
                />
              </div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 130px 90px', gap: 12, padding: '9px 18px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Solicitud', 'Estado', 'Prioridad', 'Responsable', 'Fecha'].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {isLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando solicitudes…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '56px 0', textAlign: 'center' }}>
                <Ticket size={28} style={{ color: C.border, display: 'block', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>
                  {tickets.length === 0 ? 'Aún no tienes solicitudes' : 'Sin resultados'}
                </p>
                {tickets.length === 0 && canCreate && moduleId && (
                  <button type="button" onClick={() => setShowCreate(true)}
                    style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Plus size={12} /> Crear primera solicitud
                  </button>
                )}
              </div>
            ) : (
              filtered.map(t => {
                const pColor = TICKET_PRIORITY_COLORS[t.priority as TicketPriority] ?? C.muted;
                const badge  = portalStateBadge(t);
                return (
                  <div key={t.id}
                    onClick={() => router.push(`${basePath}/ticket/${t.id}`)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr 110px 90px 130px 90px', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: badge.action ? '#fffbf7' : '#fff', transition: 'background .1s', borderLeft: badge.action ? '3px solid #ff5e3a' : '3px solid transparent' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = C.bg; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = badge.action ? '#fffbf7' : '#fff'; }}
                  >
                    {/* Título + ID */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                      <p style={{ margin: 0, fontSize: 10, color: C.muted }}>#{t.id.slice(-6).toUpperCase()} · {t.category_name}</p>
                    </div>
                    {/* Estado */}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', display: 'inline-block' }}>
                      {badge.label}
                    </span>
                    {/* Prioridad */}
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      {TICKET_PRIORITY_LABELS[t.priority as TicketPriority]}
                    </span>
                    {/* Técnico */}
                    <span style={{ fontSize: 11, color: t.assignee_name ? C.navy : C.muted, fontWeight: t.assignee_name ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.assignee_name ?? '— Sin asignar'}
                    </span>
                    {/* Fecha */}
                    <span style={{ fontSize: 10, color: C.muted }}>{fmtRelative(t.created_at)}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Base de conocimiento shortcut ── */}
          <div
            onClick={() => router.push(`${basePath}/knowledge`)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: `linear-gradient(135deg, #0e2235 0%, #1a3a55 100%)`, borderRadius: 14, padding: '20px 24px', cursor: 'pointer', flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Search size={20} style={{ color: '#fff' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: '#fff' }}>Base de conocimiento</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Encuentra soluciones y guías antes de crear un ticket nuevo</p>
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: C.coral, color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              Explorar artículos <ChevronRight size={13} />
            </div>
          </div>

        </div>
        {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  return (
    <>
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto', background: '#f8fafc' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '28px', border: '1px solid #e8edf3', boxShadow: '0 1px 6px rgba(0,0,0,.05)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0e2235' }}>Portal de Soporte</h2>
            <p style={{ margin: '0 0 20px', fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
              Reporta incidentes o solicita asistencia técnica. Podrás hacer seguimiento de tus reportes activos y aprobar su resolución.
            </p>
            {canCreate && moduleId && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: '#ff5e3a', border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(255,94,58,.3)' }}
              >
                <Plus size={14} />Crear Ticket Técnico
              </button>
            )}
          </div>

          <div>
            <p style={{ margin: '0 0 14px', fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>Mis Reportes Recientes</p>
            {isLoading ? (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Cargando tickets…</div>
            ) : tickets.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e8edf3', padding: '48px 0', textAlign: 'center' }}>
                <Ticket size={28} style={{ color: '#e2e8f0' }} />
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10 }}>No has creado tickets aún</p>
                {canCreate && moduleId && (
                  <button type="button" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ff5e3a', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setShowCreate(true)}>
                    <Plus size={12} />Crear primer ticket
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.cardGrid}>
                {tickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} onClick={() => router.push(`${basePath}/ticket/${t.id}`)} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className={styles.pagination} style={{ marginTop: 16 }}>
                <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
                <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
                <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && moduleId && <CreateDrawer moduleId={moduleId} onClose={() => setShowCreate(false)} />}
    </>
  );
}
