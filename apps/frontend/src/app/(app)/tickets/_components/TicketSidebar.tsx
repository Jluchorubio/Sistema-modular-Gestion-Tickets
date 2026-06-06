'use client';

import { useState } from 'react';
import {
  ChevronRight, ChevronDown, CheckCircle2, XCircle, UserX, AlertTriangle,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type TicketPriority,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  TECH_AVAIL_COLORS, TECH_AVAIL_LABELS,
  ticketsService,
} from '@/services/tickets.service';
import type { TechAvailStatus } from '@/types/module.types';
import type { ModuleTechnician } from '@/types/module.types';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { fmtDate } from '@/lib/formatters';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface TransitionItem {
  id: string; variant?: string; to_label: string; to_is_pause_state: boolean;
}

interface SlaInfo {
  color:     string;
  label:     string | null;
  countdown: string | null;
}

export interface TicketSidebarProps {
  ticketId: string;
  ticket: {
    id: string; module_id: string; module_name: string; category_name: string | null;
    damage_type_label?: string | null; priority: TicketPriority; urgency: string;
    impact: string; created_at: string; reprocess_count: number;
    is_final: boolean; is_pause_state?: boolean; escalated?: boolean; escalation_note?: string | null;
    sla_deadline_tracked?: string | null; sla_status?: string | null;
    creator_name: string;
    assignments: { id: string; user_name: string; role: string; is_active: boolean; assigned_at: string }[];
    transitions: TransitionItem[];
    pause_minutes?: number | null;
  };
  ownerAssignment: { user_name: string } | undefined;
  technicians:     ModuleTechnician[];
  sla:             SlaInfo;
  onTransition:    (transId: string, reason?: string) => void;
  mutPending: {
    transition: boolean;
  };
}

/* ── SideSection ───────────────────────────────────────────────────────── */

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
      <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 10px' }}>{label}</p>
      {children}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

export function TicketSidebar({
  ticketId, ticket, ownerAssignment, technicians, sla,
  onTransition, mutPending,
}: TicketSidebarProps) {

  /* ── FSM transition form ── */
  const [activeTransId, setActiveTransId] = useState<string | null>(null);
  const [transReason,   setTransReason]   = useState('');

  /* ── Reassign ── */
  const qcInner = useQueryClient();
  const [showReassign, setShowReassign] = useState(false);
  const reassignMut = useMutation({
    mutationFn: (techId: string) => ticketsService.addAssignment(ticketId, techId, 'owner'),
    onSuccess: () => {
      qcInner.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      qcInner.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] });
      setShowReassign(false);
    },
  });

  const VBGS: Record<string, string> = {
    success: '#059669', primary: '#ff5e3a',
    danger: '#ef4444', warning: '#f59e0b', default: '#0e2235',
  };

  /* ── Pause time display ── */
  function fmtPauseMinutes(min: number): string {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  }

  return (
    <div style={{ overflowY: 'auto', background: '#f8fafc' }}>

      {/* ── 1. Cambiar estado ── */}
      <PermissionGate perm="helpdesk:tickets:edit">
        {!ticket.is_final && ticket.transitions.length > 0 && (
          <SideSection label="Cambiar estado">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ticket.transitions.map(tr => {
                const bg   = VBGS[tr.variant ?? 'default'] ?? '#0e2235';
                const isAct = activeTransId === tr.id;
                return (
                  <div key={tr.id}>
                    <button type="button"
                      onClick={() => { setActiveTransId(isAct ? null : tr.id); setTransReason(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, border: 'none', background: isAct ? '#475569' : bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
                      {tr.variant === 'success' ? <CheckCircle2 size={12} /> : tr.variant === 'danger' ? <XCircle size={12} /> : <ChevronRight size={12} />}
                      {tr.to_label}
                    </button>
                    {isAct && (
                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {tr.to_is_pause_state ? (
                          <>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', margin: 0 }}>¿Por qué se pone en espera?</p>
                            {['Esperando usuario','Esperando proveedor','Esperando repuesto','Esperando aprobación'].map(opt => (
                              <button key={opt} type="button"
                                onClick={() => setTransReason(opt === transReason ? '' : opt)}
                                style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', border: `1.5px solid ${transReason === opt ? '#f59e0b' : '#e2e8f0'}`, background: transReason === opt ? '#fef3c7' : '#f8fafc', color: transReason === opt ? '#92400e' : '#475569' }}>
                                {opt}
                              </button>
                            ))}
                          </>
                        ) : (
                          <textarea value={transReason} onChange={e => setTransReason(e.target.value)}
                            placeholder="Motivo (opcional)…" rows={2}
                            style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', outline: 'none' }} />
                        )}
                        <button type="button"
                          disabled={mutPending.transition || (tr.to_is_pause_state && !transReason)}
                          onClick={() => { onTransition(tr.id, transReason.trim() || undefined); setActiveTransId(null); setTransReason(''); }}
                          style={{ padding: '6px 0', borderRadius: 7, background: bg, border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (mutPending.transition || (tr.to_is_pause_state && !transReason)) ? .5 : 1 }}>
                          {mutPending.transition ? 'Guardando…' : 'Confirmar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SideSection>
        )}
      </PermissionGate>

      {/* ── 2. SLA ── */}
      <SideSection label="SLA">
        {ticket.sla_deadline_tracked ? (
          <div style={{ padding: '10px 11px', background: `${sla.color}08`, borderRadius: 8, border: `1px solid ${sla.color}25` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>Deadline</span>
              {sla.label && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: `${sla.color}22`, color: sla.color, border: `1px solid ${sla.color}44` }}>
                  {sla.label}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 3px' }}>{fmtDate(ticket.sla_deadline_tracked)}</p>
            {sla.countdown && <p style={{ fontSize: 13, fontWeight: 800, color: sla.color, margin: 0 }}>{sla.countdown}</p>}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Sin SLA configurado</p>
        )}

        {/* Pause time accumulator — Fase 1E */}
        {ticket.is_pause_state && (
          <div style={{ marginTop: 8, padding: '6px 9px', borderRadius: 7, background: '#fefce8', border: '1px solid #fde68a', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>⏸</span>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#92400e', margin: '0 0 1px' }}>Ticket en pausa</p>
              {(ticket.pause_minutes ?? 0) > 0 && (
                <p style={{ fontSize: 10, color: '#a16207', margin: 0 }}>
                  Tiempo acumulado en pausa: <strong>{fmtPauseMinutes(ticket.pause_minutes!)}</strong>
                </p>
              )}
              <p style={{ fontSize: 9, color: '#ca8a04', margin: '2px 0 0' }}>El tiempo de SLA no corre mientras esté pausado.</p>
            </div>
          </div>
        )}

        {/* SLA status banners */}
        {ticket.sla_status === 'met' && (
          <div style={{ marginTop: 8, padding: '6px 9px', borderRadius: 7, background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', gap: 6 }}>
            <CheckCircle2 size={11} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#166534', margin: 0 }}>SLA cumplido en tiempo.</p>
          </div>
        )}
        {ticket.sla_status === 'breached' && (
          <div style={{ marginTop: 8, padding: '6px 9px', borderRadius: 7, background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <AlertTriangle size={11} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#991b1b', margin: 0, lineHeight: 1.4 }}>
              SLA vencido — este ticket superó el tiempo acordado.
              {ticket.sla_deadline_tracked && <> Deadline fue {fmtDate(ticket.sla_deadline_tracked)}.</>}
            </p>
          </div>
        )}
        {ticket.escalated && ticket.escalation_note?.startsWith('Auto-escalado') && (
          <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 7, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', gap: 6 }}>
            <AlertTriangle size={11} style={{ color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#9a3412', margin: 0, lineHeight: 1.4 }}>Auto-escalado por recurrencia</p>
          </div>
        )}
      </SideSection>

      {/* ── 3. Asignado a ── */}
      <SideSection label="Asignado a">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {ownerAssignment ? (
            <>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#ff5e3a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ownerAssignment.user_name?.charAt(0).toUpperCase()}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ownerAssignment.user_name}</p>
                {/* Fase 2C — active ticket count */}
                {(() => {
                  const tech = technicians.find(t => `${t.first_name} ${t.last_name}` === ownerAssignment.user_name);
                  return tech ? (
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>
                      Técnico · <strong style={{ color: tech.active_tickets > 5 ? '#f59e0b' : '#64748b' }}>{tech.active_tickets} ticket{tech.active_tickets !== 1 ? 's' : ''} activos</strong>
                    </p>
                  ) : (
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Técnico asignado</p>
                  );
                })()}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
              <UserX size={13} style={{ color: '#94a3b8' }} />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin asignar</span>
            </div>
          )}
          <PermissionGate perm="helpdesk:tickets:assign">
            {!ticket.is_final && (
              <button type="button" onClick={() => setShowReassign(v => !v)}
                style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: `1px solid ${showReassign ? '#0e2235' : '#e2e8f0'}`, background: showReassign ? '#0e2235' : '#f8fafc', color: showReassign ? '#fff' : '#64748b', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {ownerAssignment ? 'Cambiar' : 'Asignar'}
              </button>
            )}
          </PermissionGate>
        </div>

        {showReassign && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
            {[...technicians]
              .sort((a, b) => {
                const order: Record<string, number> = { disponible: 0, ocupado: 1, en_reunion: 2, ausente: 3, fuera_horario: 4, offline: 5 };
                return (order[a.avail_status] ?? 9) - (order[b.avail_status] ?? 9);
              })
              .map(t => {
                const ac = TECH_AVAIL_COLORS[t.avail_status ?? 'offline'];
                const isCurrentOwner = ownerAssignment?.user_name === `${t.first_name} ${t.last_name}`;
                return (
                  <button key={t.id} type="button"
                    disabled={reassignMut.isPending || isCurrentOwner}
                    onClick={() => reassignMut.mutate(t.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', borderRadius: 6, border: `1px solid ${isCurrentOwner ? '#e2e8f0' : '#f1f5f9'}`, background: isCurrentOwner ? '#f8fafc' : '#fff', cursor: isCurrentOwner ? 'default' : 'pointer', fontFamily: 'inherit', opacity: isCurrentOwner ? .5 : 1 }}
                    onMouseEnter={e => { if (!isCurrentOwner) (e.currentTarget as HTMLButtonElement).style.background = '#f0f4ff'; }}
                    onMouseLeave={e => { if (!isCurrentOwner) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: ac, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 11, color: '#334155', textAlign: 'left' }}>{t.first_name} {t.last_name}</span>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>{t.active_tickets} activos</span>
                    <span style={{ fontSize: 9, color: ac, fontWeight: 600 }}>{TECH_AVAIL_LABELS[t.avail_status as TechAvailStatus]}</span>
                    {isCurrentOwner && <span style={{ fontSize: 9, color: '#94a3b8' }}>actual</span>}
                  </button>
                );
              })}
          </div>
        )}
      </SideSection>

    </div>
  );
}
