import dynamic from 'next/dynamic';
import { SkeletonReports } from '@/components/ui/Skeleton';
import { ContextNav } from '@/components/ui/ContextNav';

const ReportsClient = dynamic(
  () => import('./_components/ReportsClient').then((m) => ({ default: m.ReportsClient })),
  { ssr: false, loading: () => <div style={{ padding: '28px 32px' }}><SkeletonReports /></div> },
);

export default function ReportsPage() {
  return (
    <>
      <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reportes' }]} />
      <ReportsClient />
    </>
  );
}
