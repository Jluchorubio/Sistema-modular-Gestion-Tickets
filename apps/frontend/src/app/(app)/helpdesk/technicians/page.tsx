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
import { modulesService } from '@/services/modules.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';

/* ── Design tokens ── */
const C = {
  navy:   '#0e2235',
  coral:  '#ff5e3a',
  border: '#e2e8f0',
  muted:  '#94a3b8',
  sub:    '#64748b',
  bg:     '#f8fafc',
};

const AVAIL_COLORS: Record<TechAvailStatus, string> = {
  disponible:    '#20c933',
  ocupado:       '#f59e0b',
  en_reunion:    '#3b82f6',
  fuera_horario: '#94a3b8',
  ausente:       '#ef4444',
  offline:       '#64748b',
};

const AVAIL_LABELS: Record<TechAvailStatus, string> = {
  disponible:    'Disponible',
  ocupado:       'Ocupado',
  en_reunion:    'En reunión',
  fuera_horario: 'Fuera de horario',
  ausente:       'Ausente',
  offline:       'Offline',
};

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
      <span style={{ fontSize: 10, color: C.muted, marginLeft: 3, fontWeight: 700 }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function WorkloadBar({ active }: { active: number }) {
  const pct = Math.min((active / 10) * 100, 100);
  const color = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color, minWidth: 22, textAlign: 'right' }}>{active}</span>
    </div>
  );
}

function TechCard({ tech, basePath }: { tech: ModuleTechnician; basePath: string }) {
  const router  = useRouter();
  const ac      = AVAIL_COLORS[tech.avail_status ?? 'offline'];
  const fullName = `${tech.first_name} ${tech.last_name}`;
  const roleLabel = MODULE_ROLE_LABELS[tech.role_name as keyof typeof MODULE_ROLE_LABELS] ?? tech.role_name;

  return (
    <div
      onClick={() => router.push(`${basePath}/tech/${tech.id}`)}
      style={{
        background: '#fff',
        border: `1.5px solid ${C.border}`,
        borderRadius: 14,
        padding: '20px 18px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px rgba(14,34,53,.1)';
        (e.currentTarget as HTMLDivElement).style.borderColor = `${C.coral}60`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
        (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
      }}
    >
      {/* Header: avatar + name + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {tech.avatar_url ? (
            <img src={tech.avatar_url} alt={fullName}
              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${ac}` }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${ac}` }}>
              {initials(tech)}
            </div>
          )}
          <span style={{ position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, background: ac, border: '2.5px solid #fff', borderRadius: '50%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fullName}
          </p>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${ac}18`, color: ac, border: `1px solid ${ac}35` }}>
            {AVAIL_LABELS[tech.avail_status ?? 'offline']}
          </span>
        </div>
        <ChevronRight size={14} style={{ color: C.muted, flexShrink: 0 }} />
      </div>

      {/* Role badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', textTransform: 'uppercase' }}>
          {roleLabel}
        </span>
      </div>

      {/* Workload */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ticket size={9} /> Carga activa
          </span>
        </div>
        <WorkloadBar active={tech.active_tickets ?? 0} />
      </div>

      {/* Rating */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <Stars rating={parseFloat(String(tech.avg_rating ?? 0))} />
      </div>
    </div>
  );
}

/* ── Summary card ── */
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '12px 18px', textAlign: 'center', minWidth: 90 }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
    </div>
  );
}

/* ── Main page ── */
export default function TechniciansPage() {
  const router   = useRouter();
  const { user } = useAuthStore();
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

  /* Summary counts */
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 3px' }}>
            Mesa de Ayuda
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, margin: 0 }}>
            Equipo técnico
          </h1>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatPill label="Total" value={techs.length} color={C.navy} />
          <StatPill label="Disponibles" value={available} color="#20c933" />
          <StatPill label="Ocupados" value={busy} color="#f59e0b" />
          <StatPill label="Ausentes" value={absent} color="#94a3b8" />
          <StatPill label="Tickets activos" value={totalActive} color={C.coral} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar técnico…"
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box' as const }}
          />
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {(['all', ...ALL_STATUSES] as const).map((s) => {
            const active = statusFilter === s;
            const color  = s === 'all' ? C.navy : (AVAIL_COLORS[s] ?? C.muted);
            const count  = counts[s] ?? 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 8,
                  border: `1.5px solid ${active ? color : C.border}`,
                  background: active ? `${color}15` : '#fff',
                  color: active ? color : C.sub,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s !== 'all' && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                )}
                {s === 'all' ? 'Todos' : AVAIL_LABELS[s]}
                <span style={{ fontSize: 9, opacity: .7 }}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Cargando equipo técnico…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.muted }}>Sin técnicos que coincidan.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {filtered.map((t) => (
            <TechCard key={t.id} tech={t} basePath="/helpdesk" />
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
