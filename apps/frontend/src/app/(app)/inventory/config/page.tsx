'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Shield, CalendarClock, FolderOpen, MapPin, type LucideIcon } from 'lucide-react';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient }  from '@/components/modules/ModuleConfigClient';
import { SlaTicketsTab }       from '@/components/config/SlaTicketsTab';
import { ModuleCalendarioTab } from '@/components/config/ModuleCalendarioTab';
import { CategoriesTab }       from '@/components/config/CategoriesTab';
import { LocationsTab }        from '@/components/config/LocationsTab';
import { Spinner }             from '@/components/ui/Spinner';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';
import styles from '@/app/(app)/requests/config/config.module.css';

type Tab = 'general' | 'categorias' | 'sedes' | 'sla' | 'calendario';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',    label: 'General',      Icon: Settings     },
  { key: 'categorias', label: 'Categorías',   Icon: FolderOpen   },
  { key: 'sedes',      label: 'Sedes',        Icon: MapPin       },
  { key: 'sla',        label: 'SLA',          Icon: Shield       },
  { key: 'calendario', label: 'Calendario',   Icon: CalendarClock },
];

export default function InventoryConfigPage() {
  const [tab, setTab] = useState<Tab>('general');

  const { modules, isLoading: modsLoading } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  const user         = useAuthStore(s => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', inventoryRef?.id],
    queryFn:  () => modulesService.getModule(inventoryRef!.id),
    enabled:  !!inventoryRef?.id,
  });

  if (modsLoading || modLoading || !inventoryRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === inventoryRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <h1 className={styles.title}>Configuración — Inventario</h1>
          <p className={styles.subtitle}>Categorías de activos, sedes y ambientes, SLA de mantenimiento y comportamiento operativo del módulo.</p>
        </div>

        <div className={styles.tabBar}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`${styles.tabBtn}${tab === key ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'general'    && (
            <ModuleConfigClient
              module={mod}
              moduleId={inventoryRef.id}
              isSuperadmin={isSuperadmin}
              isAdminModulo={isAdminModulo}
            />
          )}
          {tab === 'categorias' && <CategoriesTab moduleId={inventoryRef.id} />}
          {tab === 'sedes'      && <LocationsTab  moduleId={inventoryRef.id} />}
          {tab === 'sla'        && <SlaTicketsTab moduleId={inventoryRef.id} />}
          {tab === 'calendario' && <ModuleCalendarioTab moduleId={inventoryRef.id} />}
        </div>

      </div>
    </div>
  );
}
