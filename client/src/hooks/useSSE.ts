/**
 * useSSE – Custom Hook für Server-Sent Events
 *
 * Verbindet sich auf /api/sse/:restaurantId?channels=...
 * und ruft den onEvent-Callback bei jedem eingehenden Event auf.
 *
 * Features:
 * - Automatisches Reconnect mit exponentiellem Backoff (max. 30s)
 * - Cleanup bei Unmount
 * - Heartbeat-Erkennung (kein Callback-Aufruf)
 * - Multi-Channel-Support
 * - Verbindungsstatus: "connected" | "reconnecting" | "disconnected"
 */
import { useEffect, useRef, useCallback, useState } from "react";

export type SSEChannel = "kitchen" | "bar" | "floor" | "order" | "waiter" | "all";

export type SSEConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface SSEEvent {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

interface UseSSEOptions {
  /** Channels die abonniert werden sollen (default: ["all"]) */
  channels?: SSEChannel[];
  /** Wird aufgerufen wenn ein (Nicht-Heartbeat) Event eintrifft */
  onEvent?: (event: SSEEvent) => void;
  /** Wird aufgerufen wenn die Verbindung hergestellt wurde */
  onConnected?: () => void;
  /** Wird aufgerufen wenn die Verbindung getrennt wurde */
  onDisconnected?: () => void;
  /** Maximale Wartezeit zwischen Reconnect-Versuchen in ms (default: 30000) */
  maxRetryMs?: number;
  /** Ob SSE aktiv ist (default: true) */
  enabled?: boolean;
}

interface UseSSEReturn {
  /** Aktueller Verbindungsstatus */
  status: SSEConnectionStatus;
  /** Anzahl der bisherigen Reconnect-Versuche */
  retryCount: number;
}

export function useSSE(
  restaurantId: number | null | undefined,
  options: UseSSEOptions = {}
): UseSSEReturn {
  const {
    channels = ["all"],
    onEvent,
    onConnected,
    onDisconnected,
    maxRetryMs = 30_000,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<SSEConnectionStatus>(
    enabled && restaurantId ? "reconnecting" : "disconnected"
  );
  const [retryCount, setRetryCount] = useState(0);

  const esRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Stabile Callback-Referenzen
  const onEventRef = useRef(onEvent);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onDisconnectedRef.current = onDisconnected; }, [onDisconnected]);

  const connect = useCallback(() => {
    if (!mountedRef.current || !restaurantId || !enabled) return;

    // Bestehende Verbindung schließen
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setStatus("reconnecting");

    const channelParam = channels.join(",");
    const url = `/api/sse/${restaurantId}?channels=${encodeURIComponent(channelParam)}`;

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    // Verbindung hergestellt
    es.addEventListener("connected", () => {
      retryCountRef.current = 0;
      setRetryCount(0);
      setStatus("connected");
      onConnectedRef.current?.();
    });

    // Generische Event-Handler für alle bekannten Event-Typen
    const eventTypes = [
      "kitchen_update",
      "floor_update",
      "order_update",
      "bar_update",
      "order_rush",
      "order_ready",
      "heartbeat",
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        if (!mountedRef.current) return;
        if (eventType === "heartbeat") {
          // Heartbeat bestätigt aktive Verbindung
          setStatus("connected");
          return;
        }
        try {
          const parsed: SSEEvent = JSON.parse(e.data);
          onEventRef.current?.(parsed);
        } catch {
          // Ungültiges JSON ignorieren
        }
      });
    }

    // Fallback: onmessage für Events ohne expliziten Typ
    es.onmessage = (e: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const parsed: SSEEvent = JSON.parse(e.data);
        if (parsed.type === "heartbeat") {
          setStatus("connected");
          return;
        }
        onEventRef.current?.(parsed);
      } catch {
        // Ungültiges JSON ignorieren
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      esRef.current = null;
      setStatus("disconnected");
      onDisconnectedRef.current?.();

      // Exponentieller Backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
      const delay = Math.min(1_000 * Math.pow(2, retryCountRef.current), maxRetryMs);
      retryCountRef.current++;
      setRetryCount(retryCountRef.current);

      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };
  }, [restaurantId, channels.join(","), enabled, maxRetryMs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;

    if (enabled && restaurantId) {
      connect();
    } else {
      setStatus("disconnected");
    }

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect, enabled, restaurantId]);

  return { status, retryCount };
}
