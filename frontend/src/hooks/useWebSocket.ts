import { useRef, useState, useCallback, useEffect } from "react";

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  /** WebSocket URL */
  url: string;
  /** Called for every parsed message */
  onMessage?: (data: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
  /** Auto-reconnect on disconnect (default: true) */
  reconnect?: boolean;
  /** Delay between reconnect attempts in ms (default: 3000) */
  reconnectDelay?: number;
  /** Connect automatically on mount (default: false) */
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  send: (data: unknown) => void;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  reconnect = true,
  reconnectDelay = 3000,
  autoConnect = false,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [isConnected, setIsConnected] = useState(false);

  // Keep latest callbacks in refs to avoid reconnect loops
  const cbRef = useRef({ onMessage, onOpen, onClose, onError });
  cbRef.current = { onMessage, onOpen, onClose, onError };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    wsRef.current?.close();

    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      cbRef.current.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsMessage;
        cbRef.current.onMessage?.(data);
      } catch {
        cbRef.current.onMessage?.({ type: "raw", data: event.data });
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      cbRef.current.onClose?.();
      if (reconnect) {
        reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
      }
    };

    ws.onerror = (event) => {
      cbRef.current.onError?.(event);
    };

    wsRef.current = ws;
  }, [url, reconnect, reconnectDelay]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimerRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [autoConnect, connect]);

  return { send, isConnected, connect, disconnect };
}
