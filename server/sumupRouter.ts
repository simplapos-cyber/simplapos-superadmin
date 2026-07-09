/**
 * sumupRouter.ts
 * SumUp Kartenterminal-Integration
 *
 * Funktionen:
 * - getConfig / saveConfig: SumUp-Zugangsdaten pro Restaurant verwalten
 * - listReaders: Verfügbare Terminals von SumUp API abrufen
 * - createCheckout: Zahlung auf Terminal auslösen
 * - getTransactionStatus: Zahlungsstatus abfragen (Polling)
 * - terminateCheckout: Laufende Zahlung abbrechen
 * - listTransactions: Zahlungshistorie
 * - webhook: SumUp-Webhook-Empfang (Zahlungsbestätigung)
 */

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { sumupConfigs, sumupTransactions } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";

// ─── SumUp API Helper ─────────────────────────────────────────────────────────

const SUMUP_API_BASE = "https://api.sumup.com";

async function sumupRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${SUMUP_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errorText = "";
    try {
      const errJson = await res.json() as { message?: string; error_message?: string };
      errorText = errJson.message || errJson.error_message || res.statusText;
    } catch {
      errorText = res.statusText;
    }
    throw new TRPCError({
      code: res.status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST",
      message: `SumUp API Fehler (${res.status}): ${errorText}`,
    });
  }

  return res.json();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const sumupRouter = router({

  // ── Konfiguration lesen ──────────────────────────────────────────────────────
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) return null;

    const [config] = await db
      .select()
      .from(sumupConfigs)
      .where(eq(sumupConfigs.restaurantId, restaurantId))
      .limit(1);

    if (!config) return null;

    // API-Key aus Sicherheitsgründen maskieren
    return {
      ...config,
      apiKey: config.apiKey ? `****${config.apiKey.slice(-6)}` : "",
      hasApiKey: !!config.apiKey,
    };
  }),

  // ── Konfiguration speichern ──────────────────────────────────────────────────
  saveConfig: protectedProcedure
    .input(z.object({
      apiKey: z.string().optional(),         // optional: nur setzen wenn neu eingegeben
      merchantCode: z.string().min(1),
      defaultReaderId: z.string().optional(),
      defaultReaderName: z.string().optional(),
      tipEnabled: z.boolean().default(false),
      tipRates: z.array(z.number().min(0.01).max(0.99)).optional(),
      tipTimeout: z.number().min(30).max(120).default(30),
      webhookUrl: z.string().url().optional().or(z.literal("")),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [existing] = await db
        .select()
        .from(sumupConfigs)
        .where(eq(sumupConfigs.restaurantId, restaurantId))
        .limit(1);

      const data = {
        merchantCode: input.merchantCode,
        defaultReaderId: input.defaultReaderId ?? null,
        defaultReaderName: input.defaultReaderName ?? null,
        tipEnabled: input.tipEnabled,
        tipRates: input.tipRates ?? null,
        tipTimeout: input.tipTimeout,
        webhookUrl: input.webhookUrl || null,
        isActive: input.isActive,
      };

      if (existing) {
        await db
          .update(sumupConfigs)
          .set({
            ...data,
            // Nur überschreiben wenn neuer Key eingegeben (nicht maskierter Wert)
            ...(input.apiKey && !input.apiKey.startsWith("****")
              ? { apiKey: input.apiKey }
              : {}),
          })
          .where(eq(sumupConfigs.restaurantId, restaurantId));
      } else {
        if (!input.apiKey) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "API-Key ist erforderlich" });
        }
        await db.insert(sumupConfigs).values({
          restaurantId,
          apiKey: input.apiKey,
          ...data,
        });
      }

      return { success: true };
    }),

  // ── Terminals (Readers) von SumUp abrufen ────────────────────────────────────
  listReaders: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) return [];

    const [config] = await db
      .select()
      .from(sumupConfigs)
      .where(and(eq(sumupConfigs.restaurantId, restaurantId), eq(sumupConfigs.isActive, true)))
      .limit(1);

    if (!config) return [];

    try {
      const data = await sumupRequest(
        config.apiKey,
        "GET",
        `/v0.1/merchants/${config.merchantCode}/readers`
      ) as { items?: Array<{ id: string; name: string; status: string; device?: { model?: string; identifier?: string } }> };

      return (data.items ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        model: r.device?.model ?? "unknown",
        identifier: r.device?.identifier ?? "",
        isDefault: r.id === config.defaultReaderId,
      }));
    } catch {
      return [];
    }
  }),

  // ── Zahlung auf Terminal auslösen ────────────────────────────────────────────
  createCheckout: protectedProcedure
    .input(z.object({
      orderId: z.number().optional(),
      amount: z.number().positive(),           // in CHF (z.B. 42.50)
      currency: z.string().default("CHF"),
      readerId: z.string().optional(),          // falls leer → defaultReaderId
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [config] = await db
        .select()
        .from(sumupConfigs)
        .where(and(eq(sumupConfigs.restaurantId, restaurantId), eq(sumupConfigs.isActive, true)))
        .limit(1);

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SumUp nicht konfiguriert" });
      }

      const readerId = input.readerId ?? config.defaultReaderId;
      if (!readerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Terminal ausgewählt" });
      }

      // Betrag in Minor Units (Rappen) umrechnen
      const minorUnit = 2;
      const amountValue = Math.round(input.amount * Math.pow(10, minorUnit));

      const checkoutReference = `synclapos-${randomUUID()}`;

      // Checkout-Body aufbauen
      const checkoutBody: Record<string, unknown> = {
        total_amount: {
          currency: input.currency,
          minor_unit: minorUnit,
          value: amountValue,
        },
        description: input.description ?? `Tisch ${input.orderId ?? ""}`.trim(),
      };

      // Trinkgeld-Optionen
      if (config.tipEnabled && config.tipRates) {
        checkoutBody.tip_rates = config.tipRates;
        checkoutBody.tip_timeout = config.tipTimeout ?? 30;
      }

      // Zahlung auslösen
      const response = await sumupRequest(
        config.apiKey,
        "POST",
        `/v0.1/merchants/${config.merchantCode}/readers/${readerId}/checkout`,
        checkoutBody
      ) as { data?: { client_transaction_id?: string } };

      const clientTransactionId = response.data?.client_transaction_id ?? null;

      // Transaktion in DB speichern
      const [inserted] = await db
        .insert(sumupTransactions)
        .values({
          restaurantId,
          orderId: input.orderId ?? null,
          clientTransactionId,
          checkoutReference,
          readerId,
          amount: String(input.amount),
          currency: input.currency,
          status: "pending",
          initiatedByUserId: ctx.user.id,
          initiatedByName: ctx.user.name ?? ctx.user.email,
          rawResponse: response as Record<string, unknown>,
        })
        .$returningId();

      return {
        success: true,
        transactionId: inserted.id,
        clientTransactionId,
        checkoutReference,
      };
    }),

  // ── Zahlungsstatus abfragen (Polling) ────────────────────────────────────────
  getTransactionStatus: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [tx] = await db
        .select()
        .from(sumupTransactions)
        .where(and(
          eq(sumupTransactions.id, input.transactionId),
          eq(sumupTransactions.restaurantId, restaurantId)
        ))
        .limit(1);

      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });

      // Wenn bereits abgeschlossen, direkt zurückgeben
      if (["paid", "failed", "cancelled", "expired", "refunded"].includes(tx.status)) {
        return tx;
      }

      // Aktuellen Status von SumUp holen (via Transactions API)
      const [config] = await db
        .select()
        .from(sumupConfigs)
        .where(eq(sumupConfigs.restaurantId, restaurantId))
        .limit(1);

      if (config && tx.clientTransactionId) {
        try {
          const txData = await sumupRequest(
            config.apiKey,
            "GET",
            `/v0.1/me/transactions?client_transaction_id=${tx.clientTransactionId}`
          ) as { items?: Array<{
            status?: string;
            transaction_code?: string;
            id?: string;
            payment_type?: string;
            entry_mode?: string;
            auth_code?: string;
            tip_amount?: number;
          }> };

          const sumupTx = txData.items?.[0];
          if (sumupTx) {
            const newStatus = mapSumupStatus(sumupTx.status ?? "");
            await db
              .update(sumupTransactions)
              .set({
                status: newStatus,
                sumupTransactionCode: sumupTx.transaction_code ?? null,
                sumupTransactionId: sumupTx.id ?? null,
                paymentType: sumupTx.payment_type ?? null,
                entryMode: sumupTx.entry_mode ?? null,
                authCode: sumupTx.auth_code ?? null,
                tipAmount: String(sumupTx.tip_amount ?? 0),
                completedAt: ["paid", "failed", "cancelled"].includes(newStatus)
                  ? new Date()
                  : null,
                rawResponse: txData as Record<string, unknown>,
              })
              .where(eq(sumupTransactions.id, tx.id));

            return { ...tx, status: newStatus };
          }
        } catch {
          // Fehler beim Status-Abruf ignorieren, lokalen Status zurückgeben
        }
      }

      return tx;
    }),

  // ── Laufende Zahlung abbrechen ───────────────────────────────────────────────
  terminateCheckout: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN" });

      const [tx] = await db
        .select()
        .from(sumupTransactions)
        .where(and(
          eq(sumupTransactions.id, input.transactionId),
          eq(sumupTransactions.restaurantId, restaurantId)
        ))
        .limit(1);

      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      if (tx.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Zahlung ist nicht mehr aktiv" });
      }

      const [config] = await db
        .select()
        .from(sumupConfigs)
        .where(eq(sumupConfigs.restaurantId, restaurantId))
        .limit(1);

      if (config) {
        try {
          await sumupRequest(
            config.apiKey,
            "POST",
            `/v0.1/merchants/${config.merchantCode}/readers/${tx.readerId}/terminate`
          );
        } catch {
          // Fehler ignorieren – Terminal war evtl. schon fertig
        }
      }

      await db
        .update(sumupTransactions)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(eq(sumupTransactions.id, tx.id));

      return { success: true };
    }),

  // ── Zahlungshistorie ─────────────────────────────────────────────────────────
  listTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      orderId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) return [];

      if (input.orderId) {
        return db
          .select()
          .from(sumupTransactions)
          .where(and(
            eq(sumupTransactions.restaurantId, restaurantId),
            eq(sumupTransactions.orderId, input.orderId)
          ))
          .orderBy(desc(sumupTransactions.createdAt))
          .limit(input.limit);
      }

      return db
        .select()
        .from(sumupTransactions)
        .where(eq(sumupTransactions.restaurantId, restaurantId))
        .orderBy(desc(sumupTransactions.createdAt))
        .limit(input.limit);
    }),

  // ── Webhook-Empfang (öffentlich, SumUp ruft uns auf) ────────────────────────
  webhook: publicProcedure
    .input(z.object({
      event_type: z.string().optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      // Webhook-Payload verarbeiten
      // SumUp sendet: { event_type: "PAYMENT", payload: { status, transaction_code, ... } }
      const db = await getDb();
      const payload = input.payload as Record<string, unknown> | undefined;

      if (payload?.client_transaction_id) {
        const clientTxId = String(payload.client_transaction_id);
        const newStatus = mapSumupStatus(String(payload.status ?? ""));

        await db
          .update(sumupTransactions)
          .set({
            status: newStatus,
            sumupTransactionCode: payload.transaction_code ? String(payload.transaction_code) : null,
            completedAt: new Date(),
            rawResponse: payload,
          })
          .where(eq(sumupTransactions.clientTransactionId, clientTxId));
      }

      return { received: true };
    }),
});

// ─── Hilfsfunktion: SumUp-Status → interner Status ───────────────────────────

function mapSumupStatus(sumupStatus: string): "pending" | "paid" | "failed" | "cancelled" | "expired" | "refunded" {
  switch (sumupStatus.toUpperCase()) {
    case "SUCCESSFUL":
    case "PAID":
      return "paid";
    case "FAILED":
    case "ERROR":
      return "failed";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    case "REFUNDED":
      return "refunded";
    default:
      return "pending";
  }
}
