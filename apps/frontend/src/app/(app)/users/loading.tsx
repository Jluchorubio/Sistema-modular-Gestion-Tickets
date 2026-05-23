import { Skeleton, SkeletonTableRows } from '@/components/ui/Skeleton';

export default function UsersLoading() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <Skeleton height={18} width={120} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={60} />
        </div>
        <Skeleton height={36} width={120} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Skeleton height={36} width={240} style={{ borderRadius: 8 }} />
        <Skeleton height={36} width={120} style={{ borderRadius: 8 }} />
        <Skeleton height={36} width={120} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Skeleton height={11} width="100%" />
        </div>
        <SkeletonTableRows rows={8} cols={5} />
      </div>
    </>
  );
}
