import { SkeletonCalendar } from '@/components/ui/Skeleton';

export default function CalendarLoading() {
  return (
    <div style={{ padding: '28px 32px' }}>
      <SkeletonCalendar />
    </div>
  );
}
