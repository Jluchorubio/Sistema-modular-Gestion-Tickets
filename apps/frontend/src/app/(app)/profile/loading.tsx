import { SkeletonProfileLeft, SkeletonProfileRight } from '@/components/ui/Skeleton';

export default function ProfileLoading() {
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 0 60px' }}>
      <div style={{ display: 'flex', gap: 38, alignItems: 'flex-start' }}>
        <SkeletonProfileLeft />
        <SkeletonProfileRight />
      </div>
    </div>
  );
}
