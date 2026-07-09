import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { debtors, invoices, restaurants } from "../drizzle/schema";
import { eq, and, desc, like, or, sql, gte } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";

// ─── Kontoauszug-PDF generieren ─────────────────────────────────────────────
async function generateStatementPdf(opts: {
  debtor: {
    id: number;
    name: string;
    company: string | null;
    email: string | null;
    address: string | null;
    zip: string | null;
    city: string | null;
    country: string;
    iban: string | null;
  };
  invoiceRows: Array<{
    id: number;
    invoiceNumber: string;
    totalAmount: string | null;
    status: string | null;
    createdAt: Date | null;
    dueDate: Date | null;
  }>;
  restaurant: {
    name: string;
    invoiceIban: string | null;
    invoiceCreditorName: string | null;
    invoiceCreditorAddress: string | null;
  };
  restaurantId: number;
}): Promise<{ pdfUrl: string; pdfKey: string }> {
  const { debtor, invoiceRows, restaurant, restaurantId } = opts;
  const now = new Date();
  const currency = "CHF";

  // Offene Posten filtern
  const openInvoices = invoiceRows.filter(inv =>
    ["sent", "dunning1", "dunning2"].includes(inv.status || "")
  );
  const totalOpen = openInvoices.reduce((s, inv) => s + parseFloat(inv.totalAmount || "0"), 0);

  const STATUS_LABELS: Record<string, string> = {
    draft: "Entwurf",
    sent: "Offen",
    paid: "Bezahlt",
    cancelled: "Storniert",
    dunning1: "1. Mahnung",
    dunning2: "2. Mahnung",
    credited: "Gutschrift",
  };

  const rowsHtml = invoiceRows.map(inv => {
    const amount = parseFloat(inv.totalAmount || "0");
    const isOpen = ["sent", "dunning1", "dunning2"].includes(inv.status || "");
    const statusLabel = STATUS_LABELS[inv.status || ""] ?? inv.status ?? "";
    const statusColor = isOpen ? "#d97706" : inv.status === "paid" ? "#059669" : "#6b7280";
    return `<tr>
      <td>${inv.invoiceNumber}</td>
      <td>${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("de-CH") : "–"}</td>
      <td>${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("de-CH") : "–"}</td>
      <td style="color:${statusColor};font-weight:600">${statusLabel}</td>
      <td style="text-align:right">${currency} ${amount.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const creditorName = restaurant.invoiceCreditorName || restaurant.name;
  const creditorIban = restaurant.invoiceIban || "";
  const creditorAddress = restaurant.invoiceCreditorAddress || "";

  // Schweizer QR-Code für Gesamtbetrag (nur wenn IBAN vorhanden und Betrag > 0)
  let qrSection = "";
  if (creditorIban && totalOpen > 0) {
    try {
      const QRCode = await import("qrcode");
      const qrData = [
        "SPC", "0200", "1",
        creditorIban.replace(/\s/g, "").toUpperCase(),
        "K", creditorName, creditorAddress.split("\n")[0] || "",
        creditorAddress.split("\n")[1] || "", "", "", "CH",
        "", "", "", "", "", "", "",
        totalOpen.toFixed(2), currency,
        "K", debtor.name, debtor.address || "",
        `${debtor.zip || ""} ${debtor.city || ""}`.trim(), "", "", debtor.country || "CH",
        "NON", "",
        `Kontoauszug ${now.toLocaleDateString("de-CH")}`,
        "EPD"
      ].join("\n");
      const qrSvg = await QRCode.toString(qrData, { type: "svg", width: 120, margin: 0 });
      qrSection = `
      <div class="qr-section">
        <h4>Schweizer QR-Einzahlungsschein (Gesamtbetrag offene Posten)</h4>
        <div class="qr-layout">
          <div class="qr-svg">${qrSvg}</div>
          <div class="qr-details">
            <strong>Konto / Zahlbar an</strong>
            ${creditorIban.replace(/\s/g, "").toUpperCase()}<br>
            ${creditorName}<br>
            ${creditorAddress.replace(/\n/g, "<br>")}
            <strong>Zahlbar durch</strong>
            ${debtor.name}${debtor.company ? " / " + debtor.company : ""}<br>
            ${debtor.address || ""}${debtor.zip ? ", " + debtor.zip : ""}${debtor.city ? " " + debtor.city : ""}
            <strong>Betrag</strong>
            ${currency} ${totalOpen.toFixed(2)}
          </div>
        </div>
      </div>`;
    } catch {
      // QR-Code nicht verfügbar, ohne fortfahren
    }
  }

  const debtorAddress = [
    debtor.name,
    debtor.company,
    debtor.address,
    `${debtor.zip || ""} ${debtor.city || ""}`.trim(),
    debtor.country !== "CH" ? debtor.country : "",
  ].filter(Boolean).join("<br>");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; }
  .page { max-width: 800px; margin: 0 auto; padding: 30px 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1a1a2e; padding-bottom: 14px; }
  .company-name { font-size: 18px; font-weight: bold; color: #1a1a2e; }
  .title { font-size: 20px; font-weight: bold; color: #1a1a2e; margin: 18px 0 12px; letter-spacing: 0.5px; }
  .meta-grid { display: flex; gap: 24px; margin-bottom: 18px; }
  .meta-box { flex: 1; background: #f8f9ff; border: 1px solid #e0e7ff; border-radius: 6px; padding: 10px 14px; }
  .meta-box h4 { font-size: 9px; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  thead th { background: #1a1a2e; color: #fff; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
  thead th:last-child { text-align: right; }
  tbody tr:nth-child(even) { background: #f8f9ff; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  .totals { margin-left: auto; width: 280px; margin-top: 10px; }
  .totals tr td { padding: 4px 8px; }
  .totals tr.total td { font-weight: bold; font-size: 13px; border-top: 2px solid #1a1a2e; padding-top: 8px; }
  .qr-section { border-top: 2px dashed #ccc; margin-top: 28px; padding-top: 14px; }
  .qr-section h4 { font-size: 9px; text-transform: uppercase; color: #888; margin-bottom: 10px; }
  .qr-layout { display: flex; gap: 20px; align-items: flex-start; }
  .qr-svg { flex-shrink: 0; }
  .qr-details { font-size: 10px; line-height: 1.6; }
  .qr-details strong { display: block; font-size: 9px; text-transform: uppercase; color: #888; margin-top: 6px; }
  .footer { margin-top: 20px; font-size: 9px; color: #888; border-top: 1px solid #eee; padding-top: 10px; text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: bold; background: #fff3cd; color: #856404; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="company-name">${creditorName}</div>
      <div style="font-size:10px;color:#666;margin-top:4px">${creditorAddress.replace(/\n/g, " · ")}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:#888">Kontoauszug</div>
      <div style="font-size:14px;font-weight:bold;color:#1a1a2e">${debtor.name}${debtor.company ? " / " + debtor.company : ""}</div>
      <div style="font-size:10px;color:#888;margin-top:4px">Datum: ${now.toLocaleDateString("de-CH")}</div>
    </div>
  </div>
  <div class="title">KONTOAUSZUG</div>
  <div class="meta-grid">
    <div class="meta-box">
      <h4>Debitor</h4>
      <p><strong>${debtor.name}</strong>${debtor.company ? "<br>" + debtor.company : ""}<br>${debtorAddress}</p>
    </div>
    <div class="meta-box">
      <h4>Zusammenfassung</h4>
      <p>
        Rechnungen total: <strong>${invoiceRows.length}</strong><br>
        Offene Posten: <strong>${openInvoices.length}</strong><br>
        Offener Saldo: <strong style="color:#d97706">${currency} ${totalOpen.toFixed(2)}</strong>
      </p>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Rechnungsnummer</th>
        <th>Datum</th>
        <th>Fälligkeit</th>
        <th>Status</th>
        <th>Betrag</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <table class="totals">
    <tr><td style="color:#666">Offener Saldo</td><td style="text-align:right;color:#d97706;font-weight:bold">${currency} ${totalOpen.toFixed(2)}</td></tr>
  </table>
  ${qrSection}
  <div class="footer">
    Dieser Kontoauszug wurde elektronisch erstellt · ${creditorName} · ${now.toLocaleDateString("de-CH")}
  </div>
</div>
</body>
</html>`;

  const { execSync } = await import("child_process");
  const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
  const tmpHtml = `/tmp/statement_${debtor.id}_${Date.now()}.html`;
  const tmpPdf = `/tmp/statement_${debtor.id}_${Date.now()}.pdf`;
  writeFileSync(tmpHtml, html, "utf-8");
  try {
    execSync(`manus-md-to-pdf ${tmpHtml} ${tmpPdf} 2>/dev/null || weasyprint ${tmpHtml} ${tmpPdf} 2>/dev/null`, { timeout: 30000 });
  } catch {
    writeFileSync(tmpPdf, html, "utf-8");
  }
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readFileSync(tmpPdf);
  } catch {
    pdfBuffer = Buffer.from(html, "utf-8");
  }
  try { unlinkSync(tmpHtml); } catch {}
  try { unlinkSync(tmpPdf); } catch {}
  const pdfKey = `statements/${restaurantId}/kontoauszug_${debtor.id}_${now.toISOString().slice(0, 10)}.pdf`;
  const { key, url } = await storagePut(pdfKey, pdfBuffer, "application/pdf");
  return { pdfKey: key, pdfUrl: url };
}

const debtorInputSchema = z.object({
  restaurantId: z.number(),
  name: z.string().min(1, "Name erforderlich"),
  company: z.string().optional(),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2).default("CH"),
  iban: z.string()
    .refine(v => !v || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v.replace(/\s/g, "").toUpperCase()), {
      message: "Ungültiges IBAN-Format (z.B. CH56 0483 5012 3456 7800 9)",
    })
    .optional()
    .or(z.literal(""))
    .nullable(),
  notes: z.string().optional(),
  paymentTermDays: z.number().int().min(1).max(365).default(30),
});

export const debtorRouter = router({
  // ── Liste aller Debitoren ──────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      searchQuery: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(debtors.restaurantId, input.restaurantId)];
      if (input.searchQuery?.trim()) {
        const q = `%${input.searchQuery.trim()}%`;
        conditions.push(
          or(
            like(debtors.name, q),
            like(debtors.company, q),
            like(debtors.email, q),
            like(debtors.city, q),
          ) as any
        );
      }
      const rows = await db
        .select()
        .from(debtors)
        .where(and(...conditions))
        .orderBy(desc(debtors.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // ── Einzelner Debitor ──────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [debtor] = await db
        .select()
        .from(debtors)
        .where(and(eq(debtors.id, input.id), eq(debtors.restaurantId, input.restaurantId)));
      if (!debtor) throw new TRPCError({ code: "NOT_FOUND" });
      return debtor;
    }),

  // ── Debitor mit Rechnungshistorie ─────────────────────────────────────────
  getWithHistory: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [debtor] = await db
        .select()
        .from(debtors)
        .where(and(eq(debtors.id, input.id), eq(debtors.restaurantId, input.restaurantId)));
      if (!debtor) throw new TRPCError({ code: "NOT_FOUND" });

      // Rechnungen nach E-Mail oder Name suchen
      const matchConditions = [eq(invoices.restaurantId, input.restaurantId)];
      if (debtor.email) {
        matchConditions.push(eq(invoices.recipientEmail, debtor.email) as any);
      } else {
        matchConditions.push(like(invoices.recipientName, `%${debtor.name}%`) as any);
      }
      const invoiceRows = await db
        .select()
        .from(invoices)
        .where(and(...matchConditions))
        .orderBy(desc(invoices.createdAt))
        .limit(100);

      // Statistiken berechnen
      type InvRow = typeof invoiceRows[number];
      const totalInvoiced = invoiceRows.reduce((s: number, inv: InvRow) => s + parseFloat(inv.totalAmount || "0"), 0);
      const totalPaid = invoiceRows
        .filter((inv: InvRow) => inv.status === "paid")
        .reduce((s: number, inv: InvRow) => s + parseFloat(inv.totalAmount || "0"), 0);
      const totalOpen = invoiceRows
        .filter((inv: InvRow) => ["sent", "dunning1", "dunning2"].includes(inv.status || ""))
        .reduce((s: number, inv: InvRow) => s + parseFloat(inv.totalAmount || "0"), 0);
      const overdueCount = invoiceRows.filter((inv: InvRow) =>
        ["dunning1", "dunning2"].includes(inv.status || "")
      ).length;

      return {
        debtor,
        invoices: invoiceRows,
        stats: {
          totalInvoices: invoiceRows.length,
          totalInvoiced: totalInvoiced.toFixed(2),
          totalPaid: totalPaid.toFixed(2),
          totalOpen: totalOpen.toFixed(2),
          overdueCount,
        },
      };
    }),

  // ── Erstellen ─────────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(debtorInputSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(debtors).values({
        restaurantId: input.restaurantId,
        name: input.name,
        company: input.company || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        zip: input.zip || null,
        city: input.city || null,
        country: input.country,
        iban: input.iban ? input.iban.replace(/\s/g, "").toUpperCase() : null,
        notes: input.notes || null,
        paymentTermDays: input.paymentTermDays,
      });
      return { success: true, id: (result as any).insertId };
    }),

  // ── Bearbeiten ────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(debtorInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select()
        .from(debtors)
        .where(and(eq(debtors.id, input.id), eq(debtors.restaurantId, input.restaurantId)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(debtors).set({
        name: input.name,
        company: input.company || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        zip: input.zip || null,
        city: input.city || null,
        country: input.country,
        iban: input.iban ? input.iban.replace(/\s/g, "").toUpperCase() : null,
        notes: input.notes || null,
        paymentTermDays: input.paymentTermDays,
      }).where(eq(debtors.id, input.id));
      return { success: true };
    }),

  // ── Löschen ───────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(debtors)
        .where(and(eq(debtors.id, input.id), eq(debtors.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  // ── Schnell-Liste für Dropdown-Auswahl ──────────────────────────────────
  listForSelect: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      searchQuery: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conditions = [eq(debtors.restaurantId, input.restaurantId)];
      if (input.searchQuery?.trim()) {
        const q = `%${input.searchQuery.trim()}%`;
        conditions.push(
          or(
            like(debtors.name, q),
            like(debtors.company, q),
            like(debtors.email, q),
          ) as any
        );
      }
      const rows = await db
        .select({
          id: debtors.id,
          name: debtors.name,
          company: debtors.company,
          email: debtors.email,
          phone: debtors.phone,
          address: debtors.address,
          zip: debtors.zip,
          city: debtors.city,
          country: debtors.country,
          iban: debtors.iban,
          paymentTermDays: debtors.paymentTermDays,
        })
        .from(debtors)
        .where(and(...conditions))
        .orderBy(debtors.name)
        .limit(50);
      return rows;
    }),

  // ── Kontoauszug-PDF ──────────────────────────────────────────────────────────────────────────────────────
  getStatement: protectedProcedure
    .input(z.object({ id: z.number(), restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [debtor] = await db
        .select()
        .from(debtors)
        .where(and(eq(debtors.id, input.id), eq(debtors.restaurantId, input.restaurantId)));
      if (!debtor) throw new TRPCError({ code: "NOT_FOUND" });
      const [restaurant] = await db
        .select({
          name: restaurants.name,
          invoiceIban: restaurants.invoiceIban,
          invoiceCreditorName: restaurants.invoiceCreditorName,
          invoiceCreditorAddress: restaurants.invoiceCreditorAddress,
        })
        .from(restaurants)
        .where(eq(restaurants.id, input.restaurantId));
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
      const matchConditions = [eq(invoices.restaurantId, input.restaurantId)];
      if (debtor.email) {
        matchConditions.push(eq(invoices.recipientEmail, debtor.email) as any);
      } else {
        matchConditions.push(like(invoices.recipientName, `%${debtor.name}%`) as any);
      }
      const invoiceRows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          totalAmount: invoices.totalAmount,
          status: invoices.status,
          createdAt: invoices.createdAt,
          dueDate: invoices.dueDate,
        })
        .from(invoices)
        .where(and(...matchConditions))
        .orderBy(desc(invoices.createdAt))
        .limit(200);
      const { pdfUrl, pdfKey } = await generateStatementPdf({
        debtor,
        invoiceRows,
        restaurant,
        restaurantId: input.restaurantId,
      });
      return { pdfUrl, pdfKey };
    }),
  exportCsv: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(debtors)
        .where(eq(debtors.restaurantId, input.restaurantId))
        .orderBy(debtors.name);

      // Offene Salden pro Debitor berechnen
      type DebtorRow = typeof rows[number];
      const result: Array<DebtorRow & { openBalance: string; overdueBalance: string }> = [];
      for (const debtor of rows) {
        const matchConditions = [eq(invoices.restaurantId, input.restaurantId)];
        if (debtor.email) {
          matchConditions.push(eq(invoices.recipientEmail, debtor.email) as any);
        } else {
          matchConditions.push(like(invoices.recipientName, `%${debtor.name}%`) as any);
        }
        const invRows = await db.select().from(invoices).where(and(...matchConditions));
        type InvRow = typeof invRows[number];
        const openBalance = invRows
          .filter((i: InvRow) => ["sent", "dunning1", "dunning2"].includes(i.status || ""))
          .reduce((s: number, i: InvRow) => s + parseFloat(i.totalAmount || "0"), 0);
        const overdueBalance = invRows
          .filter((i: InvRow) => ["dunning1", "dunning2"].includes(i.status || ""))
          .reduce((s: number, i: InvRow) => s + parseFloat(i.totalAmount || "0"), 0);
        result.push({ ...debtor, openBalance: openBalance.toFixed(2), overdueBalance: overdueBalance.toFixed(2) });
      }

      // CSV aufbauen
      const headers = ["Name", "Firma", "E-Mail", "Telefon", "Adresse", "PLZ", "Ort", "Land", "IBAN", "Zahlungsfrist (Tage)", "Offener Saldo CHF", "Überfälliger Saldo CHF", "Notizen"];
      const csvRows = result.map(d => [
        d.name,
        d.company || "",
        d.email || "",
        d.phone || "",
        d.address || "",
        d.zip || "",
        d.city || "",
        d.country || "CH",
        d.iban || "",
        String(d.paymentTermDays || 30),
        d.openBalance,
        d.overdueBalance,
        (d.notes || "").replace(/["\n\r]/g, " "),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

      const csv = [headers.map(h => `"${h}"`).join(","), ...csvRows].join("\n");
      return { csv, filename: `debitoren_${new Date().toISOString().slice(0, 10)}.csv` };
    }),

  // ── Saldowarnung prüfen (via Heartbeat) ───────────────────────────────────
  checkBalanceThresholds: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Schwellenwert aus Restaurant-Einstellungen laden
      const [restaurant] = await db
        .select({ debtorBalanceWarningThreshold: restaurants.debtorBalanceWarningThreshold })
        .from(restaurants)
        .where(eq(restaurants.id, input.restaurantId));
      const threshold = parseFloat(restaurant?.debtorBalanceWarningThreshold || "500");

      const allDebtors = await db
        .select()
        .from(debtors)
        .where(eq(debtors.restaurantId, input.restaurantId));

      const warnings: Array<{ name: string; company: string | null; openBalance: number }> = [];

      for (const debtor of allDebtors) {
        const matchConditions = [eq(invoices.restaurantId, input.restaurantId)];
        if (debtor.email) {
          matchConditions.push(eq(invoices.recipientEmail, debtor.email) as any);
        } else {
          matchConditions.push(like(invoices.recipientName, `%${debtor.name}%`) as any);
        }
        const invRows = await db.select().from(invoices).where(and(...matchConditions));
        type InvRow = typeof invRows[number];
        const openBalance = invRows
          .filter((i: InvRow) => ["sent", "dunning1", "dunning2"].includes(i.status || ""))
          .reduce((s: number, i: InvRow) => s + parseFloat(i.totalAmount || "0"), 0);
        if (openBalance >= threshold) {
          warnings.push({ name: debtor.name, company: debtor.company || null, openBalance });
        }
      }

      if (warnings.length > 0) {
        const list = warnings
          .map(w => `• ${w.company ? w.company + " / " : ""}${w.name}: CHF ${w.openBalance.toFixed(2)}`)
          .join("\n");
        await notifyOwner({
          title: `⚠️ Saldowarnung: ${warnings.length} Debitor(en) über CHF ${threshold.toFixed(2)}`,
          content: `Folgende Debitoren haben einen offenen Saldo über dem Warnschwellenwert (CHF ${threshold.toFixed(2)}):\n\n${list}`,
        });
      }

      return { checked: allDebtors.length, warnings: warnings.length };
    }),

  // ── Statistiken ───────────────────────────────────────────────────────────
  getStats: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(debtors)
        .where(eq(debtors.restaurantId, input.restaurantId));
      const total = rows.length;
      // Offene Rechnungen zählen
      const openInvoices = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(
          and(
            eq(invoices.restaurantId, input.restaurantId),
            or(
              eq(invoices.status, "sent"),
              eq(invoices.status, "dunning1"),
              eq(invoices.status, "dunning2"),
            ) as any
          )
        );
      const overdueInvoices = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(
          and(
            eq(invoices.restaurantId, input.restaurantId),
            or(
              eq(invoices.status, "dunning1"),
              eq(invoices.status, "dunning2"),
            ) as any
          )
        );
      return {
        totalDebtors: total,
        openInvoices: Number(openInvoices[0]?.count || 0),
        overdueInvoices: Number(overdueInvoices[0]?.count || 0),
      };
    }),
});
