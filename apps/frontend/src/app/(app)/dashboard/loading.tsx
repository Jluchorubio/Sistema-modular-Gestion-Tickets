import { SkeletonCard } from '@/components/ui/Skeleton';
import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <>
      <Skeleton height={22} width={160} style={{ marginBottom: 6 }} />
      <Skeleton height={13} width={80} style={{ marginBottom: 28 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
        {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    </>
  );
}
