import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001') + '/ws';

export const socketService = {
  connect(token: string): Socket {
    if (_socket?.connected) return _socket;
    _socket?.disconnect();

    _socket = io(WS_URL, {
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 10,
    });

    return _socket;
  },

  disconnect(): void {
    _socket?.disconnect();
    _socket = null;
  },

  get socket(): Socket | null { return _socket; },
};
