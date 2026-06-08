import { useAuthStore } from '@/stores/auth.store';
import { ROLE_NAME_MAP, ROLE_DISPLAY, type CalendarContext } from '../_types';

export function useCalendarContexts(): CalendarContext[] {
  const user = useAuthStore((s) => s.user);
  if (user?.is_superadmin) {
    return [{ id: 'global', label: 'Vista global', sublabel: 'Superadmin', role: 'superadmin' }];
  }
  const active = user?.module_roles?.filter((r) => r.status === 'active') ?? [];
  if (active.length === 0) {
    return [{ id: 'personal', label: 'Personal', sublabel: 'Vista personal', role: 'user' }];
  }
  const seen = new Set<string>();
  const contexts: CalendarContext[] = [];
  for (const r of active) {
    const key = `${r.module_id}-${r.role_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contexts.push({
      id:       key,
      label:    r.module_name ?? r.module_id,
      sublabel: ROLE_DISPLAY[r.role_name] ?? r.role_name,
      role:     ROLE_NAME_MAP[r.role_name] ?? 'user',
      moduleId: r.module_id,
    });
  }
  contexts.push({ id: 'personal', label: 'Personal', sublabel: 'Mis solicitudes', role: 'user' });
  return contexts;
}
