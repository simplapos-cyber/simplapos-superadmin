import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { recurringInvoices } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// Zod-Schema für eine Rechnungsposition
const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default("Stk."),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().default(8.1),
});

// Zod-Schema für Erstellen/Bearbeiten
const recurringInputSchema = z.object({
  restaurantId: z.number(),
  description: z.string().min(1, "Bezeichnung erforderlich"),
  recipientName: z.string().min(1, "Empfängername erforderlich"),
  recipientEmail: z.string().email().optional().or(z.literal("")),
  recipientAddress: z.string().optional(),
  creditorName: z.string().min(1, "Kreditorname erforderlich"),
  creditorAddress: z.string().min(1, "Kreditoradresse erforderlich"),
  iban: z.string().min(15, "Gültige IBAN erforderlich"),
  currency: z.string().default("CHF"),
  interval: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  intervalDay: z.number().int().min(1).max(28).default(1),
  discountPercent: z.number().min(0).max(100).default(0),
  paymentTermDays: z.number().int().min(1).max(365).default(30),
  additionalInfo: z.string().max(140).optional(),
  internalNotes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, "Mindestens eine Position erforderlich"),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  maxOccurrences: z.number().int().positive().optional(),
  mandateId: z.number().optional(),
});

export const recurringInvoiceRouter = router({
  // ── Liste aller wiederkehrenden Rechnungen ────────────────────────────────
  list: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(recurringInvoices)
        .where(eq(recurringInvoices.restaurantId, input.restaurantId))
        .orderBy(desc(recurringInvoices.createdAt));
      return rows;
    }),

  // ── Einzelne wiederkehrende Rechnung ──────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select()
        .from(recurringInvoices)
        .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.restaurantId, input.restaurantId)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  // ── Erstellen ─────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(recurringInputSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(recurringInvoices).values({
        restaurantId: input.restaurantId,
        mandateId: input.mandateId,
        description: input.description,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail || null,
        recipientAddress: input.recipientAddress || null,
        creditorName: input.creditorName,
        creditorAddress: input.creditorAddress,
        iban: input.iban.replace(/\s/g, "").toUpperCase(),
        currency: input.currency,
        interval: input.interval,
        intervalDay: input.intervalDay,
        discountPercent: String(input.discountPercent.toFixed(2)),
        paymentTermDays: input.paymentTermDays,
        additionalInfo: input.additionalInfo || null,
        internalNotes: input.internalNotes || null,
        lineItems: input.lineItems,
        active: true,
        nextDueDate: input.nextDueDate,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        maxOccurrences: input.maxOccurrences || null,
        totalCreated: 0,
      });
      return { success: true, id: (result as any).insertId };
    }),

  // ── Bearbeiten ────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(recurringInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select()
        .from(recurringInvoices)
        .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.restaurantId, input.restaurantId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(recurringInvoices).set({
        description: input.description,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail || null,
        recipientAddress: input.recipientAddress || null,
        creditorName: input.creditorName,
        creditorAddress: input.creditorAddress,
        iban: input.iban.replace(/\s/g, "").toUpperCase(),
        currency: input.currency,
        interval: input.interval,
        intervalDay: input.intervalDay,
        discountPercent: String(input.discountPercent.toFixed(2)),
        paymentTermDays: input.paymentTermDays,
        additionalInfo: input.additionalInfo || null,
        internalNotes: input.internalNotes || null,
        lineItems: input.lineItems,
        nextDueDate: input.nextDueDate,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        maxOccurrences: input.maxOccurrences || null,
        mandateId: input.mandateId || null,
      }).where(eq(recurringInvoices.id, input.id));
      return { success: true };
    }),

  // ── Aktivieren / Pausieren ────────────────────────────────────────────────
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(recurringInvoices).set({ active: input.active })
        .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  // ── Löschen ───────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(recurringInvoices)
        .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  // ── Vorschau nächste Rechnung ─────────────────────────────────────────────
  previewNextInvoice: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [rec] = await db
        .select()
        .from(recurringInvoices)
        .where(and(eq(recurringInvoices.id, input.id), eq(recurringInvoices.restaurantId, input.restaurantId)));
      if (!rec) throw new TRPCError({ code: "NOT_FOUND" });
      type LineItem = { description: string; quantity: number; unit: string; unitPrice: number; taxRate: number };
      const items = (rec.lineItems as LineItem[]) || [];
      const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const taxTotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice * i.taxRate / (100 + i.taxRate)), 0);
      const discount = subtotal * (Number(rec.discountPercent) / 100);
      const total = subtotal - discount;
      const dueDate = new Date(rec.nextDueDate);
      dueDate.setDate(dueDate.getDate() + (rec.paymentTermDays || 30));
      return {
        recipientName: rec.recipientName,
        recipientEmail: rec.recipientEmail,
        recipientAddress: rec.recipientAddress,
        creditorName: rec.creditorName,
        iban: rec.iban,
        currency: rec.currency,
        interval: rec.interval,
        nextDueDate: rec.nextDueDate,
        dueDate: dueDate.toISOString().split("T")[0],
        paymentTermDays: rec.paymentTermDays,
        discountPercent: rec.discountPercent,
        additionalInfo: rec.additionalInfo,
        lineItems: items,
        subtotal: subtotal.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        discount: discount.toFixed(2),
        total: total.toFixed(2),
        totalCreated: rec.totalCreated,
        maxOccurrences: rec.maxOccurrences,
        remainingOccurrences: rec.maxOccurrences ? rec.maxOccurrences - rec.totalCreated : null,
      };
    }),

  // ── Statistiken ───────────────────────────────────────────────────────────
  getStats: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(recurringInvoices)
        .where(eq(recurringInvoices.restaurantId, input.restaurantId));
      type Row = typeof rows[number];
      const total = rows.length;
      const active = rows.filter((r: Row) => r.active).length;
      const paused = rows.filter((r: Row) => !r.active).length;
      const today = new Date().toISOString().split("T")[0];
      const dueSoon = rows.filter((r: Row) => r.active && r.nextDueDate <= today).length;
      const totalCreated = rows.reduce((s: number, r: Row) => s + (r.totalCreated || 0), 0);
      return { total, active, paused, dueSoon, totalCreated };
    }),
});
