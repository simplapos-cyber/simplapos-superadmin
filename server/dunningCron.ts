import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { invoices, paymentReminders, dunningConfig } from "../drizzle/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { storagePut } from "./storage";
import type { Request, Response } from "express";

/**
 * Mahnwesen-Cron Handler – wird täglich um 07:00 UTC ausgeführt.
 *
 * Logik:
 * 1. Rechnungen mit Status "sent" die > 7 Tage überfällig sind → dunning1 + CHF 20 Mahngebühr
 * 2. Rechnungen mit Status "dunning1" die > 14 Tage nach 1. Mahnung noch offen → dunning2 + CHF 40 Mahngebühr
 * 3. E-Mail-Benachrichtigung an Empfänger (mit PDF-Anhang) + Owner-Benachrichtigung
 * 4. Mahnungs-PDF mit Schweizer QR-Code wird generiert und in S3 gespeichert
 */
export async function handleDunningCheck(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Datenbank nicht verfügbar" });
    }

    const now = new Date();
    const results = {
      dunning1Created: 0,
      dunning2Created: 0,
      overdueMarked: 0,
      emailsSent: 0,
      pdfsGenerated: 0,
      errors: [] as string[],
    };

    // ── Schritt 1: Offene Rechnungen auf "overdue" setzen ──────────────────
    try {
      const overdueResult = await db.execute(sql`
        UPDATE invoices
        SET status = 'overdue', updatedAt = NOW()
        WHERE status IN ('sent', 'reminded', 'partial')
          AND dueDate IS NOT NULL
          AND dueDate < NOW()
          AND (paidAmount IS NULL OR CAST(paidAmount AS DECIMAL(10,2)) < CAST(totalAmount AS DECIMAL(10,2)))
      `);
      results.overdueMarked = (overdueResult as any)[0]?.affectedRows ?? 0;
    } catch (err: any) {
      results.errors.push(`overdue: ${err.message}`);
    }

    // ── Schritt 2: Überfällige Rechnungen → dunning1 ──────────────────────
    try {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const overdueInvoices = await db.select().from(invoices).where(
        and(
          eq(invoices.status, "overdue" as any),
          lt(invoices.dueDate!, sevenDaysAgo),
        )
      ).limit(100);

      for (const inv of overdueInvoices) {
        try {
          const cfgRows = await db.select().from(dunningConfig)
            .where(eq(dunningConfig.restaurantId, inv.restaurantId)).limit(1);
          const cfg = cfgRows[0];
          const fee = parseFloat(cfg?.dunning1Fee ?? "20.00");
          const dunning2DaysFromNow = cfg?.dunning2Days ?? 14;
          const newDueDate = new Date(now.getTime() + dunning2DaysFromNow * 24 * 60 * 60 * 1000);
          const newDunningFee = parseFloat(inv.dunningFee || "0") + fee;

          await db.update(invoices).set({
            status: "dunning1" as any,
            dunningLevel: 1,
            dunningFee: String(newDunningFee.toFixed(2)),
            lastReminderAt: now,
            dueDate: newDueDate,
          }).where(eq(invoices.id, inv.id));

          // Mahnungs-PDF generieren
          let pdfUrl: string | undefined;
          let pdfBuffer: Buffer | undefined;
          try {
            const pdfResult = await generateDunningPdf(inv, 1, fee, newDunningFee, newDueDate);
            pdfUrl = pdfResult.pdfUrl;
            pdfBuffer = pdfResult.pdfBuffer;
            results.pdfsGenerated++;
          } catch (pdfErr: any) {
            results.errors.push(`dunning1-pdf inv#${inv.id}: ${pdfErr.message}`);
          }

          // Mahnung in payment_reminders protokollieren
          await db.insert(paymentReminders).values({
            invoiceId: inv.id,
            restaurantId: inv.restaurantId,
            level: 1,
            sentTo: inv.recipientEmail || "",
            fee: String(fee.toFixed(2)),
            newDueDate,
            emailSubject: `1. Mahnung – Rechnung ${inv.invoiceNumber}`,
            emailBody: buildDunningEmailHtml(inv, 1, fee, newDueDate),
            pdfUrl: pdfUrl || null,
          });

          // E-Mail senden (mit PDF-Anhang)
          if (inv.recipientEmail) {
            const sent = await sendDunningEmail(
              inv.recipientEmail,
              `1. Mahnung – Rechnung ${inv.invoiceNumber}`,
              buildDunningEmailHtml(inv, 1, fee, newDueDate),
              pdfBuffer,
              `Mahnung_1_${inv.invoiceNumber?.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`
            );
            if (sent) results.emailsSent++;
          }

          await notifyOwner({
            title: `1. Mahnung ausgestellt: ${inv.invoiceNumber}`,
            content: `Restaurant #${inv.restaurantId} – ${inv.recipientName} – CHF ${(parseFloat(inv.totalAmount) + newDunningFee).toFixed(2)} – Neue Fälligkeit: ${newDueDate.toLocaleDateString("de-CH")}`,
          });

          results.dunning1Created++;
        } catch (err: any) {
          results.errors.push(`dunning1 inv#${inv.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      results.errors.push(`dunning1-query: ${err.message}`);
    }

    // ── Schritt 3: dunning1 → dunning2 ────────────────────────────────────
    try {
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const dunning1Invoices = await db.select().from(invoices).where(
        and(
          eq(invoices.status, "dunning1" as any),
          lt(invoices.dueDate!, fourteenDaysAgo),
        )
      ).limit(100);

      for (const inv of dunning1Invoices) {
        try {
          const cfgRows2 = await db.select().from(dunningConfig)
            .where(eq(dunningConfig.restaurantId, inv.restaurantId)).limit(1);
          const cfg2 = cfgRows2[0];
          const fee = parseFloat(cfg2?.dunning2Fee ?? "40.00");
          const finalDaysFromNow = cfg2?.dunning2Days ?? 14;
          const newDueDate = new Date(now.getTime() + finalDaysFromNow * 24 * 60 * 60 * 1000);
          const newDunningFee = parseFloat(inv.dunningFee || "0") + fee;

          await db.update(invoices).set({
            status: "dunning2" as any,
            dunningLevel: 2,
            dunningFee: String(newDunningFee.toFixed(2)),
            lastReminderAt: now,
            dueDate: newDueDate,
          }).where(eq(invoices.id, inv.id));

          // Mahnungs-PDF generieren
          let pdfUrl: string | undefined;
          let pdfBuffer: Buffer | undefined;
          try {
            const pdfResult = await generateDunningPdf(inv, 2, fee, newDunningFee, newDueDate);
            pdfUrl = pdfResult.pdfUrl;
            pdfBuffer = pdfResult.pdfBuffer;
            results.pdfsGenerated++;
          } catch (pdfErr: any) {
            results.errors.push(`dunning2-pdf inv#${inv.id}: ${pdfErr.message}`);
          }

          // Mahnung in payment_reminders protokollieren
          await db.insert(paymentReminders).values({
            invoiceId: inv.id,
            restaurantId: inv.restaurantId,
            level: 2,
            sentTo: inv.recipientEmail || "",
            fee: String(fee.toFixed(2)),
            newDueDate,
            emailSubject: `2. Mahnung (letzte Warnung) – Rechnung ${inv.invoiceNumber}`,
            emailBody: buildDunningEmailHtml(inv, 2, fee, newDueDate),
            pdfUrl: pdfUrl || null,
          });

          // E-Mail senden (mit PDF-Anhang)
          if (inv.recipientEmail) {
            const sent = await sendDunningEmail(
              inv.recipientEmail,
              `2. Mahnung (letzte Warnung) – Rechnung ${inv.invoiceNumber}`,
              buildDunningEmailHtml(inv, 2, fee, newDueDate),
              pdfBuffer,
              `Mahnung_2_${inv.invoiceNumber?.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`
            );
            if (sent) results.emailsSent++;
          }

          await notifyOwner({
            title: `⚠️ 2. Mahnung ausgestellt: ${inv.invoiceNumber}`,
            content: `Restaurant #${inv.restaurantId} – ${inv.recipientName} – CHF ${(parseFloat(inv.totalAmount) + newDunningFee).toFixed(2)} – Inkasso-Androhung. Neue Fälligkeit: ${newDueDate.toLocaleDateString("de-CH")}`,
          });

          results.dunning2Created++;
        } catch (err: any) {
          results.errors.push(`dunning2 inv#${inv.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      results.errors.push(`dunning2-query: ${err.message}`);
    }

    console.log(`[DunningCron] Results:`, results);
    res.json({ ok: true, ...results });
  } catch (err: any) {
    console.error("[DunningCron] Error:", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: "dunning-check" },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Mahnungs-PDF generieren ─────────────────────────────────────────────────
export async function generateDunningPdf(
  inv: {
    id: number;
    invoiceNumber: string | null;
    restaurantId: number;
    recipientName: string | null;
    recipientEmail: string | null;
    recipientAddress: string | null;
    creditorName: string | null;
    creditorAddress: string | null;
    iban: string | null;
    qrReference: string | null;
    totalAmount: string;
    dunningFee: string | null;
    currency: string | null;
    dueDate: Date | null;
    additionalInfo: string | null;
    issueDate: Date;
    signatureUrl?: string | null;
    signatureLat?: string | null;
    signatureLng?: string | null;
    signatureAddress?: string | null;
    signatureTimestamp?: Date | null;
  },
  level: 1 | 2,
  newFee: number,
  totalDunningFee: number,
  newDueDate: Date
): Promise<{ pdfBuffer: Buffer; pdfUrl: string }> {
  // Bei Teilzahlungen: nur offener Restbetrag + Mahngebühr
  const paidSoFar = parseFloat((inv as any).paidAmount || "0");
  const openAmount = Math.max(0, parseFloat(inv.totalAmount) - paidSoFar);
  const totalDue = openAmount + totalDunningFee;
  const previousFee = totalDunningFee - newFee;
  const color = level === 2 ? "#c0392b" : "#e67e22";
  const title = level === 2 ? "2. MAHNUNG – LETZTE ZAHLUNGSAUFFORDERUNG" : "1. MAHNUNG – ZAHLUNGSERINNERUNG";
  const levelLabel = level === 2 ? "2. Mahnung" : "1. Mahnung";
  const currency = inv.currency || "CHF";
  const creditorName = inv.creditorName || "SimplaPos";
  const creditorAddress = inv.creditorAddress || "";
  const recipientName = inv.recipientName || "Unbekannt";
  const recipientAddress = inv.recipientAddress || "";
  const invoiceNumber = inv.invoiceNumber || `#${inv.id}`;

  // Schweizer QR-Code generieren
  let qrSvg = "";
  try {
    const { SwissQRBill } = await import("swissqrbill/svg");
    const addrParts = (creditorAddress || "").split("\n");
    const recipAddrParts = (recipientAddress || "").split("\n");
    const data = {
      currency: currency as "CHF" | "EUR",
      amount: totalDue,
      creditor: {
        name: creditorName,
        address: addrParts[0] || "",
        zip: addrParts[1]?.split(" ")[0] || "0000",
        city: addrParts[1]?.split(" ").slice(1).join(" ") || "",
        country: "CH" as const,
        account: (inv.iban || "").replace(/\s/g, "").toUpperCase(),
      },
      debtor: {
        name: recipientName,
        address: recipAddrParts[0] || "",
        zip: recipAddrParts[1]?.split(" ")[0] || "0000",
        city: recipAddrParts[1]?.split(" ").slice(1).join(" ") || "",
        country: "CH" as const,
      },
      reference: inv.qrReference || undefined,
      message: `${levelLabel}: ${invoiceNumber}`,
    };
    const bill = new SwissQRBill(data);
    qrSvg = bill.toString();
  } catch {
    qrSvg = `<svg width="210" height="105" xmlns="http://www.w3.org/2000/svg"><rect width="210" height="105" fill="#f5f5f5"/><text x="105" y="55" text-anchor="middle" font-size="10" fill="#888">QR-Code</text></svg>`;
  }

  const urgencySection = level === 2
    ? `<div style="background:#ffeaea;border-left:5px solid #c0392b;padding:16px;margin:20px 0;border-radius:0 4px 4px 0">
        <p style="font-weight:bold;color:#c0392b;margin-bottom:6px">⚠️ Letzte Warnung – Drohende Inkasso-Übergabe</p>
        <p style="font-size:11px;line-height:1.6">Falls wir bis zum <strong>${newDueDate.toLocaleDateString("de-CH")}</strong> keine vollständige Zahlung erhalten, sind wir gezwungen, die Forderung an ein Inkassobüro zu übergeben. Dies würde zu erheblichen Mehrkosten für Sie führen. Bitte begleichen Sie den ausstehenden Betrag umgehend.</p>
      </div>`
    : `<div style="background:#fff8e1;border-left:5px solid #e67e22;padding:16px;margin:20px 0;border-radius:0 4px 4px 0">
        <p style="font-weight:bold;color:#e67e22;margin-bottom:6px">Zahlungserinnerung</p>
        <p style="font-size:11px;line-height:1.6">Wir bitten Sie höflich, den ausstehenden Betrag bis zum <strong>${newDueDate.toLocaleDateString("de-CH")}</strong> zu begleichen. Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 18mm 10mm 18mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 3px solid ${color}; padding-bottom: 14px; }
  .company-name { font-size: 18px; font-weight: bold; color: #1a1a2e; }
  .company-addr { font-size: 9px; color: #666; margin-top: 4px; line-height: 1.5; }
  .dunning-badge { background: ${color}; color: #fff; padding: 6px 16px; border-radius: 20px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }
  .title-section { margin: 22px 0 18px; }
  .title-section h1 { font-size: 22px; font-weight: bold; color: ${color}; }
  .title-section .subtitle { font-size: 11px; color: #666; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
  .meta-box { background: #f8f9fa; border: 1px solid #e9ecef; padding: 12px; border-radius: 4px; }
  .meta-box h4 { font-size: 8px; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.5px; }
  .meta-box p { font-size: 11px; line-height: 1.5; }
  .fee-table { width: 100%; border-collapse: collapse; margin: 18px 0; }
  .fee-table th { background: #1a1a2e; color: #fff; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
  .fee-table th:last-child { text-align: right; }
  .fee-table td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; }
  .fee-table td:last-child { text-align: right; font-weight: 500; }
  .fee-table tr.total-row td { font-weight: bold; font-size: 13px; border-top: 2px solid ${color}; color: ${color}; padding-top: 10px; }
  .payment-info { background: #f0f4ff; border: 1px solid #c5d5ff; border-radius: 6px; padding: 14px; margin: 18px 0; }
  .payment-info h4 { font-size: 9px; text-transform: uppercase; color: #4a6cf7; margin-bottom: 8px; }
  .iban { font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
  .qr-section { border-top: 2px dashed #ccc; margin-top: 28px; padding-top: 14px; }
  .qr-section h4 { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 10px; }
  .qr-layout { display: flex; gap: 20px; align-items: flex-start; }
  .qr-svg { flex-shrink: 0; }
  .qr-details { font-size: 10px; line-height: 1.7; }
  .qr-details strong { display: block; font-size: 8px; text-transform: uppercase; color: #888; margin-top: 6px; }
  .footer { margin-top: 18px; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 10px; text-align: center; }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div>
      <div class="company-name">${creditorName}</div>
      <div class="company-addr">${creditorAddress.replace(/\n/g, " · ")}</div>
    </div>
    <div style="text-align:right">
      <div class="dunning-badge">${levelLabel}</div>
      <div style="font-size:10px;color:#888;margin-top:8px">Datum: ${new Date().toLocaleDateString("de-CH")}</div>
    </div>
  </div>

  <!-- Empfänger -->
  <div style="margin-bottom:22px">
    <p style="font-size:10px;color:#888;margin-bottom:4px">An:</p>
    <p style="font-weight:bold;font-size:13px">${recipientName}</p>
    <p style="font-size:11px;color:#555;line-height:1.5">${recipientAddress.replace(/\n/g, "<br>")}</p>
  </div>

  <!-- Titel -->
  <div class="title-section">
    <h1>${title}</h1>
    <p class="subtitle">Rechnung Nr. <strong>${invoiceNumber}</strong> · Ausgestellt am ${inv.issueDate.toLocaleDateString("de-CH")}</p>
  </div>

  <!-- Dringlichkeitshinweis -->
  ${urgencySection}

  <!-- Betragsaufstellung -->
  <table class="fee-table">
    <thead>
      <tr>
        <th>Position</th>
        <th style="text-align:right">Betrag (${currency})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Ursprünglicher Rechnungsbetrag (${invoiceNumber})</td>
        <td>${currency} ${parseFloat(inv.totalAmount).toFixed(2)}</td>
      </tr>
      ${previousFee > 0 ? `<tr style="background:#fff8e1">
        <td>Mahngebühren aus vorherigen Mahnungen</td>
        <td>${currency} ${previousFee.toFixed(2)}</td>
      </tr>` : ""}
      <tr style="background:${color}15">
        <td><strong>${levelLabel} – Mahngebühr</strong></td>
        <td><strong>${currency} ${newFee.toFixed(2)}</strong></td>
      </tr>
      <tr class="total-row">
        <td>Gesamtbetrag zahlbar bis ${newDueDate.toLocaleDateString("de-CH")}</td>
        <td>${currency} ${totalDue.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Zahlungsinformationen -->
  <div class="payment-info">
    <h4>Zahlungsinformationen</h4>
    <div>IBAN: <span class="iban">${(inv.iban || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()}</span></div>
    <div style="margin-top:4px">Zugunsten: ${creditorName}</div>
    ${inv.qrReference ? `<div style="margin-top:4px">Referenz: <strong>${inv.qrReference}</strong></div>` : ""}
    <div style="margin-top:4px;color:#e63946;font-weight:bold">Zahlungsfrist: ${newDueDate.toLocaleDateString("de-CH")}</div>
  </div>

  <!-- Schweizer QR-Code -->
  <div class="qr-section">
    <h4>Schweizer QR-Rechnung (SIX-Standard) – Zahlungsteil</h4>
    <div class="qr-layout">
      <div class="qr-svg">${qrSvg}</div>
      <div class="qr-details">
        <strong>Konto / Zahlbar an</strong>
        ${(inv.iban || "").replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim()}<br>
        ${creditorName}<br>
        ${creditorAddress.replace(/\n/g, "<br>")}
        <strong>Zahlbar durch</strong>
        ${recipientName}<br>
        ${recipientAddress.replace(/\n/g, "<br>")}
        <strong>Betrag</strong>
        ${currency} ${totalDue.toFixed(2)}
        ${inv.qrReference ? `<strong>Referenz</strong>${inv.qrReference}` : ""}
        <strong>Zusätzliche Informationen</strong>
        ${levelLabel}: ${invoiceNumber}
      </div>
    </div>
  </div>

  ${(inv as any).signatureUrl ? `
  <div style="margin-top:24px;border-top:1px solid #eee;padding-top:14px">
    <p style="font-size:9px;text-transform:uppercase;color:#888;margin-bottom:6px;letter-spacing:0.5px">Digitale Unterschrift des Rechnungsempfängers</p>
    <img src="${(inv as any).signatureUrl}" style="max-height:60px;border:1px solid #ddd;border-radius:4px;padding:4px;background:#fff" alt="Unterschrift" />
    <div style="margin-top:6px;font-size:9px;color:#666;line-height:1.6">
      ${(inv as any).signatureTimestamp ? `<div>🕐 Zeitstempel: <strong>${new Date((inv as any).signatureTimestamp).toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}</strong> (Schweizer Zeit)</div>` : `<div>Unterschrieben am ${inv.issueDate.toLocaleDateString('de-CH')}</div>`}
      ${((inv as any).signatureLat && (inv as any).signatureLng) ? `<div>📍 GPS-Koordinaten: <strong>${parseFloat((inv as any).signatureLat).toFixed(6)}, ${parseFloat((inv as any).signatureLng).toFixed(6)}</strong></div>` : ''}
      ${(inv as any).signatureAddress ? `<div>🏠 Standort: ${(inv as any).signatureAddress}</div>` : ''}
    </div>
  </div>` : ''}
  <div class="footer">
    Dieses Mahnschreiben wurde elektronisch erstellt. · ${creditorName}
  </div>
</div>
</body>
</html>`;

  // HTML zu PDF konvertieren
  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const tmpId = `${inv.id}_${level}_${Date.now()}`;
  const tmpHtml = `/tmp/dunning_${tmpId}.html`;
  const tmpPdf = `/tmp/dunning_${tmpId}.pdf`;
  writeFileSync(tmpHtml, html, "utf-8");
  try {
    execSync(`weasyprint ${tmpHtml} ${tmpPdf} 2>/dev/null || manus-md-to-pdf ${tmpHtml} ${tmpPdf} 2>/dev/null`, { timeout: 30000 });
  } catch {
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

  const pdfKey = `dunning/${inv.restaurantId}/${invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}_mahnung${level}.pdf`;
  const { url: pdfUrl } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
  return { pdfBuffer, pdfUrl };
}

// ─── E-Mail-Versand (mit optionalem PDF-Anhang) ──────────────────────────────
async function sendDunningEmail(
  to: string,
  subject: string,
  html: string,
  pdfBuffer?: Buffer,
  pdfFilename?: string
): Promise<boolean> {
  try {
    const nodemailer = await import("nodemailer");
    let transporter: import("nodemailer").Transporter;
    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
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
      to,
      subject,
      html,
    };
    if (pdfBuffer && pdfFilename) {
      mailOptions.attachments = [{
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
      }];
    }
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error("[DunningCron] E-Mail-Fehler:", err);
    return false;
  }
}

// ─── E-Mail-Templates ────────────────────────────────────────────────────────
function buildDunningEmailHtml(
  inv: { invoiceNumber: string | null; recipientName: string | null; totalAmount: string; dunningFee: string | null; creditorName: string | null },
  level: 1 | 2,
  fee: number,
  newDueDate: Date
): string {
  const totalDue = (parseFloat(inv.totalAmount) + parseFloat(inv.dunningFee || "0") + fee).toFixed(2);
  const isSecond = level === 2;
  const color = isSecond ? "#c0392b" : "#e67e22";
  const title = isSecond ? "2. Mahnung – Letzte Zahlungsaufforderung" : "1. Mahnung – Zahlungserinnerung";
  const urgencyText = isSecond
    ? `<p style="background:#ffeaea;border-left:4px solid #c0392b;padding:12px;margin:15px 0"><strong>⚠️ Letzte Warnung:</strong> Falls wir bis zum <strong>${newDueDate.toLocaleDateString("de-CH")}</strong> keine Zahlung erhalten, sind wir gezwungen, die Forderung an ein Inkassobüro zu übergeben. Dies würde zu weiteren Kosten für Sie führen.</p>`
    : `<p style="background:#fff8e1;border-left:4px solid #e67e22;padding:12px;margin:15px 0">Wir bitten Sie höflich, den ausstehenden Betrag bis zum <strong>${newDueDate.toLocaleDateString("de-CH")}</strong> zu begleichen. Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:${color};color:#fff;padding:16px;border-radius:6px 6px 0 0">
        <h2 style="margin:0;font-size:18px">${title}</h2>
      </div>
      <div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 6px 6px">
        <p>Sehr geehrte/r <strong>${inv.recipientName}</strong>,</p>
        <p>trotz unserer ${level === 1 ? "Zahlungserinnerung" : "1. Mahnung"} ist die folgende Rechnung noch nicht beglichen:</p>
        <table style="width:100%;border-collapse:collapse;margin:15px 0">
          <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:bold">Rechnungsnummer</td><td style="padding:8px">${inv.invoiceNumber}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Offener Betrag</td><td style="padding:8px">CHF ${parseFloat(inv.totalAmount).toFixed(2)}</td></tr>
          <tr style="background:#f5f5f5"><td style="padding:8px;font-weight:bold">Mahngebühr (${level}. Mahnung)</td><td style="padding:8px">CHF ${fee.toFixed(2)}</td></tr>
          <tr style="background:${color}20"><td style="padding:8px;font-weight:bold;color:${color}">Gesamtbetrag</td><td style="padding:8px;font-weight:bold;color:${color}">CHF ${totalDue}</td></tr>
          <tr><td style="padding:8px;font-weight:bold">Neue Zahlungsfrist</td><td style="padding:8px;font-weight:bold">${newDueDate.toLocaleDateString("de-CH")}</td></tr>
        </table>
        ${urgencyText}
        <p style="color:#888;font-size:11px;margin-top:8px">Das vollständige Mahnschreiben mit Schweizer QR-Code finden Sie im Anhang dieser E-Mail.</p>
        <p style="color:#888;font-size:12px;margin-top:20px;border-top:1px solid #eee;padding-top:10px">${inv.creditorName || "SimplaPos"}</p>
      </div>
    </div>
  `;
}
