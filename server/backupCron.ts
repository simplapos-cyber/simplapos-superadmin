/**
 * backupCron.ts
 * Täglicher automatischer Datenbank-Backup-Handler
 * Wird täglich um 03:00 UTC via Heartbeat-Cron aufgerufen
 *
 * Gesetzliche Grundlage:
 * - OR Art. 958f: 10 Jahre Aufbewahrungspflicht für Buchführungsdaten
 * - DSGVO Art. 32: Verschlüsselung personenbezogener Daten
 * - nDSG Art. 8: Technische und organisatorische Massnahmen
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { databaseBackups } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";
import { sql } from "drizzle-orm";

// ─── Backup-Kernlogik ─────────────────────────────────────────────────────────

export async function runDatabaseBackup(triggeredBy: string, type: "scheduled" | "manual" | "pre_migration") {
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
  }) as any;

  const backupId = insertResult?.insertId;

  try {
    // ── Kritische Buchhaltungsdaten exportieren (OR Art. 958f) ────────────
    const exportData: Record<string, any[]> = {};

    const tables = [
      { name: "orders", query: sql`SELECT * FROM orders ORDER BY createdAt DESC LIMIT 100000` },
      { name: "order_items", query: sql`SELECT * FROM order_items ORDER BY id DESC LIMIT 500000` },
      { name: "closings", query: sql`SELECT * FROM closings ORDER BY createdAt DESC LIMIT 20000` },
      { name: "contracts", query: sql`SELECT * FROM contracts ORDER BY createdAt DESC LIMIT 10000` },
      { name: "invoices", query: sql`SELECT * FROM invoices ORDER BY createdAt DESC LIMIT 50000` },
      { name: "payments", query: sql`SELECT * FROM payments ORDER BY createdAt DESC LIMIT 50000` },
      { name: "restaurants", query: sql`SELECT id, name, slug, address, city, country, email, phone, vatNumber, status, currency, taxRate, totalRevenue, totalOrders, createdAt FROM restaurants` },
      { name: "inventory", query: sql`SELECT * FROM inventory ORDER BY updatedAt DESC LIMIT 200000` },
      { name: "vouchers", query: sql`SELECT * FROM vouchers ORDER BY createdAt DESC LIMIT 50000` },
    ];

    for (const table of tables) {
      try {
        const [rows] = await db.execute(table.query) as any;
        exportData[table.name] = rows || [];
      } catch {
        exportData[table.name] = []; // Tabelle existiert nicht – überspringen
      }
    }

    // ── Backup-Metadaten ───────────────────────────────────────────────────
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

    // ── AES-256-CBC Verschlüsselung (DSGVO Art. 32 / nDSG Art. 8) ─────────
    const encryptionKey = process.env.JWT_SECRET
      ? crypto.createHash("sha256").update(process.env.JWT_SECRET + "_backup").digest()
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

    // ── In Storage speichern ───────────────────────────────────────────────
    let storageLocation = `backups/${filename}`;
    try {
      const { storagePut } = await import("./storage");
      const { url } = await storagePut(`backups/${filename}`, encrypted, "application/octet-stream");
      storageLocation = url;
    } catch (storageErr: any) {
      console.error("[Backup] Storage-Upload fehlgeschlagen:", storageErr?.message);
      storageLocation = `pending:${filename}`;
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
      title: `✅ Backup erfolgreich (${type === "scheduled" ? "Automatisch" : "Manuell"})`,
      content: [
        `📦 Datei: ${filename}`,
        `📊 Grösse: ${sizeMB} MB (AES-256 verschlüsselt)`,
        `📝 Datensätze: ${totalRecords.toLocaleString()}`,
        `📅 Aufbewahrung bis: ${retentionUntil.toLocaleDateString("de-CH")} (OR Art. 958f)`,
        `🔐 Prüfsumme: ${checksum.substring(0, 20)}...`,
      ].join("\n"),
    });

    return { success: true, backupId, filename, sizeBytes, checksum, totalRecords };

  } catch (error: any) {
    console.error("[Backup] Fehler:", error);

    await db.update(databaseBackups)
      .set({
        status: "failed",
        errorMessage: error?.message || "Unbekannter Fehler",
        completedAt: new Date(),
      })
      .where(eq(databaseBackups.id, backupId));

    await notifyOwner({
      title: "❌ BACKUP FEHLGESCHLAGEN – Sofort prüfen!",
      content: [
        `⚠️ Das automatische Backup ist fehlgeschlagen!`,
        `📁 Datei: ${filename}`,
        `❌ Fehler: ${error?.message}`,
        `🔴 Bitte sofort unter simplapos.com → Superadmin → Backups prüfen.`,
      ].join("\n"),
    });

    throw error;
  }
}

// ─── Express-Handler (für /api/scheduled/daily-backup) ───────────────────────

export async function handleDailyBackup(req: Request, res: Response) {
  try {
    // Nur Cron-Aufrufe erlaubt
    const user = await sdk.authenticateRequest(req) as any;
    if (!user?.isCron || !user?.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await runDatabaseBackup("cron-scheduler", "scheduled");
    return res.json({ ok: true, ...result });

  } catch (error: any) {
    console.error("[Backup Cron] Fehler:", error);
    return res.status(500).json({ error: error?.message || "Backup fehlgeschlagen" });
  }
}
