import { TicketWorkspace } from '@/app/(app)/tickets/_components/TicketWorkspace';

interface Props {
  params: { moduleSlug: string; ticketId: string };
}

export default function ModuleTicketWorkspacePage({ params }: Props) {
  return <TicketWorkspace ticketId={params.ticketId} />;
}
