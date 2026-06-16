import { Skeleton } from '@/components/ui/Skeleton';

export default function TrashLoading() {
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <Skeleton height={18} width={100} style={{ marginBottom: 6 }} />
        <Skeleton height={12} width={120} style={{ marginBottom: 14 }} />
        <Skeleton height={13} width={300} style={{ marginBottom: 20 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={28} width={80} style={{ borderRadius: 20 }} />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ background: 'var(--app-card)', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <Skeleton height={14} width="50%" style={{ marginBottom: 6 }} />
            <Skeleton height={11} width="35%" />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Skeleton height={22} width={80} style={{ borderRadius: 12 }} />
            <Skeleton height={32} width={80} style={{ borderRadius: 7 }} />
            <Skeleton height={32} width={90} style={{ borderRadius: 7 }} />
          </div>
        </div>
      ))}
    </>
  );
}
