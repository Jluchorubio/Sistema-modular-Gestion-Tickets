'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { systemConfigService } from '@/services/system-config.service';
import { useCriticalChange }   from '@/hooks/useCriticalChange';
import { CriticalChangeModal } from '@/components/config/CriticalChangeModal';
import { Spinner }             from '@/components/ui/Spinner';
import type { BusinessHour, Holiday } from '@/services/system-config.service';
import type { CriticalAuthData }      from '@/hooks/useCriticalChange';
import styles from '../../config.module.css';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function SyncColombiaBtn({ onSync }: { onSync: () => void }) {
  const year = new Date().getFullYear();
  const [result, setResult] = useState<{ synced: number; skipped: number } | null>(null);
  const mut = useMutation({
    mutationFn: () => systemConfigService.syncColombiaHolidays(year),
    onSuccess: (data) => { setResult(data); onSync(); setTimeout(() => setResult(null), 4_000); },
  });
  return (
    <button onClick={() => mut.mutate()} disabled={mut.isPending}
      title={`Importar feriados de Colombia ${year} desde Nager.Date`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
        background: mut.isPending ? 'var(--app-page)' : 'var(--app-card)', border: '1px solid var(--app-border)',
        borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit', color: result ? '#22c55e' : '#475569',
      }}>
      {mut.isPending
        ? <><Spinner /><span>Sincronizando…</span></>
        : result
        ? <><Check size={12} /> {result.synced} feriados importados</>
        : <>🇨🇴 Sync CO {year}</>}
    </button>
  );
}

export function CalendarioTab() {
  const qc       = useQueryClient();
  const critical = useCriticalChange();

  const { data: hours    = [], isLoading: loadingHours    } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
    staleTime: 60_000,
  });
  const { data: holidays = [], isLoading: loadingHolidays } = useQuery<Holiday[]>({
    queryKey: ['sys-sla-holidays'],
    queryFn:  () => systemConfigService.getHolidays(),
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
    mutationFn: (auth: CriticalAuthData) =>
      systemConfigService.upsertBusinessHour({ day_of_week: editDay!, ...dayForm }, auth),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-sla-hours'] }); setEditDay(null); },
  });

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm,    setHolidayForm]    = useState({ holiday_date: '', name: '' });

  const addHolidayMut = useMutation({
    mutationFn: (auth: CriticalAuthData) => systemConfigService.createHoliday(holidayForm, auth),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] });
      setShowAddHoliday(false);
      setHolidayForm({ holiday_date: '', name: '' });
    },
  });
  const delHolidayMut = useMutation({
    mutationFn: ({ id, auth }: { id: string; auth: CriticalAuthData }) =>
      systemConfigService.deleteHoliday(id, auth),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] }),
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

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Horario laboral</div>
        <span className={styles.listMeta}>Base global — cada módulo puede sobreescribirlo en su propia config</span>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Los días sin configurar se tratan como no laborales. El sistema salta feriados y horas fuera de rango.
      </div>

      <div className={styles.list}>
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const bh        = hourMap.get(dow);
          const isEditing = editDay === dow;
          return (
            <div key={dow} className={styles.listRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <span className={styles.listName} style={{ minWidth: 96, opacity: bh?.is_active === false ? 0.45 : 1 }}>
                  {DAY_NAMES[dow]}
                </span>
                {!isEditing && (
                  bh
                    ? <span className={styles.listMeta} style={{ color: bh.is_active ? '#22c55e' : '#94a3b8' }}>
                        {bh.is_active ? `${bh.start_time.slice(0, 5)} – ${bh.end_time.slice(0, 5)}` : 'Inactivo'}
                      </span>
                    : <span className={styles.listMeta} style={{ color: '#94a3b8' }}>Sin configurar</span>
                )}
              </div>

              {isEditing ? (
                <div className={styles.slaEditRow}>
                  <label className={styles.fieldLabel}>Inicio</label>
                  <input type="time" className={styles.slaInput} value={dayForm.start_time}
                    onChange={e => setDayForm(f => ({ ...f, start_time: e.target.value }))} />
                  <label className={styles.fieldLabel}>Fin</label>
                  <input type="time" className={styles.slaInput} value={dayForm.end_time}
                    onChange={e => setDayForm(f => ({ ...f, end_time: e.target.value }))} />
                  <button className={styles.iconBtn}
                    title={dayForm.is_active ? 'Activo' : 'Inactivo'}
                    onClick={() => setDayForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ color: dayForm.is_active ? '#22c55e' : '#94a3b8' }}>
                    {dayForm.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button className={styles.btnSave} disabled={upsertMut.isPending}
                    onClick={() => critical.triggerCritical(
                      { entityLabel: 'Horario Laboral', description: `Modifica el horario del ${DAY_NAMES[dow]} — afecta el cálculo de SLA activo` },
                      async (auth) => { await upsertMut.mutateAsync(auth); },
                    )}>
                    <Check size={13} />
                  </button>
                  <button className={styles.btnCancel} onClick={() => setEditDay(null)}><X size={13} /></button>
                </div>
              ) : (
                <button className={styles.btnEdit} onClick={() => openEditDay(dow)}>
                  <Pencil size={12} /> {bh ? 'Editar' : 'Configurar'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Holidays */}
      <div className={styles.sectionHeader} style={{ marginTop: 32 }}>
        <div className={styles.sectionTitle}>Feriados globales</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SyncColombiaBtn onSync={() => qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] })} />
          {!showAddHoliday && (
            <button className={styles.btnPrimary} onClick={() => setShowAddHoliday(true)}>
              <Plus size={13} /> Agregar
            </button>
          )}
        </div>
      </div>

      {showAddHoliday && (
        <div className={styles.inlineForm}>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Fecha</label>
            <input type="date" className={styles.fieldInput} value={holidayForm.holiday_date}
              onChange={e => setHolidayForm(f => ({ ...f, holiday_date: e.target.value }))} />
          </div>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Nombre</label>
            <input className={styles.fieldInput} placeholder="ej. Día de la Independencia"
              value={holidayForm.name}
              onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className={styles.inlineActions}>
            <button className={styles.btnSave}
              disabled={addHolidayMut.isPending || !holidayForm.holiday_date || !holidayForm.name.trim()}
              onClick={() => critical.triggerCritical(
                { entityLabel: 'Festivo', description: `Agregar "${holidayForm.name}" al calendario global — afecta el cálculo de SLA` },
                async (auth) => { await addHolidayMut.mutateAsync(auth); },
              )}>
              <Check size={13} /> {addHolidayMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => setShowAddHoliday(false)}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(holidays as Holiday[]).filter(h => !h.module_id).length === 0 ? (
        <div className={styles.empty}>Sin feriados globales configurados.</div>
      ) : (
        <div className={styles.list}>
          {(holidays as Holiday[]).filter(h => !h.module_id).map(h => (
            <div key={h.id} className={styles.listRow} style={{ opacity: h.is_active ? 1 : 0.45 }}>
              <div>
                <span className={styles.listName}>
                  {new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className={styles.listMeta}> · {h.name}</span>
              </div>
              <button className={styles.iconBtnDanger} title="Eliminar"
                disabled={delHolidayMut.isPending}
                onClick={() => critical.triggerCritical(
                  { entityLabel: 'Eliminar Festivo', description: `Quitar "${h.name}" del calendario global` },
                  async (auth) => { await delHolidayMut.mutateAsync({ id: h.id, auth }); },
                )}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <CriticalChangeModal {...critical} />
    </div>
  );
}
