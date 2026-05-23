'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleConfigClient } from '@/components/modules/ModuleConfigClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

export default function ModuleSlugConfigPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const navItems = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  const { data: mod } = useQuery({
    queryKey: ['module', moduleRef?.id],
    queryFn:  () => modulesService.getModule(moduleRef!.id),
    enabled:  !!moduleRef?.id,
  });

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    (r) => r.module_id === moduleRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <ModuleConfigClient
      module={mod}
      moduleId={moduleRef.id}
      isSuperadmin={isSuperadmin}
      isAdminModulo={isAdminModulo}
    />
  );
}
