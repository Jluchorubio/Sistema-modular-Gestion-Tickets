import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SkeletonRolesList } from '@/components/ui/Skeleton';
import { RolesClient } from './_components/RolesClient';

export const metadata: Metadata = {
  title: 'Roles Globales — Tickets System',
};

export default function RolesPage() {
  return (
    <Suspense fallback={<SkeletonRolesList />}>
      <RolesClient />
    </Suspense>
  );
}
