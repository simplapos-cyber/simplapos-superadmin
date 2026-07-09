/**
 * marketing.ts – Automatisiertes Marketing-Modul
 *
 * Funktionen:
 * - KI-Bildanalyse: Gericht erkennen, plattformspezifische Texte generieren
 * - Post-Verwaltung: Erstellen, Genehmigen, Planen, Ablehnen
 * - Plattform-Verbindungen: Instagram, Facebook, Google, TikTok
 * - Einstellungen: Kellner-Kamera, Auto-Approve, Bewertungs-Booster
 * - Kellner-Foto-Flow: KI entscheidet ob Foto sinnvoll
 * - Bewertungs-Booster: Nach Bezahlung SMS/WhatsApp senden
 * - Stammkunden-Kampagnen: Reaktivierung, Geburtstag, Slow-Day
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getRestaurantById } from "../db";
import {
  marketingPosts,
  marketingPlatforms,
  marketingSettings,
  marketingPhotoRequests,
  reviewBoostLog,
  customerCampaigns,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte, lt, isNull, sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { storagePut, storageGetSignedUrl } from "../storage";
import { notifyOwner } from "../_core/notification";
import { publishPost } from "../marketingPublisher";
import { extractVideoFrames } from "../videoFrameExtractor";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

async function getOrCreateSettings(restaurantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB nicht verfügbar");
  const existing = await db
    .select()
    .from(marketingSettings)
    .where(eq(marketingSettings.restaurantId, restaurantId))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const db2 = await getDb();
  if (!db2) throw new Error("DB nicht verfügbar");
  await db2.insert(marketingSettings).values({ restaurantId });
  const db3 = await getDb();
  if (!db3) throw new Error("DB nicht verfügbar");
  const created = await db3
    .select()
    .from(marketingSettings)
    .where(eq(marketingSettings.restaurantId, restaurantId))
    .limit(1);
  return created[0];
}

async function getWeatherContext(lat?: number, lon?: number): Promise<string> {
  try {
    const latitude = lat ?? 47.3769; // Zürich als Default
    const longitude = lon ?? 8.5417;
    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&timezone=Europe%2FZurich`
    );
    if (!resp.ok) return "unbekannt";
    const data = await resp.json() as {
      current?: { temperature_2m?: number; weathercode?: number };
    };
    const temp = data.current?.temperature_2m ?? 20;
    const code = data.current?.weathercode ?? 0;
    const weatherDesc =
      code === 0 ? "sonnig" :
      code <= 3 ? "bewölkt" :
      code <= 67 ? "regnerisch" :
      code <= 77 ? "schneeig" :
      "stürmisch";
    return `${weatherDesc}, ${Math.round(temp)}°C`;
  } catch {
    return "unbekannt";
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const marketingRouter = router({

  // ── Einstellungen ──────────────────────────────────────────────────────────

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugewiesen" });
    return getOrCreateSettings(restaurantId);
  }),

  saveSettings: protectedProcedure
    .input(z.object({
      waiterCameraEnabled: z.boolean().optional(),
      waiterCameraForced: z.boolean().optional(),
      autoApprove: z.boolean().optional(),
      weeklyPostTarget: z.number().min(1).max(30).optional(),
      reviewBoosterEnabled: z.boolean().optional(),
      reviewBoosterDelayMinutes: z.number().min(0).max(60).optional(),
      reviewBoosterMinRating: z.number().min(1).max(5).optional(),
      googleReviewUrl: z.string().url().optional().or(z.literal("")),
      twilioAccountSid: z.string().optional(),
      twilioAuthToken: z.string().optional(),
      twilioFromNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db
        .select()
        .from(marketingSettings)
        .where(eq(marketingSettings.restaurantId, restaurantId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(marketingSettings).values({ restaurantId, ...input });
      } else {
        await db.update(marketingSettings).set(input).where(eq(marketingSettings.restaurantId, restaurantId));
      }
      return { success: true };
    }),

  // ── KI-Bildanalyse & Post-Generierung ─────────────────────────────────────

  analyzeAndGeneratePost: protectedProcedure
    .input(z.object({
      imageBase64: z.string().optional(), // Base64-kodiertes Bild
      videoBase64: z.string().optional(), // Legacy: Base64-kodiertes Video (nur für kleine Videos)
      videoKey: z.string().optional(),    // Storage-Key des bereits hochgeladenen Videos (bevorzugt)
      videoUrl: z.string().optional(),    // Storage-URL des bereits hochgeladenen Videos
      videoThumbnailBase64: z.string().optional(), // Legacy: einzelnes Thumbnail
      videoThumbnailsBase64: z.array(z.string()).optional(), // Bereits extrahierte Screenshots (vom Upload-Endpunkt)
      videoSignedUrl: z.string().optional(), // Signierte S3-URL des Videos (Fallback wenn keine Frames)
      mimeType: z.string().default("image/jpeg"),
      mediaType: z.enum(["image", "video"]).default("image"),
      productName: z.string().optional(),
      productId: z.number().optional(),
      sourceType: z.enum(["manual", "waiter_flow", "auto"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      let imageUrl: string | undefined;
      let imageKey: string | undefined;
      let videoUrl: string | undefined = input.videoUrl;
      let videoKey: string | undefined = input.videoKey;

      if (input.mediaType === "video") {
        if (!videoKey && input.videoBase64) {
          // Fallback: Legacy-Pfad für kleine Videos via Base64
          const videoBuffer = Buffer.from(input.videoBase64, "base64");
          const ext = input.mimeType.split("/")[1] || "mp4";
          const fileName = `marketing/${restaurantId}/${Date.now()}.${ext}`;
          const result = await storagePut(fileName, videoBuffer, input.mimeType);
          videoKey = result.key;
          videoUrl = result.url;
        }
        // Wenn videoKey vorhanden (vom Upload-Endpunkt), videoUrl setzen
        if (videoKey && !videoUrl) {
          videoUrl = `/manus-storage/${videoKey}`;
        }
      } else {
        // Bild in Storage hochladen
        const imageBuffer = Buffer.from(input.imageBase64 ?? "", "base64");
        const fileName = `marketing/${restaurantId}/${Date.now()}.jpg`;
        const result = await storagePut(fileName, imageBuffer, input.mimeType);
        imageKey = result.key;
        imageUrl = result.url;
      }

      // Wetter-Kontext abrufen
      const weather = await getWeatherContext();

      // Restaurantname laden
      const restaurant = await getRestaurantById(restaurantId);
      const restaurantName = restaurant?.name ?? "das Restaurant";

      // Für Videos: Text-basierte KI-Analyse (keine Bild-/Frame-Übertragung)
      const videoThumbnails: string[] = []; // Immer leer
      console.log(`[Marketing] Video-Analyse via Text-Beschreibung: ${input.productName || "(keine Beschreibung)"} | Restaurant: ${restaurantName}`);

      // KI-Analyse
      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein professioneller Social-Media-Manager für das Restaurant "${restaurantName}". 
Analysiere das Bild/Video und erstelle optimierte Texte für verschiedene Plattformen.
WICHTIG: Erwähne den Restaurantnamen "${restaurantName}" IMMER – entweder in der Beschreibung oder als Hashtag (#${restaurantName.replace(/\s+/g, "")}).
Beschreibe NUR was du tatsächlich siehst – erfinde nichts dazu.
Antworte IMMER als JSON mit diesen Feldern:
{
  "dishName": "Name des Gerichts oder Thema des Videos",
  "analysis": "Kurze appetitliche Beschreibung basierend auf dem tatsächlichen Inhalt (2-3 Sätze)",
  "captionInstagram": "Instagram-Text (max. 150 Zeichen, emotional, mit 5-8 passenden Hashtags, Restaurantname erwähnen)",
  "captionFacebook": "Facebook-Text (2-3 Sätze, einladend, mit Call-to-Action, Restaurantname erwähnen)",
  "captionGoogle": "Google Business Post (sachlich, informativ, max. 100 Wörter, Restaurantname erwähnen)",
  "captionTiktok": "TikTok-Text (trendy, jung, mit Emojis, max. 100 Zeichen, Restaurantname als Hashtag)",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "bestPostingTime": "Empfohlene Uhrzeit zum Posten (z.B. 11:30 für Mittagsmenü)",
  "weatherRelevance": "Passt der Inhalt zum aktuellen Wetter? (ja/nein + Begründung)"
}`,
          },
          {
            role: "user",
            content: input.mediaType === "video"
              ? `Erstelle kreative und ansprechende Social-Media-Texte für ein Video vom Restaurant "${restaurantName}"${input.productName ? ` über: ${input.productName}` : ""}. Aktuelles Wetter: ${weather}. Erwähne das Restaurant "${restaurantName}" in jedem Text. Erstelle professionelle, appetitliche Texte die Gäste ins Restaurant locken.`
              : [
                  {
                    type: "image_url" as const,
                    image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
                  },
                  {
                    type: "text" as const,
                    text: `Analysiere dieses Gericht${input.productName ? ` (${input.productName})` : ""} vom Restaurant "${restaurantName}" und erstelle Social-Media-Texte auf Deutsch. Aktuelles Wetter: ${weather}. Erwähne das Restaurant "${restaurantName}" in jedem Text. Erstelle ansprechende, appetitliche Texte die Gäste ins Restaurant locken.`,
                  },
                ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "marketing_post",
            strict: true,
            schema: {
              type: "object",
              properties: {
                dishName: { type: "string" },
                analysis: { type: "string" },
                captionInstagram: { type: "string" },
                captionFacebook: { type: "string" },
                captionGoogle: { type: "string" },
                captionTiktok: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } },
                bestPostingTime: { type: "string" },
                weatherRelevance: { type: "string" },
              },
              required: ["dishName", "analysis", "captionInstagram", "captionFacebook", "captionGoogle", "captionTiktok", "hashtags", "bestPostingTime", "weatherRelevance"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = llmResponse.choices[0]?.message?.content ?? "{}";
      // Markdown-Code-Blöcke entfernen falls KI ```json ... ``` zurückgibt
      const cleanContent = typeof rawContent === "string"
        ? rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
        : JSON.stringify(rawContent);
      const aiResult = JSON.parse(cleanContent) as {
        dishName: string;
        analysis: string;
        captionInstagram: string;
        captionFacebook: string;
        captionGoogle: string;
        captionTiktok: string;
        hashtags: string[];
        bestPostingTime: string;
        weatherRelevance: string;
      };

      // Settings prüfen für Auto-Approve
      const settings = await getOrCreateSettings(restaurantId);

      // Post in DB speichern
      const status = settings.autoApprove ? "approved" : "pending_approval";
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(marketingPosts).values({
        restaurantId,
        imageUrl: imageUrl ?? null,
        imageKey: imageKey ?? null,
        videoUrl: videoUrl ?? null,
        videoKey: videoKey ?? null,
        mediaType: input.mediaType,
        aiAnalysis: aiResult.analysis,
        captionInstagram: aiResult.captionInstagram,
        captionFacebook: aiResult.captionFacebook,
        captionGoogle: aiResult.captionGoogle,
        captionTiktok: aiResult.captionTiktok,
        hashtags: JSON.stringify(aiResult.hashtags),
        platforms: JSON.stringify(["instagram", "facebook", "google", "tiktok"]),
        status: status as "draft" | "pending_approval" | "approved",
        sourceType: input.sourceType,
        productId: input.productId,
        productName: input.productName ?? aiResult.dishName,
        createdBy: ctx.user.id,
      });

      const postId = (result as { insertId?: number })?.insertId;

      // Verwende /manus-storage/{key} statt signierter CloudFront-URLs (die ablaufen)
      let signedMediaUrl: string | undefined;
      if (imageKey) signedMediaUrl = `/manus-storage/${imageKey}`;
      else if (videoKey) signedMediaUrl = `/manus-storage/${videoKey}`;
      else signedMediaUrl = imageUrl ?? videoUrl ?? undefined;

      return {
        postId,
        imageUrl: imageUrl ?? null,
        videoUrl: videoUrl ?? null,
        mediaType: input.mediaType,
        signedMediaUrl,
        imageKey: imageKey ?? null,
        videoKey: videoKey ?? null,
        ...aiResult,
        status,
        autoApproved: settings.autoApprove,
      };
    }),

  // ── Post-Verwaltung ────────────────────────────────────────────────────────

  listPosts: protectedProcedure
    .input(z.object({
      status: z.enum(["draft", "pending_approval", "approved", "scheduled", "published", "rejected", "failed", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      const conditions = [eq(marketingPosts.restaurantId, restaurantId)];
      if (input.status !== "all") {
        conditions.push(eq(marketingPosts.status, input.status as "draft" | "pending_approval" | "approved" | "scheduled" | "published" | "rejected" | "failed"));
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const posts = await db
        .select()
        .from(marketingPosts)
        .where(and(...conditions))
        .orderBy(desc(marketingPosts.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      type PostRow = typeof marketingPosts.$inferSelect;

      // Posts mit korrekten /manus-storage/ URLs zurückgeben
      const postsWithSignedUrls = posts.map((p: PostRow) => {
        // Immer /manus-storage/{key} verwenden wenn Key vorhanden
        const rawImageKey = p.imageKey;
        const rawVideoKey = (p as any).videoKey as string | null | undefined;
        
        let imageUrl: string | null = null;
        if (rawImageKey) {
          imageUrl = `/manus-storage/${rawImageKey}`;
        } else if (p.imageUrl && p.imageUrl.startsWith("/manus-storage/")) {
          imageUrl = p.imageUrl;
        } else if (p.imageUrl && !p.imageUrl.startsWith("http")) {
          imageUrl = p.imageUrl;
        }
        // CloudFront-URLs ignorieren (abgelaufen)
        
        let videoUrl: string | null = null;
        if (rawVideoKey) {
          videoUrl = `/manus-storage/${rawVideoKey}`;
        } else if ((p as any).videoUrl && !(p as any).videoUrl.startsWith("http")) {
          videoUrl = (p as any).videoUrl;
        }
        
        return {
          ...p,
          imageUrl,
          videoUrl,
          mediaType: (p as any).mediaType ?? "image",
          hashtags: p.hashtags ? JSON.parse(p.hashtags) as string[] : [],
          platforms: p.platforms ? JSON.parse(p.platforms) as string[] : [],
          publishResults: p.publishResults ? JSON.parse(p.publishResults) as Record<string, unknown> : null,
        };
      });
      return postsWithSignedUrls;
    }),

  getPost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [post] = await db
        .select()
        .from(marketingPosts)
        .where(and(eq(marketingPosts.id, input.postId), eq(marketingPosts.restaurantId, restaurantId)))
        .limit(1);
      if (!post) throw new TRPCError({ code: "NOT_FOUND" });
      // Verwende /manus-storage/{key} statt signierter CloudFront-URLs (die ablaufen)
      let imageUrl: string | null = null;
      if (post.imageKey) {
        imageUrl = `/manus-storage/${post.imageKey}`;
      } else if (post.imageUrl && !post.imageUrl.startsWith("http")) {
        imageUrl = post.imageUrl;
      }
      // Video-URL
      let videoUrl: string | null = null;
      if ((post as any).videoKey) {
        videoUrl = `/manus-storage/${(post as any).videoKey}`;
      } else if ((post as any).videoUrl && !(post as any).videoUrl.startsWith("http")) {
        videoUrl = (post as any).videoUrl;
      }
      return {
        ...post,
        imageUrl,
        videoUrl,
        mediaType: (post as any).mediaType ?? "image",
        hashtags: post.hashtags ? JSON.parse(post.hashtags) as string[] : [],
        platforms: post.platforms ? JSON.parse(post.platforms) as string[] : [],
      };
    }),

  updatePost: protectedProcedure
    .input(z.object({
      postId: z.number(),
      captionInstagram: z.string().optional(),
      captionFacebook: z.string().optional(),
      captionGoogle: z.string().optional(),
      captionTiktok: z.string().optional(),
      hashtags: z.array(z.string()).optional(),
      platforms: z.array(z.string()).optional(),
      scheduledAt: z.string().optional(), // ISO-String
      postType: z.enum(["post", "story", "reel", "post_and_story", "post_and_reel", "story_and_reel", "all"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const { postId, hashtags, platforms, scheduledAt, ...rest } = input;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(marketingPosts).set({
        ...rest,
        ...(hashtags !== undefined ? { hashtags: JSON.stringify(hashtags) } : {}),
        ...(platforms !== undefined ? { platforms: JSON.stringify(platforms) } : {}),
        ...(scheduledAt !== undefined ? { scheduledAt: new Date(scheduledAt) } : {}),
      }).where(and(eq(marketingPosts.id, postId), eq(marketingPosts.restaurantId, restaurantId)));
      return { success: true };
    }),

  approvePost: protectedProcedure
    .input(z.object({
      postId: z.number(),
      scheduledAt: z.string().optional(), // ISO-String, wenn leer → sofort
      platforms: z.array(z.string()).optional(),
      postType: z.enum(["post", "story", "reel", "post_and_story", "post_and_reel", "story_and_reel", "all"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
      const isScheduled = !!input.scheduledAt;
      const status = isScheduled ? "scheduled" : "approved";
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(marketingPosts).set({
        status: status as "scheduled" | "approved",
        scheduledAt,
        approvedBy: ctx.user.id,
        ...(input.platforms ? { platforms: JSON.stringify(input.platforms) } : {}),
        ...(input.postType ? { postType: input.postType } : {}),
      }).where(and(eq(marketingPosts.id, input.postId), eq(marketingPosts.restaurantId, restaurantId)));

      // Sofort posten wenn kein Zeitplan gesetzt
      if (!isScheduled) {
        try {
          const publishResults = await publishPost(input.postId, restaurantId);
          const resultsMap = Object.fromEntries(publishResults.map(r => [r.platform, r]));
          const anySuccess = publishResults.some(r => r.success);
          await db.update(marketingPosts).set({
            status: anySuccess ? "published" : "failed",
            publishedAt: new Date(),
            publishResults: JSON.stringify(resultsMap),
          }).where(eq(marketingPosts.id, input.postId));
          return { success: true, publishResults: resultsMap };
        } catch (err) {
          await db.update(marketingPosts).set({
            status: "failed",
            publishResults: JSON.stringify({ error: String(err) }),
          }).where(eq(marketingPosts.id, input.postId));
          return { success: false, publishResults: { error: String(err) } };
        }
      }

      return { success: true };
    }),

  rejectPost: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(marketingPosts).set({ status: "rejected" })
        .where(and(eq(marketingPosts.id, input.postId), eq(marketingPosts.restaurantId, restaurantId)));
      return { success: true };
    }),

  // ── Statistiken ────────────────────────────────────────────────────────────

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Datenbank nicht verfügbar" });

  const [totalPosts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketingPosts)
    .where(eq(marketingPosts.restaurantId, restaurantId));

    const [postsThisWeek] = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketingPosts)
      .where(and(eq(marketingPosts.restaurantId, restaurantId), gte(marketingPosts.createdAt, weekAgo)));

    const [publishedThisWeek] = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketingPosts)
      .where(and(
        eq(marketingPosts.restaurantId, restaurantId),
        eq(marketingPosts.status, "published"),
        gte(marketingPosts.publishedAt, weekAgo)
      ));

    const [pendingApproval] = await db
      .select({ count: sql<number>`count(*)` })
      .from(marketingPosts)
      .where(and(eq(marketingPosts.restaurantId, restaurantId), eq(marketingPosts.status, "pending_approval")));

    const connectedPlatforms = await db
      .select()
      .from(marketingPlatforms)
      .where(and(eq(marketingPlatforms.restaurantId, restaurantId), eq(marketingPlatforms.isActive, true)));

    const [reviewsSent] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reviewBoostLog)
      .where(and(eq(reviewBoostLog.restaurantId, restaurantId), gte(reviewBoostLog.sentAt, weekAgo)));

    const settings = await getOrCreateSettings(restaurantId);

    return {
      totalPosts: Number(totalPosts?.count ?? 0),
      postsThisWeek: Number(postsThisWeek?.count ?? 0),
      publishedThisWeek: Number(publishedThisWeek?.count ?? 0),
      pendingApproval: Number(pendingApproval?.count ?? 0),
      connectedPlatforms: connectedPlatforms.map((p: typeof marketingPlatforms.$inferSelect) => p.platform),
      reviewsSentThisWeek: Number(reviewsSent?.count ?? 0),
      weeklyPostTarget: settings.weeklyPostTarget,
      reviewBoosterEnabled: settings.reviewBoosterEnabled,
    };
  }),

  // ── Plattform-Verbindungen ─────────────────────────────────────────────────

  getPlatforms: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(marketingPlatforms).where(eq(marketingPlatforms.restaurantId, restaurantId));
  }),

  connectPlatform: protectedProcedure
    .input(z.object({
      platform: z.enum(["instagram", "facebook", "google", "tiktok"]),
      accessToken: z.string(),
      pageId: z.string().optional(),
      accountId: z.string().optional(),
      accountName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await db
        .select()
        .from(marketingPlatforms)
        .where(and(eq(marketingPlatforms.restaurantId, restaurantId), eq(marketingPlatforms.platform, input.platform)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(marketingPlatforms).set({
          accessToken: input.accessToken,
          pageId: input.pageId,
          accountId: input.accountId,
          accountName: input.accountName,
          isActive: true,
        }).where(eq(marketingPlatforms.id, existing[0].id));
      } else {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(marketingPlatforms).values({
          restaurantId,
          ...input,
          isActive: true,
        });
      }
      return { success: true };
    }),

  disconnectPlatform: protectedProcedure
    .input(z.object({ platform: z.enum(["instagram", "facebook", "google", "tiktok"]) }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(marketingPlatforms).set({ isActive: false })
        .where(and(eq(marketingPlatforms.restaurantId, restaurantId), eq(marketingPlatforms.platform, input.platform)));
      return { success: true };
    }),

  // ── Kellner-Foto-Flow ──────────────────────────────────────────────────────

  checkPhotoOpportunity: protectedProcedure
    .input(z.object({
      orderId: z.number().optional(),
      productId: z.number().optional(),
      productName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      const settings = await getOrCreateSettings(restaurantId);
      if (!settings.waiterCameraEnabled) {
        return { shouldPhoto: false, score: 0, reason: "Kellner-Kamera deaktiviert" };
      }

      // Letztes Posting dieses Produkts prüfen
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const lastPost = await db
        .select()
        .from(marketingPosts)
        .where(and(
          eq(marketingPosts.restaurantId, restaurantId),
          eq(marketingPosts.productName, input.productName),
          eq(marketingPosts.status, "published")
        ))
        .orderBy(desc(marketingPosts.publishedAt))
        .limit(1);

      const daysSinceLastPost = lastPost.length > 0 && lastPost[0].publishedAt
        ? Math.floor((Date.now() - new Date(lastPost[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Posts diese Woche zählen
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [weeklyPosts] = await db
        .select({ count: sql<number>`count(*)` })
        .from(marketingPosts)
        .where(and(
          eq(marketingPosts.restaurantId, restaurantId),
          gte(marketingPosts.createdAt, weekAgo)
        ));
      const postsThisWeek = Number(weeklyPosts?.count ?? 0);

      // Wetter abrufen
      const weather = await getWeatherContext();

      // KI-Entscheidung
      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein Marketing-KI für Restaurants. Entscheide ob jetzt ein guter Zeitpunkt ist, ein Foto von einem Gericht zu machen und auf Social Media zu posten.
Antworte als JSON: { "shouldPhoto": boolean, "score": 0-100, "reason": "Begründung in 1-2 Sätzen" }`,
          },
          {
            role: "user",
            content: `Gericht: "${input.productName}"
Tage seit letztem Post dieses Gerichts: ${daysSinceLastPost}
Posts diese Woche: ${postsThisWeek} (Ziel: ${settings.weeklyPostTarget})
Aktuelles Wetter: ${weather}
Uhrzeit: ${new Date().toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich" })}

Soll der Kellner jetzt ein Foto machen? Berücksichtige: Wie lange kein Post, ob Wochenziel erreicht, ob Wetter zum Gericht passt, Tageszeit (Mittagszeit = höhere Reichweite).`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "photo_decision",
            strict: true,
            schema: {
              type: "object",
              properties: {
                shouldPhoto: { type: "boolean" },
                score: { type: "number" },
                reason: { type: "string" },
              },
              required: ["shouldPhoto", "score", "reason"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawDecision = llmResponse.choices[0]?.message?.content ?? "{}";
      const cleanDecision = typeof rawDecision === "string"
        ? rawDecision.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
        : JSON.stringify(rawDecision);
      const decision = JSON.parse(cleanDecision) as {
        shouldPhoto: boolean;
        score: number;
        reason: string;
      };

      if (decision.shouldPhoto) {
        // Foto-Anfrage in DB speichern
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(marketingPhotoRequests).values({
          restaurantId,
          orderId: input.orderId,
          productId: input.productId,
          productName: input.productName,
          reason: decision.reason,
          aiScore: decision.score,
          aiContext: JSON.stringify({ daysSinceLastPost, postsThisWeek, weather }),
          status: "pending",
        });
      }

      return {
        shouldPhoto: decision.shouldPhoto,
        score: decision.score,
        reason: decision.reason,
        forced: settings.waiterCameraForced && decision.shouldPhoto,
      };
    }),

  submitWaiterPhoto: protectedProcedure
    .input(z.object({
      requestId: z.number().optional(),
      imageBase64: z.string(),
      mimeType: z.string().default("image/jpeg"),
      productName: z.string(),
      productId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      // Bild hochladen
      const imageBuffer = Buffer.from(input.imageBase64, "base64");
      const fileName = `marketing/${restaurantId}/waiter_${Date.now()}.jpg`;
      const { key: imageKey, url: imageUrl } = await storagePut(fileName, imageBuffer, input.mimeType);

      // Foto-Anfrage als erledigt markieren
      if (input.requestId) {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(marketingPhotoRequests).set({
          status: "completed",
          completedAt: new Date(),
          imageUrl,
        }).where(eq(marketingPhotoRequests.id, input.requestId));
      }

      // KI-Analyse starten und Post erstellen (async, gibt postId zurück)
      const settings = await getOrCreateSettings(restaurantId);
      const weather = await getWeatherContext();

      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein Social-Media-Manager für Restaurants. Erstelle ansprechende Texte für Social Media.
Antworte als JSON mit: dishName, analysis, captionInstagram, captionFacebook, captionGoogle, captionTiktok, hashtags (Array), bestPostingTime, weatherRelevance`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
              { type: "text", text: `Gericht: ${input.productName}. Wetter: ${weather}. Erstelle appetitliche Social-Media-Texte auf Deutsch.` },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "marketing_post",
            strict: true,
            schema: {
              type: "object",
              properties: {
                dishName: { type: "string" },
                analysis: { type: "string" },
                captionInstagram: { type: "string" },
                captionFacebook: { type: "string" },
                captionGoogle: { type: "string" },
                captionTiktok: { type: "string" },
                hashtags: { type: "array", items: { type: "string" } },
                bestPostingTime: { type: "string" },
                weatherRelevance: { type: "string" },
              },
              required: ["dishName", "analysis", "captionInstagram", "captionFacebook", "captionGoogle", "captionTiktok", "hashtags", "bestPostingTime", "weatherRelevance"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent2 = llmResponse.choices[0]?.message?.content ?? "{}";
      const cleanContent2 = typeof rawContent2 === "string"
        ? rawContent2.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
        : JSON.stringify(rawContent2);
      const aiResult = JSON.parse(cleanContent2) as {
        dishName: string;
        analysis: string;
        captionInstagram: string;
        captionFacebook: string;
        captionGoogle: string;
        captionTiktok: string;
        hashtags: string[];
        bestPostingTime: string;
        weatherRelevance: string;
      };

      const status = settings.autoApprove ? "approved" : "pending_approval";
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(marketingPosts).values({
        restaurantId,
        imageUrl,
        imageKey,
        aiAnalysis: aiResult.analysis,
        captionInstagram: aiResult.captionInstagram,
        captionFacebook: aiResult.captionFacebook,
        captionGoogle: aiResult.captionGoogle,
        captionTiktok: aiResult.captionTiktok,
        hashtags: JSON.stringify(aiResult.hashtags),
        platforms: JSON.stringify(["instagram", "facebook", "google", "tiktok"]),
        status: status as "pending_approval" | "approved",
        sourceType: "waiter_flow",
        productId: input.productId,
        productName: input.productName,
        createdBy: ctx.user.id,
      });

      const postId = (result as { insertId?: number })?.insertId;

      // Admin benachrichtigen wenn kein Auto-Approve
      if (!settings.autoApprove) {
        await notifyOwner({
          title: "Neuer Marketing-Post zur Freigabe",
          content: `${input.productName} – Foto vom Kellner. Bitte im Marketing-Dashboard freigeben.`,
        });
      }

      return { postId, imageUrl, status, ...aiResult };
    }),

  skipPhotoRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      // Prüfen ob Kellner überspringen darf
      const settings = await getOrCreateSettings(restaurantId);
      if (settings.waiterCameraForced) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin hat das Überspringen deaktiviert" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(marketingPhotoRequests).set({ status: "skipped", completedAt: new Date() })
        .where(eq(marketingPhotoRequests.id, input.requestId));
      return { success: true };
    }),

  // ── Bewertungs-Booster ─────────────────────────────────────────────────────

  triggerReviewRequest: protectedProcedure
    .input(z.object({
      orderId: z.number().optional(),
      guestPhone: z.string().optional(),
      guestName: z.string().optional(),
      channel: z.enum(["sms", "whatsapp", "email"]).default("sms"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

      const settings = await getOrCreateSettings(restaurantId);
      if (!settings.reviewBoosterEnabled) return { sent: false, reason: "Bewertungs-Booster deaktiviert" };
      if (!input.guestPhone) return { sent: false, reason: "Keine Telefonnummer" };
      if (!settings.googleReviewUrl) return { sent: false, reason: "Kein Google-Bewertungslink konfiguriert" };

      // Log-Eintrag erstellen
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(reviewBoostLog).values({
        restaurantId,
        orderId: input.orderId,
        guestPhone: input.guestPhone,
        guestName: input.guestName,
        channel: input.channel,
      });

      // Twilio-SMS/WhatsApp senden (wenn konfiguriert)
      if (settings.twilioAccountSid && settings.twilioAuthToken && settings.twilioFromNumber) {
        try {
          const message = `Vielen Dank für Ihren Besuch${input.guestName ? `, ${input.guestName}` : ""}! 😊 Wir würden uns über eine kurze Bewertung freuen: ${settings.googleReviewUrl}`;
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${settings.twilioAccountSid}/Messages.json`;
          const toNumber = input.channel === "whatsapp" ? `whatsapp:${input.guestPhone}` : input.guestPhone;
          const fromNumber = input.channel === "whatsapp" ? `whatsapp:${settings.twilioFromNumber}` : settings.twilioFromNumber;

          await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${Buffer.from(`${settings.twilioAccountSid}:${settings.twilioAuthToken}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: toNumber, From: fromNumber, Body: message }).toString(),
          });
        } catch (err) {
          console.error("[ReviewBooster] Twilio-Fehler:", err);
        }
      }

      return { sent: true };
    }),

  getReviewStats: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(reviewBoostLog)
      .where(eq(reviewBoostLog.restaurantId, restaurantId));
    const [clicked] = await db.select({ count: sql<number>`count(*)` }).from(reviewBoostLog)
      .where(and(eq(reviewBoostLog.restaurantId, restaurantId), eq(reviewBoostLog.clicked, true)));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [thisWeek] = await db.select({ count: sql<number>`count(*)` }).from(reviewBoostLog)
      .where(and(eq(reviewBoostLog.restaurantId, restaurantId), gte(reviewBoostLog.sentAt, weekAgo)));

    return {
      totalSent: Number(total?.count ?? 0),
      totalClicked: Number(clicked?.count ?? 0),
      clickRate: Number(total?.count ?? 0) > 0 ? Math.round((Number(clicked?.count ?? 0) / Number(total?.count ?? 0)) * 100) : 0,
      sentThisWeek: Number(thisWeek?.count ?? 0),
    };
  }),

  // ── Stammkunden-Kampagnen ──────────────────────────────────────────────────

  getCampaigns: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(customerCampaigns)
        .where(eq(customerCampaigns.restaurantId, restaurantId))
        .orderBy(desc(customerCampaigns.sentAt))
        .limit(input.limit);
    }),

  // ── Foto-Anfragen (Admin-Übersicht) ────────────────────────────────────────

  getPhotoRequests: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "completed", "skipped", "expired", "all"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "BAD_REQUEST" });
      const conditions = [eq(marketingPhotoRequests.restaurantId, restaurantId)];
      if (input.status !== "all") {
        conditions.push(eq(marketingPhotoRequests.status, input.status as "pending" | "completed" | "skipped" | "expired"));
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(marketingPhotoRequests)
        .where(and(...conditions))
        .orderBy(desc(marketingPhotoRequests.requestedAt))
        .limit(50);
    }),
});
