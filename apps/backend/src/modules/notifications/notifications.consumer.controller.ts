import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from '../../gateway/notifications.gateway';

/**
 * Microservice consumer — mirrors all @OnEvent handlers in
 * NotificationsService / NotificationsGateway for RabbitMQ delivery.
 * Active only when RABBITMQ_URL is set and the app runs as a hybrid.
 */
@Controller()
export class NotificationsConsumerController {
  constructor(
    private readonly svc: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  @EventPattern('ticket.created')
  onTicketCreated(@Payload() ev: Parameters<NotificationsService['onTicketCreated']>[0]) {
    return this.svc.onTicketCreated(ev);
  }

  /* ticket.assigned → notify assignee + WS broadcast */
  @EventPattern('ticket.assigned')
  async onTicketAssigned(@Payload() ev: Parameters<NotificationsService['onTicketAssigned']>[0] & { ticketId: string }) {
    await this.svc.onTicketAssigned(ev);
    this.gateway.handleTicketAssigned(ev);
  }

  /* ticket.state_changed → notify creator + WS broadcast */
  @EventPattern('ticket.state_changed')
  async onTicketStateChanged(@Payload() ev: Parameters<NotificationsService['onTicketStateChanged']>[0] & { ticketId: string }) {
    await this.svc.onTicketStateChanged(ev);
    this.gateway.handleTicketStateChanged(ev);
  }

  /* ticket.comment_added → notify creator + WS broadcast */
  @EventPattern('ticket.comment_added')
  async onCommentAdded(@Payload() ev: Parameters<NotificationsService['onCommentAdded']>[0] & { ticketId: string }) {
    await this.svc.onCommentAdded(ev);
    this.gateway.handleTicketCommentAdded(ev);
  }

  @EventPattern('ticket.validation_required')
  onTicketValidationRequired(@Payload() ev: Parameters<NotificationsService['onTicketValidationRequired']>[0]) {
    return this.svc.onTicketValidationRequired(ev);
  }

  @EventPattern('request.approved')
  onRequestApproved(@Payload() ev: Parameters<NotificationsService['onRequestApproved']>[0]) {
    return this.svc.onRequestApproved(ev);
  }

  @EventPattern('request.rejected')
  onRequestRejected(@Payload() ev: Parameters<NotificationsService['onRequestRejected']>[0]) {
    return this.svc.onRequestRejected(ev);
  }

  @EventPattern('request.taken')
  onRequestTaken(@Payload() ev: Parameters<NotificationsService['onRequestTaken']>[0]) {
    return this.svc.onRequestTaken(ev);
  }

  @EventPattern('meeting.scheduled')
  onMeetingScheduled(@Payload() ev: Parameters<NotificationsService['onMeetingScheduled']>[0]) {
    return this.svc.onMeetingScheduled(ev);
  }

  @EventPattern('tech.availability.changed')
  onTechAvailabilityChanged(@Payload() ev: { userId: string; moduleId: string; status: string; isAvailable: boolean }) {
    this.gateway.handleTechAvailabilityChanged(ev);
  }

  @EventPattern('config.company.updated')
  onCompanyUpdated(@Payload() ev: Record<string, unknown>) {
    this.gateway.handleCompanyUpdated(ev);
  }
}
