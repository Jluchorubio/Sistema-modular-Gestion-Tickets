'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { ReportsClient } from '@/app/(app)/reports/_components/ReportsClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

export default function ModuleSlugReportsPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();

  const navItems = useMemo(() => buildDynamicModuleNav(moduleSlug), [moduleSlug]);

  const { data: allModules, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => modulesService.getModules(),
  });
  const moduleRef = allModules?.find((m) => m.slug === moduleSlug);

  useModuleNav(moduleRef?.name ?? '', navItems, moduleRef?.id);

  if (isLoading || !moduleRef) return <Spinner />;
  return <ReportsClient />;
}
