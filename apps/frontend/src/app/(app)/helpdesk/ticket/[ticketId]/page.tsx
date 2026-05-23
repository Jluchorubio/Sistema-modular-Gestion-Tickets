import { TicketWorkspace } from '@/app/(app)/tickets/_components/TicketWorkspace';

interface Props {
  params: { ticketId: string };
}

export default function HelpdeskTicketPage({ params }: Props) {
  return <TicketWorkspace ticketId={params.ticketId} />;
}
