'use client';

import Link from 'next/link';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventClickArg } from '@fullcalendar/core';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, Plus, ChevronLeft, ChevronRight, Filter, AlertTriangle,
  Activity, Calendar, Users, Download, RefreshCw,
} from 'lucide-react';
import { useSystemConfigStore } from '@/stores/systemConfig.store';
import { requestsService, type AdmRequest, type RequestStatus, type RequestType, type RequestPriority } from '@/services/requests.service';
import { ticketsService, type TicketListItem } from '@/services/tickets.service';
import { getSlaStatusConfig } from '@/constants/status';
import { meetingsService, type CalendarMeeting, PROVIDER_COLORS } from '@/services/meetings.service';
import { calendarEventsService, type CalendarEvent } from '@/services/calendar-events.service';
import { calendarAuditService, AUDIT_ACTION_LABELS, AUDIT_ACTION_COLOR, AUDIT_ENTITY_LABEL } from '@/services/calendar-audit.service';
import {
  REQUEST_STATUS_LABELS, REQUEST_STATUS_COLORS, REQUEST_TYPE_LABELS, REQUEST_TYPES,
  REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_COLORS, REQUEST_PRIORITIES,
} from '@/constants/requests';
import { exportCalendarAuditPdf } from '@/utils/calendar-pdf';

import {
  type CalendarView, type SourceFilter, type RightTab, type AuditPeriod,
  MONTHS_ES, SLA_CALENDAR_HEX, FC_VIEW,
  toDateStr, getReqDateStr, eventColor, getCurrentWeekOfMonth, getWeeksInMonth,
} from './_types';
import { ContextNav } from '@/components/ui/ContextNav';
import { useCalendarContexts }  from './hooks/useCalendarContexts';
import { MonthGrid }            from './MonthGrid';
import { MiniMonth }            from './MiniMonth';
import { DayEventCard, TicketSlaCard, DayMeetingCard, DayCalEventCard } from './_cards';
import { TicketSlaPopup, MeetingPopup, CalEventPopup }                  from './_popups';
import { CreateEventModal }     from './CreateEventModal';
import { EventDetailPopup }     from './EventDetailPopup';
import { AvailabilityPanel }    from './AvailabilityPanel';
import styles from '../calendar.module.css';

export function CalendarClient() {
  const contexts    = useCalendarContexts();
  const branding    = useSystemConfigStore((s) => s.branding);
  const [ctxIdx, setCtxIdx] = useState(0);
  const ctx          = contexts[ctxIdx] ?? contexts[0];
  const role         = ctx.role;
  const canSeeAll    = role === 'superadmin' || role === 'admin' || role === 'jefe';
  const isSuperadmin = role === 'superadmin';

  const today = new Date();
  const [view,        setView]        = useState<CalendarView>('mes');
  const [calYear,     setCalYear]     = useState(today.getFullYear());
  const [calMonth,    setCalMonth]    = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date | null>(today);
  const [hoveredDay,  setHoveredDay]  = useState<Date | null>(null);
  const [rightTab,    setRightTab]    = useState<RightTab>('agenda');

  const [auditPeriod,    setAuditPeriod]    = useState<AuditPeriod>('week');
  const [auditWeek,      setAuditWeek]      = useState(() => getCurrentWeekOfMonth(today.getMonth() + 1, today.getFullYear()));
  const [auditMonth,     setAuditMonth]     = useState(today.getMonth() + 1);
  const [auditYear,      setAuditYear]      = useState(today.getFullYear());
  const [auditExporting, setAuditExporting] = useState(false);

  const [statusFilter,   setStatusFilter]   = useState<RequestStatus   | ''>('');
  const [typeFilter,     setTypeFilter]     = useState<RequestType     | ''>('');
  const [sourceFilter,   setSourceFilter]   = useState<SourceFilter>('');
  const [priorityFilter, setPriorityFilter] = useState<RequestPriority | ''>('');
  const [filtersOpen,    setFiltersOpen]    = useState(false);

  const [showCreate,       setShowCreate]       = useState(false);
  const [selectedReq,      setSelectedReq]      = useState<AdmRequest | null>(null);
  const [selectedTicket,   setSelectedTicket]   = useState<TicketListItem | null>(null);
  const [selectedMeeting,  setSelectedMeeting]  = useState<CalendarMeeting | null>(null);
  const [selectedCalEvent, setSelectedCalEvent] = useState<CalendarEvent | null>(null);

  /* ── Queries ── */
  const { data: reqData, isLoading: reqLoading, refetch } = useQuery({
    queryKey: ['calendar-requests', ctxIdx, statusFilter, typeFilter],
    queryFn:  () => canSeeAll
      ? requestsService.getAll({ status: statusFilter, type: typeFilter, limit: 300 })
      : requestsService.getMine(200),
    staleTime: 2 * 60_000,
  });

  const { data: ticketData, isLoading: ticketLoading } = useQuery({
    queryKey: ['calendar-tickets', ctxIdx],
    queryFn:  () => canSeeAll
      ? ticketsService.getAll({ module_id: ctx.moduleId, limit: 300 })
      : ticketsService.getAll({ mine: true, limit: 200 }),
    staleTime: 2 * 60_000,
  });

  const { data: meetingData = [] } = useQuery({
    queryKey: ['calendar-meetings', ctxIdx, ctx.moduleId],
    queryFn:  () => meetingsService.getCalendarMeetings(ctx.moduleId ? { module_id: ctx.moduleId } : undefined),
    staleTime: 2 * 60_000,
  });

  const { data: calEventData = [] } = useQuery({
    queryKey: ['calendar-events', ctxIdx, ctx.moduleId],
    queryFn:  () => calendarEventsService.getEvents(ctx.moduleId ? { module_id: ctx.moduleId } : undefined),
    staleTime: 2 * 60_000,
  });

  const { data: auditData, isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ['calendar-audit', ctx.moduleId, auditPeriod, auditWeek, auditMonth, auditYear],
    queryFn:  () => calendarAuditService.getAudit({
      period: auditPeriod,
      week:   auditPeriod === 'week'  ? auditWeek  : undefined,
      month:  auditPeriod !== 'year'  ? auditMonth : undefined,
      year:   auditYear,
      module_id: ctx.moduleId,
    }),
    enabled:   rightTab === 'actividad',
    staleTime: 30_000,
  });

  const isLoading = reqLoading || ticketLoading;
  const requests  = reqData?.data   ?? [];
  const tickets   = ticketData?.data ?? [];

  const showTicketMeetings = sourceFilter === 'ticket_meetings';
  const meetings  = showTicketMeetings ? [] : meetingData;
  const calEvents = showTicketMeetings
    ? calEventData.filter(e => e.source === 'meeting')
    : calEventData.filter(e => e.source !== 'meeting');

  /* ── Derived / filters ── */
  const filteredRequests = useMemo(() => {
    let r = requests;
    if (ctx.moduleId && role !== 'superadmin') r = r.filter((x) => x.metadata?.module_id === ctx.moduleId);
    if (priorityFilter)                         r = r.filter((x) => x.priority === priorityFilter);
    if (sourceFilter === 'system_tasks')        r = r.filter((x) => x.task_source === 'system');
    if (sourceFilter === 'user_tasks')          r = r.filter((x) => x.task_source === 'user' && x.type === 'task');
    if (sourceFilter === 'requests')            r = r.filter((x) => x.type !== 'task');
    return r;
  }, [requests, priorityFilter, sourceFilter, ctx.moduleId, role]);

  const slaTickets = useMemo(() => tickets.filter((t) => !!t.sla_deadline), [tickets]);

  const daysWithEvents    = useMemo(() => { const s = new Set<string>(); filteredRequests.forEach((r) => s.add(getReqDateStr(r))); return s; }, [filteredRequests]);
  const daysWithSla       = useMemo(() => { const s = new Set<string>(); slaTickets.forEach((t) => s.add(t.sla_deadline!.slice(0, 10))); return s; }, [slaTickets]);
  const daysWithMeetings  = useMemo(() => { const s = new Set<string>(); meetings.forEach((m) => s.add(m.scheduled_at.slice(0, 10))); return s; }, [meetings]);
  const daysWithCalEvents = useMemo(() => { const s = new Set<string>(); calEvents.forEach((e) => s.add(e.start_at.slice(0, 10))); return s; }, [calEvents]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { reqs: number; sla: number; meet: number; cal: number }>();
    const inc = (key: string, field: 'reqs' | 'sla' | 'meet' | 'cal') => {
      const ex = map.get(key) ?? { reqs: 0, sla: 0, meet: 0, cal: 0 };
      map.set(key, { ...ex, [field]: ex[field] + 1 });
    };
    filteredRequests.forEach((r) => inc(getReqDateStr(r), 'reqs'));
    slaTickets.forEach((t) => t.sla_deadline && inc(t.sla_deadline.slice(0, 10), 'sla'));
    meetings.forEach((m) => inc(m.scheduled_at.slice(0, 10), 'meet'));
    calEvents.forEach((e) => inc(e.start_at.slice(0, 10), 'cal'));
    return map;
  }, [filteredRequests, slaTickets, meetings, calEvents]);

  const displayDay = hoveredDay ?? selectedDay;

  const selectedDayReqs      = useMemo(() => { if (!displayDay) return []; const ds = toDateStr(displayDay); return filteredRequests.filter((r) => getReqDateStr(r) === ds); }, [filteredRequests, displayDay]);
  const selectedDayTickets   = useMemo(() => { if (!displayDay) return []; const ds = toDateStr(displayDay); return slaTickets.filter((t) => t.sla_deadline!.slice(0, 10) === ds); }, [slaTickets, displayDay]);
  const selectedDayMeetings  = useMemo(() => { if (!displayDay) return []; const ds = toDateStr(displayDay); return meetings.filter((m) => m.scheduled_at.slice(0, 10) === ds); }, [meetings, displayDay]);
  const selectedDayCalEvents = useMemo(() => { if (!displayDay) return []; const ds = toDateStr(displayDay); return calEvents.filter((e) => e.start_at.slice(0, 10) === ds); }, [calEvents, displayDay]);

  const stats = useMemo(() => ({
    total:    requests.length,
    pending:  requests.filter((r) => r.status === 'pending').length,
    inProg:   requests.filter((r) => r.status === 'in_progress').length,
    done:     requests.filter((r) => r.status === 'completed').length,
    slaOpen:  slaTickets.filter((t) => t.sla_status === 'active').length,
    meetings: meetings.filter((m) => m.status === 'scheduled').length,
    eventos:  calEvents.filter((e) => e.status === 'active').length,
  }), [requests, slaTickets, meetings, calEvents]);

  const urgency = useMemo(() => {
    const slaBreached = slaTickets.filter((t) => t.sla_status === 'breached').length;
    const now         = Date.now();
    const meetingSoon = meetings.filter((m) => { const diff = (new Date(m.scheduled_at).getTime() - now) / 60000; return diff > 0 && diff <= 120 && m.status === 'scheduled'; }).length;
    const pendingHigh = requests.filter((r) => r.priority === 'alta' && r.status === 'pending').length;
    return { slaBreached, meetingSoon, pendingHigh };
  }, [slaTickets, meetings, requests]);

  const hasUrgency    = urgency.slaBreached > 0 || urgency.meetingSoon > 0;
  const activeFilters = [statusFilter, typeFilter, sourceFilter, priorityFilter].filter(Boolean).length;
  const totalDayItems = selectedDayReqs.length + selectedDayTickets.length + selectedDayMeetings.length + selectedDayCalEvents.length;

  /* ── Nav helpers ── */
  function prevMonth() { if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); } else setCalMonth((m) => m - 1); }
  function nextMonth() { if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); } else setCalMonth((m) => m + 1); }
  function handleDaySelect(date: Date) { setSelectedDay(date); setHoveredDay(null); }
  function handleMonthSelect(month: number) { setCalMonth(month); setView('mes'); }
  function clearFilters() { setStatusFilter(''); setTypeFilter(''); setSourceFilter(''); setPriorityFilter(''); }

  /* ── PDF export ── */
  async function handleExportPdf() {
    if (!auditData) return;
    setAuditExporting(true);
    try {
      await exportCalendarAuditPdf({ audit: auditData, companyName: branding?.name ?? 'Sistema', logoUrl: branding?.logo_url, filterLabel: auditData.range.label });
    } finally { setAuditExporting(false); }
  }

  /* ── FullCalendar events ── */
  const fcEvents = useMemo(() => {
    const reqEvts = filteredRequests.map((req) => {
      const color = eventColor(req);
      return { id: req.id, title: req.type === 'task' ? (req.task_source === 'system' ? `⚙ ${req.title}` : `✓ ${req.title}`) : req.title, start: getReqDateStr(req), allDay: true, backgroundColor: color, borderColor: color, textColor: '#fff', extendedProps: { req } };
    });
    const ticketEvts = slaTickets.map((t) => {
      const color = t.sla_status ? (SLA_CALENDAR_HEX[t.sla_status] ?? '#94a3b8') : '#94a3b8';
      return { id: `sla-${t.id}`, title: `🎫 ${t.title}`, start: t.sla_deadline!.slice(0, 10), allDay: true, backgroundColor: color, borderColor: color, textColor: '#fff', extendedProps: { ticket: t } };
    });
    const meetEvts = meetings.map((m) => {
      const color = PROVIDER_COLORS[m.provider] ?? '#64748b';
      return { id: `meet-${m.id}`, title: `📹 ${m.reason}`, start: m.scheduled_at, allDay: false, backgroundColor: color, borderColor: color, textColor: '#fff', extendedProps: { meeting: m } };
    });
    const calEvts = calEvents.map((e) => {
      const color = e.color ?? '#8b5cf6';
      return { id: `cal-${e.id}`, title: `📅 ${e.title}`, start: e.start_at, end: e.end_at, allDay: e.all_day, backgroundColor: color, borderColor: color, textColor: '#fff', extendedProps: { calEvent: e } };
    });
    return [...reqEvts, ...ticketEvts, ...meetEvts, ...calEvts];
  }, [filteredRequests, slaTickets, meetings, calEvents]);

  function handleFCClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    if      (info.event.extendedProps.meeting)  setSelectedMeeting(info.event.extendedProps.meeting as CalendarMeeting);
    else if (info.event.extendedProps.calEvent) setSelectedCalEvent(info.event.extendedProps.calEvent as CalendarEvent);
    else if (info.event.extendedProps.ticket)   setSelectedTicket(info.event.extendedProps.ticket as TicketListItem);
    else                                        setSelectedReq(info.event.extendedProps.req as AdmRequest);
  }

  return (
    <div className={styles.calPage}>
      <ContextNav
        back
        crumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Calendario de Operaciones' },
        ]}
      />
      <div className={styles.shell}>

        {/* ── Main panel ── */}
        <div className={styles.main}>
          {contexts.length > 1 && (
            <div className={styles.subHeader}>
              <div className={styles.ctxSwitcher}>
                {contexts.map((c, i) => (
                  <button key={c.id} className={`${styles.ctxBtn} ${ctxIdx === i ? styles.ctxBtnActive : ''}`} onClick={() => setCtxIdx(i)}>
                    {c.label}{c.sublabel && <span style={{ fontWeight: 400, opacity: 0.65, marginLeft: 3 }}>· {c.sublabel}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasUrgency && (
            <div className={styles.urgencyBar}>
              <span className={styles.urgencyLabel}>Atención</span>
              {urgency.slaBreached > 0 && <span className={`${styles.urgencyItem} ${styles.urgencyItemRed}`}><AlertTriangle size={10} />{urgency.slaBreached} SLA {urgency.slaBreached === 1 ? 'vencido' : 'vencidos'}</span>}
              {urgency.meetingSoon > 0 && <span className={`${styles.urgencyItem} ${styles.urgencyItemGreen}`}>📹 {urgency.meetingSoon} {urgency.meetingSoon === 1 ? 'reunión próxima' : 'reuniones próximas'}</span>}
              {urgency.pendingHigh > 0 && <span className={`${styles.urgencyItem} ${styles.urgencyItemAmber}`}>⚡ {urgency.pendingHigh} alta prioridad pendiente</span>}
            </div>
          )}

          <div className={styles.heading}>
            <div>
              <h1 className={styles.title}>Calendario de Operaciones</h1>
              <p className={styles.subtitle}>{ctx.label}{ctx.sublabel ? ` · ${ctx.sublabel}` : ''} &nbsp;·&nbsp; SLA · Solicitudes · Reuniones · Eventos</p>
            </div>
            <div className={styles.viewSwitcher}>
              {([{ id: 'mes', label: 'Mes' }, { id: 'semana', label: 'Semana' }, { id: 'dia', label: 'Día' }, { id: 'agenda', label: 'Lista' }, { id: 'año', label: 'Año' }] as { id: CalendarView; label: string }[]).map(({ id, label }) => (
                <button key={id} className={`${styles.viewBtn} ${view === id ? styles.viewBtnActive : ''}`} onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.statsStrip}>
            {[
              { label: 'Solicitudes', value: stats.total,    color: '#0e2235' },
              { label: 'Pendientes',  value: stats.pending,  color: REQUEST_STATUS_COLORS.pending },
              { label: 'En proceso',  value: stats.inProg,   color: REQUEST_STATUS_COLORS.in_progress },
              { label: 'SLA activos', value: stats.slaOpen,  color: getSlaStatusConfig('active').text },
              { label: 'Reuniones',   value: stats.meetings, color: '#34a853' },
              { label: 'Eventos',     value: stats.eventos,  color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} className={styles.statChip}>
                <span className={styles.statValue} style={{ color }}>{value}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            ))}
          </div>

          <div className={styles.legendBar}>
            <span className={styles.legendItem}><span className={styles.dotCoral} /> Solicitudes</span>
            <span className={styles.legendItem}><span className={styles.dotSla} /> SLA</span>
            <span className={styles.legendItem}><span className={styles.dotMeet} /> Reuniones</span>
            <span className={styles.legendItem}><span className={styles.dotCal} /> Eventos</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className={`${styles.filtersTrigger} ${(filtersOpen || activeFilters > 0) ? styles.filtersTriggerActive : ''}`} onClick={() => setFiltersOpen((o) => !o)}>
                <Filter size={9} /> Filtros
                {activeFilters > 0 && <span className={styles.filtersBadge}>{activeFilters}</span>}
              </button>
              {activeFilters > 0 && (
                <button className={styles.clearBtn} onClick={() => { clearFilters(); setFiltersOpen(false); }} style={{ padding: '3px 8px', fontSize: 10, borderRadius: 20 }}>
                  <X size={9} /> Limpiar
                </button>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className={styles.filtersPanel}>
              <div className={styles.filtersGrid}>
                <div className={styles.fGroup}>
                  <label className={styles.fGroupLabel}>Estado</label>
                  <select className={styles.fGroupSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RequestStatus | '')}>
                    <option value="">Todos</option>
                    {Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className={styles.fGroup}>
                  <label className={styles.fGroupLabel}>Prioridad</label>
                  <select className={styles.fGroupSelect} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as RequestPriority | '')}>
                    <option value="">Todas</option>
                    {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>)}
                  </select>
                </div>
                <div className={styles.fGroup}>
                  <label className={styles.fGroupLabel}>Tipo</label>
                  <select className={styles.fGroupSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RequestType | '')}>
                    <option value="">Todos</option>
                    {([...REQUEST_TYPES, 'task'] as RequestType[]).map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABELS[t] ?? t}</option>)}
                  </select>
                </div>
                <div className={styles.fGroup}>
                  <label className={styles.fGroupLabel}>Origen</label>
                  <select className={styles.fGroupSelect} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
                    <option value="">Todo</option>
                    <option value="system_tasks">Sistema</option>
                    <option value="user_tasks">Personal</option>
                    <option value="requests">Gestión Administrativa</option>
                    <option value="ticket_meetings">Reuniones de ticket</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className={styles.calWrap}>
            {isLoading && <div className={styles.loadOverlay}>Cargando…</div>}

            {view === 'mes' && (
              <>
                <div className={styles.monthNav}>
                  <button className={styles.monthNavBtn} onClick={prevMonth} aria-label="Mes anterior"><ChevronLeft size={15} /></button>
                  <span className={styles.monthNavTitle}>{MONTHS_ES[calMonth]} {calYear}</span>
                  <button className={styles.monthNavBtn} onClick={nextMonth} aria-label="Mes siguiente"><ChevronRight size={15} /></button>
                </div>
                <MonthGrid year={calYear} month={calMonth} daysWithEvents={daysWithEvents} daysWithSla={daysWithSla} daysWithMeetings={daysWithMeetings} daysWithCalEvents={daysWithCalEvents} eventsByDay={eventsByDay} selectedDay={selectedDay} hoveredDay={hoveredDay} onDaySelect={handleDaySelect} onDayHover={setHoveredDay} />
              </>
            )}

            {view === 'año' && (
              <>
                <div className={styles.yearNav}>
                  <button className={styles.monthNavBtn} onClick={() => setCalYear((y) => y - 1)} aria-label="Año anterior"><ChevronLeft size={15} /></button>
                  <span className={styles.yearNavTitle}>{calYear}</span>
                  <button className={styles.monthNavBtn} onClick={() => setCalYear((y) => y + 1)} aria-label="Año siguiente"><ChevronRight size={15} /></button>
                </div>
                <div className={styles.yearGrid}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <MiniMonth key={i} year={calYear} month={i} eventsByDay={eventsByDay} onSelect={() => handleMonthSelect(i)} />
                  ))}
                </div>
              </>
            )}

            {view !== 'mes' && view !== 'año' && (
              <FullCalendar
                key={view}
                plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
                initialView={FC_VIEW[view] ?? 'dayGridWeek'}
                locale={esLocale}
                events={fcEvents}
                eventClick={handleFCClick}
                headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                buttonText={{ today: 'Hoy', prev: '‹', next: '›' }}
                buttonHints={{ prev: '', next: '', today: '' }}
                height="auto"
                firstDay={1}
                dayMaxEvents={4}
                moreLinkText={(n) => `+${n} más`}
                noEventsText="Sin eventos para mostrar"
                eventDisplay="block"
              />
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className={styles.right}>
          {showTicketMeetings && (
            <div style={{ margin: '8px 0', padding: '8px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 11, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              📹 Mostrando solo reuniones originadas en tickets
              <Link href="/helpdesk/queue" style={{ color: '#6d28d9', textDecoration: 'underline', fontWeight: 700 }}>Ir a tickets →</Link>
            </div>
          )}

          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            {([
              { id: 'agenda',         icon: <Calendar size={11} />, label: 'Agenda'    },
              { id: 'actividad',      icon: <Activity  size={11} />, label: 'Actividad' },
              { id: 'disponibilidad', icon: <Users     size={11} />, label: 'Equipo'    },
            ] as { id: RightTab; icon: React.ReactNode; label: string }[]).map((t) => (
              <button key={t.id} onClick={() => setRightTab(t.id)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px 4px', fontSize: 12, fontWeight: rightTab === t.id ? 600 : 400, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: 'transparent', color: rightTab === t.id ? '#0e2235' : '#94a3b8', borderBottom: rightTab === t.id ? '2px solid #0e2235' : '2px solid transparent', marginBottom: -1, transition: 'color .15s, border-color .15s' }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className={styles.rightInner}>
            {/* Agenda tab */}
            {rightTab === 'agenda' && (
              <div className={styles.daySection}>
                <div className={styles.daySectionHead}>
                  <h3 className={styles.sideSectionLabel}>
                    {displayDay ? displayDay.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Eventos del Día'}
                    {hoveredDay && <span style={{ color: '#8fa0af', fontSize: 8, marginLeft: 4 }}>↑ hover</span>}
                  </h3>
                  {totalDayItems > 0 && <span className={styles.dayBadge}>{totalDayItems}</span>}
                </div>
                <div className={styles.dayList}>
                  {totalDayItems === 0 ? (
                    <div className={styles.dayEmpty}>
                      <span className={styles.dayEmptyIcon}>📅</span>
                      <p>Sin actividad este día</p>
                      <p>Selecciona otro día o crea un evento</p>
                      <button className={styles.dayEmptyBtn} onClick={() => setShowCreate(true)}><Plus size={10} /> Crear evento</button>
                    </div>
                  ) : (
                    <>
                      {selectedDayCalEvents.map((e) => (
                        <div key={e.id}>
                          <span className={styles.typePill} style={{ background: '#8b5cf620', color: '#7c3aed', marginBottom: 3, display: 'inline-flex' }}>📅 Evento</span>
                          <DayCalEventCard ev={e} onClick={() => setSelectedCalEvent(e)} />
                        </div>
                      ))}
                      {selectedDayMeetings.map((m) => (
                        <div key={m.id}>
                          <span className={styles.typePill} style={{ background: '#34a85320', color: '#15803d', marginBottom: 3, display: 'inline-flex' }}>📹 Reunión</span>
                          <DayMeetingCard meeting={m} onClick={() => setSelectedMeeting(m)} />
                        </div>
                      ))}
                      {selectedDayTickets.map((t) => (
                        <div key={t.id}>
                          <span className={styles.typePill} style={{ background: '#f59e0b20', color: '#b45309', marginBottom: 3, display: 'inline-flex' }}>🎫 SLA Ticket</span>
                          <TicketSlaCard ticket={t} onClick={() => setSelectedTicket(t)} />
                        </div>
                      ))}
                      {selectedDayReqs.map((req) => (
                        <div key={req.id}>
                          <span className={styles.typePill} style={{ background: '#ff5e3a18', color: '#c2410c', marginBottom: 3, display: 'inline-flex' }}>
                            📋 {req.type === 'task' ? (req.task_source === 'system' ? 'Tarea sistema' : 'Tarea') : 'Solicitud'}
                          </span>
                          <DayEventCard req={req} onClick={() => setSelectedReq(req)} />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Actividad tab */}
            {rightTab === 'actividad' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2, gap: 2 }}>
                    {(['day','week','month','year'] as AuditPeriod[]).map((p) => (
                      <button key={p} onClick={() => setAuditPeriod(p)}
                        style={{ flex: 1, padding: '4px 2px', fontSize: 10, fontWeight: auditPeriod === p ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 4, border: 'none', background: auditPeriod === p ? '#ff5e3a' : 'transparent', color: auditPeriod === p ? '#fff' : '#64748b', transition: 'background .15s, color .15s' }}>
                        {p === 'day' ? 'Día' : p === 'week' ? 'Sem' : p === 'month' ? 'Mes' : 'Año'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {auditPeriod === 'week' && (
                      <select value={auditWeek} onChange={(e) => setAuditWeek(Number(e.target.value))} style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontFamily: 'inherit' }}>
                        {Array.from({ length: getWeeksInMonth(auditMonth, auditYear) }, (_, i) => <option key={i+1} value={i+1}>Semana {i+1}</option>)}
                      </select>
                    )}
                    {auditPeriod !== 'year' && (
                      <select value={auditMonth} onChange={(e) => setAuditMonth(Number(e.target.value))} style={{ flex: 1, fontSize: 11, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontFamily: 'inherit' }}>
                        {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                      </select>
                    )}
                    <select value={auditYear} onChange={(e) => setAuditYear(Number(e.target.value))} style={{ width: 68, fontSize: 11, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontFamily: 'inherit' }}>
                      {[today.getFullYear() - 1, today.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={() => refetchAudit()} title="Actualizar" style={{ padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#ff5e3a', display: 'flex', alignItems: 'center' }}>
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  {auditData && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, flex: 1 }}>{auditData.range.label} · {auditData.total} reg.</span>
                      <button onClick={handleExportPdf} disabled={auditExporting || auditData.total === 0}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', border: 'none', borderRadius: 4, cursor: auditData.total === 0 ? 'not-allowed' : 'pointer', background: auditData.total === 0 ? '#e2e8f0' : '#ff5e3a', color: auditData.total === 0 ? '#94a3b8' : '#fff', textTransform: 'uppercase' }}>
                        <Download size={10} /> {auditExporting ? 'Generando…' : 'PDF'}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {auditLoading && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 12 }}>Cargando actividad…</div>}
                  {!auditLoading && auditData?.entries.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 12 }}>Sin actividad en este período</div>}
                  {!auditLoading && auditData?.entries.map((entry) => {
                    const color    = AUDIT_ACTION_COLOR[entry.action] ?? '#8fa0af';
                    const label    = AUDIT_ACTION_LABELS[entry.action] ?? entry.action;
                    const title    = entry.new_value?.title ?? entry.new_value?.entity_title ?? '';
                    const isSystem = entry.actor_type === 'system';
                    const time     = new Date(entry.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                    const date     = new Date(entry.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
                    return (
                      <div key={entry.id} style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderLeft: `3px solid ${color}`, borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color, background: `${color}18`, padding: '1px 5px', borderRadius: 3 }}>{AUDIT_ENTITY_LABEL[entry.entity_type] ?? entry.entity_type}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>{date} {time}</span>
                        </div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#0e2235', margin: '0 0 2px' }}>{label}</p>
                        {title && <p style={{ fontSize: 10, color: '#475569', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>}
                        <p style={{ fontSize: 10, color: isSystem ? '#8fa0af' : '#64748b', margin: '2px 0 0', fontStyle: isSystem ? 'italic' : 'normal' }}>
                          {isSystem ? 'Sistema' : entry.actor_name}
                          {entry.actor_email && !isSystem && <span style={{ color: '#94a3b8' }}> · {entry.actor_email}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {rightTab === 'disponibilidad' && <AvailabilityPanel moduleId={ctx.moduleId} />}
          </div>

          <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Crear Tarea u Evento
          </button>
        </div>
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} isSuperadmin={isSuperadmin} moduleId={ctx.moduleId} onAudit={() => {}} />}
      {selectedReq     && <EventDetailPopup req={selectedReq} role={role} onClose={() => setSelectedReq(null)} onRefresh={() => refetch()} onAudit={() => {}} />}
      {selectedTicket  && <TicketSlaPopup ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}
      {selectedMeeting && <MeetingPopup meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />}
      {selectedCalEvent && <CalEventPopup ev={selectedCalEvent} onClose={() => setSelectedCalEvent(null)} />}
    </div>
  );
}
