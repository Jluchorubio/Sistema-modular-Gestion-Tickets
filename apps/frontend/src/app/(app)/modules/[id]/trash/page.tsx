'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { buildDynamicModuleNav } from '../_nav';

export default function DynamicModuleTrashPage() {
  const { id } = useParams<{ id: string }>();
  const authUser     = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;
  const { data: mod } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
  });
  const navItems = useMemo(
    () => buildDynamicModuleNav(mod?.slug ?? id),
    [mod?.slug, id],
  );
  const isAdminModulo = !!id && !!authUser?.module_roles?.some(
    (r) => r.module_id === id && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  useModuleNav(mod?.name ?? '', navItems, id);

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  return <ModuleTrashClient itemType="request" />;
}
