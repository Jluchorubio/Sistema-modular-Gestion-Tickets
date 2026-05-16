import dynamic from 'next/dynamic';
import { SkeletonReports } from '@/components/ui/Skeleton';

const ReportsClient = dynamic(
  () => import('./_components/ReportsClient').then((m) => ({ default: m.ReportsClient })),
  { ssr: false, loading: () => <div style={{ padding: '28px 32px' }}><SkeletonReports /></div> },
);

export default function ReportsPage() {
  return <ReportsClient />;
}
