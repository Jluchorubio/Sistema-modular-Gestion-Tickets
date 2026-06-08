'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ticket, Clock, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useHelpdeskRoleGuard } from '@/hooks/useHelpdeskRole';
import {
  type TicketPriority,
  TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS,
  SLA_STATUS_COLORS, TICKET_PRIORITY_ORDER,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import type { TechAvailStatus } from '@/types/module.types';
import styles from './workspace.module.css';

const AVAIL_OPTIONS = Object.entries(TECH_AVAIL_LABELS) as [TechAvailStatus, string][];

function isToday(d: string) {
  const dt = new Date(d); const n = new Date();
  return dt.getFullYear() === n.getFullYear() && dt.getMonth() === n.getMonth() && dt.getDate() === n.getDate();
}

function hoursLeft(d: string | null): number | null {
  if (!d) return null;
  return (new Date(d).getTime() - Date.now()) / 3_600_000;
}

function fmtHours(h: number): string {
  if (h < 0)  return `-${Math.abs(h).toFixed(0)}h`;
  if (h < 1)  return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
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

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(r => r.module_id === helpdeskId && r.status === 'active')?.role_name ?? null;
  }, [user, helpdeskId]);

  const roleLabel = MODULE_ROLE_LABELS[moduleRole as keyof typeof MODULE_ROLE_LABELS] ?? moduleRole ?? 'Técnico';

  const { data: availList, refetch: refetchAvail } = useQuery({
    queryKey: ['my-availability', user?.id],
    queryFn:  () => usersService.getMyAvailability(),
    enabled:  !!helpdeskId,
    staleTime: 60_000,
  });
  const myAvailStatus = ((availList?.find(a => a.module_id === helpdeskId)?.status) ?? 'disponible') as TechAvailStatus;

  const [showAvailPicker, setShowAvailPicker] = useState(false);
  const [activeFilter,    setActiveFilter]    = useState<'all' | 'approval' | 'breached'>('all');

  const availMut = useMutation({
    mutationFn: (status: TechAvailStatus) => usersService.setMyAvailability({ module_id: helpdeskId!, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-availability', user?.id] });
      qc.invalidateQueries({ queryKey: ['module-technicians', helpdeskId] });
      setShowAvailPicker(false);
      refetchAvail();
    },
  });

  const { data: assigned = [], isLoading } = useQuery({
    queryKey: ['my-assigned-tickets', helpdeskId],
    queryFn:  () => usersService.getMyAssignedTickets(helpdeskId!, 200),
    enabled:  !!helpdeskId && !!user?.id,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => ({
    total:            assigned.length,
    pending:          assigned.filter(t => !t.is_final).length,
    breached:         assigned.filter(t => (t as any).sla_status === 'breached').length,
    critical:         assigned.filter(t => { const h = hoursLeft((t as any).sla_deadline_tracked ?? null); return (t as any).sla_status === 'active' && h !== null && h < 2; }).length,
    pending_approval: assigned.filter(t => t.is_approval_state).length,
    today:            assigned.filter(t => isToday(t.created_at)).length,
  }), [assigned]);

  const sorted = useMemo(() => {
    let list = [...assigned].filter(t => !t.is_final);
    if (activeFilter === 'approval') list = list.filter(t => t.is_approval_state);
    if (activeFilter === 'breached') list = list.filter(t => (t as any).sla_status === 'breached');
    return list.sort((a, b) => {
      const po = ((TICKET_PRIORITY_ORDER as Record<string, number>)[a.priority] ?? 9) - ((TICKET_PRIORITY_ORDER as Record<string, number>)[b.priority] ?? 9);
      if (po !== 0) return po;
      const ha = hoursLeft((a as any).sla_deadline_tracked ?? null);
      const hb = hoursLeft((b as any).sla_deadline_tracked ?? null);
      if (ha !== null && hb !== null) return ha - hb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [assigned, activeFilter]);

  const acColor = TECH_AVAIL_COLORS[myAvailStatus];

  if (!allowed) return null;

  return (
    <ModuleLayout moduleId={helpdeskId} title="Mesa de Ayuda" description="" isSuperadmin={isSuperadmin} hideInfo>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {/* Avatar */}
          <div className={styles.avatarWrap}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className={styles.avatarImg} style={{ border: `3px solid ${acColor}` }} />
            ) : (
              <div className={styles.avatarInitials} style={{ border: `3px solid ${acColor}` }}>
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
            )}
            <span className={styles.avatarDot} style={{ background: acColor }} />
          </div>

          <div>
            <p className={styles.eyebrow}>Mi espacio de trabajo</p>
            <h1 className={styles.name}>{user?.first_name} {user?.last_name}</h1>
            <div className={styles.badges}>
              <span className={styles.roleBadge}>{roleLabel}</span>
              <button type="button" onClick={() => setShowAvailPicker(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${acColor}18`, color: acColor, border: `1px solid ${acColor}35`, cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: acColor }} />
                {TECH_AVAIL_LABELS[myAvailStatus]}
                {availMut.isPending ? ' …' : ' ▾'}
              </button>
            </div>
          </div>
        </div>

        {/* Stat pills */}
        <div className={styles.statPills}>
          {[
            { label: 'Activos',    value: stats.pending,          color: '#ff5e3a', filter: 'all'      as const },
            { label: 'Aprobación', value: stats.pending_approval, color: '#f59e0b', filter: 'approval' as const },
            ...(stats.breached > 0 ? [{ label: 'Vencidos', value: stats.breached, color: '#ef4444', filter: 'breached' as const }] : []),
          ].map(s => {
            const isActive = activeFilter === s.filter;
            return (
              <button key={s.label} type="button" onClick={() => setActiveFilter(isActive ? 'all' : s.filter)}
                className={styles.statPill}
                style={{ background: isActive ? `${s.color}12` : '#fff', borderColor: isActive ? s.color : '#e2e8f0' }}>
                <p className={styles.statPillValue} style={{ color: s.color }}>{s.value}</p>
                <p className={styles.statPillLabel} style={{ color: isActive ? s.color : '#94a3b8' }}>{s.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability picker */}
      {showAvailPicker && (
        <div className={styles.availPicker}>
          <p className={styles.availPickerLabel}>Cambiar disponibilidad</p>
          <div className={styles.availOptions}>
            {AVAIL_OPTIONS.map(([val, lbl]) => {
              const c = TECH_AVAIL_COLORS[val];
              const active = val === myAvailStatus;
              return (
                <button key={val} type="button"
                  onClick={() => availMut.mutate(val)}
                  disabled={availMut.isPending}
                  className={styles.availOption}
                  style={{ borderColor: active ? c : '#e2e8f0', background: active ? `${c}15` : '#fff', color: active ? c : '#64748b' }}>
                  <span className={styles.availDot} style={{ background: c }} />
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
        <div className={styles.slaAlert}>
          <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
          {stats.breached > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{stats.breached} ticket{stats.breached > 1 ? 's' : ''} con SLA vencido</span>}
          {stats.critical > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginLeft: stats.breached > 0 ? 8 : 0 }}>{stats.critical} crítico{stats.critical > 1 ? 's' : ''} &lt;2h</span>}
          <button type="button" onClick={() => router.push('/helpdesk/sla')} className={styles.slaAlertLink}>
            Ver SLA <ChevronRight size={10} />
          </button>
        </div>
      )}

      {/* Ticket list */}
      {isLoading ? (
        <div className={styles.loadingState}>Cargando cola de trabajo…</div>
      ) : sorted.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', display: 'block', margin: '0 auto 12px' }} />
          <p className={styles.emptyTitle}>Sin tickets activos</p>
          <p className={styles.emptyDesc}>Todos los tickets están cerrados o sin tickets asignados.</p>
        </div>
      ) : (
        <div className={styles.ticketList}>
          <div className={`${styles.ticketListGrid} ${styles.listHeader}`}>
            {['Ticket', 'Categoría', 'Prioridad', 'SLA', ''].map((h, i) => (
              <span key={i} className={styles.headerCell}>{h}</span>
            ))}
          </div>

          {sorted.map(t => {
            const pColor     = TICKET_PRIORITY_COLORS[t.priority as TicketPriority] ?? '#94a3b8';
            const slaSt      = (t as any).sla_status as string | null;
            const slaColor   = slaSt ? (SLA_STATUS_COLORS[slaSt as keyof typeof SLA_STATUS_COLORS] ?? null) : null;
            const h          = hoursLeft((t as any).sla_deadline_tracked ?? null);
            const isBreached = slaSt === 'breached';
            const isCrit     = slaSt === 'active' && h !== null && h < 2;
            const rowState   = isBreached ? 'breached' : isCrit ? 'critical' : 'normal';
            const leftColor  = isBreached ? '#ef4444' : isCrit ? '#f97316' : pColor;

            return (
              <div key={t.id}
                className={`${styles.ticketListGrid} ${styles.ticketRow}`}
                data-state={rowState}
                style={{ borderLeft: `3px solid ${leftColor}` }}
                onClick={() => router.push('/helpdesk/ticket/' + t.id)}
              >
                <div style={{ minWidth: 0 }}>
                  <p className={styles.ticketTitle}>{t.title}</p>
                  <p className={styles.ticketMeta}>
                    #{t.id.slice(-6).toUpperCase()} · {t.creator_name} ·{' '}
                    <span style={{ color: isBreached ? '#ef4444' : isCrit ? '#f97316' : '#94a3b8' }}>{t.state_name}</span>
                    {t.is_pause_state && t.last_transition_reason && (
                      <span style={{ marginLeft: 6, color: '#92400e', fontWeight: 600 }}>⏸ {t.last_transition_reason}</span>
                    )}
                  </p>
                </div>
                <span className={styles.ticketCategory}>{t.category_name}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30`, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>
                  {TICKET_PRIORITY_LABELS[t.priority as TicketPriority]}
                </span>
                <span className={styles.slaTime} style={{ color: slaColor ?? '#94a3b8' }}>
                  {h !== null ? fmtHours(h) : '—'}
                </span>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <button type="button" onClick={() => router.push('/helpdesk/queue')} className={styles.footerBtn}>
          <Ticket size={12} /> Ver cola sin asignar
        </button>
        <button type="button" onClick={() => helpdeskId && router.push('/helpdesk/tech/' + user?.id)} className={styles.footerBtn}>
          Mi perfil operativo →
        </button>
        <button type="button" onClick={() => router.push('/helpdesk/sla')} className={styles.footerBtn}>
          <Clock size={12} /> Ver SLA
        </button>
      </div>
    </ModuleLayout>
  );
}
