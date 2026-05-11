'use client';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ProfileView, type ProfileUser } from '@/components/profile/ProfileView';
import { Spinner } from '@/components/ui/Spinner';

export function ProfileClient() {
  const { user, isLoading, error } = useCurrentUser();

  if (isLoading) return <Spinner />;
  if (error)     return <p style={{ color: '#ef4444', padding: 20 }}>Error cargando perfil</p>;
  if (!user)     return null;

  return <ProfileView user={user as ProfileUser} isOwnProfile={true} />;
}
