import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  paytecConfigs,
  paytecTransactions,
  nexiConfigs,
  nexiTransactions,
} from "../drizzle/schema";

// ─── PayTec KIT REST Helper ───────────────────────────────────────────────────
async function paytecRequest(
  baseUrl: string,
  apiKey: string | null | undefined,
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: object
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, data, error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Nexi ZVT-LAN Helper (TCP socket via HTTP proxy) ─────────────────────────
// Nexi terminals speak ZVT-LAN (binary) or OPI (XML) over TCP.
// From a cloud server we cannot open raw TCP to a restaurant LAN terminal.
// We model the integration as "manual confirmation" – the server records the
// transaction intent, the cashier confirms on the physical terminal, and the
// result is entered back into the system. This is the standard approach for
// cloud-based POS systems with Nexi/Concardis until a local bridge is installed.
async function nexiInitiate(
  ip: string,
  port: number,
  amount: number,
  ref: string
): Promise<{ ok: boolean; message: string }> {
  // In production: a local bridge app on the restaurant LAN would forward
  // this request to the terminal. For now we return a "pending manual" result.
  console.log(`[Nexi] Initiating payment CHF ${amount} on ${ip}:${port} ref=${ref}`);
  return { ok: true, message: "pending_manual" };
}

// ─── PayTec Router ────────────────────────────────────────────────────────────
export const paytecRouter = router({
  // Get config
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const [cfg] = await db
      .select()
      .from(paytecConfigs)
      .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
    return cfg ?? null;
  }),

  // Save config
  saveConfig: protectedProcedure
    .input(
      z.object({
        kitRestUrl: z.string().url().default("https://kitrest.paytec.ch"),
        terminalId: z.string().min(1),
        apiKey: z.string().optional(),
        currency: z.string().default("CHF"),
        tipEnabled: z.boolean().default(false),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: paytecConfigs.id })
        .from(paytecConfigs)
        .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
      if (existing.length > 0) {
        await db
          .update(paytecConfigs)
          .set({ ...input })
          .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
      } else {
        await db.insert(paytecConfigs).values({
          restaurantId: ctx.user.restaurantId!,
          ...input,
        });
      }
      return { success: true };
    }),

  // Test connection
  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    const [cfg] = await db
      .select()
      .from(paytecConfigs)
      .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
    if (!cfg) return { ok: false, error: "Keine Konfiguration gefunden" };
    const result = await paytecRequest(cfg.kitRestUrl, cfg.apiKey, "/api/v1/terminals", "GET");
    return result;
  }),

  // List terminals
  listTerminals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const [cfg] = await db
      .select()
      .from(paytecConfigs)
      .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
    if (!cfg) return [];
    const result = await paytecRequest(cfg.kitRestUrl, cfg.apiKey, "/api/v1/terminals", "GET");
    if (!result.ok) return [];
    return (result.data as { terminals?: unknown[] })?.terminals ?? [];
  }),

  // Initiate payment
  initiatePayment: protectedProcedure
    .input(
      z.object({
        orderId: z.number().optional(),
        amount: z.number().positive(),
        tipAmount: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [cfg] = await db
        .select()
        .from(paytecConfigs)
        .where(
          and(
            eq(paytecConfigs.restaurantId, ctx.user.restaurantId!),
            eq(paytecConfigs.isActive, true)
          )
        );
      if (!cfg) throw new Error("PayTec nicht konfiguriert");

      const ref = `SYNCL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // Insert pending transaction
      const [inserted] = await db
        .insert(paytecTransactions)
        .values({
          restaurantId: ctx.user.restaurantId!,
          orderId: input.orderId,
          transactionRef: ref,
          terminalId: cfg.terminalId,
          amount: input.amount.toFixed(2),
          currency: cfg.currency,
          tipAmount: input.tipAmount.toFixed(2),
          status: "pending",
          initiatedByUserId: ctx.user.id,
          initiatedByName: ctx.user.name ?? ctx.user.email,
        });

      const txId = (inserted as { insertId?: number })?.insertId;

      // Call PayTec KIT REST
      const body = {
        terminalId: cfg.terminalId,
        amount: Math.round(input.amount * 100), // in Rappen
        currency: cfg.currency,
        reference: ref,
        tip: cfg.tipEnabled ? Math.round(input.tipAmount * 100) : 0,
      };
      const result = await paytecRequest(
        cfg.kitRestUrl,
        cfg.apiKey,
        "/api/v1/transactions",
        "POST",
        body
      );

      if (!result.ok) {
        if (txId) {
          await db
            .update(paytecTransactions)
            .set({ status: "error", errorMessage: result.error })
            .where(eq(paytecTransactions.id, txId));
        }
        return { ok: false, error: result.error, transactionId: txId };
      }

      return { ok: true, transactionId: txId, ref, data: result.data };
    }),

  // Get transaction status
  getTransactionStatus: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [tx] = await db
        .select()
        .from(paytecTransactions)
        .where(
          and(
            eq(paytecTransactions.id, input.transactionId),
            eq(paytecTransactions.restaurantId, ctx.user.restaurantId!)
          )
        );
      if (!tx) return null;

      if (tx.status === "pending") {
        const [cfg] = await db
          .select()
          .from(paytecConfigs)
          .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
        if (cfg) {
          const result = await paytecRequest(
            cfg.kitRestUrl,
            cfg.apiKey,
            `/api/v1/transactions/${tx.transactionRef}`,
            "GET"
          );
          if (result.ok) {
            const d = result.data as Record<string, unknown>;
            const newStatus =
              d?.status === "approved"
                ? "approved"
                : d?.status === "declined"
                ? "declined"
                : d?.status === "cancelled"
                ? "cancelled"
                : "pending";
            await db
              .update(paytecTransactions)
              .set({
                status: newStatus as "pending" | "approved" | "declined" | "cancelled" | "error",
                authCode: (d?.authCode as string) ?? undefined,
                cardType: (d?.cardType as string) ?? undefined,
                maskedPan: (d?.maskedPan as string) ?? undefined,
                rawResponse: d,
                completedAt: newStatus !== "pending" ? new Date() : undefined,
              })
              .where(eq(paytecTransactions.id, tx.id));
            return { ...tx, status: newStatus };
          }
        }
      }
      return tx;
    }),

  // Cancel transaction
  cancelTransaction: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [tx] = await db
        .select()
        .from(paytecTransactions)
        .where(
          and(
            eq(paytecTransactions.id, input.transactionId),
            eq(paytecTransactions.restaurantId, ctx.user.restaurantId!)
          )
        );
      if (!tx) return { ok: false, error: "Transaktion nicht gefunden" };

      const [cfg] = await db
        .select()
        .from(paytecConfigs)
        .where(eq(paytecConfigs.restaurantId, ctx.user.restaurantId!));
      if (cfg) {
        await paytecRequest(
          cfg.kitRestUrl,
          cfg.apiKey,
          `/api/v1/transactions/${tx.transactionRef}`,
          "DELETE"
        );
      }
      await db
        .update(paytecTransactions)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(eq(paytecTransactions.id, tx.id));
      return { ok: true };
    }),

  // List transactions
  listTransactions: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      return db
        .select()
        .from(paytecTransactions)
        .where(eq(paytecTransactions.restaurantId, ctx.user.restaurantId!))
        .orderBy(desc(paytecTransactions.createdAt))
        .limit(input.limit);
    }),
});

// ─── Nexi Router ──────────────────────────────────────────────────────────────
export const nexiRouter = router({
  // Get config
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const [cfg] = await db
      .select()
      .from(nexiConfigs)
      .where(eq(nexiConfigs.restaurantId, ctx.user.restaurantId!));
    return cfg ?? null;
  }),

  // Save config
  saveConfig: protectedProcedure
    .input(
      z.object({
        terminalIp: z.string().min(7),
        terminalPort: z.number().default(20007),
        merchantId: z.string().optional(),
        apiKey: z.string().optional(),
        currency: z.string().default("CHF"),
        protocol: z.enum(["zvt_lan", "opi", "rest"]).default("zvt_lan"),
        tipEnabled: z.boolean().default(false),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: nexiConfigs.id })
        .from(nexiConfigs)
        .where(eq(nexiConfigs.restaurantId, ctx.user.restaurantId!));
      if (existing.length > 0) {
        await db
          .update(nexiConfigs)
          .set({ ...input })
          .where(eq(nexiConfigs.restaurantId, ctx.user.restaurantId!));
      } else {
        await db.insert(nexiConfigs).values({
          restaurantId: ctx.user.restaurantId!,
          ...input,
        });
      }
      return { success: true };
    }),

  // Initiate payment
  initiatePayment: protectedProcedure
    .input(
      z.object({
        orderId: z.number().optional(),
        amount: z.number().positive(),
        tipAmount: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [cfg] = await db
        .select()
        .from(nexiConfigs)
        .where(
          and(
            eq(nexiConfigs.restaurantId, ctx.user.restaurantId!),
            eq(nexiConfigs.isActive, true)
          )
        );
      if (!cfg) throw new Error("Nexi nicht konfiguriert");

      const ref = `NEXI-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      const [inserted] = await db
        .insert(nexiTransactions)
        .values({
          restaurantId: ctx.user.restaurantId!,
          orderId: input.orderId,
          transactionRef: ref,
          terminalIp: cfg.terminalIp,
          amount: input.amount.toFixed(2),
          currency: cfg.currency,
          tipAmount: input.tipAmount.toFixed(2),
          status: "pending",
          initiatedByUserId: ctx.user.id,
          initiatedByName: ctx.user.name ?? ctx.user.email,
        });

      const txId = (inserted as { insertId?: number })?.insertId;

      // Attempt ZVT-LAN / bridge
      const result = await nexiInitiate(cfg.terminalIp, cfg.terminalPort, input.amount, ref);

      return {
        ok: result.ok,
        transactionId: txId,
        ref,
        manualConfirmRequired: result.message === "pending_manual",
        message: result.message,
      };
    }),

  // Manual confirm (cashier confirms payment was accepted on terminal)
  confirmPayment: protectedProcedure
    .input(
      z.object({
        transactionId: z.number(),
        authCode: z.string().optional(),
        cardType: z.string().optional(),
        maskedPan: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(nexiTransactions)
        .set({
          status: "approved",
          authCode: input.authCode,
          cardType: input.cardType,
          maskedPan: input.maskedPan,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(nexiTransactions.id, input.transactionId),
            eq(nexiTransactions.restaurantId, ctx.user.restaurantId!)
          )
        );
      return { ok: true };
    }),

  // Manual decline
  declinePayment: protectedProcedure
    .input(z.object({ transactionId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(nexiTransactions)
        .set({
          status: "declined",
          errorMessage: input.reason ?? "Manuell abgebrochen",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(nexiTransactions.id, input.transactionId),
            eq(nexiTransactions.restaurantId, ctx.user.restaurantId!)
          )
        );
      return { ok: true };
    }),

  // Get transaction status
  getTransactionStatus: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [tx] = await db
        .select()
        .from(nexiTransactions)
        .where(
          and(
            eq(nexiTransactions.id, input.transactionId),
            eq(nexiTransactions.restaurantId, ctx.user.restaurantId!)
          )
        );
      return tx ?? null;
    }),

  // List transactions
  listTransactions: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      return db
        .select()
        .from(nexiTransactions)
        .where(eq(nexiTransactions.restaurantId, ctx.user.restaurantId!))
        .orderBy(desc(nexiTransactions.createdAt))
        .limit(input.limit);
    }),
});
