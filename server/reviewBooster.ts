/**
 * reviewBooster.ts
 *
 * Bewertungs-Booster: Nach jeder Zahlung wird automatisch eine SMS/WhatsApp
 * an den Gast gesendet mit dem Bewertungslink.
 *
 * Ablauf:
 * 1. Zahlung abgeschlossen → triggerReviewBooster() aufrufen
 * 2. Prüfen ob Bewertungs-Booster für dieses Restaurant aktiv ist
 * 3. Prüfen ob Gast-Telefonnummer vorhanden
 * 4. SMS/WhatsApp senden (via Twilio)
 * 5. Eintrag in marketing_review_requests speichern
 *
 * Negativer Bewertungs-Abfang:
 * - Wenn Gast auf Link klickt → internes Feedback-Formular
 * - Wenn Bewertung >= minRating → Weiterleitung zu Google
 * - Wenn Bewertung < minRating → internes Formular, kein Google-Link
 */

import { getDb } from "./db";
import { marketingSettings, marketingReviewRequests } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Typen ────────────────────────────────────────────────────────────────────

type ReviewBoosterTrigger = {
  restaurantId: number;
  guestPhone?: string;
  guestName?: string;
  tableNumber?: string;
  orderId?: number;
  totalAmount?: number;
};

type SmsResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  channel: "sms" | "whatsapp";
};

// ─── Haupt-Funktion ───────────────────────────────────────────────────────────

export async function triggerReviewBooster(trigger: ReviewBoosterTrigger): Promise<void> {
  const db = await getDb();

  // Einstellungen laden
  const settings = await db
    .select()
    .from(marketingSettings)
    .where(eq(marketingSettings.restaurantId, trigger.restaurantId))
    .limit(1);

  const setting = settings[0];
  if (!setting) return;

  const config = (setting.settings as Record<string, unknown>) ?? {};

  // Prüfen ob Bewertungs-Booster aktiv
  if (!config.reviewBoosterEnabled) return;
  if (!config.googleReviewUrl) return;
  if (!trigger.guestPhone) return;

  // Verzögerung berücksichtigen (Standard: 5 Minuten)
  const delayMinutes = Number(config.reviewBoosterDelayMinutes ?? 5);

  // Sofort oder mit Verzögerung?
  if (delayMinutes > 0) {
    // In Produktion: Job-Queue oder setTimeout (für Demo: sofort)
    setTimeout(() => {
      sendReviewRequest(trigger, config).catch(console.error);
    }, delayMinutes * 60 * 1000);
  } else {
    await sendReviewRequest(trigger, config);
  }
}

async function sendReviewRequest(
  trigger: ReviewBoosterTrigger,
  config: Record<string, unknown>
): Promise<void> {
  const db = await getDb();

  const googleUrl = config.googleReviewUrl as string;
  const guestName = trigger.guestName ?? "Lieber Gast";
  const restaurantId = trigger.restaurantId;

  // Feedback-URL (intern, leitet dann weiter zu Google wenn Bewertung gut)
  const feedbackToken = generateToken();
  const feedbackUrl = `${process.env.PUBLIC_URL ?? "https://simplapos.com"}/feedback/${feedbackToken}`;

  const message = buildSmsMessage(guestName, feedbackUrl);

  // SMS senden
  const result = await sendSms(trigger.guestPhone!, message);

  // Eintrag speichern
  await db.insert(marketingReviewRequests).values({
    restaurantId,
    guestPhone: trigger.guestPhone!,
    guestName: trigger.guestName ?? null,
    tableNumber: trigger.tableNumber ?? null,
    orderId: trigger.orderId ?? null,
    feedbackToken,
    googleReviewUrl: googleUrl,
    smsSent: result.success,
    smsMessageId: result.messageId ?? null,
    smsChannel: result.channel,
    smsError: result.error ?? null,
    sentAt: new Date(),
  });
}

// ─── SMS-Versand (Twilio) ─────────────────────────────────────────────────────

async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    // Twilio nicht konfiguriert – im Dev-Modus nur loggen
    console.log(`[ReviewBooster] SMS würde gesendet an ${phone}: ${message}`);
    return { success: true, messageId: "dev-mock", channel: "sms" };
  }

  try {
    // Versuche zuerst WhatsApp (höhere Öffnungsrate)
    const whatsappResult = await sendWhatsApp(phone, message, accountSid, authToken, fromNumber);
    if (whatsappResult.success) return whatsappResult;

    // Fallback: SMS
    return await sendTwilioSms(phone, message, accountSid, authToken, fromNumber);
  } catch (err) {
    return { success: false, error: (err as Error).message, channel: "sms" };
  }
}

async function sendWhatsApp(
  phone: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber: string
): Promise<SmsResult> {
  try {
    const whatsappFrom = `whatsapp:${fromNumber}`;
    const whatsappTo = `whatsapp:${phone}`;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: whatsappFrom,
          To: whatsappTo,
          Body: message,
        }).toString(),
      }
    );

    const data = await res.json() as { sid?: string; error_message?: string };
    if (!res.ok || !data.sid) throw new Error(data.error_message ?? "WhatsApp fehlgeschlagen");

    return { success: true, messageId: data.sid, channel: "whatsapp" };
  } catch {
    return { success: false, channel: "whatsapp" };
  }
}

async function sendTwilioSms(
  phone: string,
  message: string,
  accountSid: string,
  authToken: string,
  fromNumber: string
): Promise<SmsResult> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: phone,
        Body: message,
      }).toString(),
    }
  );

  const data = await res.json() as { sid?: string; error_message?: string };
  if (!res.ok || !data.sid) throw new Error(data.error_message ?? "SMS fehlgeschlagen");

  return { success: true, messageId: data.sid, channel: "sms" };
}

// ─── Feedback-Verarbeitung ────────────────────────────────────────────────────

/**
 * Wird aufgerufen wenn der Gast auf den Feedback-Link klickt.
 * Gibt zurück ob der Gast zu Google weitergeleitet werden soll.
 */
export async function processFeedback(
  token: string,
  rating: number
): Promise<{ redirectToGoogle: boolean; googleUrl?: string }> {
  const db = await getDb();

  const requests = await db
    .select()
    .from(marketingReviewRequests)
    .where(eq(marketingReviewRequests.feedbackToken, token))
    .limit(1);

  const request = requests[0];
  if (!request) return { redirectToGoogle: false };

  // Einstellungen laden
  const settings = await db
    .select()
    .from(marketingSettings)
    .where(eq(marketingSettings.restaurantId, request.restaurantId))
    .limit(1);

  const config = (settings[0]?.settings as Record<string, unknown>) ?? {};
  const minRating = Number(config.reviewBoosterMinRating ?? 4);

  // Feedback speichern
  await db
    .update(marketingReviewRequests)
    .set({ guestRating: rating, clickedAt: new Date() })
    .where(eq(marketingReviewRequests.feedbackToken, token));

  if (rating >= minRating) {
    return { redirectToGoogle: true, googleUrl: request.googleReviewUrl };
  }

  // Schlechte Bewertung: intern behalten, Gastronom benachrichtigen
  return { redirectToGoogle: false };
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildSmsMessage(guestName: string, feedbackUrl: string): string {
  return `Hallo ${guestName}! 😊 Vielen Dank für Ihren Besuch. Wie war Ihr Erlebnis? Wir freuen uns über Ihr Feedback: ${feedbackUrl}`;
}

function generateToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
