'use client';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useModuleNav } from '@/hooks/useModuleNav';
import { modulesService } from '@/services/modules.service';
import { ReportsClient } from '@/app/(app)/reports/_components/ReportsClient';
import { buildDynamicModuleNav } from '../_nav';

export default function DynamicModuleReportsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: mod } = useQuery({
    queryKey: ['module', id],
    queryFn:  () => modulesService.getModule(id),
    enabled:  !!id,
    staleTime: 5 * 60_000,
  });
  const navItems = useMemo(
    () => buildDynamicModuleNav(mod?.slug ?? id),
    [mod?.slug, id],
  );
  useModuleNav(mod?.name ?? '', navItems, id);
  return <ReportsClient />;
}
