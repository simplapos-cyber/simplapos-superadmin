/**
 * nativeCron.ts
 * Nativer Cron-Service für SimplaPOS auf Hetzner-Server
 * Ersetzt den Manus-Heartbeat-Dienst – läuft vollständig lokal
 *
 * Gesetzliche Grundlage:
 * - OR Art. 958f: 10 Jahre Aufbewahrungspflicht für Buchführungsdaten
 * - DSGVO Art. 32: Verschlüsselung personenbezogener Daten
 * - nDSG Art. 8: Technische und organisatorische Massnahmen
 */

import * as cron from "node-cron";
import { runDatabaseBackup } from "./backupCron";

let backupJobActive = false;
let backupJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Startet den täglichen Backup-Cron (03:00 UTC)
 * Wird beim Server-Start automatisch aufgerufen
 */
export function startNativeCrons() {
  if (backupJob) return; // Bereits gestartet

  // Täglich um 03:00 UTC
  backupJob = cron.schedule(
    "0 3 * * *",
    async () => {
      console.log("[NativeCron] Starte tägliches Backup (03:00 UTC)...");
      try {
        const result = await runDatabaseBackup("cron-scheduler", "scheduled");
        console.log(
          `[NativeCron] Backup erfolgreich: ${result.filename} (${result.sizeBytes} Bytes, ${result.totalRecords} Datensätze)`
        );
      } catch (err: any) {
        console.error("[NativeCron] Backup FEHLGESCHLAGEN:", err?.message);
      }
    },
    {
      timezone: "UTC",
    }
  );

  backupJobActive = true;
  console.log("[NativeCron] Täglicher Backup-Cron gestartet (täglich 03:00 UTC)");
}

/**
 * Status des nativen Cron-Services
 */
export function getNativeCronStatus() {
  return {
    backupCronActive: backupJobActive,
    nextBackupAt: "Täglich 03:00 UTC",
    type: "native" as const,
  };
}

/**
 * Stoppt alle nativen Crons (für graceful shutdown)
 */
export function stopNativeCrons() {
  if (backupJob) {
    backupJob.stop();
    backupJob = null;
    backupJobActive = false;
    console.log("[NativeCron] Alle Crons gestoppt");
  }
}
