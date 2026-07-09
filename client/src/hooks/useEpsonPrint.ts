/**
 * useEpsonPrint.ts
 *
 * React-Hook für Browser-Direktdruck an Epson-Bondrucker.
 * Verwendet das offizielle Epson ePOS SDK (epos-2.27.0.js) – gleich wie qrorpa.ch.
 *
 * Methode: window.epson.ePOSPrint + ePOSBuilder via http://{IP}/cgi-bin/epos/service.cgi
 */

import { trpc } from "@/lib/trpc";
import {
  printToEpson,
  printKitchenToEpson,
  testPrinterConnection,
  type ReceiptData,
  type KitchenData,
} from "@/lib/epsonPrinter";
import { toast } from "sonner";

export function useEpsonPrint() {
  const { data: clientPrinters } = trpc.printer.getClientPrinters.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  const printReceipt = async (data: ReceiptData): Promise<boolean> => {
    const printer = clientPrinters?.receipt;
    if (!printer) return false;
    try {
      for (let i = 0; i < (printer.printCopies ?? 1); i++) {
        await printToEpson(
          { ip: printer.ip },
          data,
          printer.openCashDrawer ?? false
        );
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Drucker] Gastbon fehlgeschlagen:", msg);
      return false;
    }
  };

  const printKitchen = async (data: KitchenData): Promise<boolean> => {
    const hasFood = data.items.some(i => !i.variant?.toLowerCase().includes("drink"));
    const printer = hasFood
      ? (clientPrinters?.kitchen ?? clientPrinters?.bar)
      : (clientPrinters?.bar ?? clientPrinters?.kitchen);

    if (!printer) return false;

    try {
      for (let i = 0; i < (printer.printCopies ?? 1); i++) {
        await printKitchenToEpson({ ip: printer.ip }, data);
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Drucker] Küchenbon fehlgeschlagen:", msg);
      return false;
    }
  };

  const printTest = async (ip: string): Promise<void> => {
    const ok = await testPrinterConnection(ip);
    if (!ok) throw new Error("Testdruck fehlgeschlagen");
  };

  const testConnection = async (ip: string): Promise<boolean> => {
    return testPrinterConnection(ip);
  };

  const hasPrinter = !!(clientPrinters?.receipt || clientPrinters?.kitchen || clientPrinters?.bar);

  return { printReceipt, printKitchen, printTest, testConnection, hasPrinter, clientPrinters };
}
