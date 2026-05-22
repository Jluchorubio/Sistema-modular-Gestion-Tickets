import { TicketWorkspace } from '../../_components/TicketWorkspace';

interface Props {
  params: { ticketId: string };
}

export default function TicketWorkspacePage({ params }: Props) {
  return <TicketWorkspace ticketId={params.ticketId} />;
}
