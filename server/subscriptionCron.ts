import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import {
  getSubscriptionsDueSoon,
  getExpiredSubscriptions,
  getGracePeriodExpiredSubscriptions,
  updateSubscription,
  getSubscriptionByRestaurant,
  getTrialSubscriptionsExpiringSoon,
} from "./db";

/**
 * Subscription lifecycle handler - called daily by Heartbeat cron.
 * 
 * Logic:
 * 1. Send reminder 5 days before period end (status: active)
 * 2. On period end: mark as past_due, set grace period (+3 days), notify
 * 3. After grace period: mark as blocked, notify
 */
export async function handleSubscriptionCheck(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req) as any;
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const results = {
      trialReminders: 0,
      reminders: 0,
      pastDue: 0,
      blocked: 0,
      errors: [] as string[],
    };

    // 0. Send 3-day reminder for trial subscriptions about to expire
    try {
      const trialExpiring = await getTrialSubscriptionsExpiringSoon(3);
      for (const sub of trialExpiring) {
        // Idempotent: only send once
        if (sub.trialReminderSentAt) continue;

        await updateSubscription(sub.id, { trialReminderSentAt: new Date() });
        await notifyOwner({
          title: `⚠️ Testphase läuft bald ab: Restaurant #${sub.restaurantId}`,
          content: `Die kostenlose Testphase für Restaurant #${sub.restaurantId} endet in 3 Tagen. Danach folgt eine 7-tägige eingeschränkte Phase, bevor das System gesperrt wird. Jetzt Abonnement abschliessen, um dauerhaften Zugang zu sichern.`,
        });
        results.trialReminders++;
      }
    } catch (err: any) {
      results.errors.push(`trialReminders: ${err.message}`);
    }

    // 1. Send 5-day reminder for active subscriptions about to expire
    try {
      const dueSoon = await getSubscriptionsDueSoon(5);
      for (const sub of dueSoon) {
        // Only send once
        if (sub.reminderSentAt) continue;
        
        await updateSubscription(sub.id, { reminderSentAt: new Date() });
        await notifyOwner({
          title: `Zahlungserinnerung: Restaurant #${sub.restaurantId}`,
          content: `Das Abonnement für Restaurant #${sub.restaurantId} läuft in 5 Tagen ab (${sub.currentPeriodEnd?.toLocaleDateString("de-CH")}). Monatlicher Betrag: CHF ${sub.monthlyAmount}`,
        });
        results.reminders++;
      }
    } catch (err: any) {
      results.errors.push(`reminders: ${err.message}`);
    }

    // 2. Mark expired subscriptions as past_due + set grace period
    try {
      const expired = await getExpiredSubscriptions();
      for (const sub of expired) {
        const gracePeriodEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 days
        await updateSubscription(sub.id, {
          status: "past_due",
          gracePeriodEnd,
          dueDayNotifiedAt: new Date(),
        });
        await notifyOwner({
          title: `Zahlung fällig: Restaurant #${sub.restaurantId}`,
          content: `Das Abonnement für Restaurant #${sub.restaurantId} ist abgelaufen. Kulanzzeit bis ${gracePeriodEnd.toLocaleDateString("de-CH")}. Danach wird das System gesperrt.`,
        });
        results.pastDue++;
      }
    } catch (err: any) {
      results.errors.push(`pastDue: ${err.message}`);
    }

    // 3. Block subscriptions where grace period has expired
    try {
      const graceExpired = await getGracePeriodExpiredSubscriptions();
      for (const sub of graceExpired) {
        await updateSubscription(sub.id, {
          status: "blocked",
          blockedNotifiedAt: new Date(),
        });
        await notifyOwner({
          title: `System gesperrt: Restaurant #${sub.restaurantId}`,
          content: `Das Abonnement für Restaurant #${sub.restaurantId} wurde gesperrt (Kulanzzeit abgelaufen). Das Restaurant kann nur noch Reports einsehen. Zahlung erforderlich zur Reaktivierung.`,
        });
        results.blocked++;
      }
    } catch (err: any) {
      results.errors.push(`blocked: ${err.message}`);
    }

    console.log(`[SubscriptionCron] Results:`, results);
    res.json({ ok: true, ...results });
  } catch (err: any) {
    console.error("[SubscriptionCron] Error:", err);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.url, taskUid: "subscription-check" },
      timestamp: new Date().toISOString(),
    });
  }
}
