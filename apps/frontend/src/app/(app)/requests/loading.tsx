import { Skeleton } from '@/components/ui/Skeleton';

export default function RequestsLoading() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Skeleton height={18} width={130} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={80} />
        </div>
        <Skeleton height={36} width={150} style={{ borderRadius: 8 }} />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <Skeleton height={14} width="55%" style={{ marginBottom: 8 }} />
              <Skeleton height={11} width="40%" />
            </div>
            <Skeleton height={22} width={80} style={{ borderRadius: 12 }} />
          </div>
          <Skeleton height={12} width="85%" style={{ marginBottom: 5 }} />
          <Skeleton height={12} width="70%" />
        </div>
      ))}
    </>
  );
}
