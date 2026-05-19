'use client';
import { usePermission } from '@/hooks/usePermission';

interface Props {
  perm:      string;
  children:  React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ perm, children, fallback = null }: Props) {
  const has = usePermission(perm);
  return has ? <>{children}</> : <>{fallback}</>;
}
