import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SkeletonDashboard } from '@/components/ui/Skeleton';
import { DashboardClient } from './_components/DashboardClient';

export const metadata: Metadata = {
  title: 'Dashboard — NEXO',
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<SkeletonDashboard />}>
      <DashboardClient />
    </Suspense>
  );
}
