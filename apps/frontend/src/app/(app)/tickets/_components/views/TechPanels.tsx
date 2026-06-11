'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ChevronRight } from 'lucide-react';
import {
  type TicketPriority,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
} from '@/services/tickets.service';
import { getPriorityConfig, getSlaStatusConfig } from '@/constants/status';
import { usersService } from '@/services/users.service';
import type { ModuleTechnician, TechAvailStatus } from '@/types/module.types';
import { initials, Stars, type AssignedTicket } from './shared';
import styles from '../../tickets.module.css';

const AVAIL_COLORS = TECH_AVAIL_COLORS;
const AVAIL_LABELS = TECH_AVAIL_LABELS;

/* ─────────────────── TechQueueItem ─────────────────────────────────────── */

export function TechQueueItem({ ticket, basePath }: { ticket: AssignedTicket; basePath: string }) {
  const router    = useRouter();
  const color     = getPriorityConfig(ticket.priority).color;
  const breached  = ticket.sla_status === 'breached';
  const hoursLeft = ticket.sla_deadline_tracked && !breached
    ? (new Date(ticket.sla_deadline_tracked).getTime() - Date.now()) / 3_600_000
    : null;
  const critical  = !breached && hoursLeft !== null && hoursLeft < 2;
  const slaCfg    = ticket.sla_status ? getSlaStatusConfig(ticket.sla_status) : null;
  const slaColor  = slaCfg?.text ?? null;
  const slaLabel  = slaCfg?.label ?? null;

  const rowBg     = breached ? '#fff5f5' : '#f8fafc';
  const rowBorder = breached ? '1.5px solid #fecaca' : '1px solid #e2e8f0';

  return (
    <div
      onClick={() => router.push(`${basePath}/ticket/${ticket.id}`)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: rowBg, borderRadius: 10, border: rowBorder, cursor: 'pointer', transition: 'box-shadow .15s, transform .12s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = ''; }}
    >
      <div style={{ width: 4, borderRadius: 4, alignSelf: 'stretch', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.title}
          </p>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: '#0e2235', color: '#fff', flexShrink: 0 }}>
            #{ticket.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `color-mix(in srgb, ${color} 15%, transparent)`, color, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}>
            {getPriorityConfig(ticket.priority).label}
          </span>
          {ticket.category_name && (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{ticket.category_name}</span>
          )}
          {ticket.is_pause_state && ticket.last_transition_reason && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              ⏸ {ticket.last_transition_reason}
            </span>
          )}
          {/* SLA indicators — breached pulse, critical orange, or normal label */}
          {breached ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#ef4444', background: '#fef2f2', padding: '1px 7px', borderRadius: 99, border: '1px solid #fecaca' }}>
              <span className={styles.slaPulseDot} />
              SLA vencido
            </span>
          ) : critical ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#f97316', background: '#fff7ed', padding: '1px 7px', borderRadius: 99, border: '1px solid #fed7aa' }}>
              <Clock size={9} /> {hoursLeft !== null && hoursLeft < 1 ? `${Math.round(hoursLeft * 60)}min` : `${hoursLeft?.toFixed(1)}h`}
            </span>
          ) : slaLabel && slaColor ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: slaColor }}>
              <Clock size={9} />{slaLabel}
            </span>
          ) : null}
          <span style={{ fontSize: 10, color: '#cbd5e1', marginLeft: 'auto' }}>
            por {ticket.creator_name}
          </span>
        </div>
      </div>
      <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
    </div>
  );
}

/* ─────────────────── TechCard ──────────────────────────────────────────── */

export function TechCard({
  tech, isSelected, onVerProcesos, isHelpdeskMockup = false,
}: {
  tech: ModuleTechnician;
  isSelected: boolean;
  onVerProcesos: () => void;
  isHelpdeskMockup?: boolean;
}) {
  const rating  = parseFloat(String(tech.avg_rating ?? 0));
  const availSt = (tech.avail_status ?? 'disponible') as TechAvailStatus;
  const availC  = AVAIL_COLORS[availSt] ?? '#94a3b8';

  if (isHelpdeskMockup) {
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #eef2f6',
        borderRadius: 12,
        padding: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(15,23,42,.03)',
        transition: 'border-color .15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {tech.avatar_url ? (
              <img src={tech.avatar_url} alt={tech.first_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.1)' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.1)' }}>
                {initials(`${tech.first_name} ${tech.last_name}`)}
              </div>
            )}
            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, background: availC, border: '2px solid #f8fafc', borderRadius: '50%' }} />
          </div>
          <div>
            <p style={{ margin: '0 0 1px', fontSize: 12, fontWeight: 900, color: '#0e2235', lineHeight: 1.2 }}>
              {tech.first_name} {tech.last_name}
            </p>
            {tech.username && (
              <p style={{ margin: '0 0 3px', fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>@{tech.username}</p>
            )}
            <span style={{ fontSize: 10, color: availC, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: availC, display: 'inline-block' }} />
              {AVAIL_LABELS[availSt] ?? availSt}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onVerProcesos}
          style={{
            fontSize: 10, fontWeight: 900,
            border: '1px solid #e2e8f0',
            padding: '5px 10px', borderRadius: 8,
            background: '#fff', color: '#1e293b',
            cursor: 'pointer', fontFamily: 'inherit',
            letterSpacing: '.02em', flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          }}
        >
          VER PROCESOS
        </button>
      </div>
    );
  }

  return (
    <div style={{
      border: `2px solid ${isSelected ? '#0e2235' : '#e2e8f0'}`,
      borderRadius: 12,
      padding: '12px',
      background: isSelected ? 'rgba(14,34,53,0.04)' : '#fff',
      marginBottom: 10,
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: isSelected ? '0 2px 12px rgba(14,34,53,.1)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar + status dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {tech.avatar_url ? (
              <img src={tech.avatar_url} alt={tech.first_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e2e8f0' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0e2235', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(`${tech.first_name} ${tech.last_name}`)}
              </div>
            )}
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, background: AVAIL_COLORS[(tech.avail_status ?? 'disponible') as TechAvailStatus] ?? '#94a3b8', border: '2px solid #fff', borderRadius: '50%' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              {tech.first_name} {tech.last_name}
            </p>
            {tech.username && (
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>@{tech.username}</span>
            )}
          </div>
        </div>

        {/* VER PROCESOS button */}
        <button
          type="button"
          onClick={onVerProcesos}
          style={{
            fontSize: 8.5, fontWeight: 800,
            border: `1.5px solid ${isSelected ? 'transparent' : '#0e2235'}`,
            padding: '5px 8px', borderRadius: 7,
            background: isSelected ? '#0e2235' : '#fff',
            color: isSelected ? '#fff' : '#0e2235',
            cursor: 'pointer', fontFamily: 'inherit',
            lineHeight: 1.4, textAlign: 'center' as const,
            letterSpacing: '.03em', flexShrink: 0,
          }}
        >
          VER<br />PROCESOS
        </button>
      </div>

      {/* Status + stars */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #f1f5f9', marginTop: 10, paddingTop: 8 }}>
        {(() => {
          const s = (tech.avail_status ?? 'disponible') as TechAvailStatus;
          const c = AVAIL_COLORS[s] ?? '#94a3b8';
          return (
            <span style={{ fontSize: 10, color: c, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {AVAIL_LABELS[s] ?? s}
            </span>
          );
        })()}
        <Stars rating={rating} size={10} />
      </div>
    </div>
  );
}

/* ─────────────────── AvailabilityWidget ────────────────────────────────── */

const AVAIL_STATUS_OPTIONS: { value: TechAvailStatus; label: string }[] = [
  { value: 'disponible',    label: 'Disponible'       },
  { value: 'ocupado',       label: 'Ocupado'          },
  { value: 'en_reunion',    label: 'En reunión'       },
  { value: 'fuera_horario', label: 'Fuera de horario' },
  { value: 'ausente',       label: 'Ausente'          },
  { value: 'offline',       label: 'Offline'          },
];

export function AvailabilityWidget({ userId, moduleId }: { userId: string; moduleId: string }) {
  const qc = useQueryClient();

  const { data: availList } = useQuery({
    queryKey: ['my-availability', userId],
    queryFn:  () => usersService.getMyAvailability(),
    staleTime: 60_000,
    enabled:  !!moduleId,
  });

  const current = availList?.find((a) => a.module_id === moduleId);
  const currentStatus = (current?.status ?? 'disponible') as TechAvailStatus;

  const [status, setStatus]         = useState<TechAvailStatus>('disponible');
  const [unavailTo, setUnavailTo]   = useState('');
  const [notes, setNotes]           = useState('');
  const [open, setOpen]             = useState(false);

  useEffect(() => {
    if (!open) setStatus(currentStatus);
  }, [currentStatus, open]);

  const mut = useMutation({
    mutationFn: () => usersService.setMyAvailability({
      module_id:      moduleId,
      status,
      unavailable_to: unavailTo || undefined,
      notes:          notes     || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-availability', userId] });
      qc.invalidateQueries({ queryKey: ['module-technicians', moduleId] });
      setOpen(false);
    },
  });

  const color = AVAIL_COLORS[currentStatus];

  return (
    <div style={{ background: '#fff', padding: 14, borderRadius: 14, border: '1px solid #e8edf3' }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em' }}>Mi disponibilidad</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
          {AVAIL_LABELS[currentStatus]}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: open ? '#0e2235' : '#f8fafc', color: open ? '#fff' : '#475569', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {open ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TechAvailStatus)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0f172a' }}
          >
            {AVAIL_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {['fuera_horario', 'ausente', 'offline'].includes(status) && (
            <div>
              <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>Disponible de nuevo el</p>
              <input
                type="datetime-local"
                value={unavailTo}
                onChange={(e) => setUnavailTo(e.target.value)}
                style={{ width: '100%', padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nota opcional…"
            rows={2}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
          />

          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            style={{ padding: '7px 0', borderRadius: 8, background: '#ff5e3a', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: mut.isPending ? .7 : 1 }}
          >
            {mut.isPending ? 'Guardando…' : 'Guardar estado'}
          </button>
        </div>
      )}
    </div>
  );
}
