import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:8081')
        .split(',').map(s => s.trim());
      if (!origin || allowed.includes(origin)) cb(null, true);
      else cb(new Error(`WS CORS blocked: ${origin}`), false);
    },
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly connectedUsers = new Set<string>();
  private readonly lastSeenAt     = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const auth   = client.handshake.auth as Record<string, string>;
    const header = (client.handshake.headers.authorization ?? '').replace('Bearer ', '');
    const token  = auth?.token ?? header;
    if (!token) { client.disconnect(); return; }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      const userId = payload.sub;
      client.join(`user:${userId}`);
      client.data.userId = userId;
      this.connectedUsers.add(userId);
      this.server.emit('presence:change', { userId, connected: true });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client.data as Record<string, unknown>).userId as string | undefined;
    if (!userId) return;
    this.logger.debug(`WS disconnected: ${userId}`);
    const lastSeen = new Date().toISOString();
    this.connectedUsers.delete(userId);
    this.lastSeenAt.set(userId, lastSeen);
    this.server.emit('presence:change', { userId, connected: false, lastSeenAt: lastSeen });
  }

  /* ── Ticket rooms ── */

  @SubscribeMessage('join:ticket')
  handleJoinTicket(@ConnectedSocket() client: Socket, @MessageBody() ticketId: string) {
    client.join(`ticket:${ticketId}`);
  }

  @SubscribeMessage('leave:ticket')
  handleLeaveTicket(@ConnectedSocket() client: Socket, @MessageBody() ticketId: string) {
    client.leave(`ticket:${ticketId}`);
  }

  /* ── Tech availability ── */

  @OnEvent('tech.availability.changed')
  handleTechAvailabilityChanged(payload: { userId: string; moduleId: string; status: string; isAvailable: boolean }) {
    this.broadcastAll('tech:status_changed', payload);
  }

  /* ── Ticket events → broadcast to room ── */

  @OnEvent('ticket.state_changed')
  handleTicketStateChanged(payload: { ticketId: string; [key: string]: unknown }) {
    this.server?.to(`ticket:${payload.ticketId}`).emit('ticket:state_changed', payload);
    this.broadcastAll('ticket:queue_updated', { ticketId: payload.ticketId });
  }

  @OnEvent('ticket.comment_added')
  handleTicketCommentAdded(payload: { ticketId: string; [key: string]: unknown }) {
    this.server?.to(`ticket:${payload.ticketId}`).emit('ticket:comment_added', payload);
  }

  @OnEvent('ticket.assigned')
  handleTicketAssigned(payload: { ticketId: string; [key: string]: unknown }) {
    this.server?.to(`ticket:${payload.ticketId}`).emit('ticket:assigned', payload);
    this.broadcastAll('ticket:queue_updated', { ticketId: payload.ticketId });
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  broadcastAll(event: string, data: unknown): void {
    this.server?.emit(event, data);
  }

  isConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  @OnEvent('config.company.updated')
  handleCompanyUpdated(payload: Record<string, unknown>): void {
    this.broadcastAll('config:branding:updated', payload);
  }
}
