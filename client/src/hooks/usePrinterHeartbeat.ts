/**
 * usePrinterHeartbeat Hook
 * Prüft alle 30 Sekunden ob alle Drucker erreichbar sind.
 * Zeigt Toast-Warnung wenn ein Drucker nicht antwortet.
 * Wird im Admin-Panel und im Kellner-Panel eingesetzt.
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';
import { useOfflineStatus } from './useOfflineStatus';

const HEARTBEAT_INTERVAL = 30_000; // 30 Sekunden

interface PrinterHeartbeatOptions {
  enabled?: boolean;
  onPrinterOffline?: (printerName: string) => void;
  onPrinterOnline?: (printerName: string) => void;
}

export function usePrinterHeartbeat(options: PrinterHeartbeatOptions = {}) {
  const { enabled = true, onPrinterOffline, onPrinterOnline } = options;
  const { isOffline } = useOfflineStatus();
  const utils = trpc.useUtils();
  const lastStatusRef = useRef<Record<number, boolean | null>>({});
  const toastIdRef = useRef<string | number | null>(null);

  const checkPrinters = useCallback(async () => {
    // Nicht prüfen wenn wir selbst offline sind
    if (isOffline || !enabled) return;

    try {
      const results = await utils.client.printer.checkAllStatus.mutate();

      let hasOfflinePrinter = false;
      const offlineNames: string[] = [];

      for (const printer of results) {
        const wasOnline = lastStatusRef.current[printer.id];
        const isNowOnline = printer.online;

        // Status-Änderung: offline → online
        if (wasOnline === false && isNowOnline === true) {
          onPrinterOnline?.(printer.name);
          toast.success(`Drucker "${printer.name}" wieder erreichbar`, {
            description: printer.message,
            duration: 4000,
          });
        }

        // Status-Änderung: online → offline (oder erstmalig offline)
        if (wasOnline !== false && isNowOnline === false) {
          onPrinterOffline?.(printer.name);
          offlineNames.push(printer.name);
        }

        if (isNowOnline === false) {
          hasOfflinePrinter = true;
        }

        lastStatusRef.current[printer.id] = isNowOnline;
      }

      // Toast für offline Drucker
      if (offlineNames.length > 0) {
        if (toastIdRef.current) {
          toast.dismiss(toastIdRef.current);
        }
        toastIdRef.current = toast.error(
          `Drucker nicht erreichbar: ${offlineNames.join(', ')}`,
          {
            description: 'Bons werden lokal gespeichert und automatisch gedruckt wenn Drucker wieder online ist.',
            duration: Infinity, // Bleibt bis manuell geschlossen
            id: 'printer-offline',
          }
        );
      } else if (!hasOfflinePrinter && toastIdRef.current) {
        toast.dismiss('printer-offline');
        toastIdRef.current = null;
      }
    } catch (error) {
      // Fehler beim Prüfen: ignorieren (Netzwerkfehler etc.)
      console.warn('[PrinterHeartbeat] Fehler beim Status-Check:', error);
    }
  }, [isOffline, enabled, utils, onPrinterOffline, onPrinterOnline]);

  useEffect(() => {
    if (!enabled) return;

    // Sofort beim Mount prüfen
    checkPrinters();

    // Dann alle 30 Sekunden
    const interval = setInterval(checkPrinters, HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [enabled, checkPrinters]);

  return { checkPrinters };
}
