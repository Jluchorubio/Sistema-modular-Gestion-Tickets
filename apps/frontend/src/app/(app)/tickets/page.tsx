import dynamic from 'next/dynamic';
import { SkeletonTicketsList } from '@/components/ui/Skeleton';

const TicketsClient = dynamic(
  () => import('./_components/TicketsClient').then((m) => ({ default: m.TicketsClient })),
  { ssr: false, loading: () => <div style={{ padding: '28px 32px' }}><SkeletonTicketsList /></div> },
);

export default function TicketsPage() {
  return <TicketsClient />;
}
