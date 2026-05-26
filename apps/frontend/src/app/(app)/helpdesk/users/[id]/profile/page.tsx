'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { usersService } from '@/services/users.service';
import { ProfileView, type ProfileUser } from '@/components/profile/ProfileView';
import { SkeletonProfileLeft, SkeletonProfileRight } from '@/components/ui/Skeleton';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 0 60px', display: 'flex', gap: 28 }}>
      <SkeletonProfileLeft />
      <SkeletonProfileRight />
    </div>
  );
}

export default function HelpdeskUserProfilePage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { user: viewer } = useAuthStore();

  const { modules } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn:  () => usersService.getUser(id),
    staleTime: 30_000,
    enabled:   !!id,
  });

  if (isLoading) return <ProfileSkeleton />;
  if (error)     return <p style={{ color: '#ef4444', padding: 20 }}>Error cargando perfil del usuario</p>;
  if (!data)     return null;

  const isOwnProfile   = viewer?.id === id;
  const isSuperadmin   = viewer?.is_superadmin === true;
  const isAdminModulo  = viewer?.module_roles?.some(
    (r) => r.module_id === helpdeskRef?.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <ProfileView
      user={data as ProfileUser}
      isOwnProfile={isOwnProfile}
      viewerIsSuperadmin={isSuperadmin || isAdminModulo}
      onBack={() => router.push('/helpdesk/users')}
    />
  );
}
