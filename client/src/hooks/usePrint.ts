/**
 * usePrint.ts
 *
 * Der einzige Druck-Hook für alle Screens in SimplaPOS.
 *
 * ─── VERWENDUNG ──────────────────────────────────────────────────────────────
 *
 *   const { printReceipt, printKitchen, hasPrinter } = usePrint();
 *
 *   // Gastbon drucken (gibt boolean zurück – kein try/catch nötig)
 *   const ok = await printReceipt({ orderId, paymentMethod, ... });
 *
 *   // Küchenbon drucken
 *   const ok = await printKitchen({ orderId });
 *
 * ─── ARCHITEKTUR ─────────────────────────────────────────────────────────────
 *
 * Druckpfad:
 *   1. Server generiert ePOS-XML und speichert es als Job in der Queue
 *   2. SimplaPOS Local Connect App pollt die Queue (alle 2s)
 *   3. App druckt das XML direkt an den Drucker im Restaurant-WLAN
 *
 * Der Browser sendet KEINE Druckdaten mehr direkt an den Drucker.
 * Das ist die einzige zuverlässige Methode für Cloud-Betrieb.
 *
 * ─── FEHLERBEHANDLUNG ────────────────────────────────────────────────────────
 *
 * - printReceipt / printKitchen geben boolean zurück (true = Job erfolgreich in Queue)
 * - Fehler werden intern geloggt und als Toast angezeigt
 * - Kein Fehler wird nach oben geworfen (Screens müssen nicht try/catch)
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Input-Typen ─────────────────────────────────────────────────────────────

export interface PrintReceiptInput {
  orderId: number;
  paymentMethod?: string;
  amountPaid?: number;
  tip?: number;
  discount?: number;
}

export interface PrintKitchenInput {
  orderId: number;
  itemIds?: number[];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePrint() {
  const { data: clientPrinters } = trpc.printer.getClientPrinters.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  const receiptMutation = trpc.printer.createReceiptPrintJob.useMutation();
  const kitchenMutation = trpc.printer.createKitchenPrintJob.useMutation();

  /**
   * Gastbon drucken.
   * Server generiert ePOS-XML → Job in Queue → Local Connect App druckt.
   * @returns true wenn Job erfolgreich in Queue eingestellt wurde
   */
  const printReceipt = useCallback(
    async (input: PrintReceiptInput): Promise<boolean> => {
      try {
        await receiptMutation.mutateAsync({
          orderId: input.orderId,
          paymentMethod: input.paymentMethod ?? "Bar",
          amountPaid: input.amountPaid,
          tip: input.tip,
          discount: input.discount,
        });
        // Job wurde in Queue eingestellt – Local Connect App druckt in ~2s
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[usePrint] Gastbon-Fehler:", msg);
        // Benutzerfreundliche Fehlermeldung
        if (msg.includes("Local Connect")) {
          toast.error("Drucken nicht möglich: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.");
        } else {
          toast.error(`Druckfehler: ${msg}`);
        }
        return false;
      }
    },
    [receiptMutation]
  );

  /**
   * Küchenbon drucken.
   * Server generiert ePOS-XML für Küche und/oder Bar → Jobs in Queue → App druckt.
   * @returns true wenn mindestens ein Job in Queue eingestellt wurde
   */
  const printKitchen = useCallback(
    async (input: PrintKitchenInput): Promise<boolean> => {
      try {
        const result = await kitchenMutation.mutateAsync({
          orderId: input.orderId,
          itemIds: input.itemIds,
        });

        if (result.printed === 0) {
          // Kein Drucker konfiguriert oder keine Artikel – kein Fehler
          return true;
        }

        if ("error" in result && result.error) {
          // Kein Gerät online – Warnung anzeigen aber kein harter Fehler
          console.warn("[usePrint] Küchenbon-Warnung:", result.error);
          toast.warning("Küchenbon: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.");
          return false;
        }

        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[usePrint] Küchenbon-Fehler:", msg);
        if (msg.includes("Local Connect")) {
          toast.error("Drucken nicht möglich: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.");
        } else {
          toast.error(`Küchenbon-Fehler: ${msg}`);
        }
        return false;
      }
    },
    [kitchenMutation]
  );

  /**
   * Testdruck über Local Connect Queue.
   * Benötigt printerId (nicht IP) – Server sucht das Gerät selbst.
   */
  const testPrintMutation = trpc.printer.createTestPrintJob.useMutation();
  const printTest = useCallback(async (printerId: number): Promise<void> => {
    await testPrintMutation.mutateAsync({ printerId });
  }, [testPrintMutation]);

  const hasPrinter = !!(
    clientPrinters?.receipt ||
    clientPrinters?.kitchen ||
    clientPrinters?.bar
  );

  return {
    printReceipt,
    printKitchen,
    printTest,
    hasPrinter,
    clientPrinters,
    isPrinting: receiptMutation.isPending || kitchenMutation.isPending,
  };
}
