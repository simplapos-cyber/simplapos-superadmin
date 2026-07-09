/**
 * useOfflineStatus Hook – iOS/Safari-kompatibel
 *
 * navigator.onLine ist auf iOS Safari UNZUVERLÄSSIG (meldet oft true auch ohne Internet).
 * Stattdessen: echter HTTP-Ping an /api/network/ping alle 5 Sekunden.
 * Nur wenn der Ping fehlschlägt, gilt die App als offline.
 *
 * Zusätzlich werden die nativen online/offline Events als schnelle Trigger genutzt,
 * aber der Ping ist die einzige verlässliche Quelle der Wahrheit.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const PING_URL = '/api/network/ping';
const PING_INTERVAL_MS = 5000;       // alle 5 Sekunden prüfen
const PING_TIMEOUT_MS = 3000;        // 3 Sekunden Timeout pro Ping
const OFFLINE_THRESHOLD = 2;         // 2 aufeinanderfolgende Fehlschläge → offline

export interface OfflineStatus {
  isOffline: boolean;
  isOnline: boolean;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
}

// Singleton-State damit alle Hook-Instanzen denselben Status teilen
let _isOffline = false;
let _lastOnlineAt: Date | null = new Date();
let _lastOfflineAt: Date | null = null;
let _listeners: Array<() => void> = [];
let _pingTimer: ReturnType<typeof setInterval> | null = null;
let _failCount = 0;
let _pingRunning = false;

function notifyListeners() {
  _listeners.forEach(fn => fn());
}

async function doPing(): Promise<boolean> {
  if (_pingRunning) return !_isOffline;
  _pingRunning = true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${PING_URL}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const ok = res.ok;
    if (ok) {
      _failCount = 0;
      if (_isOffline) {
        _isOffline = false;
        _lastOnlineAt = new Date();
        notifyListeners();
      }
    } else {
      _failCount++;
    }
    return ok;
  } catch {
    _failCount++;
    return false;
  } finally {
    _pingRunning = false;
    // Erst nach OFFLINE_THRESHOLD aufeinanderfolgenden Fehlern als offline markieren
    if (_failCount >= OFFLINE_THRESHOLD && !_isOffline) {
      _isOffline = true;
      _lastOfflineAt = new Date();
      notifyListeners();
    }
  }
}

function startPingLoop() {
  if (_pingTimer !== null) return;
  // Sofort einmal pingen
  doPing();
  _pingTimer = setInterval(() => {
    doPing();
  }, PING_INTERVAL_MS);
}

function stopPingLoop() {
  if (_pingTimer !== null) {
    clearInterval(_pingTimer);
    _pingTimer = null;
  }
}

// Native Events als schnelle Trigger (kein Ersatz für Ping, aber sofortige Reaktion)
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Sofort pingen wenn Browser "online" meldet
    _failCount = 0;
    doPing();
  });
  window.addEventListener('offline', () => {
    // Sofort als offline markieren wenn Browser "offline" meldet
    _failCount = OFFLINE_THRESHOLD;
    if (!_isOffline) {
      _isOffline = true;
      _lastOfflineAt = new Date();
      notifyListeners();
    }
  });
}

export function useOfflineStatus(): OfflineStatus {
  const [, forceUpdate] = useState(0);
  const mountedRef = useRef(false);

  const listener = useCallback(() => {
    if (mountedRef.current) {
      forceUpdate(n => n + 1);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    _listeners.push(listener);
    startPingLoop();

    return () => {
      mountedRef.current = false;
      _listeners = _listeners.filter(fn => fn !== listener);
      // Ping-Loop nur stoppen wenn keine Listener mehr aktiv
      if (_listeners.length === 0) {
        stopPingLoop();
      }
    };
  }, [listener]);

  return {
    isOffline: _isOffline,
    isOnline: !_isOffline,
    lastOnlineAt: _lastOnlineAt,
    lastOfflineAt: _lastOfflineAt,
  };
}
