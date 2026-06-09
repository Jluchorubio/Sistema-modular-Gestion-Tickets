import { TicketWorkspace } from '@/app/(app)/tickets/_components/TicketWorkspace';
import { TicketErrorBoundary } from '@/app/(app)/tickets/_components/TicketErrorBoundary';

interface Props {
  params: { moduleSlug: string; ticketId: string };
}

export default function ModuleTicketWorkspacePage({ params }: Props) {
  return (
    <TicketErrorBoundary>
      <TicketWorkspace ticketId={params.ticketId} />
    </TicketErrorBoundary>
  );
}
