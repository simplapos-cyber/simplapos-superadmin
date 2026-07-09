/**
 * reportPdf.ts
 * Revisionssichere PDF-Berichte für SimplaPOS (Schweizer OR Art. 957ff + MWSTG)
 *
 * Berichtstypen:
 * 1. Kassenbon (Einzelrechnung)
 * 2. Z-Abschluss (Tagesabschluss)
 * 3. Monatsbericht (aggregiert + tagesweise Detail)
 * 4. Jahresbericht
 * 5. Detaillierter Monatsbericht (tagesweise mit Zahlarten)
 */

import PDFDocument from "pdfkit";

// ─── Farben & Typografie (SimplaPOS Design) ──────────────────────────────────
const COLORS = {
  primary: "#2D2B6B",      // SimplaPOS Dunkelblau
  accent: "#4F46E5",       // Akzentblau
  dark: "#1A1A2E",         // Fast Schwarz
  gray: "#6B7280",         // Grau
  lightGray: "#F3F4F6",    // Hellgrau (Hintergrund)
  border: "#E5E7EB",       // Rahmenfarbe
  success: "#059669",      // Grün
  warning: "#D97706",      // Orange
  danger: "#DC2626",       // Rot
  white: "#FFFFFF",
  black: "#000000",
  text: "#111827",
};

const MARGIN = 50;
const PAGE_WIDTH = 595.28 - MARGIN * 2; // A4 minus Ränder

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatCHF(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return `CHF ${n.toFixed(2)}`;
}

function formatDate(date: Date | string, format: "short" | "long" | "datetime" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (format === "datetime") {
    return d.toLocaleString("de-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  if (format === "long") {
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
  }
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function drawHLine(doc: PDFKit.PDFDocument, y?: number, color = COLORS.border, width = 0.5) {
  const yPos = y ?? doc.y;
  doc.strokeColor(color).lineWidth(width)
    .moveTo(MARGIN, yPos).lineTo(MARGIN + PAGE_WIDTH, yPos).stroke();
}

function drawThickHLine(doc: PDFKit.PDFDocument, y?: number) {
  drawHLine(doc, y, COLORS.primary, 1.5);
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6);
  doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.primary).text(title.toUpperCase());
  doc.moveDown(0.2);
  drawHLine(doc, undefined, COLORS.primary, 0.8);
  doc.moveDown(0.4);
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cols: { text: string; x: number; width: number; align?: "left" | "right" | "center"; bold?: boolean; color?: string }[],
  bgColor?: string
) {
  const rowHeight = 16;
  const y = doc.y;

  if (bgColor) {
    doc.rect(MARGIN, y - 2, PAGE_WIDTH, rowHeight).fill(bgColor);
  }

  for (const col of cols) {
    doc.fontSize(8)
      .font(col.bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(col.color ?? COLORS.text)
      .text(col.text, col.x, y, { width: col.width, align: col.align ?? "left" });
  }

  doc.y = y + rowHeight;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  cols: { text: string; x: number; width: number; align?: "left" | "right" | "center" }[]
) {
  const y = doc.y;
  doc.rect(MARGIN, y - 2, PAGE_WIDTH, 18).fill(COLORS.primary);
  for (const col of cols) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.white)
      .text(col.text, col.x, y + 1, { width: col.width, align: col.align ?? "left" });
  }
  doc.y = y + 18;
  doc.moveDown(0.1);
}

function drawSummaryRow(doc: PDFKit.PDFDocument, label: string, value: string, highlight = false) {
  const y = doc.y;
  if (highlight) {
    doc.rect(MARGIN, y - 2, PAGE_WIDTH, 18).fill(COLORS.dark);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.white)
      .text(label, MARGIN + 4, y, { width: PAGE_WIDTH * 0.65 })
      .text(value, MARGIN + PAGE_WIDTH * 0.65, y, { width: PAGE_WIDTH * 0.35, align: "right" });
    doc.y = y + 18;
  } else {
    doc.fontSize(8.5).font("Helvetica").fillColor(COLORS.text)
      .text(label, MARGIN + 4, y, { width: PAGE_WIDTH * 0.65 });
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(COLORS.text)
      .text(value, MARGIN + PAGE_WIDTH * 0.65, y, { width: PAGE_WIDTH * 0.35, align: "right" });
    doc.y = y + 14;
  }
}

// ─── Kopfzeile (gemeinsam für alle Berichte) ─────────────────────────────────

interface ReportHeader {
  restaurantName: string;
  address: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  reportTitle: string;
  reportSubtitle?: string;
  reportId: string;
  reportNumber: string;
  generatedAt: Date;
  periodStart?: Date;
  periodEnd?: Date;
}

function drawReportHeader(doc: PDFKit.PDFDocument, header: ReportHeader) {
  const y = MARGIN;

  // Links: Restaurant-Info
  doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.dark)
    .text(header.restaurantName, MARGIN, y);
  doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray);
  if (header.address) doc.text(header.address);
  if (header.zip && header.city) doc.text(`${header.zip} ${header.city}, Schweiz`);
  if (header.phone) doc.text(`Tel. ${header.phone}`);
  if (header.vatNumber) doc.text(`MwSt-Nr. ${header.vatNumber}`);

  // Rechts: Bericht-Info
  const rightX = MARGIN + PAGE_WIDTH * 0.55;
  doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray)
    .text(`Bericht ID#: ${header.reportId}`, rightX, y, { width: PAGE_WIDTH * 0.45, align: "right" })
    .text(`Bericht#: ${header.reportNumber}`, rightX, doc.y, { width: PAGE_WIDTH * 0.45, align: "right" })
    .text(`Datum/Zeit: ${formatDate(header.generatedAt, "datetime")}`, rightX, doc.y, { width: PAGE_WIDTH * 0.45, align: "right" });

  if (header.periodStart && header.periodEnd) {
    doc.fillColor(COLORS.danger)
      .text(`${formatDate(header.periodStart)} – ${formatDate(header.periodEnd)}`, rightX, doc.y, { width: PAGE_WIDTH * 0.45, align: "right" });
  }

  doc.moveDown(1.5);
  drawThickHLine(doc);
  doc.moveDown(0.6);

  // Berichtstitel
  doc.fontSize(12).font("Helvetica-Bold").fillColor(COLORS.dark)
    .text(header.reportTitle);
  if (header.reportSubtitle) {
    doc.fontSize(9).font("Helvetica").fillColor(COLORS.gray).text(header.reportSubtitle);
  }
  doc.moveDown(0.8);
}

// ─── Fusszeile ───────────────────────────────────────────────────────────────

function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  const footerY = doc.page.height - 35;
  doc.fontSize(7).font("Helvetica").fillColor(COLORS.gray)
    .text(`Seite ${pageNum} von ${totalPages}`, MARGIN, footerY, { width: PAGE_WIDTH * 0.3 })
    .text("Gesetzeskonforme Aufbewahrung gemäss OR Art. 958f (10 Jahre)", MARGIN + PAGE_WIDTH * 0.2, footerY, { width: PAGE_WIDTH * 0.6, align: "center" });
  doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.primary)
    .text("SimplaPOS", MARGIN + PAGE_WIDTH * 0.8, footerY, { width: PAGE_WIDTH * 0.2, align: "right" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. KASSENBON (Einzelrechnung)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReceiptData {
  receiptNumber: string;
  restaurantName: string;
  address?: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  orderType: string;
  staffName?: string;
  tableName?: string;
  items: { name: string; quantity: number; unitPrice: number; totalPrice: number; modifiers?: string }[];
  subtotal: number;
  vatLines: { rate: string; base: number; amount: number }[];
  totalAmount: number;
  tipAmount?: number;
  paymentMethod: string;
  paidAt: Date;
  orderNumber?: string;
}

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Header
    doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.dark).text(data.restaurantName);
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray);
    if (data.address) doc.text(data.address);
    if (data.zip && data.city) doc.text(`${data.zip} ${data.city}`);
    if (data.phone) doc.text(`Tel. ${data.phone}`);
    if (data.vatNumber) doc.text(`MwSt-Nr. ${data.vatNumber}`);

    // Rechts: Rechnungsinfo
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.text)
      .text(`Rechnung #: ${data.receiptNumber}`, MARGIN, MARGIN, { width: PAGE_WIDTH, align: "right" });
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray)
      .text(`Datum/Zeit: ${formatDate(data.paidAt, "datetime")}`, MARGIN, doc.y, { width: PAGE_WIDTH, align: "right" });

    doc.moveDown(0.5);
    drawThickHLine(doc);
    doc.moveDown(0.5);

    // Bestelltyp & Mitarbeiter
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.primary).text(data.orderType);
    if (data.staffName) {
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray).text(`Es bedient Sie: ${data.staffName}`);
    }
    if (data.tableName) {
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.gray).text(`Tisch: ${data.tableName}`);
    }

    doc.moveDown(0.5);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.dark).text("Restaurant Rechnung");
    doc.moveDown(0.4);

    // Produkt-Tabelle Header
    drawTableHeader(doc, [
      { text: "Menge", x: MARGIN, width: 45 },
      { text: "Produkte", x: MARGIN + 50, width: PAGE_WIDTH - 150 },
      { text: "Einen", x: MARGIN + PAGE_WIDTH - 95, width: 45, align: "right" },
      { text: "Gesamt", x: MARGIN + PAGE_WIDTH - 45, width: 45, align: "right" },
      { text: "MwSt", x: MARGIN + PAGE_WIDTH - 0, width: 40, align: "right" },
    ]);

    // Produkte
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
      const vatRate = data.vatLines.length > 0 ? `${data.vatLines[0].rate}%` : "8.10%";

      drawTableRow(doc, [
        { text: `${item.quantity} X`, x: MARGIN, width: 45 },
        { text: item.name + (item.modifiers ? `\n  ${item.modifiers}` : ""), x: MARGIN + 50, width: PAGE_WIDTH - 150 },
        { text: `${item.unitPrice.toFixed(2)}CHF`, x: MARGIN + PAGE_WIDTH - 95, width: 45, align: "right" },
        { text: `${item.totalPrice.toFixed(2)}CHF`, x: MARGIN + PAGE_WIDTH - 45, width: 45, align: "right" },
        { text: vatRate, x: MARGIN + PAGE_WIDTH, width: 40, align: "right" },
      ], bg);
    }

    doc.moveDown(0.5);
    drawHLine(doc);
    doc.moveDown(0.3);

    // Summen
    const summaryX = MARGIN + PAGE_WIDTH * 0.5;
    const summaryWidth = PAGE_WIDTH * 0.5;

    doc.fontSize(8).font("Helvetica").fillColor(COLORS.text)
      .text("Zwischensumme:", summaryX, doc.y, { width: summaryWidth * 0.6 });
    doc.text(`${data.subtotal.toFixed(2)} CHF`, summaryX + summaryWidth * 0.6, doc.y - 10, { width: summaryWidth * 0.4, align: "right" });

    for (const vat of data.vatLines) {
      doc.text(`MwSt ${vat.rate}%:`, summaryX, doc.y, { width: summaryWidth * 0.6 });
      doc.text(`${vat.amount.toFixed(2)} CHF`, summaryX + summaryWidth * 0.6, doc.y - 10, { width: summaryWidth * 0.4, align: "right" });
    }

    doc.moveDown(0.2);
    drawHLine(doc, undefined, COLORS.dark, 1);
    doc.moveDown(0.2);

    // Gesamtsumme (fett, gross)
    doc.fontSize(11).font("Helvetica-Bold").fillColor(COLORS.dark)
      .text("Gesamtsumme:", summaryX, doc.y, { width: summaryWidth * 0.6 });
    doc.text(formatCHF(data.totalAmount), summaryX + summaryWidth * 0.6, doc.y - 13, { width: summaryWidth * 0.4, align: "right" });

    doc.moveDown(0.3);
    doc.fontSize(8).font("Helvetica").fillColor(COLORS.text)
      .text("Zahlungsart:", summaryX, doc.y, { width: summaryWidth * 0.6 });
    doc.text(data.paymentMethod, summaryX + summaryWidth * 0.6, doc.y - 10, { width: summaryWidth * 0.4, align: "right" });

    if (data.tipAmount && data.tipAmount > 0) {
      doc.text("Trinkgeld:", summaryX, doc.y, { width: summaryWidth * 0.6 });
      doc.text(formatCHF(data.tipAmount), summaryX + summaryWidth * 0.6, doc.y - 10, { width: summaryWidth * 0.4, align: "right" });
    }

    doc.moveDown(1.5);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(COLORS.dark)
      .text("Danke für Ihren Besuch!", { align: "center" });

    doc.moveDown(0.5);
    doc.fontSize(7).font("Helvetica").fillColor(COLORS.gray)
      .text("SimplaPOS — Cloud-Kassensystem für die Gastronomie", { align: "center" });

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Z-ABSCHLUSS (Tagesabschluss)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ZAbschlussData {
  // Header
  restaurantName: string;
  address?: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  closingId: number;
  closingNumber: string;
  closingDate: Date;
  performedByName: string;
  mode: "auto" | "manual";
  generatedAt: Date;

  // Kategorien nach Bereich (wie QRorpa)
  categoryBlocks: {
    blockTitle: string; // z.B. "Restaurant (Bar)", "Restaurant (Karte)"
    rows: { category: string; quantity: number; brutto: number; mwst: number; netto: number; pct: number }[];
    total: { quantity: number; brutto: number; mwst: number; netto: number };
  }[];

  // Gesamtsummen
  grandTotal: { quantity: number; brutto: number; mwst: number; netto: number };

  // MwSt-Aufschlüsselung
  vatLines: { rate: string; label: string; netBase: number; vatAmount: number; grossAmount: number }[];

  // Zahlungsarten
  paymentLines: { method: string; count: number; amount: number }[];

  // Kassendifferenz
  cashStart: number;
  cashEnd: number;
  cashExpected: number;
  cashDifference: number;

  // Kellnerverkäufe
  staffSales: {
    staffName: string;
    cash: number;
    card: number;
    online: number;
    invoice: number;
    giftCard: number;
    total: number;
    tips: number;
    tipsDeducted: number;
  }[];

  // Stornierungen
  voids: { staffName: string; itemName: string; quantity: number; amount: number; reason: string; createdAt: Date }[];
  totalVoided: number;

  // Statistiken
  totalOrders: number;
  totalGuests: number;
  avgOrderValue: number;
  notes?: string;
}

export function generateZAbschlussPdf(data: ZAbschlussData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // ── Kopfzeile ──
    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Z-Abschluss (Tagesbericht): ${formatDate(data.closingDate, "long")}`,
      reportId: String(data.closingId).padStart(8, "0"),
      reportNumber: data.closingNumber,
      generatedAt: data.generatedAt,
    });

    // ── Kategorie-Blöcke ──
    for (const block of data.categoryBlocks) {
      drawSectionHeader(doc, block.blockTitle);

      drawTableHeader(doc, [
        { text: "Stk.", x: MARGIN, width: 40 },
        { text: "Hauptkategorien", x: MARGIN + 45, width: PAGE_WIDTH - 200 },
        { text: "Brutto", x: MARGIN + PAGE_WIDTH - 150, width: 50, align: "right" },
        { text: "MWST 8.10%", x: MARGIN + PAGE_WIDTH - 95, width: 50, align: "right" },
        { text: "Netto", x: MARGIN + PAGE_WIDTH - 40, width: 45, align: "right" },
        { text: "%-Anteil", x: MARGIN + PAGE_WIDTH + 10, width: 40, align: "right" },
      ]);

      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i];
        const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
        drawTableRow(doc, [
          { text: `${row.quantity} X`, x: MARGIN, width: 40 },
          { text: row.category, x: MARGIN + 45, width: PAGE_WIDTH - 200 },
          { text: `CHF ${row.brutto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 150, width: 50, align: "right" },
          { text: `CHF ${row.mwst.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 95, width: 50, align: "right" },
          { text: `CHF ${row.netto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 40, width: 45, align: "right" },
          { text: `${row.pct.toFixed(2)} %`, x: MARGIN + PAGE_WIDTH + 10, width: 40, align: "right" },
        ], bg);
      }

      // Block-Summe
      const bt = block.total;
      doc.moveDown(0.1);
      const sumY = doc.y;
      doc.rect(MARGIN, sumY - 2, PAGE_WIDTH, 16).fill(COLORS.lightGray);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.dark)
        .text(`${bt.quantity} X`, MARGIN + 2, sumY, { width: 40 })
        .text(`CHF ${bt.brutto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 150, sumY, { width: 50, align: "right" })
        .text(`CHF ${bt.mwst.toFixed(2)}`, MARGIN + PAGE_WIDTH - 95, sumY, { width: 50, align: "right" })
        .text(`CHF ${bt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 40, sumY, { width: 45, align: "right" })
        .text("100 %", MARGIN + PAGE_WIDTH + 10, sumY, { width: 40, align: "right" });
      doc.y = sumY + 18;
      doc.moveDown(0.5);
    }

    // ── Gesamtsumme ──
    doc.moveDown(0.3);
    const gt = data.grandTotal;
    const gtY = doc.y;
    doc.rect(MARGIN, gtY - 2, PAGE_WIDTH, 20).fill(COLORS.dark);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("Summen für den gesamten Bericht", MARGIN + 4, gtY + 2, { width: PAGE_WIDTH * 0.4 })
      .text(`CHF ${gt.brutto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 150, gtY + 2, { width: 50, align: "right" })
      .text(`CHF ${gt.mwst.toFixed(2)}`, MARGIN + PAGE_WIDTH - 95, gtY + 2, { width: 50, align: "right" })
      .text(`CHF ${gt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 40, gtY + 2, { width: 45, align: "right" })
      .text(`${gt.quantity} X`, MARGIN + PAGE_WIDTH + 10, gtY + 2, { width: 40, align: "right" });
    doc.y = gtY + 24;

    // ── Kellnerverkäufe ──
    doc.moveDown(0.8);
    drawSectionHeader(doc, "Kellnerverkäufe, unterteilt in Verkaufsarten");

    drawTableHeader(doc, [
      { text: "Kellner.", x: MARGIN, width: 90 },
      { text: "Barzahlung", x: MARGIN + 95, width: 65, align: "right" },
      { text: "Kartenzahlung", x: MARGIN + 165, width: 65, align: "right" },
      { text: "Onlinebezahlung", x: MARGIN + 235, width: 65, align: "right" },
      { text: "Auf Rechnung", x: MARGIN + 305, width: 65, align: "right" },
      { text: "Geschenkkarten", x: MARGIN + 375, width: 65, align: "right" },
      { text: "Gesamt", x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right" },
    ]);

    for (let i = 0; i < data.staffSales.length; i++) {
      const s = data.staffSales[i];
      const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
      drawTableRow(doc, [
        { text: s.staffName, x: MARGIN, width: 90 },
        { text: `${s.cash.toFixed(2)} CHF`, x: MARGIN + 95, width: 65, align: "right" },
        { text: `${s.card.toFixed(2)} CHF`, x: MARGIN + 165, width: 65, align: "right" },
        { text: `${s.online.toFixed(2)} CHF`, x: MARGIN + 235, width: 65, align: "right" },
        { text: `${s.invoice.toFixed(2)} CHF`, x: MARGIN + 305, width: 65, align: "right" },
        { text: `${s.giftCard.toFixed(2)} CHF`, x: MARGIN + 375, width: 65, align: "right" },
        { text: `${s.total.toFixed(2)} CHF`, x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right" },
      ], bg);
      // Trinkgeld-Zeile
      if (s.tips > 0) {
        drawTableRow(doc, [
          { text: "Trinkgeld", x: MARGIN + 10, width: 80, color: COLORS.gray },
          { text: `${s.tips.toFixed(2)} CHF`, x: MARGIN + 95, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 165, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 235, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 305, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 375, width: 65, align: "right", color: COLORS.gray },
          { text: `${s.tips.toFixed(2)} CHF`, x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right", color: COLORS.gray },
        ]);
      }
    }

    // ── Stornierungsprotokoll ──
    if (data.voids.length > 0) {
      doc.moveDown(0.8);
      drawSectionHeader(doc, `Stornierungsprotokoll (${data.voids.length} Positionen, Total: CHF ${data.totalVoided.toFixed(2)})`);

      drawTableHeader(doc, [
        { text: "Datum/Zeit", x: MARGIN, width: 90 },
        { text: "Mitarbeiter", x: MARGIN + 95, width: 80 },
        { text: "Artikel", x: MARGIN + 180, width: PAGE_WIDTH - 340 },
        { text: "Menge", x: MARGIN + PAGE_WIDTH - 155, width: 40, align: "right" },
        { text: "Betrag", x: MARGIN + PAGE_WIDTH - 110, width: 55, align: "right" },
        { text: "Grund", x: MARGIN + PAGE_WIDTH - 50, width: 55 },
      ]);

      const reasonLabels: Record<string, string> = {
        wrong_order: "Falsche Bestellung",
        customer_change: "Kundenwunsch",
        quality: "Qualität",
        duplicate: "Duplikat",
        other: "Sonstiges",
      };

      for (let i = 0; i < data.voids.length; i++) {
        const v = data.voids[i];
        const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
        drawTableRow(doc, [
          { text: formatDate(v.createdAt, "datetime"), x: MARGIN, width: 90 },
          { text: v.staffName, x: MARGIN + 95, width: 80 },
          { text: v.itemName, x: MARGIN + 180, width: PAGE_WIDTH - 340 },
          { text: String(v.quantity), x: MARGIN + PAGE_WIDTH - 155, width: 40, align: "right" },
          { text: `CHF ${v.amount.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 110, width: 55, align: "right", color: COLORS.danger },
          { text: reasonLabels[v.reason] ?? v.reason, x: MARGIN + PAGE_WIDTH - 50, width: 55 },
        ], bg);
      }
    }

    // ── Kassendifferenz ──
    doc.moveDown(0.8);
    drawSectionHeader(doc, "Kassendifferenz");
    drawSummaryRow(doc, "Kassenbestand Anfang", formatCHF(data.cashStart));
    drawSummaryRow(doc, "Kassenbestand Soll (laut System)", formatCHF(data.cashExpected));
    drawSummaryRow(doc, "Kassenbestand Ist (gezählt)", formatCHF(data.cashEnd));
    const diffColor = Math.abs(data.cashDifference) > 0.01 ? COLORS.danger : COLORS.success;
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(diffColor)
      .text(`Differenz: ${data.cashDifference >= 0 ? "+" : ""}${formatCHF(data.cashDifference)}`, MARGIN + 4, doc.y);
    doc.moveDown(0.3);

    // ── Statistiken ──
    doc.moveDown(0.5);
    drawSectionHeader(doc, "Tagesstatistik");
    drawSummaryRow(doc, "Anzahl Bestellungen", String(data.totalOrders));
    drawSummaryRow(doc, "Anzahl Gäste", String(data.totalGuests));
    drawSummaryRow(doc, "Ø Bestellwert", formatCHF(data.avgOrderValue));
    drawSummaryRow(doc, "Stornierungen", `${data.voids.length} Pos. / CHF ${data.totalVoided.toFixed(2)}`);

    if (data.notes) {
      doc.moveDown(0.5);
      drawSectionHeader(doc, "Notizen");
      doc.fontSize(8).font("Helvetica").fillColor(COLORS.text).text(data.notes);
    }

    // ── Revisionsvermerk ──
    doc.moveDown(1);
    doc.rect(MARGIN, doc.y, PAGE_WIDTH, 28).fill(COLORS.lightGray);
    const rvY = doc.y + 4;
    doc.fontSize(7).font("Helvetica").fillColor(COLORS.gray)
      .text("Dieser Bericht wurde elektronisch erstellt und ist gemäss OR Art. 958f aufbewahrungspflichtig (10 Jahre).", MARGIN + 6, rvY, { width: PAGE_WIDTH - 12 })
      .text(`Erstellt: ${formatDate(data.generatedAt, "datetime")} | System: SimplaPOS | Abschluss-Nr.: ${data.closingNumber}`, MARGIN + 6, rvY + 10, { width: PAGE_WIDTH - 12 });
    doc.y = rvY + 32;

    // Seitennummern
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MONATSBERICHT
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonthlyReportData {
  restaurantName: string;
  address?: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  reportId: number;
  reportNumber: string;
  year: number;
  month: number; // 1-12
  generatedAt: Date;

  categoryBlocks: {
    blockTitle: string;
    rows: { category: string; quantity: number; brutto: number; mwst: number; netto: number; pct: number }[];
    total: { quantity: number; brutto: number; mwst: number; netto: number };
  }[];

  grandTotal: { quantity: number; brutto: number; mwst: number; netto: number };

  staffSales: {
    staffName: string;
    cash: number;
    card: number;
    online: number;
    invoice: number;
    giftCard: number;
    total: number;
    tips: number;
    tipsDeducted: number;
  }[];

  totalVoided: number;
  voidCount: number;
}

export function generateMonthlyReportPdf(data: MonthlyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const monthName = monthNames[data.month - 1];

    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Monatlicher Bericht: ${data.month}.${data.year}`,
      reportId: String(data.reportId).padStart(8, "0"),
      reportNumber: data.reportNumber,
      generatedAt: data.generatedAt,
    });

    // Kategorie-Blöcke (gleiche Logik wie Z-Abschluss)
    for (const block of data.categoryBlocks) {
      drawSectionHeader(doc, block.blockTitle);
      drawTableHeader(doc, [
        { text: "Stk.", x: MARGIN, width: 40 },
        { text: "Hauptkategorien", x: MARGIN + 45, width: PAGE_WIDTH - 200 },
        { text: "Brutto", x: MARGIN + PAGE_WIDTH - 150, width: 55, align: "right" },
        { text: "MWST 8.10%", x: MARGIN + PAGE_WIDTH - 90, width: 50, align: "right" },
        { text: "Netto", x: MARGIN + PAGE_WIDTH - 35, width: 45, align: "right" },
        { text: "%-Anteil", x: MARGIN + PAGE_WIDTH + 15, width: 40, align: "right" },
      ]);

      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i];
        drawTableRow(doc, [
          { text: `${row.quantity} X`, x: MARGIN, width: 40 },
          { text: row.category, x: MARGIN + 45, width: PAGE_WIDTH - 200 },
          { text: `CHF ${row.brutto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 150, width: 55, align: "right" },
          { text: `CHF ${row.mwst.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 90, width: 50, align: "right" },
          { text: `CHF ${row.netto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 35, width: 45, align: "right" },
          { text: `${row.pct.toFixed(2)} %`, x: MARGIN + PAGE_WIDTH + 15, width: 40, align: "right" },
        ], i % 2 === 0 ? undefined : COLORS.lightGray);
      }

      const bt = block.total;
      const sumY = doc.y;
      doc.rect(MARGIN, sumY - 2, PAGE_WIDTH, 16).fill(COLORS.lightGray);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.dark)
        .text(`${bt.quantity} X`, MARGIN + 2, sumY, { width: 40 })
        .text(`CHF ${bt.brutto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 150, sumY, { width: 55, align: "right" })
        .text(`CHF ${bt.mwst.toFixed(2)}`, MARGIN + PAGE_WIDTH - 90, sumY, { width: 50, align: "right" })
        .text(`CHF ${bt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 35, sumY, { width: 45, align: "right" })
        .text("100 %", MARGIN + PAGE_WIDTH + 15, sumY, { width: 40, align: "right" });
      doc.y = sumY + 18;
      doc.moveDown(0.5);
    }

    // Gesamtsumme
    const gt = data.grandTotal;
    const gtY = doc.y;
    doc.rect(MARGIN, gtY - 2, PAGE_WIDTH, 20).fill(COLORS.dark);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("Summen für den gesamten Bericht", MARGIN + 4, gtY + 2, { width: PAGE_WIDTH * 0.4 })
      .text(`CHF ${gt.brutto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 150, gtY + 2, { width: 55, align: "right" })
      .text(`CHF ${gt.mwst.toFixed(2)}`, MARGIN + PAGE_WIDTH - 90, gtY + 2, { width: 50, align: "right" })
      .text(`CHF ${gt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 35, gtY + 2, { width: 45, align: "right" })
      .text(`${gt.quantity} X`, MARGIN + PAGE_WIDTH + 15, gtY + 2, { width: 40, align: "right" });
    doc.y = gtY + 24;

    // Kellnerverkäufe
    doc.moveDown(0.8);
    drawSectionHeader(doc, "Kellnerverkäufe, unterteilt in Verkaufsarten");
    drawTableHeader(doc, [
      { text: "Kellner.", x: MARGIN, width: 90 },
      { text: "Barzahlung", x: MARGIN + 95, width: 65, align: "right" },
      { text: "Kartenzahlung", x: MARGIN + 165, width: 65, align: "right" },
      { text: "Onlinebezahlung", x: MARGIN + 235, width: 65, align: "right" },
      { text: "Auf Rechnung", x: MARGIN + 305, width: 65, align: "right" },
      { text: "Geschenkkarten", x: MARGIN + 375, width: 65, align: "right" },
      { text: "Gesamt", x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right" },
    ]);

    for (let i = 0; i < data.staffSales.length; i++) {
      const s = data.staffSales[i];
      drawTableRow(doc, [
        { text: s.staffName, x: MARGIN, width: 90 },
        { text: `${s.cash.toFixed(2)} CHF`, x: MARGIN + 95, width: 65, align: "right" },
        { text: `${s.card.toFixed(2)} CHF`, x: MARGIN + 165, width: 65, align: "right" },
        { text: `${s.online.toFixed(2)} CHF`, x: MARGIN + 235, width: 65, align: "right" },
        { text: `${s.invoice.toFixed(2)} CHF`, x: MARGIN + 305, width: 65, align: "right" },
        { text: `${s.giftCard.toFixed(2)} CHF`, x: MARGIN + 375, width: 65, align: "right" },
        { text: `${s.total.toFixed(2)} CHF`, x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right" },
      ], i % 2 === 0 ? undefined : COLORS.lightGray);
      if (s.tips > 0) {
        drawTableRow(doc, [
          { text: "Trinkgeld", x: MARGIN + 10, width: 80, color: COLORS.gray },
          { text: `${s.tips.toFixed(2)} CHF`, x: MARGIN + 95, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 165, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 235, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 305, width: 65, align: "right", color: COLORS.gray },
          { text: "—", x: MARGIN + 375, width: 65, align: "right", color: COLORS.gray },
          { text: `${s.tips.toFixed(2)} CHF`, x: MARGIN + PAGE_WIDTH - 45, width: 50, align: "right", color: COLORS.gray },
        ]);
      }
    }

    // Revisionsvermerk
    doc.moveDown(1);
    doc.rect(MARGIN, doc.y, PAGE_WIDTH, 28).fill(COLORS.lightGray);
    const rvY = doc.y + 4;
    doc.fontSize(7).font("Helvetica").fillColor(COLORS.gray)
      .text(`Monatsbericht ${monthName} ${data.year} — Erstellt: ${formatDate(data.generatedAt, "datetime")} | SimplaPOS`, MARGIN + 6, rvY, { width: PAGE_WIDTH - 12 })
      .text("Aufbewahrungspflichtig gemäss OR Art. 958f (10 Jahre). Unveränderlich nach Abschluss.", MARGIN + 6, rvY + 10, { width: PAGE_WIDTH - 12 });
    doc.y = rvY + 32;

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DETAILLIERTER MONATSBERICHT (tagesweise)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DetailedMonthlyReportData {
  restaurantName: string;
  address?: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  reportId: number;
  reportNumber: string;
  year: number;
  month: number;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;

  // Tagesweise Daten
  dailyRows: {
    day: number;
    weekday: string;
    brutto: number;
    essen: number;
    nichtKategorisiert: number;
    verkaufteGutscheine: number;
    gesamt: number;
  }[];

  totals: {
    brutto: number;
    essen: number;
    nichtKategorisiert: number;
    verkaufteGutscheine: number;
    gesamt: number;
    mwst81: number;
    mwst26: number;
    netto: number;
  };

  // Zweite Tabelle: Zahlarten tagesweise
  dailyPayments: {
    day: number;
    bruttoUmsatz: number;
    bargeld: number;
    kreditkarte: number;
    online: number;
    rechnung: number;
    gutscheine: number;
    trinkgeld: number;
    rabatte: number;
    ausgaben: number;
    ausgabenBar: number;
    barEndbestand: number;
  }[];

  paymentTotals: {
    bruttoUmsatz: number;
    bargeld: number;
    kreditkarte: number;
    online: number;
    rechnung: number;
    gutscheine: number;
    trinkgeld: number;
    rabatte: number;
    ausgaben: number;
    ausgabenBar: number;
    barEndbestand: number;
  };
}

export function generateDetailedMonthlyReportPdf(data: DetailedMonthlyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const monthName = monthNames[data.month - 1];

    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Monatlicher Bericht: ( ${monthName} ) ${data.month}.${data.year}`,
      reportId: String(data.reportId).padStart(8, "0"),
      reportNumber: data.reportNumber,
      generatedAt: data.generatedAt,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    });

    // ── Tabelle 1: Kategorien tagesweise ──
    drawTableHeader(doc, [
      { text: "Datum", x: MARGIN, width: 30 },
      { text: "Tag", x: MARGIN + 35, width: 25 },
      { text: "Essen", x: MARGIN + 65, width: 65, align: "right" },
      { text: "Nicht kategorisiert", x: MARGIN + 135, width: 80, align: "right" },
      { text: "Verkaufte Gutscheine", x: MARGIN + 220, width: 80, align: "right" },
      { text: "Gesamt", x: MARGIN + PAGE_WIDTH - 55, width: 60, align: "right" },
    ]);

    for (let i = 0; i < data.dailyRows.length; i++) {
      const row = data.dailyRows[i];
      const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
      drawTableRow(doc, [
        { text: String(row.day), x: MARGIN, width: 30 },
        { text: row.weekday, x: MARGIN + 35, width: 25 },
        { text: row.essen > 0 ? row.essen.toFixed(2) : "0.00", x: MARGIN + 65, width: 65, align: "right" },
        { text: row.nichtKategorisiert > 0 ? row.nichtKategorisiert.toFixed(2) : "0.00", x: MARGIN + 135, width: 80, align: "right" },
        { text: row.verkaufteGutscheine > 0 ? row.verkaufteGutscheine.toFixed(2) : "0.00", x: MARGIN + 220, width: 80, align: "right" },
        { text: row.gesamt > 0 ? row.gesamt.toFixed(2) : "0.00", x: MARGIN + PAGE_WIDTH - 55, width: 60, align: "right", bold: row.gesamt > 0 },
      ], bg);
    }

    // Totals
    const t = data.totals;
    const totY = doc.y;
    doc.rect(MARGIN, totY - 2, PAGE_WIDTH, 16).fill(COLORS.lightGray);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.dark)
      .text("Total Brutto", MARGIN + 2, totY, { width: 90 })
      .text(t.essen.toFixed(2), MARGIN + 65, totY, { width: 65, align: "right" })
      .text(t.nichtKategorisiert.toFixed(2), MARGIN + 135, totY, { width: 80, align: "right" })
      .text(t.verkaufteGutscheine.toFixed(2), MARGIN + 220, totY, { width: 80, align: "right" })
      .text(t.gesamt.toFixed(2), MARGIN + PAGE_WIDTH - 55, totY, { width: 60, align: "right" });
    doc.y = totY + 18;

    // MwSt-Zeilen
    const mwstY = doc.y;
    doc.fontSize(7.5).font("Helvetica").fillColor(COLORS.gray)
      .text(`MwSt. 8.10%`, MARGIN + 2, mwstY, { width: 90 })
      .text(t.mwst81.toFixed(2), MARGIN + 65, mwstY, { width: 65, align: "right" });
    doc.y = mwstY + 12;
    doc.text(`MwSt. 2.60%`, MARGIN + 2, doc.y, { width: 90 })
      .text(t.mwst26.toFixed(2), MARGIN + 65, doc.y - 10, { width: 65, align: "right" });
    doc.moveDown(0.2);

    const nettoY = doc.y;
    doc.rect(MARGIN, nettoY - 2, PAGE_WIDTH, 14).fill(COLORS.lightGray);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.dark)
      .text("Total Netto", MARGIN + 2, nettoY, { width: 90 })
      .text(t.netto.toFixed(2), MARGIN + PAGE_WIDTH - 55, nettoY, { width: 60, align: "right" });
    doc.y = nettoY + 16;

    // ── Tabelle 2: Zahlarten tagesweise (neue Seite wenn nötig) ──
    doc.addPage();
    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Monatlicher Bericht: ( ${monthName} ) ${data.month}.${data.year}`,
      reportId: String(data.reportId).padStart(8, "0"),
      reportNumber: data.reportNumber,
      generatedAt: data.generatedAt,
    });

    drawTableHeader(doc, [
      { text: "", x: MARGIN, width: 20 },
      { text: "Brutto Umsatz", x: MARGIN + 25, width: 55, align: "right" },
      { text: "Bargeld", x: MARGIN + 85, width: 45, align: "right" },
      { text: "Kreditkarte", x: MARGIN + 135, width: 45, align: "right" },
      { text: "Online", x: MARGIN + 185, width: 40, align: "right" },
      { text: "Rechnung", x: MARGIN + 230, width: 45, align: "right" },
      { text: "Gutscheine", x: MARGIN + 280, width: 45, align: "right" },
      { text: "Trinkgeld", x: MARGIN + 330, width: 40, align: "right" },
      { text: "Rabatte", x: MARGIN + 375, width: 40, align: "right" },
      { text: "Ausgaben", x: MARGIN + 420, width: 40, align: "right" },
      { text: "Bar Endbestand", x: MARGIN + PAGE_WIDTH - 55, width: 60, align: "right" },
    ]);

    for (let i = 0; i < data.dailyPayments.length; i++) {
      const row = data.dailyPayments[i];
      const bg = i % 2 === 0 ? undefined : COLORS.lightGray;
      const hasData = row.bruttoUmsatz > 0;
      drawTableRow(doc, [
        { text: String(row.day), x: MARGIN, width: 20, bold: hasData },
        { text: row.bruttoUmsatz > 0 ? row.bruttoUmsatz.toFixed(2) : "0.00", x: MARGIN + 25, width: 55, align: "right", bold: hasData },
        { text: row.bargeld > 0 ? row.bargeld.toFixed(2) : "0.00", x: MARGIN + 85, width: 45, align: "right" },
        { text: row.kreditkarte > 0 ? row.kreditkarte.toFixed(2) : "0.00", x: MARGIN + 135, width: 45, align: "right" },
        { text: row.online > 0 ? row.online.toFixed(2) : "0.00", x: MARGIN + 185, width: 40, align: "right" },
        { text: row.rechnung > 0 ? row.rechnung.toFixed(2) : "0.00", x: MARGIN + 230, width: 45, align: "right" },
        { text: row.gutscheine > 0 ? row.gutscheine.toFixed(2) : "0.00", x: MARGIN + 280, width: 45, align: "right" },
        { text: row.trinkgeld > 0 ? row.trinkgeld.toFixed(2) : "0.00", x: MARGIN + 330, width: 40, align: "right" },
        { text: row.rabatte > 0 ? row.rabatte.toFixed(2) : "0.00", x: MARGIN + 375, width: 40, align: "right" },
        { text: row.ausgaben > 0 ? row.ausgaben.toFixed(2) : "0.00", x: MARGIN + 420, width: 40, align: "right" },
        { text: row.barEndbestand > 0 ? row.barEndbestand.toFixed(2) : "0.00", x: MARGIN + PAGE_WIDTH - 55, width: 60, align: "right" },
      ], bg);
    }

    // Payment Totals
    const pt = data.paymentTotals;
    const ptY = doc.y;
    doc.rect(MARGIN, ptY - 2, PAGE_WIDTH, 18).fill(COLORS.dark);
    doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.white)
      .text("T:", MARGIN + 2, ptY + 1, { width: 20 })
      .text(pt.bruttoUmsatz.toFixed(2), MARGIN + 25, ptY + 1, { width: 55, align: "right" })
      .text(pt.bargeld.toFixed(2), MARGIN + 85, ptY + 1, { width: 45, align: "right" })
      .text(pt.kreditkarte.toFixed(2), MARGIN + 135, ptY + 1, { width: 45, align: "right" })
      .text(pt.online.toFixed(2), MARGIN + 185, ptY + 1, { width: 40, align: "right" })
      .text(pt.rechnung.toFixed(2), MARGIN + 230, ptY + 1, { width: 45, align: "right" })
      .text(pt.gutscheine.toFixed(2), MARGIN + 280, ptY + 1, { width: 45, align: "right" })
      .text(pt.trinkgeld.toFixed(2), MARGIN + 330, ptY + 1, { width: 40, align: "right" })
      .text(pt.rabatte.toFixed(2), MARGIN + 375, ptY + 1, { width: 40, align: "right" })
      .text(pt.ausgaben.toFixed(2), MARGIN + 420, ptY + 1, { width: 40, align: "right" })
      .text(pt.barEndbestand.toFixed(2), MARGIN + PAGE_WIDTH - 55, ptY + 1, { width: 60, align: "right" });
    doc.y = ptY + 22;

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. JAHRESBERICHT
// ═══════════════════════════════════════════════════════════════════════════════

export interface YearlyReportData {
  restaurantName: string;
  address?: string;
  zip?: string;
  city?: string;
  phone?: string;
  vatNumber?: string;
  reportId: number;
  reportNumber: string;
  year: number;
  generatedAt: Date;

  categoryBlocks: {
    blockTitle: string;
    rows: { category: string; quantity: number; brutto: number; mwst: number; netto: number; pct: number }[];
    total: { quantity: number; brutto: number; mwst: number; netto: number };
  }[];

  grandTotal: { quantity: number; brutto: number; mwst: number; netto: number };

  // Monatsweise Übersicht
  monthlyOverview: {
    month: number;
    monthName: string;
    brutto: number;
    mwst: number;
    netto: number;
    orders: number;
  }[];
}

export function generateYearlyReportPdf(data: YearlyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: 40, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Jahresbericht: ${data.year}`,
      reportId: String(data.reportId).padStart(8, "0"),
      reportNumber: data.reportNumber,
      generatedAt: data.generatedAt,
    });

    // Monatsübersicht
    drawSectionHeader(doc, "Monatliche Übersicht");
    drawTableHeader(doc, [
      { text: "Monat", x: MARGIN, width: 100 },
      { text: "Bestellungen", x: MARGIN + 105, width: 70, align: "right" },
      { text: "Brutto", x: MARGIN + 180, width: 90, align: "right" },
      { text: "MwSt", x: MARGIN + 275, width: 80, align: "right" },
      { text: "Netto", x: MARGIN + PAGE_WIDTH - 80, width: 85, align: "right" },
    ]);

    for (let i = 0; i < data.monthlyOverview.length; i++) {
      const m = data.monthlyOverview[i];
      drawTableRow(doc, [
        { text: m.monthName, x: MARGIN, width: 100 },
        { text: String(m.orders), x: MARGIN + 105, width: 70, align: "right" },
        { text: `CHF ${m.brutto.toFixed(2)}`, x: MARGIN + 180, width: 90, align: "right" },
        { text: `CHF ${m.mwst.toFixed(2)}`, x: MARGIN + 275, width: 80, align: "right" },
        { text: `CHF ${m.netto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 80, width: 85, align: "right" },
      ], i % 2 === 0 ? undefined : COLORS.lightGray);
    }

    // Jahresgesamtsumme
    const gt = data.grandTotal;
    const gtY = doc.y;
    doc.rect(MARGIN, gtY - 2, PAGE_WIDTH, 20).fill(COLORS.dark);
    doc.fontSize(9).font("Helvetica-Bold").fillColor(COLORS.white)
      .text(`Jahrestotal ${data.year}`, MARGIN + 4, gtY + 2, { width: PAGE_WIDTH * 0.4 })
      .text(`CHF ${gt.brutto.toFixed(2)}`, MARGIN + 180, gtY + 2, { width: 90, align: "right" })
      .text(`CHF ${gt.mwst.toFixed(2)}`, MARGIN + 275, gtY + 2, { width: 80, align: "right" })
      .text(`CHF ${gt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 80, gtY + 2, { width: 85, align: "right" });
    doc.y = gtY + 24;

    // Kategorie-Blöcke
    doc.addPage();
    drawReportHeader(doc, {
      restaurantName: data.restaurantName,
      address: data.address ?? "",
      zip: data.zip,
      city: data.city,
      phone: data.phone,
      vatNumber: data.vatNumber,
      reportTitle: `Jahresbericht: ${data.year} — Kategoriendetail`,
      reportId: String(data.reportId).padStart(8, "0"),
      reportNumber: data.reportNumber,
      generatedAt: data.generatedAt,
    });

    for (const block of data.categoryBlocks) {
      drawSectionHeader(doc, block.blockTitle);
      drawTableHeader(doc, [
        { text: "Stk.", x: MARGIN, width: 50 },
        { text: "Hauptkategorien", x: MARGIN + 55, width: PAGE_WIDTH - 210 },
        { text: "Brutto", x: MARGIN + PAGE_WIDTH - 150, width: 55, align: "right" },
        { text: "MWST 8.10%", x: MARGIN + PAGE_WIDTH - 90, width: 50, align: "right" },
        { text: "Netto", x: MARGIN + PAGE_WIDTH - 35, width: 45, align: "right" },
        { text: "%-Anteil", x: MARGIN + PAGE_WIDTH + 15, width: 40, align: "right" },
      ]);

      for (let i = 0; i < block.rows.length; i++) {
        const row = block.rows[i];
        drawTableRow(doc, [
          { text: `${row.quantity} X`, x: MARGIN, width: 50 },
          { text: row.category, x: MARGIN + 55, width: PAGE_WIDTH - 210 },
          { text: `CHF ${row.brutto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 150, width: 55, align: "right" },
          { text: `CHF ${row.mwst.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 90, width: 50, align: "right" },
          { text: `CHF ${row.netto.toFixed(2)}`, x: MARGIN + PAGE_WIDTH - 35, width: 45, align: "right" },
          { text: `${row.pct.toFixed(2)} %`, x: MARGIN + PAGE_WIDTH + 15, width: 40, align: "right" },
        ], i % 2 === 0 ? undefined : COLORS.lightGray);
      }

      const bt = block.total;
      const sumY = doc.y;
      doc.rect(MARGIN, sumY - 2, PAGE_WIDTH, 16).fill(COLORS.lightGray);
      doc.fontSize(8).font("Helvetica-Bold").fillColor(COLORS.dark)
        .text(`${bt.quantity} X`, MARGIN + 2, sumY, { width: 50 })
        .text(`CHF ${bt.brutto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 150, sumY, { width: 55, align: "right" })
        .text(`CHF ${bt.mwst.toFixed(2)}`, MARGIN + PAGE_WIDTH - 90, sumY, { width: 50, align: "right" })
        .text(`CHF ${bt.netto.toFixed(2)}`, MARGIN + PAGE_WIDTH - 35, sumY, { width: 45, align: "right" })
        .text("100 %", MARGIN + PAGE_WIDTH + 15, sumY, { width: 40, align: "right" });
      doc.y = sumY + 18;
      doc.moveDown(0.5);
    }

    // Revisionsvermerk
    doc.moveDown(1);
    doc.rect(MARGIN, doc.y, PAGE_WIDTH, 28).fill(COLORS.lightGray);
    const rvY = doc.y + 4;
    doc.fontSize(7).font("Helvetica").fillColor(COLORS.gray)
      .text(`Jahresbericht ${data.year} — Erstellt: ${formatDate(data.generatedAt, "datetime")} | SimplaPOS`, MARGIN + 6, rvY, { width: PAGE_WIDTH - 12 })
      .text("Aufbewahrungspflichtig gemäss OR Art. 958f (10 Jahre). Unveränderlich nach Jahresabschluss.", MARGIN + 6, rvY + 10, { width: PAGE_WIDTH - 12 });
    doc.y = rvY + 32;

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, i + 1, range.count);
    }

    doc.end();
  });
}
