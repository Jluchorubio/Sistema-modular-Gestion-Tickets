import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

const CalendarClient = dynamic(
  () => import('./_components/CalendarClient').then((m) => ({ default: m.CalendarClient })),
  { ssr: false, loading: () => <Spinner /> },
);

export default function CalendarPage() {
  return <CalendarClient />;
}
