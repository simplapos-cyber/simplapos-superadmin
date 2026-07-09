/**
 * Loyalty Heartbeat Handlers
 *
 * Three daily cron jobs:
 * 1. /api/scheduled/loyalty-birthday-bonus   – Geburtstags-Bonus im Geburtsmonat
 * 2. /api/scheduled/loyalty-inactivity       – Erinnerung nach 60 Tagen Inaktivität
 * 3. /api/scheduled/loyalty-expire-points    – Punkte-Ablauf nach X Monaten Inaktivität
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import {
  loyaltyCustomers,
  loyaltyTransactions,
  loyaltyPrograms,
  loyaltyPushSubscriptions,
  restaurants,
} from "../drizzle/schema";
import { eq, and, lt, sql, isNotNull } from "drizzle-orm";
import nodemailer from "nodemailer";
import webpush from "web-push";

// VAPID-Keys initialisieren (falls konfiguriert)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:support@simplapos.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// ── E-Mail-Transporter ────────────────────────────────────────────────────────
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, html });
  } catch (err: any) {
    console.error("[LoyaltyCron] E-Mail Fehler:", err.message);
  }
}

// ── Shared Auth Check ─────────────────────────────────────────────────────────
import { sdk } from "./_core/sdk";

async function authCron(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron) { res.status(403).json({ error: "cron-only" }); return false; }
    return true;
  } catch {
    res.status(403).json({ error: "unauthorized" });
    return false;
  }
}

// ── 1. Geburtstags-Bonus ──────────────────────────────────────────────────────
export async function handleLoyaltyBirthdayBonus(req: Request, res: Response) {
  if (!await authCron(req, res)) return;
  try {
    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();        // 1-31
    const currentYear = today.getFullYear();
    const yearStart = `${currentYear}-01-01`;

    // Kunden mit Geburtsmonat = aktueller Monat, die dieses Jahr noch keinen Bonus bekommen haben
    const customers = await db.select({
      id: loyaltyCustomers.id,
      email: loyaltyCustomers.email,
      firstName: loyaltyCustomers.firstName,
      restaurantId: loyaltyCustomers.restaurantId,
      token: loyaltyCustomers.token,
      birthDay: loyaltyCustomers.birthDay,
      birthMonth: loyaltyCustomers.birthMonth,
    })
      .from(loyaltyCustomers)
      .where(
        and(
          eq(loyaltyCustomers.birthMonth, currentMonth),
          eq(loyaltyCustomers.isActive, true),
          isNotNull(loyaltyCustomers.email)
        )
      );

    // Filtern: exakter Tag oder (kein Tag gespeichert → am 1. des Monats)
    const todayCustomers = customers.filter((c: typeof customers[0]) =>
      c.birthDay === currentDay || (c.birthDay === null && currentDay === 1)
    );

    let processed = 0;
    for (const customer of todayCustomers) {
      // Prüfen ob bereits Geburtstags-Bonus dieses Jahr
      const existing = await db.select({ id: loyaltyTransactions.id })
        .from(loyaltyTransactions)
        .where(
          and(
            eq(loyaltyTransactions.customerId, customer.id),
            eq(loyaltyTransactions.type, "birthday_bonus"),
            sql`${loyaltyTransactions.createdAt} >= ${yearStart}`
          )
        )
        .limit(1);

      if (existing.length > 0) continue;

      // Programm-Einstellungen laden
      const [program] = await db.select().from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.restaurantId, customer.restaurantId));
      if (!program || !program.birthdayBonus || program.birthdayBonus <= 0) continue;

      const [restaurant] = await db.select({ name: restaurants.name }).from(restaurants)
        .where(eq(restaurants.id, customer.restaurantId));

      // Punkte gutschreiben
      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId: customer.restaurantId,
        type: "birthday_bonus",
        points: program.birthdayBonus,
        description: `Geburtstags-Bonus ${currentYear}`,
        createdAt: new Date().toISOString(),
      });

      await db.update(loyaltyCustomers)
        .set({ totalPoints: sql`${loyaltyCustomers.totalPoints} + ${program.birthdayBonus}`, lifetimePoints: sql`${loyaltyCustomers.lifetimePoints} + ${program.birthdayBonus}`, updatedAt: new Date().toISOString() })
        .where(eq(loyaltyCustomers.id, customer.id));

      // Push-Benachrichtigung senden
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        const subs = await db.select().from(loyaltyPushSubscriptions)
          .where(and(
            eq(loyaltyPushSubscriptions.restaurantId, customer.restaurantId),
            eq(loyaltyPushSubscriptions.customerId, customer.id)
          ));
        if (subs.length > 0) {
          const pushPayload = JSON.stringify({
            title: `🎂 Alles Gute, ${customer.firstName}!`,
            body: `${program.birthdayBonus} Geburtstags-Punkte wurden deinem Konto gutgeschrieben!`,
            url: `/loyalty/${customer.token}`,
            tag: `birthday-${customer.id}-${currentYear}`,
          });
          await Promise.allSettled(subs.map((sub: typeof subs[0]) =>
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              pushPayload
            ).catch(() => {})
          ));
        }
      }

      // E-Mail senden
      if (customer.email) {
        const cardUrl = `${process.env.SITE_URL ?? "https://simplapos.com"}/loyalty/${customer.token}`;
        await sendEmail(
          customer.email,
          `🎂 Alles Gute! ${program.birthdayBonus} Geburtstags-Punkte von ${restaurant?.name ?? "uns"}`,
          `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:32px;text-align:center">
              <div style="font-size:48px;margin-bottom:8px">🎂</div>
              <h1 style="color:#fff;margin:0;font-size:24px">Alles Gute, ${customer.firstName}!</h1>
              <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">Wir schenken dir ${program.birthdayBonus} Punkte</p>
            </div>
            <div style="padding:24px;text-align:center">
              <p style="font-size:32px;font-weight:bold;color:#7c3aed;margin:0">${program.birthdayBonus}</p>
              <p style="color:#666;margin:4px 0 24px">Geburtstags-Punkte wurden deinem Konto gutgeschrieben</p>
              <a href="${cardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Meine Treuekarte ansehen</a>
              <p style="font-size:12px;color:#999;margin-top:24px">${restaurant?.name ?? ""} · Treueprogramm</p>
            </div>
          </div>
          `
        );
      }
      processed++;
    }

    res.json({ ok: true, processed, month: currentMonth });
  } catch (err: any) {
    console.error("[LoyaltyCron Birthday]", err);
    res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
}

// ── 2. Inaktivitäts-Erinnerung (60 Tage) ─────────────────────────────────────
export async function handleLoyaltyInactivity(req: Request, res: Response) {
  if (!await authCron(req, res)) return;
  try {
    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const threshold = sixtyDaysAgo.toISOString();

    // Kunden, die seit 60 Tagen nicht besucht haben und noch Punkte haben
    const customers = await db.select({
      id: loyaltyCustomers.id,
      email: loyaltyCustomers.email,
      firstName: loyaltyCustomers.firstName,
      totalPoints: loyaltyCustomers.totalPoints,
      restaurantId: loyaltyCustomers.restaurantId,
      token: loyaltyCustomers.token,
      lastVisitAt: loyaltyCustomers.lastActivityAt,
    })
      .from(loyaltyCustomers)
      .where(
        and(
          eq(loyaltyCustomers.isActive, true),
          isNotNull(loyaltyCustomers.email),
          sql`${loyaltyCustomers.totalPoints} > 0`,
          sql`(${loyaltyCustomers.lastActivityAt} IS NULL OR ${loyaltyCustomers.lastActivityAt} < ${threshold})`
        )
      );

    let processed = 0;
    for (const customer of customers) {
      // Nur einmal alle 60 Tage erinnern – prüfen ob bereits kürzlich erinnert
      const recentReminder = await db.select({ id: loyaltyTransactions.id })
        .from(loyaltyTransactions)
        .where(
          and(
            eq(loyaltyTransactions.customerId, customer.id),
            eq(loyaltyTransactions.type, "inactivity_reminder" as any),
            sql`${loyaltyTransactions.createdAt} >= ${threshold}`
          )
        )
        .limit(1);

      if (recentReminder.length > 0) continue;

      const [restaurant] = await db.select({ name: restaurants.name }).from(restaurants)
        .where(eq(restaurants.id, customer.restaurantId));

      const [program] = await db.select().from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.restaurantId, customer.restaurantId));

      if (!program?.inactivityReminderEnabled) continue;

      // Erinnerung als Transaktion markieren (ohne Punkte)
      await db.insert(loyaltyTransactions).values({
        customerId: customer.id,
        restaurantId: customer.restaurantId,
        type: "inactivity_reminder" as any,
        points: 0,
        description: "Inaktivitäts-Erinnerung gesendet",
        createdAt: new Date().toISOString(),
      });

      const cardUrl = `${process.env.SITE_URL ?? "https://simplapos.com"}/loyalty/${customer.token}`;
      if (customer.email) {
        await sendEmail(
          customer.email,
          `⭐ Deine ${customer.totalPoints} Punkte warten auf dich – ${restaurant?.name ?? ""}`,
          `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;text-align:center">
              <div style="font-size:48px;margin-bottom:8px">⭐</div>
              <h1 style="color:#fff;margin:0;font-size:22px">Wir vermissen dich, ${customer.firstName}!</h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0">Du hast noch ${customer.totalPoints} Punkte auf deiner Treuekarte</p>
            </div>
            <div style="padding:24px;text-align:center">
              <p style="color:#555;margin:0 0 20px">Komm bald wieder vorbei und löse deine Punkte ein – oder sammle noch mehr!</p>
              <a href="${cardUrl}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Meine Treuekarte ansehen</a>
              <p style="font-size:12px;color:#999;margin-top:24px">${restaurant?.name ?? ""} · Treueprogramm</p>
              ${program?.expiryMonths ? `<p style="font-size:11px;color:#bbb">Hinweis: Punkte verfallen nach ${program.expiryMonths} Monaten Inaktivität.</p>` : ""}
            </div>
          </div>
          `
        );
      }
      processed++;
    }

    res.json({ ok: true, processed });
  } catch (err: any) {
    console.error("[LoyaltyCron Inactivity]", err);
    res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
}

// ── 3. Punkte-Ablauf ──────────────────────────────────────────────────────────
export async function handleLoyaltyExpirePoints(req: Request, res: Response) {
  if (!await authCron(req, res)) return;
  try {
    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    // Alle aktiven Programme mit Ablauf-Einstellung
    const programs = await db.select().from(loyaltyPrograms)
      .where(sql`${loyaltyPrograms.expiryMonths} IS NOT NULL AND ${loyaltyPrograms.expiryMonths} > 0`);

    let totalExpired = 0;
    for (const program of programs) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - (program.expiryMonths ?? 12));
      const cutoffStr = cutoff.toISOString();

      // Kunden des Restaurants, die seit X Monaten inaktiv sind und noch Punkte haben
      const expiredCustomers = await db.select({
        id: loyaltyCustomers.id,
        email: loyaltyCustomers.email,
        firstName: loyaltyCustomers.firstName,
        totalPoints: loyaltyCustomers.totalPoints,
        token: loyaltyCustomers.token,
      })
        .from(loyaltyCustomers)
        .where(
          and(
            eq(loyaltyCustomers.restaurantId, program.restaurantId),
            eq(loyaltyCustomers.isActive, true),
            sql`${loyaltyCustomers.totalPoints} > 0`,
            sql`(${loyaltyCustomers.lastActivityAt} IS NULL OR ${loyaltyCustomers.lastActivityAt} < ${cutoffStr})`
          )
        );

      for (const customer of expiredCustomers) {
        const pointsToExpire = customer.totalPoints;
        if (pointsToExpire <= 0) continue;

        // Punkte auf 0 setzen
        await db.update(loyaltyCustomers)
          .set({ totalPoints: 0, updatedAt: new Date().toISOString() })
          .where(eq(loyaltyCustomers.id, customer.id));

        await db.insert(loyaltyTransactions).values({
          customerId: customer.id,
          restaurantId: program.restaurantId,
          type: "expire",
          points: -pointsToExpire,
          description: `Punkte verfallen nach ${program.expiryMonths} Monaten Inaktivität`,
          createdAt: new Date().toISOString(),
        });

        // Benachrichtigungs-E-Mail
        if (customer.email) {
          const [restaurant] = await db.select({ name: restaurants.name }).from(restaurants)
            .where(eq(restaurants.id, program.restaurantId));
          const cardUrl = `${process.env.SITE_URL ?? "https://simplapos.com"}/loyalty/${customer.token}`;
          await sendEmail(
            customer.email,
            `Deine Treuepunkte bei ${restaurant?.name ?? ""} sind abgelaufen`,
            `
            <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
              <div style="background:#6b7280;padding:32px;text-align:center">
                <h1 style="color:#fff;margin:0;font-size:20px">Punkte abgelaufen</h1>
                <p style="color:rgba(255,255,255,0.8);margin:8px 0 0">${pointsToExpire} Punkte sind nach ${program.expiryMonths} Monaten Inaktivität verfallen.</p>
              </div>
              <div style="padding:24px;text-align:center">
                <p style="color:#555">Komm wieder vorbei und sammle neue Punkte!</p>
                <a href="${cardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Treuekarte ansehen</a>
                <p style="font-size:12px;color:#999;margin-top:24px">${restaurant?.name ?? ""} · Treueprogramm</p>
              </div>
            </div>
            `
          );
        }
        totalExpired++;
      }
    }

    res.json({ ok: true, totalExpired });
  } catch (err: any) {
    console.error("[LoyaltyCron Expire]", err);
    res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
  }
}
