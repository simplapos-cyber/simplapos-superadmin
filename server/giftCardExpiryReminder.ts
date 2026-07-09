import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { vouchers, restaurants } from "../drizzle/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import nodemailer from "nodemailer";

/**
 * Heartbeat-Handler: täglich 08:00 UTC
 * Sucht alle Geschenkkarten die in genau 14 Tagen ablaufen und sendet eine Erinnerungs-E-Mail.
 */
export async function giftCardExpiryReminderHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "db-unavailable" });

    const now = new Date();
    // Fenster: 13.5 – 14.5 Tage ab jetzt (damit täglicher Job keine Lücken hat)
    const from = new Date(now.getTime() + 13.5 * 24 * 60 * 60 * 1000);
    const to   = new Date(now.getTime() + 14.5 * 24 * 60 * 60 * 1000);

    // Alle aktiven Geschenkkarten die in diesem Fenster ablaufen
    const expiringCards = await db
      .select({
        id: vouchers.id,
        code: vouchers.code,
        remainingBalance: vouchers.remainingBalance,
        validUntil: vouchers.validUntil,
        issuedTo: vouchers.issuedTo,
        restaurantId: vouchers.restaurantId,
        restaurantName: restaurants.name,
        restaurantEmail: restaurants.email,
      })
      .from(vouchers)
      .innerJoin(restaurants, eq(vouchers.restaurantId, restaurants.id))
      .where(
        and(
          eq(vouchers.category, "gift_card"),
          eq(vouchers.status, "active"),
          isNotNull(vouchers.validUntil),
          sql`${vouchers.validUntil} >= ${from.toISOString()}`,
          sql`${vouchers.validUntil} <= ${to.toISOString()}`
        )
      );

    if (expiringCards.length === 0) {
      return res.json({ ok: true, reminded: 0 });
    }

    // E-Mail-Transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let reminded = 0;

    for (const card of expiringCards) {
      if (!card.restaurantEmail) continue;

      const expiryDate = card.validUntil
        ? new Date(card.validUntil).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "–";

      const balance = card.remainingBalance
        ? `CHF ${Number(card.remainingBalance).toFixed(2)}`
        : "CHF 0.00";

      const html = `
        <!DOCTYPE html>
        <html lang="de">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 8px;">⏰</div>
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Geschenkkarte läuft bald ab</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${card.restaurantName}</p>
            </div>
            <div style="padding: 28px 24px;">
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
                Guten Tag,<br><br>
                folgende Geschenkkarte läuft in <strong>14 Tagen</strong> ab und hat noch ein Restguthaben:
              </p>
              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <span style="color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Code</span>
                  <span style="color: #1f2937; font-size: 15px; font-weight: 700; font-family: monospace;">${card.code}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <span style="color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Restguthaben</span>
                  <span style="color: #059669; font-size: 18px; font-weight: 700;">${balance}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                  <span style="color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Ausgestellt für</span>
                  <span style="color: #1f2937; font-size: 15px;">${card.issuedTo || "–"}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #92400e; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Ablaufdatum</span>
                  <span style="color: #dc2626; font-size: 15px; font-weight: 700;">${expiryDate}</span>
                </div>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
                Bitte informieren Sie den Inhaber dieser Karte, damit das Guthaben noch rechtzeitig eingelöst werden kann.
              </p>
              <div style="text-align: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f3f4f6;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">SimplaPOS · Geschenkkarten-System</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        await transporter.sendMail({
          from: `"SimplaPOS" <${process.env.SMTP_USER}>`,
          to: card.restaurantEmail,
          subject: `⏰ Geschenkkarte ${card.code} läuft in 14 Tagen ab – Restguthaben ${balance}`,
          html,
        });
        reminded++;
      } catch (emailErr) {
        console.error(`[GK-Expiry] E-Mail fehlgeschlagen für ${card.code}:`, emailErr);
      }
    }

    res.json({ ok: true, reminded, total: expiringCards.length });
  } catch (err: any) {
    console.error("[GK-Expiry] Handler-Fehler:", err);
    res.status(500).json({ error: err.message, stack: err.stack, timestamp: new Date().toISOString() });
  }
}
