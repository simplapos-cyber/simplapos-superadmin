import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, getRestaurantById } from "./db";
import {
  invoices,
  invoiceItems,
  mandates,
  paymentReminders,
  paymentConfirmations,
  dunningConfig,
  orders,
  orderItems,
  recurringInvoices,
  debtors,
  invoicePayments,
  billSplitItems,
} from "../drizzle/schema";
import { eq, and, desc, asc, isNull, or, sql, like } from "drizzle-orm";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function generateInvoiceNumber(restaurantId: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RE-${year}${month}-${restaurantId}-${rand}`;
}

function generateMandateNumber(restaurantId: number): string {
  const now = new Date();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `DA-${now.getFullYear()}-${restaurantId}-${rand}`;
}

function generateQrReference(invoiceId: number): string {
  // Schweizer QR-Referenz: 26 Ziffern + Prüfziffer (Modulo 10 rekursiv)
  const base = String(invoiceId).padStart(26, "0");
  const digits = base.split("").map(Number);
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const d of digits) {
    carry = table[(carry + d) % 10];
  }
  const checkDigit = (10 - carry) % 10;
  return base + String(checkDigit);
}

function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").toUpperCase();
}

function calcNextDate(from: Date, interval: string): Date {
  const d = new Date(from);
  switch (interval) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

// ─── Schweizer QR-Rechnung PDF generieren ───────────────────────────────────

async function generateSwissQrPdf(invoice: {
  invoiceNumber: string;
  recipientName: string;
  recipientAddress: string;
  creditorName: string;
  creditorAddress: string;
  iban: string;
  qrReference: string;
  totalAmount: string;
  currency: string;
  dueDate: Date | null;
  additionalInfo: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; totalPrice: number }>;
  issueDate: Date;
  restaurantId: number;
  invoiceId: number;
  signatureUrl?: string;
  signatureLat?: string | null;
  signatureLng?: string | null;
  signatureAddress?: string | null;
  signatureTimestamp?: Date | null;
}): Promise<{ pdfBuffer: Buffer; pdfKey: string; pdfUrl: string }> {
    // Schweizer QR-Rechnung: SVG via swissqrbill generieren
  let qrSvg = "";
  try {
    const { SwissQRBill } = await import("swissqrbill/svg");
    const data = {
      currency: invoice.currency as "CHF" | "EUR",
      amount: parseFloat(invoice.totalAmount),
      creditor: {
        name: invoice.creditorName,
        address: invoice.creditorAddress.split("\n")[0] || "",
        zip: invoice.creditorAddress.split("\n")[1]?.split(" ")[0] || "0000",
        city: invoice.creditorAddress.split("\n")[1]?.split(" ").slice(1).join(" ") || "",
        country: "CH",
        account: formatIban(invoice.iban),
      },
      debtor: {
        name: invoice.recipientName,
        address: invoice.recipientAddress.split("\n")[0] || "",
        zip: invoice.recipientAddress.split("\n")[1]?.split(" ")[0] || "0000",
        city: invoice.recipientAddress.split("\n")[1]?.split(" ").slice(1).join(" ") || "",
        country: "CH",
      },
      reference: invoice.qrReference,
      message: invoice.additionalInfo || invoice.invoiceNumber,
    };
    const bill = new SwissQRBill(data);
    qrSvg = bill.toString();
  } catch {
    qrSvg = `<svg width="210" height="105" xmlns="http://www.w3.org/2000/svg"><rect width="210" height="105" fill="#f5f5f5"/><text x="105" y="55" text-anchor="middle" font-size="10">QR-Code</text></svg>`;
  }

  const lineItemsHtml = invoice.lineItems.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9f9f9'}">
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${item.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">CHF ${Number(item.unitPrice).toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${Number(item.taxRate).toFixed(1)}%</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:500">CHF ${Number(item.totalPrice).toFixed(2)}</td>
    </tr>
  `).join("");

  const subtotal = invoice.lineItems.reduce((s, i) => s + Number(i.totalPrice), 0);
  const taxTotal = invoice.lineItems.reduce((s, i) => s + (Number(i.totalPrice) * Number(i.taxRate) / (100 + Number(i.taxRate))), 0);
  const total = parseFloat(invoice.totalAmount);

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 20mm 20mm 10mm 20mm; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .company-name { font-size: 20px; font-weight: bold; color: #1a1a2e; }
  .invoice-title { font-size: 24px; font-weight: bold; color: #e63946; margin: 20px 0 10px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
  .meta-box { background: #f8f9fa; border-left: 3px solid #e63946; padding: 12px; border-radius: 4px; }
  .meta-box h4 { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.5px; }
  .meta-box p { font-size: 11px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  thead th { background: #1a1a2e; color: #fff; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
  thead th:last-child, thead th:nth-child(2), thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
  .totals { margin-left: auto; width: 280px; margin-top: 10px; }
  .totals tr td { padding: 4px 8px; }
  .totals tr.total td { font-weight: bold; font-size: 13px; border-top: 2px solid #1a1a2e; padding-top: 8px; }
  .payment-info { background: #f0f4ff; border: 1px solid #c5d5ff; border-radius: 6px; padding: 14px; margin: 20px 0; }
  .payment-info h4 { font-size: 10px; text-transform: uppercase; color: #4a6cf7; margin-bottom: 8px; }
  .iban { font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
  .qr-section { border-top: 2px dashed #ccc; margin-top: 30px; padding-top: 15px; }
  .qr-section h4 { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 10px; }
  .qr-layout { display: flex; gap: 20px; align-items: flex-start; }
  .qr-svg { flex-shrink: 0; }
  .qr-details { font-size: 10px; line-height: 1.6; }
  .qr-details strong { display: block; font-size: 9px; text-transform: uppercase; color: #888; margin-top: 6px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: bold; }
  .badge-due { background: #fff3cd; color: #856404; }
  .footer { margin-top: 20px; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 10px; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">${invoice.creditorName}</div>
      <div style="font-size:10px;color:#666;margin-top:4px">${invoice.creditorAddress.replace(/\n/g, " · ")}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:#888">Rechnungsnummer</div>
      <div style="font-size:14px;font-weight:bold;color:#1a1a2e">${invoice.invoiceNumber}</div>
      <div style="font-size:10px;color:#888;margin-top:4px">Datum: ${invoice.issueDate.toLocaleDateString("de-CH")}</div>
      ${invoice.dueDate ? `<div class="badge badge-due" style="margin-top:4px">Fällig: ${invoice.dueDate.toLocaleDateString("de-CH")}</div>` : ""}
    </div>
  </div>

  <div class="invoice-title">RECHNUNG</div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Rechnungsempfänger</h4>
      <p><strong>${invoice.recipientName}</strong><br>${invoice.recipientAddress.replace(/\n/g, "<br>")}</p>
    </div>
    <div class="meta-box">
      <h4>Zahlungsdetails</h4>
      <p>
        Währung: <strong>${invoice.currency}</strong><br>
        ${invoice.dueDate ? `Zahlungsfrist: <strong>${invoice.dueDate.toLocaleDateString("de-CH")}</strong>` : ""}
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Beschreibung</th>
        <th>Menge</th>
        <th>Einzelpreis</th>
        <th>MWST</th>
        <th>Betrag</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr><td style="color:#666">Subtotal (exkl. MWST)</td><td style="text-align:right">CHF ${(subtotal - taxTotal).toFixed(2)}</td></tr>
    <tr><td style="color:#666">MWST</td><td style="text-align:right">CHF ${taxTotal.toFixed(2)}</td></tr>
    <tr class="total"><td>Gesamtbetrag</td><td style="text-align:right;color:#e63946">CHF ${total.toFixed(2)}</td></tr>
  </table>

  <div class="payment-info">
    <h4>Zahlungsinformationen</h4>
    <div>IBAN: <span class="iban">${formatIban(invoice.iban)}</span></div>
    <div style="margin-top:4px">Zugunsten: ${invoice.creditorName}</div>
    ${invoice.qrReference ? `<div style="margin-top:4px">Referenz: <strong>${invoice.qrReference}</strong></div>` : ""}
    ${invoice.additionalInfo ? `<div style="margin-top:4px;color:#666">${invoice.additionalInfo}</div>` : ""}
  </div>

  <div class="qr-section">
    <h4>Schweizer QR-Rechnung (SIX-Standard)</h4>
    <div class="qr-layout">
      <div class="qr-svg">${qrSvg}</div>
      <div class="qr-details">
        <strong>Konto / Zahlbar an</strong>
        ${formatIban(invoice.iban)}<br>
        ${invoice.creditorName}<br>
        ${invoice.creditorAddress.replace(/\n/g, "<br>")}
        <strong>Zahlbar durch</strong>
        ${invoice.recipientName}<br>
        ${invoice.recipientAddress.replace(/\n/g, "<br>")}
        <strong>Betrag</strong>
        ${invoice.currency} ${total.toFixed(2)}
        ${invoice.qrReference ? `<strong>Referenz</strong>${invoice.qrReference}` : ""}
        ${invoice.additionalInfo ? `<strong>Zusätzliche Informationen</strong>${invoice.additionalInfo}` : ""}
      </div>
    </div>
  </div>

  ${invoice.signatureUrl ? `
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee">
    <p style="font-size:10px;color:#888;margin-bottom:6px">Unterschrift des Rechnungsempfängers</p>
    <img src="${invoice.signatureUrl}" alt="Unterschrift" style="max-height:80px;max-width:300px;border:1px solid #ddd;border-radius:4px;padding:4px;background:#fff" />
    <div style="margin-top:8px;font-size:9px;color:#666;line-height:1.6">
      ${invoice.signatureTimestamp ? `<div>🕐 Zeitstempel: <strong>${invoice.signatureTimestamp.toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}</strong> (Schweizer Zeit)</div>` : ''}
      ${(invoice.signatureLat && invoice.signatureLng) ? `<div>📍 GPS-Koordinaten: <strong>${parseFloat(invoice.signatureLat).toFixed(6)}, ${parseFloat(invoice.signatureLng).toFixed(6)}</strong> · <a href="https://www.google.com/maps?q=${invoice.signatureLat},${invoice.signatureLng}" style="color:#4a6cf7">Karte</a></div>` : ''}
      ${invoice.signatureAddress ? `<div>🏠 Standort: ${invoice.signatureAddress}</div>` : ''}
    </div>
  </div>` : ""}
  <div class="footer">
    ${invoice.signatureUrl ? "Rechnung mit digitaler Unterschrift des Empfängers bestätigt." : "Diese Rechnung wurde elektronisch erstellt und ist ohne Unterschrift gültig."} · ${invoice.creditorName}
  </div>
</div>
</body>
</html>`;

  // HTML zu PDF via weasyprint (bereits installiert)
  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const tmpHtml = `/tmp/invoice_${invoice.invoiceId}_${Date.now()}.html`;
  const tmpPdf = `/tmp/invoice_${invoice.invoiceId}_${Date.now()}.pdf`;
  
  writeFileSync(tmpHtml, html, "utf-8");
  
  try {
    execSync(`manus-md-to-pdf ${tmpHtml} ${tmpPdf} 2>/dev/null || weasyprint ${tmpHtml} ${tmpPdf} 2>/dev/null || python3 -c "
import subprocess
subprocess.run(['weasyprint', '${tmpHtml}', '${tmpPdf}'])
"`, { timeout: 30000 });
  } catch {
    // Fallback: HTML als PDF-ähnliches Dokument speichern
    writeFileSync(tmpPdf, html, "utf-8");
  }
  
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readFileSync(tmpPdf);
  } catch {
    pdfBuffer = Buffer.from(html, "utf-8");
  }
  
  try { unlinkSync(tmpHtml); } catch {}
  try { unlinkSync(tmpPdf); } catch {}
  
  const pdfKey = `invoices/${invoice.restaurantId}/${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;
  const { key, url } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
  
  return { pdfBuffer, pdfKey: key, pdfUrl: url };
}

// ─── E-Mail senden (via Nodemailer / SMTP) ───────────────────────────────────

async function sendInvoiceEmail(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}): Promise<boolean> {
  try {
    const nodemailer = await import("nodemailer");
    // Nutze SMTP-Env-Variablen falls vorhanden, sonst ethereal (Test)
    let transporter: import("nodemailer").Transporter;
    
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Ethereal Test-Account
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    }

    const mailOptions: import("nodemailer").SendMailOptions = {
      from: process.env.SMTP_FROM || `"SimplaPos" <noreply@simplapos.ch>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    };

    if (opts.pdfBuffer && opts.pdfFilename) {
      mailOptions.attachments = [{
        filename: opts.pdfFilename,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      }];
    }

    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("[invoicingRouter] E-Mail-Fehler:", err);
    return false;
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const invoicingRouter = router({
  // ── Rechnungen: Liste ──────────────────────────────────────────────────────
  listInvoices: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      status: z.string().optional(),
      searchQuery: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(invoices.restaurantId, input.restaurantId)];
      if (input.status) {
        conditions.push(eq(invoices.status, input.status as any));
      }
      if (input.searchQuery && input.searchQuery.trim()) {
        const q = `%${input.searchQuery.trim()}%`;
        conditions.push(
          or(
            like(invoices.invoiceNumber, q),
            like(invoices.recipientName, q),
            like(invoices.recipientEmail, q),
          ) as any
        );
      }
      const rows = await db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // ── Rechnung: Detail ───────────────────────────────────────────────────────
  getInvoice: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.restaurantId, input.restaurantId)));
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id))
        .orderBy(asc(invoiceItems.sortOrder));
      const reminders = await db
        .select()
        .from(paymentReminders)
        .where(eq(paymentReminders.invoiceId, input.id))
        .orderBy(asc(paymentReminders.level));
      const confirmations = await db
        .select()
        .from(paymentConfirmations)
        .where(eq(paymentConfirmations.invoiceId, input.id))
        .orderBy(desc(paymentConfirmations.paymentDate));
      return { invoice, items, reminders, confirmations };
    }),

  // ── Rechnung erstellen ─────────────────────────────────────────────────────
  createInvoice: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      mandateId: z.number().optional(),
      recipientName: z.string().min(1),
      recipientEmail: z.string().email().optional(),
      recipientAddress: z.string().optional(),
      creditorName: z.string().min(1),
      creditorAddress: z.string().min(1),
      iban: z.string().min(15),
      additionalInfo: z.string().max(140).optional(),
      dueDate: z.string().optional(),
      discountPercent: z.number().min(0).max(100).default(0),
      discountDays: z.number().min(0).default(0),
      internalNotes: z.string().optional(),
      items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().default("Stück"),
        unitPrice: z.number(),
        taxRate: z.number().min(0).max(100).default(8.1),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Beträge berechnen
      const lineItems = input.items.map((item: { description: string; quantity: number; unit: string; unitPrice: number; taxRate: number }) => {
        const net = item.quantity * item.unitPrice;
        const tax = net * (item.taxRate / 100);
        return { ...item, taxAmount: tax, totalPrice: net + tax };
      });
      const subtotal = lineItems.reduce((s, i) => s + i.totalPrice, 0);
      const taxTotal = lineItems.reduce((s, i) => s + i.taxAmount, 0);
      const discountAmount = subtotal * (input.discountPercent / 100);
      const total = subtotal - discountAmount;

      const invoiceNumber = generateInvoiceNumber(input.restaurantId);
      const issueDate = new Date();
      const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 30 * 86400000);

      // Rechnung einfügen
      const [result] = await db.insert(invoices).values({
        restaurantId: input.restaurantId,
        mandateId: input.mandateId,
        invoiceNumber,
        status: "draft",
        amount: String((subtotal - taxTotal - discountAmount).toFixed(2)),
        taxAmount: String(taxTotal.toFixed(2)),
        taxRate: String(lineItems[0]?.taxRate ?? 8.1),
        totalAmount: String(total.toFixed(2)),
        paidAmount: "0.00",
        currency: "CHF",
        discountPercent: String(input.discountPercent),
        discountDays: input.discountDays,
        discountAmount: String(discountAmount.toFixed(2)),
        issueDate,
        dueDate,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        recipientAddress: input.recipientAddress || "",
        creditorName: input.creditorName,
        creditorAddress: input.creditorAddress,
        iban: formatIban(input.iban),
        additionalInfo: input.additionalInfo,
        description: lineItems.map(i => i.description).join(", "),
        lineItems: lineItems as any,
        internalNotes: input.internalNotes,
      });

      const invoiceId = (result as any).insertId as number;

      // QR-Referenz generieren und speichern
      const qrReference = generateQrReference(invoiceId);
      await db.update(invoices).set({ qrReference }).where(eq(invoices.id, invoiceId));

      // Positionen einfügen
      await db.insert(invoiceItems).values(
        lineItems.map((item, idx) => ({
          invoiceId,
          restaurantId: input.restaurantId,
          description: item.description,
          quantity: String(item.quantity),
          unit: item.unit,
          unitPrice: String(item.unitPrice),
          taxRate: String(item.taxRate),
          taxAmount: String(item.taxAmount.toFixed(2)),
          totalPrice: String(item.totalPrice.toFixed(2)),
          sortOrder: idx,
        }))
      );

      // Owner-Benachrichtigung
      await notifyOwner({
        title: `Neue Rechnung ${invoiceNumber}`,
        content: `Rechnung ${invoiceNumber} wurde manuell erstellt. Empfänger: ${input.recipientName || "Unbekannt"}, Betrag: CHF ${total.toFixed(2)}.`,
      }).catch(() => {});

      return { invoiceId, invoiceNumber, qrReference };
    }),

  // ── Rechnung: PDF generieren und senden ────────────────────────────────────
  generateAndSendInvoice: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      sendEmail: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.invoiceId)).orderBy(asc(invoiceItems.sortOrder));

      const { pdfBuffer, pdfKey, pdfUrl } = await generateSwissQrPdf({
        invoiceNumber: invoice.invoiceNumber || "",
        recipientName: invoice.recipientName || "",
        recipientAddress: invoice.recipientAddress || "",
        creditorName: invoice.creditorName || "",
        creditorAddress: invoice.creditorAddress || "",
        iban: invoice.iban || "",
        qrReference: invoice.qrReference || "",
        totalAmount: invoice.totalAmount,
        currency: invoice.currency || "CHF",
        dueDate: invoice.dueDate,
        additionalInfo: invoice.additionalInfo || "",
        lineItems: items.map((i: typeof items[0]) => ({
          description: i.description,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          taxRate: parseFloat(i.taxRate || "8.1"),
          totalPrice: parseFloat(i.totalPrice),
        })),
                issueDate: invoice.issueDate,
        restaurantId: input.restaurantId,
        invoiceId: input.invoiceId,
        signatureUrl: (invoice as any).signatureUrl || undefined,
        signatureLat: (invoice as any).signatureLat,
        signatureLng: (invoice as any).signatureLng,
        signatureAddress: (invoice as any).signatureAddress,
        signatureTimestamp: (invoice as any).signatureTimestamp,
      });
      // PDF-URL speichern und Status auf "sent" setzen
      const updateData: Partial<typeof invoice> = {
        pdfUrl,
        pdfKey,
        status: "sent",
        sentAt: new Date(),
      };
      await db.update(invoices).set(updateData as any).where(eq(invoices.id, input.invoiceId));

      // E-Mail senden
      let emailSent = false;
      if (input.sendEmail && invoice.recipientEmail) {
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#1a1a2e">Ihre Rechnung ${invoice.invoiceNumber}</h2>
            <p>Sehr geehrte/r ${invoice.recipientName},</p>
            <p>Im Anhang finden Sie Ihre Rechnung <strong>${invoice.invoiceNumber}</strong> über <strong>CHF ${parseFloat(invoice.totalAmount).toFixed(2)}</strong>.</p>
            ${invoice.dueDate ? `<p>Bitte begleichen Sie den Betrag bis zum <strong>${new Date(invoice.dueDate).toLocaleDateString("de-CH")}</strong>.</p>` : ""}
            <p>IBAN: <strong>${invoice.iban}</strong></p>
            ${invoice.qrReference ? `<p>Referenz: <strong>${invoice.qrReference}</strong></p>` : ""}
            <p style="color:#888;font-size:12px;margin-top:20px">Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
            <p style="color:#888;font-size:12px">${invoice.creditorName}</p>
          </div>
        `;
        emailSent = await sendInvoiceEmail({
          to: invoice.recipientEmail,
          subject: `Rechnung ${invoice.invoiceNumber} – CHF ${parseFloat(invoice.totalAmount).toFixed(2)}`,
          html: emailHtml,
          pdfBuffer,
          pdfFilename: `Rechnung_${invoice.invoiceNumber}.pdf`,
        });
      }

      return { pdfUrl, emailSent };
    }),

  // ── Rechnung: PDF als URL abrufen (on-demand) ───────────────────────────────
  getInvoicePdf: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      // Falls PDF bereits generiert, URL zurückgeben
      if (invoice.pdfUrl) {
        return { pdfUrl: invoice.pdfUrl, alreadyGenerated: true };
      }
      // Sonst PDF on-the-fly generieren (ohne Status zu ändern)
      const items = await db.select().from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.invoiceId))
        .orderBy(asc(invoiceItems.sortOrder));
      const { pdfUrl } = await generateSwissQrPdf({
        invoiceNumber: invoice.invoiceNumber || "",
        recipientName: invoice.recipientName || "",
        recipientAddress: invoice.recipientAddress || "",
        creditorName: invoice.creditorName || "",
        creditorAddress: invoice.creditorAddress || "",
        iban: invoice.iban || "",
        qrReference: invoice.qrReference || "",
        totalAmount: invoice.totalAmount,
        currency: invoice.currency || "CHF",
        dueDate: invoice.dueDate,
        additionalInfo: invoice.additionalInfo || "",
        lineItems: items.map((i: typeof items[0]) => ({
          description: i.description,
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unitPrice),
          taxRate: parseFloat(i.taxRate || "8.1"),
          totalPrice: parseFloat(i.totalPrice),
        })),
        issueDate: invoice.issueDate,
        restaurantId: input.restaurantId,
        invoiceId: input.invoiceId,
        signatureUrl: (invoice as any).signatureUrl || undefined,
        signatureLat: (invoice as any).signatureLat,
        signatureLng: (invoice as any).signatureLng,
        signatureAddress: (invoice as any).signatureAddress,
        signatureTimestamp: (invoice as any).signatureTimestamp,
      });
      // PDF-URL speichern für zukünftige Aufrufe
      await db.update(invoices).set({ pdfUrl } as any).where(eq(invoices.id, input.invoiceId));
      return { pdfUrl, alreadyGenerated: false };
    }),

  // ── Zahlungserinnerung senden ──────────────────────────────────────────────
  sendReminder: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      fee: z.number().default(0),
      newDueDays: z.number().default(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      const existingReminders = await db.select().from(paymentReminders).where(eq(paymentReminders.invoiceId, input.invoiceId));
      const level = existingReminders.length + 1;
      const newDueDate = new Date(Date.now() + input.newDueDays * 86400000);

      const levelLabels: Record<number, string> = {
        1: "Zahlungserinnerung",
        2: "Erste Mahnung",
        3: "Zweite Mahnung (Letzte Aufforderung)",
      };
      const subject = `${levelLabels[level] || "Mahnung"}: Rechnung ${invoice.invoiceNumber}`;
      const totalWithFee = parseFloat(invoice.totalAmount) + input.fee - parseFloat(invoice.paidAmount || "0");

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:${level >= 2 ? "#e63946" : "#1a1a2e"}">${levelLabels[level] || "Mahnung"}</h2>
          <p>Sehr geehrte/r ${invoice.recipientName},</p>
          <p>Wir erlauben uns, Sie daran zu erinnern, dass folgende Rechnung noch offen ist:</p>
          <table style="width:100%;border-collapse:collapse;margin:15px 0">
            <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:bold">Rechnungsnummer</td><td style="padding:8px">${invoice.invoiceNumber}</td></tr>
            <tr><td style="padding:8px;font-weight:bold">Rechnungsbetrag</td><td style="padding:8px">CHF ${parseFloat(invoice.totalAmount).toFixed(2)}</td></tr>
            ${input.fee > 0 ? `<tr style="background:#fff3cd"><td style="padding:8px;font-weight:bold">Mahnspesen</td><td style="padding:8px">CHF ${input.fee.toFixed(2)}</td></tr>` : ""}
            <tr style="background:#e8f5e9"><td style="padding:8px;font-weight:bold">Zu bezahlen</td><td style="padding:8px;font-weight:bold;color:#2d6a4f">CHF ${totalWithFee.toFixed(2)}</td></tr>
            <tr><td style="padding:8px;font-weight:bold">Neue Zahlungsfrist</td><td style="padding:8px;color:#e63946"><strong>${newDueDate.toLocaleDateString("de-CH")}</strong></td></tr>
          </table>
          <p>IBAN: <strong>${invoice.iban}</strong></p>
          ${invoice.qrReference ? `<p>Referenz: <strong>${invoice.qrReference}</strong></p>` : ""}
          ${level >= 3 ? `<p style="color:#e63946;font-weight:bold">Bei Nichtbegleichung bis zum genannten Datum werden wir rechtliche Schritte einleiten.</p>` : ""}
          <p style="color:#888;font-size:12px;margin-top:20px">${invoice.creditorName}</p>
        </div>
      `;

      // Mahnung in DB speichern
      await db.insert(paymentReminders).values({
        invoiceId: input.invoiceId,
        restaurantId: input.restaurantId,
        level,
        sentTo: invoice.recipientEmail || "",
        fee: String(input.fee.toFixed(2)),
        newDueDate,
        emailSubject: subject,
        emailBody: emailHtml,
      });

      // Rechnung-Status aktualisieren
      const newStatus = level === 1 ? "reminded" : level === 2 ? "dunning1" : "dunning2";
      await db.update(invoices).set({
        status: newStatus as any,
        dunningLevel: level,
        dunningFee: String((parseFloat(invoice.dunningFee || "0") + input.fee).toFixed(2)),
        lastReminderAt: new Date(),
        dueDate: newDueDate,
      }).where(eq(invoices.id, input.invoiceId));

      // E-Mail senden
      let emailSent = false;
      if (invoice.recipientEmail) {
        emailSent = await sendInvoiceEmail({
          to: invoice.recipientEmail,
          subject,
          html: emailHtml,
        });
      }

      return { level, emailSent, newDueDate };
    }),

  // ── Zahlung bestätigen ─────────────────────────────────────────────────────
  confirmPayment: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      amount: z.number().positive(),
      paymentDate: z.string(),
      method: z.enum(["bank_transfer", "cash", "card", "twint", "other"]).default("bank_transfer"),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

      // Zahlung speichern
      await db.insert(paymentConfirmations).values({
        invoiceId: input.invoiceId,
        restaurantId: input.restaurantId,
        amount: String(input.amount.toFixed(2)),
        paymentDate: new Date(input.paymentDate),
        method: input.method,
        reference: input.reference,
        confirmedBy: ctx.user.id,
        notes: input.notes,
      });

      // Bezahlten Betrag aktualisieren
      const newPaidAmount = parseFloat(invoice.paidAmount || "0") + input.amount;
      const totalDue = parseFloat(invoice.totalAmount) + parseFloat(invoice.dunningFee || "0");
      const newStatus = newPaidAmount >= totalDue ? "paid" : "partial";

      await db.update(invoices).set({
        paidAmount: String(newPaidAmount.toFixed(2)),
        status: newStatus as any,
        paidAt: newStatus === "paid" ? new Date(input.paymentDate) : undefined,
      }).where(eq(invoices.id, input.invoiceId));

      // Bestätigungs-E-Mail an Empfänger
      if (newStatus === "paid" && invoice.recipientEmail) {
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#2d6a4f">✓ Zahlungsbestätigung</h2>
            <p>Sehr geehrte/r ${invoice.recipientName},</p>
            <p>Wir bestätigen den Eingang Ihrer Zahlung für Rechnung <strong>${invoice.invoiceNumber}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0">
              <tr style="background:#e8f5e9"><td style="padding:8px;font-weight:bold">Betrag</td><td style="padding:8px">CHF ${input.amount.toFixed(2)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">Datum</td><td style="padding:8px">${new Date(input.paymentDate).toLocaleDateString("de-CH")}</td></tr>
              <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:bold">Status</td><td style="padding:8px;color:#2d6a4f;font-weight:bold">Vollständig bezahlt</td></tr>
            </table>
            <p>Vielen Dank für Ihre Zahlung.</p>
            <p style="color:#888;font-size:12px;margin-top:20px">${invoice.creditorName}</p>
          </div>
        `;
        await sendInvoiceEmail({
          to: invoice.recipientEmail,
          subject: `Zahlungsbestätigung – Rechnung ${invoice.invoiceNumber}`,
          html: emailHtml,
        });
      }

      await notifyOwner({
        title: `Zahlung eingegangen: ${invoice.invoiceNumber}`,
        content: `CHF ${input.amount.toFixed(2)} via ${input.method} – Status: ${newStatus === "paid" ? "Vollständig bezahlt" : "Teilzahlung"}`,
      });

      return { newStatus, newPaidAmount };
    }),

  // ── Gutschrift erstellen ───────────────────────────────────────────────────
  createCreditNote: protectedProcedure
    .input(z.object({
      originalInvoiceId: z.number(),
      restaurantId: z.number(),
      amount: z.number().positive(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [original] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.originalInvoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!original) throw new TRPCError({ code: "NOT_FOUND" });

      const creditNumber = `GS-${original.invoiceNumber}`;
      const [result] = await db.insert(invoices).values({
        restaurantId: input.restaurantId,
        invoiceNumber: creditNumber,
        status: "sent" as any,
        amount: String((-input.amount).toFixed(2)),
        taxAmount: "0.00",
        totalAmount: String((-input.amount).toFixed(2)),
        paidAmount: "0.00",
        currency: "CHF",
        issueDate: new Date(),
        recipientName: original.recipientName,
        recipientEmail: original.recipientEmail,
        recipientAddress: original.recipientAddress,
        creditorName: original.creditorName,
        creditorAddress: original.creditorAddress,
        iban: original.iban,
        creditNoteForId: input.originalInvoiceId,
        description: `Gutschrift für ${original.invoiceNumber}: ${input.reason}`,
        lineItems: [{ description: `Gutschrift: ${input.reason}`, quantity: 1, unitPrice: -input.amount, taxRate: 0, totalPrice: -input.amount }] as any,
      });

      // Original-Rechnung als gutgeschrieben markieren
      await db.update(invoices).set({ status: "credited" as any }).where(eq(invoices.id, input.originalInvoiceId));

      return { creditNoteId: (result as any).insertId, creditNumber };
    }),

  // ── Mandate: Liste ─────────────────────────────────────────────────────────
  listMandates: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(mandates).where(eq(mandates.restaurantId, input.restaurantId)).orderBy(desc(mandates.createdAt));
    }),

  // ── Mandat erstellen ───────────────────────────────────────────────────────
  createMandate: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      recipientName: z.string().min(1),
      recipientEmail: z.string().email().optional(),
      recipientAddress: z.string().optional(),
      amount: z.number().positive(),
      taxRate: z.number().min(0).max(100).default(8.1),
      currency: z.string().default("CHF"),
      interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
      iban: z.string().min(15),
      creditorName: z.string().min(1),
      creditorAddress: z.string().min(1),
      startDate: z.string(),
      endDate: z.string().optional(),
      paymentDays: z.number().default(30),
      discountPercent: z.number().min(0).max(100).default(0),
      discountDays: z.number().default(0),
      description: z.string().optional(),
      items: z.array(z.object({
        description: z.string(),
        quantity: z.number().default(1),
        unitPrice: z.number(),
        taxRate: z.number().default(8.1),
      })).optional(),
      internalNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const mandateNumber = generateMandateNumber(input.restaurantId);
      const startDate = new Date(input.startDate);
      const nextInvoiceDate = startDate;

      const [result] = await db.insert(mandates).values({
        restaurantId: input.restaurantId,
        mandateNumber,
        status: "active",
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        recipientAddress: input.recipientAddress,
        amount: String(input.amount.toFixed(2)),
        taxRate: String(input.taxRate),
        currency: input.currency,
        interval: input.interval,
        iban: formatIban(input.iban),
        creditorName: input.creditorName,
        creditorAddress: input.creditorAddress,
        startDate,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        nextInvoiceDate,
        paymentDays: input.paymentDays,
        discountPercent: String(input.discountPercent),
        discountDays: input.discountDays,
        description: input.description,
        lineItems: input.items as any,
        internalNotes: input.internalNotes,
      });

      return { mandateId: (result as any).insertId, mandateNumber };
    }),

  // ── Mandat: Status ändern ──────────────────────────────────────────────────
  updateMandateStatus: protectedProcedure
    .input(z.object({
      mandateId: z.number(),
      restaurantId: z.number(),
      status: z.enum(["active", "paused", "cancelled", "expired"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(mandates).set({ status: input.status }).where(
        and(eq(mandates.id, input.mandateId), eq(mandates.restaurantId, input.restaurantId))
      );
      return { success: true };
    }),

  // ── Debitorenstatistiken ───────────────────────────────────────────────────
  getStats: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const allInvoices = await db.select().from(invoices).where(eq(invoices.restaurantId, input.restaurantId));

      type Inv = typeof allInvoices[0];
      const stats = {
        total: allInvoices.length,
        totalAmount: allInvoices.reduce((s: number, i: Inv) => s + parseFloat(i.totalAmount), 0),
        paidAmount: allInvoices.filter((i: Inv) => i.status === "paid").reduce((s: number, i: Inv) => s + parseFloat(i.totalAmount), 0),
        openAmount: allInvoices.filter((i: Inv) => !["paid", "cancelled", "credited"].includes(i.status)).reduce((s: number, i: Inv) => s + (parseFloat(i.totalAmount) - parseFloat(i.paidAmount || "0")), 0),
        overdueAmount: allInvoices.filter((i: Inv) => i.status === "overdue" || (i.dueDate && new Date(i.dueDate) < new Date() && !["paid", "cancelled", "credited"].includes(i.status))).reduce((s: number, i: Inv) => s + (parseFloat(i.totalAmount) - parseFloat(i.paidAmount || "0")), 0),
        byStatus: {
          draft: allInvoices.filter((i: Inv) => i.status === "draft").length,
          sent: allInvoices.filter((i: Inv) => i.status === "sent").length,
          reminded: allInvoices.filter((i: Inv) => i.status === "reminded").length,
          dunning: allInvoices.filter((i: Inv) => ["dunning1", "dunning2"].includes(i.status)).length,
          paid: allInvoices.filter((i: Inv) => i.status === "paid").length,
          overdue: allInvoices.filter((i: Inv) => i.status === "overdue").length,
          cancelled: allInvoices.filter((i: Inv) => i.status === "cancelled").length,
        },
        activeMandates: 0,
      };

      const mandateCount = await db.select({ count: sql<number>`count(*)` }).from(mandates).where(
        and(eq(mandates.restaurantId, input.restaurantId), eq(mandates.status, "active"))
      );
      stats.activeMandates = Number(mandateCount[0]?.count ?? 0);

      return stats;
    }),

  // ── Mahnspesen-Konfiguration abrufen ────────────────────────────────────────
  getDunningConfig: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(dunningConfig)
        .where(eq(dunningConfig.restaurantId, input.restaurantId))
        .limit(1);
      if (rows.length === 0) {
        return {
          id: null as number | null,
          restaurantId: input.restaurantId,
          graceDays: 3,
          dunning1Days: 7,
          dunning2Days: 14,
          dunning1Fee: "20.00",
          dunning2Fee: "40.00",
          interestRate: "5.00",
          currency: "CHF",
          autoEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return rows[0];
    }),

  // ── Mahnspesen-Konfiguration speichern ───────────────────────────────────────
  saveDunningConfig: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      graceDays: z.number().min(0).max(30).default(3),
      dunning1Days: z.number().min(1).max(90).default(7),
      dunning2Days: z.number().min(1).max(180).default(14),
      dunning1Fee: z.string().default("20.00"),
      dunning2Fee: z.string().default("40.00"),
      interestRate: z.string().optional().default("5.00"),
      currency: z.string().length(3).default("CHF"),
      autoEnabled: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db.select({ id: dunningConfig.id })
        .from(dunningConfig)
        .where(eq(dunningConfig.restaurantId, input.restaurantId))
        .limit(1);
      if (existing.length > 0) {
        await db.update(dunningConfig).set({
          graceDays: input.graceDays,
          dunning1Days: input.dunning1Days,
          dunning2Days: input.dunning2Days,
          dunning1Fee: input.dunning1Fee,
          dunning2Fee: input.dunning2Fee,
          interestRate: input.interestRate ?? "5.00",
          currency: input.currency,
          autoEnabled: input.autoEnabled,
        }).where(eq(dunningConfig.restaurantId, input.restaurantId));
      } else {
        await db.insert(dunningConfig).values({
          restaurantId: input.restaurantId,
          graceDays: input.graceDays,
          dunning1Days: input.dunning1Days,
          dunning2Days: input.dunning2Days,
          dunning1Fee: input.dunning1Fee,
          dunning2Fee: input.dunning2Fee,
          interestRate: input.interestRate ?? "5.00",
          currency: input.currency,
          autoEnabled: input.autoEnabled,
        });
      }
      return { success: true };
    }),

  // ── Aging-Report (Fälligkeitsstruktur) ──────────────────────────────────────
  getAgingReport: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const now = new Date();
      const openInvoices = await db.select().from(invoices)
        .where(and(
          eq(invoices.restaurantId, input.restaurantId),
          or(
            eq(invoices.status, "sent" as any),
            eq(invoices.status, "reminded" as any),
            eq(invoices.status, "dunning1" as any),
            eq(invoices.status, "dunning2" as any),
            eq(invoices.status, "overdue" as any),
            eq(invoices.status, "partial" as any),
          )
        ))
        .orderBy(asc(invoices.dueDate));

      type AgingEntry = {
        invoiceId: number;
        invoiceNumber: string;
        recipientName: string;
        recipientEmail: string | null;
        totalAmount: string;
        paidAmount: string;
        dunningFee: string;
        openAmount: number;
        dueDate: Date | null;
        daysOverdue: number;
        status: string;
        dunningLevel: number;
      };

      const buckets: Record<"current" | "days0_30" | "days31_60" | "days61_90" | "days90plus", AgingEntry[]> = {
        current: [],
        days0_30: [],
        days31_60: [],
        days61_90: [],
        days90plus: [],
      };

      for (const inv of openInvoices) {
        const openAmount = parseFloat(inv.totalAmount ?? "0") + parseFloat(inv.dunningFee ?? "0") - parseFloat(inv.paidAmount ?? "0");
        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        const daysOverdue = dueDate ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        const entry: AgingEntry = {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          recipientName: inv.recipientName,
          recipientEmail: inv.recipientEmail ?? null,
          totalAmount: inv.totalAmount ?? "0",
          paidAmount: inv.paidAmount ?? "0",
          dunningFee: inv.dunningFee ?? "0",
          openAmount,
          dueDate,
          daysOverdue,
          status: inv.status,
          dunningLevel: inv.dunningLevel ?? 0,
        };
        if (daysOverdue <= 0) buckets.current.push(entry);
        else if (daysOverdue <= 30) buckets.days0_30.push(entry);
        else if (daysOverdue <= 60) buckets.days31_60.push(entry);
        else if (daysOverdue <= 90) buckets.days61_90.push(entry);
        else buckets.days90plus.push(entry);
      }

      const sumBucket = (b: AgingEntry[]) => b.reduce((s, i) => s + i.openAmount, 0);
      return {
        buckets,
        summary: {
          totalOpen: sumBucket([...buckets.current, ...buckets.days0_30, ...buckets.days31_60, ...buckets.days61_90, ...buckets.days90plus]),
          currentTotal: sumBucket(buckets.current),
          days0_30Total: sumBucket(buckets.days0_30),
          days31_60Total: sumBucket(buckets.days31_60),
          days61_90Total: sumBucket(buckets.days61_90),
          days90plusTotal: sumBucket(buckets.days90plus),
          invoiceCount: openInvoices.length,
        },
        generatedAt: now,
      };
    }),

  // ── Rechnung stornieren ────────────────────────────────────────────────────
  // ── Rechnung aus Bestellung erstellen (Kauf auf Rechnung) ───────────────────
  createInvoiceFromOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      restaurantId: z.number(),
      splitId: z.number().optional(), // Wenn gesetzt: nur Artikel dieses Splits verwenden
      recipientName: z.string().min(1),
      recipientEmail: z.string().email().optional(),
      recipientAddress: z.string().optional(),
      dueDate: z.string().optional(),
      additionalInfo: z.string().max(140).optional(),
      internalNotes: z.string().optional(),
      discountPercent: z.number().min(0).max(100).default(0),
      signatureDataUrl: z.string().optional(), // base64 PNG der digitalen Unterschrift
      signatureLat: z.number().optional(),
      signatureLng: z.number().optional(),
      signatureAddress: z.string().max(512).optional(),
      signatureTimestamp: z.string().optional(), // ISO-8601
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [order] = await db.select().from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, input.restaurantId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Bestellung nicht gefunden" });

      let items = await db.select().from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Positionen in der Bestellung" });

      // Wenn splitId angegeben: nur die dem Split zugewiesenen Artikel verwenden
      if (input.splitId) {
        const splitAssignments = await db.select().from(billSplitItems)
          .where(eq(billSplitItems.splitId, input.splitId));
        if (splitAssignments.length > 0) {
          // Artikel nach Split-Zuweisung filtern und Mengen/Beträge aus Split übernehmen
          type SplitAssignment = { orderItemId: number; quantity: number; amount: string };
          const splitItemMap = new Map<number, SplitAssignment>(
            splitAssignments.map((a: SplitAssignment) => [a.orderItemId, a])
          );
          items = items
            .filter((i: typeof items[0]) => splitItemMap.has(i.id))
            .map((i: typeof items[0]) => {
              const assignment = splitItemMap.get(i.id) as SplitAssignment;
              return { ...i, quantity: assignment.quantity };
            });
        }
      }

      const restaurant = await getRestaurantById(input.restaurantId);
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

      const iban = (restaurant as any).invoiceIban || "";
      const creditorName = (restaurant as any).invoiceCreditorName || restaurant.name;
      const creditorAddress = (restaurant as any).invoiceCreditorAddress ||
        [restaurant.address, `${restaurant.zip || ""} ${restaurant.city || ""}`.trim()]
          .filter(Boolean).join("\n");

      if (!iban) throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Bitte zuerst die IBAN in den Einstellungen hinterlegen (Einstellungen → Rechnungs-Bankverbindung).",
      });

      const activeItems = items.filter((i: typeof items[0]) => i.status !== "cancelled");
      if (!activeItems.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Keine aktiven Positionen" });

      const lineItems = activeItems.map((i: typeof items[0]) => {
        const unitPrice = parseFloat(i.unitPrice);
        const qty = i.quantity;
        const taxRate = parseFloat(i.taxRate ?? "8.10");
        const net = qty * unitPrice;
        const taxAmount = net * (taxRate / 100);
        return { description: i.name, quantity: qty, unit: "Stk", unitPrice, taxRate, taxAmount, totalPrice: net + taxAmount };
      });

      const subtotal = lineItems.reduce((s: number, i: { totalPrice: number }) => s + i.totalPrice, 0);
      const taxTotal = lineItems.reduce((s: number, i: { taxAmount: number }) => s + i.taxAmount, 0);
      const discountAmount = subtotal * (input.discountPercent / 100);
      const total = subtotal - discountAmount;

      const invoiceNumber = generateInvoiceNumber(input.restaurantId);
      const issueDate = new Date();
      const dueDate = input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 30 * 86400000);

      const [result] = await db.insert(invoices).values({
        restaurantId: input.restaurantId,
        invoiceNumber,
        status: "sent" as any,
        amount: String((subtotal - taxTotal - discountAmount).toFixed(2)),
        taxAmount: String(taxTotal.toFixed(2)),
        taxRate: String(lineItems[0]?.taxRate ?? 8.1),
        totalAmount: String(total.toFixed(2)),
        paidAmount: "0.00",
        currency: "CHF",
        discountPercent: String(input.discountPercent),
        discountDays: 0,
        discountAmount: String(discountAmount.toFixed(2)),
        issueDate,
        dueDate,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        recipientAddress: input.recipientAddress || "",
        creditorName,
        creditorAddress,
        iban: formatIban(iban),
        additionalInfo: input.additionalInfo,
        description: lineItems.map((i: { description: string }) => i.description).join(", "),
        lineItems: lineItems as any,
        internalNotes: input.internalNotes,
      });
      const invoiceId = (result as any).insertId as number;
      const qrReference = generateQrReference(invoiceId);

      // Unterschrift als PNG in S3 speichern
      let signatureUrl: string | undefined;
      let signatureKey: string | undefined;
      if (input.signatureDataUrl) {
        try {
          const { storagePut } = await import("./storage");
          const base64Data = input.signatureDataUrl.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const key = `signatures/invoice-${invoiceId}-${Date.now()}.png`;
          const stored = await storagePut(key, buffer, "image/png");
          signatureUrl = stored.url;
          signatureKey = stored.key;
        } catch (e) {
          console.error("Unterschrift konnte nicht gespeichert werden:", e);
        }
      }

      const signatureTimestamp = input.signatureTimestamp ? new Date(input.signatureTimestamp) : undefined;
      await db.update(invoices).set({
        qrReference,
        signatureUrl,
        signatureKey,
        signatureLat: input.signatureLat !== undefined ? String(input.signatureLat) : undefined,
        signatureLng: input.signatureLng !== undefined ? String(input.signatureLng) : undefined,
        signatureAddress: input.signatureAddress,
        signatureTimestamp,
      }).where(eq(invoices.id, invoiceId));

      // Owner-Benachrichtigung
      await notifyOwner({
        title: `Neue Rechnung ${invoiceNumber} (Tisch-Checkout)`,
        content: `Rechnung ${invoiceNumber} wurde via Kauf-auf-Rechnung erstellt. Empfänger: ${input.recipientName}, Betrag: CHF ${total.toFixed(2)}.`,
      }).catch(() => {});

      // E-Mail an Debitor senden (falls E-Mail-Adresse vorhanden)
      let emailSent = false;
      if (input.recipientEmail) {
        try {
          // Rechnung aus DB laden für PDF-Generierung
          const [savedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
          if (savedInvoice) {
            const emailHtml = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
                <h2 style="color:#1a1a2e">Ihre Rechnung ${invoiceNumber}</h2>
                <p>Sehr geehrte/r ${input.recipientName},</p>
                <p>Im Anhang finden Sie Ihre Rechnung <strong>${invoiceNumber}</strong> über <strong>CHF ${total.toFixed(2)}</strong>.</p>
                ${dueDate ? `<p>Bitte begleichen Sie den Betrag bis zum <strong>${dueDate.toLocaleDateString("de-CH")}</strong>.</p>` : ""}
                <p>IBAN: <strong>${formatIban(iban)}</strong></p>
                ${qrReference ? `<p>Referenz: <strong>${qrReference}</strong></p>` : ""}
                <p style="color:#888;font-size:12px;margin-top:20px">Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
                <p style="color:#888;font-size:12px">${creditorName}</p>
              </div>
            `;
            emailSent = await sendInvoiceEmail({
              to: input.recipientEmail,
              subject: `Rechnung ${invoiceNumber} – CHF ${total.toFixed(2)}`,
              html: emailHtml,
            });
          }
        } catch (e) {
          console.error("[createInvoiceFromOrder] E-Mail-Fehler:", e);
        }
      }

      return { success: true, invoiceId, invoiceNumber, qrReference, emailSent };
    }),

  // ── Kellner: Als bezahlt markieren (vereinfachte Zahlungsbestätigung) ─────────
  markAsPaid: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      amount: z.number().positive().optional(),
      method: z.enum(["cash", "card", "twint", "bank_transfer", "other"]).default("cash"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const totalDue = parseFloat(invoice.totalAmount) + parseFloat(invoice.dunningFee || "0");
      const paidAmount = input.amount ?? totalDue;
      const today = new Date().toISOString().split("T")[0];
      // Zahlung in paymentConfirmations speichern
      await db.insert(paymentConfirmations).values({
        invoiceId: input.invoiceId,
        restaurantId: input.restaurantId,
        amount: String(paidAmount.toFixed(2)),
        paymentDate: new Date(),
        method: input.method as any,
        confirmedBy: ctx.user.id,
        notes: input.notes,
      });
      const newPaidAmount = parseFloat(invoice.paidAmount || "0") + paidAmount;
      const newStatus = newPaidAmount >= totalDue ? "paid" : "partial";
      await db.update(invoices).set({
        paidAmount: String(newPaidAmount.toFixed(2)),
        status: newStatus as any,
        paidAt: newStatus === "paid" ? new Date() : undefined,
      }).where(eq(invoices.id, input.invoiceId));
      // Zahlungsbestätigungs-E-Mail
      if (newStatus === "paid" && invoice.recipientEmail) {
        const emailHtml = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#2d6a4f">✓ Zahlungsbestätigung</h2>
            <p>Sehr geehrte/r ${invoice.recipientName},</p>
            <p>Wir bestätigen den Eingang Ihrer Zahlung für Rechnung <strong>${invoice.invoiceNumber}</strong>.</p>
            <table style="width:100%;border-collapse:collapse;margin:15px 0">
              <tr style="background:#e8f5e9"><td style="padding:8px;font-weight:bold">Betrag</td><td style="padding:8px">${invoice.currency || "CHF"} ${paidAmount.toFixed(2)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">Zahlungsart</td><td style="padding:8px">${input.method}</td></tr>
              <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:bold">Status</td><td style="padding:8px;color:#2d6a4f;font-weight:bold">Vollständig bezahlt</td></tr>
            </table>
            <p>Vielen Dank für Ihre Zahlung.</p>
            <p style="color:#888;font-size:12px;margin-top:20px">${invoice.creditorName}</p>
          </div>
        `;
        await sendInvoiceEmail({
          to: invoice.recipientEmail,
          subject: `Zahlungsbestätigung – Rechnung ${invoice.invoiceNumber}`,
          html: emailHtml,
        });
      }
      await notifyOwner({
        title: `Kellner-Zahlung: ${invoice.invoiceNumber}`,
        content: `${invoice.currency || "CHF"} ${paidAmount.toFixed(2)} via ${input.method} – ${newStatus === "paid" ? "Vollständig bezahlt" : "Teilzahlung"} (bestätigt von Kellner ID ${ctx.user.id})`,
      });
      return { success: true, newStatus, newPaidAmount };
    }),

  // ── Mahnungs-PDF abrufen oder on-demand generieren ──────────────────────────
  getDunningPdf: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      level: z.number().int().min(1).max(2).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId))
      );
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      // Mahnungen aus payment_reminders laden
      const reminders = await db.select().from(paymentReminders)
        .where(eq(paymentReminders.invoiceId, input.invoiceId))
        .orderBy(desc(paymentReminders.level));
      const targetLevel = input.level ?? (invoice.dunningLevel ?? 1);
      const reminder = reminders.find((r: typeof reminders[0]) => r.level === targetLevel) ?? reminders[0];
      // Falls PDF bereits in payment_reminders gespeichert, zurückgeben
      if (reminder?.pdfUrl) {
        return { pdfUrl: reminder.pdfUrl, alreadyGenerated: true, level: reminder.level };
      }
      // Sonst on-the-fly generieren
      const { generateDunningPdf } = await import("./dunningCron");
      const fee = parseFloat(reminder?.fee ?? "0");
      const totalDunningFee = parseFloat(invoice.dunningFee ?? "0");
      const newDueDate = reminder?.newDueDate ?? invoice.dueDate ?? new Date();
      const level = (targetLevel === 2 ? 2 : 1) as 1 | 2;
      const { pdfUrl } = await generateDunningPdf(
        {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          restaurantId: invoice.restaurantId,
          recipientName: invoice.recipientName,
          recipientEmail: invoice.recipientEmail,
          recipientAddress: invoice.recipientAddress,
          creditorName: invoice.creditorName,
          creditorAddress: invoice.creditorAddress,
          iban: invoice.iban,
          qrReference: invoice.qrReference,
          totalAmount: invoice.totalAmount,
          dunningFee: invoice.dunningFee,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          additionalInfo: invoice.additionalInfo,
          issueDate: invoice.issueDate,
        },
        level,
        fee,
        totalDunningFee,
        newDueDate
      );
      // PDF-URL in payment_reminders speichern
      if (reminder) {
        await db.update(paymentReminders).set({ pdfUrl } as any).where(eq(paymentReminders.id, reminder.id));
      }
      return { pdfUrl, alreadyGenerated: false, level };
    }),

  // ── Zahlungseingang erfassen ────────────────────────────────────────────────
  recordPayment: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      restaurantId: z.number(),
      amount: z.number().positive("Betrag muss positiv sein"),
      method: z.enum(["bank", "cash", "card", "twint", "other"]).default("bank"),
      paidAt: z.string().optional(),
      notes: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [invoice] = await db
        .select({ id: invoices.id, totalAmount: invoices.totalAmount, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId)));
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Rechnung nicht gefunden" });
      await db.insert(invoicePayments).values({
        invoiceId: input.invoiceId,
        restaurantId: input.restaurantId,
        amount: String(input.amount),
        method: input.method,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        notes: input.notes,
      } as any);
      const payments = await db
        .select({ amount: invoicePayments.amount })
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, input.invoiceId));
      const totalPaid = payments.reduce((s: number, p: { amount: string | null }) => s + parseFloat(p.amount || "0"), 0);
      const invoiceTotal = parseFloat(invoice.totalAmount || "0");
      if (totalPaid >= invoiceTotal) {
        if (invoice.status !== "paid") {
          await db.update(invoices)
            .set({ status: "paid" as any, paidAmount: String(totalPaid) })
            .where(eq(invoices.id, input.invoiceId));
        }
      } else if (totalPaid > 0 && !(["paid", "cancelled", "credited"] as string[]).includes(invoice.status ?? "")) {
        await db.update(invoices)
          .set({ status: "partial" as any, paidAmount: String(totalPaid) })
          .where(eq(invoices.id, input.invoiceId));
      }
      const remaining = Math.max(0, invoiceTotal - totalPaid);
      // E-Mail-Bestätigung bei Vollzahlung
      if (totalPaid >= invoiceTotal) {
        try {
          const [fullInvoice] = await db
            .select({ invoiceNumber: invoices.invoiceNumber, recipientEmail: invoices.recipientEmail, recipientName: invoices.recipientName, totalAmount: invoices.totalAmount })
            .from(invoices).where(eq(invoices.id, input.invoiceId));
          if (fullInvoice?.recipientEmail) {
            const methodLabels: Record<string, string> = { bank: "Banküberweisung", cash: "Bar", card: "Karte", twint: "TWINT", other: "Sonstige" };
            const methodLabel = methodLabels[input.method] ?? input.method;
            const paidDate = input.paidAt ? new Date(input.paidAt).toLocaleDateString("de-CH") : new Date().toLocaleDateString("de-CH");
            await sendInvoiceEmail({
              to: fullInvoice.recipientEmail,
              subject: `Zahlungsbestätigung – Rechnung ${fullInvoice.invoiceNumber ?? input.invoiceId}`,
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
                <h2 style="color:#1a7f4b">✓ Zahlung erhalten</h2>
                <p>Guten Tag${fullInvoice.recipientName ? " " + fullInvoice.recipientName : ""},</p>
                <p>wir bestätigen den Eingang Ihrer Zahlung für folgende Rechnung:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0">
                  <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Rechnungsnummer</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${fullInvoice.invoiceNumber ?? input.invoiceId}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Betrag</strong></td><td style="padding:8px;border:1px solid #e5e7eb">CHF ${parseFloat(fullInvoice.totalAmount || "0").toFixed(2)}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Zahlungsart</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${methodLabel}</td></tr>
                  <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Datum</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${paidDate}</td></tr>
                </table>
                <p>Vielen Dank für Ihre Zahlung.</p>
                <p style="color:#6b7280;font-size:12px">Diese E-Mail wurde automatisch generiert.</p>
              </div>`,
            });
          }
        } catch (e) { console.error("[recordPayment] E-Mail-Bestätigung fehlgeschlagen:", e); }
      }
      return { success: true, totalPaid: totalPaid.toFixed(2), isPaid: totalPaid >= invoiceTotal, remaining: remaining.toFixed(2) };
    }),

  getPaymentStats: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      period: z.enum(["today", "week", "month", "year"]).default("month"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const now = new Date();
      let fromDate: Date;
      if (input.period === "today") { fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
      else if (input.period === "week") { fromDate = new Date(now); fromDate.setDate(now.getDate() - 7); }
      else if (input.period === "month") { fromDate = new Date(now.getFullYear(), now.getMonth(), 1); }
      else { fromDate = new Date(now.getFullYear(), 0, 1); }
      const payments = await db
        .select({ method: invoicePayments.method, amount: invoicePayments.amount, paidAt: invoicePayments.paidAt })
        .from(invoicePayments)
        .where(and(eq(invoicePayments.restaurantId, input.restaurantId), sql`${invoicePayments.paidAt} >= ${fromDate}`));
      const byMethod: Record<string, number> = {};
      let totalAmount = 0;
      for (const p of payments) {
        const m = p.method ?? "other";
        byMethod[m] = (byMethod[m] ?? 0) + parseFloat(p.amount || "0");
        totalAmount += parseFloat(p.amount || "0");
      }
      const methodLabels: Record<string, string> = { bank: "Banküberweisung", cash: "Bar", card: "Karte", twint: "TWINT", other: "Sonstige" };
      const stats = Object.entries(byMethod).map(([method, amount]) => ({
        method, label: methodLabels[method] ?? method, amount: amount.toFixed(2), count: payments.filter((p: { method: string | null }) => (p.method ?? "other") === method).length,
      })).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
      return { stats, totalAmount: totalAmount.toFixed(2), count: payments.length, period: input.period };
    }),


  getPayments: protectedProcedure
    .input(z.object({ invoiceId: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const payments = await db
        .select()
        .from(invoicePayments)
        .where(and(
          eq(invoicePayments.invoiceId, input.invoiceId),
          eq(invoicePayments.restaurantId, input.restaurantId),
        ))
        .orderBy(desc(invoicePayments.paidAt));
      const total = payments.reduce((s: number, p: { amount: string | null }) => s + parseFloat(p.amount || "0"), 0);
      return { payments, totalPaid: total.toFixed(2) };
    }),

  cancelInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.number(), restaurantId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(invoices).set({
        status: "cancelled" as any,
        internalNotes: input.reason ? `Storniert: ${input.reason}` : "Storniert",
      }).where(and(eq(invoices.id, input.invoiceId), eq(invoices.restaurantId, input.restaurantId)));
      return { success: true };
    }),
});
