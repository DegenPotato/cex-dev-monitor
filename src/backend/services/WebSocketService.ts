import { WebSocket } from 'ws';

// Simple WebSocket service wrapper for campaign events
class WebSocketService {
    private clients: Set<WebSocket> = new Set();

    registerClient(ws: WebSocket) {
        this.clients.add(ws);
    }

    unregisterClient(ws: WebSocket) {
        this.clients.delete(ws);
    }

    broadcast(event: string, data: any) {
        const message = JSON.stringify({ type: event, data, timestamp: Date.now() });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    emitTo(client: WebSocket, event: string, data: any) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: event, data, timestamp: Date.now() }));
        }
    }
}

// Singleton instance
const webSocketService = new WebSocketService();

export function getWebSocketServer(): WebSocketService {
    return webSocketService;
}

export default webSocketService;
