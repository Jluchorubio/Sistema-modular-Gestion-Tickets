import styles from './skeleton.module.css';

interface SkeletonProps {
  width?:  string | number;
  height?: string | number;
  circle?: boolean;
  style?:  React.CSSProperties;
  className?: string;
}

export function Skeleton({ width = '100%', height = 14, circle, style, className }: SkeletonProps) {
  return (
    <div
      className={`${styles.shimmer} ${circle ? styles.circle : styles.line} ${className ?? ''}`}
      style={{ width, height, ...(circle ? { borderRadius: '50%' } : {}), ...style }}
    />
  );
}

/* ── Composite skeletons ─────────────────────────────────────────────────── */

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.card}>
      <Skeleton height={18} width="60%" style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? '40%' : '90%'} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.row}>
          <Skeleton circle width={32} height={32} style={{ flexShrink: 0 }} />
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Skeleton key={c} height={12} width={c === 0 ? '25%' : c === 1 ? '20%' : '15%'} />
          ))}
        </div>
      ))}
    </>
  );
}

export function SkeletonProfileLeft() {
  return (
    <div style={{ width: 282 }}>
      <Skeleton circle width={226} height={226} style={{ marginBottom: 20 }} />
      <Skeleton height={24} width="70%" style={{ marginBottom: 8 }} />
      <Skeleton height={16} width="50%" style={{ marginBottom: 16 }} />
      <Skeleton height={36} style={{ marginBottom: 24, borderRadius: 8 }} />
      <Skeleton height={12} width="80%" style={{ marginBottom: 10 }} />
      <Skeleton height={12} width="65%" style={{ marginBottom: 10 }} />
      <Skeleton height={12} width="75%" style={{ marginBottom: 10 }} />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div>
      <Skeleton height={32} width="40%" style={{ marginBottom: 10, borderRadius: 6 }} />
      <Skeleton height={14} width="55%" style={{ marginBottom: 32 }} />
      <Skeleton height={14} width="18%" style={{ marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRolesList({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Skeleton height={24} width={180} style={{ marginBottom: 8 }} />
          <Skeleton height={13} width={80} />
        </div>
        <Skeleton height={36} width={110} style={{ borderRadius: 8 }} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ flex: 1 }}>
            <Skeleton height={15} width="30%" style={{ marginBottom: 8 }} />
            <Skeleton height={12} width="50%" />
          </div>
          <Skeleton height={30} width={90} style={{ borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTrashList({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Skeleton height={24} width={140} style={{ marginBottom: 8 }} />
          <Skeleton height={13} width={100} />
        </div>
      </div>
      <Skeleton height={13} width="60%" style={{ marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={34} width={80} style={{ borderRadius: 20 }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginBottom: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div>
            <Skeleton height={15} width={200} style={{ marginBottom: 8 }} />
            <Skeleton height={12} width={140} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton height={32} width={60} style={{ borderRadius: 6 }} />
            <Skeleton height={32} width={88} style={{ borderRadius: 6 }} />
            <Skeleton height={32} width={96} style={{ borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonUsersList({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Skeleton height={24} width={140} />
        <Skeleton height={36} width={120} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <Skeleton height={36} width={260} style={{ borderRadius: 8 }} />
        <Skeleton height={36} width={130} style={{ borderRadius: 8 }} />
        <Skeleton height={36} width={130} style={{ borderRadius: 8 }} />
      </div>
      <SkeletonTableRows rows={rows} cols={5} />
    </div>
  );
}

export function SkeletonProfileRight() {
  return (
    <div style={{ flex: 1 }}>
      <Skeleton height={36} style={{ marginBottom: 24, borderRadius: 8 }} />
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '22px 22px 26px', marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '22px 80px' }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i}>
              <Skeleton height={11} width="40%" style={{ marginBottom: 6 }} />
              <Skeleton height={14} width="70%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
