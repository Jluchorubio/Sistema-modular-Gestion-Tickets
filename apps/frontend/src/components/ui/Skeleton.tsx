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

export function SkeletonCalendar() {
  const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton height={34} width={80} style={{ borderRadius: 8 }} />
          <Skeleton height={34} width={60} style={{ borderRadius: 8 }} />
          <Skeleton height={34} width={60} style={{ borderRadius: 8 }} />
        </div>
        <Skeleton height={22} width={200} style={{ borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton height={34} width={90} style={{ borderRadius: 8 }} />
          <Skeleton height={34} width={80} style={{ borderRadius: 8 }} />
        </div>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ padding: '8px 10px', textAlign: 'center' }}>
            <Skeleton height={11} width="60%" style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>
      {/* Calendar grid — 5 weeks */}
      {Array.from({ length: 5 }, (_, w) => (
        <div key={w} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} style={{ border: '1px solid #f1f5f9', borderRadius: 6, padding: '8px 10px', minHeight: 80 }}>
              <Skeleton height={12} width={20} style={{ marginBottom: 6 }} />
              {Math.random() > 0.7 && <Skeleton height={18} width="80%" style={{ borderRadius: 4 }} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonMyTickets({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Skeleton height={36} width={80} style={{ borderRadius: 8 }} />
        <div>
          <Skeleton height={20} width={140} style={{ marginBottom: 4 }} />
          <Skeleton height={11} width={60} />
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EDF3', overflow: 'hidden' }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 22px', borderBottom: i < rows - 1 ? '1px solid #F1F5F9' : undefined,
          }}>
            <div style={{ flex: 1 }}>
              <Skeleton height={14} width="60%" style={{ marginBottom: 5 }} />
              <Skeleton height={11} width="35%" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Skeleton height={20} width={50} style={{ borderRadius: 99 }} />
              <Skeleton height={20} width={65} style={{ borderRadius: 99 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonReports() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Skeleton height={26} width={140} style={{ marginBottom: 6 }} />
        <Skeleton height={13} width={200} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Skeleton circle width={44} height={44} />
            <div>
              <Skeleton height={24} width={60} style={{ marginBottom: 6 }} />
              <Skeleton height={12} width={100} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px' }}>
          <Skeleton height={12} width={120} style={{ marginBottom: 20 }} />
          <Skeleton circle width={110} height={110} style={{ margin: '0 auto 16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={28} />)}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px' }}>
          <Skeleton height={12} width={130} style={{ marginBottom: 20 }} />
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={14} style={{ marginBottom: 12 }} />)}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px' }}>
            <Skeleton height={12} width={140} style={{ marginBottom: 20 }} />
            {Array.from({ length: 5 }, (_, j) => <Skeleton key={j} height={8} style={{ marginBottom: 14, borderRadius: 99 }} />)}
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E8EDF3', padding: '20px 22px' }}>
        <Skeleton height={12} width={220} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <Skeleton key={i} height={`${20 + Math.floor(Math.random() * 60)}%`} width={14} style={{ flexShrink: 0, borderRadius: '3px 3px 0 0' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonInventory({ cards = 9 }: { cards?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Skeleton height={24} width={140} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={80} />
        </div>
        <Skeleton height={34} width={130} style={{ borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} height={32} width={90} style={{ borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={28} width={i === 0 ? 70 : 100} style={{ borderRadius: 99 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #E8EDF3', padding: '16px 18px', borderTop: '3px solid #E8EDF3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <Skeleton circle width={32} height={32} />
              <Skeleton height={20} width={70} style={{ borderRadius: 99 }} />
            </div>
            <Skeleton height={14} width="80%" style={{ marginBottom: 6 }} />
            <Skeleton height={11} width="60%" style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton height={10} width={60} />
              <Skeleton height={10} width={80} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTicketsList({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Skeleton height={24} width={120} style={{ marginBottom: 6 }} />
          <Skeleton height={12} width={80} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Skeleton height={34} width={90} style={{ borderRadius: 8 }} />
          <Skeleton height={34} width={120} style={{ borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={32} width={90} style={{ borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E8EDF3', overflow: 'hidden' }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < rows - 1 ? '1px solid #F1F5F9' : undefined }}>
            <div style={{ flex: 1 }}>
              <Skeleton height={14} width="55%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="35%" />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Skeleton height={20} width={50} style={{ borderRadius: 99 }} />
              <Skeleton height={20} width={65} style={{ borderRadius: 99 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonWorkspace() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f8fafc' }}>

      {/* Header — 56px sticky */}
      <div style={{ height: 56, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Skeleton height={28} width={72} style={{ borderRadius: 7, flexShrink: 0 }} />
        <Skeleton height={12} width={160} style={{ borderRadius: 4, flexShrink: 0 }} />
        <Skeleton height={14} style={{ flex: 1, maxWidth: 380, borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Skeleton height={20} width={74} style={{ borderRadius: 99 }} />
          <Skeleton height={20} width={52} style={{ borderRadius: 99 }} />
        </div>
      </div>

      {/* Context strip — 34px */}
      <div style={{ height: 34, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Skeleton height={10} width={100} style={{ borderRadius: 4 }} />
        <Skeleton height={10} width={60} style={{ borderRadius: 4 }} />
        <Skeleton height={18} width={80} style={{ borderRadius: 99 }} />
      </div>

      {/* Body grid — flex 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', flex: 1, overflow: 'hidden' }}>

        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #e2e8f0' }}>

          {/* Ticket detail card */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
            <Skeleton height={20} width="70%" style={{ marginBottom: 12, borderRadius: 4 }} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <Skeleton height={18} width={50} style={{ borderRadius: 99 }} />
              <Skeleton height={18} width={70} style={{ borderRadius: 99 }} />
              <Skeleton height={18} width={60} style={{ borderRadius: 99 }} />
            </div>
            <Skeleton height={12} width="90%" style={{ marginBottom: 6 }} />
            <Skeleton height={12} width="75%" />
          </div>

          {/* Tab bar */}
          <div style={{ height: 40, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {[90, 64, 84, 64].map((w, i) => (
              <Skeleton key={i} height={26} width={w} style={{ borderRadius: 7 }} />
            ))}
          </div>

          {/* Timeline content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <Skeleton circle width={32} height={32} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <Skeleton height={12} width={100} style={{ borderRadius: 4 }} />
                    <Skeleton height={12} width={60} style={{ borderRadius: 4 }} />
                  </div>
                  <Skeleton height={11} width={i % 2 === 0 ? '80%' : '55%'} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', background: '#fff' }}>
          {/* SLA block */}
          <div style={{ borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
            <Skeleton height={10} width={80} style={{ marginBottom: 10 }} />
            <Skeleton height={22} width="60%" style={{ marginBottom: 6 }} />
            <Skeleton height={8} style={{ borderRadius: 99 }} />
          </div>
          {/* Transitions */}
          <div style={{ borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
            <Skeleton height={10} width={110} style={{ marginBottom: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} height={34} style={{ borderRadius: 8 }} />
              ))}
            </div>
          </div>
          {/* Assignee block */}
          <div style={{ borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
            <Skeleton height={10} width={90} style={{ marginBottom: 10 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton circle width={34} height={34} />
              <div style={{ flex: 1 }}>
                <Skeleton height={13} width="70%" style={{ marginBottom: 5 }} />
                <Skeleton height={10} width="50%" />
              </div>
            </div>
          </div>
          {/* Extra info */}
          <div style={{ borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i}>
                <Skeleton height={9} width={70} style={{ marginBottom: 4 }} />
                <Skeleton height={12} width={i === 0 ? '80%' : i === 1 ? '55%' : '65%'} />
              </div>
            ))}
          </div>
        </div>
      </div>
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
