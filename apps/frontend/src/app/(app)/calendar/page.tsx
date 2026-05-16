import dynamic from 'next/dynamic';
import { SkeletonCalendar } from '@/components/ui/Skeleton';

const CalendarClient = dynamic(
  () => import('./_components/CalendarClient').then((m) => ({ default: m.CalendarClient })),
  { ssr: false, loading: () => <div style={{ padding: '28px 32px' }}><SkeletonCalendar /></div> },
);

export default function CalendarPage() {
  return <CalendarClient />;
}
