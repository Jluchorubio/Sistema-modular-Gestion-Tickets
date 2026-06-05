'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Star, Ticket, Clock, ChevronDown, History,
} from 'lucide-react';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui/Spinner';
import { modulesService } from '@/services/modules.service';
import { usersService } from '@/services/users.service';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import {
  TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  TICKET_PRIORITY_ORDER, TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
  ticketsService,
} from '@/services/tickets.service';
import type { TicketPriority } from '@/services/tickets.service';
import type { TechAvailStatus } from '@/types/module.types';
import { MODULE_ROLE_LABELS } from '@/constants/roles';
import { fmtRelativeCompact } from '@/lib/formatters';

/* ── helpers ── */
function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function isToday(dateStr: string) {
  const d = new Date(dateStr); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const AVAIL_COLORS = TECH_AVAIL_COLORS;
const AVAIL_LABELS = TECH_AVAIL_LABELS;

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= rounded ? '#f59e0b' : 'none'} color={n <= rounded ? '#f59e0b' : '#e2e8f0'} />
      ))}
      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, fontWeight: 700 }}>({rating.toFixed(1)})</span>
    </span>
  );
}

/* ── Ticket queue row ── */
function QueueRow({ ticket, basePath }: { ticket: any; basePath: string }) {
  const router    = useRouter();
  const color     = TICKET_PRIORITY_COLORS[ticket.priority as TicketPriority] ?? '#94a3b8';
  const slaColor  = ticket.sla_status ? (SLA_STATUS_COLORS[ticket.sla_status as keyof typeof SLA_STATUS_COLORS] ?? '#94a3b8') : null;
  const slaLabel  = ticket.sla_status ? (SLA_STATUS_LABELS[ticket.sla_status as keyof typeof SLA_STATUS_LABELS] ?? null) : null;
  return (
    <div
      onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
    >
      <div style={{ width: 4, borderRadius: 4, alignSelf: 'stretch', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.title}
          </p>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#0e2235', color: '#fff', flexShrink: 0 }}>
            #{ticket.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${color}22`, color, border: `1px solid ${color}44` }}>
            {TICKET_PRIORITY_LABELS[ticket.priority as TicketPriority]}
          </span>
          {ticket.category_name && <span style={{ fontSize: 10, color: '#94a3b8' }}>{ticket.category_name}</span>}
          {slaColor && slaLabel && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: `${slaColor}22`, color: slaColor, border: `1px solid ${slaColor}44`, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={8} />{slaLabel}
            </span>
          )}
          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{fmtRelativeCompact(ticket.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── StatusPicker — solo visible para el propio técnico ── */
const STATUS_OPTIONS: { value: TechAvailStatus; label: string; color: string; emoji: string }[] = [
  { value: 'disponible',    label: 'Disponible',       color: '#20c933', emoji: '🟢' },
  { value: 'ocupado',       label: 'Ocupado',          color: '#f59e0b', emoji: '🟡' },
  { value: 'en_reunion',    label: 'En reunión',       color: '#3b82f6', emoji: '🔵' },
  { value: 'fuera_horario', label: 'Fuera de horario', color: '#94a3b8', emoji: '⚫' },
  { value: 'ausente',       label: 'Ausente',          color: '#ef4444', emoji: '🔴' },
  { value: 'offline',       label: 'Offline',          color: '#64748b', emoji: '⚫' },
];

function StatusPicker({
  currentStatus, moduleId, techId, onSuccess,
}: {
  currentStatus: TechAvailStatus;
  moduleId: string;
  techId: string;
  onSuccess: () => void;
}) {
  const [open,     setOpen]     = useState(false);
  const [reason,   setReason]   = useState('');
  const [untilStr, setUntilStr] = useState('');
  const [pending,  setPending]  = useState<TechAvailStatus | null>(null);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (status: TechAvailStatus) =>
      modulesService.setTechnicianStatus(moduleId, {
        status,
        reason:         reason.trim() || undefined,
        unavailable_to: untilStr || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-technicians', moduleId] });
      setPending(null);
      setOpen(false);
      setReason('');
      setUntilStr('');
      onSuccess();
    },
  });

  const current = STATUS_OPTIONS.find(s => s.value === currentStatus) ?? STATUS_OPTIONS[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 12px', borderRadius: 9,
          border: `1.5px solid ${current.color}35`,
          background: `${current.color}10`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: current.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: current.color, flex: 1, textAlign: 'left' as const }}>
          {current.label}
        </span>
        <ChevronDown size={13} style={{ color: current.color }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setPending(opt.value); if (opt.value !== pending) mut.mutate(opt.value); }}
              disabled={mut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 14px', background: opt.value === currentStatus ? `${opt.color}10` : '#fff',
                border: 'none', borderBottom: '1px solid #f1f5f9',
                cursor: mut.isPending ? 'wait' : 'pointer', fontFamily: 'inherit',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (!mut.isPending) (e.currentTarget as HTMLButtonElement).style.background = `${opt.color}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = opt.value === currentStatus ? `${opt.color}10` : '#fff'; }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: opt.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: opt.color }}>{opt.label}</span>
              {opt.value === currentStatus && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, color: opt.color, background: `${opt.color}20`, padding: '1px 7px', borderRadius: 5 }}>ACTUAL</span>
              )}
            </button>
          ))}
          {/* Optional reason + until */}
          <div style={{ padding: '10px 14px 12px', borderTop: '1px solid #f1f5f9' }}>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Razón (opcional)"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', marginBottom: 6, boxSizing: 'border-box' as const }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Disponible desde:</label>
              <input
                type="datetime-local"
                value={untilStr}
                onChange={e => setUntilStr(e.target.value)}
                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function TechProcessPage() {
  const params   = useParams();
  const router   = useRouter();
  const techId   = params.techId as string;

  const { user } = useAuthStore();
  const isOwnProfile = user?.id === techId;

  const { modules, isLoading: modulesLoading } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  const basePath = '/helpdesk';

  const qc = useQueryClient();

  const { data: techs, isLoading: techsLoading } = useQuery({
    queryKey: ['module-technicians', helpdeskId],
    queryFn:  () => modulesService.getModuleTechnicians(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 5 * 60_000,
    refetchInterval: 30_000,
  });

  const tech = useMemo(() => techs?.find((t) => t.id === techId) ?? null, [techs, techId]);

  const { data: fullProfile } = useQuery({
    queryKey: ['user-profile', techId],
    queryFn:  () => usersService.getUser(techId),
    enabled:  !!techId,
    staleTime: 5 * 60_000,
  });

  const { data: assigned, isLoading: ticketsLoading } = useQuery({
    queryKey: ['tech-process-tickets', techId, helpdeskId],
    queryFn:  () => usersService.getUserAssignedTickets(techId, helpdeskId, 100),
    enabled:  !!techId && !!helpdeskId,
    staleTime: 60_000,
  });

  const { data: assignmentHistory = [] } = useQuery({
    queryKey: ['tech-assignment-history', techId, helpdeskId],
    queryFn:  () => ticketsService.getAssignmentHistory(techId, helpdeskId, 30),
    enabled:  !!techId && !!helpdeskId,
    staleTime: 120_000,
  });

  const { previous, today } = useMemo(() => {
    const all = assigned ?? [];
    const by = (a: any, b: any) => (TICKET_PRIORITY_ORDER[a.priority as TicketPriority] ?? 9) - (TICKET_PRIORITY_ORDER[b.priority as TicketPriority] ?? 9);
    const prev = all.filter((t) => !isToday(t.created_at)).sort(by);
    const tod  = all.filter((t) =>  isToday(t.created_at)).sort(by);
    return { previous: prev, today: tod };
  }, [assigned]);

  const all = assigned ?? [];
  const approvalCount      = all.filter((t) => t.is_approval_state && t.assignment_role === 'owner').length;
  const pausedCount        = all.filter((t) => t.is_pause_state).length;
  const collaborationCount = all.filter((t) => t.assignment_role === 'collaborator').length;

  if (modulesLoading || techsLoading) return <Spinner />;
  if (!tech) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Técnico no encontrado</p>
        <button type="button" onClick={() => router.push(basePath)} style={{ marginTop: 16, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#0e2235', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Volver al Helpdesk
        </button>
      </div>
    );
  }

  const fullName  = `${tech.first_name} ${tech.last_name}`;
  const avgRating = parseFloat(String(tech.avg_rating ?? 0));
  const perfPct   = Math.round((avgRating / 5) * 100);
  const roleLabel = MODULE_ROLE_LABELS[tech.role_name as keyof typeof MODULE_ROLE_LABELS] ?? tech.role_name;
  const ac        = AVAIL_COLORS[(tech.avail_status ?? 'disponible') as TechAvailStatus] ?? '#94a3b8';
  const availLabel = AVAIL_LABELS[(tech.avail_status ?? 'disponible') as TechAvailStatus];

  const statsRow = [
    { label: 'Esperando',      value: previous.length,    fg: '#64748b', bg: '#fafafa'  },
    { label: 'Asignados',      value: all.length,         fg: '#1d4ed8', bg: '#eff6ff'  },
    { label: 'Aprobaciones',   value: approvalCount,      fg: '#64748b', bg: '#fafafa'  },
    { label: 'Hoy',            value: today.length,       fg: '#4338ca', bg: '#eef2ff'  },
    { label: 'En espera',      value: pausedCount,        fg: '#b45309', bg: '#fffbeb'  },
    { label: 'Colaboraciones', value: collaborationCount, fg: '#64748b', bg: '#fafafa'  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: '#f8fafc' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', background: '#fff', borderBottom: '1px solid #e8edf3', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => router.push(basePath)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569', background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} /> Volver al Helpdesk
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e2e8f0', padding: '5px 16px', borderRadius: 99, border: '1px solid #cbd5e1', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Visualizador de Procesos — <span style={{ color: '#0e2235' }}>{fullName}</span>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', background: '#fff', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
        {statsRow.map((s, i) => (
          <div key={s.label} style={{ borderRight: i < 5 ? '1px solid #f1f5f9' : 'none', padding: '14px 8px', textAlign: 'center', background: s.bg }}>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 800, color: s.fg, lineHeight: 1 }}>{s.value}</span>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: s.fg, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 4, display: 'block' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── 3-column content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: profile (280px) */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #e8edf3', padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', background: '#fff' }}>

          {/* Badge propio perfil */}
          {isOwnProfile && (
            <div style={{ background: '#0e2235', borderRadius: 8, padding: '5px 10px', textAlign: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Mi perfil operativo
              </span>
            </div>
          )}

          {/* Avatar */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 14px' }}>
              {tech.avatar_url ? (
                <img src={tech.avatar_url} alt={fullName} style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: `4px solid ${ac}`, boxShadow: '0 4px 20px rgba(0,0,0,.12)' }} />
              ) : (
                <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `4px solid ${ac}`, boxShadow: '0 4px 20px rgba(0,0,0,.12)' }}>
                  {initials(fullName)}
                </div>
              )}
              <span style={{ position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, background: ac, border: '3px solid #fff', borderRadius: '50%' }} title={availLabel} />
            </div>
            <h2 style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 800, color: '#0e2235' }}>{fullName}</h2>
            {fullProfile?.username && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8' }}>@{fullProfile.username}</p>}
          </div>

          {/* Estado — solo lectura o selector según sea propio perfil */}
          <div>
            <p style={{ margin: '0 0 7px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Estado operativo{isOwnProfile ? ' — cambia tu disponibilidad' : ''}
            </p>
            {isOwnProfile && helpdeskId ? (
              <StatusPicker
                currentStatus={(tech.avail_status ?? 'offline') as TechAvailStatus}
                moduleId={helpdeskId}
                techId={techId}
                onSuccess={() => qc.invalidateQueries({ queryKey: ['module-technicians', helpdeskId] })}
              />
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 9, background: `${ac}14`, color: ac, border: `1px solid ${ac}35` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ac }} />
                {availLabel}
              </span>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: 0 }} />

          {/* Rol + especialidad */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Rol en módulo</p>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 7 }}>
                🛠️ {roleLabel.toUpperCase()}
              </span>
            </div>

            {fullProfile?.job_title && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Especialidad</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {fullProfile.job_title.split(',').map((spec, i) => (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase', whiteSpace: 'nowrap' as const }}>
                      ⚙️ {spec.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Department */}
          {fullProfile?.department && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Departamento</p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#334155' }}>{fullProfile.department}</p>
            </div>
          )}

          {/* Contact */}
          {(fullProfile?.phone || fullProfile?.email) && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Contacto</p>
              {fullProfile.email && <p style={{ margin: '0 0 3px', fontSize: 11, color: '#475569' }}>{fullProfile.email}</p>}
              {fullProfile.phone && <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{fullProfile.phone_prefix} {fullProfile.phone}</p>}
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: 0 }} />

          {/* Rating */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Valoración del técnico</p>
            <Stars rating={avgRating} size={16} />
          </div>
        </div>

        {/* Center: ticket queue */}
        <div style={{ flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto', background: '#fff', borderRight: '1px solid #e8edf3', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
            <Ticket size={14} style={{ color: '#0e2235' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '.06em' }}>Tickets asignados</span>
          </div>

          {ticketsLoading ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 32 }}>Cargando cola de trabajo…</p>
          ) : (
            <>
              {previous.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#ff5e3a', textTransform: 'uppercase', letterSpacing: '.07em' }}>Anteriores · pendientes</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{previous.length} ticket{previous.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {previous.map((t) => <QueueRow key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0e2235', textTransform: 'uppercase', letterSpacing: '.07em' }}>Hoy · actuales</span>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{today.length} ticket{today.length !== 1 ? 's' : ''}</span>
                </div>
                {today.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '16px 0' }}>Sin tickets asignados para hoy</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {today.map((t) => <QueueRow key={t.id} ticket={t} basePath={basePath} />)}
                  </div>
                )}
              </div>

              {previous.length === 0 && today.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Ticket size={32} style={{ color: '#e2e8f0' }} />
                  <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10 }}>Sin tickets asignados en este módulo</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: metrics (280px) */}
        <div style={{ width: 280, flexShrink: 0, padding: '24px 20px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

          {/* Rating */}
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Valoración media</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 34, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{avgRating.toFixed(1)}</p>
              <Stars rating={avgRating} size={15} />
            </div>
            <div style={{ background: '#e2e8f0', height: 5, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ background: '#f59e0b', height: '100%', width: `${perfPct}%`, borderRadius: 99, transition: 'width .4s' }} />
            </div>
          </div>

          {/* Carga actual */}
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Carga actual</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Activos',    value: tech.active_tickets ?? 0, color: '#0e2235' },
                { label: 'Asignados', value: all.length,                color: '#6366f1' },
                { label: 'Hoy',        value: today.length,             color: '#ff5e3a' },
                { label: 'Anteriores', value: previous.length,          color: '#f59e0b' },
              ].map((s) => (
                <div key={s.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', border: '1px solid #f1f5f9' }}>
                  <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SLA resumen */}
          {(() => {
            const breached = (all as any[]).filter(t => t.sla_status === 'breached').length;
            const critical = (all as any[]).filter(t => {
              const h = t.sla_deadline_tracked ? (new Date(t.sla_deadline_tracked).getTime() - Date.now()) / 3_600_000 : null;
              return t.sla_status === 'active' && h !== null && h < 2;
            }).length;
            const met = (all as any[]).filter(t => t.sla_status === 'met').length;
            const slaColor = breached > 0 ? '#ef4444' : critical > 0 ? '#f97316' : '#22c55e';
            const slaLabel = breached > 0 ? `${breached} vencido${breached > 1 ? 's' : ''}` : critical > 0 ? `${critical} crítico${critical > 1 ? 's' : ''}` : 'SLA al día';
            return (
              <div style={{ background: '#fff', border: `1.5px solid ${slaColor}28`, borderRadius: 12, padding: '16px 18px' }}>
                <p style={{ margin: '0 0 10px', fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Estado SLA</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: slaColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: slaColor }}>{slaLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {breached > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#fee2e2', color: '#ef4444' }}>{breached} vencido{breached > 1 ? 's' : ''}</span>}
                  {critical > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#fff7ed', color: '#f97316' }}>{critical} crítico{critical > 1 ? 's' : ''}</span>}
                  {met > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#f0fdf4', color: '#22c55e' }}>{met} cumplido{met > 1 ? 's' : ''}</span>}
                  {breached === 0 && critical === 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: '#f0fdf4', color: '#22c55e' }}>Todos en tiempo</span>}
                </div>
              </div>
            );
          })()}

          {/* Assignment history */}
          <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <History size={12} style={{ color: '#0e2235' }} />
              <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Historial de asignaciones
              </p>
            </div>

            {assignmentHistory.length === 0 ? (
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                Sin historial
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {assignmentHistory.map(a => {
                  const pColor = TICKET_PRIORITY_COLORS[a.priority as TicketPriority] ?? '#94a3b8';
                  const hoursHeld = typeof a.hours_held === 'number' ? a.hours_held : parseFloat(String(a.hours_held ?? 0));
                  const durLabel  = hoursHeld < 1
                    ? `${Math.round(hoursHeld * 60)}min`
                    : hoursHeld < 24
                    ? `${hoursHeld.toFixed(1)}h`
                    : `${(hoursHeld / 24).toFixed(1)}d`;

                  return (
                    <div
                      key={a.assignment_id}
                      onClick={() => router.push(`${basePath}/ticket/${a.ticket_id}`)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 3,
                        padding: '8px 10px', borderRadius: 8,
                        border: `1px solid ${a.is_active ? '#bfdbfe' : '#e2e8f0'}`,
                        background: a.is_active ? '#eff6ff' : '#fafafa',
                        cursor: 'pointer',
                        borderLeft: `3px solid ${pColor}`,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = a.is_active ? '#dbeafe' : '#f1f5f9'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = a.is_active ? '#eff6ff' : '#fafafa'; }}
                    >
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                          background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30` }}>
                          {TICKET_PRIORITY_LABELS[a.priority as TicketPriority]}
                        </span>
                        {a.is_final ? (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: '#f0fdf4', padding: '1px 6px', borderRadius: 99, border: '1px solid #bbf7d0' }}>
                            ✓ {a.state_label}
                          </span>
                        ) : a.is_active ? (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', padding: '1px 6px', borderRadius: 99, border: '1px solid #bfdbfe' }}>
                            {a.state_label}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: 99, border: '1px solid #e2e8f0' }}>
                            {a.state_label}
                          </span>
                        )}
                        <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 'auto' }}>
                          <Clock size={8} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                          {durLabel}
                        </span>
                      </div>
                      {a.category_name && (
                        <p style={{ margin: 0, fontSize: 9, color: '#94a3b8' }}>{a.category_name}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
