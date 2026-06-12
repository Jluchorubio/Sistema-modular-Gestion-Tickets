import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SkeletonProfileLeft, SkeletonProfileRight } from '@/components/ui/Skeleton';
import { ProfileClient } from './_components/ProfileClient';

export const metadata: Metadata = {
  title: 'Mi Perfil — NEXO',
};

function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 0 60px', display: 'flex', gap: 28 }}>
      <SkeletonProfileLeft />
      <SkeletonProfileRight />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileClient />
    </Suspense>
  );
}
