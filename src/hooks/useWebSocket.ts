import { useEffect, useRef, useState } from 'react';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
}

export function useWebSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);

          // Notify listeners
          const typeListeners = listeners.current.get(message.type);
          if (typeListeners) {
            typeListeners.forEach(callback => callback(message.data));
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    };

    connect();

    return () => {
      ws.current?.close();
    };
  }, [url]);

  const subscribe = (type: string, callback: (data: any) => void) => {
    if (!listeners.current.has(type)) {
      listeners.current.set(type, new Set());
    }
    listeners.current.get(type)!.add(callback);

    return () => {
      const typeListeners = listeners.current.get(type);
      if (typeListeners) {
        typeListeners.delete(callback);
      }
    };
  };

  return { isConnected, lastMessage, subscribe };
}
