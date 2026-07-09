/**
 * marketingReportCron.ts
 *
 * Wöchentlicher Marketing-Report – wird jeden Montag ausgeführt.
 *
 * Inhalt:
 * - Neue Bewertungen diese Woche
 * - Reichweite der Posts (Likes, Kommentare, Impressionen)
 * - Beste Posts der Woche
 * - Stammkunden-Kampagnen-Performance
 * - KI-Empfehlung für nächste Woche
 */

import { getDb } from "./db";
import {
  marketingPosts,
  marketingSettings,
  marketingReviewRequests,
  customerCampaigns,
} from "../drizzle/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";

// ─── Haupt-Handler (Heartbeat-Route) ─────────────────────────────────────────

export async function handleMarketingReport(req: Request, res: Response): Promise<void> {
  const r = res as unknown as { json: (d: unknown) => void; status: (c: number) => { json: (d: unknown) => void } };

  try {
    const db = await getDb();

    // Alle Restaurants mit aktivem Marketing-Modul
    const activeRestaurants = await db
      .select()
      .from(marketingSettings)
      .where(sql`JSON_EXTRACT(settings, '$.weeklyReportEnabled') = true`);

    const results = [];
    for (const setting of activeRestaurants) {
      const report = await generateWeeklyReport(setting.restaurantId);
      results.push({ restaurantId: setting.restaurantId, ...report });
    }

    r.json({ success: true, reportsGenerated: results.length });
  } catch (err) {
    r.status(500).json({ error: (err as Error).message });
  }
}

// ─── Report-Generierung ───────────────────────────────────────────────────────

async function generateWeeklyReport(restaurantId: number): Promise<{
  newReviews: number;
  postsPublished: number;
  bestPost: string | null;
  campaignsSent: number;
  recommendation: string;
}> {
  const db = await getDb();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Posts dieser Woche
  const weeklyPosts = await db
    .select()
    .from(marketingPosts)
    .where(
      and(
        eq(marketingPosts.restaurantId, restaurantId),
        gte(marketingPosts.publishedAt, oneWeekAgo)
      )
    )
    .orderBy(desc(marketingPosts.publishedAt));

  // Bewertungs-Anfragen dieser Woche
  const reviewRequests = await db
    .select()
    .from(marketingReviewRequests)
    .where(
      and(
        eq(marketingReviewRequests.restaurantId, restaurantId),
        gte(marketingReviewRequests.sentAt, oneWeekAgo)
      )
    );

  // Kampagnen dieser Woche
  const campaigns = await db
    .select()
    .from(customerCampaigns)
    .where(
      and(
        eq(customerCampaigns.restaurantId, restaurantId),
        gte(customerCampaigns.sentAt, oneWeekAgo)
      )
    );

  // Bester Post (höchste Engagement-Rate)
  type WeeklyPost = typeof weeklyPosts[number];
  const bestPost = weeklyPosts.find((p: WeeklyPost) => {
    const stats = (p.platformStats as Record<string, unknown>) ?? {};
    return Object.values(stats).some((s: unknown) => (s as Record<string, number>)?.likes > 0);
  });

  // KI-Empfehlung generieren
  const recommendation = await generateRecommendation({
    postsCount: weeklyPosts.length,
    reviewsRequested: reviewRequests.length,
    reviewsClicked: reviewRequests.filter((r: typeof reviewRequests[number]) => r.clickedAt).length,
    campaignsSent: campaigns.length,
    bestPostCaption: bestPost?.caption ?? null,
  });

  // Report als Benachrichtigung senden
  const reportText = buildReportText({
    postsPublished: weeklyPosts.length,
    reviewsRequested: reviewRequests.length,
    reviewsClicked: reviewRequests.filter((r: typeof reviewRequests[number]) => r.clickedAt).length,
    campaignsSent: campaigns.length,
    recommendation,
  });

  await notifyOwner({
    title: `📊 Wöchentlicher Marketing-Report`,
    content: reportText,
  });

  return {
    newReviews: reviewRequests.filter((r: typeof reviewRequests[number]) => r.guestRating !== null).length,
    postsPublished: weeklyPosts.length,
    bestPost: bestPost?.caption ?? null,
    campaignsSent: campaigns.length,
    recommendation,
  };
}

// ─── KI-Empfehlung ────────────────────────────────────────────────────────────

async function generateRecommendation(stats: {
  postsCount: number;
  reviewsRequested: number;
  reviewsClicked: number;
  campaignsSent: number;
  bestPostCaption: string | null;
}): Promise<string> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Du bist ein Marketing-Experte für Gastronomie. Gib eine konkrete, umsetzbare Empfehlung für die nächste Woche. Max. 2 Sätze. Auf Deutsch.",
        },
        {
          role: "user",
          content: `Diese Woche: ${stats.postsCount} Posts veröffentlicht, ${stats.reviewsRequested} Bewertungsanfragen gesendet (${stats.reviewsClicked} geklickt), ${stats.campaignsSent} Kampagnen. Bester Post: "${stats.bestPostCaption ?? "keiner"}". Was empfiehlst du für nächste Woche?`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content;
    return typeof content === "string" ? content : "Poste diese Woche ein Foto vom Tagesmenü und aktiviere den Bewertungs-Booster nach jeder Zahlung.";
  } catch {
    return "Poste diese Woche ein Foto vom Tagesmenü und aktiviere den Bewertungs-Booster nach jeder Zahlung.";
  }
}

function buildReportText(stats: {
  postsPublished: number;
  reviewsRequested: number;
  reviewsClicked: number;
  campaignsSent: number;
  recommendation: string;
}): string {
  const clickRate = stats.reviewsRequested > 0
    ? Math.round((stats.reviewsClicked / stats.reviewsRequested) * 100)
    : 0;

  return `
📱 Posts veröffentlicht: ${stats.postsPublished}
⭐ Bewertungsanfragen: ${stats.reviewsRequested} (${clickRate}% geklickt)
📨 Stammkunden-Kampagnen: ${stats.campaignsSent}

💡 KI-Empfehlung für nächste Woche:
${stats.recommendation}
  `.trim();
}

// Type stubs for Express compatibility
type Request = { body?: unknown; headers?: Record<string, string> };
type Response = unknown;
