'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { Spinner } from '@/components/ui/Spinner';
import { HelpdeskReportsClient } from '@/app/(app)/helpdesk/_components/HelpdeskReportsClient';
import { ReportsClient } from '@/app/(app)/reports/_components/ReportsClient';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';

const HELPDESK_TYPES = new Set(['helpdesk', 'soporte']);

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

  const modType = (moduleRef as any).type ?? null;
  if (HELPDESK_TYPES.has(modType) || modType == null) {
    return <HelpdeskReportsClient moduleId={moduleRef.id} />;
  }
  return <ReportsClient />;
}
