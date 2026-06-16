import { Skeleton, SkeletonTableRows } from '@/components/ui/Skeleton';

export default function ModuleDetailLoading() {
  return (
    <>
      <Skeleton height={13} width={200} style={{ marginBottom: 20, borderRadius: 4 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <Skeleton height={22} width={200} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={80} />
        </div>
        <Skeleton height={36} width={150} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
            <Skeleton height={11} width="50%" style={{ marginBottom: 10 }} />
            <Skeleton height={28} width="40%" />
          </div>
        ))}
      </div>
      <Skeleton height={14} width={160} style={{ marginBottom: 16 }} />
      <div style={{ background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Skeleton height={11} width="100%" />
        </div>
        <SkeletonTableRows rows={6} cols={4} />
      </div>
    </>
  );
}
