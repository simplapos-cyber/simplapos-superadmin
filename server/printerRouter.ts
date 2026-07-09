/**
 * printerRouter.ts
 * Vollständiges Bondrucker-System für Synclapos
 *
 * Funktionen:
 * - Drucker verwalten (CRUD) pro Restaurant
 * - Routing: Welche Kategorie/Typ → welcher Drucker
 * - ESC/POS Bon-Generierung (Küche, Bar, Gast, Tagesabschluss)
 * - Druckauftrag via Netzwerk (TCP/IP Port 9100)
 * - Testdruck, Nachdruck, Druckauftrags-Log
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  printers, printerRoutes, printJobs,
  menuCategories, menuTopCategories, menuItems, orders, orderItems, restaurants,
  localConnectDevices, localConnectJobs,
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import * as net from "net";

// ─── ESC/POS Konstanten ───────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;

const CMD = {
  INIT:           Buffer.from([ESC, 0x40]),
  ALIGN_LEFT:     Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER:   Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:    Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON:        Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:       Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_HEIGHT:  Buffer.from([ESC, 0x21, 0x10]),
  NORMAL_SIZE:    Buffer.from([ESC, 0x21, 0x00]),
  UNDERLINE_ON:   Buffer.from([ESC, 0x2d, 0x01]),
  UNDERLINE_OFF:  Buffer.from([ESC, 0x2d, 0x00]),
  FEED_LINE:      Buffer.from([0x0a]),
  FEED_3:         Buffer.from([ESC, 0x64, 0x03]),
  FEED_5:         Buffer.from([ESC, 0x64, 0x05]),
  CUT_FULL:       Buffer.from([GS, 0x56, 0x00]),
  CUT_PARTIAL:    Buffer.from([GS, 0x56, 0x01]),
  CASH_DRAWER:    Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
  INVERT_ON:      Buffer.from([GS, 0x42, 0x01]),
  INVERT_OFF:     Buffer.from([GS, 0x42, 0x00]),
};

// ─── ESC/POS Hilfsfunktionen ──────────────────────────────────────────────────

function encodeText(text: string): Buffer {
  return Buffer.from(text, "latin1");
}

function lineStr(chars: number, char = "-"): string {
  return char.repeat(chars);
}

function padRight(text: string, width: number): string {
  return text.substring(0, width).padEnd(width, " ");
}

function padLeft(text: string, width: number): string {
  return text.substring(0, width).padStart(width, " ");
}

function twoCol(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1;
  return padRight(left, maxLeft) + " " + right;
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= width) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word.substring(0, width);
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Bon-Typen ────────────────────────────────────────────────────────────────

interface PrinterConfig {
  charsPerLine: number;
  autoCut: boolean;
  openCashDrawer: boolean;
  headerLine1?: string | null;
  headerLine2?: string | null;
  footerLine1?: string | null;
  footerLine2?: string | null;
  name: string;
  printCopies: number;
}

interface OrderItemLine {
  quantity: number;
  name: string;
  variant?: string | null;
  notes?: string | null;
  modifiers?: string | null;
  course?: number | null;
  priority?: string | null;
  unitPrice?: number;
}

// ─── Küchenbon / Barbon ───────────────────────────────────────────────────────

function buildKitchenBon(params: {
  printer: PrinterConfig;
  tableNumber: string | number;
  waiterName: string;
  orderNumber: string;
  items: OrderItemLine[];
  bonType: string;
  timestamp: Date;
}): Buffer {
  const W = params.printer.charsPerLine;
  const parts: Buffer[] = [];
  const add = (...bufs: Buffer[]) => parts.push(...bufs);
  const text = (t: string) => { add(encodeText(t), CMD.FEED_LINE); };

  add(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  text(params.bonType.toUpperCase());
  add(CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.ALIGN_LEFT);
  text(lineStr(W, "="));
  add(CMD.BOLD_ON);
  text(`TISCH: ${params.tableNumber}`);
  add(CMD.BOLD_OFF);
  text(`Kellner: ${params.waiterName}`);
  text(`Bon-Nr.: ${params.orderNumber}`);
  text(`Zeit:    ${params.timestamp.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`);
  text(lineStr(W, "="));

  // Artikel nach Gang gruppieren
  const byCourse: Record<number, OrderItemLine[]> = {};
  for (const item of params.items) {
    const c = item.course ?? 1;
    if (!byCourse[c]) byCourse[c] = [];
    byCourse[c].push(item);
  }

  const courseNums = Object.keys(byCourse).map(Number).sort();
  for (const courseNum of courseNums) {
    if (courseNums.length > 1) {
      add(CMD.INVERT_ON, CMD.BOLD_ON);
      text(` GANG ${courseNum} `.padEnd(W, " "));
      add(CMD.INVERT_OFF, CMD.BOLD_OFF);
    }
    for (const item of byCourse[courseNum]) {
      add(CMD.BOLD_ON);
      text(`${item.quantity}x ${item.name}`);
      add(CMD.BOLD_OFF);
      if (item.variant) text(`   -> ${item.variant}`);
      if (item.modifiers) {
        try {
          const mods = JSON.parse(item.modifiers);
          if (Array.isArray(mods)) {
            for (const m of mods as Array<{ name?: string }>) text(`   + ${m.name ?? String(m)}`);
          }
        } catch { text(`   + ${item.modifiers}`); }
      }
      if (item.notes) {
        add(CMD.UNDERLINE_ON);
        for (const l of wrapText(`   ! ${item.notes}`, W)) text(l);
        add(CMD.UNDERLINE_OFF);
      }
      if (item.priority === "high") {
        add(CMD.INVERT_ON);
        text(" !! DRINGEND !! ");
        add(CMD.INVERT_OFF);
      }
    }
    text(lineStr(W, "-"));
  }

  add(CMD.FEED_3);
  if (params.printer.autoCut) add(CMD.CUT_PARTIAL);
  return Buffer.concat(parts);
}

// ─── Gastbon ─────────────────────────────────────────────────────────────────

function buildReceiptBon(params: {
  printer: PrinterConfig;
  restaurantName: string;
  restaurantAddress?: string | null;
  restaurantPhone?: string | null;
  restaurantWebsite?: string | null;
  restaurantVat?: string | null;
  tableNumber: string | number;
  orderNumber: string;
  items: (OrderItemLine & { unitPrice: number })[];
  subtotal: number;
  discount?: number;
  tip?: number;
  total: number;
  vatLines: { rate: string; amount: number }[];
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  timestamp: Date;
  // Marketing
  receiptSlogan?: string | null;
  receiptWifiName?: string | null;
  receiptWifiPassword?: string | null;
  receiptDiscountCode?: string | null;
  receiptDiscountPercent?: number | null;
  receiptShowSocial?: boolean | null;
  receiptShowGoogleReview?: boolean | null;
  receiptCustomMessage?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  googleMapsUrl?: string | null;
  tripadvisorUrl?: string | null;
}): Buffer {
  const W = params.printer.charsPerLine;
  const parts: Buffer[] = [];
  const add = (...bufs: Buffer[]) => parts.push(...bufs);
  const text = (t: string) => { add(encodeText(t), CMD.FEED_LINE); };
  const fmt = (n: number) => `CHF ${n.toFixed(2)}`;

  add(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  for (const l of wrapText(params.restaurantName, W)) text(l);
  add(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  if (params.restaurantAddress) for (const l of wrapText(params.restaurantAddress, W)) text(l);
  if (params.restaurantPhone) text(params.restaurantPhone);
  if (params.restaurantWebsite) text(params.restaurantWebsite);
  if (params.restaurantVat) text(`MwSt-Nr: ${params.restaurantVat}`);
  text(lineStr(W, "-"));

  add(CMD.ALIGN_LEFT);
  text(`Tisch:   ${params.tableNumber}`);
  text(`Bon-Nr.: ${params.orderNumber}`);
  text(`Datum:   ${params.timestamp.toLocaleDateString("de-CH")} ${params.timestamp.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`);
  text(lineStr(W, "="));

  for (const item of params.items) {
    const priceStr = fmt(item.quantity * item.unitPrice);
    text(twoCol(`${item.quantity}x ${item.name}`, priceStr, W));
    if (item.variant) text(`   ${item.variant}`);
    if (item.modifiers) {
      try {
        const mods = JSON.parse(item.modifiers);
        if (Array.isArray(mods)) for (const m of mods as Array<{ name?: string }>) text(`   + ${m.name ?? String(m)}`);
      } catch { /* ignore */ }
    }
  }

  text(lineStr(W, "-"));
  text(twoCol("Zwischensumme", fmt(params.subtotal), W));
  if (params.discount && params.discount > 0) text(twoCol("Rabatt", `-${fmt(params.discount)}`, W));
  if (params.tip && params.tip > 0) text(twoCol("Trinkgeld", fmt(params.tip), W));
  text(lineStr(W, "="));
  add(CMD.BOLD_ON);
  text(twoCol("TOTAL", fmt(params.total), W));
  add(CMD.BOLD_OFF);
  text(lineStr(W, "-"));
  for (const vat of params.vatLines) text(twoCol(`MwSt ${vat.rate}%`, fmt(vat.amount), W));
  text(lineStr(W, "-"));
  text(twoCol("Zahlungsart", params.paymentMethod, W));
  if (params.amountPaid !== undefined) text(twoCol("Bezahlt", fmt(params.amountPaid), W));
  if (params.change !== undefined && params.change > 0) {
    add(CMD.BOLD_ON);
    text(twoCol("Rückgeld", fmt(params.change), W));
    add(CMD.BOLD_OFF);
  }

  add(CMD.ALIGN_CENTER);
  text(lineStr(W, "="));

  // ── Slogan ────────────────────────────────────────────────────────────────
  if (params.receiptSlogan) {
    add(CMD.BOLD_ON);
    for (const l of wrapText(params.receiptSlogan, W)) text(l);
    add(CMD.BOLD_OFF);
  } else {
    text("Danke für Ihren Besuch!");
  }

  // ── Drucker-Footer (2 freie Zeilen) ───────────────────────────────────────
  if (params.printer.footerLine1) text(params.printer.footerLine1);
  if (params.printer.footerLine2) text(params.printer.footerLine2);

  // ── Rabattcode für nächsten Besuch ──────────────────────────────────────
  if (params.receiptDiscountCode) {
    text(lineStr(W, "-"));
    add(CMD.BOLD_ON);
    const pct = params.receiptDiscountPercent ? ` (${params.receiptDiscountPercent}% Rabatt)` : "";
    text(`Ihr Vorteil beim nächsten Besuch${pct}:`);
    add(CMD.DOUBLE_HEIGHT);
    text(params.receiptDiscountCode);
    add(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  }

  // ── WLAN-Info ─────────────────────────────────────────────────────────────
  if (params.receiptWifiName) {
    text(lineStr(W, "-"));
    text(`WLAN: ${params.receiptWifiName}`);
    if (params.receiptWifiPassword) text(`Passwort: ${params.receiptWifiPassword}`);
  }

  // ── Social Media ──────────────────────────────────────────────────────────
  if (params.receiptShowSocial) {
    const socials: string[] = [];
    if (params.instagramUrl) socials.push("Instagram");
    if (params.facebookUrl) socials.push("Facebook");
    if (params.tripadvisorUrl) socials.push("TripAdvisor");
    if (socials.length > 0) {
      text(lineStr(W, "-"));
      text(`Folgen Sie uns: ${socials.join(" | ")}`);
    }
  }

  // ── Google-Bewertung ──────────────────────────────────────────────────────
  if (params.receiptShowGoogleReview && params.googleMapsUrl) {
    text(lineStr(W, "-"));
    text("Bewerten Sie uns auf Google!");
    // Kurz-URL anzeigen (ersten 40 Zeichen)
    const shortUrl = params.googleMapsUrl.replace("https://", "").substring(0, W - 1);
    text(shortUrl);
  }

  // ── Freier Marketingtext ──────────────────────────────────────────────────
  if (params.receiptCustomMessage) {
    text(lineStr(W, "-"));
    for (const l of wrapText(params.receiptCustomMessage, W)) text(l);
  }

  text(lineStr(W, "="));
  add(CMD.FEED_5);
  if (params.printer.openCashDrawer) add(CMD.CASH_DRAWER);
  if (params.printer.autoCut) add(CMD.CUT_FULL);
  return Buffer.concat(parts);
}

// ─── Testbon ──────────────────────────────────────────────────────────────────

function buildTestBon(printer: PrinterConfig): Buffer {
  const W = printer.charsPerLine;
  const parts: Buffer[] = [];
  const add = (...bufs: Buffer[]) => parts.push(...bufs);
  const text = (t: string) => { add(encodeText(t), CMD.FEED_LINE); };

  add(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  text("TESTDRUCK");
  add(CMD.NORMAL_SIZE, CMD.BOLD_OFF, CMD.ALIGN_LEFT);
  text(lineStr(W, "-"));
  text(`Drucker: ${printer.name}`);
  text(`Breite:  ${printer.charsPerLine} Zeichen`);
  text(`Zeit:    ${new Date().toLocaleString("de-CH")}`);
  text(lineStr(W, "-"));
  text("1234567890");
  text("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  text("abcdefghijklmnopqrstuvwxyz");
  text("Ae Oe Ue ae oe ue ss");
  text("CHF 12.50 | 8.1% MwSt");
  text(lineStr(W, "="));
  add(CMD.ALIGN_CENTER);
  text("Drucker funktioniert!");
  add(CMD.FEED_5);
  if (printer.autoCut) add(CMD.CUT_PARTIAL);
  return Buffer.concat(parts);
}

// ─── Netzwerkdruck via TCP ────────────────────────────────────────────────────

async function sendToNetworkPrinter(ip: string, port: number, data: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout: Drucker ${ip}:${port} nicht erreichbar`));
    }, timeoutMs);
    socket.connect(port, ip, () => {
      socket.write(data, (err) => {
        clearTimeout(timer);
        socket.end();
        if (err) reject(err); else resolve();
      });
    });
    socket.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}


// ─── ePOS-XML Direktdruck (Server → Drucker via HTTP) ──────────────────────

async function sendEposXmlToPrinter(printerIp: string, xmlContent: string, port = 8008): Promise<{ success: boolean; error?: string }> {
  const printerUrl = `http://${printerIp}:${port}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
  const soapBody = '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body>' + xmlContent + '</s:Body></s:Envelope>';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(printerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' },
      body: soapBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const responseText = await res.text();
    const success = responseText.includes('success="true"');
    if (!success) {
      const match = responseText.match(/code="([^"]+)"/);
      return { success: false, error: `Drucker-Fehler: ${match ? match[1] : 'unbekannt'}` };
    }
    return { success: true };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { success: false, error: 'Timeout – Drucker antwortet nicht' };
    return { success: false, error: err.message };
  }
}
// ─── Routing-Logik ────────────────────────────────────────────────────────────

async function resolvePrinterForItem(
  restaurantId: number,
  categoryId: number | null,
  topCategoryId: number | null,
  itemType: "food" | "drink" | "other",
  printerType: "kitchen" | "bar" | "receipt"
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const routes = await db
    .select()
    .from(printerRoutes)
    .where(and(eq(printerRoutes.restaurantId, restaurantId), eq(printerRoutes.isActive, true)))
    .orderBy(desc(printerRoutes.priority));

  for (const route of routes) {
    if (categoryId && route.categoryId === categoryId) return route.printerId;
  }
  for (const route of routes) {
    if (topCategoryId && route.topCategoryId === topCategoryId) return route.printerId;
  }
  for (const route of routes) {
    if (route.itemType === itemType && !route.categoryId && !route.topCategoryId) return route.printerId;
  }

  const fallback = await db
    .select()
    .from(printers)
    .where(and(
      eq(printers.restaurantId, restaurantId),
      eq(printers.type, printerType),
      eq(printers.isActive, true),
      eq(printers.isDefault, true)
    ))
    .limit(1);
  if (fallback.length > 0) return fallback[0].id;

  const any = await db
    .select()
    .from(printers)
    .where(and(eq(printers.restaurantId, restaurantId), eq(printers.type, printerType), eq(printers.isActive, true)))
    .limit(1);
  return any.length > 0 ? any[0].id : null;
}

async function getTopCategoryId(categoryId: number | null | undefined, restaurantId: number): Promise<number | null> {
  if (!categoryId) return null;
  const db = await getDb();
  if (!db) return null;
  const [cat] = await db
    .select()
    .from(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, restaurantId)))
    .limit(1);
  return (cat as any)?.topCategoryId ?? null;
}

// ─── tRPC Router ─────────────────────────────────────────────────────────────

export const printerRouter = router({

  // ── Drucker auflisten ──────────────────────────────────────────────────────
  list: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Determine online status from Print-Agent heartbeat (not TCP ping)
    const [restaurant] = await db.select().from(restaurants)
      .where(eq(restaurants.id, ctx.user.restaurantId!)).limit(1);
    const lastSeen = (restaurant as any)?.printAgentLastSeenAt as Date | null;
    const agentOnline = !!(lastSeen && (Date.now() - lastSeen.getTime()) < 60_000);
    const printerList = await db
      .select()
      .from(printers)
      .where(eq(printers.restaurantId, ctx.user.restaurantId!))
      .orderBy(printers.sortOrder, printers.name);
    // Override isOnline with agent-based status
    return printerList.map((p: any) => ({ ...p, isOnline: agentOnline }));
  }),

  // ── Drucker erstellen ──────────────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      type: z.enum(["kitchen", "bar", "receipt", "label"]),
      connectionType: z.enum(["network", "usb", "bluetooth", "cloud"]).default("network"),
      ipAddress: z.string().optional(),
      port: z.number().int().min(1).max(65535).default(9100),
      paperWidth: z.enum(["58mm", "80mm"]).default("80mm"),
      printCopies: z.number().int().min(1).max(5).default(1),
      isDefault: z.boolean().default(false),
      headerLine1: z.string().max(128).optional(),
      headerLine2: z.string().max(128).optional(),
      footerLine1: z.string().max(128).optional(),
      footerLine2: z.string().max(128).optional(),
      autoCut: z.boolean().default(true),
      openCashDrawer: z.boolean().default(false),
      sortOrder: z.number().int().default(0),
      authUsername: z.string().max(128).optional(),
      authPassword: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const charsPerLine = input.paperWidth === "58mm" ? 32 : 48;

      if (input.isDefault) {
        await db.update(printers).set({ isDefault: false }).where(and(
          eq(printers.restaurantId, ctx.user.restaurantId!),
          eq(printers.type, input.type)
        ));
      }

      const [result] = await db.insert(printers).values({
        restaurantId: ctx.user.restaurantId!,
        name: input.name,
        type: input.type,
        connectionType: input.connectionType,
        ipAddress: input.ipAddress,
        port: input.port,
        paperWidth: input.paperWidth,
        charsPerLine,
        printCopies: input.printCopies,
        isDefault: input.isDefault,
        headerLine1: input.headerLine1,
        headerLine2: input.headerLine2,
        footerLine1: input.footerLine1,
        footerLine2: input.footerLine2,
        autoCut: input.autoCut,
        openCashDrawer: input.openCashDrawer,
        sortOrder: input.sortOrder,
        authUsername: input.authUsername || null,
        authPassword: input.authPassword || null,
      });
      return { id: (result as any).insertId };
    }),

  // ── Drucker aktualisieren ──────────────────────────────────────────────────
  update: adminProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(128).optional(),
      type: z.enum(["kitchen", "bar", "receipt", "label"]).optional(),
      connectionType: z.enum(["network", "usb", "bluetooth", "cloud"]).optional(),
      ipAddress: z.string().nullable().optional(),
      port: z.number().int().min(1).max(65535).optional(),
      paperWidth: z.enum(["58mm", "80mm"]).optional(),
      printCopies: z.number().int().min(1).max(5).optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      headerLine1: z.string().max(128).nullable().optional(),
      headerLine2: z.string().max(128).nullable().optional(),
      footerLine1: z.string().max(128).nullable().optional(),
      footerLine2: z.string().max(128).nullable().optional(),
      autoCut: z.boolean().optional(),
      openCashDrawer: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      authUsername: z.string().max(128).nullable().optional(),
      authPassword: z.string().max(256).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;

      const [existing] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, id), eq(printers.restaurantId, ctx.user.restaurantId!)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = { ...data };
      if (data.paperWidth) updateData.charsPerLine = data.paperWidth === "58mm" ? 32 : 48;
      if (data.isDefault && (data.type ?? existing.type)) {
        await db.update(printers).set({ isDefault: false }).where(and(
          eq(printers.restaurantId, ctx.user.restaurantId!),
          eq(printers.type, (data.type ?? existing.type) as any)
        ));
      }

      await db.update(printers).set(updateData).where(eq(printers.id, id));
      return { ok: true };
    }),

  // ── Drucker löschen ────────────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, input.id), eq(printers.restaurantId, ctx.user.restaurantId!)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(printerRoutes).where(eq(printerRoutes.printerId, input.id));
      await db.delete(printers).where(eq(printers.id, input.id));
      return { ok: true };
    }),

  // ── Testdruck ──────────────────────────────────────────────────────────────
  testPrint: adminProcedure
    .input(z.object({ printerId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [printer] = await db
        .select()
        .from(printers)
        .where(and(eq(printers.id, input.printerId), eq(printers.restaurantId, ctx.user.restaurantId!)))
        .limit(1);
      if (!printer) throw new TRPCError({ code: "NOT_FOUND" });

      const bon = buildTestBon(printer);
      const [jobResult] = await db.insert(printJobs).values({
        restaurantId: ctx.user.restaurantId!,
        printerId: printer.id,
        jobType: "test",
        status: "pending",
        payload: bon.toString("base64"),
      });
      const jobId = (jobResult as any).insertId;

      if (printer.connectionType === "network" && printer.ipAddress) {
        try {
          for (let i = 0; i < printer.printCopies; i++) {
            await sendToNetworkPrinter(printer.ipAddress, printer.port ?? 9100, bon);
          }
          await db.update(printJobs).set({ status: "printed", printedAt: new Date() }).where(eq(printJobs.id, jobId));
          return { ok: true, message: "Testdruck erfolgreich gesendet" };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await db.update(printJobs).set({ status: "failed", errorMessage: msg }).where(eq(printJobs.id, jobId));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drucker nicht erreichbar: ${msg}` });
        }
      }
      await db.update(printJobs).set({ status: "sent" }).where(eq(printJobs.id, jobId));
      return { ok: true, payload: bon.toString("base64"), message: "Bon-Daten bereit (Browser-Druck)" };
    }),

  // ── Routing-Regeln auflisten ───────────────────────────────────────────────
  listRoutes: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const routes = await db
      .select()
      .from(printerRoutes)
      .where(eq(printerRoutes.restaurantId, ctx.user.restaurantId!))
      .orderBy(desc(printerRoutes.priority));

    const catIds = routes.filter((r: any) => r.categoryId).map((r: any) => r.categoryId as number);
    const topCatIds = routes.filter((r: any) => r.topCategoryId).map((r: any) => r.topCategoryId as number);

    const cats = catIds.length > 0
      ? await db.select().from(menuCategories).where(inArray(menuCategories.id, catIds))
      : [];
    const topCats = topCatIds.length > 0
      ? await db.select().from(menuTopCategories).where(inArray(menuTopCategories.id, topCatIds))
      : [];

    return routes.map((r: any) => ({
      ...r,
      categoryName: cats.find((c: any) => c.id === r.categoryId)?.name ?? null,
      topCategoryName: topCats.find((c: any) => c.id === r.topCategoryId)?.name ?? null,
    }));
  }),

  // ── Routing-Regel erstellen ────────────────────────────────────────────────
  createRoute: adminProcedure
    .input(z.object({
      printerId: z.number().int(),
      categoryId: z.number().int().nullable().optional(),
      topCategoryId: z.number().int().nullable().optional(),
      itemType: z.enum(["food", "drink", "other"]).nullable().optional(),
      priority: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.categoryId && !input.topCategoryId && !input.itemType) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Mindestens ein Routing-Kriterium erforderlich" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(printerRoutes).values({
        restaurantId: ctx.user.restaurantId!,
        printerId: input.printerId,
        categoryId: input.categoryId ?? null,
        topCategoryId: input.topCategoryId ?? null,
        itemType: input.itemType ?? null,
        priority: input.priority,
      });
      return { id: (result as any).insertId };
    }),

  // ── Routing-Regel löschen ──────────────────────────────────────────────────
  deleteRoute: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(printerRoutes).where(and(
        eq(printerRoutes.id, input.id),
        eq(printerRoutes.restaurantId, ctx.user.restaurantId!)
      ));
      return { ok: true };
    }),

  // ── Küchenbon / Barbon drucken ─────────────────────────────────────────────
  printKitchenOrder: protectedProcedure
    .input(z.object({
      orderId: z.number().int(),
      itemIds: z.array(z.number().int()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId!;

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      let items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));

      if (input.itemIds?.length) {
        items = items.filter((i: any) => input.itemIds!.includes(i.id));
      }
      if (items.length === 0) return { printed: 0, groups: 0 };

      // Items nach Drucker gruppieren
      const printerGroups = new Map<number, typeof items>();

      for (const item of items) {
        const [menuItem] = await db
          .select()
          .from(menuItems)
          .where(eq(menuItems.id, item.productId ?? 0))
          .limit(1);

        const catId = (menuItem as any)?.categoryId ?? null;
        const topCatId = await getTopCategoryId(catId, restaurantId);
        const iType: "food" | "drink" | "other" =
          (item as any).itemType === "drink" ? "drink" :
          (item as any).itemType === "other" ? "other" : "food";

        const pType: "kitchen" | "bar" = iType === "drink" ? "bar" : "kitchen";
        const printerId = await resolvePrinterForItem(restaurantId, catId, topCatId, iType, pType);
        if (!printerId) continue;

        if (!printerGroups.has(printerId)) printerGroups.set(printerId, []);
        printerGroups.get(printerId)!.push(item);
      }

      let printed = 0;
      for (const [printerId, groupItems] of Array.from(printerGroups.entries())) {
        const [printer] = await db.select().from(printers).where(eq(printers.id, printerId)).limit(1);
        if (!printer) continue;

        const bon = buildKitchenBon({
          printer,
          tableNumber: (order as any).tableNumber ?? order.tableId ?? "?",
          waiterName: ctx.user.name ?? "Kellner",
          orderNumber: `${order.id}`.padStart(4, "0"),
          items: groupItems.map((i: any) => ({
            quantity: i.quantity,
            name: i.name,
            variant: (i as any).variant,
            notes: (i as any).notes,
            modifiers: (i as any).modifiers ? JSON.stringify((i as any).modifiers) : null,
            course: (i as any).course,
            priority: (i as any).priority,
          })),
          bonType: printer.name,
          timestamp: new Date(),
        });

        const [jobResult] = await db.insert(printJobs).values({
          restaurantId,
          printerId,
          jobType: printer.type === "bar" ? "bar_order" : "kitchen_order",
          orderId: input.orderId,
          tableId: order.tableId ?? null,
          status: "pending",
          payload: bon.toString("base64"),
        });
        const jobId = (jobResult as any).insertId;

        if (printer.connectionType === "network" && printer.ipAddress) {
          try {
            for (let c = 0; c < printer.printCopies; c++) {
              await sendToNetworkPrinter(printer.ipAddress, printer.port ?? 9100, bon);
            }
            await db.update(printJobs).set({ status: "printed", printedAt: new Date() }).where(eq(printJobs.id, jobId));
            printed++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await db.update(printJobs).set({ status: "failed", errorMessage: msg }).where(eq(printJobs.id, jobId));
          }
        } else {
          await db.update(printJobs).set({ status: "sent" }).where(eq(printJobs.id, jobId));
          printed++;
        }
      }

      return { printed, groups: printerGroups.size };
    }),

  // ── Gastbon drucken ────────────────────────────────────────────────────────
  printReceipt: protectedProcedure
    .input(z.object({
      orderId: z.number().int(),
      paymentMethod: z.string().default("Bar"),
      amountPaid: z.number().optional(),
      tip: z.number().optional(),
      discount: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const restaurantId = ctx.user.restaurantId!;

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId)))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });

      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      // Standard-Gastbondrucker
      let receiptPrinter = (await db
        .select()
        .from(printers)
        .where(and(
          eq(printers.restaurantId, restaurantId),
          eq(printers.type, "receipt"),
          eq(printers.isActive, true),
          eq(printers.isDefault, true)
        ))
        .limit(1))[0];

      if (!receiptPrinter) {
        const any = await db
          .select()
          .from(printers)
          .where(and(eq(printers.restaurantId, restaurantId), eq(printers.type, "receipt"), eq(printers.isActive, true)))
          .limit(1);
        if (!any[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Gastbondrucker konfiguriert" });
        receiptPrinter = any[0];
      }

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
      const subtotal = items.reduce((s: number, i: any) => s + i.quantity * Number(i.unitPrice), 0);
      const total = subtotal - (input.discount ?? 0) + (input.tip ?? 0);

      const bon = buildReceiptBon({
        printer: receiptPrinter,
        restaurantName: restaurant?.name ?? "Restaurant",
        restaurantAddress: restaurant?.address,
        restaurantPhone: (restaurant as any)?.phoneReceipt ?? (restaurant as any)?.phone,
        restaurantWebsite: (restaurant as any)?.website,
        restaurantVat: restaurant?.vatNumber,
        tableNumber: (order as any).tableNumber ?? order.tableId ?? "?",
        orderNumber: `${order.id}`.padStart(4, "0"),
        items: items.map((i: any) => ({
          quantity: i.quantity,
          name: i.name,
          variant: (i as any).variant,
          notes: (i as any).notes,
          modifiers: (i as any).modifiers ? JSON.stringify((i as any).modifiers) : null,
          unitPrice: Number(i.unitPrice),
        })),
        subtotal,
        discount: input.discount,
        tip: input.tip,
        total,
        vatLines: [{ rate: "8.1", amount: total * 0.081 / 1.081 }],
        paymentMethod: input.paymentMethod,
        amountPaid: input.amountPaid,
        change: input.amountPaid ? Math.max(0, input.amountPaid - total) : undefined,
        timestamp: new Date(),
        // Marketing
        receiptSlogan: (restaurant as any)?.receiptSlogan,
        receiptWifiName: (restaurant as any)?.receiptWifiName,
        receiptWifiPassword: (restaurant as any)?.receiptWifiPassword,
        receiptDiscountCode: (restaurant as any)?.receiptDiscountCode,
        receiptDiscountPercent: (restaurant as any)?.receiptDiscountPercent,
        receiptShowSocial: (restaurant as any)?.receiptShowSocial ?? true,
        receiptShowGoogleReview: (restaurant as any)?.receiptShowGoogleReview ?? false,
        receiptCustomMessage: (restaurant as any)?.receiptCustomMessage,
        instagramUrl: (restaurant as any)?.instagramUrl,
        facebookUrl: (restaurant as any)?.facebookUrl,
        googleMapsUrl: (restaurant as any)?.googleMapsUrl,
        tripadvisorUrl: (restaurant as any)?.tripadvisorUrl,
      });

      const [jobResult] = await db.insert(printJobs).values({
        restaurantId,
        printerId: receiptPrinter.id,
        jobType: "receipt",
        orderId: input.orderId,
        status: "pending",
        payload: bon.toString("base64"),
      });
      const jobId = (jobResult as any).insertId;

      if (receiptPrinter.connectionType === "network" && receiptPrinter.ipAddress) {
        try {
          for (let c = 0; c < receiptPrinter.printCopies; c++) {
            await sendToNetworkPrinter(receiptPrinter.ipAddress, receiptPrinter.port ?? 9100, bon);
          }
          await db.update(printJobs).set({ status: "printed", printedAt: new Date() }).where(eq(printJobs.id, jobId));
          return { ok: true, message: "Gastbon gedruckt" };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          await db.update(printJobs).set({ status: "failed", errorMessage: msg }).where(eq(printJobs.id, jobId));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Drucker nicht erreichbar: ${msg}` });
        }
      }
      await db.update(printJobs).set({ status: "sent" }).where(eq(printJobs.id, jobId));
      return { ok: true, payload: bon.toString("base64") };
    }),

  // ── Drucker-Status-Check (via Print-Agent Heartbeat) ──────────────────────
  // Der Cloud-Server kann lokale Drucker nicht direkt pingen.
  // Status = "Online" wenn der Print-Agent in den letzten 60s aktiv war.
  checkStatus: adminProcedure
    .input(z.object({ printerId: z.number().int() }))
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, ctx.user.restaurantId!))
        .limit(1);
      const lastSeen = (restaurant as any)?.printAgentLastSeenAt as Date | null;
      const agentOnline = lastSeen && (Date.now() - lastSeen.getTime()) < 60_000;
      // Update all printers' isOnline status based on agent heartbeat
      const allPrinters = await db.select().from(printers)
        .where(and(eq(printers.restaurantId, ctx.user.restaurantId!), eq(printers.isActive, true)));
      for (const p of allPrinters) {
        await db.update(printers).set({ isOnline: !!agentOnline }).where(eq(printers.id, p.id));
      }
      if (agentOnline) {
        return { online: true, latencyMs: null, message: `Print-Agent aktiv (zuletzt: ${lastSeen!.toLocaleTimeString()})` };
      } else {
        return { online: false, latencyMs: null, message: lastSeen
          ? `Print-Agent inaktiv seit ${Math.round((Date.now() - lastSeen.getTime()) / 1000)}s – bitte Print-Agent-Tab offen lassen`
          : "Print-Agent noch nie verbunden – bitte unter Drucker → Print-Agent einrichten" };
      }
    }),

  // ── Alle Drucker-Status auf einmal prüfen ─────────────────────────────────
  checkAllStatus: adminProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, ctx.user.restaurantId!))
        .limit(1);
      const lastSeen = (restaurant as any)?.printAgentLastSeenAt as Date | null;
      const agentOnline = lastSeen && (Date.now() - lastSeen.getTime()) < 60_000;
      const allPrinters = await db.select().from(printers)
        .where(and(eq(printers.restaurantId, ctx.user.restaurantId!), eq(printers.isActive, true)));
      // Update isOnline for all printers based on agent heartbeat
      for (const p of allPrinters) {
        await db.update(printers).set({ isOnline: !!agentOnline }).where(eq(printers.id, p.id));
      }
      const statusMsg = agentOnline
        ? `Print-Agent aktiv (zuletzt: ${lastSeen!.toLocaleTimeString()})`
        : lastSeen
          ? `Print-Agent inaktiv seit ${Math.round((Date.now() - lastSeen.getTime()) / 1000)}s`
          : "Print-Agent nicht eingerichtet";
      return allPrinters.map((p: any) => ({
        id: p.id,
        name: p.name,
        online: !!agentOnline,
        latencyMs: null,
        message: statusMsg,
      }));
    }),

  // ── Nachdruck ──────────────────────────────────────────────────────────────
  reprint: adminProcedure
    .input(z.object({ jobId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db
        .select()
        .from(printJobs)
        .where(and(eq(printJobs.id, input.jobId), eq(printJobs.restaurantId, ctx.user.restaurantId!)))
        .limit(1);
      if (!job?.payload) throw new TRPCError({ code: "NOT_FOUND" });

      const [printer] = await db.select().from(printers).where(eq(printers.id, job.printerId)).limit(1);
      if (!printer) throw new TRPCError({ code: "NOT_FOUND" });

      const bon = Buffer.from(job.payload, "base64");
      if (printer.connectionType === "network" && printer.ipAddress) {
        await sendToNetworkPrinter(printer.ipAddress, printer.port ?? 9100, bon);
        return { ok: true };
      }
      return { ok: true, payload: job.payload };
    }),

  // ── Druckauftrags-Log ──────────────────────────────────────────────────────
  listJobs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select()
        .from(printJobs)
        .where(eq(printJobs.restaurantId, ctx.user.restaurantId!))
        .orderBy(desc(printJobs.createdAt))
        .limit(input.limit);
    }),

  // ── Client-seitige Drucker-Konfiguration (Browser-Direktdruck) ──────────────
  // Gibt IP/Port der aktiven Drucker zurück, damit der Browser direkt drucken kann
  getClientPrinters: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { receipt: null, kitchen: null, bar: null };
    const restaurantId = ctx.user.restaurantId!;

    const allPrinters = await db
      .select()
      .from(printers)
      .where(and(eq(printers.restaurantId, restaurantId), eq(printers.isActive, true)));

    const findPrinter = (type: string) => {
      const def = allPrinters.find((p: any) => p.type === type && p.isDefault && p.connectionType === "network" && p.ipAddress);
      const any = allPrinters.find((p: any) => p.type === type && p.connectionType === "network" && p.ipAddress);
      const p = def ?? any;
      if (!p) return null;
      return {
        id: p.id,
        name: p.name,
        ip: p.ipAddress!,
        port: p.port ?? 9100,
        paperWidth: p.paperWidth ?? "80mm",
        headerLine1: (p as any).headerLine1 ?? null,
        headerLine2: (p as any).headerLine2 ?? null,
        footerLine1: (p as any).footerLine1 ?? null,
        footerLine2: (p as any).footerLine2 ?? null,
        autoCut: p.autoCut ?? true,
        openCashDrawer: p.openCashDrawer ?? false,
        printCopies: p.printCopies ?? 1,
      };
    };

    return {
      receipt: findPrinter("receipt"),
      kitchen: findPrinter("kitchen"),
      bar: findPrinter("bar"),
    };
  }),

  // ─── Print-Agent Token generieren (persistent) ──────────────────────────
  getPrintAgentToken: adminProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugeordnet" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
    let secret = (restaurant as any).printAgentSecret as string | null;
    if (!secret) {
      const crypto = await import("crypto");
      secret = crypto.randomBytes(16).toString("hex");
      await db.update(restaurants).set({ printAgentSecret: secret } as any).where(eq(restaurants.id, restaurantId));
    }
    const token = Buffer.from(`${restaurantId}:${secret}`).toString("base64");
    return { token };
  }),

  // ─── Print-Agent Token regenerieren ─────────────────────────────────────
  regeneratePrintAgentToken: adminProcedure.mutation(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugeordnet" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const crypto = await import("crypto");
    const secret = crypto.randomBytes(16).toString("hex");
    await db.update(restaurants).set({ printAgentSecret: secret } as any).where(eq(restaurants.id, restaurantId));
    const token = Buffer.from(`${restaurantId}:${secret}`).toString("base64");
    return { token };
  }),

  // ─── Gastbon als Print-Job (ePOS-XML) in Queue ──────────────────────────
  createReceiptPrintJob: protectedProcedure.input(z.object({
    orderId: z.number().int(),
    paymentMethod: z.string().default("Bar"),
    amountPaid: z.number().optional(),
    tip: z.number().optional(),
    discount: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId!;

    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND" });

    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);

    // Standard-Gastbondrucker
    let receiptPrinter = (await db.select().from(printers)
      .where(and(eq(printers.restaurantId, restaurantId), eq(printers.type, "receipt"), eq(printers.isActive, true), eq(printers.isDefault, true)))
      .limit(1))[0];
    if (!receiptPrinter) {
      receiptPrinter = (await db.select().from(printers)
        .where(and(eq(printers.restaurantId, restaurantId), eq(printers.type, "receipt"), eq(printers.isActive, true)))
        .limit(1))[0];
    }
    if (!receiptPrinter) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Gastbondrucker konfiguriert" });

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
    const subtotal = items.reduce((s: number, i: any) => s + i.quantity * Number(i.unitPrice), 0);
    const total = subtotal - (input.discount ?? 0) + (input.tip ?? 0);
    const tipVal = input.tip ?? 0;
    const cashVal = input.amountPaid ?? 0;
    const change = cashVal > 0 ? Math.max(0, cashVal - total) : 0;

    // ePOS-XML Gastbon
    const W = receiptPrinter.charsPerLine ?? 48;
    const line = (char: string) => char.repeat(W);
    const twoColXml = (l: string, r: string) => {
      const maxL = W - r.length - 1;
      return l.substring(0, maxL).padEnd(maxL, " ") + " " + r;
    };
    const fmt = (n: number) => `CHF ${n.toFixed(2)}`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let xml = `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">`;
    xml += `<text lang="de" smooth="true"/>`;
    // Header
    xml += `<text align="center" width="2" height="2">${esc(restaurant?.name ?? "Restaurant")}\n</text>`;
    xml += `<text align="center">`;
    if (restaurant?.address) xml += `${esc(restaurant.address)}\n`;
    if ((restaurant as any)?.phoneReceipt ?? restaurant?.phone) xml += `${esc((restaurant as any)?.phoneReceipt ?? restaurant?.phone ?? "")}\n`;
    if (restaurant?.vatNumber) xml += `MwSt-Nr: ${esc(restaurant.vatNumber)}\n`;
    xml += `</text>`;
    xml += `<text>${line("-")}\n</text>`;
    // Bestellinfo
    xml += `<text>Tisch:   ${esc(String((order as any).tableNumber ?? order.tableId ?? "?"))}\n</text>`;
    xml += `<text>Bon-Nr.: ${String(order.id).padStart(4, "0")}\n</text>`;
    xml += `<text>Datum:   ${new Date().toLocaleDateString("de-CH")} ${new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}\n</text>`;
    xml += `<text>${line("=")}\n</text>`;
    // Artikel
    for (const item of items) {
      const priceStr = fmt((item as any).quantity * Number((item as any).unitPrice));
      xml += `<text>${esc(twoColXml(`${(item as any).quantity}x ${(item as any).name}`, priceStr))}\n</text>`;
    }
    xml += `<text>${line("-")}\n</text>`;
    xml += `<text>${esc(twoColXml("Zwischensumme", fmt(subtotal)))}\n</text>`;
    if (input.discount && input.discount > 0) xml += `<text>${esc(twoColXml("Rabatt", "-" + fmt(input.discount)))}\n</text>`;
    if (tipVal > 0) xml += `<text>${esc(twoColXml("Trinkgeld", fmt(tipVal)))}\n</text>`;
    xml += `<text>${line("=")}\n</text>`;
    xml += `<text width="2" height="2">${esc(twoColXml("TOTAL", fmt(total)))}\n</text>`;
    xml += `<text>${line("-")}\n</text>`;
    xml += `<text>${esc(twoColXml("Zahlungsart", input.paymentMethod))}\n</text>`;
    if (cashVal > 0) xml += `<text>${esc(twoColXml("Bezahlt", fmt(cashVal)))}\n</text>`;
    if (change > 0) xml += `<text width="2" height="2">${esc(twoColXml("Rückgeld", fmt(change)))}\n</text>`;
    xml += `<text align="center">${line("=")}\n</text>`;
    // Footer
    const slogan = (restaurant as any)?.receiptSlogan || "Danke für Ihren Besuch!";
    xml += `<text align="center">${esc(slogan)}\n\n</text>`;
    xml += `<cut type="feed"/>`;
    if (receiptPrinter.openCashDrawer) xml += `<pulse drawer="drawer_1" time="pulse_100"/>`;
    xml += `</epos-print>`;

    // ─── Job in Local Connect Queue einstellen ───────────────────────────────
    // Das Gerät im WLAN des Restaurants holt den Job und druckt ihn direkt.
    const device = await db
      .select({ deviceId: localConnectDevices.deviceId, isOnline: localConnectDevices.isOnline })
      .from(localConnectDevices)
      .where(and(
        eq(localConnectDevices.restaurantId, restaurantId),
        eq(localConnectDevices.isOnline, true),
      ))
      .limit(1)
      .then((rows: Array<{ deviceId: string; isOnline: boolean }>) => rows[0] ?? null);

    if (!device) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Kein Local Connect Gerät online. Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.",
      });
    }

    const payload = JSON.stringify({
      printerIp: receiptPrinter.ipAddress,
      printerPort: receiptPrinter.port ?? 80,
      xml,
      openCashDrawer: receiptPrinter.openCashDrawer ?? false,
      ...(receiptPrinter.authUsername ? { username: receiptPrinter.authUsername } : {}),
      ...(receiptPrinter.authPassword ? { password: receiptPrinter.authPassword } : {}),
    });

    await db.insert(localConnectJobs).values({
      restaurantId,
      deviceId: device.deviceId,
      type: "print",
      payload,
      status: "pending",
      priority: "high",
    });

    return { success: true, queued: true };
  }),

  // ─── Küchenbon als Print-Job (ePOS-XML) in Queue ────────────────────────
  createKitchenPrintJob: protectedProcedure.input(z.object({
    orderId: z.number().int(),
    itemIds: z.array(z.number().int()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const restaurantId = ctx.user.restaurantId!;

    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.restaurantId, restaurantId))).limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND" });

    let items = await db.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
    if (input.itemIds?.length) items = items.filter((i: any) => input.itemIds!.includes(i.id));
    if (items.length === 0) return { printed: 0 };

    // Alle aktiven Küchen-/Bar-Drucker holen
    const kitchenPrinters = await db.select().from(printers)
      .where(and(eq(printers.restaurantId, restaurantId), eq(printers.isActive, true)));
    const defaultKitchen = kitchenPrinters.find((p: any) => p.type === "kitchen" && p.isDefault) ?? kitchenPrinters.find((p: any) => p.type === "kitchen");
    const defaultBar = kitchenPrinters.find((p: any) => p.type === "bar" && p.isDefault) ?? kitchenPrinters.find((p: any) => p.type === "bar");

    if (!defaultKitchen && !defaultBar) return { printed: 0 };

    // Einfaches Routing: Getränke → Bar, Rest → Küche
    const kitchenItems: typeof items = [];
    const barItems: typeof items = [];
    for (const item of items) {
      if ((item as any).itemType === "drink" && defaultBar) {
        barItems.push(item);
      } else if (defaultKitchen) {
        kitchenItems.push(item);
      }
    }

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let printed = 0;

    const buildKitchenXml = (groupItems: typeof items, bonType: string) => {
      let xml = `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">`;
      xml += `<text lang="de" smooth="true"/>`;
      xml += `<text align="center" width="2" height="2">${esc(bonType)}\n</text>`;
      xml += `<text>========================================\n</text>`;
      xml += `<text width="2" height="2">TISCH: ${esc(String((order as any).tableNumber ?? order.tableId ?? "?"))}\n</text>`;
      xml += `<text>Kellner: ${esc(ctx.user.name ?? "Kellner")}\n</text>`;
      xml += `<text>Bon-Nr.: ${String(order.id).padStart(4, "0")}\n</text>`;
      xml += `<text>Zeit:    ${new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}\n</text>`;
      xml += `<text>========================================\n</text>`;
      for (const item of groupItems) {
        xml += `<text width="2" height="2">${(item as any).quantity}x ${esc((item as any).name)}\n</text>`;
        if ((item as any).variant) xml += `<text>   -> ${esc((item as any).variant)}\n</text>`;
        if ((item as any).notes) xml += `<text reverse="true">   ! ${esc((item as any).notes)}\n</text>`;
        if ((item as any).modifiers) {
          try {
            const mods = JSON.parse((item as any).modifiers);
            if (Array.isArray(mods)) for (const m of mods) xml += `<text>   + ${esc(m.name ?? String(m))}\n</text>`;
          } catch { /* ignore */ }
        }
      }
      xml += `<text>----------------------------------------\n</text>`;
      xml += `<feed line="3"/><cut type="feed"/></epos-print>`;
      return xml;
    };

    // ─── Jobs in Local Connect Queue einstellen ────────────────────────────
    const device = await db
      .select({ deviceId: localConnectDevices.deviceId })
      .from(localConnectDevices)
      .where(and(
        eq(localConnectDevices.restaurantId, restaurantId),
        eq(localConnectDevices.isOnline, true),
      ))
      .limit(1)
      .then((rows: Array<{ deviceId: string }>) => rows[0] ?? null);

    if (!device) {
      // Kein Gerät online – Küchenbon kann nicht gedruckt werden
      // Kein Fehler werfen (Bestellung wurde bereits gespeichert)
      return { printed: 0, queued: 0, error: "Kein Local Connect Gerät online" };
    }

    const jobsToInsert: Array<typeof localConnectJobs.$inferInsert> = [];

    if (kitchenItems.length > 0 && defaultKitchen?.ipAddress) {
      const xml = buildKitchenXml(kitchenItems, "KÜCHE");
      jobsToInsert.push({
        restaurantId,
        deviceId: device.deviceId,
        type: "print",
        payload: JSON.stringify({
          printerIp: defaultKitchen.ipAddress,
          printerPort: defaultKitchen.port ?? 80,
          xml,
          ...(defaultKitchen.authUsername ? { username: defaultKitchen.authUsername } : {}),
          ...(defaultKitchen.authPassword ? { password: defaultKitchen.authPassword } : {}),
        }),
        status: "pending",
        priority: "high",
      });
      printed++;
    }
    if (barItems.length > 0 && defaultBar?.ipAddress) {
      const xml = buildKitchenXml(barItems, "BAR");
      jobsToInsert.push({
        restaurantId,
        deviceId: device.deviceId,
        type: "print",
        payload: JSON.stringify({
          printerIp: defaultBar.ipAddress,
          printerPort: defaultBar.port ?? 80,
          xml,
          ...(defaultBar.authUsername ? { username: defaultBar.authUsername } : {}),
          ...(defaultBar.authPassword ? { password: defaultBar.authPassword } : {}),
        }),
        status: "pending",
        priority: "high",
      });
      printed++;
    }

    if (jobsToInsert.length > 0) {
      for (const job of jobsToInsert) {
        await db.insert(localConnectJobs).values(job);
      }
    }

    return { printed, queued: jobsToInsert.length };
  }),

  // ─── Testdruck als Print-Job in Queue einfügen ───────────────────────────
  createTestPrintJob: adminProcedure.input(z.object({
    printerId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugeordnet" });
    const db = await getDb();
    // Verify printer belongs to restaurant
    const [printer] = await db.select().from(printers)
      .where(and(eq(printers.id, input.printerId), eq(printers.restaurantId, restaurantId)));
    if (!printer) throw new TRPCError({ code: "NOT_FOUND", message: "Drucker nicht gefunden" });
    if (!printer.ipAddress) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Keine IP-Adresse für diesen Drucker konfiguriert" });
    }
    // ePOS-XML Testbon bauen
    const xml = `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><text lang="de" smooth="true"/>` +
      `<text align="center" width="2" height="2">SimplaPOS\n</text>` +
      `<text align="center">\n--- TESTDRUCK ---\n\n</text>` +
      `<text align="center">Drucker: ${printer.name}\n</text>` +
      `<text align="center">IP: ${printer.ipAddress}\n</text>` +
      `<text align="center">Datum: ${new Date().toLocaleString("de-CH")}\n\n</text>` +
      `<text align="center">Druck erfolgreich!\n\n</text>` +
      `<cut type="feed"/></epos-print>`;

    // Gerät für dieses Restaurant finden
    const device = await db
      .select({ deviceId: localConnectDevices.deviceId })
      .from(localConnectDevices)
      .where(and(
        eq(localConnectDevices.restaurantId, restaurantId),
        eq(localConnectDevices.isOnline, true),
      ))
      .limit(1)
      .then((rows: Array<{ deviceId: string }>) => rows[0] ?? null);

    if (!device) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Kein Local Connect Gerät online. Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.",
      });
    }

    await db.insert(localConnectJobs).values({
      restaurantId,
      deviceId: device.deviceId,
      type: "print_test",
      payload: JSON.stringify({
        printerIp: printer.ipAddress,
        printerPort: printer.port ?? 80,
        xml,
        ...(printer.authUsername ? { username: printer.authUsername } : {}),
        ...(printer.authPassword ? { password: printer.authPassword } : {}),
      }),
      status: "pending",
      priority: "high",
    });

    return { success: true, queued: true };
  }),
});
