declare module 'socket.io' {
  interface SocketData {
    userId: string;
    role: 'CUSTOMER' | 'ADMIN';
  }
}

export {};
