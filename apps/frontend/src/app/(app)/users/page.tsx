import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SkeletonUsersList } from '@/components/ui/Skeleton';
import { UsersClient } from './_components/UsersClient';

export const metadata: Metadata = {
  title: 'Usuarios — NEXO',
};

export default function UsersPage() {
  return (
    <Suspense fallback={<SkeletonUsersList />}>
      <UsersClient />
    </Suspense>
  );
}
