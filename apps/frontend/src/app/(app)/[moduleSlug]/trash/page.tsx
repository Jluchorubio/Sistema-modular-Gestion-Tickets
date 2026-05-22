'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

export default function ModuleSlugTrashPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();

  const navItems = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef) return <Spinner />;
  return <ModuleTrashClient itemType="request" />;
}
