/**
 * customerMarketing.ts
 *
 * Stammkunden-Marketing: Automatische Kampagnen basierend auf POS-Daten.
 *
 * Kampagnen-Typen:
 * 1. Reaktivierung – Gast war 30+ Tage nicht da
 * 2. Geburtstag – Geburtstag des Gastes (wenn bekannt)
 * 3. Slow-Day – Restaurant ist leer → Sofort-Aktion an Stammkunden
 * 4. Lieblingsessen zurück – Saisonales Gericht wieder auf der Karte
 * 5. Custom – Manuell erstellte Kampagne
 *
 * Wird als Heartbeat-Job täglich ausgeführt.
 */

import { getDb } from "./db";
import { customerCampaigns, marketingSettings } from "../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ─── Typen ────────────────────────────────────────────────────────────────────

type CampaignTrigger = {
  restaurantId: number;
  type: "reactivation" | "birthday" | "slow_day" | "favorite_back" | "custom";
  guestPhone: string;
  guestName: string;
  metadata?: Record<string, unknown>;
};

// ─── Täglich ausgeführter Job ─────────────────────────────────────────────────

export async function runDailyCustomerMarketing(restaurantId: number): Promise<void> {
  const db = await getDb();

  // Einstellungen laden
  const settings = await db
    .select()
    .from(marketingSettings)
    .where(eq(marketingSettings.restaurantId, restaurantId))
    .limit(1);

  const config = (settings[0]?.settings as Record<string, unknown>) ?? {};
  if (!config.customerMarketingEnabled) return;

  // Alle Kampagnen parallel prüfen
  await Promise.allSettled([
    checkReactivationCampaign(restaurantId, config),
    checkBirthdayCampaign(restaurantId, config),
  ]);
}

// ─── Reaktivierungs-Kampagne ──────────────────────────────────────────────────

async function checkReactivationCampaign(
  restaurantId: number,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.reactivationEnabled) return;

  const db = await getDb();
  const daysSinceLastVisit = Number(config.reactivationDays ?? 30);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastVisit);

  // Gäste finden die seit X Tagen nicht mehr da waren
  // (Aus den Bestelldaten – vereinfachte Abfrage)
  const inactiveguests = await db.execute(sql`
    SELECT DISTINCT
      o.guestPhone,
      o.guestName,
      MAX(o.createdAt) as lastVisit,
      COUNT(o.id) as visitCount,
      AVG(o.total) as avgSpend
    FROM orders o
    WHERE o.restaurantId = ${restaurantId}
      AND o.guestPhone IS NOT NULL
      AND o.guestPhone != ''
    GROUP BY o.guestPhone, o.guestName
    HAVING MAX(o.createdAt) < ${cutoffDate.toISOString()}
      AND MAX(o.createdAt) > DATE_SUB(NOW(), INTERVAL 180 DAY)
    LIMIT 20
  `);

  const guests = (inactiveguests[0] as Array<{
    guestPhone: string;
    guestName: string;
    lastVisit: string;
    visitCount: number;
    avgSpend: number;
  }>);

  for (const guest of guests ?? []) {
    // Prüfen ob wir diesem Gast in den letzten 30 Tagen schon geschrieben haben
    const recentCampaign = await db
      .select()
      .from(customerCampaigns)
      .where(
        and(
          eq(customerCampaigns.restaurantId, restaurantId),
          eq(customerCampaigns.guestPhone, guest.guestPhone),
          eq(customerCampaigns.type, "reactivation"),
          gte(customerCampaigns.sentAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        )
      )
      .limit(1);

    if (recentCampaign.length > 0) continue;

    await sendCampaign({
      restaurantId,
      type: "reactivation",
      guestPhone: guest.guestPhone,
      guestName: guest.guestName ?? "Lieber Gast",
      metadata: {
        lastVisit: guest.lastVisit,
        visitCount: guest.visitCount,
        avgSpend: guest.avgSpend,
      },
    });
  }
}

// ─── Geburtstags-Kampagne ─────────────────────────────────────────────────────

async function checkBirthdayCampaign(
  restaurantId: number,
  config: Record<string, unknown>
): Promise<void> {
  if (!config.birthdayEnabled) return;

  const db = await getDb();
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Gäste mit Geburtstag heute
  const birthdayGuests = await db.execute(sql`
    SELECT guestPhone, guestName, birthday
    FROM loyalty_customers
    WHERE restaurantId = ${restaurantId}
      AND birthday IS NOT NULL
      AND DATE_FORMAT(birthday, '%m-%d') = ${monthDay}
      AND guestPhone IS NOT NULL
    LIMIT 50
  `);

  const guests = (birthdayGuests[0] as Array<{
    guestPhone: string;
    guestName: string;
    birthday: string;
  }>);

  for (const guest of guests ?? []) {
    // Prüfen ob wir heute schon gratuliert haben
    const alreadySent = await db
      .select()
      .from(customerCampaigns)
      .where(
        and(
          eq(customerCampaigns.restaurantId, restaurantId),
          eq(customerCampaigns.guestPhone, guest.guestPhone),
          eq(customerCampaigns.type, "birthday"),
          gte(customerCampaigns.sentAt, new Date(today.setHours(0, 0, 0, 0)))
        )
      )
      .limit(1);

    if (alreadySent.length > 0) continue;

    await sendCampaign({
      restaurantId,
      type: "birthday",
      guestPhone: guest.guestPhone,
      guestName: guest.guestName ?? "Lieber Gast",
      metadata: { birthday: guest.birthday },
    });
  }
}

// ─── Slow-Day-Kampagne (manuell auslösbar) ────────────────────────────────────

/**
 * Wird ausgelöst wenn das Restaurant leer ist (z.B. Auslastung < 20%).
 * Sendet sofort eine Aktion an Stammkunden.
 */
export async function triggerSlowDayCampaign(
  restaurantId: number,
  offerText: string
): Promise<{ sent: number }> {
  const db = await getDb();

  // Top-Stammkunden der letzten 90 Tage
  const topGuests = await db.execute(sql`
    SELECT DISTINCT
      o.guestPhone,
      o.guestName,
      COUNT(o.id) as visitCount
    FROM orders o
    WHERE o.restaurantId = ${restaurantId}
      AND o.guestPhone IS NOT NULL
      AND o.createdAt > DATE_SUB(NOW(), INTERVAL 90 DAY)
    GROUP BY o.guestPhone, o.guestName
    ORDER BY visitCount DESC
    LIMIT 50
  `);

  const guests = (topGuests[0] as Array<{
    guestPhone: string;
    guestName: string;
    visitCount: number;
  }>);

  let sent = 0;
  for (const guest of guests ?? []) {
    await sendCampaign({
      restaurantId,
      type: "slow_day",
      guestPhone: guest.guestPhone,
      guestName: guest.guestName ?? "Lieber Gast",
      metadata: { offerText, visitCount: guest.visitCount },
    });
    sent++;
  }

  return { sent };
}

// ─── Kampagnen-Versand ────────────────────────────────────────────────────────

async function sendCampaign(trigger: CampaignTrigger): Promise<void> {
  const db = await getDb();

  // KI-generierte Nachricht
  const message = await generateCampaignMessage(trigger);

  // SMS senden (vereinfacht – nutzt gleiche Logik wie reviewBooster)
  const sent = await sendSmsSimple(trigger.guestPhone, message);

  // Eintrag speichern
  await db.insert(customerCampaigns).values({
    restaurantId: trigger.restaurantId,
    type: trigger.type,
    guestPhone: trigger.guestPhone,
    guestName: trigger.guestName,
    message,
    channel: "sms",
    status: sent ? "sent" : "failed",
    metadata: trigger.metadata ? JSON.stringify(trigger.metadata) : null,
  });
}

async function generateCampaignMessage(trigger: CampaignTrigger): Promise<string> {
  const prompts: Record<string, string> = {
    reactivation: `Schreibe eine kurze, herzliche SMS (max. 160 Zeichen) um den Gast "${trigger.guestName}" zurückzugewinnen. Er war zuletzt am ${trigger.metadata?.lastVisit ? new Date(trigger.metadata.lastVisit as string).toLocaleDateString("de-CH") : "vor einiger Zeit"} bei uns. Biete einen kleinen Anreiz (z.B. Gratis-Dessert, 10% Rabatt). Kein Emoji-Übertrieb. Auf Deutsch.`,
    birthday: `Schreibe eine kurze Geburtstags-SMS (max. 160 Zeichen) für "${trigger.guestName}". Herzlich, mit einem kleinen Geburtstagsgeschenk (z.B. Gratis-Getränk). Auf Deutsch.`,
    slow_day: `Schreibe eine kurze SMS (max. 160 Zeichen) mit diesem Angebot: "${trigger.metadata?.offerText}". Für Stammgast "${trigger.guestName}". Dringlichkeit betonen (heute, jetzt). Auf Deutsch.`,
    favorite_back: `Schreibe eine kurze SMS (max. 160 Zeichen) dass das Lieblingsgericht "${trigger.metadata?.productName}" wieder auf der Karte ist. Für "${trigger.guestName}". Auf Deutsch.`,
    custom: `Schreibe eine kurze SMS (max. 160 Zeichen) für "${trigger.guestName}". Inhalt: ${trigger.metadata?.message ?? "Wir freuen uns auf Ihren Besuch!"}. Auf Deutsch.`,
  };

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "Du bist ein Marketing-Experte für Gastronomie. Schreibe präzise, herzliche SMS-Nachrichten auf Deutsch. Maximal 160 Zeichen. Kein Spam-Charakter." },
        { role: "user", content: prompts[trigger.type] ?? prompts.custom },
      ],
    });
    const content = response.choices[0]?.message?.content;
    return typeof content === "string" ? content.slice(0, 160) : "Wir freuen uns auf Ihren nächsten Besuch! Ihr Simplapos-Team";
  } catch {
    // Fallback-Nachrichten
    const fallbacks: Record<string, string> = {
      reactivation: `Hallo ${trigger.guestName}! Wir vermissen Sie. Kommen Sie wieder vorbei – wir haben etwas Besonderes für Sie! 😊`,
      birthday: `Herzlichen Glückwunsch zum Geburtstag, ${trigger.guestName}! 🎂 Als Geschenk: ein Gratis-Dessert bei Ihrem nächsten Besuch!`,
      slow_day: `Hallo ${trigger.guestName}! Heute Spezialangebot: ${trigger.metadata?.offerText ?? "Kommen Sie vorbei!"}`,
      favorite_back: `Hallo ${trigger.guestName}! Ihr Lieblingsessen ist wieder da. Wir freuen uns auf Sie!`,
      custom: `Hallo ${trigger.guestName}! Wir freuen uns auf Ihren Besuch.`,
    };
    return fallbacks[trigger.type] ?? fallbacks.custom;
  }
}

async function sendSmsSimple(phone: string, message: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[CustomerMarketing] SMS würde gesendet an ${phone}: ${message}`);
    return true;
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: fromNumber, To: phone, Body: message }).toString(),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
