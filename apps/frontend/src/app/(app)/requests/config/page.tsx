'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Clock, Tags, type LucideIcon } from 'lucide-react';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient } from '@/components/modules/ModuleConfigClient';
import { SlaRequestsTab }     from '@/components/config/SlaRequestsTab';
import { RequestTypesTab }    from '@/components/config/RequestTypesTab';
import { Spinner }            from '@/components/ui/Spinner';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

type Tab = 'general' | 'sla' | 'tipos';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general', label: 'General',           Icon: Settings },
  { key: 'sla',     label: 'SLA Solicitudes',   Icon: Clock    },
  { key: 'tipos',   label: 'Tipos Solicitud',   Icon: Tags     },
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

export default function GestionConfigPage() {
  const [tab, setTab] = useState<Tab>('general');

  const { modules, isLoading: modsLoading } = useModules();
  const gestionRef = modules?.find(isGestionModule);
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', gestionRef?.id],
    queryFn:  () => modulesService.getModule(gestionRef!.id),
    enabled:  !!gestionRef?.id,
  });

  if (modsLoading || modLoading || !gestionRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === gestionRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#0e2235', marginBottom: 4 }}>
        Configuración — Gestión Administrativa
      </div>
      <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 24px' }}>
        Comportamiento operativo, SLA y tipos de solicitud del módulo de Gestión.
      </p>

      <div style={tabBar}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} style={tabBtn(tab === key)} onClick={() => setTab(key)}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <ModuleConfigClient
          module={mod}
          moduleId={gestionRef.id}
          isSuperadmin={isSuperadmin}
          isAdminModulo={isAdminModulo}
        />
      )}
      {tab === 'sla'   && <SlaRequestsTab />}
      {tab === 'tipos' && <RequestTypesTab />}
    </div>
  );
}
