import { SkeletonTicketsList } from '@/components/ui/Skeleton';

export default function HelpdeskLoading() {
  return (
    <div style={{ padding: '28px 32px' }}>
      <SkeletonTicketsList />
    </div>
  );
}
