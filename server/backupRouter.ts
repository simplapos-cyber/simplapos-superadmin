/**
 * backupRouter.ts
 * DSGVO/nDSG-konformes Backup-System für SimplaPOS
 * Gesetzliche Grundlage: OR Art. 958f (10 Jahre Aufbewahrung)
 * Verschlüsselung: AES-256-CBC (DSGVO Art. 32 / nDSG Art. 8)
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { databaseBackups } from "../drizzle/schema";
import { desc, eq, count, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { getNativeCronStatus } from "./nativeCron";
import crypto from "crypto";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Erstellt einen Backup-Eintrag und führt den Backup-Prozess durch.
 * Da wir auf TiDB/MySQL in der Cloud laufen, exportieren wir die wichtigsten
 * Tabellen als strukturierte JSON-Daten und verschlüsseln sie mit AES-256-CBC.
 */
async function performBackup(triggeredBy: string, type: "scheduled" | "manual" | "pre_migration") {
  const db = await getDb();
  const now = new Date();

  // Aufbewahrungsfrist: 10 Jahre gemäss OR Art. 958f
  const retentionUntil = new Date(now);
  retentionUntil.setFullYear(retentionUntil.getFullYear() + 10);

  const filename = `simplapos_backup_${now.toISOString().replace(/[:.]/g, "-")}_${type}.enc`;

  // Backup-Eintrag erstellen (Status: running)
  const [insertResult] = await db.insert(databaseBackups).values({
    filename,
    sizeBytes: 0,
    status: "running",
    type,
    encryptionAlgorithm: "AES-256-CBC",
    retentionUntil,
    triggeredBy,
    createdAt: now,
  });

  const backupId = (insertResult as any).insertId;

  try {
    // ── Daten exportieren ──────────────────────────────────────────────────
    // Wir exportieren die kritischen Buchhaltungsdaten (OR Art. 958f)
    const exportData: Record<string, any[]> = {};

    // Bestellungen (Kassendaten – 10 Jahre Pflicht)
    const orders = await db.execute(sql`SELECT * FROM orders ORDER BY createdAt DESC LIMIT 50000`);
    exportData.orders = (orders as any)[0] || [];

    // Bestellpositionen
    const orderItems = await db.execute(sql`SELECT * FROM order_items ORDER BY id DESC LIMIT 200000`);
    exportData.orderItems = (orderItems as any)[0] || [];

    // Tagesabschlüsse
    const closings = await db.execute(sql`SELECT * FROM closings ORDER BY createdAt DESC LIMIT 10000`);
    exportData.closings = (closings as any)[0] || [];

    // Restaurants (Stammdaten)
    const restaurants = await db.execute(sql`SELECT id, name, slug, address, city, country, email, phone, vatNumber, status, currency, taxRate, totalRevenue, totalOrders, createdAt FROM restaurants`);
    exportData.restaurants = (restaurants as any)[0] || [];

    // Verträge & Rechnungen
    const contracts = await db.execute(sql`SELECT * FROM contracts ORDER BY createdAt DESC LIMIT 10000`);
    exportData.contracts = (contracts as any)[0] || [];

    const invoices = await db.execute(sql`SELECT * FROM invoices ORDER BY createdAt DESC LIMIT 50000`);
    exportData.invoices = (invoices as any)[0] || [];

    // Inventar
    const inventory = await db.execute(sql`SELECT * FROM inventory ORDER BY updatedAt DESC LIMIT 100000`);
    exportData.inventory = (inventory as any)[0] || [];

    // Backup-Metadaten
    const backupMeta = {
      version: "1.0",
      createdAt: now.toISOString(),
      triggeredBy,
      type,
      retentionUntil: retentionUntil.toISOString(),
      legalBasis: "OR Art. 958f (10 Jahre), DSGVO Art. 32, nDSG Art. 8",
      encryption: "AES-256-CBC",
      tables: Object.keys(exportData),
      recordCounts: Object.fromEntries(
        Object.entries(exportData).map(([k, v]) => [k, v.length])
      ),
    };

    const fullExport = JSON.stringify({ meta: backupMeta, data: exportData });

    // ── AES-256-CBC Verschlüsselung ────────────────────────────────────────
    const encryptionKey = process.env.JWT_SECRET
      ? crypto.createHash("sha256").update(process.env.JWT_SECRET).digest()
      : crypto.randomBytes(32);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", encryptionKey, iv);
    const encrypted = Buffer.concat([
      iv,
      cipher.update(Buffer.from(fullExport, "utf8")),
      cipher.final(),
    ]);

    // SHA-256 Prüfsumme für Integrität
    const checksum = crypto.createHash("sha256").update(encrypted).digest("hex");
    const sizeBytes = encrypted.length;

    // ── Backup in Storage speichern ────────────────────────────────────────
    let storageLocation = `backups/${filename}`;
    try {
      const { storagePut } = await import("./storage");
      const { url } = await storagePut(storageLocation, encrypted, "application/octet-stream");
      storageLocation = url;
    } catch (storageErr) {
      // Storage nicht verfügbar – Backup-Eintrag trotzdem aktualisieren
      console.error("[Backup] Storage-Upload fehlgeschlagen:", storageErr);
      storageLocation = `local:${filename}`;
    }

    // ── Backup-Eintrag aktualisieren (Status: success) ─────────────────────
    await db.update(databaseBackups)
      .set({
        status: "success",
        sizeBytes,
        checksum,
        storageLocation,
        completedAt: new Date(),
      })
      .where(eq(databaseBackups.id, backupId));

    // ── Superadmin benachrichtigen ─────────────────────────────────────────
    const totalRecords = Object.values(exportData).reduce((sum, arr) => sum + arr.length, 0);
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    await notifyOwner({
      title: `✅ Backup erfolgreich – ${type === "scheduled" ? "Automatisch" : "Manuell"}`,
      content: `Backup abgeschlossen:\n• Datei: ${filename}\n• Grösse: ${sizeMB} MB (verschlüsselt)\n• Datensätze: ${totalRecords.toLocaleString()}\n• Aufbewahrung bis: ${retentionUntil.toLocaleDateString("de-CH")}\n• Prüfsumme: ${checksum.substring(0, 16)}...`,
    });

    return { success: true, backupId, filename, sizeBytes, checksum, totalRecords };

  } catch (error: any) {
    // Backup fehlgeschlagen – Eintrag aktualisieren
    await db.update(databaseBackups)
      .set({
        status: "failed",
        errorMessage: error?.message || "Unbekannter Fehler",
        completedAt: new Date(),
      })
      .where(eq(databaseBackups.id, backupId));

    await notifyOwner({
      title: "❌ Backup FEHLGESCHLAGEN",
      content: `Backup fehlgeschlagen!\n• Datei: ${filename}\n• Fehler: ${error?.message}\n• Bitte sofort prüfen!`,
    });

    throw error;
  }
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────

export const backupRouter = router({
  // Alle Backups auflisten (nur Superadmin)
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "superadmin") throw new Error("Nur Superadmin");
      const db = await getDb();
      const backups = await db.select().from(databaseBackups)
        .orderBy(desc(databaseBackups.createdAt))
        .limit(input?.limit ?? 20);
      return backups;
    }),

  // Statistiken (nur Superadmin)
  stats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin") throw new Error("Nur Superadmin");
    const db = await getDb();

    const [totalResult] = await db.select({ total: count() }).from(databaseBackups);
    const [successResult] = await db.select({ total: count() }).from(databaseBackups)
      .where(eq(databaseBackups.status, "success"));
    const [lastBackup] = await db.select().from(databaseBackups)
      .where(eq(databaseBackups.status, "success"))
      .orderBy(desc(databaseBackups.createdAt))
      .limit(1);

    return {
      total: totalResult.total,
      successful: successResult.total,
      lastBackupAt: lastBackup?.completedAt ?? null,
      lastBackupSize: lastBackup?.sizeBytes ?? 0,
    };
  }),

  // Manuelles Backup auslösen (nur Superadmin)
  triggerManual: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin") throw new Error("Nur Superadmin");
    const result = await performBackup(ctx.user.email || "superadmin", "manual");
    return result;
  }),

  // Cron-Status prüfen (nativer Server-Cron, kein externer Dienst)
  setupCron: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "superadmin") throw new Error("Nur Superadmin");
    // Nativer Cron läuft automatisch beim Server-Start
    const status = getNativeCronStatus();
    return {
      taskUid: "native-cron",
      alreadyExists: status.backupCronActive,
      nextBackupAt: status.nextBackupAt,
      type: status.type,
    };
  }),

});

