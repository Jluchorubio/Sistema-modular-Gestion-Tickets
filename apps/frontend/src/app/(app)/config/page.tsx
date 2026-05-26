'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, MapPin, Layers, Briefcase, Clock, Shield,
  Plus, Trash2, Pencil, Check, X, Upload, AlertCircle, Tags, ToggleLeft, ToggleRight,
  ChevronRight, ChevronDown, CalendarClock, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { systemConfigService }  from '@/services/system-config.service';
import { permissionsService }   from '@/services/permissions.service';
import type { PermissionDef, RoleInfo, ModuleScope } from '@/services/permissions.service';
import { usePermission }        from '@/hooks/usePermission';
import { usePermissionsStore }  from '@/stores/permissions.store';
import { Spinner }              from '@/components/ui/Spinner';
import type {
  Headquarter, Department, Position, SlaRule, Company, RequestTypeConfig,
  DamageType, BusinessHour, Holiday, TicketSlaPolicy, TicketSlaRule, SlaCondition,
} from '@/services/system-config.service';
import { modulesService } from '@/services/modules.service';
import styles from './config.module.css';

type Tab = 'empresa' | 'sedes' | 'departamentos' | 'cargos' | 'sla' | 'calendario' | 'daños' | 'sla-tickets' | 'tipos' | 'permisos' | 'importar';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'empresa',       label: 'Empresa',        Icon: Building2    },
  { key: 'sedes',         label: 'Sedes',          Icon: MapPin       },
  { key: 'departamentos', label: 'Departamentos',  Icon: Layers       },
  { key: 'cargos',        label: 'Cargos',         Icon: Briefcase    },
  { key: 'sla',           label: 'SLA Solicitudes',Icon: Clock        },
  { key: 'calendario',    label: 'Calendario SLA', Icon: CalendarClock},
  { key: 'daños',         label: 'Tipos de Daño',  Icon: Wrench       },
  { key: 'sla-tickets',   label: 'SLA Tickets',    Icon: Shield       },
  { key: 'tipos',         label: 'Tipos Solicitud',Icon: Tags         },
  { key: 'permisos',      label: 'Roles y Permisos', Icon: Shield     },
  { key: 'importar',      label: 'Importar',       Icon: Upload       },
];

/* ── Company tab ───────────────────────────────────────────────── */

function CompanyTab() {
  const qc = useQueryClient();
  const { data: company, isLoading } = useQuery({
    queryKey: ['sys-config-company'],
    queryFn:  systemConfigService.getCompany,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<Partial<Company>>({});

  const updateMut = useMutation({
    mutationFn: (dto: Partial<Company>) => systemConfigService.updateCompany(dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-company'] }); setEditing(false); },
  });

  if (isLoading) return <Spinner />;
  if (!company)  return <p className={styles.empty}>No hay datos de empresa.</p>;

  if (!editing) {
    return (
      <div>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>Datos de la empresa</div>
          <button className={styles.btnEdit} onClick={() => { setForm(company); setEditing(true); }}>
            <Pencil size={13} /> Editar
          </button>
        </div>
        <dl className={styles.dl}>
          <dt>Nombre</dt><dd>{company.name}</dd>
          <dt>Zona horaria</dt><dd>{company.timezone}</dd>
          <dt>Idioma</dt><dd>{company.language}</dd>
          <dt>Web</dt><dd>{company.website ?? '—'}</dd>
          <dt>Email contacto</dt><dd>{company.contact_email ?? '—'}</dd>
          <dt>Teléfono</dt><dd>{company.contact_phone ?? '—'}</dd>
          <dt>RUT / Fiscal ID</dt><dd>{company.fiscal_id ?? '—'}</dd>
          <dt>Industria</dt><dd>{company.industry ?? '—'}</dd>
          <dt>Empleados</dt><dd>{company.employee_count ?? '—'}</dd>
        </dl>
      </div>
    );
  }

  const textFields = ['name','timezone','language','website','contact_email','contact_phone','fiscal_id','industry'] as const;

  return (
    <div>
      <div className={styles.sectionTitle} style={{ marginBottom: 16 }}>Editar empresa</div>
      {textFields.map(k => (
        <div key={k} className={styles.formRow}>
          <label className={styles.fieldLabel}>{k.replace(/_/g,' ')}</label>
          <input
            className={styles.fieldInput}
            value={(form as any)[k] ?? ''}
            onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div className={styles.formRow}>
        <label className={styles.fieldLabel}>Nº empleados</label>
        <input
          type="number"
          className={styles.fieldInput}
          value={form.employee_count ?? ''}
          onChange={e => setForm(f => ({ ...f, employee_count: e.target.value ? Number(e.target.value) : undefined }))}
        />
      </div>
      <div className={styles.inlineActions}>
        <button className={styles.btnSave} disabled={updateMut.isPending}
          onClick={() => updateMut.mutate(form)}>
          <Check size={13} /> {updateMut.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button className={styles.btnCancel} onClick={() => setEditing(false)}>
          <X size={13} /> Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Generic CRUD list tab ──────────────────────────────────────── */

interface ListField {
  key:      string;
  label:    string;
  type?:    string;
  required?: boolean;
  min?:     number;
  max?:     number;
}

function ListTab<T extends { id: string; name: string }>({
  queryKey, queryFn, createFn, deleteFn, label, fields,
}: {
  queryKey: string[];
  queryFn:  () => Promise<T[]>;
  createFn: (data: any) => Promise<T>;
  deleteFn: (id: string) => Promise<any>;
  label:    string;
  fields:   ListField[];
}) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey, queryFn });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState<Record<string, any>>({});

  const createMut = useMutation({
    mutationFn: createFn,
    onSuccess: () => { qc.invalidateQueries({ queryKey }); setShowCreate(false); setForm({}); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const requiredField = fields.find(f => f.required);
  const canSave = requiredField ? !!form[requiredField.key] : !!form['name'];

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{label}</div>
        {!showCreate && (
          <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {showCreate && (
        <div className={styles.inlineForm}>
          {fields.map(f => (
            <div key={f.key} className={styles.formRow}>
              <label className={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</label>
              <input
                type={f.type ?? 'text'}
                className={styles.fieldInput}
                min={f.min}
                max={f.max}
                value={form[f.key] ?? ''}
                onChange={e => setForm(v => ({
                  ...v,
                  [f.key]: f.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value,
                }))}
              />
            </div>
          ))}
          <div className={styles.inlineActions}>
            <button
              className={styles.btnSave}
              disabled={createMut.isPending || !canSave}
              onClick={() => createMut.mutate(form)}
            >
              <Check size={13} /> {createMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => { setShowCreate(false); setForm({}); }}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(data as any[]).length === 0 ? (
        <div className={styles.empty}>No hay {label.toLowerCase()} registradas.</div>
      ) : (
        <div className={styles.list}>
          {(data as any[]).map(item => (
            <div key={item.id} className={styles.listRow}>
              <div>
                <span className={styles.listName}>{item.name}</span>
                {item.level       !== undefined && <span className={styles.listMeta}> · Nivel {item.level}</span>}
                {item.city        && <span className={styles.listMeta}> · {item.city}</span>}
                {item.department_name && <span className={styles.listMeta}> · {item.department_name}</span>}
                {item.area_count  !== undefined && <span className={styles.listMeta}> · {item.area_count} áreas</span>}
              </div>
              <button
                className={styles.iconBtnDanger}
                title="Desactivar"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(item.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── SLA tab ────────────────────────────────────────────────────── */

const SLA_PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

function SlaTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['sys-config-sla'],
    queryFn:  systemConfigService.getSlaRules,
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ hours_to_resolve: 24, hours_to_first_response: 1 });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: typeof editForm }) =>
      systemConfigService.updateSlaRule(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-config-sla'] }); setEditId(null); },
  });

  if (isLoading) return <Spinner />;

  const generic  = (rules as SlaRule[]).filter(r => !r.request_type);
  const specific = (rules as SlaRule[]).filter(r =>  r.request_type);

  const renderRule = (r: SlaRule) => {
    const isEditing = editId === r.id;
    return (
      <div key={r.id} className={styles.slaRow}>
        <div className={styles.slaMeta}>
          <span className={styles.slaPriority} data-priority={r.priority}>
            {SLA_PRIORITY_LABEL[r.priority]}
          </span>
          {r.request_type && <span className={styles.slaType}>{r.request_type}</span>}
        </div>
        {isEditing ? (
          <div className={styles.slaEditRow}>
            <label className={styles.fieldLabel} style={{ minWidth: 120 }}>Horas resolución</label>
            <input type="number" className={styles.slaInput} min={1}
              value={editForm.hours_to_resolve}
              onChange={e => setEditForm(f => ({ ...f, hours_to_resolve: Number(e.target.value) }))}
            />
            <label className={styles.fieldLabel} style={{ minWidth: 140 }}>Horas 1ª respuesta</label>
            <input type="number" className={styles.slaInput} min={1}
              value={editForm.hours_to_first_response}
              onChange={e => setEditForm(f => ({ ...f, hours_to_first_response: Number(e.target.value) }))}
            />
            <button className={styles.btnSave} disabled={updateMut.isPending}
              onClick={() => updateMut.mutate({ id: r.id, dto: editForm })}>
              <Check size={13} />
            </button>
            <button className={styles.btnCancel} onClick={() => setEditId(null)}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className={styles.slaValues}>
            <span>{r.hours_to_resolve}h resolución</span>
            <span>{r.hours_to_first_response}h primera respuesta</span>
            <button className={styles.btnEdit}
              onClick={() => {
                setEditId(r.id);
                setEditForm({ hours_to_resolve: r.hours_to_resolve, hours_to_first_response: r.hours_to_first_response });
              }}>
              <Pencil size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className={styles.sectionTitle}>Reglas SLA globales</div>
      <div className={styles.slaSub}>Aplican a todos los tipos de solicitud según prioridad</div>
      <div className={styles.slaGroup}>{generic.map(renderRule)}</div>

      {specific.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Reglas SLA específicas</div>
          <div className={styles.slaSub}>Sobreescriben las reglas globales para tipos específicos</div>
          <div className={styles.slaGroup}>{specific.map(renderRule)}</div>
        </>
      )}
    </div>
  );
}

/* ── Request types tab ──────────────────────────────────────────── */

function RequestTypesTab() {
  const qc = useQueryClient();
  const { data: types = [], isLoading } = useQuery<RequestTypeConfig[]>({
    queryKey: ['sys-config-request-types'],
    queryFn:  () => systemConfigService.getRequestTypes(false),
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; description: string }>({ label: '', description: '' });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) =>
      systemConfigService.updateRequestType(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-config-request-types'] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      systemConfigService.updateRequestType(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sys-config-request-types'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Tipos de solicitud</div>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Activa/desactiva tipos o edita su etiqueta. Los tipos inactivos no aparecen al crear solicitudes.
      </div>

      <div className={styles.list}>
        {(types as RequestTypeConfig[]).sort((a, b) => a.sort_order - b.sort_order).map(t => {
          const isEditing = editId === t.id;
          return (
            <div key={t.id} className={styles.listRow} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                <button
                  className={styles.iconBtn}
                  title={t.is_active ? 'Desactivar' : 'Activar'}
                  disabled={toggleMut.isPending}
                  onClick={() => toggleMut.mutate({ id: t.id, is_active: !t.is_active })}
                  style={{ color: t.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}
                >
                  {t.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <div style={{ flex: 1 }}>
                  <span className={styles.listName} style={{ opacity: t.is_active ? 1 : 0.45 }}>
                    {t.label}
                  </span>
                  <span className={styles.listMeta}> · <code style={{ fontSize: 11 }}>{t.type_key}</code></span>
                  {t.requires_module && (
                    <span className={styles.listMeta} style={{ color: '#6366f1' }}> · módulo requerido</span>
                  )}
                  {t.allows_manual_priority && (
                    <span className={styles.listMeta} style={{ color: '#f59e0b' }}> · prioridad manual</span>
                  )}
                </div>
                {!isEditing && (
                  <button
                    className={styles.btnEdit}
                    onClick={() => { setEditId(t.id); setEditForm({ label: t.label, description: t.description ?? '' }); }}
                  >
                    <Pencil size={12} /> Editar
                  </button>
                )}
              </div>
              {isEditing && (
                <div className={styles.inlineForm} style={{ width: '100%', marginTop: 4 }}>
                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Etiqueta</label>
                    <input className={styles.fieldInput} value={editForm.label}
                      onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.fieldLabel}>Descripción</label>
                    <input className={styles.fieldInput} value={editForm.description}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                  <div className={styles.inlineActions}>
                    <button className={styles.btnSave} disabled={updateMut.isPending || !editForm.label.trim()}
                      onClick={() => { updateMut.mutate({ id: t.id, dto: editForm }); setEditId(null); }}>
                      <Check size={13} /> Guardar
                    </button>
                    <button className={styles.btnCancel} onClick={() => setEditId(null)}>
                      <X size={13} /> Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Calendar SLA tab ──────────────────────────────────────────── */

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function CalendarioTab() {
  const qc = useQueryClient();

  const { data: hours = [], isLoading: loadingHours } = useQuery<BusinessHour[]>({
    queryKey: ['sys-sla-hours'],
    queryFn:  () => systemConfigService.getBusinessHours(),
  });

  const { data: holidays = [], isLoading: loadingHolidays } = useQuery<Holiday[]>({
    queryKey: ['sys-sla-holidays'],
    queryFn:  () => systemConfigService.getHolidays(),
  });

  // Build map: day_of_week → BusinessHour | undefined
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-sla-hours'] }); setEditDay(null); },
  });

  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [holidayForm,    setHolidayForm]    = useState({ holiday_date: '', name: '' });

  const addHolidayMut = useMutation({
    mutationFn: systemConfigService.createHoliday,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sys-sla-holidays'] });
      setShowAddHoliday(false);
      setHolidayForm({ holiday_date: '', name: '' });
    },
  });

  const delHolidayMut = useMutation({
    mutationFn: systemConfigService.deleteHoliday,
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
      {/* ── Business hours ── */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Horario laboral</div>
        <span className={styles.listMeta}>Afecta cálculo de deadlines SLA</span>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Los días sin configurar se tratan como no laborales. El sistema salta feriados y horas fuera de rango.
      </div>

      <div className={styles.list}>
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const bh = hourMap.get(dow);
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
                        {bh.is_active ? `${bh.start_time.slice(0,5)} – ${bh.end_time.slice(0,5)}` : 'Inactivo'}
                      </span>
                    : <span className={styles.listMeta} style={{ color: '#94a3b8' }}>Sin configurar</span>
                )}
              </div>

              {isEditing ? (
                <div className={styles.slaEditRow}>
                  <label className={styles.fieldLabel}>Inicio</label>
                  <input type="time" className={styles.slaInput}
                    value={dayForm.start_time}
                    onChange={e => setDayForm(f => ({ ...f, start_time: e.target.value }))}
                  />
                  <label className={styles.fieldLabel}>Fin</label>
                  <input type="time" className={styles.slaInput}
                    value={dayForm.end_time}
                    onChange={e => setDayForm(f => ({ ...f, end_time: e.target.value }))}
                  />
                  <button
                    className={styles.iconBtn}
                    title={dayForm.is_active ? 'Activo' : 'Inactivo'}
                    onClick={() => setDayForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ color: dayForm.is_active ? '#22c55e' : '#94a3b8' }}
                  >
                    {dayForm.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                  </button>
                  <button className={styles.btnSave} disabled={upsertMut.isPending}
                    onClick={() => upsertMut.mutate({ day_of_week: dow, ...dayForm })}>
                    <Check size={13} />
                  </button>
                  <button className={styles.btnCancel} onClick={() => setEditDay(null)}>
                    <X size={13} />
                  </button>
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

      {/* ── Holidays ── */}
      <div className={styles.sectionHeader} style={{ marginTop: 32 }}>
        <div className={styles.sectionTitle}>Feriados</div>
        {!showAddHoliday && (
          <button className={styles.btnPrimary} onClick={() => setShowAddHoliday(true)}>
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {showAddHoliday && (
        <div className={styles.inlineForm}>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Fecha</label>
            <input type="date" className={styles.fieldInput}
              value={holidayForm.holiday_date}
              onChange={e => setHolidayForm(f => ({ ...f, holiday_date: e.target.value }))}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel}>Nombre</label>
            <input className={styles.fieldInput} placeholder="ej. Día de la Independencia"
              value={holidayForm.name}
              onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className={styles.inlineActions}>
            <button className={styles.btnSave}
              disabled={addHolidayMut.isPending || !holidayForm.holiday_date || !holidayForm.name.trim()}
              onClick={() => addHolidayMut.mutate(holidayForm)}>
              <Check size={13} /> {addHolidayMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button className={styles.btnCancel} onClick={() => setShowAddHoliday(false)}>
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {(holidays as Holiday[]).length === 0 ? (
        <div className={styles.empty}>Sin feriados configurados.</div>
      ) : (
        <div className={styles.list}>
          {(holidays as Holiday[]).map(h => (
            <div key={h.id} className={styles.listRow} style={{ opacity: h.is_active ? 1 : 0.45 }}>
              <div>
                <span className={styles.listName}>
                  {new Date(h.holiday_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className={styles.listMeta}> · {h.name}</span>
                {h.module_id && <span className={styles.listMeta} style={{ color: '#6366f1' }}> · módulo</span>}
              </div>
              <button className={styles.iconBtnDanger} title="Desactivar"
                disabled={delHolidayMut.isPending}
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

/* ── Damage types tab ───────────────────────────────────────────── */

const WEIGHT_COLOR = (w: number) =>
  w >= 9 ? '#ef4444' : w >= 7 ? '#f97316' : w >= 5 ? '#f59e0b' : '#64748b';

function DañosTab() {
  const qc = useQueryClient();

  const { data: allTypes = [], isLoading } = useQuery<DamageType[]>({
    queryKey: ['sys-damage-types'],
    queryFn:  () => systemConfigService.getDamageTypes(),
  });

  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', weight: 5 });

  const updateMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: { label?: string; weight?: number; is_active?: boolean } }) =>
      systemConfigService.updateDamageType(id, dto),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sys-damage-types'] }); setEditId(null); },
  });

  if (isLoading) return <Spinner />;

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; color: string | null; icon: string | null; types: DamageType[] }>();
    (allTypes as DamageType[]).forEach(dt => {
      if (!map.has(dt.category_slug)) {
        map.set(dt.category_slug, { label: dt.category_label, color: null, icon: null, types: [] });
      }
      map.get(dt.category_slug)!.types.push(dt);
    });
    return map;
  }, [allTypes]);

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Tipos de daño</div>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 20 }}>
        Catálogo estructurado. El <strong>peso</strong> (1–10) alimenta el score de prioridad automática.
        Desactivar un tipo lo oculta en el formulario de tickets sin borrar historial.
      </div>

      {Array.from(grouped.entries()).map(([catSlug, cat]) => (
        <div key={catSlug} style={{ marginBottom: 28 }}>
          <div className={styles.slaSub} style={{ fontWeight: 700, color: '#0e2235', marginBottom: 6, fontSize: 13 }}>
            {cat.label}
          </div>
          <div className={styles.list}>
            {cat.types.map(dt => {
              const isEditing = editId === dt.id;
              return (
                <div key={dt.id} className={styles.listRow}
                  style={{ opacity: dt.is_active ? 1 : 0.45, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                    {/* Active toggle */}
                    <button
                      className={styles.iconBtn}
                      title={dt.is_active ? 'Desactivar' : 'Activar'}
                      disabled={updateMut.isPending}
                      onClick={() => updateMut.mutate({ id: dt.id, dto: { is_active: !dt.is_active } })}
                      style={{ color: dt.is_active ? '#22c55e' : '#94a3b8', flexShrink: 0 }}
                    >
                      {dt.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>

                    <div style={{ flex: 1 }}>
                      <span className={styles.listName}>{dt.label}</span>
                      {dt.is_other && (
                        <span className={styles.listMeta} style={{ color: '#6366f1' }}> · libre</span>
                      )}
                    </div>

                    {/* Priority badge */}
                    <span className={styles.slaPriority} data-priority={dt.default_priority}
                      style={{ fontSize: 10, padding: '1px 8px' }}>
                      {dt.default_priority}
                    </span>

                    {/* Weight badge */}
                    <span style={{
                      fontSize: 11, fontWeight: 700, minWidth: 28, textAlign: 'center',
                      color: WEIGHT_COLOR(dt.weight), background: '#f1f5f9', borderRadius: 6, padding: '2px 6px',
                    }}>
                      {dt.weight}
                    </span>

                    {!isEditing && (
                      <button className={styles.btnEdit}
                        onClick={() => { setEditId(dt.id); setEditForm({ label: dt.label, weight: dt.weight }); }}>
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>

                  {isEditing && (
                    <div className={styles.inlineForm} style={{ width: '100%', marginTop: 4 }}>
                      <div className={styles.formRow}>
                        <label className={styles.fieldLabel}>Etiqueta</label>
                        <input className={styles.fieldInput} value={editForm.label}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                      </div>
                      <div className={styles.formRow}>
                        <label className={styles.fieldLabel}>Peso (1–10)</label>
                        <input type="range" min={1} max={10} style={{ flex: 1 }}
                          value={editForm.weight}
                          onChange={e => setEditForm(f => ({ ...f, weight: Number(e.target.value) }))}
                        />
                        <span style={{ minWidth: 24, fontWeight: 700, color: WEIGHT_COLOR(editForm.weight) }}>
                          {editForm.weight}
                        </span>
                      </div>
                      <div className={styles.inlineActions}>
                        <button className={styles.btnSave}
                          disabled={updateMut.isPending || !editForm.label.trim()}
                          onClick={() => updateMut.mutate({ id: dt.id, dto: editForm })}>
                          <Check size={13} /> Guardar
                        </button>
                        <button className={styles.btnCancel} onClick={() => setEditId(null)}>
                          <X size={13} /> Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Import tab ─────────────────────────────────────────────────── */

function ImportTab() {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<any[] | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [result,   setResult]  = useState<any | null>(null);

  const importMut = useMutation({
    mutationFn: (users: any[]) => systemConfigService.bulkImport(users),
    onSuccess: (data) => { setResult(data); setPreview(null); },
  });

  function parseCSV() {
    setParseErr(null);
    setResult(null);
    try {
      const lines = rawText.trim().split('\n').filter(Boolean);
      if (lines.length < 2) throw new Error('El CSV debe tener encabezado + al menos 1 fila');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { if (vals[i]) obj[h] = vals[i]; });
        return obj;
      });
      if (!rows[0]?.email)      throw new Error('Columna "email" requerida');
      if (!rows[0]?.first_name) throw new Error('Columna "first_name" requerida');
      if (!rows[0]?.last_name)  throw new Error('Columna "last_name" requerida');
      setPreview(rows);
    } catch (e: any) {
      setParseErr(e.message);
    }
  }

  return (
    <div>
      <div className={styles.sectionTitle}>Importación masiva de usuarios</div>
      <div className={styles.importInstructions}>
        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Pega el contenido de tu CSV. Columnas requeridas: <code>email, first_name, last_name</code>.
          Opcionales: <code>username, phone, job_title, department, headquarters_name, position_name, global_role_name</code>.
        </span>
      </div>

      <textarea
        className={styles.csvTextarea}
        placeholder={'email,first_name,last_name,job_title,headquarters_name\njuan@empresa.com,Juan,Pérez,Analista,Bogotá'}
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        rows={8}
      />

      <div className={styles.importActions}>
        <button className={styles.btnSecondary} onClick={parseCSV} disabled={!rawText.trim()}>
          Vista previa
        </button>
        {preview && (
          <button
            className={styles.btnPrimary}
            disabled={importMut.isPending}
            onClick={() => importMut.mutate(preview)}
          >
            <Upload size={13} /> {importMut.isPending ? 'Importando…' : `Importar ${preview.length} usuarios`}
          </button>
        )}
      </div>

      {parseErr && (
        <div className={styles.importErr}><AlertCircle size={13} /> {parseErr}</div>
      )}

      {preview && !result && (
        <div className={styles.previewTable}>
          <div className={styles.previewTitle}>Vista previa — {preview.length} filas</div>
          <table>
            <thead>
              <tr>
                <th>Email</th><th>Nombre</th><th>Apellido</th><th>Cargo</th><th>Sede</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td>{r.email}</td><td>{r.first_name}</td><td>{r.last_name}</td>
                  <td>{r.job_title ?? r.position_name ?? '—'}</td>
                  <td>{r.headquarters_name ?? r.primary_sede ?? '—'}</td>
                </tr>
              ))}
              {preview.length > 10 && (
                <tr><td colSpan={5} className={styles.previewMore}>+{preview.length - 10} más…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className={styles.importResult}>
          <div className={styles.importSummary}>
            <span className={styles.importCreated}>✓ {result.summary.created} creados</span>
            <span className={styles.importExists}> {result.summary.exists} ya existían</span>
            {result.summary.errors > 0 && (
              <span className={styles.importErrors}>✗ {result.summary.errors} errores</span>
            )}
          </div>
          {result.results
            .filter((r: any) => r.status === 'error')
            .map((r: any) => (
              <div key={r.email} className={styles.importErrRow}>
                ✗ {r.email}: {r.detail}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── Permission tree helpers ────────────────────────────────────── */

interface TreeNode extends PermissionDef {
  children: TreeNode[];
}

function buildTree(perms: PermissionDef[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  perms.forEach(p => map.set(p.key, { ...p, children: [] }));
  const roots: TreeNode[] = [];
  const sorted = [...perms].sort((a, b) => a.sort_order - b.sort_order);
  sorted.forEach(p => {
    const node = map.get(p.key)!;
    if (!p.parent_key || !map.has(p.parent_key)) {
      roots.push(node);
    } else {
      map.get(p.parent_key)!.children.push(node);
    }
  });
  return roots;
}

const SCOPE_LABELS: Record<string, string> = {
  global:     'Global',
  gestion:    'Gestión Administrativa',
  helpdesk:   'Helpdesk',
  inventario: 'Inventario',
};

/* ── Permission tree node ───────────────────────────────────────── */

interface PermNodeProps {
  node:       TreeNode;
  depth:      number;
  granted:    Set<string>;
  roleId:     string;
  roleType:   'global' | 'module';
  isPending:  boolean;
  onToggle:         (args: { roleId: string; permKey: string; granted: boolean; roleType: 'global' | 'module' }) => void;
  onGrantChildren:  (args: { roleId: string; parentKey: string; roleType: 'global' | 'module' }) => void;
  onRevokeChildren: (args: { roleId: string; parentKey: string }) => void;
}

function PermNode({ node, depth, granted, roleId, roleType, isPending, onToggle, onGrantChildren, onRevokeChildren }: PermNodeProps) {
  const [collapsed, setCollapsed] = useState(depth > 0);
  const isGranted   = granted.has(node.key);
  const hasChildren = node.children.length > 0;

  return (
    <div className={styles.permNode}>
      <div className={styles.permNodeRow}>
        <div style={{ width: 18, flexShrink: 0 }}>
          {hasChildren && (
            <button className={styles.permCollapseBtn} onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>

        <input
          type="checkbox"
          className={styles.permCheckbox}
          checked={isGranted}
          disabled={isPending}
          onChange={() => onToggle({ roleId, permKey: node.key, granted: !isGranted, roleType })}
        />

        <div className={styles.permNodeLabel}>
          <span style={{ fontWeight: hasChildren ? 600 : 400 }}>{node.label}</span>
          <span className={styles.permNodeKey}>{node.key}</span>
        </div>

        {hasChildren && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className={styles.permGrantAll}
              disabled={isPending}
              title="Otorgar este permiso y todos sus hijos"
              onClick={() => onGrantChildren({ roleId, parentKey: node.key, roleType })}
            >
              ↓ todos
            </button>
            <button
              className={styles.permRevokeAll}
              disabled={isPending}
              title="Revocar este permiso y todos sus hijos"
              onClick={() => onRevokeChildren({ roleId, parentKey: node.key })}
            >
              ✕ todos
            </button>
          </div>
        )}
      </div>

      {hasChildren && !collapsed && (
        <div className={styles.permChildren}>
          {node.children.map(child => (
            <PermNode
              key={child.key}
              node={child}
              depth={depth + 1}
              granted={granted}
              roleId={roleId}
              roleType={roleType}
              isPending={isPending}
              onToggle={onToggle}
              onGrantChildren={onGrantChildren}
              onRevokeChildren={onRevokeChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Roles & Permissions tab ────────────────────────────────────── */

function RolesPermissionsTab() {
  const qc = useQueryClient();
  const [roleTab,         setRoleTab]         = useState<'global' | 'module'>('global');
  const [selectedRoleId,  setSelectedRoleId]  = useState<string | null>(null);
  const [selectedModId,   setSelectedModId]   = useState<string | null>(null);

  const { data: permTree = [],    isLoading: loadingTree }    = useQuery<PermissionDef[]>({
    queryKey: ['perm-tree'],
    queryFn:  permissionsService.getPermissionTree,
  });

  const { data: globalRoles = [], isLoading: loadingGlobal } = useQuery<RoleInfo[]>({
    queryKey: ['perm-global-roles'],
    queryFn:  permissionsService.getGlobalRoles,
  });

  const { data: modules = [],     isLoading: loadingModules } = useQuery<ModuleScope[]>({
    queryKey: ['perm-modules'],
    queryFn:  permissionsService.getModulesWithScopes,
  });

  const { data: moduleRoles = [] } = useQuery<RoleInfo[]>({
    queryKey: ['perm-module-roles', selectedModId],
    queryFn:  () => permissionsService.getModuleRoles(selectedModId!),
    enabled:  !!selectedModId,
  });

  const { data: grants = [], isLoading: loadingGrants } = useQuery<string[]>({
    queryKey: ['perm-grants', selectedRoleId, roleTab],
    queryFn:  () => roleTab === 'global'
      ? permissionsService.getGlobalRoleGrants(selectedRoleId!)
      : permissionsService.getModuleRoleGrants(selectedRoleId!),
    enabled:  !!selectedRoleId,
  });

  const grantedSet = useMemo(() => new Set(grants), [grants]);

  const invalidateGrants = () => qc.invalidateQueries({ queryKey: ['perm-grants', selectedRoleId, roleTab] });

  const toggleMut = useMutation({
    mutationFn: (args: { roleId: string; permKey: string; granted: boolean; roleType: 'global' | 'module' }) =>
      permissionsService.toggleGrant(args.roleId, args.permKey, args.granted, args.roleType),
    onSuccess: invalidateGrants,
  });

  const grantChildrenMut = useMutation({
    mutationFn: (args: { roleId: string; parentKey: string; roleType: 'global' | 'module' }) =>
      permissionsService.grantAllChildren(args.roleId, args.parentKey, args.roleType),
    onSuccess: invalidateGrants,
  });

  const revokeChildrenMut = useMutation({
    mutationFn: (args: { roleId: string; parentKey: string }) =>
      permissionsService.revokeAllChildren(args.roleId, args.parentKey),
    onSuccess: invalidateGrants,
  });

  const isPending = toggleMut.isPending || grantChildrenMut.isPending || revokeChildrenMut.isPending;

  // Build tree + group by scope
  const treeByScope = useMemo(() => {
    const roots = buildTree(permTree);
    const grouped: Record<string, TreeNode[]> = {};
    roots.forEach(node => {
      if (!grouped[node.scope]) grouped[node.scope] = [];
      grouped[node.scope].push(node);
    });
    return grouped;
  }, [permTree]);

  const scopeOrder = ['global', 'gestion', 'helpdesk', 'inventario'];

  function selectRole(id: string) {
    setSelectedRoleId(id);
  }

  if (loadingTree || loadingGlobal || loadingModules) return <Spinner />;

  return (
    <div>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Roles y Permisos</div>
      </div>
      <div className={styles.slaSub} style={{ marginBottom: 16 }}>
        Selecciona un rol para gestionar qué permisos tiene. Los cambios se aplican de inmediato.
      </div>

      <div className={styles.permLayout}>
        {/* ── Left: role selector ── */}
        <div className={styles.permRoles}>
          <div className={styles.permRoleTabs}>
            <button
              className={`${styles.permRoleTabBtn}${roleTab === 'global' ? ` ${styles.permRoleTabBtnActive}` : ''}`}
              onClick={() => { setRoleTab('global'); setSelectedRoleId(null); }}
            >
              Global
            </button>
            <button
              className={`${styles.permRoleTabBtn}${roleTab === 'module' ? ` ${styles.permRoleTabBtnActive}` : ''}`}
              onClick={() => { setRoleTab('module'); setSelectedRoleId(null); }}
            >
              Módulo
            </button>
          </div>

          {roleTab === 'global' && (
            <div className={styles.permRoleList}>
              {globalRoles.map(role => (
                <div
                  key={role.id}
                  className={`${styles.permRoleItem}${selectedRoleId === role.id ? ` ${styles.permRoleItemActive}` : ''}`}
                  onClick={() => selectRole(role.id)}
                >
                  <span style={{ flex: 1 }}>{role.name}</span>
                  {!role.is_active && <span className={styles.permBadgeInactive}>inact.</span>}
                  {role.is_admin  && <span className={styles.permBadgeAdmin}>adm</span>}
                </div>
              ))}
            </div>
          )}

          {roleTab === 'module' && (
            <>
              <select
                className={styles.permModuleSelect}
                value={selectedModId ?? ''}
                onChange={e => { setSelectedModId(e.target.value || null); setSelectedRoleId(null); }}
              >
                <option value="">Seleccionar módulo…</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              {selectedModId && (
                <div className={styles.permRoleList}>
                  {moduleRoles.map(role => (
                    <div
                      key={role.id}
                      className={`${styles.permRoleItem}${selectedRoleId === role.id ? ` ${styles.permRoleItemActive}` : ''}`}
                      onClick={() => selectRole(role.id)}
                    >
                      <span style={{ flex: 1 }}>{role.name}</span>
                      {!role.is_active && <span className={styles.permBadgeInactive}>inact.</span>}
                    </div>
                  ))}
                  {moduleRoles.length === 0 && (
                    <div className={styles.permEmpty} style={{ height: 'auto', padding: '12px 0' }}>
                      Sin roles
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: permission tree ── */}
        <div className={styles.permTree}>
          {!selectedRoleId ? (
            <div className={styles.permEmpty}>
              Selecciona un rol para gestionar sus permisos
            </div>
          ) : loadingGrants ? (
            <Spinner />
          ) : (
            <div>
              {scopeOrder
                .filter(scope => treeByScope[scope]?.length)
                .map(scope => (
                  <div key={scope}>
                    <div className={styles.permScopeHeader}>
                      {SCOPE_LABELS[scope] ?? scope}
                    </div>
                    {treeByScope[scope].map(node => (
                      <PermNode
                        key={node.key}
                        node={node}
                        depth={0}
                        granted={grantedSet}
                        roleId={selectedRoleId}
                        roleType={roleTab}
                        isPending={isPending}
                        onToggle={toggleMut.mutate}
                        onGrantChildren={grantChildrenMut.mutate}
                        onRevokeChildren={revokeChildrenMut.mutate}
                      />
                    ))}
                  </div>
                ))}

              {/* Unknown scopes */}
              {Object.keys(treeByScope)
                .filter(s => !scopeOrder.includes(s))
                .map(scope => (
                  <div key={scope}>
                    <div className={styles.permScopeHeader}>{scope}</div>
                    {treeByScope[scope].map(node => (
                      <PermNode
                        key={node.key}
                        node={node}
                        depth={0}
                        granted={grantedSet}
                        roleId={selectedRoleId}
                        roleType={roleTab}
                        isPending={isPending}
                        onToggle={toggleMut.mutate}
                        onGrantChildren={grantChildrenMut.mutate}
                        onRevokeChildren={revokeChildrenMut.mutate}
                      />
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── SLA Tickets tab ────────────────────────────────────────────── */

const SLA_FIELDS = [
  { value: 'priority',       label: 'Prioridad'       },
  { value: 'urgency',        label: 'Urgencia'        },
  { value: 'impact',         label: 'Impacto'         },
  { value: 'damage_type_id', label: 'Tipo de daño'    },
  { value: 'category_id',    label: 'Categoría módulo'},
  { value: 'environment_id', label: 'Ambiente'        },
];

const SLA_OPERATORS = ['=', '!=', 'IN', '>', '<', '>=', '<='];

const PRIORITY_OPTIONS = ['baja', 'media', 'alta', 'critica'];
const URGENCY_OPTIONS  = ['baja', 'media', 'alta'];
const IMPACT_OPTIONS   = ['bajo', 'medio', 'alto'];

function fieldValueHint(field: string) {
  if (field === 'priority')  return PRIORITY_OPTIONS.join(' | ');
  if (field === 'urgency')   return URGENCY_OPTIONS.join(' | ');
  if (field === 'impact')    return IMPACT_OPTIONS.join(' | ');
  return 'uuid — o lista separada por coma si operator=IN';
}

const PRIORITY_COLORS: Record<string, string> = {
  baja: '#94a3b8', media: '#3b82f6', alta: '#f59e0b', critica: '#ef4444',
};

function ConditionChip({ cond, onDelete }: { cond: SlaCondition; onDelete: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#334155' }}>
      <span style={{ color: '#64748b', fontSize: 10 }}>G{cond.logical_group}</span>
      <span>{cond.field}</span>
      <span style={{ color: '#94a3b8' }}>{cond.operator}</span>
      <span style={{ color: '#0e2235', fontWeight: 700 }}>{cond.value}</span>
      <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '0 2px', lineHeight: 1, fontSize: 13 }}>×</button>
    </span>
  );
}

function AddConditionForm({ ruleId, onDone }: { ruleId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [field,   setField]   = useState('priority');
  const [op,      setOp]      = useState('=');
  const [value,   setValue]   = useState('');
  const [group,   setGroup]   = useState(1);

  const mut = useMutation({
    mutationFn: () => systemConfigService.createTicketSlaCondition(ruleId, { field, operator: op, value, logical_group: group }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setValue(''); onDone(); },
  });

  const inp: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 9px', fontSize: 12, fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0', marginTop: 8 }}>
      <select value={field} onChange={(e) => setField(e.target.value)} style={inp}>
        {SLA_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <select value={op} onChange={(e) => setOp(e.target.value)} style={{ ...inp, width: 60 }}>
        {SLA_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={fieldValueHint(field)}
        style={{ ...inp, minWidth: 140 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>Grupo</span>
        <input type="number" min={1} max={10} value={group} onChange={(e) => setGroup(Number(e.target.value))} style={{ ...inp, width: 50 }} />
      </div>
      <button type="button" disabled={!value.trim() || mut.isPending} onClick={() => mut.mutate()}
        style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#0e2235', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !value.trim() || mut.isPending ? .6 : 1 }}>
        + Agregar
      </button>
      <button type="button" onClick={onDone} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
        Cancelar
      </button>
    </div>
  );
}

function SlaRuleRow({ rule, policyId }: { rule: TicketSlaRule; policyId: string }) {
  const qc = useQueryClient();
  const [expanded,     setExpanded]     = useState(false);
  const [addingCond,   setAddingCond]   = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [hours,        setHours]        = useState(rule.hours_to_resolve);
  const prioColor = PRIORITY_COLORS[rule.priority_result] ?? '#64748b';

  const deleteRuleMut = useMutation({
    mutationFn: () => systemConfigService.deleteTicketSlaRule(rule.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });

  const updateHoursMut = useMutation({
    mutationFn: () => systemConfigService.updateTicketSlaRule(rule.id, { hours_to_resolve: hours }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setEditingHours(false); },
  });

  const deleteCondMut = useMutation({
    mutationFn: (condId: string) => systemConfigService.deleteTicketSlaCondition(condId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }),
  });

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
      {/* Rule header */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: '#fff', cursor: 'pointer', userSelect: 'none' }}
      >
        {expanded ? <ChevronDown size={13} style={{ color: '#94a3b8', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{rule.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: `${prioColor}18`, color: prioColor, border: `1px solid ${prioColor}40` }}>
          → {rule.priority_result}
        </span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{rule.hours_to_resolve}h</span>
        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 6 }}>
          {rule.conditions.length} cond.
        </span>
        <button type="button" onClick={(e) => { e.stopPropagation(); if (confirm(`Eliminar regla "${rule.name}"?`)) deleteRuleMut.mutate(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 4px' }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>

          {/* Hours editor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Horas SLA:</span>
            {editingHours ? (
              <>
                <input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '4px 8px', fontSize: 12, width: 70, fontFamily: 'inherit' }} />
                <button type="button" onClick={() => updateHoursMut.mutate()} disabled={updateHoursMut.isPending}
                  style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: '#0e2235', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <Check size={11} />
                </button>
                <button type="button" onClick={() => { setHours(rule.hours_to_resolve); setEditingHours(false); }}
                  style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <X size={11} />
                </button>
              </>
            ) : (
              <>
                <strong style={{ fontSize: 12, color: '#0f172a' }}>{rule.hours_to_resolve}h</strong>
                <button type="button" onClick={() => setEditingHours(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 4px' }}>
                  <Pencil size={11} />
                </button>
              </>
            )}
          </div>

          {/* Conditions */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Condiciones <span style={{ fontWeight: 400, color: '#cbd5e1' }}>(AND dentro del grupo · OR entre grupos)</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {rule.conditions.length === 0 ? (
                <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin condiciones — regla aplica siempre</span>
              ) : rule.conditions.map((c) => (
                <ConditionChip key={c.id} cond={c} onDelete={() => deleteCondMut.mutate(c.id)} />
              ))}
            </div>
          </div>

          {addingCond
            ? <AddConditionForm ruleId={rule.id} onDone={() => setAddingCond(false)} />
            : <button type="button" onClick={() => setAddingCond(true)}
                style={{ padding: '5px 12px', borderRadius: 7, border: '1px dashed #e2e8f0', background: 'transparent', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Plus size={10} /> Agregar condición
              </button>
          }
        </div>
      )}
    </div>
  );
}

function AddRuleForm({ policyId, onDone }: { policyId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [name,    setName]    = useState('');
  const [prio,    setPrio]    = useState('media');
  const [hours,   setHours]   = useState(24);

  const mut = useMutation({
    mutationFn: () => systemConfigService.createTicketSlaRule(policyId, { name, priority_result: prio, hours_to_resolve: hours }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['ticket-sla-policies'] }); setName(''); onDone(); },
  });

  const inp: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', background: '#fff' };

  return (
    <div style={{ padding: '14px 16px', background: '#fff', borderRadius: 12, border: '1.5px solid #0e2235', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ flex: '2 1 160px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Nombre *</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Daño crítico de hardware" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ flex: '1 1 100px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Prioridad resultado</p>
        <select value={prio} onChange={(e) => setPrio(e.target.value)} style={inp}>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ flex: '1 1 80px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#64748b' }}>Horas SLA</p>
        <input type="number" min={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" disabled={!name.trim() || mut.isPending} onClick={() => mut.mutate()}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: !name.trim() || mut.isPending ? .6 : 1 }}>
          {mut.isPending ? '…' : 'Crear regla'}
        </button>
        <button type="button" onClick={onDone}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SlaTicketsTab() {
  const { data: modules = [], isLoading: modsLoading } = useQuery({
    queryKey: ['all-modules'],
    queryFn:  () => modulesService.getModules(),
    staleTime: 5 * 60_000,
  });

  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [addingRule,       setAddingRule]        = useState(false);

  const { data: policies = [], isLoading: polLoading } = useQuery<TicketSlaPolicy[]>({
    queryKey: ['ticket-sla-policies', selectedModuleId],
    queryFn:  () => systemConfigService.getTicketSlaPolicies(selectedModuleId),
    enabled:  !!selectedModuleId,
    staleTime: 30_000,
  });

  const activePolicy = policies.find((p) => p.is_active) ?? policies[0] ?? null;

  const selStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px',
    fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer', color: '#0f172a',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Module selector */}
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#64748b' }}>Módulo</p>
        {modsLoading ? <Spinner /> : (
          <select value={selectedModuleId} onChange={(e) => { setSelectedModuleId(e.target.value); setAddingRule(false); }} style={{ ...selStyle, minWidth: 280 }}>
            <option value="">Seleccionar módulo…</option>
            {modules.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>

      {!selectedModuleId && (
        <p style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Selecciona un módulo para ver sus políticas SLA.</p>
      )}

      {selectedModuleId && polLoading && <Spinner />}

      {selectedModuleId && !polLoading && (
        <>
          {!activePolicy ? (
            <div style={{ padding: '16px 20px', borderRadius: 12, background: '#fff5f5', border: '1px solid #fecaca', color: '#ef4444', fontSize: 13 }}>
              Sin política SLA activa. Aplica la migración 007 para crear la política por defecto.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0e2235' }}>
                    {activePolicy.name} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>v{activePolicy.version}</span>
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                    {activePolicy.rules.length} regla(s) · AND dentro del grupo / OR entre grupos
                  </p>
                </div>
                {!addingRule && (
                  <button type="button" onClick={() => setAddingRule(true)}
                    style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#ff5e3a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Plus size={12} /> Nueva regla
                  </button>
                )}
              </div>

              {addingRule && <AddRuleForm policyId={activePolicy.id} onDone={() => setAddingRule(false)} />}

              {activePolicy.rules.length === 0 && !addingRule ? (
                <div style={{ padding: '20px', borderRadius: 12, background: '#f8fafc', border: '1px dashed #e2e8f0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Sin reglas — todos los tickets usarán las horas por defecto del sistema.
                </div>
              ) : (
                <div>
                  {activePolicy.rules.map((rule) => (
                    <SlaRuleRow key={rule.id} rule={rule} policyId={activePolicy.id} />
                  ))}
                </div>
              )}

              {/* Legend */}
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0f4f8', border: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
                <strong style={{ color: '#0e2235' }}>Cómo funciona:</strong> Las reglas se evalúan en orden. La primera que coincida define el plazo SLA.<br/>
                Dentro de una regla, las condiciones del mismo grupo se combinan con AND; grupos distintos se combinan con OR.<br/>
                El campo <em>Tipo de daño</em>, <em>Categoría</em> y <em>Ambiente</em> aceptan UUID. Para múltiples valores usa operator <code>IN</code> con valores separados por coma.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */

export default function GlobalConfigPage() {
  const loaded  = usePermissionsStore(s => s.loaded);
  const canView = usePermission('global:sidebar:config');
  const [tab, setTab] = useState<Tab>('empresa');

  if (loaded && !canView) return null;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Configuración del Sistema</h1>
            <p className={styles.subtitle}>Solo superadmin · Cambios aplicados inmediatamente</p>
          </div>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'empresa'       && <CompanyTab />}
          {tab === 'sedes'         && (
            <ListTab<Headquarter>
              queryKey={['sys-config-hq']}
              queryFn={systemConfigService.getHeadquarters}
              createFn={systemConfigService.createHeadquarter}
              deleteFn={systemConfigService.deleteHeadquarter}
              label="Sedes"
              fields={[
                { key: 'name',    label: 'Nombre',   required: true },
                { key: 'city',    label: 'Ciudad' },
                { key: 'address', label: 'Dirección' },
                { key: 'phone',   label: 'Teléfono' },
                { key: 'email',   label: 'Email' },
              ]}
            />
          )}
          {tab === 'departamentos' && (
            <ListTab<Department>
              queryKey={['sys-config-depts']}
              queryFn={systemConfigService.getDepartments}
              createFn={systemConfigService.createDepartment}
              deleteFn={systemConfigService.deleteDepartment}
              label="Departamentos"
              fields={[
                { key: 'name',        label: 'Nombre',      required: true },
                { key: 'description', label: 'Descripción' },
              ]}
            />
          )}
          {tab === 'cargos'        && (
            <ListTab<Position>
              queryKey={['sys-config-positions']}
              queryFn={systemConfigService.getPositions}
              createFn={systemConfigService.createPosition}
              deleteFn={systemConfigService.deletePosition}
              label="Cargos"
              fields={[
                { key: 'name',        label: 'Nombre',                   required: true },
                { key: 'level',       label: 'Nivel jerárquico (1–10)',  type: 'number', required: true, min: 1, max: 10 },
                { key: 'description', label: 'Descripción' },
              ]}
            />
          )}
          {tab === 'sla'           && <SlaTab />}
          {tab === 'calendario'    && <CalendarioTab />}
          {tab === 'daños'         && <DañosTab />}
          {tab === 'sla-tickets'   && <SlaTicketsTab />}
          {tab === 'tipos'         && <RequestTypesTab />}
          {tab === 'permisos'      && <RolesPermissionsTab />}
          {tab === 'importar'      && <ImportTab />}
        </div>

      </div>
    </div>
  );
}
