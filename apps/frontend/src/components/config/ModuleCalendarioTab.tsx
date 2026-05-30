'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import type { BusinessHour, Holiday } from '@/services/system-config.service';
import { Spinner } from '@/components/ui/Spinner';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const s = {
  sectionTitle: {
    fontSize: 11, fontWeight: 900, color: '#0e2235',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  } satisfies React.CSSProperties,
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  } satisfies React.CSSProperties,
  sub: { fontSize: 11, color: '#94a3b8', marginBottom: 16 } satisfies React.CSSProperties,
  list: { display: 'flex', flexDirection: 'column' as const, gap: 4 } satisfies React.CSSProperties,
  row: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', background: '#f8fafc',
    border: '1px solid #e2e8f0', borderRadius: 6,
  } satisfies React.CSSProperties,
  name: { fontSize: 13, fontWeight: 600, color: '#0e2235', minWidth: 96 } satisfies React.CSSProperties,
  meta: { fontSize: 12, color: '#64748b' } satisfies React.CSSProperties,
  empty: {
    padding: '20px', textAlign: 'center' as const, color: '#94a3b8',
    fontSize: 13, background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0',
  } satisfies React.CSSProperties,
  btnEdit: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4,
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    background: '#fff', color: '#4f46e5',
  } satisfies React.CSSProperties,
  btnSave: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 12px', border: 'none', borderRadius: 4,
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    background: '#059669', color: '#fff',
  } satisfies React.CSSProperties,
  btnCancel: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    background: '#fff', color: '#64748b', border: '1px solid #e2e8f0',
  } satisfies React.CSSProperties,
  btnPrimary: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '5px 12px', border: 'none', borderRadius: 4,
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    background: '#0e2235', color: '#fff',
  } satisfies React.CSSProperties,
  btnDanger: {
    display: 'flex', alignItems: 'center', padding: '4px 6px',
    border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer',
    background: '#fff', color: '#ef4444', marginLeft: 'auto',
  } satisfies React.CSSProperties,
  editRow: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const,
    marginLeft: 'auto', flex: 1,
  } satisfies React.CSSProperties,
  label: { fontSize: 11, fontWeight: 700, color: '#64748b' } satisfies React.CSSProperties,
  input: {
    padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 4,
    fontSize: 12, fontFamily: 'inherit',
  } satisfies React.CSSProperties,
  inlineForm: {
    padding: '12px 14px', background: '#f8fafc',
    border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 12,
  } satisfies React.CSSProperties,
  formRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } satisfies React.CSSProperties,
  inlineActions: { display: 'flex', gap: 8, marginTop: 4 } satisfies React.CSSProperties,
};

interface Props {
  moduleId: string;
}

export function ModuleCalendarioTab({ moduleId }: Props) {
  const qc = useQueryClient();

  const hoursKey   = ['sys-sla-hours',   moduleId] as const;
  const holidayKey = ['sys-sla-holidays', moduleId] as const;

  const { data: hours    = [], isLoading: loadingHours    } = useQuery<BusinessHour[]>({
    queryKey: hoursKey,
    queryFn:  () => systemConfigService.getBusinessHours(moduleId),
    staleTime: 60_000,
  });
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery<Holiday[]>({
    queryKey: holidayKey,
    queryFn:  () => systemConfigService.getHolidays(moduleId),
    staleTime: 60_000,
  });

  const hourMap = useMemo(() => {
    const m = new Map<number, BusinessHour>();
    (hours as BusinessHour[]).forEach(h => m.set(h.day_of_week, h));
    return m;
  }, [hours]);

  const [editDay, setEditDay] = useState<number | null>(null);
  const [dayForm, setDayForm] = useState({ start_time: '07:00', end_time: '17:00', is_active: true });

  const upsertMut = useMutation({
    mutationFn: (dto: Parameters<typeof systemConfigService.upsertBusinessHour>[0]) =>
      systemConfigService.upsertBusinessHour(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [...hoursKey] }); setEditDay(null); },
  });

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm,    setHolidayForm]    = useState({ holiday_date: '', name: '' });

  const addHolidayMut = useMutation({
    mutationFn: (dto: { holiday_date: string; name: string; module_id?: string }) =>
      systemConfigService.createHoliday(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...holidayKey] });
      setShowAddHoliday(false);
      setHolidayForm({ holiday_date: '', name: '' });
    },
  });
  const delHolidayMut = useMutation({
    mutationFn: (id: string) => systemConfigService.deleteHoliday(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...holidayKey] }),
  });

  function openEditDay(dow: number) {
    const existing = hourMap.get(dow);
    setDayForm({
      start_time: existing?.start_time ?? '07:00',
      end_time:   existing?.end_time   ?? '17:00',
      is_active:  existing?.is_active  ?? true,
    });
    setEditDay(dow);
  }

  if (loadingHours || loadingHolidays) return <Spinner />;

  const noModuleHours = hours.length === 0;

  return (
    <div>
      {noModuleHours && (
        <div style={{ padding: '10px 14px', marginBottom: 16,
          background: 'rgba(99,102,241,.04)', border: '1px solid #e0e7ff',
          borderRadius: 6, fontSize: 12, color: '#6366f1' }}>
          Sin configuración específica — este módulo hereda el calendario global.
          Configura aquí para sobreescribirlo.
        </div>
      )}

      <div style={s.sectionHeader}>
        <div style={s.sectionTitle}>Horario laboral</div>
        <span style={s.meta}>Específico de este módulo · Sobreescribe el global</span>
      </div>
      <div style={s.sub}>
        Los días sin configurar heredan del global. Configura solo los que difieren.
      </div>

      <div style={s.list}>
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const bh        = hourMap.get(dow);
          const isEditing = editDay === dow;
          return (
            <div key={dow} style={s.row}>
              <span style={{ ...s.name, opacity: bh?.is_active === false ? 0.45 : 1 }}>
                {DAY_NAMES[dow]}
              </span>
              {!isEditing && (
                bh
                  ? <span style={{ ...s.meta, color: bh.is_active ? '#22c55e' : '#94a3b8' }}>
                      {bh.is_active ? `${bh.start_time.slice(0, 5)} – ${bh.end_time.slice(0, 5)}` : 'Inactivo'}
                    </span>
                  : <span style={{ ...s.meta, color: '#94a3b8' }}>Hereda global</span>
              )}

              {isEditing ? (
                <div style={s.editRow}>
                  <label style={s.label}>Inicio</label>
                  <input type="time" style={s.input} value={dayForm.start_time}
                    onChange={e => setDayForm(f => ({ ...f, start_time: e.target.value }))} />
                  <label style={s.label}>Fin</label>
                  <input type="time" style={s.input} value={dayForm.end_time}
                    onChange={e => setDayForm(f => ({ ...f, end_time: e.target.value }))} />
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: dayForm.is_active ? '#22c55e' : '#94a3b8', padding: '2px' }}
                    onClick={() => setDayForm(f => ({ ...f, is_active: !f.is_active }))}>
                    {dayForm.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button style={s.btnSave} disabled={upsertMut.isPending}
                    onClick={() => upsertMut.mutate({ day_of_week: dow, ...dayForm, module_id: moduleId })}>
                    <Check size={13} />
                  </button>
                  <button style={s.btnCancel} onClick={() => setEditDay(null)}>
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button style={s.btnEdit} onClick={() => openEditDay(dow)}>
                  <Pencil size={12} /> {bh ? 'Editar' : 'Configurar'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Holidays */}
      <div style={{ ...s.sectionHeader, marginTop: 32 }}>
        <div style={s.sectionTitle}>Feriados específicos</div>
        {!showAddHoliday && (
          <button style={s.btnPrimary} onClick={() => setShowAddHoliday(true)}>
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {showAddHoliday && (
        <div style={s.inlineForm}>
          <div style={s.formRow}>
            <label style={s.label}>Fecha</label>
            <input type="date" style={s.input} value={holidayForm.holiday_date}
              onChange={e => setHolidayForm(f => ({ ...f, holiday_date: e.target.value }))} />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Nombre</label>
            <input style={{ ...s.input, minWidth: 200 }} placeholder="ej. Día del módulo"
              value={holidayForm.name}
              onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={s.inlineActions}>
            <button style={s.btnSave}
              disabled={addHolidayMut.isPending || !holidayForm.holiday_date || !holidayForm.name.trim()}
              onClick={() => addHolidayMut.mutate({ ...holidayForm, module_id: moduleId })}>
              <Check size={13} /> {addHolidayMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button style={s.btnCancel} onClick={() => setShowAddHoliday(false)}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(holidays as Holiday[]).filter(h => h.module_id).length === 0 ? (
        <div style={s.empty}>Sin feriados específicos. Los feriados globales siguen aplicando.</div>
      ) : (
        <div style={s.list}>
          {(holidays as Holiday[]).filter(h => h.module_id).map(h => (
            <div key={h.id} style={{ ...s.row, opacity: h.is_active ? 1 : 0.45 }}>
              <div>
                <span style={s.name}>
                  {new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span style={s.meta}> · {h.name}</span>
              </div>
              <button style={s.btnDanger} disabled={delHolidayMut.isPending}
                onClick={() => delHolidayMut.mutate(h.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
