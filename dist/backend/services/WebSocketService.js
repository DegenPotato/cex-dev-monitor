// Simple WebSocket service wrapper for campaign events
class WebSocketService {
    constructor() {
        this.io = null;
    }
    setServer(io) {
        this.io = io;
    }
    broadcast(event, data) {
        if (this.io) {
            this.io.emit(event, data);
        }
    }
    emitTo(socketId, event, data) {
        if (this.io) {
            this.io.to(socketId).emit(event, data);
        }
    }
}
// Singleton instance
const webSocketService = new WebSocketService();
export function getWebSocketServer() {
    return webSocketService;
}
export function setWebSocketServer(io) {
    webSocketService.setServer(io);
}
export default webSocketService;
