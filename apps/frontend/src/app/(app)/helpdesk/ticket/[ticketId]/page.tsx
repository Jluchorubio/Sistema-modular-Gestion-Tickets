import { TicketWorkspace } from '@/app/(app)/tickets/_components/TicketWorkspace';
import { TicketErrorBoundary } from '@/app/(app)/tickets/_components/TicketErrorBoundary';

interface Props {
  params: { ticketId: string };
}

export default function HelpdeskTicketPage({ params }: Props) {
  return (
    <TicketErrorBoundary>
      <TicketWorkspace ticketId={params.ticketId} />
    </TicketErrorBoundary>
  );
}
