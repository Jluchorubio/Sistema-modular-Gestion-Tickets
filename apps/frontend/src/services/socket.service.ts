import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

const _apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
// In prod (no env var) use '' so socket.io resolves to current origin (nginx proxies /socket.io/).
// In dev (http://localhost:3001) convert http→ws to avoid Mixed Content warnings.
const WS_URL = _apiBase
  ? _apiBase.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws'
  : '';

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
