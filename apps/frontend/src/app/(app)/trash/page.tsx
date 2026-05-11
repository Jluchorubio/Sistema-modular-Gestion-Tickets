import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SkeletonTrashList } from '@/components/ui/Skeleton';
import { TrashClient } from './_components/TrashClient';

export const metadata: Metadata = {
  title: 'Papelera — Tickets System',
};

export default function TrashPage() {
  return (
    <Suspense fallback={<SkeletonTrashList />}>
      <TrashClient />
    </Suspense>
  );
}
