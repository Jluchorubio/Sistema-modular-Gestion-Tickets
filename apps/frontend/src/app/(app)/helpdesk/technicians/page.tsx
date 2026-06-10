'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Star, Ticket, ChevronRight, Search } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { TECH_AVAIL_COLORS, TECH_AVAIL_LABELS } from '@/services/tickets.service';
import { MetricCard } from '@/components/ui/MetricCard';
import { modulesService } from '@/services/modules.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import { fmtRelativeCompact } from '@/lib/formatters';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';
import styles from './technicians.module.css';

const AVAIL_COLORS = TECH_AVAIL_COLORS;
const AVAIL_LABELS = TECH_AVAIL_LABELS;

const AVAIL_ORDER: Record<TechAvailStatus, number> = {
  disponible: 0, ocupado: 1, en_reunion: 2,
  ausente: 3, fuera_horario: 4, offline: 5,
};

const ALL_STATUSES = Object.keys(AVAIL_LABELS) as TechAvailStatus[];

function initials(t: ModuleTechnician) {
  return `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
}

function Stars({ rating }: { rating: number }) {
  const r = Math.round(rating * 2) / 2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={11} fill={n <= r ? '#f59e0b' : 'none'} color={n <= r ? '#f59e0b' : '#e2e8f0'} />
      ))}
      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 3, fontWeight: 700 }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function WorkloadBar({ active }: { active: number }) {
  const pct   = Math.min((active / 10) * 100, 100);
  const color = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e';
  return (
    <div className={styles.workloadBarRow}>
      <div className={styles.workloadTrack}>
        <div className={styles.workloadFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.workloadCount} style={{ color }}>{active}</span>
    </div>
  );
}

function TechCard({ tech, basePath }: { tech: ModuleTechnician; basePath: string }) {
  const router    = useRouter();
  const ac        = AVAIL_COLORS[tech.avail_status ?? 'offline'];
  const fullName  = `${tech.first_name} ${tech.last_name}`;
  const roleLabel = MODULE_ROLE_LABELS[tech.role_name as keyof typeof MODULE_ROLE_LABELS] ?? tech.role_name;

  return (
    <div className={styles.card} onClick={() => router.push(`${basePath}/tech/${tech.id}`)}>
      {/* Header: avatar + name + status */}
      <div className={styles.cardHead}>
        <div className={styles.avatarWrap}>
          {tech.avatar_url ? (
            <img
              src={tech.avatar_url}
              alt={fullName}
              className={styles.avatarImg}
              style={{ border: `3px solid ${ac}` }}
            />
          ) : (
            <div className={styles.avatarInitials} style={{ border: `3px solid ${ac}` }}>
              {initials(tech)}
            </div>
          )}
          <span className={styles.statusDot} style={{ background: ac }} />
        </div>

        <div className={styles.cardInfo}>
          <p className={styles.cardName}>{fullName}</p>
          <span
            className={styles.cardStatusBadge}
            style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}35` }}
          >
            {AVAIL_LABELS[tech.avail_status ?? 'offline']}
          </span>
          {tech.avail_status === 'offline' && tech.last_seen_at && (
            <p className={styles.cardLastSeen}>visto {fmtRelativeCompact(tech.last_seen_at)}</p>
          )}
        </div>

        <ChevronRight size={14} className={styles.cardChevron} />
      </div>

      {/* Role badge */}
      <div className={styles.cardRole}>
        <span className={styles.roleBadge}>{roleLabel}</span>
      </div>

      {/* Workload */}
      <div className={styles.workload}>
        <div className={styles.workloadTop}>
          <span className={styles.workloadLabel}>
            <Ticket size={9} /> Carga activa
          </span>
        </div>
        <WorkloadBar active={tech.active_tickets ?? 0} />
      </div>

      {/* Rating */}
      <div className={styles.cardRating}>
        <Stars rating={parseFloat(String(tech.avg_rating ?? 0))} />
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function TechniciansPage() {
  const { user }     = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;

  const { allowed } = useHelpdeskRoleGuard(['admin_modulo', 'jefe_tecnico', 'tecnico']);

  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const [search,    setSearch]    = useState('');
  const [statusFilter, setStatus] = useState<TechAvailStatus | 'all'>('all');

  const { data: techs = [], isLoading } = useQuery({
    queryKey:  ['module-technicians', helpdeskId],
    queryFn:   () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:   !!helpdeskId,
    staleTime: 60_000,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    let list = [...techs].sort((a, b) =>
      (AVAIL_ORDER[a.avail_status ?? 'offline'] ?? 9) - (AVAIL_ORDER[b.avail_status ?? 'offline'] ?? 9)
      || (b.active_tickets ?? 0) - (a.active_tickets ?? 0),
    );
    if (statusFilter !== 'all') list = list.filter(t => t.avail_status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
        (t.role_name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [techs, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: techs.length };
    for (const s of ALL_STATUSES) c[s] = techs.filter(t => t.avail_status === s).length;
    return c;
  }, [techs]);

  const totalActive = techs.reduce((s, t) => s + (t.active_tickets ?? 0), 0);
  const available   = counts.disponible ?? 0;
  const busy        = (counts.ocupado ?? 0) + (counts.en_reunion ?? 0);
  const absent      = (counts.ausente ?? 0) + (counts.fuera_horario ?? 0) + (counts.offline ?? 0);

  if (!allowed) return null;

  return (
    <ModuleLayout
      moduleId={helpdeskId}
      title="Mesa de Ayuda"
      description=""
      isSuperadmin={isSuperadmin}
      hideInfo
    >
      {/* Header */}
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Mesa de Ayuda</p>
          <h1 className={styles.title}>Equipo técnico</h1>
        </div>
        <div className={styles.metricRow}>
          <MetricCard size="sm" label="Total"           value={techs.length} color="#0e2235"  />
          <MetricCard size="sm" label="Disponibles"     value={available}    color="#20c933"  />
          <MetricCard size="sm" label="Ocupados"        value={busy}         color="#f59e0b"  />
          <MetricCard size="sm" label="Ausentes"        value={absent}       color="#94a3b8"  />
          <MetricCard size="sm" label="Tickets activos" value={totalActive}  color="#ff5e3a"  />
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><Search size={13} /></span>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar técnico…"
          />
        </div>

        <div className={styles.filterPills}>
          {(['all', ...ALL_STATUSES] as const).map((s) => {
            const isActive = statusFilter === s;
            const color    = s === 'all' ? '#0e2235' : (AVAIL_COLORS[s] ?? '#94a3b8');
            const count    = counts[s] ?? 0;
            return (
              <button
                key={s}
                type="button"
                className={styles.filterPill}
                onClick={() => setStatus(s)}
                style={{
                  borderColor: isActive ? color : undefined,
                  background:  isActive ? `${color}15` : undefined,
                  color:       isActive ? color : undefined,
                }}
              >
                {s !== 'all' && (
                  <span className={styles.filterPillDot} style={{ background: color }} />
                )}
                {s === 'all' ? 'Todos' : AVAIL_LABELS[s]}
                <span className={styles.filterPillCount}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className={styles.loading}>Cargando equipo técnico…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>Sin técnicos que coincidan.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((t) => (
            <TechCard key={t.id} tech={t} basePath="/helpdesk" />
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
