'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight, AlertTriangle, CheckCircle2, XCircle,
  Phone, X, Link2, Search, Unlink, UserX,
} from 'lucide-react';
import {
  type TicketAsset, type TicketPriority,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
  ASSET_STATUS_COLORS, ASSET_STATUS_LABELS,
} from '@/services/tickets.service';
import {
  type TicketMeeting,
  PROVIDER_LABELS, PROVIDER_COLORS,
  STATUS_LABELS, STATUS_COLORS,
} from '@/services/meetings.service';
import type { ModuleTechnician } from '@/types/module.types';
import type { LocalGuest } from './hooks/useTicketData';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface RelationItem {
  id: string; relation_type: string;
  related_id: string; related_title: string;
}

interface TransitionItem {
  id: string; variant?: string; to_label: string;
}

interface SlaInfo {
  color:     string;
  label:     string | null;
  countdown: string | null;
}

export interface TicketSidebarProps {
  ticketId: string;
  ticket: {
    id: string; module_name: string; category_name: string | null;
    damage_type_label?: string | null; priority: TicketPriority; urgency: string;
    impact: string; created_at: string; reprocess_count: number;
    is_final: boolean; escalated?: boolean; escalation_note?: string | null;
    sla_deadline_tracked?: string | null; sla_status?: string | null;
    creator_name: string;
    assignments: { id: string; user_name: string; role: string; is_active: boolean; assigned_at: string }[];
    transitions: TransitionItem[];
  };
  ownerAssignment: { user_name: string } | undefined;
  allGuests:       LocalGuest[];
  linkedAssets:    TicketAsset[];
  meetings:        TicketMeeting[];
  relations:       RelationItem[];
  technicians:     ModuleTechnician[];
  sla:             SlaInfo;
  /* Callbacks */
  onTransition:      (transId: string, reason?: string) => void;
  onCancelMeeting:   (meetingId: string) => void;
  onScheduleMeeting: (data: { provider: string; reason: string; scheduledAt: string; url?: string }) => void;
  onAddRelation:     (targetId: string, relationType: string, notes?: string) => Promise<void>;
  onRemoveRelation:  (relId: string) => void;
  onInstantCall:     (userId: string, setUserId: (v: string) => void, setCalling: (v: boolean) => void) => void;
  onRemoveGuest:     (id: string) => void;
  onSearchTickets:   (q: string, exclude: string) => Promise<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>;
  mutPending: {
    transition:   boolean;
    schedule:     boolean;
    cancelMeet:   boolean;
    addRel:       boolean;
    removeRel:    boolean;
  };
}

/* ── Sub-component helper ───────────────────────────────────────────────── */

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
  ticketId, ticket, ownerAssignment, allGuests, linkedAssets, meetings,
  relations, technicians, sla,
  onTransition, onCancelMeeting, onScheduleMeeting, onAddRelation,
  onRemoveRelation, onInstantCall, onRemoveGuest, onSearchTickets,
  mutPending,
}: TicketSidebarProps) {
  const router = useRouter();

  /* ── FSM transition form ── */
  const [activeTransId, setActiveTransId] = useState<string | null>(null);
  const [transReason,   setTransReason]   = useState('');

  /* ── Participants / instant call ── */
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isCalling,      setIsCalling]      = useState(false);

  /* ── Meeting form ── */
  const [meetingProvider, setMeetingProvider] = useState<'google_meet' | 'teams' | 'zoom' | 'internal'>('google_meet');
  const [meetingReason,   setMeetingReason]   = useState('Asesoramiento técnico');
  const [meetingUrl,      setMeetingUrl]      = useState('');
  const [scheduledDate,   setScheduledDate]   = useState('');
  const [scheduledTime,   setScheduledTime]   = useState('10:00');

  /* ── Relation form ── */
  const [showRelForm,      setShowRelForm]      = useState(false);
  const [relSearch,        setRelSearch]        = useState('');
  const [relType,          setRelType]          = useState('related');
  const [relNotes,         setRelNotes]         = useState('');
  const [relTarget,        setRelTarget]        = useState<{ id: string; title: string } | null>(null);
  const [relResults,       setRelResults]       = useState<{ id: string; title: string; priority: string; state_label: string; is_final: boolean }[]>([]);
  const [relSearching,     setRelSearching]     = useState(false);

  async function handleRelSearch(q: string) {
    setRelSearch(q);
    setRelTarget(null);
    if (q.trim().length < 2) { setRelResults([]); return; }
    setRelSearching(true);
    try { setRelResults(await onSearchTickets(q.trim(), ticketId)); }
    finally { setRelSearching(false); }
  }

  async function handleAddRelation() {
    if (!relTarget) return;
    await onAddRelation(relTarget.id, relType, relNotes.trim() || undefined);
    setShowRelForm(false);
    setRelSearch('');
    setRelTarget(null);
    setRelResults([]);
    setRelNotes('');
  }

  const VBGS: Record<string, string> = {
    success: '#059669', primary: '#ff5e3a',
    danger: '#ef4444', warning: '#f59e0b', default: '#0e2235',
  };

  return (
    <div style={{ overflowY: 'auto', background: '#fff' }}>

      {/* Asignado a */}
      <SideSection label="Asignado a">
        {ownerAssignment ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#ff5e3a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ownerAssignment.user_name?.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ownerAssignment.user_name}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Técnico asignado</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <UserX size={13} style={{ color: '#94a3b8' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin asignar</span>
          </div>
        )}
      </SideSection>

      {/* Historial de técnicos */}
      {ticket.assignments.filter(a => a.role === 'owner').length > 1 && (
        <SideSection label="Historial de técnicos">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ticket.assignments.filter(a => a.role === 'owner').map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: a.is_active ? '#ff5e3a' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: a.is_active ? '#fff' : '#94a3b8' }}>{a.user_name?.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: a.is_active ? '#0e2235' : '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_name}</p>
                  <p style={{ margin: 0, fontSize: 9.5, color: '#94a3b8' }}>{fmtRelative(a.assigned_at)}</p>
                </div>
                {a.is_active && (
                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: '#fff5f3', color: '#ff5e3a', border: '1px solid #ffd0c4', flexShrink: 0 }}>ACTUAL</span>
                )}
              </div>
            ))}
          </div>
        </SideSection>
      )}

      {/* Solicitante */}
      <SideSection label="Solicitante">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{ticket.creator_name?.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: 0 }}>{ticket.creator_name}</p>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: '1px 0 0' }}>Solicitante</p>
          </div>
        </div>
      </SideSection>

      {/* Cambiar estado */}
      <PermissionGate perm="helpdesk:tickets:edit">
        {!ticket.is_final && ticket.transitions.length > 0 && (
          <SideSection label="Cambiar estado">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ticket.transitions.map(tr => {
                const bg = VBGS[tr.variant ?? 'default'] ?? '#0e2235';
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
                        <textarea value={transReason} onChange={e => setTransReason(e.target.value)}
                          placeholder="Motivo (opcional)…" rows={2}
                          style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box', outline: 'none' }} />
                        <button type="button" disabled={mutPending.transition}
                          onClick={() => { onTransition(tr.id, transReason.trim() || undefined); setActiveTransId(null); setTransReason(''); }}
                          style={{ padding: '6px 0', borderRadius: 7, background: bg, border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: mutPending.transition ? .7 : 1 }}>
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

      {/* Detalles */}
      <SideSection label="Detalles">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            ['Módulo',       ticket.module_name],
            ['Categoría',    ticket.category_name],
            ['Tipo de daño', ticket.damage_type_label],
            ['Prioridad',    ticket.priority],
            ['Urgencia',     ticket.urgency],
            ['Impacto',      ticket.impact],
            ['Creado',       fmtDate(ticket.created_at)],
            ['ID',           '#' + ticket.id.slice(0, 8).toUpperCase()],
            ...(ticket.reprocess_count > 0 ? [['Reaperturas', String(ticket.reprocess_count)]] : []),
          ] as [string, string | null | undefined][]).map(([lbl, val]) => val ? (
            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{lbl}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{val}</span>
            </div>
          ) : null)}
        </div>
      </SideSection>

      {/* SLA */}
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
        {ticket.escalated && ticket.escalation_note?.startsWith('Auto-escalado') && (
          <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 7, background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', gap: 6 }}>
            <AlertTriangle size={11} style={{ color: '#ea580c', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10, color: '#9a3412', margin: 0, lineHeight: 1.4 }}>Auto-escalado por recurrencia</p>
          </div>
        )}
      </SideSection>

      {/* Activo */}
      {linkedAssets.length > 0 && (
        <SideSection label={`Activo (${linkedAssets.length})`}>
          {linkedAssets.map(asset => {
            const sc = ASSET_STATUS_COLORS[asset.status] ?? '#94a3b8';
            return (
              <div key={asset.id} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0e2235', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: `${sc}18`, color: sc, border: `1px solid ${sc}30` }}>
                    {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
                  </span>
                  <button type="button" onClick={() => router.push('/inventory/' + asset.id)}
                    style={{ fontSize: 10, fontWeight: 700, color: '#ff5e3a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                    Ver <ChevronRight size={10} />
                  </button>
                </div>
                {asset.assigned_to_name && (
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>Custodio: {asset.assigned_to_name}</p>
                )}
              </div>
            );
          })}
        </SideSection>
      )}

      {/* Participantes */}
      <SideSection label={`Participantes (${allGuests.length})`}>
        {allGuests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {allGuests.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{g.name.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                  <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>{g.role}</p>
                </div>
                {g.isLocal && (
                  <button type="button" onClick={() => onRemoveGuest(g.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0 }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
          style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', marginBottom: 6, boxSizing: 'border-box' }}>
          <option value="">Invitar tecnico...</option>
          {technicians.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
        </select>
        <button type="button" disabled={!selectedUserId || isCalling}
          onClick={() => onInstantCall(selectedUserId, setSelectedUserId, setIsCalling)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '6px', borderRadius: 7, border: 'none', background: selectedUserId && !isCalling ? '#0e2235' : '#e2e8f0', color: selectedUserId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: selectedUserId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          <Phone size={11} /> {isCalling ? 'Invitando...' : 'Invitar'}
        </button>
      </SideSection>

      {/* Reuniones */}
      <SideSection label={meetings.length > 0 ? `Reuniones (${meetings.length})` : 'Reuniones'}>
        {meetings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {meetings.map(m => {
              const pc  = PROVIDER_COLORS[m.provider] ?? '#64748b';
              const sc2 = STATUS_COLORS[m.status]   ?? '#64748b';
              const dt  = new Date(m.scheduled_at);
              return (
                <div key={m.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0', opacity: m.status === 'cancelled' ? .5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: pc, textTransform: 'uppercase' }}>{PROVIDER_LABELS[m.provider]}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: sc2 }}>{STATUS_LABELS[m.status]}</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 1px' }}>{m.reason}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                    {dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {m.meeting_url && m.status !== 'cancelled' && (
                    <a href={m.meeting_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: pc, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}>Unirse</a>
                  )}
                  {m.status === 'scheduled' && (
                    <button type="button" disabled={mutPending.cancelMeet} onClick={() => onCancelMeeting(m.id)}
                      style={{ display: 'block', marginTop: 3, fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <select value={meetingProvider} onChange={e => setMeetingProvider(e.target.value as typeof meetingProvider)}
            style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}>
            <option value="google_meet">Google Meet</option>
            <option value="teams">Microsoft Teams</option>
            <option value="zoom">Zoom</option>
            <option value="internal">Enlace interno</option>
          </select>
          <input value={meetingReason} onChange={e => setMeetingReason(e.target.value)} placeholder="Motivo *"
            style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
              style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none' }} />
            <select value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
              style={{ padding: '5px 6px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
              {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <button type="button"
            disabled={!scheduledDate || !meetingReason.trim() || mutPending.schedule}
            onClick={() => onScheduleMeeting({ provider: meetingProvider, reason: meetingReason.trim(), scheduledAt: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString(), url: meetingUrl.trim() || undefined })}
            style={{ width: '100%', padding: '6px', borderRadius: 7, border: 'none', background: scheduledDate && meetingReason.trim() ? '#ff5e3a' : '#e2e8f0', color: scheduledDate && meetingReason.trim() ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {mutPending.schedule ? 'Programando...' : 'Programar reunión'}
          </button>
        </div>
      </SideSection>

      {/* Relacionados */}
      {(relations.length > 0 || !ticket.is_final) && (
        <SideSection label={relations.length > 0 ? `Relacionados (${relations.length})` : 'Relacionados'}>
          {relations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {relations.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#0e2235', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.related_title ?? r.id.slice(0, 8)}</p>
                    <p style={{ fontSize: 9, color: '#94a3b8', margin: '1px 0 0' }}>{r.relation_type}</p>
                  </div>
                  <button type="button" onClick={() => router.push('/helpdesk/ticket/' + r.related_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                    <ChevronRight size={11} />
                  </button>
                  {!ticket.is_final && (
                    <button type="button" disabled={mutPending.removeRel} onClick={() => onRemoveRelation(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 0 }}>
                      <Unlink size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!ticket.is_final && !showRelForm && (
            <button type="button" onClick={() => setShowRelForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#64748b', background: 'none', border: '1px dashed #e2e8f0', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
              <Link2 size={10} /> Vincular ticket
            </button>
          )}
          {!ticket.is_final && showRelForm && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 11px' }}>
              <div style={{ position: 'relative', marginBottom: 5 }}>
                <Search size={10} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input type="text" placeholder="Buscar ticket..." value={relSearch}
                  onChange={e => handleRelSearch(e.target.value)}
                  style={{ width: '100%', padding: '5px 7px 5px 22px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                {relSearching && <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 6 }}>…</span>}
              </div>
              {relResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 5 }}>
                  {relResults.map(r => (
                    <button key={r.id} type="button" onClick={() => setRelTarget(r)}
                      style={{ fontSize: 10, padding: '4px 7px', borderRadius: 5, border: `1px solid ${relTarget?.id === r.id ? '#6366f1' : '#e2e8f0'}`, background: relTarget?.id === r.id ? '#eef2ff' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      #{r.id.slice(0, 6)} — {r.title}
                    </button>
                  ))}
                </div>
              )}
              <select value={relType} onChange={e => setRelType(e.target.value)}
                style={{ width: '100%', padding: '4px 7px', borderRadius: 5, border: '1px solid #e2e8f0', fontSize: 10, fontFamily: 'inherit', background: '#fff', marginBottom: 4, boxSizing: 'border-box' }}>
                <option value="related">Relacionado</option>
                <option value="duplicado">Duplicado</option>
                <option value="bloquea">Bloquea</option>
                <option value="bloqueado_por">Bloqueado por</option>
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => { setShowRelForm(false); setRelSearch(''); setRelTarget(null); setRelResults([]); }}
                  style={{ flex: 1, padding: '5px', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
                  Cancelar
                </button>
                <button type="button" disabled={!relTarget || mutPending.addRel} onClick={handleAddRelation}
                  style={{ flex: 1, padding: '5px', borderRadius: 5, border: 'none', background: relTarget ? '#6366f1' : '#e2e8f0', color: '#fff', fontSize: 10, fontWeight: 700, cursor: relTarget ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  {mutPending.addRel ? '...' : 'Vincular'}
                </button>
              </div>
            </div>
          )}
        </SideSection>
      )}

    </div>
  );
}
