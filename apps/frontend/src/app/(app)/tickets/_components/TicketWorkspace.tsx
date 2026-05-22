'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronRight, Clock, AlertTriangle, CheckCircle2, RotateCcw,
  Users, Phone, CalendarDays, X, Paperclip, ScrollText,
} from 'lucide-react';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import {
  ticketsService,
  type TicketPriority,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS, SLA_STATUS_LABELS,
} from '@/services/tickets.service';
import { usersService } from '@/services/users.service';
import { requestsService } from '@/services/requests.service';
import { fmtDate, fmtRelativeCompact as fmtRelative } from '@/lib/formatters';
import styles from '../tickets.module.css';

type MeetingType = 'asesoramiento' | 'usuario';

interface LocalGuest {
  id:       string;
  name:     string;
  role:     string;
  isLocal:  boolean;
}

/* ── Badges ─────────────────────────────────────────────────────── */

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const color = TICKET_PRIORITY_COLORS[priority];
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
}

function StateBadge({ label, isFinal }: { label: string; isFinal: boolean }) {
  const color = isFinal ? '#22C55E' : '#6366F1';
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function SlaBadge({ status, deadline }: { status: string | null; deadline: string | null }) {
  if (!status || !deadline) return null;
  const color = SLA_STATUS_COLORS[status as keyof typeof SLA_STATUS_COLORS] ?? '#94A3B8';
  const label = SLA_STATUS_LABELS[status as keyof typeof SLA_STATUS_LABELS] ?? status;
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 3,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      <Clock size={9} />
      {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

export function TicketWorkspace({ ticketId }: { ticketId: string }) {
  const router    = useRouter();
  const qc        = useQueryClient();
  const { modules } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  /* ── Ticket data ── */
  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn:  () => ticketsService.getOne(ticketId),
    staleTime: 30_000,
  });

  /* ── Module users for collaborator selection ── */
  const { data: moduleUsers = [] } = useQuery({
    queryKey: ['module-members', helpdeskId],
    queryFn:  () => usersService.getModuleUsers(helpdeskId!),
    enabled:  !!helpdeskId,
    staleTime: 5 * 60_000,
  });

  const technicians = useMemo(
    () => moduleUsers.filter((u) =>
      ['tecnico', 'jefe_tecnico'].includes((u as any).role_name ?? '')
    ),
    [moduleUsers],
  );

  /* ── Left panel state ── */
  const [transReason,   setTransReason]   = useState('');
  const [activeTransId, setActiveTransId] = useState<string | null>(null);
  const [replyText,     setReplyText]     = useState('');

  /* ── Right panel state ── */
  const [meetingType,    setMeetingType]    = useState<MeetingType>('asesoramiento');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isCalling,      setIsCalling]      = useState(false);
  const [scheduledDate,  setScheduledDate]  = useState('');
  const [scheduledTime,  setScheduledTime]  = useState('10:00');
  const [localGuests,    setLocalGuests]    = useState<LocalGuest[]>([]);
  const [scheduledDetails, setScheduledDetails] = useState<{ date: string; time: string; type: MeetingType } | null>(null);
  const [isScheduling,   setIsScheduling]   = useState(false);

  /* ── Transition mutation ── */
  const transMut = useMutation({
    mutationFn: ({ transId, reason }: { transId: string; reason?: string }) =>
      ticketsService.transition(ticketId, transId, reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-detail', ticketId] });
      setActiveTransId(null);
      setTransReason('');
    },
  });

  /* ── Collaboration: instant call invite ── */
  async function handleInstantCall() {
    if (!selectedUserId) return;
    setIsCalling(true);

    const user = moduleUsers.find((u) => u.id === selectedUserId);
    if (!user) { setIsCalling(false); return; }

    try {
      await ticketsService.addCollaborator(ticketId, selectedUserId, 'colaborador');
    } catch {
      // backend may not yet support — still add locally
    }

    setTimeout(() => {
      setIsCalling(false);
      const name = `${(user as any).first_name ?? ''} ${(user as any).last_name ?? ''}`.trim() || user.email;
      setLocalGuests((prev) => {
        if (prev.some((g) => g.id === user.id)) return prev;
        return [...prev, { id: user.id, name, role: (user as any).role_name ?? 'Técnico', isLocal: true }];
      });
    }, 2000);
  }

  /* ── Collaboration: schedule meeting ── */
  async function handleSchedule() {
    if (!scheduledDate || !scheduledTime) return;
    setIsScheduling(true);

    const methodLabels: Record<MeetingType, string> = {
      asesoramiento: 'Asesoramiento Técnico',
      usuario:       'Llamada con Usuario',
    };

    try {
      await requestsService.create({
        type:        'task',
        title:       `[${methodLabels[meetingType]}] ${ticket?.title ?? ticketId}`,
        description: `Sesión programada para resolver el ticket #${ticketId}.\nFecha: ${scheduledDate}  Hora: ${scheduledTime}`,
        priority:    (ticket?.priority as any) ?? 'media',
        task_source: 'system',
        metadata: {
          ticket_id:      ticketId,
          meeting_type:   meetingType,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          due_date:       scheduledDate,
        },
      });

      setScheduledDetails({ date: scheduledDate, time: scheduledTime, type: meetingType });
      qc.invalidateQueries({ queryKey: ['requests'] });
    } catch {
      setScheduledDetails({ date: scheduledDate, time: scheduledTime, type: meetingType });
    } finally {
      setIsScheduling(false);
    }
  }

  /* ── Guest helpers ── */
  function removeGuest(id: string) {
    setLocalGuests((prev) => prev.filter((g) => g.id !== id));
  }

  /* ── Compute combined guest list ── */
  const allGuests = useMemo<LocalGuest[]>(() => {
    const fromAssignments: LocalGuest[] = (ticket?.assignments ?? [])
      .filter((a) => a.is_active)
      .map((a) => ({ id: a.id, name: a.user_name, role: a.role, isLocal: false }));

    const localIds = new Set(fromAssignments.map((g) => g.id));
    const merged   = [...fromAssignments];
    for (const g of localGuests) {
      if (!localIds.has(g.id)) merged.push(g);
    }
    return merged;
  }, [ticket?.assignments, localGuests]);

  /* ── SLA helpers ── */
  const slaColor = ticket?.sla_status
    ? (SLA_STATUS_COLORS[ticket.sla_status as keyof typeof SLA_STATUS_COLORS] ?? '#94A3B8')
    : '#94A3B8';
  const slaLabel = ticket?.sla_status
    ? (SLA_STATUS_LABELS[ticket.sla_status as keyof typeof SLA_STATUS_LABELS] ?? ticket.sla_status)
    : null;

  /* ── Render ── */
  return (
    <ModuleLayout
      moduleId={helpdeskId}
      title="Mesa de Ayuda"
      description="Sistema centralizado de soporte técnico. Gestiona incidencias, solicitudes y seguimiento SLA para todos los módulos asignados."
    >
      {isLoading && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
          Cargando ticket…
        </div>
      )}

      {ticket && (
        <div className={styles.workspace}>

          {/* ══ LEFT PANEL ════════════════════════════════════════ */}
          <div className={styles.wMain}>

            {/* Back */}
            <button type="button" onClick={() => router.push('/tickets')} className={styles.backBtn}>
              <ArrowLeft size={13} />
              Volver al listado
            </button>

            {/* Breadcrumb */}
            <div className={styles.breadcrumb}>
              <span>{ticket.module_name}</span>
              <ChevronRight size={10} />
              <span>{ticket.category_name}</span>
              <ChevronRight size={10} />
              <span>{ticket.environment_name}</span>
            </div>

            {/* Title + ID */}
            <div className={styles.titleRow}>
              <h2 className={styles.wTitle}>{ticket.title}</h2>
              <span className={styles.ticketIdBadge}>#{ticket.id.slice(0, 8)}</span>
            </div>

            {/* Badges */}
            <div className={styles.badgeRow}>
              <PriorityBadge priority={ticket.priority} />
              <StateBadge label={ticket.state_label} isFinal={ticket.is_final} />
              <SlaBadge status={ticket.sla_status} deadline={ticket.sla_deadline_tracked} />
              {ticket.is_final && (
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600, background: '#22C55E22', color: '#22C55E', border: '1px solid #22C55E44', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CheckCircle2 size={9} /> Requiere acción
                </span>
              )}
            </div>

            {/* Description */}
            {ticket.description && (
              <div className={styles.descBlock}>{ticket.description}</div>
            )}

            {/* Meta grid */}
            <div className={styles.metaGrid}>
              {([
                ['Creado por',  ticket.creator_name],
                ['Asignado a',  ticket.assignee_name ?? '—'],
                ['Ambiente',    ticket.environment_name],
                ['Creado',      fmtDate(ticket.created_at)],
                ['Urgencia',    ticket.urgency],
                ['Impacto',     ticket.impact],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{label}</span>
                  <span className={styles.metaValue}>{val}</span>
                </div>
              ))}
            </div>

            {/* Transitions */}
            {!ticket.is_final && ticket.transitions.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <p className={styles.sectionHeader}>Acciones disponibles</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ticket.transitions.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => setActiveTransId(activeTransId === tr.id ? null : tr.id)}
                      className={styles.transBtn}
                      style={{
                        border: `1.5px solid ${activeTransId === tr.id ? '#6366F1' : '#E2E8F0'}`,
                        background: activeTransId === tr.id ? '#6366F115' : '#fff',
                        color: activeTransId === tr.id ? '#6366F1' : '#475569',
                      }}
                    >
                      <ChevronRight size={11} />
                      {tr.to_label}
                    </button>
                  ))}
                </div>

                {activeTransId && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <textarea
                      value={transReason}
                      onChange={(e) => setTransReason(e.target.value)}
                      placeholder="Motivo del cambio (opcional)…"
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                        border: '1px solid #E2E8F0', outline: 'none', resize: 'vertical',
                        boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setActiveTransId(null); setTransReason(''); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#64748B' }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => transMut.mutate({ transId: activeTransId, reason: transReason })}
                        disabled={transMut.isPending}
                        style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, opacity: transMut.isPending ? .7 : 1 }}
                      >
                        <CheckCircle2 size={12} />
                        {transMut.isPending ? 'Aplicando…' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {ticket.history.length > 0 && (
              <div>
                <p className={styles.sectionHeader}>Historial de estados</p>
                <div className={styles.historyList}>
                  {ticket.history.map((h) => (
                    <div key={h.id} className={styles.historyItem}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6366F115', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RotateCcw size={12} style={{ color: '#6366F1' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#0F172A', margin: 0 }}>
                          {h.from_label} → {h.to_label}
                        </p>
                        {h.transition_reason && (
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{h.transition_reason}</p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{h.actor_name}</p>
                        <p style={{ fontSize: 10, color: '#CBD5E1', margin: '1px 0 0' }}>{fmtRelative(h.transitioned_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply box */}
            {!ticket.is_final && (
              <div className={styles.replyBox} style={{ marginTop: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#0e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>T</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>Respuesta del equipo de soporte</span>
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escribe tu respuesta técnica aquí…"
                  rows={3}
                  className={styles.replyTextarea}
                />
                <div className={styles.replyActions}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className={styles.replyIconBtn} title="Adjuntar archivo">
                      <Paperclip size={14} />
                    </button>
                    <button type="button" className={styles.replyIconBtn} title="Insertar plantilla">
                      <ScrollText size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.replySubmitBtn}
                    disabled={!replyText.trim()}
                    onClick={() => setReplyText('')}
                  >
                    Responder Ticket
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ══ RIGHT DARK PANEL ══════════════════════════════════ */}
          <div className={styles.wDark}>

            {/* SLA section */}
            <div className={styles.darkSection}>
              <p className={styles.sectionLabel}>
                <AlertTriangle size={10} />
                SLA y Vencimiento
              </p>
              <div className={styles.slaCard}>
                <AlertTriangle size={18} className={styles.slaCardIcon} />
                <div className={styles.slaCardContent}>
                  <p className={styles.slaCardLabel}>Tiempo Límite</p>
                  {ticket.sla_deadline_tracked ? (
                    <p className={styles.slaCardDate}>{fmtDate(ticket.sla_deadline_tracked)}</p>
                  ) : (
                    <p className={styles.slaCardEmpty}>Sin SLA configurado</p>
                  )}
                </div>
                {slaLabel && (
                  <span
                    className={styles.slaCardStatus}
                    style={{ background: `${slaColor}28`, color: slaColor, border: `1px solid ${slaColor}44` }}
                  >
                    {slaLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Solicitar colaborador */}
            <div className={styles.darkSection}>
              <p className={styles.inviteTitle}>Solicitar Colaborador</p>
              <p className={styles.inviteSubtitle}>
                Invita a un técnico o jefe técnico para resolver este ticket en conjunto.
              </p>
              <div className={styles.callPanel}>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className={styles.callSelect}
                >
                  <option value="">Seleccionar técnico…</option>
                  {technicians.length > 0
                    ? technicians.map((u) => (
                        <option key={u.id} value={u.id}>
                          {(u as any).first_name} {(u as any).last_name} — {(u as any).role_name === 'jefe_tecnico' ? 'Jefe Técnico' : 'Técnico'}
                        </option>
                      ))
                    : moduleUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {(u as any).first_name} {(u as any).last_name}
                        </option>
                      ))
                  }
                </select>
                <button
                  type="button"
                  className={styles.callBtn}
                  disabled={!selectedUserId || isCalling}
                  onClick={handleInstantCall}
                >
                  <Phone size={11} />
                  {isCalling ? '…' : 'Invitar'}
                </button>
              </div>
              {isCalling && (
                <div className={styles.callingAnimation}>
                  Enviando invitación al colaborador…
                </div>
              )}
            </div>

            {/* Programar reunión */}
            <div className={styles.darkSection}>
              <p className={styles.inviteTitle}>Programar en Calendario</p>
              <p className={styles.inviteSubtitle}>
                Agenda una sesión y quedará registrada en el calendario del equipo.
              </p>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                className={styles.methodSelect}
              >
                <option value="asesoramiento">Asesoramiento Técnico</option>
                <option value="usuario">Llamada con Usuario</option>
              </select>
              <div className={styles.schedulePanel}>
                <div className={styles.scheduleGrid}>
                  <div className={styles.scheduleFld}>
                    <p className={styles.scheduleFieldLabel}>Fecha *</p>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className={styles.scheduleInput}
                      required
                    />
                  </div>
                  <div className={styles.scheduleFld}>
                    <p className={styles.scheduleFieldLabel}>Hora *</p>
                    <select
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className={styles.scheduleSelect}
                    >
                      <option value="08:00">08:00 AM</option>
                      <option value="09:00">09:00 AM</option>
                      <option value="10:00">10:00 AM</option>
                      <option value="11:00">11:00 AM</option>
                      <option value="12:00">12:00 PM</option>
                      <option value="13:00">01:00 PM</option>
                      <option value="14:00">02:00 PM</option>
                      <option value="15:00">03:00 PM</option>
                      <option value="16:00">04:00 PM</option>
                      <option value="17:00">05:00 PM</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.scheduleSubmitBtn}
                  disabled={!scheduledDate || !scheduledTime || isScheduling}
                  onClick={handleSchedule}
                >
                  {isScheduling ? 'Programando…' : 'Registrar en el Calendario'}
                </button>
              </div>
            </div>

            {/* Guest list */}
            <div className={styles.darkSection}>
              <div className={styles.guestHeader}>
                <p className={styles.sectionLabel} style={{ margin: 0 }}>
                  <Users size={10} />
                  Guests / Participantes
                </p>
                <span className={styles.guestCountBadge}>{allGuests.length}</span>
              </div>

              {allGuests.length === 0 ? (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                  Sin participantes aún.
                </p>
              ) : (
                <div className={styles.guestList}>
                  {allGuests.map((g) => (
                    <div key={g.id} className={styles.guestItem}>
                      <div className={styles.guestAvatar}>
                        {g.name.charAt(0).toUpperCase()}
                        {g.isLocal && (
                          <button
                            type="button"
                            className={styles.guestRemoveBtn}
                            onClick={() => removeGuest(g.id)}
                            title="Eliminar"
                          >
                            <X size={7} />
                          </button>
                        )}
                        <span className={styles.guestActiveDot} />
                      </div>
                      <p className={styles.guestName}>{g.name.split(' ')[0]}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sesión programada */}
            {scheduledDetails && (
              <div className={styles.darkSection}>
                <p className={styles.sectionLabel}>
                  <CalendarDays size={10} />
                  Sesión programada
                </p>
                <div className={styles.solutionDetails}>
                  <div className={styles.solutionRow}>
                    <CalendarDays size={14} className={styles.solutionIcon} />
                    <div>
                      <p className={styles.solutionRowLabel}>
                        {scheduledDetails.type === 'asesoramiento' ? 'Asesoramiento Técnico' : 'Llamada con Usuario'}
                      </p>
                      <p className={styles.solutionRowValue}>
                        {new Date(scheduledDetails.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className={styles.solutionRow}>
                    <Clock size={14} className={styles.solutionIcon} />
                    <div>
                      <p className={styles.solutionRowLabel}>Hora</p>
                      <p className={styles.solutionRowValue}>{scheduledDetails.time}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action button */}
            {(scheduledDetails || allGuests.length > 0) && (
              <button
                type="button"
                className={styles.actionBtn}
                style={{ marginTop: 'auto' }}
              >
                <CalendarDays size={15} />
                Notificar a Participantes
              </button>
            )}

          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
