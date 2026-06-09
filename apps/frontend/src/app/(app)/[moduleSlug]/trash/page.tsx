'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

export default function ModuleSlugTrashPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const navItems  = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);
  const authUser  = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  const isAdminModulo = !!moduleRef?.id && !!authUser?.module_roles?.some(
    (r) => r.module_id === moduleRef.id && r.status === 'active' && r.role_name === 'admin_modulo',
  );

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef) return <Spinner />;

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  return <ModuleTrashClient itemType="request" />;
}
