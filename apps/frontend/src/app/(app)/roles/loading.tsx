import { Skeleton } from '@/components/ui/Skeleton';

export default function RolesLoading() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <Skeleton height={18} width={140} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={60} />
        </div>
        <Skeleton height={36} width={110} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <Skeleton height={14} width="35%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="55%" style={{ marginBottom: 4 }} />
              <Skeleton height={11} width="20%" />
            </div>
            <Skeleton height={28} width={90} style={{ borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </>
  );
}
