/**
 * useDeviceHeartbeat
 *
 * Sendet alle 30 Sekunden einen Heartbeat an den Server, solange die App offen ist.
 * Meldet auch die aktuelle Seite und Browser-Informationen.
 *
 * Verwendung: In App.tsx oder DashboardLayout.tsx einbinden:
 *   useDeviceHeartbeat();
 */

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 Sekunden

// Stabile Session-Token für diesen Browser-Tab (bleibt für die gesamte Session)
function getOrCreateSessionToken(): string {
  const key = "synclapos_session_token";
  let token = sessionStorage.getItem(key);
  if (!token) {
    // Zufälliger 32-Zeichen-Token
    token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    sessionStorage.setItem(key, token);
  }
  return token;
}

// App-Version aus Vite-Build oder "dev"
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

export function useDeviceHeartbeat() {
  const { user } = useAuth();
  const [location] = useLocation();
  const heartbeatMutation = trpc.device.heartbeat.useMutation();
  const sessionToken = useRef(getOrCreateSessionToken());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Nur senden wenn eingeloggt
    if (!user) return;

    const sendHeartbeat = () => {
      heartbeatMutation.mutate({
        sessionToken: sessionToken.current,
        currentPage: location,
        userAgent: navigator.userAgent,
        appVersion: APP_VERSION,
      });
    };

    // Sofort beim Mounten senden
    sendHeartbeat();

    // Danach alle 30 Sekunden
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, location]); // Neu starten wenn User oder Seite wechselt
}

// Hilfsfunktion: Letzte Aktion melden (z.B. nach Bestellung senden)
export function useReportAction() {
  const reportMutation = trpc.device.reportAction.useMutation();
  const sessionToken = useRef(getOrCreateSessionToken());

  return (action: string, orderId?: number, tableId?: number) => {
    reportMutation.mutate({
      sessionToken: sessionToken.current,
      action,
      orderId,
      tableId,
    });
  };
}
