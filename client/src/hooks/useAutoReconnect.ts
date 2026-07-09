/**
 * useAutoReconnect Hook
 * Überwacht die Verbindung zum Server und versucht automatisch zu reconnecten.
 * Verwendet exponentielles Backoff: 2s, 4s, 8s, 16s, 30s (max).
 *
 * Wird im Kellner-Panel und Küchen-Panel eingesetzt.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';

interface ReconnectState {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  nextRetryIn: number | null; // Sekunden bis zum nächsten Versuch
}

interface UseAutoReconnectOptions {
  checkUrl?: string;
  onReconnected?: () => void;
  onDisconnected?: () => void;
  enabled?: boolean;
}

const MIN_BACKOFF = 2000;    // 2 Sekunden
const MAX_BACKOFF = 30000;   // 30 Sekunden
const MAX_ATTEMPTS = 10;

export function useAutoReconnect(options: UseAutoReconnectOptions = {}): ReconnectState {
  const {
    checkUrl = '/api/health',
    onReconnected,
    onDisconnected,
    enabled = true,
  } = options;

  const { isOffline } = useOfflineStatus();
  const [state, setState] = useState<ReconnectState>({
    isConnected: true,
    isReconnecting: false,
    reconnectAttempts: 0,
    nextRetryIn: null,
  });

  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(checkUrl, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, [checkUrl]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !enabled) return;

    const attempt = attemptsRef.current;
    if (attempt >= MAX_ATTEMPTS) {
      console.warn('[AutoReconnect] Max. Versuche erreicht');
      return;
    }

    // Exponentielles Backoff
    const backoff = Math.min(MIN_BACKOFF * Math.pow(2, attempt), MAX_BACKOFF);
    const backoffSeconds = Math.round(backoff / 1000);

    setState(prev => ({
      ...prev,
      isReconnecting: true,
      reconnectAttempts: attempt,
      nextRetryIn: backoffSeconds,
    }));

    // Countdown
    let remaining = backoffSeconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (mountedRef.current) {
        setState(prev => ({ ...prev, nextRetryIn: remaining }));
      }
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 1000);

    timerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;

      const connected = await checkConnection();
      attemptsRef.current += 1;

      if (connected) {
        attemptsRef.current = 0;
        if (mountedRef.current) {
          setState({
            isConnected: true,
            isReconnecting: false,
            reconnectAttempts: 0,
            nextRetryIn: null,
          });
          onReconnected?.();
        }
      } else {
        scheduleReconnect();
      }
    }, backoff);
  }, [enabled, checkConnection, onReconnected]);

  const startMonitoring = useCallback(async () => {
    if (!enabled || isOffline) return;

    const connected = await checkConnection();
    if (!connected && mountedRef.current) {
      setState(prev => ({ ...prev, isConnected: false }));
      onDisconnected?.();
      scheduleReconnect();
    }
  }, [enabled, isOffline, checkConnection, onDisconnected, scheduleReconnect]);

  // Regelmässige Verbindungsprüfung (alle 30 Sekunden)
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(startMonitoring, 30_000);
    return () => clearInterval(interval);
  }, [enabled, startMonitoring]);

  // Wenn wieder online: sofort prüfen
  useEffect(() => {
    if (!isOffline && enabled) {
      clearTimers();
      attemptsRef.current = 0;
      setState(prev => ({
        ...prev,
        isReconnecting: false,
        nextRetryIn: null,
      }));
      startMonitoring();
    }
  }, [isOffline, enabled, clearTimers, startMonitoring]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  return state;
}
