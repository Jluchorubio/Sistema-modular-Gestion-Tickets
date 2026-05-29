'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Shield, Wrench, CalendarClock, MapPin, type LucideIcon } from 'lucide-react';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient }   from '@/components/modules/ModuleConfigClient';
import { SlaTicketsTab }        from '@/components/config/SlaTicketsTab';
import { DamageTypesTab }       from '@/components/config/DamageTypesTab';
import { ModuleCalendarioTab }  from '@/components/config/ModuleCalendarioTab';
import { LocationsTab }         from '@/components/config/LocationsTab';
import { Spinner }              from '@/components/ui/Spinner';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

type Tab = 'general' | 'sedes' | 'sla-tickets' | 'daños' | 'calendario';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',     label: 'General',        Icon: Settings     },
  { key: 'sedes',       label: 'Sedes',          Icon: MapPin       },
  { key: 'sla-tickets', label: 'SLA Tickets',    Icon: Shield       },
  { key: 'daños',       label: 'Tipos de Daño',  Icon: Wrench       },
  { key: 'calendario',  label: 'Calendario',     Icon: CalendarClock },
];

const tabBar: React.CSSProperties = {
  display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20,
};
const tabBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px',
  fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
  fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em',
  border: active ? '1px solid #ff5e3a' : '1px solid #e2e8f0',
  background: active ? 'rgba(255,94,58,.06)' : '#fff',
  color: active ? '#ff5e3a' : '#64748b',
  transition: 'all .15s',
});

export default function HelpdeskConfigPage() {
  const [tab, setTab] = useState<Tab>('general');

  const { modules, isLoading: modsLoading } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', helpdeskRef?.id],
    queryFn:  () => modulesService.getModule(helpdeskRef!.id),
    enabled:  !!helpdeskRef?.id,
  });

  if (modsLoading || modLoading || !helpdeskRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === helpdeskRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <div style={{ padding: '20px 28px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0e2235', marginBottom: 4 }}>
        Configuración — Helpdesk
      </div>
      <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 24px' }}>
        Comportamiento operativo, sedes, SLA y tipos de daño del módulo Helpdesk.
      </p>

      <div style={tabBar}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} style={tabBtn(tab === key)} onClick={() => setTab(key)}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {tab === 'general'     && (
        <ModuleConfigClient
          module={mod}
          moduleId={helpdeskRef.id}
          isSuperadmin={isSuperadmin}
          isAdminModulo={isAdminModulo}
        />
      )}
      {tab === 'sedes'       && <LocationsTab  moduleId={helpdeskRef.id} />}
      {tab === 'sla-tickets' && <SlaTicketsTab moduleId={helpdeskRef.id} />}
      {tab === 'daños'       && <DamageTypesTab />}
      {tab === 'calendario'  && <ModuleCalendarioTab moduleId={helpdeskRef.id} />}
    </div>
  );
}
