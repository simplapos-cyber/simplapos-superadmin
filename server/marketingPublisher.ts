/**
 * marketingPublisher.ts
 *
 * Veröffentlicht genehmigte Posts auf allen verbundenen Plattformen.
 * Jede Plattform hat ihre eigene Funktion; Fehler einer Plattform
 * blockieren die anderen nicht.
 *
 * Plattformen:
 *  - Instagram Graph API (via Facebook Business API) – Post & Story
 *  - Facebook Pages API – Post & Story
 *  - Google Business Profile API (Local Posts)
 *  - TikTok Content Posting API
 *
 * postType:
 *  - "post"           → nur Feed-Beitrag
 *  - "story"          → nur Story
 *  - "post_and_story" → Feed-Beitrag + Story
 */

import { getDb } from "./db";
import { marketingPlatforms, marketingPosts } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut, storageGetSignedUrl } from "./storage";
import sharp from "sharp";

// ─── Typen ────────────────────────────────────────────────────────────────────

export type PublishResult = {
  platform: string;
  success: boolean;
  externalId?: string;
  error?: string;
};

type PlatformCredentials = {
  accessToken: string;
  accountId?: string | null;
  pageId?: string | null;
};

// ─── Haupt-Funktion ───────────────────────────────────────────────────────────

/**
 * Veröffentlicht einen genehmigten Post auf allen verbundenen Plattformen
 * des Restaurants.
 */
export async function publishPost(postId: number, restaurantId: number): Promise<PublishResult[]> {
  const db = await getDb();

  // Post laden
  const posts = await db
    .select()
    .from(marketingPosts)
    .where(eq(marketingPosts.id, postId))
    .limit(1);

  const post = posts[0];
  if (!post) throw new Error(`Post ${postId} nicht gefunden`);

  // Verbundene Plattformen laden
  const platforms = await db
    .select()
    .from(marketingPlatforms)
    .where(eq(marketingPlatforms.restaurantId, restaurantId));

  const activePlatforms = platforms.filter((p: typeof platforms[number]) => p.isActive && post.platforms.includes(p.platform));

  if (activePlatforms.length === 0) {
    return [{ platform: "none", success: false, error: "Keine verbundenen Plattformen" }];
  }

  const postType = (post as any).postType ?? "post";

  // Parallel auf allen Plattformen posten
  const results = await Promise.allSettled(
    activePlatforms.map(async (platform: typeof activePlatforms[number]) => {
      const creds: PlatformCredentials = {
        accessToken: platform.accessToken!,
        accountId: platform.accountId,
        pageId: platform.pageId,
      };

      switch (platform.platform) {
        case "instagram":
          return publishToInstagram(post, creds, postType);
        case "facebook":
          return publishToFacebook(post, creds, postType);
        case "google":
          return publishToGoogle(post, creds);
        case "tiktok":
          return publishToTikTok(post, creds);
        default:
          return { platform: platform.platform, success: false, error: "Unbekannte Plattform" };
      }
    })
  );

  const publishResults: PublishResult[] = results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    return {
      platform: activePlatforms[i].platform,
      success: false,
      error: result.reason?.message ?? "Unbekannter Fehler",
    };
  });

  // Post als veröffentlicht markieren wenn mindestens eine Plattform erfolgreich
  const anySuccess = publishResults.some(r => r.success);
  if (anySuccess) {
    const externalIds = Object.fromEntries(
      publishResults.filter(r => r.success && r.externalId).map(r => [r.platform, r.externalId])
    );
    await db
      .update(marketingPosts)
      .set({
        status: "published",
        publishedAt: new Date(),
        externalIds,
      })
      .where(eq(marketingPosts.id, postId));
  }

  return publishResults;
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function publishToInstagram(
  post: { imageUrl?: string | null; videoUrl?: string | null; mediaType?: string | null; captionInstagram: string | null; hashtags: string[] | string | null },
  creds: PlatformCredentials,
  postType: string
): Promise<PublishResult> {
  try {
    const igUserId = creds.accountId ?? creds.pageId;
    if (!igUserId) throw new Error("Instagram User-ID fehlt");

    const isVideo = post.mediaType === "video" && post.videoUrl;
    const rawImageUrl = isVideo ? null : await getPublicImageUrl(post.imageUrl ?? "");
    const rawVideoUrl = isVideo ? await getPublicImageUrl(post.videoUrl!) : null;
    const results: string[] = [];

    const includePost  = ["post", "post_and_story", "post_and_reel", "all"].includes(postType);
    const includeStory = ["story", "post_and_story", "story_and_reel", "all"].includes(postType);
    const includeReel  = ["reel", "post_and_reel", "story_and_reel", "all"].includes(postType);

    // Feed-Beitrag posten
    if (includePost) {
      const caption = buildCaption(post.captionInstagram, post.hashtags);

      // Schritt 1: Media-Container erstellen (Bild oder Video)
      let containerBody: Record<string, string>;
      if (isVideo && rawVideoUrl) {
        containerBody = { video_url: rawVideoUrl, media_type: "REELS", caption, access_token: creds.accessToken };
      } else {
        const croppedUrl = await cropImageForInstagramFeed(rawImageUrl ?? "", post.imageUrl ?? "");
        containerBody = { image_url: croppedUrl, caption, access_token: creds.accessToken };
      }

      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        }
      );
      const containerData = await containerRes.json() as { id?: string; error?: { message: string } };
      if (!containerRes.ok || !containerData.id) {
        throw new Error(`Feed: ${containerData.error?.message ?? "Container-Erstellung fehlgeschlagen"}`);
      }

      // Schritt 2: Warten bis Container-Status FINISHED ist (max. 30 Sekunden)
      await waitForInstagramContainer(containerData.id, creds.accessToken, !!isVideo);

      // Schritt 3: Container veröffentlichen
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerData.id,
            access_token: creds.accessToken,
          }),
        }
      );
      const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
      if (!publishRes.ok || !publishData.id) {
        throw new Error(`Feed: ${publishData.error?.message ?? "Veröffentlichung fehlgeschlagen"}`);
      }
      results.push(`post:${publishData.id}`);
    }

    // Story posten
    if (includeStory) {
      // Schritt 1: Story-Container erstellen (Bild oder Video)
      const storyBody = isVideo && rawVideoUrl
        ? { video_url: rawVideoUrl, media_type: "STORIES", access_token: creds.accessToken }
        : { image_url: rawImageUrl!, media_type: "STORIES", access_token: creds.accessToken };

      const storyContainerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storyBody),
        }
      );
      const storyContainerData = await storyContainerRes.json() as { id?: string; error?: { message: string } };
      if (!storyContainerRes.ok || !storyContainerData.id) {
        // Story-Fehler nicht als fatalen Fehler behandeln
        console.warn(`Instagram Story-Container fehlgeschlagen: ${storyContainerData.error?.message}`);
        results.push(`story:failed`);
      } else {
        // Schritt 2: Warten bis Story-Container FINISHED ist
        await waitForInstagramContainer(storyContainerData.id, creds.accessToken, !!isVideo);

        // Schritt 3: Story veröffentlichen
        const storyPublishRes = await fetch(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: storyContainerData.id,
              access_token: creds.accessToken,
            }),
          }
        );
        const storyPublishData = await storyPublishRes.json() as { id?: string; error?: { message: string } };
        if (!storyPublishRes.ok || !storyPublishData.id) {
          console.warn(`Instagram Story fehlgeschlagen: ${storyPublishData.error?.message}`);
          results.push(`story:failed`);
        } else {
          results.push(`story:${storyPublishData.id}`);
        }
      }
    }

    // Reel posten (Instagram Reels = VIDEO mit media_type=REELS)
    // Hinweis: Instagram Reels API erwartet ein Video. Bei Bildern wird ein
    // Slideshow-Reel erstellt (single image Reel via image_url ist möglich ab API v17+)
    if (includeReel) {
      const caption = buildCaption(post.captionInstagram, post.hashtags);

      // Schritt 1: Reel-Container erstellen (Video-Reel oder Bild-Reel)
      const reelBody = isVideo && rawVideoUrl
        ? { media_type: "REELS", video_url: rawVideoUrl, caption, access_token: creds.accessToken }
        : { media_type: "REELS", image_url: rawImageUrl!, caption, access_token: creds.accessToken };

      const reelContainerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reelBody),
        }
      );
      const reelContainerData = await reelContainerRes.json() as { id?: string; error?: { message: string } };
      if (!reelContainerRes.ok || !reelContainerData.id) {
        console.warn(`Instagram Reel-Container fehlgeschlagen: ${reelContainerData.error?.message}`);
        results.push(`reel:failed:${reelContainerData.error?.message ?? "Container-Fehler"}`);
      } else {
        // Schritt 2: Warten bis Reel-Container FINISHED ist
        await waitForInstagramContainer(reelContainerData.id, creds.accessToken, !!isVideo);

        // Schritt 3: Reel veröffentlichen
        const reelPublishRes = await fetch(
          `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: reelContainerData.id,
              access_token: creds.accessToken,
            }),
          }
        );
        const reelPublishData = await reelPublishRes.json() as { id?: string; error?: { message: string } };
        if (!reelPublishRes.ok || !reelPublishData.id) {
          console.warn(`Instagram Reel fehlgeschlagen: ${reelPublishData.error?.message}`);
          results.push(`reel:failed:${reelPublishData.error?.message ?? "Veröffentlichung fehlgeschlagen"}`);
        } else {
          results.push(`reel:${reelPublishData.id}`);
        }
      }
    }

    return { platform: "instagram", success: results.some(r => !r.includes("failed")), externalId: results.join(",") };
  } catch (err) {
    return { platform: "instagram", success: false, error: (err as Error).message };
  }
}

// ─── Facebook ─────────────────────────────────────────────────────────────────

async function publishToFacebook(
  post: { imageUrl?: string | null; videoUrl?: string | null; mediaType?: string | null; captionFacebook: string | null; hashtags: string[] | string | null },
  creds: PlatformCredentials,
  postType: string
): Promise<PublishResult> {
  try {
    const pageId = creds.pageId ?? creds.accountId;
    if (!pageId) throw new Error("Facebook Page-ID fehlt");

    const isVideo = post.mediaType === "video" && post.videoUrl;
    const imageUrl = isVideo ? null : await getPublicImageUrl(post.imageUrl ?? "");
    const videoUrl = isVideo ? await getPublicImageUrl(post.videoUrl!) : null;
    const results: string[] = [];

    const fbIncludePost  = ["post", "post_and_story", "post_and_reel", "all"].includes(postType);
    const fbIncludeStory = ["story", "post_and_story", "story_and_reel", "all"].includes(postType);
    const fbIncludeReel  = ["reel", "post_and_reel", "story_and_reel", "all"].includes(postType);

    // Feed-Beitrag posten
    if (fbIncludePost) {
      const message = buildCaption(post.captionFacebook, post.hashtags);

      if (isVideo && videoUrl) {
        // Video-Post: /{page-id}/videos
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_url: videoUrl, description: message, access_token: creds.accessToken }),
          }
        );
        const data = await res.json() as { id?: string; error?: { message: string } };
        if (!res.ok || !data.id) throw new Error(`Feed: ${data.error?.message ?? "Facebook-Video-Post fehlgeschlagen"}`);
        results.push(`post:${data.id}`);
      } else {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: imageUrl, message, access_token: creds.accessToken }),
          }
        );
        const data = await res.json() as { id?: string; error?: { message: string } };
        if (!res.ok || !data.id) throw new Error(`Feed: ${data.error?.message ?? "Facebook-Post fehlgeschlagen"}`);
        results.push(`post:${data.id}`);
      }
    }

    // Story posten
    if (fbIncludeStory) {
      if (isVideo && videoUrl) {
        // Video-Story: /{page-id}/video_stories
        const uploadRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/videos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_url: videoUrl, published: false, access_token: creds.accessToken }),
          }
        );
        const uploadData = await uploadRes.json() as { id?: string; error?: { message: string } };
        if (!uploadRes.ok || !uploadData.id) {
          console.warn(`Facebook Video-Story-Upload fehlgeschlagen: ${uploadData.error?.message}`);
          results.push(`story:failed`);
        } else {
          const storyRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/video_stories`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ video_id: uploadData.id, access_token: creds.accessToken }),
            }
          );
          const storyData = await storyRes.json() as { id?: string; error?: { message: string } };
          if (!storyRes.ok || !storyData.id) {
            console.warn(`Facebook Video-Story fehlgeschlagen: ${storyData.error?.message}`);
            results.push(`story:failed`);
          } else {
            results.push(`story:${storyData.id}`);
          }
        }
      } else {
        // Foto-Story
        const uploadRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: imageUrl, published: false, access_token: creds.accessToken }),
          }
        );
        const uploadData = await uploadRes.json() as { id?: string; error?: { message: string } };
        if (!uploadRes.ok || !uploadData.id) {
          console.warn(`Facebook Story-Upload fehlgeschlagen: ${uploadData.error?.message}`);
          results.push(`story:failed`);
        } else {
          const storyRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/photo_stories`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ photo_id: uploadData.id, access_token: creds.accessToken }),
            }
          );
          const storyData = await storyRes.json() as { id?: string; error?: { message: string } };
          if (!storyRes.ok || !storyData.id) {
            console.warn(`Facebook Story fehlgeschlagen: ${storyData.error?.message}`);
            results.push(`story:failed`);
          } else {
            results.push(`story:${storyData.id}`);
          }
        }
      }
    }

    // Reel posten (Facebook Reels via /{page-id}/video_reels)
    if (fbIncludeReel) {
      const message = buildCaption(post.captionFacebook, post.hashtags);

      if (isVideo && videoUrl) {
        // Echtes Video-Reel
        const reelRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/video_reels`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file_url: videoUrl, description: message, upload_phase: "finish", access_token: creds.accessToken }),
          }
        );
        const reelData = await reelRes.json() as { id?: string; error?: { message: string } };
        if (!reelRes.ok || !reelData.id) {
          console.warn(`Facebook Video-Reel fehlgeschlagen: ${reelData.error?.message}`);
          results.push(`reel:failed:${reelData.error?.message ?? "Reel fehlgeschlagen"}`);
        } else {
          results.push(`reel:${reelData.id}`);
        }
      } else {
        // Bild-Reel (als Story veröffentlichen)
        const reelUploadRes = await fetch(
          `https://graph.facebook.com/v19.0/${pageId}/photos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: imageUrl, published: false, access_token: creds.accessToken }),
          }
        );
        const reelUploadData = await reelUploadRes.json() as { id?: string; error?: { message: string } };
        if (!reelUploadRes.ok || !reelUploadData.id) {
          console.warn(`Facebook Reel-Upload fehlgeschlagen: ${reelUploadData.error?.message}`);
          results.push(`reel:failed:${reelUploadData.error?.message ?? "Upload fehlgeschlagen"}`);
        } else {
          const reelRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/photo_stories`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ photo_id: reelUploadData.id, access_token: creds.accessToken }),
            }
          );
          const reelData = await reelRes.json() as { id?: string; error?: { message: string } };
          if (!reelRes.ok || !reelData.id) {
            console.warn(`Facebook Reel fehlgeschlagen: ${reelData.error?.message}`);
            results.push(`reel:failed:${reelData.error?.message ?? "Reel fehlgeschlagen"}`);
          } else {
            results.push(`reel:${reelData.id}`);
          }
        }
      }
    }

    return { platform: "facebook", success: results.some(r => !r.includes("failed")), externalId: results.join(",") };
  } catch (err) {
    return { platform: "facebook", success: false, error: (err as Error).message };
  }
}

// ─── Google Business Profile ──────────────────────────────────────────────────

async function publishToGoogle(
  post: { imageUrl: string; captionGoogle: string | null; productName: string | null },
  creds: PlatformCredentials
): Promise<PublishResult> {
  try {
    const locationId = creds.accountId;
    if (!locationId) throw new Error("Google Location-ID fehlt (Format: accounts/123/locations/456)");

    const summary = post.captionGoogle ?? post.productName ?? "Neues Gericht";
    const imageUrl = await getPublicImageUrl(post.imageUrl);

    const body = {
      languageCode: "de",
      summary,
      media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }],
      topicType: "STANDARD",
    };

    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationId}/localPosts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json() as { name?: string; error?: { message: string } };
    if (!res.ok || !data.name) {
      throw new Error(data.error?.message ?? "Google-Post fehlgeschlagen");
    }

    return { platform: "google", success: true, externalId: data.name };
  } catch (err) {
    return { platform: "google", success: false, error: (err as Error).message };
  }
}

// ─── TikTok ───────────────────────────────────────────────────────────────────

async function publishToTikTok(
  post: { imageUrl: string; captionTiktok: string | null; hashtags: string[] | string | null },
  creds: PlatformCredentials
): Promise<PublishResult> {
  try {
    const caption = buildCaption(post.captionTiktok, post.hashtags);
    const imageUrl = await getPublicImageUrl(post.imageUrl);

    // TikTok Content Posting API (Photo Post)
    // Schritt 1: Upload initialisieren
    const initRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${creds.accessToken}`,
        },
        body: JSON.stringify({
          post_info: {
            title: caption.slice(0, 150),
            privacy_level: "PUBLIC_TO_EVERYONE",
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_images: [imageUrl],
            photo_cover_index: 0,
          },
          media_type: "PHOTO",
          post_mode: "DIRECT_POST",
        }),
      }
    );
    const initData = await initRes.json() as { data?: { publish_id: string }; error?: { message: string } };
    if (!initRes.ok || !initData.data?.publish_id) {
      throw new Error(initData.error?.message ?? "TikTok-Upload fehlgeschlagen");
    }

    return { platform: "tiktok", success: true, externalId: initData.data.publish_id };
  } catch (err) {
    return { platform: "tiktok", success: false, error: (err as Error).message };
  }
}

// ─── Instagram Container Polling ─────────────────────────────────────────────

/**
 * Wartet bis ein Instagram Media-Container den Status FINISHED hat.
 * Instagram verarbeitet Bilder asynchron – ohne Warten schlägt media_publish fehl.
 * Timeout: 30 Sekunden (10 Versuche × 3 Sekunden)
 */
async function waitForInstagramContainer(containerId: string, accessToken: string, isVideo = false): Promise<void> {
  // Videos brauchen länger (bis zu 5 Minuten), Bilder ca. 30 Sekunden
  const maxAttempts = isVideo ? 60 : 10;  // 60 * 5s = 5 Minuten für Videos, 10 * 3s = 30s für Bilder
  const delayMs = isVideo ? 5000 : 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status&access_token=${accessToken}`
    );
    const data = await res.json() as { status_code?: string; status?: string; error?: { message: string } };

    if (data.status_code === "FINISHED") return; // Bereit zum Veröffentlichen
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`Container-Status: ${data.status_code} – ${data.status ?? "Unbekannter Fehler"}`);
    }

    // IN_PROGRESS oder leer → warten und nochmals prüfen
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  const timeoutSec = isVideo ? 300 : 30;
  throw new Error(`Instagram Container-Timeout: Container wurde nach ${timeoutSec} Sekunden nicht bereit`);
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildCaption(text: string | null, hashtags: string[] | string | null): string {
  const base = text ?? "";
  // hashtags kann als JSON-String aus der DB kommen
  let tags: string[] = [];
  if (typeof hashtags === "string") {
    try { tags = JSON.parse(hashtags); } catch { tags = []; }
  } else if (Array.isArray(hashtags)) {
    tags = hashtags;
  }
  if (tags.length === 0) return base;
  const tagStr = tags.map((h: string) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return `${base}\n\n${tagStr}`.trim();
}

/**
 * Wandelt relative /manus-storage/... URLs in absolute URLs um.
 * Externe URLs werden unverändert zurückgegeben.
 */
function buildAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Für lokale Storage-URLs: Wir brauchen die öffentliche Domain
  const base = process.env.PUBLIC_URL ?? process.env.VITE_APP_URL ?? "https://simplapos.com";
  return `${base}${url}`;
}

/**
 * Gibt eine direkt zugängliche, öffentliche URL für ein Bild zurück.
 * Für /manus-storage/ URLs wird eine frische Signed-URL generiert,
 * die Instagram/Facebook direkt herunterladen kann (kein Redirect).
 */
async function getPublicImageUrl(url: string): Promise<string> {
  try {
    // /manus-storage/{key} → öffentliche URL über simplapos.com
    // (Instagram/Facebook akzeptieren keine signierten S3-URLs mit komplexen Query-Parametern)
    if (url.startsWith("/manus-storage/") || (url.startsWith("/") && !url.startsWith("//"))) {
      return `https://simplapos.com${url}`;
    }
    // Bereits absolute URL
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    // Fallback: simplapos.com + Pfad
    return `https://simplapos.com/${url}`;
  } catch (err) {
    console.warn("getPublicImageUrl fehlgeschlagen, Fallback:", err);
    return buildAbsoluteUrl(url);
  }
}

/**
 * Lädt ein Bild herunter, schneidet es auf 4:5 (Instagram Feed-kompatibel) zu
 * und lädt es in den Storage hoch. Gibt die neue absolute URL zurück.
 * Bei Fehler wird die Original-URL zurückgegeben.
 */
async function cropImageForInstagramFeed(absoluteUrl: string, originalStorageUrl: string): Promise<string> {
  try {
    // Bild herunterladen
    const response = await fetch(absoluteUrl);
    if (!response.ok) return absoluteUrl;
    const buffer = Buffer.from(await response.arrayBuffer());

    // Bildgrösse ermitteln
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 1080;
    const height = metadata.height ?? 1080;
    const ratio = width / height;

    // Instagram erlaubt: 0.8 (4:5) bis 1.91:1
    // Wenn bereits im erlaubten Bereich, Original verwenden
    if (ratio >= 0.8 && ratio <= 1.91) return absoluteUrl;

    // Auf 4:5 zuschneiden (center crop)
    let cropWidth = width;
    let cropHeight = height;

    if (ratio > 1.91) {
      // Zu breit → auf 1.91:1 zuschneiden
      cropWidth = Math.floor(height * 1.91);
    } else {
      // Zu hoch → auf 4:5 zuschneiden
      cropHeight = Math.floor(width / 0.8);
      if (cropHeight > height) {
        cropHeight = height;
        cropWidth = Math.floor(height * 0.8);
      }
    }

    const croppedBuffer = await sharp(buffer)
      .extract({
        left: Math.floor((width - cropWidth) / 2),
        top: Math.floor((height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Zugeschnittenes Bild in Storage hochladen
    const key = `${originalStorageUrl.replace(/^\/manus-storage\//, "")}_ig_cropped.jpg`;
    const { url } = await storagePut(key, croppedBuffer, "image/jpeg");
    return buildAbsoluteUrl(url);
  } catch (err) {
    console.warn("Bild-Zuschneiden fehlgeschlagen, Original verwenden:", err);
    return absoluteUrl;
  }
}
