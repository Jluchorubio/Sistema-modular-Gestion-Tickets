import type { AdmRequest } from '@/services/requests.service';
import { REQUEST_STATUS_COLORS } from '@/constants/requests';

/* ── Branded types ── */
export type CalendarRole = 'superadmin' | 'admin' | 'jefe' | 'user';
export type CalendarView  = 'mes' | 'semana' | 'dia' | 'agenda' | 'año';
export type SourceFilter  = '' | 'system_tasks' | 'user_tasks' | 'requests';
export type RightTab      = 'agenda' | 'actividad' | 'disponibilidad';
export type AuditPeriod   = 'day' | 'week' | 'month' | 'year';

export interface DayData { reqs: number; sla: number; meet: number; cal: number }

export interface CalendarContext {
  id:       string;
  label:    string;
  sublabel: string;
  role:     CalendarRole;
  moduleId?: string;
}

/* ── Constants ── */
export const SLA_CALENDAR_HEX: Record<string, string> = {
  active:   '#1d4ed8',
  paused:   '#6d28d9',
  met:      '#15803d',
  breached: '#dc2626',
};

export const ROLE_NAME_MAP: Record<string, CalendarRole> = {
  admin_modulo: 'admin',
  jefe_tecnico: 'jefe',
  tecnico:      'user',
  usuario:      'user',
};

export const ROLE_DISPLAY: Record<string, string> = {
  admin_modulo: 'Admin',
  jefe_tecnico: 'Jefe Técnico',
  tecnico:      'Técnico',
  usuario:      'Usuario',
};

export const ROLE_AVAIL_COLOR: Record<string, string> = {
  admin_modulo: '#ff5e3a',
  jefe_tecnico: '#f59e0b',
  tecnico:      '#3b82f6',
  usuario:      '#94a3b8',
};

export const MONTHS_ES    = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
export const WEEKDAYS_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
export const MINI_DAYS    = ['L','M','X','J','V','S','D'];

export const SRC_COLORS = { system_task: '#8B5CF6', user_task: '#0e2235' };

export const FC_VIEW: Record<string, string> = {
  semana: 'dayGridWeek',
  dia:    'dayGridDay',
  agenda: 'listMonth',
};

/* ── Utility functions ── */
export function pad(n: number) { return String(n).padStart(2, '0'); }
export function toDateStr(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export function getReqDateStr(req: AdmRequest): string {
  if (req.type === 'task' && req.metadata?.due_date) return String(req.metadata.due_date).slice(0, 10);
  return req.created_at.slice(0, 10);
}

export function eventColor(req: AdmRequest): string {
  if (req.type === 'task') return req.task_source === 'system' ? SRC_COLORS.system_task : SRC_COLORS.user_task;
  return REQUEST_STATUS_COLORS[req.status] ?? '#94a3b8';
}

export function getCurrentWeekOfMonth(month: number, year: number): number {
  const now      = new Date();
  const firstDay = new Date(year, month - 1, 1);
  const firstDow = firstDay.getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const firstMon = new Date(year, month - 1, 1 - offset);
  return Math.max(1, Math.floor((now.getTime() - firstMon.getTime()) / (7 * 86400000)) + 1);
}

export function getWeeksInMonth(month: number, year: number): number {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay  = new Date(year, month, 0);
  const firstDow = firstDay.getDay();
  const offset   = firstDow === 0 ? 6 : firstDow - 1;
  const firstMon = new Date(year, month - 1, 1 - offset);
  let count = 0;
  const cur = new Date(firstMon);
  while (cur <= lastDay) { count++; cur.setDate(cur.getDate() + 7); }
  return count;
}
