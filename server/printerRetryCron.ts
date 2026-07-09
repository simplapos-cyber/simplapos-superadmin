/**
 * Drucker-Retry Cron Job
 * Wird alle 5 Minuten ausgeführt und versucht fehlgeschlagene Druckjobs erneut.
 * Max. 5 Versuche pro Job, danach Owner-Notification.
 */

import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { printJobs, printers } from "../drizzle/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import type { Request, Response } from "express";
import net from "net";

const MAX_RETRIES = 5;

async function sendToNetworkPrinter(ip: string, port: number, data: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!socket.destroyed) socket.destroy();
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Timeout nach ${timeoutMs}ms`));
      }
    }, timeoutMs);

    socket.connect(port, ip, () => {
      if (data.length > 0) {
        socket.write(data, (err) => {
          if (err) {
            if (!resolved) { resolved = true; clearTimeout(timer); cleanup(); reject(err); }
          } else {
            if (!resolved) { resolved = true; clearTimeout(timer); cleanup(); resolve(); }
          }
        });
      } else {
        if (!resolved) { resolved = true; clearTimeout(timer); cleanup(); resolve(); }
      }
    });

    socket.on("error", (err) => {
      if (!resolved) { resolved = true; clearTimeout(timer); cleanup(); reject(err); }
    });
  });
}

export async function handlePrinterRetry(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as { isCron?: boolean; taskUid?: string };
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB nicht verfügbar" });
    }

    // Fehlgeschlagene Jobs die noch Versuche haben
    const failedJobs = await db
      .select({
        job: printJobs,
        printer: printers,
      })
      .from(printJobs)
      .innerJoin(printers, eq(printJobs.printerId, printers.id))
      .where(
        and(
          eq(printJobs.status, "failed"),
          lt(printJobs.retryCount, MAX_RETRIES)
        )
      )
      .limit(50);

    let retried = 0;
    let succeeded = 0;
    let failed = 0;
    const permanentlyFailed: string[] = [];

    for (const { job, printer } of failedJobs) {
      if (printer.connectionType !== "network" || !printer.ipAddress) continue;
      if (!job.payload) continue;

      try {
        const data = Buffer.from(job.payload, "base64");
        await sendToNetworkPrinter(printer.ipAddress, printer.port ?? 9100, data, 5000);

        // Erfolg
        await db
          .update(printJobs)
          .set({ status: "printed", printedAt: new Date() })
          .where(eq(printJobs.id, job.id));

        succeeded++;
        retried++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const newRetryCount = job.retryCount + 1;

        await db
          .update(printJobs)
          .set({
            retryCount: newRetryCount,
            errorMessage: msg,
            status: newRetryCount >= MAX_RETRIES ? "failed" : "failed",
          })
          .where(eq(printJobs.id, job.id));

        if (newRetryCount >= MAX_RETRIES) {
          permanentlyFailed.push(`Job #${job.id} (${printer.name}): ${msg}`);
        }

        failed++;
        retried++;
      }
    }

    // Owner-Notification bei permanent fehlgeschlagenen Jobs
    if (permanentlyFailed.length > 0) {
      await notifyOwner({
        title: `🖨️ Drucker-Fehler: ${permanentlyFailed.length} Bon(s) konnten nicht gedruckt werden`,
        content: [
          `**${permanentlyFailed.length} Druckjob(s) haben max. Versuche erreicht:**`,
          permanentlyFailed.join('\n'),
          `\nBitte Drucker-Verbindung prüfen und Jobs manuell nachdrucken.`,
          `Zeit: ${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}`,
        ].join('\n'),
      }).catch(() => {});
    }

    return res.json({
      retried,
      succeeded,
      failed,
      permanentlyFailed: permanentlyFailed.length,
    });
  } catch (err) {
    console.error("[PrinterRetryCron] Fehler:", err);
    return res.status(500).json({ error: String(err) });
  }
}
