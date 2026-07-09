import { z } from "zod";
import { router } from "./_core/trpc";
import { protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  menuItems,
  menuCategories,
  menuTopCategories,
  orders,
  orderItems,
  restaurantTables,
  floorPlans,
  floorPlanObjects,
  chatConversations,
  chatMessages,
  restaurants,
} from "../drizzle/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

// ─── Page context mapping ─────────────────────────────────────────────────────

const PAGE_CONTEXT_MAP: Record<string, string> = {
  "/admin/dashboard": "Dashboard (Live-Übersicht: Tagesumsatz, offene Bestellungen, Tischstatus, Systemstatus)",
  "/admin/betrieb": "Betrieb (Tischplan mit Live-Bestellungen, Bestellaufnahme, Bezahlung)",
  "/admin/menu": "Speisekarte (Artikel, Kategorien, Preise, Allergene verwalten)",
  "/admin/menu/categories": "Speisekarte – Kategorien (Kategorien erstellen und bearbeiten)",
  "/admin/menu/items": "Speisekarte – Artikel (Gerichte und Getränke verwalten)",
  "/admin/menu/subcategories": "Speisekarte – Unterkategorien",
  "/admin/orders": "Bestellungen (alle Bestellungen, Filter nach Status, Stornierung)",
  "/admin/invoices": "Rechnungen (Rechnungsübersicht, PDF-Download, Versand)",
  "/admin/invoicing": "Rechnungsstellung (neue Rechnungen erstellen)",
  "/admin/recurring-invoices": "Wiederkehrende Rechnungen (Abo-Rechnungen verwalten)",
  "/admin/debtors": "Debitoren (offene Forderungen, Mahnwesen)",
  "/admin/statistics": "Statistiken (Umsatzanalysen, Produkt-Rankings, Zeitreihen)",
  "/admin/closings": "Tagesabschlüsse (Kassenbuch, Tagesabschluss durchführen und einsehen)",
  "/admin/kassenbuch": "Kassenbuch (Bareinnahmen und -ausgaben, Kassenstand)",
  "/admin/steuerexport": "Steuerberater-Export (CSV/DATEV-Export für Buchhaltung)",
  "/admin/inventory": "Lager (Lagerbestand, Artikel, Lieferanten, Bewegungen)",
  "/admin/inventory/planning": "Einkaufsplanung (KI-Bestellvorschläge, Bestellungen erstellen)",
  "/admin/inventory/recipes": "Rezepturverwaltung (Zutaten pro Gericht, automatischer Lagerabzug)",
  "/admin/printers": "Drucker (Bon-, Küchen- und Bardrucker konfigurieren, Testdruck)",
  "/admin/devices": "Geräte (Terminals, Tablets, Drucker verwalten)",
  "/admin/payment-methods": "Zahlungsarten (Bar, Karte, Twint, Gutschein konfigurieren)",
  "/admin/staff": "Personal (Mitarbeiter verwalten, Rollen zuweisen)",
  "/admin/shifts": "Schichten (Arbeitszeiten aller Mitarbeiter, CSV-Export)",
  "/admin/absences": "Abwesenheiten (Ferienanträge genehmigen oder ablehnen)",
  "/admin/ai-planning": "KI-Dienstplanung (KI erstellt automatisch Schichtpläne)",
  "/admin/reservations": "Reservierungen (Tischreservierungen verwalten, Kalender)",
  "/admin/takeaway": "Takeaway (Abholbestellungen verwalten)",
  "/admin/delivery": "Lieferung (Lieferbestellungen verwalten)",
  "/admin/vouchers": "Gutscheine (Gutscheine erstellen, einlösen, verwalten)",
  "/admin/loyalty": "Treuepunkte (Kundenbindungsprogramm verwalten)",
  "/admin/marketing": "Marketing (Kampagnen, Social Media, Werbung)",
  "/admin/qr-management": "QR-Codes (Tisch-QR-Codes generieren und drucken)",
  "/admin/bewertungen": "Bewertungen (Google/TripAdvisor-Bewertungen verwalten)",
  "/admin/naehrwerte": "Nährwerte & Allergene (Nährwertangaben und Allergene pflegen)",
  "/admin/mehrsprachige-speisekarte": "Mehrsprachige Speisekarte (DE/FR/EN/IT Übersetzungen)",
  "/admin/smart-building": "Smart Building (Temperatursensoren, Bewegungsmelder, Gerätesteuerung)",
  "/admin/settings": "Einstellungen (Restaurant-Profil, Öffnungszeiten, Zahlungen konfigurieren)",
  "/admin/chat": "Chat & Support (Support-Anfragen, KI-Assistent, Konversationen)",
  "/kellner/dashboard": "Kellner-Dashboard (persönliche Umsätze, Tischübersicht, Schicht-Info)",
  "/kellner/tischplan": "Kellner – Tischplan (Tischübersicht, Bestellaufnahme)",
  "/kellner/bestellungen": "Kellner – Bestellungen (eigene offene Bestellungen)",
  "/kellner/stempeluhr": "Stempeluhr (Ein-/Ausstempeln, Pausen, Schichtverlauf)",
  "/kellner/kalender": "Kellner-Kalender (geplante Schichten, Ferien, Verfügbarkeit)",
  "/kueche/dashboard": "Küchen-Display (KDS: offene Bestellungen, Status-Updates)",
  "/bar/dashboard": "Bar-Display (Getränkebestellungen, Status-Updates)",
};

function getPageDescription(currentPage: string): string {
  if (!currentPage) return "";
  // Exact match first
  if (PAGE_CONTEXT_MAP[currentPage]) return PAGE_CONTEXT_MAP[currentPage];
  // Prefix match
  for (const [path, desc] of Object.entries(PAGE_CONTEXT_MAP)) {
    if (currentPage.startsWith(path)) return desc;
  }
  return `Seite: ${currentPage}`;
}

// ─── Context builders ─────────────────────────────────────────────────────────

async function buildMenuContext(restaurantId: number): Promise<string> {
  const db = await getDb();

  const items = await db
    .select({
      name: menuItems.name,
      price: menuItems.price,
      categoryName: menuCategories.name,
      topCategoryName: menuTopCategories.name,
      allergens: menuItems.allergens,
      calories: menuItems.calories,
      isAvailable: menuItems.isAvailable,
    })
    .from(menuItems)
    .leftJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
    .leftJoin(menuTopCategories, eq(menuCategories.topCategoryId, menuTopCategories.id))
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isAvailable, true)))
    .limit(150);

  if (items.length === 0) return "Keine Speisekarte vorhanden.";

  const grouped: Record<string, Record<string, typeof items>> = {};
  for (const item of items) {
    const top = item.topCategoryName ?? "Sonstiges";
    const cat = item.categoryName ?? "Sonstiges";
    if (!grouped[top]) grouped[top] = {};
    if (!grouped[top][cat]) grouped[top][cat] = [];
    grouped[top][cat].push(item);
  }

  const lines: string[] = ["=== SPEISEKARTE ==="];
  for (const [top, cats] of Object.entries(grouped)) {
    lines.push(`\n[${top}]`);
    for (const [cat, catItems] of Object.entries(cats)) {
      lines.push(`  ${cat}:`);
      for (const item of catItems) {
        const price = item.price ? `CHF ${(item.price / 100).toFixed(2)}` : "";
        const kcal = item.calories ? ` | ${item.calories} kcal` : "";
        const allergenRaw = item.allergens;
        const allergenList = Array.isArray(allergenRaw)
          ? allergenRaw
          : typeof allergenRaw === "string" && allergenRaw.trim().length > 0
            ? allergenRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [];
        const allergens = allergenList.length > 0
          ? ` | Allergene: ${allergenList.join(", ")}`
          : "";
        lines.push(`    - ${item.name} ${price}${kcal}${allergens}`);
      }
    }
  }
  return lines.join("\n");
}

async function buildOrderContext(restaurantId: number): Promise<string> {
  const db = await getDb();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = await db
    .select({
      id: orders.id,
      tableId: orders.tableId,
      status: orders.status,
      totalAmount: orders.totalAmount,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      gte(orders.createdAt, todayStart)
    ))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  if (todayOrders.length === 0) return "Heute noch keine Bestellungen.";

  type TodayOrder = typeof todayOrders[number];
  const totalRevenue = todayOrders
    .filter((o: TodayOrder) => o.status === "closed")
    .reduce((sum: number, o: TodayOrder) => sum + (o.totalAmount ?? 0), 0);

  const openOrders = todayOrders.filter((o: TodayOrder) => o.status === "open" || o.status === "sent");
  const closedOrders = todayOrders.filter((o: TodayOrder) => o.status === "closed");

  const lines = [
    "=== BESTELLUNGEN HEUTE ===",
    `Gesamt: ${todayOrders.length} Bestellungen`,
    `Offen: ${openOrders.length} | Abgeschlossen: ${closedOrders.length}`,
    `Tagesumsatz (abgeschlossen): CHF ${(totalRevenue / 100).toFixed(2)}`,
  ];

  if (openOrders.length > 0) {
    lines.push("\nOffene Bestellungen:");
    for (const o of openOrders.slice(0, 10)) {
      lines.push(`  - Tisch ${o.tableId ?? "?"} | Status: ${o.status} | ${new Date(o.createdAt!).toLocaleTimeString("de-CH")}`);
    }
  }

  return lines.join("\n");
}

async function buildTableContext(restaurantId: number): Promise<string> {
  const db = await getDb();

  const plans = await db
    .select({ id: floorPlans.id, name: floorPlans.name })
    .from(floorPlans)
    .where(eq(floorPlans.restaurantId, restaurantId))
    .limit(5);

  if (plans.length === 0) return "Kein Tischplan vorhanden.";

  const tableObjects = await db
    .select({
      tableNumber: floorPlanObjects.tableNumber,
      seats: floorPlanObjects.seats,
      type: floorPlanObjects.type,
    })
    .from(floorPlanObjects)
    .where(and(
      eq(floorPlanObjects.floorPlanId, plans[0].id),
      sql`${floorPlanObjects.type} LIKE 'table%'`
    ))
    .limit(50);

  const openOrders = await db
    .select({ tableId: orders.tableId })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      sql`${orders.status} IN ('open', 'sent')`
    ));

  type OpenOrder = typeof openOrders[number];
  const occupiedTableIds = new Set(openOrders.map((o: OpenOrder) => o.tableId).filter(Boolean));

  const lines = [`=== TISCHPLAN: ${plans[0].name} ===`];
  lines.push(`Tische gesamt: ${tableObjects.length}`);

  type TableObj = typeof tableObjects[number];
  const occupied = tableObjects.filter((t: TableObj) => t.tableNumber && occupiedTableIds.has(t.tableNumber));
  const free = tableObjects.filter((t: TableObj) => !t.tableNumber || !occupiedTableIds.has(t.tableNumber));

  lines.push(`Besetzt: ${occupied.length} | Frei: ${free.length}`);

  if (occupied.length > 0) {
    lines.push(`Besetzte Tische: ${occupied.map((t: TableObj) => `T${t.tableNumber}(${t.seats} Plätze)`).join(", ")}`);
  }
  if (free.length > 0) {
    lines.push(`Freie Tische: ${free.slice(0, 10).map((t: TableObj) => `T${t.tableNumber ?? "?"}`).join(", ")}${free.length > 10 ? "..." : ""}`);
  }

  return lines.join("\n");
}

// ─── Störungs- und Ideen-Erkennung ───────────────────────────────────────────

function detectMessageType(message: string): "stoerung" | "idee" | "normal" {
  const lower = message.toLowerCase();
  const stoerungKeywords = [
    "störung", "fehler", "problem", "funktioniert nicht", "geht nicht", "kaputt",
    "absturz", "hängt", "lädt nicht", "zeigt nicht", "bug", "defekt", "falsch",
    "hilfe", "notfall", "dringend", "kann nicht", "klappt nicht", "error",
    "nicht möglich", "unmöglich", "druckt nicht", "verbindung", "offline",
  ];
  const ideeKeywords = [
    "idee", "vorschlag", "wunsch", "feature", "funktion", "könnte man", "wäre es möglich",
    "würde ich gerne", "hätte gerne", "wünsche mir", "entwickeln", "hinzufügen",
    "einbauen", "erweitern", "verbessern", "optimieren", "neu", "zusätzlich",
    "anregung", "feedback", "verbesserung",
  ];
  if (stoerungKeywords.some(kw => lower.includes(kw))) return "stoerung";
  if (ideeKeywords.some(kw => lower.includes(kw))) return "idee";
  return "normal";
}

// ─── Message schema ───────────────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const chatbotRouter = router({
  /**
   * Send a message to the AI assistant and get a response.
   * Saves conversation to DB, detects Störungen/Ideen and notifies superadmin.
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(2000),
      history: z.array(chatMessageSchema).max(20).default([]),
      role: z.enum(["admin", "waiter"]).default("admin"),
      currentPage: z.string().max(200).optional().default(""),
      conversationId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const restaurantId = ctx.user.restaurantId;
      const userId = ctx.user.id;

      // Load restaurant name for context and storage
      let restaurantName = "Unbekanntes Restaurant";
      if (restaurantId) {
        const rest = await db.select({ name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, restaurantId))
          .limit(1);
        if (rest[0]) restaurantName = rest[0].name;
      }

      // Build restaurant data context
      let menuContext = "";
      let orderContext = "";
      let tableContext = "";

      if (restaurantId) {
        [menuContext, orderContext, tableContext] = await Promise.all([
          buildMenuContext(restaurantId),
          buildOrderContext(restaurantId),
          buildTableContext(restaurantId),
        ]);
      } else {
        menuContext = "Kein Restaurant zugewiesen – du bist als Superadmin eingeloggt.";
      }

      // Page context
      const pageDesc = getPageDescription(input.currentPage);
      const pageContext = pageDesc
        ? `=== AKTUELLER BEREICH ===\nDer Benutzer befindet sich gerade im Bereich: ${pageDesc}\nBeantworte Fragen bevorzugt im Kontext dieses Bereichs.`
        : "";

      const roleDescription = input.role === "waiter"
        ? "Du bist ein KI-Assistent für Kellner in einem Restaurant-POS-System (SimplaPos)."
        : "Du bist ein KI-Assistent für Restaurant-Administratoren im SimplaPos-System.";

      const systemPrompt = `${roleDescription}

Du kennst alle aktuellen Daten des Restaurants "${restaurantName}" und kannst Fragen dazu beantworten.
Antworte immer auf Deutsch, präzise und hilfreich. Halte Antworten kurz und direkt.
Wenn du Preise nennst, verwende das Format "CHF X.XX".
Wenn du keine Information hast, sage es ehrlich.

WICHTIGE REGELN:
- Du darfst NUR Informationen und Erklärungen geben – du führst KEINE Aktionen aus.
- Wenn jemand dich bittet, etwas zu löschen, zu ändern, zu erstellen oder auszuführen, erkläre freundlich WO und WIE der Benutzer das selbst tun kann, aber tue es nicht selbst.
- Du gibst nur Informationen über das Restaurant "${restaurantName}" – niemals über andere Restaurants.
- Wenn du eine Störung oder ein technisches Problem erkennst, empfehle dem Benutzer, den Support zu kontaktieren.

${pageContext}

${menuContext}

${orderContext}

${tableContext}`;

      // Build messages for LLM
      const recentHistory = input.history.slice(-10);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...recentHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: input.message },
      ];

      const response = await invokeLLM({
        messages,
        max_tokens: 1000,
        model: "claude-haiku-4-5-20251001",
      });

      const content = response.choices[0]?.message?.content;
      const aiText = typeof content === "string" ? content : "";

      // ─── Detect message type ──────────────────────────────────────────────
      const messageType = detectMessageType(input.message);

      // ─── Save to chat_conversations / chat_messages ───────────────────────
      let convId = input.conversationId;

      if (!convId) {
        // Create new conversation
        const subject = input.message.slice(0, 80) + (input.message.length > 80 ? "..." : "");
        await db.insert(chatConversations).values({
          restaurantId: restaurantId ?? undefined,
          restaurantName,
          userId,
          subject,
          status: messageType === "stoerung" ? "escalated" : "ai_handled",
          priority: messageType === "stoerung" ? "high" : "medium",
          messageType,
          lastMessageAt: new Date(),
        });
        const newConv = await db.select({ id: chatConversations.id })
          .from(chatConversations)
          .orderBy(desc(chatConversations.id))
          .limit(1);
        convId = newConv[0]?.id;
      }

      if (convId) {
        // Save user message
        await db.insert(chatMessages).values({
          conversationId: convId,
          senderId: userId,
          senderType: "user",
          content: input.message,
        });
        // Save AI response
        await db.insert(chatMessages).values({
          conversationId: convId,
          senderType: "ai",
          content: aiText,
        });
        // Update lastMessageAt
        await db.update(chatConversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(chatConversations.id, convId));
      }

      // ─── Notify superadmin for Störungen and Ideen ────────────────────────
      if (messageType === "stoerung") {
        await notifyOwner({
          title: `🚨 Störung gemeldet – ${restaurantName}`,
          content: `Restaurant: ${restaurantName}\nBenutzer: ${ctx.user.name ?? ctx.user.email}\nNachricht: ${input.message}\n\nSeite: ${input.currentPage || "unbekannt"}`,
        }).catch(() => {}); // Non-blocking
      } else if (messageType === "idee") {
        await notifyOwner({
          title: `💡 Neue Idee – ${restaurantName}`,
          content: `Restaurant: ${restaurantName}\nBenutzer: ${ctx.user.name ?? ctx.user.email}\nIdee: ${input.message}`,
        }).catch(() => {}); // Non-blocking
      }

      return {
        message: aiText,
        conversationId: convId,
        messageType,
        usage: response.usage,
      };
    }),

  /**
   * Get quick-action suggestions based on role and current page context.
   */
  getSuggestions: protectedProcedure
    .input(z.object({
      role: z.enum(["admin", "waiter"]).default("admin"),
      currentPage: z.string().max(200).optional().default(""),
    }))
    .query(async ({ input }) => {
      const pageDesc = getPageDescription(input.currentPage);

      // Page-specific suggestions
      const pageSpecific: Record<string, string[]> = {
        "/admin/dashboard": ["Was ist der heutige Umsatz?", "Welche Tische sind gerade besetzt?", "Wie läuft das Geschäft heute?"],
        "/admin/menu": ["Welche Artikel haben Gluten als Allergen?", "Was kostet das teuerste Gericht?", "Wie viele Artikel sind aktiv?"],
        "/admin/orders": ["Wie viele offene Bestellungen gibt es?", "Was ist der Durchschnittsbetrag pro Bestellung?"],
        "/admin/printers": ["Wie konfiguriere ich einen neuen Drucker?", "Was mache ich wenn der Drucker nicht druckt?"],
        "/admin/inventory": ["Welche Artikel haben niedrigen Lagerbestand?", "Wann wurde zuletzt bestellt?"],
        "/admin/statistics": ["Was sind unsere meistverkauften Produkte?", "Wann ist die Hauptstosszeit?"],
        "/admin/reservations": ["Wie viele Reservierungen gibt es heute?", "Wie erstelle ich eine neue Reservierung?"],
        "/kellner/dashboard": ["Welche Tische sind noch frei?", "Wie viele Bestellungen habe ich heute?"],
        "/kueche/dashboard": ["Welche Bestellungen sind offen?", "Was muss als nächstes zubereitet werden?"],
      };

      // Find page-specific suggestions
      let suggestions: string[] = [];
      for (const [path, sugg] of Object.entries(pageSpecific)) {
        if (input.currentPage.startsWith(path)) {
          suggestions = sugg;
          break;
        }
      }

      // Fallback to role-based suggestions
      if (suggestions.length === 0) {
        if (input.role === "waiter") {
          suggestions = [
            "Welche Tische sind noch frei?",
            "Was empfiehlst du heute?",
            "Welche Gerichte sind vegetarisch?",
            "Was enthält kein Gluten?",
            "Wie viele Bestellungen habe ich heute?",
          ];
        } else {
          suggestions = [
            "Was ist der heutige Umsatz?",
            "Welche Tische sind gerade besetzt?",
            "Was sind unsere meistverkauften Produkte?",
            "Zeig mir alle offenen Bestellungen",
            "Welche Artikel haben Gluten als Allergen?",
          ];
        }
      }

      return { suggestions, pageContext: pageDesc };
    }),
});
