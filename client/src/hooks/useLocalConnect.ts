/**
 * useLocalConnect.ts
 *
 * Hook für die Kommunikation mit dem SimplaPOS Local Connect Gerät im lokalen Netzwerk.
 *
 * Architektur:
 * - Local Connect läuft als HTTP-Server auf Port 8765 im Restaurant-WLAN
 * - Web-App sendet Druckaufträge direkt an Local Connect (kein Internet nötig)
 * - Fallback: Wenn Local Connect nicht erreichbar → normaler Cloud-Weg
 *
 * Skalierbarkeit:
 * - Jedes Restaurant hat sein eigenes Local Connect Gerät
 * - Kein Cloud-Server wird für lokale Hardware-Kommunikation belastet
 * - Funktioniert auch bei Internetausfall (solange WLAN im Restaurant vorhanden)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface LocalConnectDevice {
  deviceId: string;
  deviceName: string;
  ip: string;
  port: number;
  restaurantId: number;
  lastSeen: number;
  version?: string;
}

export interface LocalConnectStatus {
  available: boolean;
  device: LocalConnectDevice | null;
  checking: boolean;
  lastChecked: number | null;
  error: string | null;
}

export interface PrintJobPayload {
  type: "receipt" | "kitchen" | "bar" | "test" | "cash_drawer";
  printerIp?: string;
  data?: unknown;
  rawEscPos?: string; // Base64-kodierter ESC/POS-Buffer
}

export interface LocalConnectPrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
  usedLocalConnect: boolean;
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const LC_PORT = 8765;
const LC_PING_TIMEOUT_MS = 2000;
const LC_PRINT_TIMEOUT_MS = 8000;
const LC_RECHECK_INTERVAL_MS = 30_000; // alle 30 Sekunden prüfen
const LC_STORAGE_KEY = "simplapos_lc_device";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getStoredDevice(): LocalConnectDevice | null {
  try {
    const raw = localStorage.getItem(LC_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalConnectDevice;
  } catch {
    return null;
  }
}

function storeDevice(device: LocalConnectDevice | null): void {
  if (device) {
    localStorage.setItem(LC_STORAGE_KEY, JSON.stringify(device));
  } else {
    localStorage.removeItem(LC_STORAGE_KEY);
  }
}

async function pingLocalConnect(ip: string, port = LC_PORT): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LC_PING_TIMEOUT_MS);
    const res = await fetch(`http://${ip}:${port}/ping`, {
      signal: controller.signal,
      method: "GET",
      mode: "cors",
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function sendPrintJob(
  device: LocalConnectDevice,
  payload: PrintJobPayload,
  token: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LC_PRINT_TIMEOUT_MS);
    const res = await fetch(`http://${device.ip}:${device.port}/print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      mode: "cors",
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => "Unbekannter Fehler");
      return { success: false, error: err };
    }
    const json = (await res.json()) as { success: boolean; jobId?: string; error?: string };
    return json;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verbindungsfehler",
    };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocalConnect() {
  const [status, setStatus] = useState<LocalConnectStatus>({
    available: false,
    device: getStoredDevice(),
    checking: false,
    lastChecked: null,
    error: null,
  });

  const recheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auth-Token für Local Connect Kommunikation
  const { data: authData } = trpc.auth.me.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });

  // Registrierte Local Connect Geräte vom Server laden
  const restaurantId = (authData as { restaurantId?: number } | undefined)?.restaurantId;
  const { data: registeredDevices } = trpc.localConnect.listDevices.useQuery(
    { restaurantId: restaurantId ?? 0 },
    {
      enabled: !!restaurantId,
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  /**
   * Prüft ob ein Local Connect Gerät im Netzwerk erreichbar ist.
   * Reihenfolge:
   * 1. Gespeichertes Gerät aus localStorage
   * 2. Registrierte Geräte vom Server
   */
  const checkAvailability = useCallback(async () => {
    setStatus(prev => ({ ...prev, checking: true, error: null }));

    try {
      // 1. Gespeichertes Gerät prüfen (schnellster Weg)
      const stored = getStoredDevice();
      if (stored) {
        const alive = await pingLocalConnect(stored.ip, stored.port);
        if (alive) {
          setStatus({
            available: true,
            device: stored,
            checking: false,
            lastChecked: Date.now(),
            error: null,
          });
          return;
        }
      }

      // 2. Registrierte Geräte vom Server durchprobieren
      if (registeredDevices && registeredDevices.length > 0) {
        for (const dev of registeredDevices) {
          // localIp und localPort werden jetzt nativ vom Server zurückgegeben
          const localIp = dev.localIp;
          if (!localIp) continue;
          const port = dev.localPort ?? LC_PORT;
          const alive = await pingLocalConnect(localIp, port);
          if (alive) {
            const device: LocalConnectDevice = {
              deviceId: dev.deviceId,
              deviceName: dev.deviceName,
              ip: localIp,
              port,
              restaurantId: dev.restaurantId,
              lastSeen: Date.now(),
            };
            storeDevice(device);
            setStatus({
              available: true,
              device,
              checking: false,
              lastChecked: Date.now(),
              error: null,
            });
            return;
          }
        }
      }

      // Nicht gefunden
      storeDevice(null);
      setStatus({
        available: false,
        device: null,
        checking: false,
        lastChecked: Date.now(),
        error: null,
      });
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        checking: false,
        lastChecked: Date.now(),
        error: err instanceof Error ? err.message : "Fehler bei der Prüfung",
      }));
    }
  }, [registeredDevices]);

  // Beim Start und periodisch prüfen
  useEffect(() => {
    checkAvailability();

    recheckTimerRef.current = setInterval(() => {
      checkAvailability();
    }, LC_RECHECK_INTERVAL_MS);

    return () => {
      if (recheckTimerRef.current) {
        clearInterval(recheckTimerRef.current);
      }
    };
  }, [checkAvailability]);

  /**
   * Druckauftrag senden – direkt an Local Connect wenn verfügbar.
   * Fallback: false zurückgeben → Aufrufer verwendet Cloud-Weg.
   */
  const sendPrint = useCallback(
    async (payload: PrintJobPayload): Promise<LocalConnectPrintResult> => {
      if (!status.available || !status.device) {
        return { success: false, usedLocalConnect: false, error: "Local Connect nicht verfügbar" };
      }

      // Token aus Auth-Daten oder localStorage
      const token =
        (authData as { token?: string } | undefined)?.token ??
        localStorage.getItem("simplapos_lc_token") ??
        "";

      const result = await sendPrintJob(status.device, payload, token);
      return { ...result, usedLocalConnect: true };
    },
    [status.available, status.device, authData]
  );

  /**
   * Gerät manuell konfigurieren (z.B. nach IP-Eingabe durch Benutzer).
   */
  const setManualDevice = useCallback(
    async (ip: string, port = LC_PORT): Promise<boolean> => {
      const alive = await pingLocalConnect(ip, port);
      if (!alive) return false;

      const device: LocalConnectDevice = {
        deviceId: `manual-${ip}`,
        deviceName: `Local Connect (${ip})`,
        ip,
        port,
        restaurantId: 0,
        lastSeen: Date.now(),
      };
      storeDevice(device);
      setStatus({
        available: true,
        device,
        checking: false,
        lastChecked: Date.now(),
        error: null,
      });
      return true;
    },
    []
  );

  /**
   * Kassenschublade öffnen über Local Connect.
   */
  const openCashDrawer = useCallback(async (): Promise<boolean> => {
    const result = await sendPrint({ type: "cash_drawer" });
    return result.success;
  }, [sendPrint]);

  return {
    status,
    checkAvailability,
    sendPrint,
    setManualDevice,
    openCashDrawer,
    isAvailable: status.available,
    device: status.device,
    isChecking: status.checking,
  };
}
