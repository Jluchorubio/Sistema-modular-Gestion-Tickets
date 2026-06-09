import { TicketWorkspace } from '../../_components/TicketWorkspace';
import { TicketErrorBoundary } from '../../_components/TicketErrorBoundary';

interface Props {
  params: { ticketId: string };
}

export default function TicketWorkspacePage({ params }: Props) {
  return (
    <TicketErrorBoundary>
      <TicketWorkspace ticketId={params.ticketId} />
    </TicketErrorBoundary>
  );
}
