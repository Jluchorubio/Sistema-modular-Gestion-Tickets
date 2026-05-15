'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { usersService } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { ProfileView, type ProfileUser } from '@/components/profile/ProfileView';
import { SkeletonProfileLeft, SkeletonProfileRight } from '@/components/ui/Skeleton';

function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 0 60px', display: 'flex', gap: 28 }}>
      <SkeletonProfileLeft />
      <SkeletonProfileRight />
    </div>
  );
}

export default function UserProfilePage() {
  const { id }     = useParams<{ id: string }>();
  const router     = useRouter();
  const { user: viewer } = useAuthStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn:  () => usersService.getUser(id),
    staleTime: 30_000,
    enabled:   !!id,
  });

  if (isLoading) return <ProfileSkeleton />;
  if (error)     return <p style={{ color: '#ef4444', padding: 20 }}>Error cargando perfil del usuario</p>;
  if (!data)     return null;

  const isOwnProfile        = viewer?.id === id;
  const viewerIsSuperadmin  = viewer?.is_superadmin === true;

  return (
    <ProfileView
      user={data as ProfileUser}
      isOwnProfile={isOwnProfile}
      viewerIsSuperadmin={viewerIsSuperadmin}
      onBack={() => router.push('/users')}
    />
  );
}
