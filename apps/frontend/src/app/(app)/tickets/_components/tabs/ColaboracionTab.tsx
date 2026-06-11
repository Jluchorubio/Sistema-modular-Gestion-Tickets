'use client';

import { useState } from 'react';
import { ChevronDown, Phone, X } from 'lucide-react';
import { TECH_AVAIL_COLORS, TECH_AVAIL_LABELS } from '@/services/tickets.service';
import { PROVIDER_LABELS, PROVIDER_COLORS, STATUS_LABELS, STATUS_COLORS } from '@/services/meetings.service';
import type { useTicketData } from '../hooks/useTicketData';
import type { LocalGuest } from '../hooks/useTicketData';
import type { TechAvailStatus } from '@/types/module.types';

export function ColaboracionTab({
  ticketId, ticket, allGuests, meetings, technicians,
  onInstantCall, onRemoveGuest,
  onCancelMeeting, onScheduleMeeting,
  mutPending,
}: {
  ticketId:          string;
  ticket:            { is_final: boolean };
  allGuests:         LocalGuest[];
  meetings:          ReturnType<typeof useTicketData>['meetings'];
  technicians:       ReturnType<typeof useTicketData>['technicians'];
  onInstantCall:     (userId: string, setUserId: (v: string) => void, setCalling: (v: boolean) => void) => void;
  onRemoveGuest:     (id: string) => void;
  onCancelMeeting:   (meetingId: string) => void;
  onScheduleMeeting: (data: { provider: string; reason: string; scheduledAt: string; url?: string }) => void;
  mutPending:        { schedule: boolean; cancelMeet: boolean };
}) {
  const [selectedUserId,  setSelectedUserId]  = useState('');
  const [isCalling,       setIsCalling]       = useState(false);
  const [showTechPicker,  setShowTechPicker]  = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [meetingProvider, setMeetingProvider] = useState<'google_meet' | 'teams' | 'zoom' | 'internal'>('google_meet');
  const [meetingReason,   setMeetingReason]   = useState('Asesoramiento técnico');
  const [meetingUrl,      setMeetingUrl]      = useState('');
  const [scheduledDate,   setScheduledDate]   = useState('');
  const [scheduledTime,   setScheduledTime]   = useState('10:00');

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Participantes */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 12px' }}>
          Participantes ({allGuests.length})
        </p>
        {allGuests.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {allGuests.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{g.name.charAt(0).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{g.role}</p>
                </div>
                {g.isLocal && (
                  <button type="button" onClick={() => onRemoveGuest(g.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2, lineHeight: 0 }}>
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!ticket.is_final && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', margin: '0 0 6px' }}>Invitar técnico</p>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <button type="button" onClick={() => setShowTechPicker(v => !v)}
                style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: `1px solid ${showTechPicker ? '#0e2235' : '#e2e8f0'}`, background: '#fff', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, boxSizing: 'border-box', textAlign: 'left' }}>
                {selectedUserId ? (() => {
                  const t = technicians.find(u => u.id === selectedUserId);
                  const ac = TECH_AVAIL_COLORS[t?.avail_status ?? 'offline'];
                  return t ? (
                    <><span style={{ width: 7, height: 7, borderRadius: '50%', background: ac, flexShrink: 0 }} /><span style={{ flex: 1, color: '#334155' }}>{t.first_name} {t.last_name}</span></>
                  ) : <span style={{ color: '#94a3b8', flex: 1 }}>Seleccionar…</span>;
                })() : <span style={{ color: '#94a3b8', flex: 1 }}>Seleccionar técnico…</span>}
                <ChevronDown size={11} style={{ color: '#94a3b8', flexShrink: 0, transform: showTechPicker ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {showTechPicker && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(14,34,53,.12)', marginTop: 2, maxHeight: 200, overflowY: 'auto' }}>
                  {[...technicians].sort((a, b) => { const o: Record<string,number> = {disponible:0,ocupado:1,en_reunion:2,ausente:3,fuera_horario:4,offline:5}; return (o[a.avail_status]??9)-(o[b.avail_status]??9); }).map(u => {
                    const ac = TECH_AVAIL_COLORS[u.avail_status ?? 'offline'];
                    const sel = selectedUserId === u.id;
                    return (
                      <button key={u.id} type="button" onClick={() => { setSelectedUserId(u.id); setShowTechPicker(false); }}
                        style={{ width: '100%', padding: '7px 10px', border: 'none', background: sel ? '#f0f4ff' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ac, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11, color: '#334155', fontWeight: sel ? 700 : 400 }}>{u.first_name} {u.last_name}</span>
                        <span style={{ fontSize: 10, color: ac, fontWeight: 600 }}>{TECH_AVAIL_LABELS[u.avail_status as TechAvailStatus]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button type="button" disabled={!selectedUserId || isCalling}
              onClick={() => { onInstantCall(selectedUserId, setSelectedUserId, setIsCalling); setShowTechPicker(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: selectedUserId && !isCalling ? '#0e2235' : '#e2e8f0', color: selectedUserId ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: selectedUserId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              <Phone size={11} /> {isCalling ? 'Invitando…' : 'Invitar al ticket'}
            </button>
          </div>
        )}
      </div>

      {/* Reuniones */}
      <div style={{ background: '#fff', borderRadius: 9, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', margin: '0 0 12px' }}>
          Reuniones{meetings.length > 0 ? ` (${meetings.length})` : ''}
        </p>
        {meetings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {meetings.map(m => {
              const pc  = PROVIDER_COLORS[m.provider] ?? '#64748b';
              const sc2 = STATUS_COLORS[m.status]    ?? '#64748b';
              const dt  = new Date(m.scheduled_at);
              return (
                <div key={m.id} style={{ padding: '9px 11px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', opacity: m.status === 'cancelled' ? .5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pc, textTransform: 'uppercase' }}>{PROVIDER_LABELS[m.provider]}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc2 }}>{STATUS_LABELS[m.status]}</span>
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#334155', margin: '0 0 1px' }}>{m.reason}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                    {dt.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · {dt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {m.meeting_url && m.status !== 'cancelled' && (
                    <a href={m.meeting_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 10, color: pc, textDecoration: 'none', display: 'inline-block', marginTop: 3 }}>Unirse</a>
                  )}
                  {m.status === 'scheduled' && (
                    <button type="button" disabled={mutPending.cancelMeet} onClick={() => onCancelMeeting(m.id)}
                      style={{ display: 'block', marginTop: 3, fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!ticket.is_final && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#64748b', margin: 0 }}>Programar reunión</p>
            <select value={meetingProvider} onChange={e => setMeetingProvider(e.target.value as typeof meetingProvider)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }}>
              <option value="google_meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
              <option value="zoom">Zoom</option>
              <option value="internal">Enlace interno</option>
            </select>
            <input value={meetingReason} onChange={e => setMeetingReason(e.target.value)} placeholder="Motivo *"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input type="date" value={scheduledDate} min={today} onChange={e => setScheduledDate(e.target.value)}
                style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none' }} />
              <select value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                style={{ padding: '6px 7px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="URL de reunión (opcional)"
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
              {(meetingProvider === 'teams' || meetingProvider === 'zoom') && (
                <p style={{ fontSize: 10, color: '#64748b', margin: '3px 0 0', lineHeight: 1.4 }}>
                  {meetingProvider === 'teams' ? 'Teams' : 'Zoom'} no genera reuniones automáticamente. Crea la reunión en la plataforma y pega aquí el enlace de invitación.
                </p>
              )}
            </div>
            <button type="button"
              disabled={!scheduledDate || !meetingReason.trim() || mutPending.schedule}
              onClick={() => onScheduleMeeting({ provider: meetingProvider, reason: meetingReason.trim(), scheduledAt: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString(), url: meetingUrl.trim() || undefined })}
              style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: scheduledDate && meetingReason.trim() ? '#ff5e3a' : '#e2e8f0', color: scheduledDate && meetingReason.trim() ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {mutPending.schedule ? 'Programando…' : 'Programar reunión'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
