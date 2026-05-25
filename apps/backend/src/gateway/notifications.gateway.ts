import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*', credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly connectedUsers = new Set<string>();

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
    this.connectedUsers.delete(userId);
    this.server.emit('presence:change', { userId, connected: false });
  }

  sendToUser(userId: string, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  isConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }
}
