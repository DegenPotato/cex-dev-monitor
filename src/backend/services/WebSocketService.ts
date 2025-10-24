import { Server } from 'socket.io';

// Simple WebSocket service wrapper for campaign events
class WebSocketService {
    private io: Server | null = null;

    setServer(io: Server) {
        this.io = io;
    }

    broadcast(event: string, data: any) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }

    emitTo(socketId: string, event: string, data: any) {
        if (this.io) {
            this.io.to(socketId).emit(event, data);
        }
    }
}

// Singleton instance
const webSocketService = new WebSocketService();

export function getWebSocketServer(): WebSocketService {
    return webSocketService;
}

export function setWebSocketServer(io: Server): void {
    webSocketService.setServer(io);
}

export default webSocketService;
