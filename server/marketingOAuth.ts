/**
 * Marketing OAuth Handler
 * Verwaltet OAuth-Flows für Instagram/Facebook (Meta), Google Business Profile und TikTok.
 * Jeder Gastronom verbindet sich einmalig per Login-Button – keine manuellen API-Keys nötig.
 *
 * Ablauf:
 *  1. Frontend ruft /api/marketing/oauth/start?platform=instagram&restaurantId=X&origin=https://...
 *  2. Backend generiert State-Token (CSRF-Schutz), speichert ihn in DB, leitet zu Plattform weiter
 *  3. Plattform leitet zurück zu /api/marketing/oauth/callback/:platform
 *  4. Backend tauscht Code gegen Token, speichert Token in marketing_platforms, leitet Frontend weiter
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { marketingOauthStates, marketingPlatforms } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function saveState(
  state: string,
  restaurantId: number,
  platform: "instagram" | "facebook" | "google" | "tiktok",
  redirectUri: string
): Promise<void> {
  const db = await getDb();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Minuten
  await db.insert(marketingOauthStates).values({
    state,
    restaurantId,
    platform,
    redirectUri,
    expiresAt,
  });
}

async function consumeState(
  state: string
): Promise<{ restaurantId: number; platform: string; redirectUri: string } | null> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(marketingOauthStates)
    .where(and(
      eq(marketingOauthStates.state, state),
      sql`${marketingOauthStates.expiresAt} > ${now}`
    ))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  // State einmalig verwenden – sofort löschen
  await db.delete(marketingOauthStates).where(eq(marketingOauthStates.state, state));
  return { restaurantId: row.restaurantId, platform: row.platform, redirectUri: row.redirectUri };
}

async function upsertPlatformToken(
  restaurantId: number,
  platform: "instagram" | "facebook" | "google" | "tiktok",
  data: {
    accessToken: string;
    refreshToken?: string;
    pageId?: string;
    accountId?: string;
    accountName?: string;
    tokenExpiresAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: marketingPlatforms.id })
    .from(marketingPlatforms)
    .where(
      and(
        eq(marketingPlatforms.restaurantId, restaurantId),
        eq(marketingPlatforms.platform, platform)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(marketingPlatforms)
      .set({ ...data, isActive: true, updatedAt: new Date() })
      .where(
        and(
          eq(marketingPlatforms.restaurantId, restaurantId),
          eq(marketingPlatforms.platform, platform)
        )
      );
  } else {
    await db.insert(marketingPlatforms).values({
      restaurantId,
      platform,
      ...data,
      isActive: true,
    });
  }
}

// ─── OAuth-URLs ─────────────────────────────────────────────────────────────

function getMetaAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: ENV.metaAppId,
    redirect_uri: redirectUri,
    scope: [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "business_management",
    ].join(","),
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

function getGoogleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: redirectUri,
    scope: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/plus.business.manage",
    ].join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function getTikTokAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_key: ENV.tiktokClientKey,
    redirect_uri: redirectUri,
    scope: "video.publish,video.upload,user.info.basic",
    response_type: "code",
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize?${params}`;
}

// ─── Token-Exchange ──────────────────────────────────────────────────────────

async function exchangeMetaCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    client_id: ENV.metaAppId,
    client_secret: ENV.metaAppSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`);
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[MarketingOAuth] exchangeMetaCode failed: ${res.status} ${errBody}`);
    throw new Error(`Meta token exchange failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function getLongLivedMetaToken(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: ENV.metaAppId,
    client_secret: ENV.metaAppSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${params}`);
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[MarketingOAuth] getLongLivedMetaToken failed: ${res.status} ${errBody}`);
    throw new Error(`Meta long-lived token exchange failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  // expires_in kann fehlen bei Page Access Tokens – Fallback auf 60 Tage
  const expiresIn = (typeof data.expires_in === 'number' && isFinite(data.expires_in) && data.expires_in > 0)
    ? data.expires_in
    : 60 * 24 * 60 * 60; // 60 Tage in Sekunden
  return { accessToken: data.access_token, expiresIn };
}

async function getMetaInstagramAccountId(
  accessToken: string
): Promise<{ pageId: string; accountId: string; accountName: string; pageAccessToken: string } | null> {
  // Zuerst Facebook-Seiten abrufen
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`
  );
  if (!pagesRes.ok) return null;
  const pagesData = (await pagesRes.json()) as { data: Array<{ id: string; name: string; access_token: string }> };
  if (!pagesData.data || pagesData.data.length === 0) return null;

  const page = pagesData.data[0];
  // Instagram Business Account der Seite abrufen
  const igRes = await fetch(
    `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
  );
  if (!igRes.ok) return null;
  const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
  if (!igData.instagram_business_account) return null;

  return {
    pageId: page.id,
    pageAccessToken: page.access_token, // Page Access Token (für Facebook & Instagram Publishing)
    accountId: igData.instagram_business_account.id,
    accountName: page.name,
  };
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

async function getGoogleBusinessAccount(
  accessToken: string
): Promise<{ accountId: string; accountName: string } | null> {
  const res = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { accounts?: Array<{ name: string; accountName: string }> };
  if (!data.accounts || data.accounts.length === 0) return null;
  const account = data.accounts[0];
  return { accountId: account.name, accountName: account.accountName };
}

async function exchangeTikTokCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; openId: string }> {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: ENV.tiktokClientKey,
      client_secret: ENV.tiktokClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`TikTok token exchange failed: ${res.status}`);
  const data = (await res.json()) as {
    data: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      open_id: string;
    };
  };
  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresIn: data.data.expires_in,
    openId: data.data.open_id,
  };
}

async function getTikTokUserInfo(
  accessToken: string,
  openId: string
): Promise<{ displayName: string } | null> {
  const res = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=display_name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { user?: { display_name?: string } } };
  return { displayName: data.data?.user?.display_name ?? openId };
}

// ─── Token-Refresh ───────────────────────────────────────────────────────────

export async function refreshMarketingToken(
  restaurantId: number,
  platform: "instagram" | "facebook" | "google" | "tiktok"
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(marketingPlatforms)
    .where(
      and(
        eq(marketingPlatforms.restaurantId, restaurantId),
        eq(marketingPlatforms.platform, platform)
      )
    )
    .limit(1);
  if (rows.length === 0 || !rows[0].refreshToken) return false;

  const row = rows[0];
  try {
    if (platform === "google") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          refresh_token: row.refreshToken!,
          grant_type: "refresh_token",
        }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string; expires_in: number };
      await db
        .update(marketingPlatforms)
        .set({
          accessToken: data.access_token,
          tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(marketingPlatforms.id, row.id));
      return true;
    }

    if (platform === "tiktok") {
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: ENV.tiktokClientKey,
          client_secret: ENV.tiktokClientSecret,
          grant_type: "refresh_token",
          refresh_token: row.refreshToken!,
        }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        data: { access_token: string; refresh_token: string; expires_in: number };
      };
      await db
        .update(marketingPlatforms)
        .set({
          accessToken: data.data.access_token,
          refreshToken: data.data.refresh_token,
          tokenExpiresAt: new Date(Date.now() + data.data.expires_in * 1000),
          updatedAt: new Date(),
        })
        .where(eq(marketingPlatforms.id, row.id));
      return true;
    }

    // Meta: Long-lived Token verlängern (60 Tage)
    if (platform === "instagram" || platform === "facebook") {
      const result = await getLongLivedMetaToken(row.accessToken ?? "");
      await db
        .update(marketingPlatforms)
        .set({
          accessToken: result.accessToken,
          tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
          updatedAt: new Date(),
        })
        .where(eq(marketingPlatforms.id, row.id));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ─── Express-Routen ──────────────────────────────────────────────────────────

export function registerMarketingOAuthRoutes(app: Express): void {
  /**
   * GET /api/marketing/oauth/start
   * Startet den OAuth-Flow für eine Plattform.
   * Query-Parameter: platform, restaurantId, origin (Frontend-URL für Callback-Redirect)
   */
  app.get("/api/marketing/oauth/start", async (req: Request, res: Response) => {
    const { platform, restaurantId, origin } = req.query as {
      platform: string;
      restaurantId: string;
      origin: string;
    };

    if (!platform || !restaurantId || !origin) {
      res.status(400).json({ error: "platform, restaurantId und origin sind erforderlich" });
      return;
    }

    const rid = parseInt(restaurantId, 10);
    if (isNaN(rid)) {
      res.status(400).json({ error: "Ungültige restaurantId" });
      return;
    }

    const validPlatforms = ["instagram", "facebook", "google", "tiktok"] as const;
    if (!validPlatforms.includes(platform as (typeof validPlatforms)[number])) {
      res.status(400).json({ error: "Ungültige Plattform" });
      return;
    }

    const state = generateState();
    // Callback-URL zeigt immer auf den Server
    const serverOrigin = origin.replace(/\/$/, "");
    // Meta verwendet eine einheitliche Callback-Route /callback/meta (in Meta-App konfiguriert)
    const callbackPath = (platform === "instagram" || platform === "facebook") ? "meta" : platform;
    const redirectUri = `${serverOrigin}/api/marketing/oauth/callback/${callbackPath}`;

    try {
      await saveState(state, rid, platform as "instagram" | "facebook" | "google" | "tiktok", redirectUri);

      let authUrl: string;
      if (platform === "instagram" || platform === "facebook") {
        authUrl = getMetaAuthUrl(state, redirectUri);
      } else if (platform === "google") {
        authUrl = getGoogleAuthUrl(state, redirectUri);
      } else {
        authUrl = getTikTokAuthUrl(state, redirectUri);
      }

      res.redirect(authUrl);
    } catch (err) {
      console.error("[MarketingOAuth] start error:", err);
      res.status(500).json({ error: "OAuth-Start fehlgeschlagen" });
    }
  });

  /**
   * GET /api/marketing/oauth/callback/:platform
   * Empfängt den Callback von der Plattform nach der Anmeldung.
   */
  // Meta-Callback-Route (für Facebook und Instagram) - /callback/meta ist in Meta-App konfiguriert
  app.get("/api/marketing/oauth/callback/meta", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
    if (error || !code || !state) {
      res.redirect(`/admin/marketing?oauth_error=${encodeURIComponent(error ?? "cancelled")}`);
      return;
    }
    try {
      const stateData = await consumeState(state);
      if (!stateData) { res.redirect("/admin/marketing?oauth_error=invalid_state"); return; }
      const { restaurantId, redirectUri } = stateData;
      const { accessToken: shortToken } = await exchangeMetaCode(code, redirectUri);
      const { accessToken, expiresIn } = await getLongLivedMetaToken(shortToken);
      const expiresMs = (typeof expiresIn === 'number' && isFinite(expiresIn) && expiresIn > 0) ? expiresIn * 1000 : 60 * 24 * 60 * 60 * 1000;
      const tokenExpiresAt = new Date(Date.now() + expiresMs);
      const igAccount = await getMetaInstagramAccountId(accessToken);
      // Instagram: Page Access Token verwenden (nötig für Publishing)
      const igToken = igAccount?.pageAccessToken ?? accessToken;
      await upsertPlatformToken(restaurantId, "instagram", { accessToken: igToken, pageId: igAccount?.pageId, accountId: igAccount?.accountId, accountName: igAccount?.accountName, tokenExpiresAt });
      // Facebook: Page Access Token verwenden
      await upsertPlatformToken(restaurantId, "facebook", { accessToken: igToken, pageId: igAccount?.pageId, accountId: igAccount?.pageId, accountName: igAccount?.accountName, tokenExpiresAt });
      res.redirect("/admin/marketing?oauth_success=instagram,facebook");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[MarketingOAuth] meta callback error:", errMsg);
      res.redirect(`/admin/marketing?oauth_error=${encodeURIComponent(errMsg.substring(0, 200))}`);
    }
  });

  // Generische Callback-Route (für Google und TikTok)
  app.get("/api/marketing/oauth/callback/:platform", async (req: Request, res: Response) => {
    const { platform } = req.params as { platform: string };
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    // Fehler von der Plattform (z.B. Nutzer hat abgebrochen)
    if (error || !code || !state) {
      res.redirect(`/admin/marketing?oauth_error=${encodeURIComponent(error ?? "cancelled")}`);
      return;
    }

    try {
      const stateData = await consumeState(state);
      if (!stateData) {
        res.redirect("/admin/marketing?oauth_error=invalid_state");
        return;
      }

      const { restaurantId, redirectUri } = stateData;

      if (platform === "instagram" || platform === "facebook") {
        // Kurzlebigen Token holen
        const { accessToken: shortToken } = await exchangeMetaCode(code, redirectUri);
        // Langlebigen Token (60 Tage) holen
        const { accessToken, expiresIn } = await getLongLivedMetaToken(shortToken);
        const expiresMs2 = (typeof expiresIn === 'number' && isFinite(expiresIn) && expiresIn > 0) ? expiresIn * 1000 : 60 * 24 * 60 * 60 * 1000;
        const tokenExpiresAt = new Date(Date.now() + expiresMs2);

        // Instagram Business Account-ID abrufen
        const igAccount = await getMetaInstagramAccountId(accessToken);
        // Page Access Token verwenden (nötig für Publishing)
        const pageToken = igAccount?.pageAccessToken ?? accessToken;

        // Instagram-Verbindung speichern
        await upsertPlatformToken(restaurantId, "instagram", {
          accessToken: pageToken,
          pageId: igAccount?.pageId,
          accountId: igAccount?.accountId,
          accountName: igAccount?.accountName,
          tokenExpiresAt,
        });

        // Facebook-Verbindung ebenfalls speichern (gleicher Page Token)
        await upsertPlatformToken(restaurantId, "facebook", {
          accessToken: pageToken,
          pageId: igAccount?.pageId,
          accountId: igAccount?.pageId,
          accountName: igAccount?.accountName,
          tokenExpiresAt,
        });

        res.redirect("/admin/marketing?oauth_success=instagram,facebook");
      } else if (platform === "google") {
        const { accessToken, refreshToken, expiresIn } = await exchangeGoogleCode(code, redirectUri);
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        const account = await getGoogleBusinessAccount(accessToken);

        await upsertPlatformToken(restaurantId, "google", {
          accessToken,
          refreshToken,
          accountId: account?.accountId,
          accountName: account?.accountName,
          tokenExpiresAt,
        });

        res.redirect("/admin/marketing?oauth_success=google");
      } else if (platform === "tiktok") {
        const { accessToken, refreshToken, expiresIn, openId } = await exchangeTikTokCode(
          code,
          redirectUri
        );
        const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        const userInfo = await getTikTokUserInfo(accessToken, openId);

        await upsertPlatformToken(restaurantId, "tiktok", {
          accessToken,
          refreshToken,
          accountId: openId,
          accountName: userInfo?.displayName,
          tokenExpiresAt,
        });

        res.redirect("/admin/marketing?oauth_success=tiktok");
      } else {
        res.redirect("/admin/marketing?oauth_error=unknown_platform");
      }
    } catch (err) {
      console.error(`[MarketingOAuth] callback error (${platform}):`, err);
      res.redirect(`/admin/marketing?oauth_error=token_exchange_failed`);
    }
  });

  /**
   * DELETE /api/marketing/oauth/disconnect
   * Trennt eine Plattform-Verbindung.
   * Body: { restaurantId, platform }
   */
  app.delete("/api/marketing/oauth/disconnect", async (req: Request, res: Response) => {
    const { restaurantId, platform } = req.body as { restaurantId: number; platform: string };
    if (!restaurantId || !platform) {
      res.status(400).json({ error: "restaurantId und platform sind erforderlich" });
      return;
    }
    try {
      const db = await getDb();
      await db
        .update(marketingPlatforms)
        .set({ isActive: false, accessToken: null, refreshToken: null })
        .where(
          and(
            eq(marketingPlatforms.restaurantId, restaurantId),
            eq(marketingPlatforms.platform, platform as "instagram" | "facebook" | "google" | "tiktok")
          )
        );
      res.json({ success: true });
    } catch (err) {
      console.error("[MarketingOAuth] disconnect error:", err);
      res.status(500).json({ error: "Trennen fehlgeschlagen" });
    }
  });
}
