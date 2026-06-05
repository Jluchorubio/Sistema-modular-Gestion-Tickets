'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, Clock, Star, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import { ticketsService, type TicketPriority, TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS, SLA_STATUS_COLORS, TICKET_PRIORITY_ORDER, TECH_AVAIL_COLORS, TECH_AVAIL_LABELS } from '@/services/tickets.service';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import { fmtRelativeCompact } from '@/lib/formatters';
import type { TechAvailStatus } from '@/types/module.types';

const C = { navy: '#0e2235', coral: '#ff5e3a', border: '#e2e8f0', muted: '#94a3b8', sub: '#64748b', bg: '#f8fafc' };

const AVAIL_COLORS = TECH_AVAIL_COLORS;
const AVAIL_LABELS = TECH_AVAIL_LABELS;
const AVAIL_OPTIONS = Object.entries(AVAIL_LABELS) as [TechAvailStatus, string][];
const PRIORITY_ORDER = TICKET_PRIORITY_ORDER;

function isToday(d: string) {
  const dt = new Date(d); const n = new Date();
  return dt.getFullYear() === n.getFullYear() && dt.getMonth() === n.getMonth() && dt.getDate() === n.getDate();
}

function hoursLeft(d: string | null): number | null {
  if (!d) return null;
  return (new Date(d).getTime() - Date.now()) / 3_600_000;
}

export default function WorkspacePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperadmin = user?.is_superadmin ?? false;
  const qc = useQueryClient();

  const { allowed } = useHelpdeskRoleGuard(['admin_modulo', 'jefe_tecnico', 'tecnico']);

  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  /* Role check */
  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);

  const roleLabel = MODULE_ROLE_LABELS[moduleRole as keyof typeof MODULE_ROLE_LABELS] ?? moduleRole ?? 'Técnico';

  /* Availability */
  const { data: availList, refetch: refetchAvail } = useQuery({
    queryKey: ['my-availability', user?.id],
    queryFn:  () => usersService.getMyAvailability(),
    enabled:  !!helpdeskId,
    staleTime: 60_000,
  });
  const myAvailStatus = ((availList?.find(a => a.module_id === helpdeskId)?.status) ?? 'disponible') as TechAvailStatus;

  const [showAvailPicker, setShowAvailPicker] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TechAvailStatus>(myAvailStatus);
  const [activeFilter, setActiveFilter] = useState<'all' | 'approval' | 'breached'>('all');

  const availMut = useMutation({
    mutationFn: (status: TechAvailStatus) => usersService.setMyAvailability({ module_id: helpdeskId!, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-availability', user?.id] });
      qc.invalidateQueries({ queryKey: ['module-technicians', helpdeskId] });
      setShowAvailPicker(false);
      refetchAvail();
    },
  });

  /* Assigned tickets */
  const { data: assigned = [], isLoading } = useQuery({
    queryKey: ['my-assigned-tickets', helpdeskId],
    queryFn:  () => usersService.getMyAssignedTickets(helpdeskId!, 200),
    enabled:  !!helpdeskId && !!user?.id,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  /* Stats */
  const stats = useMemo(() => ({
    total:     assigned.length,
    pending:   assigned.filter(t => !t.is_final).length,
    breached:  assigned.filter(t => (t as any).sla_status === 'breached').length,
    critical:  assigned.filter(t => { const h = hoursLeft((t as any).sla_deadline_tracked ?? null); return (t as any).sla_status === 'active' && h !== null && h < 2; }).length,
    pending_approval: assigned.filter(t => t.is_approval_state).length,
    today:     assigned.filter(t => isToday(t.created_at)).length,
  }), [assigned]);

  /* Sort: priority → SLA urgency */
  const sorted = useMemo(() => {
    let list = [...assigned].filter(t => !t.is_final);
    if (activeFilter === 'approval') list = list.filter(t => t.is_approval_state);
    if (activeFilter === 'breached') list = list.filter(t => (t as any).sla_status === 'breached');
    return list.sort((a, b) => {
      const po = ((PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9) - ((PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9);
      if (po !== 0) return po;
      const ha = hoursLeft((a as any).sla_deadline_tracked ?? null);
      const hb = hoursLeft((b as any).sla_deadline_tracked ?? null);
      if (ha !== null && hb !== null) return ha - hb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [assigned, activeFilter]);

  const acColor = AVAIL_COLORS[myAvailStatus];

  if (!allowed) return null;

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${acColor}` }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.navy, color: '#fff', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${acColor}` }}>
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
            )}
            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 13, height: 13, background: acColor, border: '2.5px solid #fff', borderRadius: '50%' }} />
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, color: C.coral, textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 2px' }}>Mi espacio de trabajo</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.navy, margin: '0 0 3px' }}>{user?.first_name} {user?.last_name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>{roleLabel}</span>
              {/* Availability badge */}
              <button type="button" onClick={() => setShowAvailPicker(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${acColor}18`, color: acColor, border: `1px solid ${acColor}35`, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: acColor }} />
                {AVAIL_LABELS[myAvailStatus]}
                {availMut.isPending ? ' …' : ' ▾'}
              </button>
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Activos',    value: stats.pending,          color: C.coral,    filter: 'all'      as const },
            { label: 'Aprobación', value: stats.pending_approval, color: '#f59e0b',  filter: 'approval' as const },
            ...(stats.breached > 0 ? [{ label: 'Vencidos', value: stats.breached, color: '#ef4444', filter: 'breached' as const }] : []),
          ].map(s => {
            const isActive = activeFilter === s.filter;
            return (
              <button key={s.label} type="button" onClick={() => setActiveFilter(isActive ? 'all' : s.filter)}
                style={{ background: isActive ? `${s.color}12` : '#fff', border: `1.5px solid ${isActive ? s.color : C.border}`, borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 72, cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .15s, background .15s' }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</p>
                <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 700, color: isActive ? s.color : C.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability picker */}
      {showAvailPicker && (
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16, boxShadow: '0 4px 20px rgba(14,34,53,.08)' }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 10px' }}>Cambiar disponibilidad</p>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {AVAIL_OPTIONS.map(([val, lbl]) => {
              const c = AVAIL_COLORS[val];
              const active = val === myAvailStatus;
              return (
                <button key={val} type="button"
                  onClick={() => { setPendingStatus(val); availMut.mutate(val); }}
                  disabled={availMut.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${active ? c : C.border}`, background: active ? `${c}15` : '#fff', color: active ? c : C.sub, fontSize: 11, fontWeight: 700, cursor: availMut.isPending ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                  {lbl}
                  {active && <CheckCircle2 size={11} style={{ color: c }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SLA alerts */}
      {(stats.breached > 0 || stats.critical > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 9, marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          {stats.breached > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{stats.breached} ticket{stats.breached > 1 ? 's' : ''} con SLA vencido</span>}
          {stats.critical > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginLeft: stats.breached > 0 ? 8 : 0 }}>{stats.critical} crítico{stats.critical > 1 ? 's' : ''} &lt;2h</span>}
          <button type="button" onClick={() => router.push('/helpdesk/sla')}
            style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
            Ver SLA <ChevronRight size={10} />
          </button>
        </div>
      )}

      {/* Ticket list */}
      {isLoading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando cola de trabajo…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.navy, margin: '0 0 4px' }}>Sin tickets activos</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Todos los tickets están cerrados o sin tickets asignados.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 56px', gap: 12, padding: '10px 16px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            {['Ticket', 'Categoría', 'Prioridad', 'SLA', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.07em' }}>{h}</span>
            ))}
          </div>

          {sorted.map(t => {
            const pColor    = TICKET_PRIORITY_COLORS[t.priority as TicketPriority] ?? C.muted;
            const slaSt     = (t as any).sla_status as string | null;
            const slaColor  = slaSt ? (SLA_STATUS_COLORS[slaSt as keyof typeof SLA_STATUS_COLORS] ?? null) : null;
            const h         = hoursLeft((t as any).sla_deadline_tracked ?? null);
            const isBreached = slaSt === 'breached';
            const isCrit     = slaSt === 'active' && h !== null && h < 2;

            return (
              <div key={t.id}
                onClick={() => router.push('/helpdesk/ticket/' + t.id)}
                style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 90px 56px', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid ${C.border}`, background: isBreached ? '#fef2f2' : isCrit ? '#fff7ed' : '#fff', cursor: 'pointer', borderLeft: `3px solid ${pColor}`, transition: 'background .1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isBreached ? '#fee2e2' : isCrit ? '#ffedd5' : C.bg; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isBreached ? '#fef2f2' : isCrit ? '#fff7ed' : '#fff'; }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 700, color: C.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                  <p style={{ margin: 0, fontSize: 9.5, color: C.muted }}>
                    #{t.id.slice(-6).toUpperCase()} · {t.creator_name} · <span style={{ color: isBreached ? '#ef4444' : isCrit ? '#f97316' : C.muted }}>{t.state_name}</span>
                    {t.is_pause_state && t.last_transition_reason && (
                      <span style={{ marginLeft: 6, color: '#92400e', fontWeight: 600 }}>⏸ {t.last_transition_reason}</span>
                    )}
                  </p>
                </div>
                <span style={{ fontSize: 10, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.category_name}</span>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {TICKET_PRIORITY_LABELS[t.priority as TicketPriority]}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: slaColor ?? C.muted, fontFamily: 'monospace' }}>
                  {h !== null ? (h < 0 ? `-${Math.abs(h).toFixed(0)}h` : h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(1)}h`) : '—'}
                </span>
                <ChevronRight size={13} style={{ color: C.muted }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Footer links */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.push('/helpdesk/queue')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Ticket size={12} /> Ver cola sin asignar
        </button>
        <button type="button" onClick={() => helpdeskId && router.push('/helpdesk/tech/' + user?.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
          Mi perfil operativo →
        </button>
        <button type="button" onClick={() => router.push('/helpdesk/sla')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: 11, fontWeight: 700, color: C.navy, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Clock size={12} /> Ver SLA
        </button>
      </div>
    </ModuleLayout>
  );
}
