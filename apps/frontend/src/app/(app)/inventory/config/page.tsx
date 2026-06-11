'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, FolderOpen, type LucideIcon } from 'lucide-react';
import { OverflowTabBar } from '@/components/ui/OverflowTabBar';
import { useModules }    from '@/hooks/useModules';
import { useModuleNav }  from '@/hooks/useModuleNav';
import { useAuthStore }  from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient }  from '@/components/modules/ModuleConfigClient';
import { CategoriesTab }       from '@/components/config/CategoriesTab';

import { Spinner }             from '@/components/ui/Spinner';
import { ContextNav }           from '@/components/ui/ContextNav';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';
import styles from '@/app/(app)/requests/config/config.module.css';

type Tab = 'general' | 'categorias';

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'general',    label: 'General',    Icon: Settings  },
  { key: 'categorias', label: 'Categorías', Icon: FolderOpen },
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
    <>
    <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Inventario', href: '/inventory' }, { label: 'Configuración' }]} />
    <div className={styles.pageWrap}>
      <div className={styles.mainContent}>

        <div className={styles.header}>
          <h1 className={styles.title}>Configuración — Inventario</h1>
          <p className={styles.subtitle}>Categorías de activos y configuración general del módulo de inventario.</p>
        </div>

        <OverflowTabBar
          tabs={TABS}
          active={tab}
          onChange={k => setTab(k as Tab)}
          cls={{ bar: styles.tabBar, btn: styles.tabBtn, active: styles.tabBtnActive }}
        />

        <div className={styles.content}>
          {tab === 'general'    && (
            <ModuleConfigClient
              module={mod}
              moduleId={inventoryRef.id}
              isSuperadmin={isSuperadmin}
              isAdminModulo={isAdminModulo}
              isInventory
              isAlwaysOpen
            />
          )}
          {tab === 'categorias' && <CategoriesTab moduleId={inventoryRef.id} />}
        </div>

      </div>
    </div>
    </>
  );
}
