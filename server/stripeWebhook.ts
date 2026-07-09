import type { Express, Request, Response } from "express";
import express from "express";
import { stripe } from "./stripe";
import { ENV } from "./_core/env";
import {
  getSubscriptionByRestaurant,
  updateSubscription,
  createPayment,
  getSubscriptionById,
} from "./db";
import { getDb } from "./db";
import { vouchers, voucherRedemptions, giftCardPurchases, restaurants } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import QRCode from "qrcode";

/**
 * Register Stripe webhook endpoint.
 * MUST be registered BEFORE express.json() middleware for raw body access.
 */
export function registerStripeWebhook(app: Express) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig) {
        return res.status(400).json({ error: "Missing stripe-signature header" });
      }

      let event;
      if (!ENV.stripeWebhookSecret) {
        // No webhook secret configured – parse without signature verification (development/test only)
        console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set – skipping signature verification (unsafe for production)");
        try {
          event = JSON.parse(req.body.toString());
        } catch (err: any) {
          return res.status(400).json({ error: "Invalid JSON body" });
        }
      } else {
        try {
          event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            ENV.stripeWebhookSecret
          );
        } catch (err: any) {
          console.error("[Stripe Webhook] Signature verification failed:", err.message);
          return res.status(400).json({ error: `Webhook Error: ${err.message}` });
        }
      }

      // Handle test events
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as any;
            const metadata = session.metadata || {};
            const type = metadata.type;

            if (type === "subscription_payment") {
              // Initial subscription payment
              const restaurantId = parseInt(metadata.restaurant_id);
              const contractId = parseInt(metadata.contract_id);
              const billingCycle = metadata.billing_cycle as "monthly" | "yearly";
              const monthlyAmount = parseFloat(metadata.monthly_amount);

              const subscription = await getSubscriptionByRestaurant(restaurantId);
              if (subscription) {
                // Calculate period
                const now = new Date();
                let periodEnd: Date;
                if (billingCycle === "yearly") {
                  periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
                } else {
                  // Monthly: end of current month or next month
                  periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
                }

                await updateSubscription(subscription.id, {
                  status: "active",
                  stripeCustomerId: session.customer || undefined,
                  currentPeriodStart: now,
                  currentPeriodEnd: periodEnd,
                });

                // Record payment
                await createPayment({
                  subscriptionId: subscription.id,
                  restaurantId,
                  stripePaymentIntentId: session.payment_intent || undefined,
                  amount: (session.amount_total / 100).toFixed(2),
                  currency: session.currency?.toUpperCase() || "CHF",
                  status: "succeeded",
                  description: billingCycle === "yearly"
                    ? `Jahresabo (12 Monate) – Vertrag #${contractId}`
                    : `Monatsabo – Vertrag #${contractId}`,
                  paidAt: now,
                });

                console.log(`[Stripe Webhook] Subscription ${subscription.id} activated for restaurant ${restaurantId}`);
              }
            } else if (type === "gift_card_topup") {
              // Geschenkkarte aufladen nach erfolgreicher Zahlung
              const voucherId = parseInt(metadata.voucher_id);
              const amount = parseFloat(metadata.amount);
              const buyerName = metadata.buyer_name || undefined;
              const buyerEmail = session.customer_email || undefined;

              const db = await getDb();
              if (db) {
                const [voucher] = await db.select().from(vouchers).where(eq(vouchers.id, voucherId));
                if (voucher) {
                  const balanceBefore = parseFloat(voucher.remainingBalance);
                  const balanceAfter = balanceBefore + amount;
                  const newInitial = parseFloat(voucher.initialBalance) + amount;

                  // Guthaben erhöhen
                  await db.update(vouchers).set({
                    remainingBalance: balanceAfter.toFixed(2),
                    initialBalance: newInitial.toFixed(2),
                    status: balanceAfter > 0 ? (voucher.usedCount > 0 ? "partially_redeemed" : "active") : voucher.status,
                    updatedAt: new Date(),
                  }).where(eq(vouchers.id, voucherId));

                  // Aufladung in giftCardPurchases protokollieren
                  await db.insert(giftCardPurchases).values({
                    voucherId,
                    restaurantId: voucher.restaurantId,
                    buyerName: buyerName || null,
                    buyerEmail: buyerEmail || null,
                    purchaseAmount: amount.toFixed(2),
                    paymentMethod: "card",
                    message: `Online-Aufladung via Stripe (Session: ${session.id})`,
                  });

                  console.log(`[Stripe Webhook] Gift card ${voucher.code} topped up by CHF ${amount} (new balance: ${balanceAfter})`);

                  // E-Mail-Bestätigung an Käufer senden
                  if (buyerEmail) {
                    try {
                      const [restaurant] = await db.select({ name: restaurants.name, logoUrl: restaurants.logoUrl })
                        .from(restaurants).where(eq(restaurants.id, voucher.restaurantId));
                      const restaurantName = restaurant?.name ?? "Restaurant";
                      const restaurantLogoUrl = restaurant?.logoUrl ?? null;
                      const publicUrl = `https://simplapos.com/gift/${voucher.code}`;
                      // QR-Code als Data-URL generieren
                      const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 180, margin: 1, color: { dark: "#1f2937", light: "#ffffff" } });
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
                      const html = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb">
  <!-- Header mit Logo -->
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:16px;padding:28px 24px;text-align:center;color:#fff;margin-bottom:24px">
    ${restaurantLogoUrl ? `<img src="${restaurantLogoUrl}" alt="${restaurantName}" style="width:64px;height:64px;border-radius:12px;object-fit:contain;background:#fff;padding:6px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto" />` : `<div style="font-size:40px;margin-bottom:12px">🎁</div>`}
    <h1 style="margin:0;font-size:22px;font-weight:700">Geschenkkarte aufgeladen!</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:15px">${restaurantName}</p>
  </div>
  <!-- Inhalt -->
  <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <p style="color:#374151;margin-top:0">Hallo${buyerName ? " " + buyerName : ""},</p>
    <p style="color:#374151">Deine Geschenkkarte wurde erfolgreich um <strong style="color:#7c3aed">CHF ${amount.toFixed(2)}</strong> aufgeladen.</p>
    <!-- Karten-Info -->
    <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:16px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="font-size:12px;color:#6b7280;padding-bottom:2px">Gutschein-Code</td></tr>
        <tr><td style="font-size:20px;font-weight:700;font-family:monospace;color:#1f2937;letter-spacing:3px;padding-bottom:12px">${voucher.code}</td></tr>
        <tr><td style="font-size:12px;color:#6b7280;padding-bottom:2px">Neues Guthaben</td></tr>
        <tr><td style="font-size:24px;font-weight:700;color:#059669">CHF ${balanceAfter.toFixed(2)}</td></tr>
      </table>
    </div>
    <!-- QR-Code -->
    <div style="text-align:center;margin:20px 0">
      <p style="font-size:13px;color:#6b7280;margin-bottom:8px">QR-Code zum Einlösen im Restaurant</p>
      <img src="${qrDataUrl}" alt="QR-Code" style="width:160px;height:160px;border-radius:10px;border:2px solid #e5e7eb" />
    </div>
    <a href="${publicUrl}" style="display:block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin:16px 0;font-size:15px">Guthaben ansehen &amp; Karte teilen →</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">Diese E-Mail wurde automatisch von SimplaPOS generiert.</p>
</body></html>`;
                      await transporter.sendMail({
                        from: process.env.SMTP_FROM || `"SimplaPOS" <noreply@simplapos.ch>`,
                        to: buyerEmail,
                        subject: `🎁 Geschenkkarte aufgeladen – CHF ${amount.toFixed(2)} bei ${restaurantName}`,
                        html,
                      });
                      console.log(`[Stripe Webhook] Top-up confirmation email sent to ${buyerEmail}`);
                    } catch (emailErr) {
                      console.error("[Stripe Webhook] E-Mail-Fehler:", emailErr);
                    }
                  }
                }
              }
            } else if (type === "gift_card_purchase") {
              // Neue Geschenkkarte nach erfolgreicher Zahlung erstellen
              const restaurantId = parseInt(metadata.restaurant_id);
              const amount = parseFloat(metadata.amount);
              const recipientName = metadata.recipient_name || undefined;
              const recipientEmail = metadata.recipient_email || undefined;
              const buyerName = metadata.buyer_name || undefined;
              const buyerEmail = session.customer_email || metadata.buyer_email || undefined;
              const message = metadata.message || undefined;

              const db = await getDb();
              if (db) {
                // Einzigartigen Code generieren
                const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                let code = "GK-";
                for (let i = 0; i < 8; i++) {
                  if (i === 4) code += "-";
                  code += chars[Math.floor(Math.random() * chars.length)];
                }

                // Gültigkeitsdauer: 3 Jahre
                const validFrom = new Date();
                const validUntil = new Date(validFrom.getTime() + 3 * 365 * 24 * 60 * 60 * 1000);

                // Insert (MySQL-kompatibel, kein .returning())
                await db.insert(vouchers).values({
                  restaurantId,
                  code,
                  type: "fixed",
                  value: amount.toFixed(2),
                  category: "gift_card",
                  status: "active",
                  initialBalance: amount.toFixed(2),
                  remainingBalance: amount.toFixed(2),
                  issuedTo: recipientName || buyerName || null,
                  validFrom,
                  validUntil,
                  usedCount: 0,
                  allowedRestaurantIds: JSON.stringify([restaurantId]),
                });

                // Kauf in giftCardPurchases protokollieren
                const [insertedVoucher] = await db.select().from(vouchers)
                  .where(eq(vouchers.code, code));

                if (insertedVoucher) {
                  await db.insert(giftCardPurchases).values({
                    voucherId: insertedVoucher.id,
                    restaurantId,
                    buyerName: buyerName || null,
                    buyerEmail: buyerEmail || null,
                    purchaseAmount: amount.toFixed(2),
                    paymentMethod: "card",
                    message: `Online-Kauf via Stripe (Session: ${session.id})${message ? " · " + message : ""}`,
                  });
                }

                console.log(`[Stripe Webhook] New gift card created: ${code} (CHF ${amount}, restaurant ${restaurantId})`);

                // E-Mail-Bestätigung an Käufer senden
                const emailTarget = buyerEmail || recipientEmail;
                if (emailTarget) {
                  try {
                    const [restaurant] = await db.select({ name: restaurants.name, logoUrl: restaurants.logoUrl })
                      .from(restaurants).where(eq(restaurants.id, restaurantId));
                    const restaurantName = restaurant?.name ?? "Restaurant";
                    const restaurantLogoUrl = restaurant?.logoUrl ?? null;
                    const publicUrl = `https://simplapos.com/gift/${code}`;
                    // QR-Code als Data-URL generieren
                    const qrDataUrl = await QRCode.toDataURL(publicUrl, { width: 200, margin: 1, color: { dark: "#1f2937", light: "#ffffff" } });
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

                    // ── Käufer-E-Mail (mit Preis, Quittung) ──────────────────────────
                    const buyerHtml = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb">
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:16px;padding:28px 24px;text-align:center;color:#fff;margin-bottom:24px">
    ${restaurantLogoUrl ? `<img src="${restaurantLogoUrl}" alt="${restaurantName}" style="width:64px;height:64px;border-radius:12px;object-fit:contain;background:#fff;padding:6px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto" />` : `<div style="font-size:40px;margin-bottom:12px">🎁</div>`}
    <h1 style="margin:0;font-size:22px;font-weight:700">Geschenkkarte gekauft!</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:15px">${restaurantName}</p>
  </div>
  <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <p style="color:#374151;margin-top:0">Hallo${buyerName ? " " + buyerName : ""},</p>
    <p style="color:#374151">Vielen Dank für deinen Kauf! Deine Geschenkkarte im Wert von <strong style="color:#7c3aed">CHF ${amount.toFixed(2)}</strong> wurde erfolgreich erstellt.</p>
    ${recipientName ? `<p style="color:#374151">👤 Für: <strong>${recipientName}</strong></p>` : ""}
    ${message ? `<div style="background:#faf5ff;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:10px 14px;margin:12px 0"><p style="color:#374151;font-style:italic;margin:0">"${message}"</p></div>` : ""}
    <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:16px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="font-size:12px;color:#6b7280;padding-bottom:2px">Gutschein-Code</td></tr>
        <tr><td style="font-size:20px;font-weight:700;font-family:monospace;color:#1f2937;letter-spacing:3px;padding-bottom:12px">${code}</td></tr>
        <tr>
          <td style="width:50%;vertical-align:top">
            <div style="font-size:12px;color:#6b7280;padding-bottom:2px">Bezahlter Betrag</div>
            <div style="font-size:22px;font-weight:700;color:#059669">CHF ${amount.toFixed(2)}</div>
          </td>
          <td style="width:50%;vertical-align:top">
            <div style="font-size:12px;color:#6b7280;padding-bottom:2px">Gültig bis</div>
            <div style="font-size:14px;font-weight:600;color:#374151">${validUntil.toLocaleDateString("de-CH")}</div>
          </td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin:20px 0">
      <p style="font-size:13px;color:#6b7280;margin-bottom:8px">QR-Code zum Einlösen im Restaurant</p>
      <img src="${qrDataUrl}" alt="QR-Code" style="width:160px;height:160px;border-radius:10px;border:2px solid #e5e7eb" />
    </div>
    <a href="${publicUrl}" style="display:block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin:16px 0;font-size:15px">Guthaben ansehen →</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">Diese E-Mail wurde automatisch von SimplaPOS generiert.</p>
</body></html>`;
                    await transporter.sendMail({
                      from: process.env.SMTP_FROM || `"SimplaPOS" <noreply@simplapos.ch>`,
                      to: emailTarget,
                      subject: `🎁 Deine Geschenkkarte – CHF ${amount.toFixed(2)} bei ${restaurantName}`,
                      html: buyerHtml,
                    });
                    console.log(`[Stripe Webhook] Gift card purchase confirmation email sent to ${emailTarget}`);

                    // ── Empfänger-E-Mail (ohne Preis, nur Code + Nachricht) ──────────
                    if (recipientEmail && recipientEmail !== emailTarget) {
                      const recipientHtml = `
<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb">
  <div style="background:linear-gradient(135deg,#ec4899,#8b5cf6);border-radius:16px;padding:28px 24px;text-align:center;color:#fff;margin-bottom:24px">
    ${restaurantLogoUrl ? `<img src="${restaurantLogoUrl}" alt="${restaurantName}" style="width:64px;height:64px;border-radius:12px;object-fit:contain;background:#fff;padding:6px;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto" />` : `<div style="font-size:40px;margin-bottom:12px">🎁</div>`}
    <h1 style="margin:0;font-size:22px;font-weight:700">Du hast eine Geschenkkarte erhalten!</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:15px">${restaurantName}</p>
  </div>
  <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
    <p style="color:#374151;margin-top:0">Hallo${recipientName ? " " + recipientName : ""},</p>
    <p style="color:#374151">${buyerName ? `<strong>${buyerName}</strong> hat dir eine Geschenkkarte für <strong>${restaurantName}</strong> geschenkt!` : `Du hast eine Geschenkkarte für <strong>${restaurantName}</strong> erhalten!`}</p>
    ${message ? `<div style="background:#fdf2f8;border-left:3px solid #ec4899;border-radius:0 8px 8px 0;padding:10px 14px;margin:12px 0"><p style="color:#374151;font-style:italic;margin:0">💬 "${message}"</p></div>` : ""}
    <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin:16px 0;text-align:center">
      <div style="font-size:12px;color:#6b7280;padding-bottom:6px">Dein Gutschein-Code</div>
      <div style="font-size:24px;font-weight:700;font-family:monospace;color:#1f2937;letter-spacing:4px">${code}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:8px">Gültig bis ${validUntil.toLocaleDateString("de-CH")}</div>
    </div>
    <div style="text-align:center;margin:20px 0">
      <p style="font-size:13px;color:#6b7280;margin-bottom:8px">QR-Code zum Einlösen im Restaurant</p>
      <img src="${qrDataUrl}" alt="QR-Code" style="width:160px;height:160px;border-radius:10px;border:2px solid #e5e7eb" />
    </div>
    <a href="${publicUrl}" style="display:block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:600;margin:16px 0;font-size:15px">Guthaben ansehen →</a>
  </div>
  <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">Diese E-Mail wurde automatisch von SimplaPOS generiert.</p>
</body></html>`;
                      await transporter.sendMail({
                        from: process.env.SMTP_FROM || `"SimplaPOS" <noreply@simplapos.ch>`,
                        to: recipientEmail,
                        subject: `🎁 Du hast eine Geschenkkarte erhalten! – ${restaurantName}`,
                        html: recipientHtml,
                      });
                      console.log(`[Stripe Webhook] Gift card recipient email sent to ${recipientEmail}`);
                    }
                  } catch (emailErr) {
                    console.error("[Stripe Webhook] E-Mail-Fehler:", emailErr);
                  }
                }
              }
            } else if (type === "renewal_payment") {
              // Monthly renewal payment
              const subscriptionId = parseInt(metadata.subscription_id);
              const restaurantId = parseInt(metadata.restaurant_id);

              const subscription = await getSubscriptionById(subscriptionId);
              if (subscription) {
                const now = new Date();
                const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

                await updateSubscription(subscription.id, {
                  status: "active",
                  currentPeriodStart: now,
                  currentPeriodEnd: periodEnd,
                  gracePeriodEnd: null,
                  reminderSentAt: null,
                  dueDayNotifiedAt: null,
                  blockedNotifiedAt: null,
                });

                await createPayment({
                  subscriptionId: subscription.id,
                  restaurantId,
                  stripePaymentIntentId: session.payment_intent || undefined,
                  amount: (session.amount_total / 100).toFixed(2),
                  currency: session.currency?.toUpperCase() || "CHF",
                  status: "succeeded",
                  description: "Monatliche Verlängerung",
                  paidAt: now,
                });

                console.log(`[Stripe Webhook] Subscription ${subscription.id} renewed for restaurant ${restaurantId}`);
              }
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object as any;
            console.log(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`);
            break;
          }

          default:
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (err: any) {
        console.error(`[Stripe Webhook] Error processing ${event.type}:`, err.message);
      }

      res.json({ received: true });
    }
  );
}
