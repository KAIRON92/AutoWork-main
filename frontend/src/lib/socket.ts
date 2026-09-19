import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';

let socketInstance: Socket | null = null;

export const getSocket = (): Socket | null => {
  if (typeof window === 'undefined') return null;
  if (!socketInstance) {
    const targetUrl = SOCKET_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);
    socketInstance = io(targetUrl, {
      auth: (cb) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('autowork_jwt_token') : null;
        cb({ token });
      },
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: false,
    });
  }
  return socketInstance;
};

