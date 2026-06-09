'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, User, Settings } from 'lucide-react';
import { type RequestPriority } from '@/services/requests.service';
import { calendarEventsService, type CalEventType, EVENT_COLORS } from '@/services/calendar-events.service';
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS } from '@/constants/requests';
import styles from '../calendar.module.css';

interface CreateModalProps {
  onClose:      () => void;
  onCreated:    () => void;
  isSuperadmin: boolean;
  moduleId?:    string;
  onAudit:      (cat: string, msg: string) => void;
}

export function CreateEventModal({ onClose, onCreated, isSuperadmin, moduleId, onAudit }: CreateModalProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [title,     setTitle]     = useState('');
  const [desc,      setDesc]      = useState('');
  const [priority,  setPriority]  = useState<RequestPriority>('media');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate,   setEndDate]   = useState('');
  const [endTime,   setEndTime]   = useState('10:00');
  const [allDay,    setAllDay]    = useState(false);
  const [eventType, setEventType] = useState<CalEventType>('personal');
  const [color,     setColor]     = useState('#0e2235');
  const [error,     setError]     = useState('');

  const mut = useMutation({
    mutationFn: () => {
      const startIso = allDay ? `${startDate}T00:00:00.000Z` : new Date(`${startDate}T${startTime}:00`).toISOString();
      const endIso   = allDay ? `${endDate || startDate}T23:59:59.000Z` : new Date(`${endDate || startDate}T${endTime}:00`).toISOString();
      return calendarEventsService.createEvent({
        title:       title.trim(),
        description: desc.trim() || undefined,
        event_type:  eventType,
        visibility:  eventType === 'module' ? 'module' : eventType === 'global' ? 'global' : 'private',
        module_id:   eventType === 'module' ? (moduleId ?? undefined) : undefined,
        start_at:    startIso,
        end_at:      endIso,
        all_day:     allDay,
        priority,
        color,
      });
    },
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      onAudit('EVENTO', `"${ev.title}" creado en el calendario.`);
      onCreated(); onClose();
    },
    onError: () => setError('Error al crear. Intenta de nuevo.'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3) { setError('Título mínimo 3 caracteres.'); return; }
    if (!startDate) { setError('Fecha de inicio requerida.'); return; }
    setError('');
    mut.mutate();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Nuevo Evento de Calendario</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={15} /></button>
        </div>
        <form onSubmit={submit} className={styles.form}>
          {isSuperadmin && (
            <div>
              <label className={styles.fLabel}>Tipo</label>
              <div className={styles.typeRow}>
                {(['personal', 'module', 'global'] as CalEventType[]).map((t) => (
                  <button key={t} type="button"
                    className={`${styles.typeBtn} ${eventType === t ? styles.typeBtnActive : ''}`}
                    onClick={() => setEventType(t)}>
                    {t === 'personal' ? <><User size={12} /> Personal</> : t === 'module' ? <><Settings size={12} /> Módulo</> : '🌐 Global'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={styles.fLabel}>Título *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del evento…" className={styles.fInput} maxLength={200} />
          </div>
          <div>
            <label className={styles.fLabel}>Descripción</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción opcional…" rows={2} className={styles.fTextarea} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Todo el día
          </label>
          <div className={styles.fRow2}>
            <div>
              <label className={styles.fLabel}>Inicio *</label>
              <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className={styles.fInput} />
              {!allDay && (
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className={styles.fSelect} style={{ marginTop: 4 }}>
                  {['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={styles.fLabel}>Fin</label>
              <input type="date" value={endDate} min={startDate || today} onChange={(e) => setEndDate(e.target.value)} className={styles.fInput} />
              {!allDay && (
                <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className={styles.fSelect} style={{ marginTop: 4 }}>
                  {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className={styles.fRow2}>
            <div>
              <label className={styles.fLabel}>Prioridad</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as RequestPriority)} className={styles.fSelect}>
                {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{REQUEST_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className={styles.fLabel}>Color</label>
              <select value={color} onChange={(e) => setColor(e.target.value)} className={styles.fSelect}>
                {Object.entries(EVENT_COLORS).map(([hex, name]) => <option key={hex} value={hex}>{name}</option>)}
              </select>
            </div>
          </div>
          {error && <p className={styles.fError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={mut.isPending}>
              <CheckCircle2 size={13} /> {mut.isPending ? 'Guardando…' : 'Crear Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
