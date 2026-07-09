/**
 * Loyalty Wallet Integration
 * - Apple Wallet: PKPass (passkit-generator) – requires Apple Developer certificate
 * - Google Wallet: JWT-signed pass URL (google-auth-library)
 *
 * Apple Wallet requires:
 *   APPLE_PASS_CERT_PEM   – Pass Type ID certificate (PEM)
 *   APPLE_PASS_KEY_PEM    – Private key (PEM)
 *   APPLE_PASS_TYPE_ID    – e.g. pass.com.simplapos.loyalty
 *   APPLE_TEAM_ID         – 10-char Apple Team ID
 *
 * Google Wallet requires:
 *   GOOGLE_WALLET_ISSUER_ID    – Issuer ID from Google Pay & Wallet Console
 *   GOOGLE_WALLET_KEY_JSON     – Service account JSON (stringified)
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import { loyaltyCustomers, loyaltyPrograms, restaurants } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import QRCode from "qrcode";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getCustomerData(token: string) {
  const db = await getDb();
  if (!db) return null;
  const [customer] = await db.select().from(loyaltyCustomers).where(eq(loyaltyCustomers.token, token));
  if (!customer) return null;
  const [program] = await db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.restaurantId, customer.restaurantId));
  const [restaurant] = await db.select({ name: restaurants.name, logoUrl: restaurants.logoUrl }).from(restaurants).where(eq(restaurants.id, customer.restaurantId));
  return { customer, program, restaurant };
}

function tierLabel(tier: string) {
  const map: Record<string, string> = { bronze: "Bronze", silver: "Silber", gold: "Gold", platinum: "Platin" };
  return map[tier] ?? tier;
}

// ── Apple Wallet ──────────────────────────────────────────────────────────────

export async function handleAppleWalletPass(req: Request, res: Response) {
  const token = req.query.token as string;
  if (!token) return res.status(400).json({ error: "Missing token" });

  const data = await getCustomerData(token);
  if (!data) return res.status(404).json({ error: "Not found" });

  const { customer, program, restaurant } = data;

  // Check if Apple credentials are configured
  const certPem = process.env.APPLE_PASS_CERT_PEM;
  const keyPem = process.env.APPLE_PASS_KEY_PEM;
  const passTypeId = process.env.APPLE_PASS_TYPE_ID;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!certPem || !keyPem || !passTypeId || !teamId) {
    // Return a helpful HTML page explaining setup requirements
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="de">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Apple Wallet</title>
      <style>body{font-family:-apple-system,sans-serif;max-width:400px;margin:40px auto;padding:20px;text-align:center}
      .icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:8px}
      .desc{color:#666;font-size:14px;line-height:1.5}.card{background:#f5f5f7;border-radius:12px;padding:20px;margin-top:20px;text-align:left}
      .step{font-size:13px;margin:8px 0;color:#333}</style></head>
      <body>
        <div class="icon">🍎</div>
        <div class="title">Apple Wallet Setup erforderlich</div>
        <div class="desc">Um Apple Wallet-Karten zu generieren, benötigst du ein Apple Developer-Zertifikat.</div>
        <div class="card">
          <strong style="font-size:13px">Einrichtung (einmalig):</strong>
          <div class="step">1. Apple Developer Account (99 USD/Jahr)</div>
          <div class="step">2. Pass Type ID erstellen: <code>${passTypeId ?? "pass.com.deinrestaurant.loyalty"}</code></div>
          <div class="step">3. Zertifikat exportieren (PEM-Format)</div>
          <div class="step">4. Umgebungsvariablen setzen:<br><code>APPLE_PASS_CERT_PEM</code><br><code>APPLE_PASS_KEY_PEM</code><br><code>APPLE_PASS_TYPE_ID</code><br><code>APPLE_TEAM_ID</code></div>
        </div>
        <p style="font-size:12px;color:#999;margin-top:20px">Deine Treuekarte: ${customer.firstName} ${customer.lastName ?? ""} · ${customer.totalPoints} Punkte</p>
      </body></html>
    `);
  }

  try {
    const { PKPass } = await import("passkit-generator");

    const qrDataUrl = await QRCode.toDataURL(
      `${req.protocol}://${req.get("host")}/loyalty/${token}`,
      { width: 200, margin: 1 }
    );
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");

    const primaryColor = (program as any)?.primaryColor ?? "#7c3aed";

    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      serialNumber: `loyalty-${customer.id}`,
      teamIdentifier: teamId,
      organizationName: restaurant?.name ?? "SimplaPOS",
      description: "Treuekarte",
      logoText: restaurant?.name ?? "Treuepunkte",
      foregroundColor: "rgb(255,255,255)",
      backgroundColor: `rgb(${parseInt(primaryColor.slice(1,3),16)},${parseInt(primaryColor.slice(3,5),16)},${parseInt(primaryColor.slice(5,7),16)})`,
      storeCard: {
        primaryFields: [{ key: "balance", label: "Punkte", value: customer.totalPoints.toString() }],
        secondaryFields: [
          { key: "tier", label: "Stufe", value: tierLabel(customer.tier) },
          { key: "name", label: "Name", value: `${customer.firstName} ${customer.lastName ?? ""}`.trim() },
        ],
        auxiliaryFields: [{ key: "lifetime", label: "Gesammelt", value: customer.lifetimePoints.toString() }],
        backFields: [
          { key: "info", label: "Über das Programm", value: `${(program as any)?.pointsPerChf ?? 1} Punkte pro CHF · ${(program as any)?.pointsPerRedemptionChf ?? 100} Punkte = CHF 1.00` },
          { key: "privacy", label: "Datenschutz", value: "Deine Daten werden ausschliesslich für das Treueprogramm verwendet. Löschung jederzeit möglich." },
        ],
      },
      barcode: { message: token, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1" },
      webServiceURL: `${req.protocol}://${req.get("host")}/api/loyalty/apple-wallet-update`,
      authenticationToken: token,
    };

    // Write pass files to temp directory
    const os = await import("os");
    const path = await import("path");
    const fs = await import("fs/promises");
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pkpass-"));
    await fs.writeFile(path.join(tmpDir, "pass.json"), JSON.stringify(passJson));
    await fs.writeFile(path.join(tmpDir, "icon.png"), qrBuffer);
    await fs.writeFile(path.join(tmpDir, "icon@2x.png"), qrBuffer);
    await fs.writeFile(path.join(tmpDir, "logo.png"), qrBuffer);
    await fs.writeFile(path.join(tmpDir, "logo@2x.png"), qrBuffer);
    await fs.writeFile(path.join(tmpDir, "strip.png"), qrBuffer);

    const pass = await PKPass.from({
      model: tmpDir,
      certificates: {
        wwdr: Buffer.from(certPem),
        signerCert: Buffer.from(certPem),
        signerKey: Buffer.from(keyPem),
      },
    });

    const buffer = pass.getAsBuffer();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `attachment; filename="treuekarte-${customer.id}.pkpass"`);
    res.send(buffer);
  } catch (err: any) {
    console.error("[Apple Wallet]", err.message);
    res.status(500).json({ error: "Pass generation failed", detail: err.message });
  }
}

// ── Google Wallet ─────────────────────────────────────────────────────────────

export async function handleGoogleWalletUrl(req: Request, res: Response) {
  const token = req.query.token as string;
  if (!token) return res.status(400).json({ error: "Missing token" });

  const data = await getCustomerData(token);
  if (!data) return res.status(404).json({ error: "Not found" });

  const { customer, program, restaurant } = data;

  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const keyJson = process.env.GOOGLE_WALLET_KEY_JSON;

  if (!issuerId || !keyJson) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="de">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Google Wallet</title>
      <style>body{font-family:-apple-system,sans-serif;max-width:400px;margin:40px auto;padding:20px;text-align:center}
      .icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:8px}
      .desc{color:#666;font-size:14px;line-height:1.5}.card{background:#f5f5f7;border-radius:12px;padding:20px;margin-top:20px;text-align:left}
      .step{font-size:13px;margin:8px 0;color:#333}</style></head>
      <body>
        <div class="icon">🔵</div>
        <div class="title">Google Wallet Setup erforderlich</div>
        <div class="desc">Um Google Wallet-Karten zu generieren, benötigst du einen Google Cloud Service Account.</div>
        <div class="card">
          <strong style="font-size:13px">Einrichtung (einmalig, kostenlos):</strong>
          <div class="step">1. Google Cloud Projekt erstellen</div>
          <div class="step">2. Google Wallet API aktivieren</div>
          <div class="step">3. Service Account erstellen + JSON-Key herunterladen</div>
          <div class="step">4. Issuer ID aus Google Pay & Wallet Console</div>
          <div class="step">5. Umgebungsvariablen setzen:<br><code>GOOGLE_WALLET_ISSUER_ID</code><br><code>GOOGLE_WALLET_KEY_JSON</code></div>
        </div>
        <p style="font-size:12px;color:#999;margin-top:20px">Deine Treuekarte: ${customer.firstName} ${customer.lastName ?? ""} · ${customer.totalPoints} Punkte</p>
      </body></html>
    `);
  }

  try {
    const { GoogleAuth } = await import("google-auth-library");
    const primaryColor = (program as any)?.primaryColor ?? "#7c3aed";
    const classId = `${issuerId}.loyalty_${customer.restaurantId}`;
    const objectId = `${issuerId}.loyalty_customer_${customer.id}`;

    const loyaltyObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      accountId: customer.email,
      accountName: `${customer.firstName} ${customer.lastName ?? ""}`.trim(),
      loyaltyPoints: {
        balance: { int: customer.totalPoints },
        label: "Punkte",
      },
      secondaryLoyaltyPoints: {
        balance: { int: customer.lifetimePoints },
        label: "Gesammelt",
      },
      barcode: {
        type: "QR_CODE",
        value: token,
        alternateText: `${customer.totalPoints} Punkte`,
      },
      textModulesData: [
        { header: "Stufe", body: tierLabel(customer.tier), id: "tier" },
        { header: "Programm", body: `${(program as any)?.pointsPerChf ?? 1} Punkte pro CHF`, id: "rate" },
      ],
      hexBackgroundColor: primaryColor,
    };

    const credentials = JSON.parse(keyJson);
    const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"] });
    const client = await auth.getClient();

    const claims = {
      iss: credentials.client_email,
      aud: "google",
      origins: [req.get("host") ?? ""],
      typ: "savetowallet",
      payload: { loyaltyObjects: [loyaltyObject] },
    };

    const token_signed = await (client as any).sign(JSON.stringify(claims));
    const saveUrl = `https://pay.google.com/gp/v/save/${token_signed}`;
    res.redirect(saveUrl);
  } catch (err: any) {
    console.error("[Google Wallet]", err.message);
    res.status(500).json({ error: "Google Wallet URL generation failed", detail: err.message });
  }
}

// ── Apple Wallet Update Webhook (für Push-Updates) ────────────────────────────

export async function handleAppleWalletUpdate(req: Request, res: Response) {
  // Simplified: return 200 to acknowledge
  res.status(200).json({ lastUpdated: new Date().toISOString() });
}
