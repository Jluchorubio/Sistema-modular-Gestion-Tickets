'use client';
import { usePermissionState } from '@/hooks/usePermission';

interface Props {
  perm:      string;
  children:  React.ReactNode;
  fallback?: React.ReactNode;
  skeleton?: React.ReactNode;
}

export function PermissionGate({ perm, children, fallback = null, skeleton = null }: Props) {
  const { loading, allowed } = usePermissionState(perm);
  if (loading)  return <>{skeleton}</>;
  return allowed ? <>{children}</> : <>{fallback}</>;
}
