/**
 * kioskRouter – Kiosk-Scan Feature
 * Admin: Stationen verwalten, QR-Code generieren, Produkte einlernen
 * Gast: Token validieren, Foto scannen (KI-Erkennung), Online-Bezahlung, Bestellung im POS anlegen
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  kioskStations,
  kioskProductImages,
  kioskAgeVerifications,
  kioskSessions,
  kioskEvents,
  kioskSpotChecks,
  kioskManualOrders,
  kioskPushSubscriptions,
  kioskTrainingImages,
  kioskUpsellingRules,
  kioskPickupNumbers,
  kioskImageFetchErrors,
  kioskMarketingConfig,
  menuItems,
  menuCategories,
  inventoryItems,
  orders,
  orderItems,
  restaurants,
  users,
} from "../../drizzle/schema";
import webpush from "web-push";
import { eq, and, desc, asc, gt, lt, lte, gte, ne, isNull, isNotNull, or, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";
import { stripe } from "../stripe";

/**
 * Prüft via Claude Vision ob eine Person im Bild erkennbar ist.
 * Gibt { hasPersons, confidence } zurück. Bei Fehler wird hasPersons=false angenommen (fail-open).
 * WICHTIG: Gedruckte Gesichter auf Produktverpackungen (z.B. Sportler auf Red Bull, Portraits auf Weinflaschen)
 * gelten NICHT als echte Personen und dürfen das Bild nicht blockieren.
 */
async function checkPersonInImage(imageBase64: string): Promise<{ hasPersons: boolean; confidence: "high" | "medium" | "low" }> {
  try {
    const mimeType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "low" },
            },
            {
              type: "text",
              text: `Du analysierst Bilder aus einem Selbstbedienungs-Kiosk, wo Gäste Produkte fotografieren.

Aufgabe: Erkenne ob eine ECHTE, PHYSISCH ANWESENDE Person im Bild ist.

Regeln:
- hasRealPerson=true NUR wenn ein echter Mensch physisch im Bild anwesend ist (Gesicht, Körper, erkennbare Körperteile einer realen Person)
- hasRealPerson=false wenn Gesichter/Personen nur als DRUCK auf Produktverpackungen, Etiketten, Plakaten, Logos oder Illustrationen erscheinen (z.B. Sportler auf Red Bull-Dose, Portrait auf Weinflasche, Cartoon auf Verpackung)
- Finger oder Hände die ein Produkt halten zählen NICHT als Person
- Im Zweifelsfall: hasRealPerson=false (fail-open, Produkt nicht blockieren)

Antworte NUR mit JSON: {"hasPersons": true/false, "confidence": "high"|"medium"|"low"}`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "person_check",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hasPersons: { type: "boolean" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["hasPersons", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = response.choices[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      hasPersons: Boolean(parsed?.hasPersons),
      confidence: (parsed?.confidence as "high" | "medium" | "low") ?? "low",
    };
  } catch {
    // Bei Fehler: fail-open (kein Bild verwerfen wegen API-Fehler)
    return { hasPersons: false, confidence: "low" };
  }
}

/**
 * Speichert ein Gästefoto asynchron in S3 für KI-Training.
 * Fire-and-forget: kein await im Gast-Flow, kein Fehler wird nach oben propagiert.
 * Automatische Personenerkennung via Claude Vision – Bilder mit Personen werden als rejected gespeichert.
 */
async function saveTrainingImageAsync(
  sessionId: string,
  stationId: number,
  restaurantId: number,
  imageBase64: string,
  label: string,
): Promise<void> {
  try {
    const db = await getDb();
    // Base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const ext = imageBase64.startsWith("data:image/png") ? "png" : "jpg";
    // Eindeutiger S3-Key pro Scan
    const key = `kiosk-training/${restaurantId}/${sessionId}-${Date.now()}.${ext}`;
    const { url } = await storagePut(key, buffer, `image/${ext}`);

    // Automatische Personenerkennung (parallel zum S3-Upload, kein Gast-Flow-Impact)
    const { hasPersons, confidence } = await checkPersonInImage(imageBase64);

    // Ø Confidence aus dem Label ableiten (von der Produkt-KI)
    let avgConfidence: "high" | "medium" | "low" = "medium";
    try {
      const labelParsed = label ? JSON.parse(label) : [];
      if (Array.isArray(labelParsed) && labelParsed.length > 0) {
        const confidenceMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const avg = labelParsed.reduce((s: number, p: { confidence?: string }) => s + (confidenceMap[p.confidence ?? "medium"] ?? 2), 0) / labelParsed.length;
        avgConfidence = avg >= 2.5 ? "high" : avg >= 1.5 ? "medium" : "low";
      }
    } catch { /* ignore */ }

    await db.insert(kioskTrainingImages).values({
      sessionId,
      stationId,
      restaurantId,
      s3Key: key,
      s3Url: url,
      label,
      status: hasPersons ? "rejected" : "pending",
      rejectionReason: hasPersons ? "auto_person_detected" : null,
      avgConfidence,
    });
  } catch {
    // Fehler beim Training-Speichern nie nach oben propagieren – Gast-Flow darf nicht blockieren
  }
}

function setupWebPush() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:support@simplapos.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }
}
setupWebPush();

async function sendKioskPush(
  db: Awaited<ReturnType<typeof getDb>>,
  restaurantId: number,
  title: string,
  body: string,
  url: string,
) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const subs = await db.select().from(kioskPushSubscriptions)
    .where(eq(kioskPushSubscriptions.restaurantId, restaurantId));
  const payload = JSON.stringify({ title, body, url, tag: `kiosk-${restaurantId}-${Date.now()}`, vibrate: [200, 100, 200] });
  const toDelete: number[] = [];
  await Promise.all(subs.map(async (sub: typeof kioskPushSubscriptions.$inferSelect) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) toDelete.push(sub.id);
    }
  }));
  if (toDelete.length > 0) {
    await Promise.all(toDelete.map(id => db.delete(kioskPushSubscriptions).where(eq(kioskPushSubscriptions.id, id))));
  }
}

function generateQrToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export const kioskRouter = router({
  // ── Admin: Stationen ──────────────────────────────────────────────────────

  /** Alle Kiosk-Stationen des Restaurants auflisten */
  listStations: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    return db
      .select()
      .from(kioskStations)
      .where(eq(kioskStations.restaurantId, ctx.user.restaurantId))
      .orderBy(desc(kioskStations.createdAt));
  }),

  /** Neue Kiosk-Station erstellen */
  createStation: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const qrToken = generateQrToken();
      await db.insert(kioskStations).values({
        restaurantId: ctx.user.restaurantId,
        name: input.name,
        qrToken,
        isActive: true,
      });
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
          eq(kioskStations.qrToken, qrToken),
        ));
      return station;
    }),

  /** Kiosk-Station löschen */
  deleteStation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.id, input.id),
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(kioskStations).where(eq(kioskStations.id, input.id));
      return { success: true };
    }),

  /** Kiosk-Station umbenennen */
  updateStationName: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.id, input.id),
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(kioskStations)
        .set({ name: input.name })
        .where(eq(kioskStations.id, input.id));
      return { success: true, name: input.name };
    }),

  /** Station aktivieren/deaktivieren */
  toggleStation: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db
        .update(kioskStations)
        .set({ isActive: input.isActive })
        .where(and(
          eq(kioskStations.id, input.id),
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
        ));
      return { success: true };
    }),

  // ── Admin: Produkt-Bilder einlernen ───────────────────────────────────────

  /** Produktbilder für ein Menü-Item auflisten */
  listProductImages: protectedProcedure
    .input(z.object({ menuItemId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db
        .select()
        .from(kioskProductImages)
        .where(and(
          eq(kioskProductImages.menuItemId, input.menuItemId),
          eq(kioskProductImages.restaurantId, ctx.user.restaurantId),
        ))
        .orderBy(desc(kioskProductImages.createdAt));
    }),

  /** Produktbild hochladen (base64 → S3) */
  uploadProductImage: protectedProcedure
    .input(z.object({
      menuItemId: z.number(),
      imageBase64: z.string(), // data:image/jpeg;base64,...
      side: z.enum(["front", "back", "left", "right", "top", "other"]).default("front"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();

      // Verify menu item belongs to this restaurant
      const [item] = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(and(
          eq(menuItems.id, input.menuItemId),
          eq(menuItems.restaurantId, ctx.user.restaurantId),
        ));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Menü-Artikel nicht gefunden" });

      // Decode base64
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const ext = input.imageBase64.startsWith("data:image/png") ? "png" : "jpg";
      const fileKey = `kiosk-products/${ctx.user.restaurantId}/${input.menuItemId}/${Date.now()}-${input.side}.${ext}`;

      const { key, url } = await storagePut(fileKey, buffer, `image/${ext}`);

      await db.insert(kioskProductImages).values({
        restaurantId: ctx.user.restaurantId,
        menuItemId: input.menuItemId,
        imageKey: key,
        imageUrl: url,
        side: input.side,
      });

      return { success: true, url, key };
    }),

  /** Produktbild löschen */
  deleteProductImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [img] = await db
        .select()
        .from(kioskProductImages)
        .where(and(
          eq(kioskProductImages.id, input.id),
          eq(kioskProductImages.restaurantId, ctx.user.restaurantId),
        ));
      if (!img) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(kioskProductImages).where(eq(kioskProductImages.id, input.id));
      return { success: true };
    }),

  // ── Gast: Token validieren ────────────────────────────────────────────────

  /** Kiosk-Station per QR-Token abrufen (public – kein Login) */
  getStationByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [station] = await db
        .select({
          id: kioskStations.id,
          name: kioskStations.name,
          restaurantId: kioskStations.restaurantId,
          isActive: kioskStations.isActive,
        })
        .from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));

      if (!station) throw new TRPCError({ code: "NOT_FOUND", message: "Kiosk-Station nicht gefunden" });
      if (!station.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Diese Station ist deaktiviert" });

      // Get restaurant info for display
      const [restaurant] = await db
        .select({ name: restaurants.name, currency: restaurants.currency })
        .from(restaurants)
        .where(eq(restaurants.id, station.restaurantId));

      return { ...station, restaurantName: restaurant?.name ?? "", currency: restaurant?.currency ?? "CHF" };
    }),

  // ── Gast: Session-Lock ──────────────────────────────────────────────────────

  /**
   * Atomares Lock: Kasse für diesen Gast reservieren.
   * Gibt lockToken zurück wenn erfolgreich, oder wirft CONFLICT wenn belegt.
   * Lock-Timeout: 10 Minuten (600_000 ms) – automatische Freigabe bei Inaktivität.
   */
  acquireLock: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const now = Date.now();
      const lockExpiry = now + 10 * 60 * 1000; // 10 Minuten

      // Atomares UPDATE: nur wenn kein Lock oder Lock abgelaufen
      const result = await db
        .update(kioskStations)
        .set({
          lockToken: sql`CASE WHEN (lockToken IS NULL OR lockExpiresAt < ${now}) THEN ${crypto.randomBytes(24).toString("hex")} ELSE lockToken END`,
          lockedAt: sql`CASE WHEN (lockToken IS NULL OR lockExpiresAt < ${now}) THEN ${now} ELSE lockedAt END`,
          lockExpiresAt: sql`CASE WHEN (lockToken IS NULL OR lockExpiresAt < ${now}) THEN ${lockExpiry} ELSE lockExpiresAt END`,
        })
        .where(eq(kioskStations.qrToken, input.token));

      if (!result[0] || result[0].affectedRows === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Station nicht gefunden" });
      }

      // Lock-Wert lesen um zu prüfen ob wir ihn gesetzt haben
      const [station] = await db
        .select({ lockToken: kioskStations.lockToken, lockedAt: kioskStations.lockedAt, lockExpiresAt: kioskStations.lockExpiresAt })
        .from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));

      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      // Prüfen ob der Lock frisch (innerhalb 500ms) gesetzt wurde – dann gehört er uns
      const isOurs = station.lockedAt !== null && station.lockedAt >= now - 500;
      if (!isOurs) {
        // Jemand anderes hat den Lock
        const waitSec = station.lockExpiresAt ? Math.ceil((station.lockExpiresAt - now) / 1000) : 600;
        throw new TRPCError({
          code: "CONFLICT",
          message: `Kasse ist gerade belegt. Bitte warten Sie ca. ${waitSec} Sekunden.`,
        });
      }

      return { lockToken: station.lockToken! };
    }),

  /**
   * Lock freigeben – nach Zahlung oder manuell.
   * Nur der Inhaber des Locks (lockToken) kann ihn freigeben.
   */
  releaseLock: publicProcedure
    .input(z.object({ token: z.string(), lockToken: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(kioskStations)
        .set({ lockToken: null, lockedAt: null, lockExpiresAt: null })
        .where(
          and(
            eq(kioskStations.qrToken, input.token),
            eq(kioskStations.lockToken, input.lockToken),
          ),
        );
      return { ok: true };
    }),

  /**
   * Lock-Status prüfen – für Polling auf dem "Kasse belegt"-Screen.
   * Gibt frei=true zurück wenn die Kasse frei ist oder der Lock abgelaufen ist.
   */
  checkLock: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const now = Date.now();
      const [station] = await db
        .select({ lockToken: kioskStations.lockToken, lockExpiresAt: kioskStations.lockExpiresAt })
        .from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));

      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      const isFree = !station.lockToken || (station.lockExpiresAt !== null && station.lockExpiresAt < now);
      const waitSec = (!isFree && station.lockExpiresAt) ? Math.ceil((station.lockExpiresAt - now) / 1000) : 0;
      return { free: isFree, waitSeconds: waitSec };
    }),

  // ── Gast: KI-Scan ─────────────────────────────────────────────────────────

  /**
   * Foto analysieren und Produkte erkennen.
   *
   * DUAL-MODUS:
   * - Ohne gelernte Bilder: Freie Erkennung – KI identifiziert Produkte frei,
   *   dann Abgleich mit Menüliste nach Name (fuzzy).
   * - Mit gelernten Bildern: Abgleich-Modus – KI vergleicht gegen Produktliste
   *   mit Bild-Kontext.
   */
  scanProducts: publicProcedure
    .input(z.object({
      token: z.string(),
      imageBase64: z.string(), // data:image/jpeg;base64,...
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Validate station
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.qrToken, input.token),
          eq(kioskStations.isActive, true),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      // Load all active menu items
      const items = await db
        .select({
          id: menuItems.id,
          name: menuItems.name,
          price: menuItems.price,
          imageUrl: menuItems.imageUrl,
          categoryId: menuItems.categoryId,
        })
        .from(menuItems)
        .where(and(
          eq(menuItems.restaurantId, station.restaurantId),
          eq(menuItems.isActive, true),
          eq(menuItems.isAvailable, true),
        ));

      // Check if any trained product images exist for this restaurant
      const learnedImages = await db
        .select({
          menuItemId: kioskProductImages.menuItemId,
          imageUrl: kioskProductImages.imageUrl,
          imageKey: kioskProductImages.imageKey,
          side: kioskProductImages.side,
        })
        .from(kioskProductImages)
        .where(eq(kioskProductImages.restaurantId, station.restaurantId));

      const hasLearnedImages = learnedImages.length > 0;

      // Call Claude API
      const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const mimeType = input.imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";

      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "KI nicht konfiguriert" });

      let systemPrompt: string;
      // Extra image content blocks for learned images (Modus A)
      const learnedImageBlocks: Array<{
        type: "image";
        source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };
      }> = [];

      if (hasLearnedImages) {
        // ── MODUS A: Visuelle Erkennung mit Lernbildern ────────────────────────────────
        // Fetch up to 2 learned images per product and convert to base64 for Claude
        // Max 1 Lernbild pro Produkt (spart Token-Budget erheblich)
        const learnedByProduct = new Map<number, typeof learnedImages>();
        for (const img of learnedImages) {
          const existing = learnedByProduct.get(img.menuItemId) ?? [];
          if (existing.length < 1) { // max 1 image per product to stay within token limits
            existing.push(img);
            learnedByProduct.set(img.menuItemId, existing);
          }
        }

        // ── Lernbild-Fetches PARALLEL (Promise.all) ──────────────────────────────
        // Hilfsfunktion: ein einzelnes Lernbild fetchen → ImageBlock oder null
        type LearnedImgRow = typeof learnedImages[number];
        type ImageBlock = { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string } };
        const fetchLearnedImage = async (img: LearnedImgRow, itemId: number): Promise<ImageBlock | null> => {
          const logFetchError = (
            errorType: "presign_failed" | "s3_fetch_failed" | "invalid_content_type" | "too_large" | "unknown",
            errorMessage: string,
          ) => {
            getDb().then(dbInst => dbInst.insert(kioskImageFetchErrors).values({
              restaurantId: station.restaurantId,
              stationId: station.id,
              menuItemId: itemId,
              imageKey: img.imageKey ?? img.imageUrl.replace("/manus-storage/", ""),
              errorType,
              errorMessage: errorMessage.slice(0, 512),
            })).catch(() => {});
          };
          try {
            const forgeUrl = process.env.BUILT_IN_FORGE_API_URL ?? "";
            const forgeKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
            const storageKey = img.imageKey ?? img.imageUrl.replace("/manus-storage/", "");
            if (!storageKey || !forgeUrl || !forgeKey) return null;
            const presignUrl = new URL("v1/storage/presign/get", forgeUrl.replace(/\/+$/, "") + "/");
            presignUrl.searchParams.set("path", storageKey);
            const presignResp = await fetch(presignUrl.toString(), {
              headers: { Authorization: `Bearer ${forgeKey}` },
              signal: AbortSignal.timeout(5000),
            });
            if (!presignResp.ok) { logFetchError("presign_failed", `HTTP ${presignResp.status}`); return null; }
            const presignJson = await presignResp.json().catch(() => null) as { url?: string } | null;
            const s3Url = presignJson?.url;
            if (!s3Url) { logFetchError("presign_failed", "Kein URL im Presign-Response"); return null; }
            const imgResp = await fetch(s3Url, { signal: AbortSignal.timeout(8000) });
            if (!imgResp.ok) { logFetchError("s3_fetch_failed", `HTTP ${imgResp.status}`); return null; }
            const contentType = imgResp.headers.get("content-type") ?? "";
            if (!contentType.startsWith("image/")) { logFetchError("invalid_content_type", `Content-Type: ${contentType}`); return null; }
            const arrayBuf = await imgResp.arrayBuffer();
            if (arrayBuf.byteLength > 3 * 1024 * 1024) { logFetchError("too_large", `${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)}MB`); return null; }
            const rawB64 = Buffer.from(arrayBuf).toString("base64");
            const ext = storageKey.split(".").pop()?.toLowerCase() ?? "jpg";
            let finalB64 = rawB64;
            let finalMediaType: "image/jpeg" | "image/png" | "image/webp" =
              ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
            try {
              const sharp = (await import("sharp")).default;
              const resized = await sharp(Buffer.from(rawB64, "base64"))
                .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 60 })
                .toBuffer();
              finalB64 = resized.toString("base64");
              finalMediaType = "image/jpeg";
            } catch { /* sharp nicht verfügbar – Original verwenden */ }
            return { type: "image", source: { type: "base64", media_type: finalMediaType, data: finalB64 } };
          } catch (fetchErr: unknown) {
            logFetchError("unknown", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
            return null;
          }
        };

        // Alle Tasks sammeln und PARALLEL ausführen
        const fetchTasks: Array<{ itemId: number; img: LearnedImgRow }> = [];
        for (const item of items) {
          const imgs = learnedByProduct.get(item.id) ?? [];
          for (const img of imgs) fetchTasks.push({ itemId: item.id, img });
        }
        // Gleichzeitig fetchen – Gesamtwartezeit ≈ max(einzelne Fetch-Zeit) statt Summe
        const fetchResults = await Promise.all(
          fetchTasks.map(({ itemId, img }) => fetchLearnedImage(img, itemId))
        );

        // productLines + learnedImageBlocks aus Ergebnissen aufbauen
        // FIX-1: imgIndex wird NUR erhöht wenn block erfolgreich geladen wurde (nicht bei null)
        // Vorher: imgIndex++ auch bei null → Bild-Nummern im Prompt stimmten nicht mit echten Bildern überein
        const productLines: string[] = [];
        let imgIndex = 1;
        for (const item of items) {
          const imgs = learnedByProduct.get(item.id) ?? [];
          if (imgs.length > 0) {
            const startIdx = imgIndex;
            let loadedCount = 0;
            for (const img of imgs) {
              const taskIdx = fetchTasks.findIndex(t => t.itemId === item.id && t.img === img);
              const block = taskIdx >= 0 ? fetchResults[taskIdx] : null;
              if (block) {
                learnedImageBlocks.push(block);
                imgIndex++;
                loadedCount++;
              }
              // imgIndex wird NICHT erhöht wenn block null (Fetch fehlgeschlagen)
            }
            if (loadedCount > 0) {
              productLines.push(`- ID:${item.id} | "${item.name}" | Referenzbild${loadedCount > 1 ? "er" : ""}: [Bild ${startIdx}${loadedCount > 1 ? ` bis ${imgIndex - 1}` : ""}]`);
            } else {
              productLines.push(`- ID:${item.id} | "${item.name}" | Keine Referenzbilder (Ladefehler)`);
            }
          } else {
            productLines.push(`- ID:${item.id} | "${item.name}" | Keine Referenzbilder`);
          }
        }

        const productList = productLines.join("\n");

        // KIF-3: Fallback-Schutz – wenn Lernbilder in DB vorhanden, aber ALLE Fetches fehlgeschlagen
        // → Fehlermeldung zurückgeben statt in Modus B zu fallen und zu raten
        if (fetchTasks.length > 0 && learnedImageBlocks.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Lernbilder konnten nicht geladen werden. Bitte erneut versuchen.",
          });
        }

        systemPrompt = `Du bist ein präzises Kiosk-Kassensystem. Du erhältst ${learnedImageBlocks.length > 0 ? learnedImageBlocks.length + " Referenzbild" + (learnedImageBlocks.length > 1 ? "er" : "") + " bekannter Produkte, gefolgt vom" : "das"} Scan-Foto das analysiert werden soll.

PRODUKTLISTE MIT REFERENZBILDERN:
${productList || "Keine Produkte konfiguriert"}

ANWEISUNGEN:
1. Analysiere NUR das Scan-Foto (das letzte Bild nach dem Label "=== SCAN-FOTO ===").
2. Erkenne alle sichtbaren Produkte (Flaschen, Dosen, Verpackungen etc.).
3. Vergleiche visuell mit den Referenzbildern: Gleiche Verpackung, gleiche Farben, gleicher Aufdruck?
4. Ignoriere Menschen, Hände, Körperteile, Hintergrund.

ID-VERGABE (ABSOLUT KRITISCH):
- Weise eine ID NUR zu wenn das Produkt im Scan-Foto VISUELL EINDEUTIG mit dem Referenzbild übereinstimmt.
- Bei JEDER Unsicherheit: id: -1. Lieber id: -1 als eine falsche ID.
- VERBOTEN: Eine ID vergeben nur weil der Name ähnlich klingt oder das Produkt irgendwie passt.
- Wenn ein Produkt im Scan erkannt wird aber NICHT in der Produktliste steht → id: -1.

MENGEN ZÄHLEN:
- Zähle jede physisch sichtbare Einheit. Gleiche Produkte zusammenfassen (quantity erhöhen).
- Beispiel: 3 Coca-Cola + 1 Fanta → [{id:X, name:"Coca-Cola", quantity:3}, {id:Y, name:"Fanta", quantity:1}]

ALTERSBESCHRÄNKUNG:
- requiresAgeVerification: true für Alkohol (Bier, Wein, Spirituosen, Alcopops) und Tabak (Zigaretten, Zigarren, E-Zigaretten).

Antworte AUSSCHLIESSLICH als JSON (kein anderer Text, keine Erklärungen):
{"products": [{"id": 1, "name": "Coca-Cola 0.5L", "quantity": 2, "confidence": "high", "requiresAgeVerification": false}], "unrecognized": 0}

Feldbeschreibung:
- id: Produkt-ID aus der Produktliste wenn EINDEUTIG erkannt, sonst -1
- name: Produktname wie auf der Verpackung sichtbar
- quantity: Anzahl sichtbarer Exemplare (mindestens 1)
- confidence: "high" (>85%), "medium" (60-85%), "low" (<60%)
- requiresAgeVerification: true bei Alkohol oder Tabak
- unrecognized: Anzahl Produkte die du siehst aber nicht zuordnen konntest

Wenn das Scan-Foto keine Produkte zeigt: {"products": [], "unrecognized": 0}`;

      } else {
        // ── MODUS B: Freie Erkennung (keine Lernbilder vorhanden) ─────────────────
        const menuList = items.map((item: typeof items[number]) =>
          `- ID:${item.id} | "${item.name}"`
        ).join("\n");

        systemPrompt = `Du bist ein präzises Kiosk-Kassensystem. Erkenne alle Produkte im folgenden Foto.

MENÜLISTE (NUR diese IDs verwenden):
${menuList || "Keine Produkte konfiguriert – erkenne alle Produkte frei, id: -1 für alle"}

ANWEISUNGEN:
1. Erkenne ALLE sichtbaren Produkte (Flaschen, Dosen, Verpackungen, Snacks etc.).
2. Ignoriere Menschen, Hände, Körperteile, Möbel, Hintergrund.
3. Maximal 10 verschiedene Produkte. Wenn mehr erkannt: nur die 10 deutlichsten.

ID-VERGABE (ABSOLUT KRITISCH):
- ID NUR vergeben wenn der Produktname im Foto EXAKT oder sehr ähnlich in der Menüliste steht (gleiche Marke, gleicher Name).
- Bei Unsicherheit oder wenn Produkt nicht in der Liste: id: -1. Lieber id: -1 als eine falsche ID.
- Beispiel: Du siehst "Natron", Menüliste hat "Marlboro Gold" → id: -1 für Natron.
- Beispiel: Du siehst "Coca-Cola", Menüliste hat "Coca-Cola 0.5L" → gültige Übereinstimmung.

MENGEN ZÄHLEN:
- Gleiche Produkte zusammenfassen: 3 Coca-Cola → quantity: 3 (NICHT 3 separate Einträge).
- Beispiel: 2× Coca-Cola + 1× Fanta → [{id:X, name:"Coca-Cola", quantity:2}, {id:Y, name:"Fanta", quantity:1}]

ALTERSBESCHRÄNKUNG:
- requiresAgeVerification: true für Alkohol (Bier, Wein, Spirituosen, Alcopops) und Tabak.

Antworte AUSSCHLIESSLICH als JSON:
{"products": [{"id": 1, "name": "Coca-Cola 0.5L", "quantity": 2, "confidence": "high", "requiresAgeVerification": false}], "unrecognized": 0}

- id: Menü-ID wenn EINDEUTIG erkannt, sonst -1
- name: Produktname wie auf der Verpackung sichtbar
- quantity: Anzahl sichtbarer Exemplare (mindestens 1)
- confidence: "high" (>85%), "medium" (60-85%), "low" (<60%)
- unrecognized: Anzahl Produkte die du siehst aber nicht zuordnen konntest

Wenn keine Produkte sichtbar: {"products": [], "unrecognized": 0}`;
      }

      // FIX-2: Prompt als system-Feld übergeben (Anthropic-Best-Practice).
      // Vorher: Prompt war als letztes text-Element im user-Content – nach den Bildern.
      // Das ist suboptimal: Die KI sieht zuerst alle Bilder, dann erst die Anweisungen.
      // Mit system-Feld: Anweisungen sind immer präsent und klar getrennt von den Bildern.
      //
      // FIX-3: Bilder-Reihenfolge mit Einleitungstext: Zuerst ein kurzer Text der erklärt
      // was folgt, dann Referenzbilder, dann Scan-Foto mit Label.
      // So weiss die KI genau welches Bild das Scan-Foto ist.
      const introText = learnedImageBlocks.length > 0
        ? `Ich zeige dir zuerst ${learnedImageBlocks.length} Referenzbild${learnedImageBlocks.length > 1 ? "er" : ""} der bekannten Produkte, dann das Scan-Foto das analysiert werden soll.`
        : "Analysiere das folgende Foto und erkenne alle Produkte.";

      const messageContent: Array<{
        type: "image" | "text";
        source?: { type: "base64"; media_type: string; data: string };
        text?: string;
      }> = [
        { type: "text", text: introText },
        ...learnedImageBlocks,
        ...(learnedImageBlocks.length > 0
          ? [{ type: "text" as const, text: "=== SCAN-FOTO (dieses Bild analysieren) ==="}]
          : []
        ),
        {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64Data },
        },
      ];

      // STF-1: Analyse-Logging
      const _scanStartTime = Date.now();
      // STF-4: 120s Timeout für KI-Anfrage (Cloud-Run hat 180s Limit)
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: messageContent,
          }],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "unknown");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `KI-Anfrage fehlgeschlagen (${response.status}): ${errBody.slice(0, 200)}`,
        });
      }

      const aiData = await response.json() as { content?: Array<{ text: string }> };
      const rawText = aiData.content?.[0]?.text ?? "{}";
      // STF-1: Gesamtdauer loggen
      console.log(`[scanProducts] Gesamtdauer: ${Date.now() - _scanStartTime}ms | Modus: ${hasLearnedImages ? "A" : "B"}`);

      // Parse AI response
      let parsed: {
        error?: string;
        products?: Array<{ id: number; name: string; quantity: number; confidence: string; requiresAgeVerification?: boolean }>;
        unrecognized?: number;
      };
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = {};
      }

      const rawProducts = (parsed.products ?? []).slice(0, 10); // max 10 products

      // ── KI-Trainingsdaten asynchron speichern (fire-and-forget, blockiert Gast nicht) ──
      // Nur speichern wenn mindestens 1 Produkt erkannt wurde (sinnvolle Trainingsbilder)
      const sessionIdForTraining = input.token; // token als Proxy-Session-ID für anonyme Scans
      if (rawProducts.length > 0) {
        const labelJson = JSON.stringify(rawProducts.map((p: { id: number; name: string; quantity: number; confidence: string }) => ({
          id: p.id, name: p.name, quantity: p.quantity, confidence: p.confidence,
        })));
        // Explizit kein await – läuft im Hintergrund, Gast bekommt sofort Antwort
        void saveTrainingImageAsync(
          sessionIdForTraining,
          station.id,
          station.restaurantId,
          input.imageBase64,
          labelJson,
        );
      }

      if (hasLearnedImages) {
        // Modus A: Abgleich nach ID (primär) – kein unsicheres Fuzzy-Matching
        // Das Fuzzy-Matching wird nur als enger Fallback verwendet (exakte Teilstring-Übereinstimmung,
        // NICHT das gefährliche split(" ")[0]-Matching das zu Fehlzuweisungen führt)
        const recognizedProducts = rawProducts
          .map((p: { id: number; name: string; quantity: number; confidence: string; requiresAgeVerification?: boolean }) => {
            // Primär: ID-Match (KI hat korrekte ID zurückgegeben)
            let item = items.find((i: typeof items[number]) => i.id === p.id && p.id !== -1);
            // Fallback: Nur enger Name-Match (beide müssen sich gegenseitig enthalten, min. 4 Zeichen)
            // KEIN split(" ")[0]-Matching – das führt zu Fehlzuweisungen ("Natron" → "Natronlauge" etc.)
            if (!item && p.name && p.name.length >= 4 && p.confidence !== "low") {
              const pNameLower = p.name.toLowerCase();
              item = items.find((i: typeof items[number]) => {
                const iNameLower = i.name.toLowerCase();
                // Nur wenn beide Namen sich gegenseitig enthalten (enger Match)
                return (
                  (iNameLower.includes(pNameLower) && pNameLower.length >= 4) ||
                  (pNameLower.includes(iNameLower) && iNameLower.length >= 4)
                );
              });
            }
            if (item) {
              return {
                id: item.id,
                name: item.name,
                price: parseFloat(item.price as string),
                quantity: p.quantity ?? 1,
                confidence: p.confidence,
                matched: true,
                requiresAgeVerification: p.requiresAgeVerification ?? false,
              };
            } else {
              return {
                id: -1,
                name: p.name,
                price: 0,
                quantity: p.quantity ?? 1,
                confidence: p.confidence,
                matched: false,
                requiresAgeVerification: p.requiresAgeVerification ?? false,
              };
            }
          });

        // RU-2: Fehler-Benachrichtigung fire-and-forget
        getDb().then(db => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          return db.select({ id: kioskImageFetchErrors.id })
            .from(kioskImageFetchErrors)
            .where(and(
              eq(kioskImageFetchErrors.restaurantId, station.restaurantId),
              isNull(kioskImageFetchErrors.resolvedAt),
              gte(kioskImageFetchErrors.createdAt, oneHourAgo),
            ))
            .limit(10);
        }).then(recentErrors => {
          if (recentErrors.length > 3) {
            notifyOwner({
              title: "⚠️ Kiosk: Lernbild-Fehler häufen sich",
              content: `In der letzten Stunde sind ${recentErrors.length} Lernbild-Fetch-Fehler aufgetreten (Restaurant ${station.restaurantId}). Bitte prüfen Sie im Admin-Panel unter Kiosk → Gästefotos.`,
            }).catch(() => {});
          }
        }).catch(() => {});
        return {
          error: null,
          products: recognizedProducts,
          unrecognized: parsed.unrecognized ?? 0,
          message: null,
          mode: "matching",
        };
      } else {
        // Modus B: Freie Erkennung – Abgleich nach ID (primär), dann enger Name-Match
        // KEIN split(" ")[0]-Matching – das führt zu Fehlzuweisungen
        const recognizedProducts = rawProducts
          .map((p: { id: number; name: string; quantity: number; confidence: string; requiresAgeVerification?: boolean }) => {
            // Primär: ID-Match (KI hat korrekte ID zurückgegeben)
            let item = items.find((i: typeof items[number]) => i.id === p.id && p.id !== -1);

            // Fallback: Nur enger Name-Match (beide müssen sich gegenseitig enthalten, min. 4 Zeichen)
            // KEIN split(" ")[0]-Matching – das führt zu Fehlzuweisungen ("Natron" → "Marlboro Gold" etc.)
            if (!item && p.name && p.name.length >= 4 && p.confidence !== "low") {
              const pNameLower = p.name.toLowerCase();
              item = items.find((i: typeof items[number]) => {
                const iNameLower = i.name.toLowerCase();
                // Nur wenn beide Namen sich gegenseitig enthalten (enger Match)
                return (
                  (iNameLower.includes(pNameLower) && pNameLower.length >= 4) ||
                  (pNameLower.includes(iNameLower) && iNameLower.length >= 4)
                );
              });
            }

            if (item) {
              return {
                id: item.id,
                name: item.name,
                price: parseFloat(item.price as string),
                quantity: p.quantity ?? 1,
                confidence: p.confidence,
                matched: true,
                requiresAgeVerification: p.requiresAgeVerification ?? false,
              };
            } else {
              return {
                id: -1,
                name: p.name,
                price: 0,
                quantity: p.quantity ?? 1,
                confidence: p.confidence,
                matched: false,
                requiresAgeVerification: p.requiresAgeVerification ?? false,
              };
            }
          });

        // RU-2: Fehler-Benachrichtigung fire-and-forget
        getDb().then(db => {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          return db.select({ id: kioskImageFetchErrors.id })
            .from(kioskImageFetchErrors)
            .where(and(
              eq(kioskImageFetchErrors.restaurantId, station.restaurantId),
              isNull(kioskImageFetchErrors.resolvedAt),
              gte(kioskImageFetchErrors.createdAt, oneHourAgo),
            ))
            .limit(10);
        }).then(recentErrors => {
          if (recentErrors.length > 3) {
            notifyOwner({
              title: "⚠️ Kiosk: Lernbild-Fehler häufen sich",
              content: `In der letzten Stunde sind ${recentErrors.length} Lernbild-Fetch-Fehler aufgetreten (Restaurant ${station.restaurantId}). Bitte prüfen Sie im Admin-Panel unter Kiosk → Gästefotos.`,
            }).catch(() => {});
          }
        }).catch(() => {});
        // Return ALL recognized products – matched (with price) and unmatched (price: 0, needs service)
        return {
          error: null,
          products: recognizedProducts,
          unrecognized: parsed.unrecognized ?? 0,
          message: null,
          mode: "free",
        };
      }
    }),

  // ── Gast: Stripe Checkout erstellen ──────────────────────────────────────

  /**
   * Stripe-Checkout-Session für Kiosk-Bestellung erstellen.
   * Gibt die Stripe-Checkout-URL zurück, zu der der Gast weitergeleitet wird.
   */
  createKioskCheckout: publicProcedure
    .input(z.object({
      token: z.string(),
      products: z.array(z.object({
        id: z.number(),
        name: z.string(),
        price: z.number(),
        quantity: z.number(),
      })),
      // Essensbestellungen (müssen abgeholt werden)
      foodItems: z.array(z.object({
        menuItemId: z.number(),
        name: z.string(),
        price: z.number(),
        quantity: z.number(),
      })).optional().default([]),
      sessionId: z.string().optional(), // kioskSessions.sessionId für Abholnummer
      origin: z.string(), // Frontend-URL für Redirect
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Validate station
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.qrToken, input.token),
          eq(kioskStations.isActive, true),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND", message: "Station nicht gefunden" });

      // Get restaurant currency
      const [restaurant] = await db
        .select({ name: restaurants.name, currency: restaurants.currency })
        .from(restaurants)
        .where(eq(restaurants.id, station.restaurantId));

      const currency = (restaurant?.currency ?? "CHF").toLowerCase();

            // Build Stripe line items (Kiosk-Artikel + Essen)
      const allLineItems = [
        ...input.products.map((p) => ({
          price_data: { currency, product_data: { name: p.name }, unit_amount: Math.round(p.price * 100) },
          quantity: p.quantity,
        })),
        ...input.foodItems.map((f) => ({
          price_data: { currency, product_data: { name: `🍽️ ${f.name}` }, unit_amount: Math.round(f.price * 100) },
          quantity: f.quantity,
        })),
      ];
      const lineItems = allLineItems;
      // Encode products in metadata for order creation after payment
      const productsJson = JSON.stringify(
        input.products.map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: p.quantity }))
      );
      const foodJson = JSON.stringify(
        input.foodItems.map((f) => ({ menuItemId: f.menuItemId, name: f.name, price: f.price, quantity: f.quantity }))
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        metadata: {
          type: "kiosk_order",
          kiosk_token: input.token,
          restaurant_id: station.restaurantId.toString(),
          station_name: station.name,
          products: productsJson.slice(0, 500), // Stripe metadata limit 500 chars per value
          food_items: foodJson.slice(0, 500),
          kiosk_session_id: input.sessionId ?? "",
        },
        success_url: `${input.origin}/kiosk/${input.token}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/kiosk/${input.token}?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
      });

      return { checkoutUrl: session.url!, sessionId: session.id };
    }),

  /**
   * Stripe-Zahlung bestätigen und Bestellung im POS anlegen.
   * Wird nach erfolgreicher Zahlung aufgerufen (success_url).
   */
  confirmKioskPayment: publicProcedure
    .input(z.object({
      token: z.string(),
      sessionId: z.string(), // Stripe checkout session ID
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Validate station
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(
          eq(kioskStations.qrToken, input.token),
          eq(kioskStations.isActive, true),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify Stripe session
      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(input.sessionId);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültige Zahlungssession" });
      }

      if (session.payment_status !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Zahlung noch nicht abgeschlossen" });
      }

      // Check metadata matches
      if (session.metadata?.kiosk_token !== input.token) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session gehört nicht zu dieser Station" });
      }

            // Parse products from metadata
      let products: Array<{ id: number; name: string; price: number; quantity: number }> = [];
      let foodItems: Array<{ menuItemId: number; name: string; price: number; quantity: number }> = [];
      const kioskSessionId = session.metadata?.kiosk_session_id ?? "";
      try {
        products = JSON.parse(session.metadata?.products ?? "[]");
      } catch {
        products = [];
      }
      try {
        foodItems = JSON.parse(session.metadata?.food_items ?? "[]");
      } catch {
        foodItems = [];
      }
      if (products.length === 0 && foodItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Produkte in der Session" });
      }

      // Calculate totals (Kiosk-Artikel + Essen)
      const kioskSubtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
      const foodSubtotal = foodItems.reduce((sum, f) => sum + f.price * f.quantity, 0);
      const subtotal = kioskSubtotal + foodSubtotal;
      const orderNumber = `K-${Date.now().toString(36).toUpperCase()}`;

      // Create order in POS
      await db.insert(orders).values({
        restaurantId: station.restaurantId,
        orderNumber,
        status: "paid",
        type: "dine_in",
        subtotal: subtotal.toFixed(2),
        taxAmount: "0.00",
        totalAmount: subtotal.toFixed(2),
        paymentMethod: "online",
        paidAt: new Date(),
        notes: `Kiosk-Station: ${station.name} | Stripe: ${input.sessionId}`,
        guestCount: 1,
      });

      // Get the created order
      const [newOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber));

      if (!newOrder) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bestellung konnte nicht erstellt werden" });

            // Create order items (Kiosk-Artikel: sofort served)
      for (const p of products) {
        await db.insert(orderItems).values({
          orderId: newOrder.id,
          productId: p.id > 0 ? p.id : undefined,
          name: p.name,
          quantity: p.quantity,
          unitPrice: p.price.toFixed(2),
          totalPrice: (p.price * p.quantity).toFixed(2),
          status: "served",
          itemType: "other",
        });
      }
      // Create food items (Essen: pending → KDS)
      let pickupNumber: number | null = null;
      if (foodItems.length > 0) {
        for (const f of foodItems) {
          await db.insert(orderItems).values({
            orderId: newOrder.id,
            productId: f.menuItemId > 0 ? f.menuItemId : undefined,
            name: f.name,
            quantity: f.quantity,
            unitPrice: f.price.toFixed(2),
            totalPrice: (f.price * f.quantity).toFixed(2),
            status: "pending",
            itemType: "food",
          });
        }
        // Abholnummer generieren (täglicher Zähler 1-999)
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const [lastPickup] = await db
          .select({ number: kioskPickupNumbers.number })
          .from(kioskPickupNumbers)
          .where(and(
            eq(kioskPickupNumbers.restaurantId, station.restaurantId),
            gt(kioskPickupNumbers.createdAt, todayStart),
          ))
          .orderBy(desc(kioskPickupNumbers.number))
          .limit(1);
        pickupNumber = ((lastPickup?.number ?? 0) % 999) + 1;
        await db.insert(kioskPickupNumbers).values({
          restaurantId: station.restaurantId,
          sessionId: kioskSessionId || orderNumber,
          orderId: newOrder.id,
          number: pickupNumber,
          status: "waiting",
        });
      }
      // Notify restaurant staff
      const foodSummary = foodItems.length > 0 ? `\nEssen (Abholnr. ${pickupNumber}): ${foodItems.map((f) => `${f.quantity}× ${f.name}`).join(", ")}` : "";
      await notifyOwner({
        title: `🛒 Kiosk-Bestellung bezahlt – ${station.name}`,
        content: `Bestellung ${orderNumber} wurde online bezahlt.\nProdukte: ${products.map((p) => `${p.quantity}× ${p.name}`).join(", ")}${foodSummary}\nTotal: ${subtotal.toFixed(2)} CHF`,
      }).catch(() => {}); // Don't fail if notification fails
      return {
        success: true,
        orderNumber,
        orderId: newOrder.id,
        total: subtotal,
        pickupNumber, // null wenn kein Essen bestellt
        hasFoodItems: foodItems.length > 0,
      };
    }),

  // ── Admin: Liste aller Menüartikel (für Einlernen) ─────────────────────────

  listMenuItems: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    return db
      .select({ id: menuItems.id, name: menuItems.name })
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, ctx.user.restaurantId), eq(menuItems.isActive, true)))
      .orderBy(asc(menuItems.name));
  }),

  // ── Gast: Service rufen ────────────────────────────────────────────────────

  // ── Altersverifikation (Alkohol) ─────────────────────────────────────────

  requestAgeVerification: publicProcedure
    .input(z.object({
      token: z.string(),
      products: z.array(z.object({
        id: z.number(),
        name: z.string(),
        price: z.number(),
        quantity: z.number(),
        requiresAgeVerification: z.boolean().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [station] = await db
        .select()
        .from(kioskStations)
        .where(and(eq(kioskStations.qrToken, input.token), eq(kioskStations.isActive, true)));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      const sessionToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(kioskAgeVerifications).values({
        restaurantId: station.restaurantId,
        stationId: station.id,
        sessionToken,
        products: input.products,
        status: "pending",
        expiresAt,
      });

      const alcoholItems = input.products.filter((p) => p.requiresAgeVerification);
      await notifyOwner({
        title: `🔞 Altersverifikation – ${station.name}`,
        content: `Gast möchte kaufen: ${alcoholItems.map((p) => `${p.quantity}× ${p.name}`).join(", ")}\nBitte Alter prüfen und bestätigen.`,
      }).catch(() => {});

      // Push an alle Kellner-Geräte
      await sendKioskPush(
        db,
        station.restaurantId,
        `🔞 Altersverifikation – ${station.name}`,
        `Alkohol/Tabak: ${alcoholItems.map((p) => `${p.quantity}× ${p.name}`).join(", ")}`,
        "/kellner/kiosk-monitor",
      ).catch(() => {});

      return { sessionToken };
    }),

  checkAgeVerificationStatus: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [v] = await db
        .select()
        .from(kioskAgeVerifications)
        .where(eq(kioskAgeVerifications.sessionToken, input.sessionToken));
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      if (new Date() > v.expiresAt) return { status: "expired" as const };
      return { status: v.status };
    }),

  approveAgeVerification: protectedProcedure
    .input(z.object({ sessionToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [v] = await db
        .select()
        .from(kioskAgeVerifications)
        .where(and(
          eq(kioskAgeVerifications.sessionToken, input.sessionToken),
          eq(kioskAgeVerifications.restaurantId, ctx.user.restaurantId),
        ));
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      if (v.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Bereits entschieden" });
      await db
        .update(kioskAgeVerifications)
        .set({ status: "approved", approvedBy: ctx.user.id, approvedAt: new Date() })
        .where(eq(kioskAgeVerifications.sessionToken, input.sessionToken));
      return { success: true };
    }),

  rejectAgeVerification: protectedProcedure
    .input(z.object({ sessionToken: z.string(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [v] = await db
        .select()
        .from(kioskAgeVerifications)
        .where(and(
          eq(kioskAgeVerifications.sessionToken, input.sessionToken),
          eq(kioskAgeVerifications.restaurantId, ctx.user.restaurantId),
        ));
      if (!v) throw new TRPCError({ code: "NOT_FOUND" });
      if (v.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Bereits entschieden" });
      await db
        .update(kioskAgeVerifications)
        .set({ status: "rejected", rejectedBy: ctx.user.id, rejectedAt: new Date(), note: input.note })
        .where(eq(kioskAgeVerifications.sessionToken, input.sessionToken));
      return { success: true };
    }),

  getPendingAgeVerifications: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    return db
      .select()
      .from(kioskAgeVerifications)
      .where(and(
        eq(kioskAgeVerifications.restaurantId, ctx.user.restaurantId),
        eq(kioskAgeVerifications.status, "pending"),
        gt(kioskAgeVerifications.expiresAt, new Date()),
      ))
      .orderBy(asc(kioskAgeVerifications.createdAt));
  }),

  /**
   * Live-Rahmenerkennung: Prüft ob ein physischer weisser Rahmen im Kamerabild sichtbar ist.
   * Wird alle 2 Sekunden vom Kiosk-Frontend aufgerufen (kleines Vorschaubild, 320x240).
   * Gibt { frameDetected: boolean } zurück.
   */
  checkFrame: publicProcedure
    .input(z.object({
      token: z.string(),
      imageBase64: z.string(), // JPEG base64, ~320x240, kein data:-Prefix
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Station validieren (Token muss gültig sein)
      const stationRows = await db
        .select({ id: kioskStations.id })
        .from(kioskStations)
        .where(and(
          eq(kioskStations.qrToken, input.token),
          eq(kioskStations.isActive, true),
        ));
      if (!stationRows.length) throw new TRPCError({ code: "NOT_FOUND" });

      const { invokeLLM } = await import("../_core/llm");

      const result = await invokeLLM({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${input.imageBase64}`,
                  detail: "low",
                },
              },
              {
                type: "text",
                text: `Look at this camera preview image from a self-service kiosk.

Is there a PHYSICAL white or light-colored rectangular frame/border visible in the image? This is a real physical object (e.g. a white cardboard frame, a white plastic frame, or a white painted border on a surface) that the guest places their products inside before scanning.

Answer with ONLY one word: "yes" if a physical white/light rectangular frame is clearly visible, or "no" if there is no such frame visible.

Do NOT count:
- The camera overlay/UI border drawn by the app
- White edges of the screen itself
- White packaging of products
- White walls or surfaces in the background

Only answer "yes" if you can clearly see a distinct rectangular frame/border that appears to be a physical object placed on a surface.`,
              },
            ],
          },
        ],
      });

      const rawContent = result.choices?.[0]?.message?.content;
      const answer = (typeof rawContent === "string" ? rawContent : "").trim().toLowerCase();
      const frameDetected = answer.startsWith("yes");

      return { frameDetected };
    }),

  /** Service-Ruf vom Gast */
  callService: publicProcedure
    .input(z.object({
      token: z.string(),
      sessionId: z.string().optional(),
      tableNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const stationRows = await db
        .select()
        .from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));
      const station = stationRows[0];
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      // Session-Status aktualisieren
      if (input.sessionId) {
        await db.update(kioskSessions)
          .set({ status: "service_called", serviceCallCount: sql`serviceCallCount + 1` })
          .where(eq(kioskSessions.sessionId, input.sessionId));
        await db.insert(kioskEvents).values({
          sessionId: input.sessionId,
          stationId: station.id,
          restaurantId: station.restaurantId,
          eventType: "service_called",
          payload: { note: input.tableNote ?? null },
        });
        // Stichprobe prüfen: 2+ Service-Rufe
        const [sess] = await db.select().from(kioskSessions).where(eq(kioskSessions.sessionId, input.sessionId));
        if (sess && sess.serviceCallCount >= 2) {
          await _triggerSpotCheck(db, input.sessionId, station.id, station.restaurantId, "2+ Service-Rufe in einer Session");
        }
      }

      await notifyOwner({
        title: `🔔 Service gerufen – ${station.name}`,
        content: `Ein Gast an Kiosk-Station "${station.name}" benötigt Hilfe.${input.tableNote ? `\nHinweis: ${input.tableNote}` : ""}`,
      }).catch(() => {});

      // Push an alle Kellner-Geräte
      await sendKioskPush(
        db,
        station.restaurantId,
        `🔔 Service gerufen – ${station.name}`,
        `Ein Gast benötigt Hilfe.${input.tableNote ? ` Hinweis: ${input.tableNote}` : ""}`,
        "/kellner/kiosk-monitor",
      ).catch(() => {});

      return { success: true };
    }),

  // ── Session-Tracking (public, token-basiert) ──────────────────────────────

  /** Neue Gast-Session starten (beim QR-Scan) */
  startSession: publicProcedure
    .input(z.object({
      token: z.string(),
      // LL-8: Wartezeit-Tracking – optional, wenn Gast auf Busy-Screen gewartet hat
      waitStartedAt: z.number().optional(),
      waitEndedAt: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [station] = await db.select().from(kioskStations)
        .where(and(eq(kioskStations.qrToken, input.token), eq(kioskStations.isActive, true)));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      const sessionId = crypto.randomBytes(16).toString("hex");
      await db.insert(kioskSessions).values({
        sessionId,
        stationId: station.id,
        restaurantId: station.restaurantId,
        status: "active",
        waitStartedAt: input.waitStartedAt ?? null,
        waitEndedAt: input.waitEndedAt ?? null,
      });
      await db.insert(kioskEvents).values({
        sessionId,
        stationId: station.id,
        restaurantId: station.restaurantId,
        eventType: "session_started",
        payload: input.waitStartedAt ? { waitedSec: Math.round((( input.waitEndedAt ?? input.waitStartedAt) - input.waitStartedAt) / 1000) } : {},
      });
      return { sessionId };
    }),

  /** Event loggen (scan_repeated, payment_started, payment_aborted, etc.) */
  logEvent: publicProcedure
    .input(z.object({
      token: z.string(),
      sessionId: z.string(),
      eventType: z.enum([
        "scan_started", "scan_completed", "scan_repeated",
        "payment_started", "payment_completed", "payment_aborted",
        "service_called", "age_verification_requested",
        "session_ended",
      ]),
      payload: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [station] = await db.select().from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      await db.insert(kioskEvents).values({
        sessionId: input.sessionId,
        stationId: station.id,
        restaurantId: station.restaurantId,
        eventType: input.eventType as typeof kioskEvents.$inferInsert["eventType"],
        payload: input.payload ?? {},
      });

      // Session-Zähler aktualisieren
      if (input.eventType === "scan_started") {
        await db.update(kioskSessions)
          .set({ scanCount: sql`scanCount + 1` })
          .where(eq(kioskSessions.sessionId, input.sessionId));
      } else if (input.eventType === "payment_aborted") {
        await db.update(kioskSessions)
          .set({ status: "aborted", abortCount: sql`abortCount + 1` })
          .where(eq(kioskSessions.sessionId, input.sessionId));
      } else if (input.eventType === "session_ended") {
        await db.update(kioskSessions)
          .set({ status: "completed", endedAt: new Date() })
          .where(eq(kioskSessions.sessionId, input.sessionId));
      } else if (input.eventType === "age_verification_requested") {
        await db.update(kioskSessions)
          .set({ status: "age_check" })
          .where(eq(kioskSessions.sessionId, input.sessionId));
      }

      // Stichproben-Logik: automatisch auslösen bei Mustern
      const [sess] = await db.select().from(kioskSessions)
        .where(eq(kioskSessions.sessionId, input.sessionId));
      if (sess) {
        if (input.eventType === "scan_repeated" && sess.scanCount >= 3) {
          await _triggerSpotCheck(db, input.sessionId, station.id, station.restaurantId, `${sess.scanCount}× Scan wiederholt`);
        }
        if (input.eventType === "payment_aborted") {
          await _triggerSpotCheck(db, input.sessionId, station.id, station.restaurantId, "Zahlung nach Scan abgebrochen");
        }
        // Zeitbasierte Stichprobe: >5 Minuten aktiv
        const durationMin = (Date.now() - new Date(sess.startedAt).getTime()) / 60000;
        if (durationMin > 5 && sess.scanCount > 0) {
          await _triggerSpotCheck(db, input.sessionId, station.id, station.restaurantId, `Session >5 Min. aktiv (${Math.round(durationMin)} Min.)`);
        }
      }

      return { success: true };
    }),

  /** Session beenden */
  endSession: publicProcedure
    .input(z.object({
      token: z.string(),
      sessionId: z.string(),
      paymentStatus: z.enum(["none", "pending", "paid", "failed"]).optional(),
      totalAmount: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [station] = await db.select().from(kioskStations)
        .where(eq(kioskStations.qrToken, input.token));
      if (!station) return { success: true }; // silent fail

      await db.update(kioskSessions)
        .set({
          status: input.paymentStatus === "paid" ? "completed" : "aborted",
          endedAt: new Date(),
          paymentStatus: input.paymentStatus ?? "none",
          totalAmount: input.totalAmount ? String(input.totalAmount) : undefined,
        })
        .where(eq(kioskSessions.sessionId, input.sessionId));

      await db.insert(kioskEvents).values({
        sessionId: input.sessionId,
        stationId: station.id,
        restaurantId: station.restaurantId,
        eventType: "session_ended",
        payload: { paymentStatus: input.paymentStatus, totalAmount: input.totalAmount },
      });
      return { success: true };
    }),

  // ── Live-Überwachung (protected) ──────────────────────────────────────────

  /** Alle Stationen mit aktiver Session für Live-Dashboard */
  getLiveStations: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();

    const stations = await db.select().from(kioskStations)
      .where(eq(kioskStations.restaurantId, ctx.user.restaurantId));

    // Aktive Sessions (nicht älter als 30 Min.)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const activeSessions = await db.select().from(kioskSessions)
      .where(and(
        eq(kioskSessions.restaurantId, ctx.user.restaurantId),
        or(
          eq(kioskSessions.status, "active"),
          eq(kioskSessions.status, "service_called"),
          eq(kioskSessions.status, "age_check"),
          eq(kioskSessions.status, "spot_check"),
        ),
        isNull(kioskSessions.endedAt),
      ));

    // Offene Stichproben
    const pendingChecks = await db.select().from(kioskSpotChecks)
      .where(and(
        eq(kioskSpotChecks.restaurantId, ctx.user.restaurantId),
        eq(kioskSpotChecks.status, "pending"),
      ));

    return stations.map((s: typeof stations[number]) => {
      const session = activeSessions.find((sess: typeof activeSessions[number]) => sess.stationId === s.id) ?? null;
      const spotCheck = session ? pendingChecks.find((c: typeof pendingChecks[number]) => c.sessionId === session.sessionId) ?? null : null;
      const durationSec = session ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000) : 0;
      return {
        station: s,
        session,
        spotCheck,
        durationSec,
        // Status-Farbe: grey=frei, orange=aktiv, red=service/age, purple=stichprobe
        displayStatus: spotCheck ? "spot_check" :
          session?.status === "service_called" ? "service_called" :
          session?.status === "age_check" ? "age_check" :
          session ? "active" : "idle",
      };
    });
  }),

  /** Events einer Session abrufen */
  getSessionEvents: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db.select().from(kioskEvents)
        .where(eq(kioskEvents.sessionId, input.sessionId))
        .orderBy(asc(kioskEvents.createdAt));
    }),

  /** Letzte Sessions eines Restaurants (für Statistiken) */
  getRecentSessions: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db.select({
        session: kioskSessions,
        stationName: kioskStations.name,
      })
        .from(kioskSessions)
        .leftJoin(kioskStations, eq(kioskSessions.stationId, kioskStations.id))
        .where(eq(kioskSessions.restaurantId, ctx.user.restaurantId))
        .orderBy(desc(kioskSessions.createdAt))
        .limit(input.limit);
    }),

  // ── Stichproben ───────────────────────────────────────────────────────────

  /** Offene Stichproben abrufen */
  getPendingSpotChecks: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    return db.select({
      check: kioskSpotChecks,
      stationName: kioskStations.name,
    })
      .from(kioskSpotChecks)
      .leftJoin(kioskStations, eq(kioskSpotChecks.stationId, kioskStations.id))
      .where(and(
        eq(kioskSpotChecks.restaurantId, ctx.user.restaurantId),
        eq(kioskSpotChecks.status, "pending"),
      ))
      .orderBy(desc(kioskSpotChecks.triggeredAt));
  }),

  /** Stichprobe auflösen (bestanden/nicht bestanden) */
  resolveSpotCheck: protectedProcedure
    .input(z.object({
      spotCheckId: z.number(),
      status: z.enum(["passed", "failed"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskSpotChecks)
        .set({
          status: input.status,
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          note: input.note,
        })
        .where(and(
          eq(kioskSpotChecks.id, input.spotCheckId),
          eq(kioskSpotChecks.restaurantId, ctx.user.restaurantId),
        ));

      // Event loggen
      const [check] = await db.select().from(kioskSpotChecks).where(eq(kioskSpotChecks.id, input.spotCheckId));
      if (check) {
        await db.insert(kioskEvents).values({
          sessionId: check.sessionId,
          stationId: check.stationId,
          restaurantId: check.restaurantId,
          eventType: "spot_check_passed",
          payload: { status: input.status, note: input.note, resolvedBy: ctx.user.id },
        });
        // Session-Status zurücksetzen
        await db.update(kioskSessions)
          .set({ status: "active" })
          .where(eq(kioskSessions.sessionId, check.sessionId));
      }
      return { success: true };
    }),

  /** Manuelle Stichprobe auslösen */
  triggerManualSpotCheck: protectedProcedure
    .input(z.object({ stationId: z.number(), sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await _triggerSpotCheck(db, input.sessionId, input.stationId, ctx.user.restaurantId, "Manuelle Stichprobe");
      return { success: true };
    }),

  // ── Manuelle Bestellung vom Kellner ───────────────────────────────────────

  /** Kellner erstellt manuelle Bestellung für Kiosk-Station (Text → KI → Produkte → Stripe → QR) */
  createManualOrder: protectedProcedure
    .input(z.object({
      stationId: z.number(),
      inputText: z.string().min(1),
      origin: z.string(), // Frontend-URL für Stripe redirect
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();

      // Station validieren
      const [station] = await db.select().from(kioskStations)
        .where(and(
          eq(kioskStations.id, input.stationId),
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
        ));
      if (!station) throw new TRPCError({ code: "NOT_FOUND" });

      // Menü laden
      const items = await db.select().from(menuItems)
        .where(and(
          eq(menuItems.restaurantId, ctx.user.restaurantId),
          eq(menuItems.isActive, true),
          eq(menuItems.isAvailable, true),
        ));

      const menuList = items.map((i: typeof items[number]) => `- ID:${i.id} | "${i.name}" | CHF ${Number(i.price).toFixed(2)}`).join("\n");

      // KI: Text → Produkte parsen
      const { invokeLLM } = await import("../_core/llm");
      const aiResp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein Kassensystem-Assistent. Analysiere die Bestellungsbeschreibung und ordne sie den Menüprodukten zu.\n\nMenüliste:\n${menuList}\n\nAntworte NUR als JSON:\n{"products":[{"id":1,"name":"Coca-Cola","price":3.50,"quantity":2}]}\nVerwende id:-1 wenn Produkt nicht in der Liste.`,
          },
          { role: "user", content: input.inputText },
        ],
      });

      const rawContent = aiResp.choices?.[0]?.message?.content;
      const aiText = typeof rawContent === "string" ? rawContent : "{}";
      let products: Array<{ id: number; name: string; price: number; quantity: number }> = [];
      try {
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? "{}") as { products?: typeof products };
        products = (parsed.products ?? []).filter(p => p.id !== -1 && p.price > 0);
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "KI konnte Bestellung nicht parsen" });
      }

      if (products.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Keine bekannten Produkte erkannt" });

      const totalAmount = products.reduce((s, p) => s + p.price * p.quantity, 0);

      // Stripe-Session erstellen
      const lineItems = products.map(p => ({
        price_data: {
          currency: "chf",
          product_data: { name: p.name },
          unit_amount: Math.round(p.price * 100),
        },
        quantity: p.quantity,
      }));

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${input.origin}/kiosk/${station.qrToken}?manual_paid=1`,
        cancel_url: `${input.origin}/kiosk/${station.qrToken}?manual_cancelled=1`,
        metadata: {
          type: "kiosk_manual",
          stationId: String(station.id),
          restaurantId: String(ctx.user.restaurantId),
          products: JSON.stringify(products),
          createdBy: String(ctx.user.id),
        },
      });

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Min.

      await db.insert(kioskManualOrders).values({
        stationId: station.id,
        restaurantId: ctx.user.restaurantId,
        createdBy: ctx.user.id,
        inputText: input.inputText,
        products: JSON.stringify(products),
        totalAmount: String(totalAmount),
        stripeSessionId: stripeSession.id,
        qrPayUrl: stripeSession.url ?? "",
        status: "pending",
        expiresAt,
      });

      return {
        qrPayUrl: stripeSession.url ?? "",
        products,
        totalAmount,
        stripeSessionId: stripeSession.id,
      };
    }),

  /** Offene manuelle Bestellungen für eine Station */
  getManualOrders: protectedProcedure
    .input(z.object({ stationId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db.select().from(kioskManualOrders)
        .where(and(
          eq(kioskManualOrders.stationId, input.stationId),
          eq(kioskManualOrders.restaurantId, ctx.user.restaurantId),
          or(
            eq(kioskManualOrders.status, "pending"),
            eq(kioskManualOrders.status, "paid"),
          ),
        ))
        .orderBy(desc(kioskManualOrders.createdAt))
        .limit(10);
    }),

  // ── Live-Monitor: Echtzeit-Kassenübersicht ───────────────────────────────

  /** Alle Stationen mit aktiver Session + Status für Live-Monitor */

  guestChat: publicProcedure
    .input(z.object({ message: z.string().max(500), restaurantName: z.string().max(100) }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein freundlicher digitaler Assistent von ${input.restaurantName}. Beantworte kurze Fragen des Gastes (Öffnungszeiten, Zahlungsarten, Produkte, Kiosk-Bedienung). Antworte immer auf Deutsch, maximal 2-3 Sätze.`,
          },
          { role: "user", content: input.message },
        ],
      });
      const reply = (response as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content ?? "Ich konnte Ihre Frage leider nicht beantworten.";
      return { reply };
    }),

  /** Sprache transkribieren (für manuelle Bestellung per Sprache) */
  transcribeVoice: protectedProcedure
    .input(z.object({ audioBase64: z.string() }))
    .mutation(async ({ input }) => {
      const { transcribeAudio } = await import("../_core/voiceTranscription");
      const audioBuffer = Buffer.from(input.audioBase64, "base64");
      const key = `voice-orders/${Date.now()}.webm`;
      const { url } = await storagePut(key, audioBuffer, "audio/webm");
      const result = await transcribeAudio({ audioUrl: url });
      const text = 'text' in result ? (result.text ?? "") : "";
      return { text };
    }),

  /** Kiosk-Statistiken für Dashboard */
  getKioskStats: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7),
      stationId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Basis-Filter
      const stationFilter = input.stationId
        ? and(eq(kioskSessions.restaurantId, ctx.user.restaurantId), eq(kioskSessions.stationId, input.stationId), gt(kioskSessions.startedAt, since))
        : and(eq(kioskSessions.restaurantId, ctx.user.restaurantId), gt(kioskSessions.startedAt, since));

      type SessionRow = typeof kioskSessions.$inferSelect;
      const sessions: SessionRow[] = await db.select().from(kioskSessions).where(stationFilter);

      const totalSessions = sessions.length;
      const paidSessions = sessions.filter((s: SessionRow) => s.paymentStatus === "paid").length;
      const abortedSessions = sessions.filter((s: SessionRow) => s.paymentStatus === "failed" || (s.abortCount ?? 0) > 0).length;
      const serviceCallSessions = sessions.filter((s: SessionRow) => (s.serviceCallCount ?? 0) > 0).length;
      const successRate = totalSessions > 0 ? Math.round((paidSessions / totalSessions) * 100) : 0;

      // Ø Sitzungsdauer (nur beendete Sessions)
      const endedSessions = sessions.filter((s: SessionRow) => s.endedAt);
      const avgDurationMs = endedSessions.length > 0
        ? endedSessions.reduce((sum: number, s: SessionRow) => sum + (s.endedAt!.getTime() - s.startedAt.getTime()), 0) / endedSessions.length
        : 0;
      const avgDurationSec = Math.round(avgDurationMs / 1000);

      // Umsatz
      const totalRevenue = sessions.reduce((sum: number, s: SessionRow) => sum + Number(s.totalAmount ?? 0), 0);

      // Stichproben
      const spotCheckFilter = input.stationId
        ? and(eq(kioskSpotChecks.restaurantId, ctx.user.restaurantId), eq(kioskSpotChecks.stationId, input.stationId), gt(kioskSpotChecks.triggeredAt, since))
        : and(eq(kioskSpotChecks.restaurantId, ctx.user.restaurantId), gt(kioskSpotChecks.triggeredAt, since));
      type SpotCheckRow = typeof kioskSpotChecks.$inferSelect;
      const spotChecks = await db.select().from(kioskSpotChecks).where(spotCheckFilter) as SpotCheckRow[];
      const spotChecksPassed = spotChecks.filter((s: SpotCheckRow) => s.status === "passed").length;
      const spotChecksFailed = spotChecks.filter((s: SpotCheckRow) => s.status === "failed").length;
      const spotChecksPending = spotChecks.filter((s: SpotCheckRow) => s.status === "pending").length;

      // Tages-Zeitreihe (letzte N Tage)
      const dailyMap = new Map<string, { sessions: number; paid: number; revenue: number }>();
      for (let d = 0; d < input.days; d++) {
        const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        dailyMap.set(key, { sessions: 0, paid: 0, revenue: 0 });
      }
      for (const s of sessions) {
        const key = s.startedAt.toISOString().slice(0, 10);
        const entry = dailyMap.get(key);
        if (entry) {
          entry.sessions++;
          if (s.paymentStatus === "paid") { entry.paid++; entry.revenue += Number(s.totalAmount ?? 0); }
        }
      }
      const dailyTimeline = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));

      // Top-Produkte aus Events
      const eventFilter = input.stationId
        ? and(eq(kioskEvents.restaurantId, ctx.user.restaurantId), eq(kioskEvents.stationId, input.stationId), eq(kioskEvents.eventType, "scan_completed"), gt(kioskEvents.createdAt, since))
        : and(eq(kioskEvents.restaurantId, ctx.user.restaurantId), eq(kioskEvents.eventType, "scan_completed"), gt(kioskEvents.createdAt, since));
      const scanEvents = await db.select().from(kioskEvents).where(eventFilter);
      const productCounts = new Map<string, number>();
      for (const ev of scanEvents) {
        const payload = ev.payload as { products?: Array<{ name: string; quantity?: number }> };
        for (const p of payload?.products ?? []) {
          const count = productCounts.get(p.name) ?? 0;
          productCounts.set(p.name, count + (p.quantity ?? 1));
        }
      }
      const topProducts = Array.from(productCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Stationen-Übersicht
      const stations = await db.select().from(kioskStations)
        .where(eq(kioskStations.restaurantId, ctx.user.restaurantId));
      const stationStats = stations.map((st: typeof kioskStations.$inferSelect) => {
        const stSessions = sessions.filter((s: SessionRow) => s.stationId === st.id);
        return {
          id: st.id,
          name: st.name,
          sessions: stSessions.length,
          paid: stSessions.filter((s: SessionRow) => s.paymentStatus === "paid").length,
          revenue: stSessions.reduce((sum: number, s: SessionRow) => sum + Number(s.totalAmount ?? 0), 0),
        };
      });

      return {
        totalSessions,
        paidSessions,
        abortedSessions,
        serviceCallSessions,
        successRate,
        avgDurationSec,
        totalRevenue,
        spotChecksPassed,
        spotChecksFailed,
        spotChecksPending,
        dailyTimeline,
        topProducts,
        stationStats,
      };
    }),

  /** CSV-Export der Kiosk-Statistiken */
  exportKioskStats: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      type SessionRow = typeof kioskSessions.$inferSelect;
      const sessions: SessionRow[] = await db.select().from(kioskSessions)
        .where(and(eq(kioskSessions.restaurantId, ctx.user.restaurantId), gt(kioskSessions.startedAt, since)));
      const stationsAll = await db.select().from(kioskStations)
        .where(eq(kioskStations.restaurantId, ctx.user.restaurantId));
      const stationMap = new Map<number, string>(stationsAll.map((s: typeof kioskStations.$inferSelect) => [s.id, s.name]));
      // Sessions-CSV
      const sessionsCsv = [
        ["Session-ID","Station","Gestartet","Beendet","Dauer (Sek)","Status","Betrag (CHF)","Scans","Service-Rufe","Abbrüche"].join(","),
        ...sessions.map((s: SessionRow) => [
          s.sessionId,
          `"${(stationMap.get(s.stationId) ?? `Kasse ${s.stationId}`).replace(/"/g, '""')}"`,
          s.startedAt.toISOString(),
          s.endedAt?.toISOString() ?? "",
          s.endedAt ? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000) : "",
          s.paymentStatus ?? s.status,
          Number(s.totalAmount ?? 0).toFixed(2),
          s.scanCount ?? 0,
          s.serviceCallCount ?? 0,
          s.abortCount ?? 0,
        ].join(","))
      ].join("\n");
      // Top-Produkte
      const scanEvents = await db.select().from(kioskEvents)
        .where(and(eq(kioskEvents.restaurantId, ctx.user.restaurantId), eq(kioskEvents.eventType, "scan_completed"), gt(kioskEvents.createdAt, since)));
      const productCounts = new Map<string, number>();
      for (const ev of scanEvents) {
        const payload = ev.payload as { products?: Array<{ name: string; quantity?: number }> };
        for (const p of payload?.products ?? []) {
          productCounts.set(p.name, (productCounts.get(p.name) ?? 0) + (p.quantity ?? 1));
        }
      }
      const productsCsv = [
        ["Produkt","Anzahl"].join(","),
        ...Array.from(productCounts.entries()).sort(([,a],[,b])=>b-a)
          .map(([name,count])=>[`"${name.replace(/"/g,'""')}"`,count].join(","))
      ].join("\n");
      // Stationen-CSV
      const stationsCsv = [
        ["Station","Sessions","Bezahlt","Umsatz (CHF)","Erfolgsquote (%)"].join(","),
        ...stationsAll.map((st: typeof kioskStations.$inferSelect) => {
          const stSess = sessions.filter((s: SessionRow) => s.stationId === st.id);
          const paid = stSess.filter((s: SessionRow) => s.paymentStatus === "paid");
          const rev = paid.reduce((sum: number, s: SessionRow) => sum + Number(s.totalAmount ?? 0), 0);
          return [`"${st.name.replace(/"/g,'""')}"`, stSess.length, paid.length, rev.toFixed(2),
            stSess.length > 0 ? Math.round((paid.length/stSess.length)*100) : 0].join(",");
        })
      ].join("\n");
      return { sessionsCsv, productsCsv, stationsCsv, days: input.days };
    }),

  /** Offene Altersverifikations-Anfragen für Kellner */
  getAgeVerificationRequests: protectedProcedure
    .input(z.object({ status: z.enum(["pending","approved","rejected","all"]).default("pending") }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const baseFilter = eq(kioskAgeVerifications.restaurantId, ctx.user.restaurantId);
      const statusFilter = input.status === "all" ? baseFilter
        : and(baseFilter, eq(kioskAgeVerifications.status, input.status));
      const rows = await db.select().from(kioskAgeVerifications)
        .where(statusFilter)
        .orderBy(sql`requested_at DESC`)
        .limit(50);
      const stations = await db.select({ id: kioskStations.id, name: kioskStations.name })
        .from(kioskStations).where(eq(kioskStations.restaurantId, ctx.user.restaurantId));
      type StationRow2 = { id: number; name: string };
      const stationMap2 = new Map<number, string>(stations.map((s: StationRow2) => [s.id, s.name]));
      type AgeVerRow = typeof kioskAgeVerifications.$inferSelect;
      return rows.map((r: AgeVerRow) => ({
        ...r,
        stationName: stationMap2.get(r.stationId) ?? `Kasse ${r.stationId}`,
        waitingSec: r.status === "pending" ? Math.round((Date.now() - r.createdAt.getTime()) / 1000) : null,
      }));
    }),

  /** VAPID Public Key für Kiosk-Push */
  getKioskVapidKey: protectedProcedure.query(() => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  })),

  /** Kellner-Gerät für Kiosk-Push registrieren */
  subscribeKioskPush: protectedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      // Upsert: gleicher Endpoint wird nicht doppelt gespeichert
      const [existing] = await db.select({ id: kioskPushSubscriptions.id })
        .from(kioskPushSubscriptions)
        .where(and(
          eq(kioskPushSubscriptions.userId, ctx.user.id),
          sql`endpoint = ${input.endpoint}`,
        ));
      if (!existing) {
        await db.insert(kioskPushSubscriptions).values({
          restaurantId: ctx.user.restaurantId,
          userId: ctx.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        });
      }
      return { success: true };
    }),

  /** Kellner-Gerät Push-Subscription entfernen */
  unsubscribeKioskPush: protectedProcedure
    .input(z.object({ endpoint: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.delete(kioskPushSubscriptions)
        .where(and(
          eq(kioskPushSubscriptions.userId, ctx.user.id),
          sql`endpoint = ${input.endpoint}`,
        ));
      return { success: true };
    }),

  // ── Lock-Status aller Stationen (für KioskMonitor) ─────────────────────────
  getLockStatus: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const stations = await db.select({
        id: kioskStations.id,
        name: kioskStations.name,
        lockToken: kioskStations.lockToken,
        lockedAt: kioskStations.lockedAt,
        lockExpiresAt: kioskStations.lockExpiresAt,
      }).from(kioskStations)
        .where(and(
          eq(kioskStations.restaurantId, input.restaurantId),
          eq(kioskStations.isActive, true),
        ));
      const now = Date.now();
      return stations.map((s: { id: number; name: string; lockToken: string | null; lockedAt: number | null; lockExpiresAt: number | null }) => ({
        id: s.id,
        name: s.name,
        isLocked: !!(s.lockToken && s.lockExpiresAt && s.lockExpiresAt > now),
        lockedSince: s.lockedAt ?? null,
        lockedUntil: s.lockExpiresAt ?? null,
      }));
    }),

  // ── Lock manuell aufheben (Admin) ─────────────────────────────────────────
  forceReleaseLock: protectedProcedure
    .input(z.object({ stationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskStations)
        .set({ lockToken: null, lockedAt: null, lockExpiresAt: null })
        .where(and(
          eq(kioskStations.id, input.stationId),
          eq(kioskStations.restaurantId, ctx.user.restaurantId),
        ));
      return { success: true };
    }),

  // ── Wartezeit-Statistiken ─────────────────────────────────────────────────
  getWaitStats: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      days: z.number().default(7),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const since = new Date(Date.now() - input.days * 86400000);
      const sessions = await db.select({
        waitStartedAt: kioskSessions.waitStartedAt,
        waitEndedAt: kioskSessions.waitEndedAt,
        startedAt: kioskSessions.startedAt,
        stationId: kioskSessions.stationId,
      }).from(kioskSessions)
        .where(and(
          eq(kioskSessions.restaurantId, input.restaurantId),
          sql`startedAt >= ${since}`,
          sql`waitStartedAt IS NOT NULL`,
          sql`waitEndedAt IS NOT NULL`,
        ));

      if (sessions.length === 0) {
        return { totalWaits: 0, avgWaitSec: 0, maxWaitSec: 0, byHour: [], byStation: [] };
      }

      type WaitRow = { waitStartedAt: number | null; waitEndedAt: number | null; startedAt: Date; stationId: number };
      const waits = (sessions as WaitRow[])
        .filter((s) => s.waitStartedAt && s.waitEndedAt)
        .map((s) => ({
          waitSec: ((s.waitEndedAt! - s.waitStartedAt!) / 1000),
          hour: new Date(s.startedAt).getHours(),
          stationId: s.stationId,
        }));

      if (waits.length === 0) return { totalWaits: 0, avgWaitSec: 0, maxWaitSec: 0, byHour: [], byStation: [] };

      const avgWaitSec = waits.reduce((sum, w) => sum + w.waitSec, 0) / waits.length;
      const maxWaitSec = Math.max(...waits.map((w) => w.waitSec));

      const byHourMap: Record<number, { count: number; totalSec: number }> = {};
      for (const w of waits) {
        if (!byHourMap[w.hour]) byHourMap[w.hour] = { count: 0, totalSec: 0 };
        byHourMap[w.hour].count++;
        byHourMap[w.hour].totalSec += w.waitSec;
      }
      const byHour = Object.entries(byHourMap)
        .map(([hour, v]) => ({ hour: parseInt(hour), count: v.count, avgSec: Math.round(v.totalSec / v.count) }))
        .sort((a, b) => a.hour - b.hour);

      const byStationMap: Record<number, { count: number; totalSec: number }> = {};
      for (const w of waits) {
        if (!byStationMap[w.stationId]) byStationMap[w.stationId] = { count: 0, totalSec: 0 };
        byStationMap[w.stationId].count++;
        byStationMap[w.stationId].totalSec += w.waitSec;
      }
      const byStation = Object.entries(byStationMap)
        .map(([stationId, v]) => ({ stationId: parseInt(stationId), count: v.count, avgSec: Math.round(v.totalSec / v.count) }));

      return { totalWaits: waits.length, avgWaitSec: Math.round(avgWaitSec), maxWaitSec: Math.round(maxWaitSec), byHour, byStation };
    }),

  // ── Marketing-Config ─────────────────────────────────────────────────────

  /** Marketing-Konfiguration laden: per Token (Gast) oder per Auth (Admin) */
  getMarketingConfig: publicProcedure
    .input(z.object({ token: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      let restaurantId: number | null = null;
      if (input.token) {
        const [station] = await db
          .select({ restaurantId: kioskStations.restaurantId })
          .from(kioskStations)
          .where(eq(kioskStations.qrToken, input.token));
        restaurantId = station?.restaurantId ?? null;
      } else if (ctx.user?.restaurantId) {
        restaurantId = ctx.user.restaurantId;
      }
      if (!restaurantId) return null;
      const [cfg] = await db
        .select()
        .from(kioskMarketingConfig)
        .where(eq(kioskMarketingConfig.restaurantId, restaurantId));
      return cfg ?? null;
    }),

  /** Marketing-Konfiguration speichern (Admin) */
  saveMarketingConfig: protectedProcedure
    .input(z.object({
      loyaltyEnabled: z.boolean(),
      loyaltyTitle: z.string().max(100),
      loyaltyText: z.string().max(300),
      loyaltyUrl: z.string().max(500).optional(),
      instagramUrl: z.string().max(500).optional(),
      facebookUrl: z.string().max(500).optional(),
      tiktokUrl: z.string().max(500).optional(),
      customCtaEnabled: z.boolean(),
      customCtaTitle: z.string().max(100).optional(),
      customCtaText: z.string().max(300).optional(),
      customCtaButtonLabel: z.string().max(60).optional(),
      customCtaUrl: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const [existing] = await db
        .select({ id: kioskMarketingConfig.id })
        .from(kioskMarketingConfig)
        .where(eq(kioskMarketingConfig.restaurantId, ctx.user.restaurantId));
      if (existing) {
        await db.update(kioskMarketingConfig)
          .set({ ...input })
          .where(eq(kioskMarketingConfig.restaurantId, ctx.user.restaurantId));
      } else {
        await db.insert(kioskMarketingConfig).values({
          restaurantId: ctx.user.restaurantId,
          ...input,
        });
      }
      return { success: true };
    }),
});

async function _triggerSpotCheck(
  db: Awaited<ReturnType<typeof getDb>>,
  sessionId: string,
  stationId: number,
  restaurantId: number,
  reason: string,
) {
  // Nur auslösen wenn noch keine offene Stichprobe für diese Session
  const existing = await db.select().from(kioskSpotChecks)
    .where(and(
      eq(kioskSpotChecks.sessionId, sessionId),
      eq(kioskSpotChecks.status, "pending"),
    ));
  if (existing.length > 0) return;

  await db.insert(kioskSpotChecks).values({
    sessionId,
    stationId,
    restaurantId,
    triggerReason: reason,
    status: "pending",
  });

  await db.update(kioskSessions)
    .set({ status: "spot_check" })
    .where(eq(kioskSessions.sessionId, sessionId));

  await db.insert(kioskEvents).values({
    sessionId,
    stationId,
    restaurantId,
    eventType: "spot_check_triggered",
    payload: { reason },
  });

  // Kellner benachrichtigen
  const [station] = await db.select().from(kioskStations).where(eq(kioskStations.id, stationId));
  await notifyOwner({
    title: `🔍 Stichprobe – ${station?.name ?? `Kasse ${stationId}`}`,
    content: `Bitte Stichprobe durchführen.\nGrund: ${reason}`,
  }).catch(() => {});
}

// ─── TRAINING DATA ROUTER (separate export) ──────────────────────────────────
export const trainingRouter = router({
  /** Trainingsdaten-Bilder auflisten (paginiert, nach Status filtern) */
  listImages: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      limit: z.number().min(1).max(100).default(30),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const baseFilter = eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId);
      const filter = input.status === "all" ? baseFilter
        : and(baseFilter, eq(kioskTrainingImages.status, input.status));
      const rows = await db.select().from(kioskTrainingImages)
        .where(filter)
        .orderBy(desc(kioskTrainingImages.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      // Gesamtanzahl für Pagination
      const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(kioskTrainingImages).where(filter);
      return { images: rows, total: Number(count) };
    }),

  /** Statistiken: Anzahl pro Status */
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const rows = await db.select({
        status: kioskTrainingImages.status,
        count: sql<number>`COUNT(*)`,
      }).from(kioskTrainingImages)
        .where(eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId))
        .groupBy(kioskTrainingImages.status);
      const stats: Record<string, number> = { pending: 0, approved: 0, rejected: 0, total: 0 };
      for (const r of rows) {
        const n = Number(r.count);
        if (r.status) stats[r.status] = n;
        stats.total += n;
      }
      return stats;
    }),

  /** Bild als "approved" markieren */
  approveImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskTrainingImages)
        .set({ status: "approved", reviewedBy: ctx.user.id, reviewedAt: new Date() })
        .where(and(
          eq(kioskTrainingImages.id, input.id),
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
        ));
      return { success: true };
    }),

  /** Bild als "rejected" markieren */
  rejectImage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskTrainingImages)
        .set({ status: "rejected", reviewedBy: ctx.user.id, reviewedAt: new Date() })
        .where(and(
          eq(kioskTrainingImages.id, input.id),
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
        ));
      return { success: true };
    }),

  /** Alle pending Bilder eines Restaurants auf approved setzen (Massen-Approve) */
  bulkApprove: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskTrainingImages)
        .set({ status: "approved", reviewedBy: ctx.user.id, reviewedAt: new Date() })
        .where(and(
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
          eq(kioskTrainingImages.status, "pending"),
        ));
      // Anzahl der genehmigten Bilder zählen
      const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(kioskTrainingImages)
        .where(and(
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
          eq(kioskTrainingImages.status, "approved"),
        ));
      return { success: true, approvedCount: Number(count) };
    }),

  /** Qualitätsindikator: Confidence-Verteilung und Auto-Reject-Rate */
  getQualityStats: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      // Confidence-Verteilung aller Bilder
      const confRows = await db.select({
        avgConfidence: kioskTrainingImages.avgConfidence,
        count: sql<number>`COUNT(*)`,
      }).from(kioskTrainingImages)
        .where(eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId))
        .groupBy(kioskTrainingImages.avgConfidence);
      const conf: Record<string, number> = { high: 0, medium: 0, low: 0, unknown: 0 };
      for (const r of confRows) {
        const k = r.avgConfidence ?? "unknown";
        conf[k] = Number(r.count);
      }
      const totalConf = conf.high + conf.medium + conf.low + conf.unknown;
      const highPct = totalConf > 0 ? Math.round((conf.high / totalConf) * 100) : 0;

      // Auto-Reject-Rate (Personen erkannt)
      const [{ autoRejected }] = await db.select({ autoRejected: sql<number>`COUNT(*)` })
        .from(kioskTrainingImages)
        .where(and(
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
          eq(kioskTrainingImages.rejectionReason, "auto_person_detected"),
        ));
      const [{ total }] = await db.select({ total: sql<number>`COUNT(*)` })
        .from(kioskTrainingImages)
        .where(eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId));

      return {
        confidenceBreakdown: conf,
        highConfidencePct: highPct,
        autoRejectedCount: Number(autoRejected),
        totalCount: Number(total),
        autoRejectPct: Number(total) > 0 ? Math.round((Number(autoRejected) / Number(total)) * 100) : 0,
      };
    }),

  /** Alle approved Bilder als JSON-Manifest exportieren (für externes Fine-Tuning) */
  exportApproved: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const rows = await db.select({
        id: kioskTrainingImages.id,
        s3Url: kioskTrainingImages.s3Url,
        label: kioskTrainingImages.label,
        createdAt: kioskTrainingImages.createdAt,
      }).from(kioskTrainingImages)
        .where(and(
          eq(kioskTrainingImages.restaurantId, ctx.user.restaurantId),
          eq(kioskTrainingImages.status, "approved"),
        ))
        .orderBy(asc(kioskTrainingImages.createdAt));
      return {
        restaurantId: ctx.user.restaurantId,
        exportedAt: new Date().toISOString(),
        count: rows.length,
        images: rows.map((r: typeof rows[number]) => ({
          id: r.id,
          url: r.s3Url,
          label: r.label ? JSON.parse(r.label) : [],
          createdAt: r.createdAt.toISOString(),
        })),
      };
    }),
  /**
   * Listet fehlgeschlagene Lernbild-Fetches für das Admin-Panel.
   * Zeigt welche Produktbilder in S3 nicht mehr erreichbar sind.
   */
  listImageFetchErrors: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      onlyUnresolved: z.boolean().optional().default(true),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db
        .select()
        .from(kioskImageFetchErrors)
        .where(
          input.onlyUnresolved
            ? and(eq(kioskImageFetchErrors.restaurantId, input.restaurantId), isNull(kioskImageFetchErrors.resolvedAt))
            : eq(kioskImageFetchErrors.restaurantId, input.restaurantId)
        )
        .orderBy(desc(kioskImageFetchErrors.createdAt))
        .limit(200);
      return rows.map((r: typeof rows[number]) => ({
        id: r.id,
        menuItemId: r.menuItemId,
        imageKey: r.imageKey,
        errorType: r.errorType,
        errorMessage: r.errorMessage,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }));
    }),

  /**
   * Markiert einen Fehler-Eintrag als behoben (z.B. nach Neu-Upload des Bildes).
   */
  resolveImageFetchError: protectedProcedure
    .input(z.object({ errorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(kioskImageFetchErrors)
        .set({ resolvedAt: new Date() })
        .where(eq(kioskImageFetchErrors.id, input.errorId));
      return { ok: true };
    }),

  /**
   * RU-1: Lädt ein Lernbild erneut von S3 herunter und speichert es neu.
   * Markiert den zugehörigen Fehler-Eintrag als behoben.
   */
  reuploadProductImage: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      menuItemId: z.number(),
      imageKey: z.string(),
      errorId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Wenn restaurantId=0 (Frontend-Platzhalter), aus ctx.user lesen
      const restaurantId = (input.restaurantId === 0 && ctx.user.restaurantId)
        ? ctx.user.restaurantId
        : input.restaurantId;
      if (ctx.user.restaurantId !== restaurantId && ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      const forgeUrl = process.env.BUILT_IN_FORGE_API_URL ?? "";
      const forgeKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
      if (!forgeUrl || !forgeKey) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Forge-Konfiguration fehlt" });

      // 1. Presigned GET-URL holen
      const presignUrl = new URL("v1/storage/presign/get", forgeUrl.replace(/\/+$/, "") + "/");
      presignUrl.searchParams.set("path", input.imageKey);
      const presignResp = await fetch(presignUrl.toString(), {
        headers: { Authorization: `Bearer ${forgeKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!presignResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Presign fehlgeschlagen (${presignResp.status})` });
      const presignJson = await presignResp.json().catch(() => null) as { url?: string } | null;
      const s3Url = presignJson?.url;
      if (!s3Url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kein Presign-URL erhalten" });

      // 2. Bild von S3 laden
      const imgResp = await fetch(s3Url, { signal: AbortSignal.timeout(15000) });
      if (!imgResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `S3-Fetch fehlgeschlagen (${imgResp.status})` });
      const contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) throw new TRPCError({ code: "BAD_REQUEST", message: `Ungültiger Content-Type: ${contentType}` });
      const buf = Buffer.from(await imgResp.arrayBuffer());

      // 3. Bild neu hochladen (neuer Key mit Zeitstempel)
      const ext = input.imageKey.split(".").pop()?.toLowerCase() ?? "jpg";
            const newKey = `kiosk/${restaurantId}/products/${input.menuItemId}/reupload_${Date.now()}.${ext}`;
      const { key: uploadedKey, url: uploadedUrl } = await storagePut(newKey, buf, contentType);
      // 4. kioskProductImages aktualisieren
      await db.update(kioskProductImages)
        .set({ imageKey: uploadedKey, imageUrl: uploadedUrl })
        .where(and(
          eq(kioskProductImages.restaurantId, restaurantId),
          eq(kioskProductImages.menuItemId, input.menuItemId),
          eq(kioskProductImages.imageKey, input.imageKey),
        ));
      // 5. Fehler-Eintrag als behoben markieren
      if (input.errorId) {
        await db.update(kioskImageFetchErrors)
          .set({ resolvedAt: new Date() })
          .where(eq(kioskImageFetchErrors.id, input.errorId));
      } else {
        // Alle offenen Fehler für dieses Bild schliessen
        await db.update(kioskImageFetchErrors)
          .set({ resolvedAt: new Date() })
          .where(and(
            eq(kioskImageFetchErrors.restaurantId, restaurantId),
            eq(kioskImageFetchErrors.menuItemId, input.menuItemId),
            eq(kioskImageFetchErrors.imageKey, input.imageKey),
            isNull(kioskImageFetchErrors.resolvedAt),
          ));
      }

      return { ok: true, newKey: uploadedKey, newUrl: uploadedUrl };
    }),

  /**
   * RU-2: Prüft ob in der letzten Stunde >3 Lernbild-Fetch-Fehler aufgetreten sind
   * und sendet ggf. eine Owner-Benachrichtigung. Fire-and-forget – kein Rückgabewert.
   * Wird nach scanProducts aufgerufen.
   */
  checkAndNotifyFetchErrors: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentErrors = await db
          .select({ id: kioskImageFetchErrors.id })
          .from(kioskImageFetchErrors)
          .where(and(
            eq(kioskImageFetchErrors.restaurantId, input.restaurantId),
            isNull(kioskImageFetchErrors.resolvedAt),
            gte(kioskImageFetchErrors.createdAt, oneHourAgo),
          ))
          .limit(10);
        if (recentErrors.length > 3) {
          await notifyOwner({
            title: "⚠️ Kiosk: Lernbild-Fehler häufen sich",
            content: `In der letzten Stunde sind ${recentErrors.length} Lernbild-Fetch-Fehler aufgetreten (Restaurant ${input.restaurantId}). Bitte prüfen Sie im Admin-Panel unter Kiosk → Gästefotos die fehlerhaften Bilder und laden Sie diese erneut hoch.`,
          });
        }
      } catch { /* Benachrichtigungsfehler sollen den Scan nicht blockieren */ }
      return { ok: true };
    }),

  /**
   * Prüft ob ein S3-Bild erreichbar ist (Presign + HEAD-Request).
   * Gibt { reachable, statusCode, contentType } zurück.
   */
  checkImageReachability: protectedProcedure
    .input(z.object({ imageKey: z.string() }))
    .mutation(async () => {
      const forgeUrl = process.env.BUILT_IN_FORGE_API_URL ?? "";
      const forgeKey = process.env.BUILT_IN_FORGE_API_KEY ?? "";
      if (!forgeUrl || !forgeKey) return { reachable: false, error: "Forge-Konfiguration fehlt" };
      try {
        const presignUrl = new URL("v1/storage/presign/get", forgeUrl.replace(/\/+$/, "") + "/");
        presignUrl.searchParams.set("path", ""); // key wird serverseitig nicht exponiert
        const presignResp = await fetch(presignUrl.toString(), {
          headers: { Authorization: `Bearer ${forgeKey}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!presignResp.ok) return { reachable: false, statusCode: presignResp.status, error: "Presign fehlgeschlagen" };
        const presignJson = await presignResp.json().catch(() => null) as { url?: string } | null;
        const s3Url = presignJson?.url;
        if (!s3Url) return { reachable: false, error: "Kein URL im Presign-Response" };
        const headResp = await fetch(s3Url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        const contentType = headResp.headers.get("content-type") ?? "";
        return {
          reachable: headResp.ok && contentType.startsWith("image/"),
          statusCode: headResp.status,
          contentType,
          isValidImage: contentType.startsWith("image/"),
        };
      } catch (err: unknown) {
        return { reachable: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
      }
    }),

  /**
   * KIF-4: Lernbild-Status pro Produkt abrufen.
   * Gibt für jedes Produkt zurück ob Lernbilder vorhanden sind und ob es offene Fetch-Fehler gibt.
   * Wird im Admin-Einlernen-Tab als grün/rot Status-Badge angezeigt.
   */
  getImageFetchStatusByItem: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user.restaurantId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      // Alle Lernbilder für dieses Restaurant
      const productImages = await db
        .select({ menuItemId: kioskProductImages.menuItemId, imageKey: kioskProductImages.imageKey })
        .from(kioskProductImages)
        .where(eq(kioskProductImages.restaurantId, input.restaurantId));
      // Alle offenen Fetch-Fehler für dieses Restaurant
      const fetchErrors = await db
        .select({ menuItemId: kioskImageFetchErrors.menuItemId, imageKey: kioskImageFetchErrors.imageKey })
        .from(kioskImageFetchErrors)
        .where(and(
          eq(kioskImageFetchErrors.restaurantId, input.restaurantId),
          isNull(kioskImageFetchErrors.resolvedAt),
        ));
      // Gruppieren: menuItemId → { imageCount, errorCount }
      const statusMap = new Map<number, { imageCount: number; errorCount: number }>();
      for (const img of productImages) {
        const entry = statusMap.get(img.menuItemId) ?? { imageCount: 0, errorCount: 0 };
        entry.imageCount++;
        statusMap.set(img.menuItemId, entry);
      }
      for (const err of fetchErrors) {
        if (!err.menuItemId) continue;
        const entry = statusMap.get(err.menuItemId) ?? { imageCount: 0, errorCount: 0 };
        entry.errorCount++;
        statusMap.set(err.menuItemId, entry);
      }
      // Als Array zurückgeben
      return Array.from(statusMap.entries()).map(([menuItemId, status]) => ({
        menuItemId,
        imageCount: status.imageCount,
        errorCount: status.errorCount,
        // ok = hat Bilder und keine offenen Fehler
        ok: status.imageCount > 0 && status.errorCount === 0,
        // hasErrors = hat offene Fetch-Fehler
        hasErrors: status.errorCount > 0,
      }));
    }),
});
// ─── UPSELLING ROUTER ────────────────────────────────────────────────
export const upsellingRouter = router({
  /**
   * KI-Upselling-Vorschläge nach Scan:
   * Kombiniert Admin-Regeln + ablaufende Lagerartikel + KI-Analyse
   * Wird nach jedem Scan aufgerufen (public, sessionToken-basiert)
   */
  getSuggestions: publicProcedure
    .input(z.object({
      sessionId: z.string(),   // kioskSessions.sessionId
      scannedProductIds: z.array(z.number()).optional().default([]),
      scannedLabels: z.array(z.string()).optional().default([]), // KI-erkannte Produktnamen
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      // Session validieren
      const [session] = await db
        .select({ restaurantId: kioskSessions.restaurantId })
        .from(kioskSessions)
        .where(eq(kioskSessions.sessionId, input.sessionId))
        .limit(1);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültiger Session-Token" });
      const restaurantId = session.restaurantId;
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // 1. Ablaufende Lagerartikel mit Rabatt (Foodwaste-Prävention)
      const expiringItems = await db
        .select({
          id: inventoryItems.id,
          name: inventoryItems.name,
          expiresAt: inventoryItems.expiresAt,
          expiryDiscountPct: inventoryItems.expiryDiscountPct,
          currentStock: inventoryItems.currentStock,
        })
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.restaurantId, restaurantId),
          eq(inventoryItems.isActive, true),
          isNotNull(inventoryItems.expiresAt),
          lte(inventoryItems.expiresAt, in7Days),
          gt(inventoryItems.currentStock, "0"),
        ))
        .orderBy(asc(inventoryItems.expiresAt))
        .limit(5);

      // 2. Admin-definierte Upselling-Regeln
      const rules = await db
        .select()
        .from(kioskUpsellingRules)
        .where(and(
          eq(kioskUpsellingRules.restaurantId, restaurantId),
          eq(kioskUpsellingRules.isActive, true),
          or(
            isNull(kioskUpsellingRules.activeFrom),
            lte(kioskUpsellingRules.activeFrom, now),
          ),
          or(
            isNull(kioskUpsellingRules.activeTo),
            gte(kioskUpsellingRules.activeTo, now),
          ),
        ))
        .orderBy(desc(kioskUpsellingRules.priority))
        .limit(10);

      // 3. Passende Regeln filtern (triggerProduct in gescannten Produkten)
            type UpsellingRule = typeof rules[number];
      const matchedRules = rules.filter((r: UpsellingRule) => {
        if (r.triggerType === "any") return true;
        if (r.triggerType === "expiry") return expiringItems.length > 0;
        if (r.triggerType === "product" && r.triggerProductId) {
          return input.scannedProductIds.includes(r.triggerProductId);
        }
        if (r.triggerType === "category" && r.triggerCategory) {
          return input.scannedLabels.some((l: string) => l.toLowerCase().includes(r.triggerCategory!.toLowerCase()));
        }
        return false;
      }).slice(0, 4);
      // 4. Empfohlene Menü-Items laden (für Essen-Empfehlungen)
      const menuItemIds = matchedRules.filter((r: UpsellingRule) => r.suggestedMenuItemId).map((r: UpsellingRule) => r.suggestedMenuItemId!);
      const suggestedMenuItems = menuItemIds.length > 0
        ? await db.select({ id: menuItems.id, name: menuItems.name, price: menuItems.price, imageUrl: menuItems.imageUrl })
            .from(menuItems)
            .where(inArray(menuItems.id, menuItemIds))
        : [];

      // 5. KI-Empfehlung wenn keine Regeln matchen und Labels vorhanden
      let aiSuggestion: { label: string; reason: string } | null = null;
      if (matchedRules.length === 0 && input.scannedLabels.length > 0) {
        try {
          const resp = await invokeLLM({
            messages: [{
              role: "user",
              content: `Du bist ein Upselling-Assistent für ein Sportrestaurant-Kiosk.
Der Gast hat folgende Produkte gescannt: ${input.scannedLabels.join(", ")}.
Schlage EIN passendes Essen oder Getränk vor (max. 6 Wörter) und gib eine kurze Begründung (max. 10 Wörter).
Antworte NUR mit JSON: {"label": "...", "reason": "..."}`,
            }],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "upsell_suggestion",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["label", "reason"],
                  additionalProperties: false,
                },
              },
            },
          });
          const raw = resp.choices[0]?.message?.content;
          aiSuggestion = typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          // KI-Fehler: kein Upselling-Vorschlag, kein Blockieren
        }
      }

      return {
        expiringDeals: expiringItems.map((item: typeof expiringItems[number]) => ({
          inventoryItemId: item.id,
          name: item.name,
          expiresAt: item.expiresAt,
          discountPct: item.expiryDiscountPct ? parseFloat(String(item.expiryDiscountPct)) : 10,
          daysLeft: item.expiresAt ? Math.ceil((item.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
          type: "expiry_deal" as const,
        })),
        ruleBasedSuggestions: matchedRules.map((r: UpsellingRule) => {
          const menuItem = suggestedMenuItems.find((m: typeof suggestedMenuItems[number]) => m.id === r.suggestedMenuItemId);
          return {
            ruleId: r.id,
            label: r.suggestedLabel ?? menuItem?.name ?? "Empfehlung",
            comboPrice: r.comboPrice ? parseFloat(String(r.comboPrice)) : null,
            discountPct: r.discountPct ? parseFloat(String(r.discountPct)) : null,
            suggestedMenuItemId: r.suggestedMenuItemId,
            menuItemPrice: menuItem?.price ? parseFloat(String(menuItem.price)) : null,
            menuItemImage: menuItem?.imageUrl ?? null,
            type: "rule" as const,
          };
        }),
        aiSuggestion,
      };
    }),

  /** Admin: Upselling-Regeln auflisten */
  listRules: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db.select().from(kioskUpsellingRules)
        .where(eq(kioskUpsellingRules.restaurantId, input.restaurantId))
        .orderBy(desc(kioskUpsellingRules.priority));
    }),

  /** Admin: Upselling-Regel erstellen */
  createRule: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      triggerType: z.enum(["product", "category", "any", "expiry"]),
      triggerProductId: z.number().optional(),
      triggerCategory: z.string().optional(),
      suggestedProductId: z.number().optional(),
      suggestedMenuItemId: z.number().optional(),
      suggestedLabel: z.string().optional(),
      comboPrice: z.number().optional(),
      discountPct: z.number().min(0).max(100).optional(),
      priority: z.number().default(0),
      activeFrom: z.date().optional(),
      activeTo: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.insert(kioskUpsellingRules).values({
        restaurantId: input.restaurantId,
        triggerType: input.triggerType,
        triggerProductId: input.triggerProductId ?? null,
        triggerCategory: input.triggerCategory ?? null,
        suggestedProductId: input.suggestedProductId ?? null,
        suggestedMenuItemId: input.suggestedMenuItemId ?? null,
        suggestedLabel: input.suggestedLabel ?? null,
        comboPrice: input.comboPrice ? String(input.comboPrice) : null,
        discountPct: input.discountPct ? String(input.discountPct) : null,
        priority: input.priority,
        activeFrom: input.activeFrom ?? null,
        activeTo: input.activeTo ?? null,
        isActive: true,
      });
      return { success: true };
    }),

  /** Admin: Upselling-Regel löschen */
  deleteRule: protectedProcedure
    .input(z.object({ ruleId: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.delete(kioskUpsellingRules)
        .where(and(eq(kioskUpsellingRules.id, input.ruleId), eq(kioskUpsellingRules.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  /** Admin: Ablaufende Lagerartikel mit Rabatt-Konfiguration */
  getExpiringInventory: protectedProcedure
    .input(z.object({ restaurantId: z.number(), daysAhead: z.number().default(7) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const cutoff = new Date(Date.now() + input.daysAhead * 24 * 60 * 60 * 1000);
      return db.select().from(inventoryItems)
        .where(and(
          eq(inventoryItems.restaurantId, input.restaurantId),
          eq(inventoryItems.isActive, true),
          isNotNull(inventoryItems.expiresAt),
          lte(inventoryItems.expiresAt, cutoff),
        ))
        .orderBy(asc(inventoryItems.expiresAt));
    }),

  /** Admin: Ablaufdatum und Rabatt für Lagerartikel setzen */
  setItemExpiry: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      restaurantId: z.number(),
      expiresAt: z.date(),
      expiryDiscountPct: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(inventoryItems)
        .set({ expiresAt: input.expiresAt, expiryDiscountPct: input.expiryDiscountPct ? String(input.expiryDiscountPct) : null })
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.restaurantId, input.restaurantId)));
      return { success: true };
    }),
});

// ─── PICKUP ROUTER ───────────────────────────────────────────────────────────
export const pickupRouter = router({
  /** Gast: Abholnummer-Status abfragen (Polling) */
  getStatus: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [sess] = await db
        .select({ restaurantId: kioskSessions.restaurantId })
        .from(kioskSessions)
        .where(eq(kioskSessions.sessionId, input.sessionId))
        .limit(1);
      if (!sess) throw new TRPCError({ code: "UNAUTHORIZED" });
      // Neueste Abholnummer dieser Session
      const [pickup] = await db
        .select()
        .from(kioskPickupNumbers)
        .where(eq(kioskPickupNumbers.sessionId, input.sessionId))
        .orderBy(desc(kioskPickupNumbers.createdAt))
        .limit(1);
      return pickup ?? null;
    }),

  /** Küche: Bestellung als fertig markieren */
  markReady: protectedProcedure
    .input(z.object({ pickupId: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "superadmin", "koch", "manager"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskPickupNumbers)
        .set({ status: "ready", readyAt: new Date() })
        .where(and(eq(kioskPickupNumbers.id, input.pickupId), eq(kioskPickupNumbers.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  /** Küche: Bestellung als abgeholt markieren */
  markCollected: protectedProcedure
    .input(z.object({ pickupId: z.number(), restaurantId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "superadmin", "koch", "manager", "kellner"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      await db.update(kioskPickupNumbers)
        .set({ status: "collected", collectedAt: new Date() })
        .where(and(eq(kioskPickupNumbers.id, input.pickupId), eq(kioskPickupNumbers.restaurantId, input.restaurantId)));
      return { success: true };
    }),

  /** Küche/Admin: Alle aktiven Abholnummern auflisten */
  listActive: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!["admin", "superadmin", "koch", "manager", "kellner"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      return db.select().from(kioskPickupNumbers)
        .where(and(
          eq(kioskPickupNumbers.restaurantId, input.restaurantId),
          ne(kioskPickupNumbers.status, "collected"),
        ))
        .orderBy(asc(kioskPickupNumbers.createdAt));
    }),

  /** Gast: Speisekarte für Kiosk-Flow laden (vereinfacht, nur Essen) */
  getKioskMenu: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [station] = await db
        .select({ restaurantId: kioskSessions.restaurantId })
        .from(kioskSessions)
        .where(eq(kioskSessions.sessionId, input.sessionId))
        .limit(1);
      if (!station) throw new TRPCError({ code: "UNAUTHORIZED" });
      // Kategorien laden
      const cats = await db.select({ id: menuCategories.id, name: menuCategories.name })
        .from(menuCategories)
        .where(eq(menuCategories.restaurantId, station.restaurantId))
        .orderBy(asc(menuCategories.sortOrder));
      // Menü-Items laden (nur aktive, keine Getränke die im Kiosk sind)
      const items = await db.select({
        id: menuItems.id,
        name: menuItems.name,
        description: menuItems.description,
        price: menuItems.price,
        categoryId: menuItems.categoryId,
        imageUrl: menuItems.imageUrl,
      })
        .from(menuItems)
        .where(and(
          eq(menuItems.restaurantId, station.restaurantId),
          eq(menuItems.isAvailable, true),
        ))
        .orderBy(asc(menuItems.sortOrder));
      return { categories: cats, items };
    }),
});
