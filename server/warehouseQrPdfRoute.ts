/**
 * QPM-2: QR-Code-Label-PDF für eine Lagerzone
 * GET /api/warehouse/zone-qr-pdf?zoneId=<id>
 *
 * Erzeugt ein A4-PDF mit je einem Label pro Lagerort der Zone.
 * Jedes Label enthält: Zonenname, Lagerortname, Regal/Fach, QR-Code.
 * Authentifizierung via Session-Cookie (JWT).
 */

import { type Application, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getDb } from "./db";
import { warehouseZones, warehouseLocations } from "../drizzle/schema";
import { and, eq, asc } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** QR-Code als PNG-Buffer erzeugen */
async function qrToPngBuffer(content: string): Promise<Buffer> {
  const dataUrl = await QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 200,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const base64 = dataUrl.split(",")[1];
  return Buffer.from(base64, "base64");
}

/** Zonen-Typ als lesbaren Text */
function zoneTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    kuehl: "Kühlraum",
    tiefkuehl: "Tiefkühlraum",
    trocken: "Trockenlager",
    keg: "Keg/Kiosk",
    leergut: "Leergut",
    sonstige: "Sonstige",
  };
  return labels[type] ?? type;
}

// ─── Route-Handler ────────────────────────────────────────────────────────────

async function handleZoneQrPdf(req: Request, res: Response) {
  // Auth: Session-Cookie prüfen
  let restaurantId: number;
  try {
    const user: User | null = await sdk.authenticateRequest(req as any).catch(() => null);
    if (!user) {
      res.status(401).json({ error: "Nicht authentifiziert" });
      return;
    }
    if (!user.restaurantId) {
      res.status(403).json({ error: "Kein Restaurant zugewiesen" });
      return;
    }
    restaurantId = user.restaurantId;
  } catch {
    res.status(401).json({ error: "Nicht authentifiziert" });
    return;
  }

  const zoneId = parseInt(req.query.zoneId as string);
  if (!zoneId || isNaN(zoneId)) {
    res.status(400).json({ error: "zoneId fehlt oder ungültig" });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(500).json({ error: "Datenbank nicht verfügbar" });
    return;
  }

  // Zone laden
  const [zone] = await db
    .select()
    .from(warehouseZones)
    .where(and(eq(warehouseZones.id, zoneId), eq(warehouseZones.restaurantId, restaurantId)));

  if (!zone) {
    res.status(404).json({ error: "Zone nicht gefunden" });
    return;
  }

  // Lagerorte laden
  const locations = await db
    .select()
    .from(warehouseLocations)
    .where(and(
      eq(warehouseLocations.zoneId, zoneId),
      eq(warehouseLocations.restaurantId, restaurantId),
      eq(warehouseLocations.isActive, true),
    ))
    .orderBy(asc(warehouseLocations.name));

  if (locations.length === 0) {
    res.status(404).json({ error: "Keine Lagerorte in dieser Zone" });
    return;
  }

  // ─── PDF erzeugen ─────────────────────────────────────────────────────────
  // Layout: 4 Labels pro A4-Seite (2 Spalten × 2 Zeilen)
  const COLS = 2;
  const ROWS = 2;
  const PER_PAGE = COLS * ROWS;

  const PAGE_W = 595.28; // A4 Breite in pt
  const PAGE_H = 841.89; // A4 Höhe in pt
  const MARGIN = 20;
  const LABEL_W = (PAGE_W - MARGIN * 3) / COLS;
  const LABEL_H = (PAGE_H - MARGIN * 3) / ROWS;
  const QR_SIZE = 110;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `Lager-QR-Labels: ${zone.name}`,
      Author: "SimplaPos",
      Subject: "Lagerort-QR-Code-Labels",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  // Alle QR-PNGs vorab generieren
  type LocRow = typeof warehouseLocations.$inferSelect;
  const qrBuffers = await Promise.all(
    locations.map((loc: LocRow) => qrToPngBuffer(loc.qrSlug ?? loc.id.toString()))
  );

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const qrBuf = qrBuffers[i];
    const pageIndex = Math.floor(i / PER_PAGE);
    const posOnPage = i % PER_PAGE;
    const col = posOnPage % COLS;
    const row = Math.floor(posOnPage / COLS);

    // Neue Seite wenn nötig (erste Seite ist auto-erstellt)
    if (i > 0 && posOnPage === 0) {
      doc.addPage();
    }

    const x = MARGIN + col * (LABEL_W + MARGIN);
    const y = MARGIN + row * (LABEL_H + MARGIN);

    // Label-Rahmen
    doc.save();
    doc.roundedRect(x, y, LABEL_W, LABEL_H, 8)
      .strokeColor("#CCCCCC")
      .lineWidth(1)
      .stroke();

    // Hintergrund-Header
    doc.roundedRect(x, y, LABEL_W, 30, 8)
      .fillColor("#2D2B6B")
      .fill();
    // Untere Ecken des Headers gerade machen
    doc.rect(x, y + 15, LABEL_W, 15)
      .fillColor("#2D2B6B")
      .fill();

    // Zonenname im Header
    doc.fillColor("#FFFFFF")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(
        `${zoneTypeLabel(zone.type ?? "trocken")}: ${zone.name}`,
        x + 8, y + 9,
        { width: LABEL_W - 16, align: "left", lineBreak: false }
      );

    // Lagerort-Name
    doc.fillColor("#1A1A2E")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(loc.name, x + 8, y + 38, { width: LABEL_W - QR_SIZE - 20, align: "left" });

    // Regal / Fach
    const shelfInfo = [loc.shelf && `Regal: ${loc.shelf}`, loc.compartment && `Fach: ${loc.compartment}`]
      .filter(Boolean)
      .join("  |  ");
    if (shelfInfo) {
      doc.fillColor("#555555")
        .fontSize(8)
        .font("Helvetica")
        .text(shelfInfo, x + 8, y + 58, { width: LABEL_W - QR_SIZE - 20 });
    }

    // Beschreibung (optional, gekürzt)
    if (loc.description) {
      doc.fillColor("#777777")
        .fontSize(7)
        .font("Helvetica")
        .text(loc.description.slice(0, 60), x + 8, y + 72, { width: LABEL_W - QR_SIZE - 20 });
    }

    // QR-Code rechts
    const qrX = x + LABEL_W - QR_SIZE - 10;
    const qrY = y + 35;
    doc.image(qrBuf, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

    // QR-Slug unter dem QR-Code (klein)
    doc.fillColor("#AAAAAA")
      .fontSize(6)
      .font("Helvetica")
      .text(loc.qrSlug ?? "", qrX, qrY + QR_SIZE + 2, { width: QR_SIZE, align: "center" });

    // Trennlinie unten
    const lineY = y + LABEL_H - 22;
    doc.strokeColor("#EEEEEE")
      .lineWidth(0.5)
      .moveTo(x + 8, lineY)
      .lineTo(x + LABEL_W - 8, lineY)
      .stroke();

    // Footer: SimplaPos + Datum
    doc.fillColor("#AAAAAA")
      .fontSize(7)
      .font("Helvetica")
      .text(
        `SimplaPos Lagerverwaltung | Gedruckt: ${new Date().toLocaleDateString("de-CH")}`,
        x + 8, lineY + 4,
        { width: LABEL_W - 16, align: "center" }
      );

    doc.restore();

    // Seitennummer (nur auf letztem Label der Seite oder letztem Label gesamt)
    const isLastOnPage = posOnPage === PER_PAGE - 1 || i === locations.length - 1;
    if (isLastOnPage) {
      const totalPages = Math.ceil(locations.length / PER_PAGE);
      doc.fillColor("#BBBBBB")
        .fontSize(7)
        .text(
          `Seite ${pageIndex + 1} / ${totalPages}`,
          MARGIN, PAGE_H - MARGIN - 10,
          { width: PAGE_W - MARGIN * 2, align: "center" }
        );
    }
  }

  doc.end();

  await new Promise<void>((resolve) => doc.on("end", resolve));

  const pdfBuffer = Buffer.concat(buffers);
  const filename = `lager-qr-labels-${zone.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(pdfBuffer.length),
    "Cache-Control": "no-store",
  });
  res.send(pdfBuffer);
}

// ─── Route registrieren ───────────────────────────────────────────────────────

export function registerWarehouseQrPdfRoute(app: Application) {
  app.get("/api/warehouse/zone-qr-pdf", (req, res) => {
    handleZoneQrPdf(req, res).catch((err) => {
      console.error("[WarehouseQrPdf] Fehler:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "PDF-Generierung fehlgeschlagen" });
      }
    });
  });
}
