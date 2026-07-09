import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerSSERoutes } from "./sseRoutes";
import { registerStripeWebhook } from "../stripeWebhook";
import { handleSubscriptionCheck } from "../subscriptionCron";
import { handleCriticalAlertsCheck } from "../criticalAlertsCron";
import { handleDeviceOfflineCheck } from "../deviceOfflineCron";
import { handleAutoReorder } from "../autoReorderCron";
import { handleDailyClosing } from "../dailyClosingCron";
import { handleDunningCheck } from "../dunningCron";
import { handleDebtorBalanceCheck } from "../debtorBalanceCron";
import { giftCardExpiryReminderHandler } from "../giftCardExpiryReminder";
import { mhdCheckHandler } from "../mhdCheckHandler";
import { handleTuyaPolling } from "../tuyaPollingCron";
import { handleMarketingReport } from "../marketingReportCron";
import { handlePrinterRetry } from "../printerRetryCron";
import { handleDailyBackup } from "../backupCron";
import { registerMarketingOAuthRoutes } from "../marketingOAuth";
import { handleAppleWalletPass, handleGoogleWalletUrl, handleAppleWalletUpdate } from "../loyaltyWallet";
import { handleLoyaltyBirthdayBonus, handleLoyaltyInactivity, handleLoyaltyExpirePoints } from "../loyaltyCron";
import { registerMenuUploadRoute } from "../menuUploadRoute";
import { registerMenuImportRoute } from "../menuImportRoute";
import { registerAudioUploadRoute } from "../audioUploadRoute";
import { registerAiMenuUploadRoute } from "../aiMenuUploadRoute";
import { registerWarehouseQrPdfRoute } from "../warehouseQrPdfRoute";
import { registerReportPdfRoutes } from "../reportPdfRoute";
import { registerMarketingVideoUploadRoute } from "../marketingVideoUploadRoute";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { closeDb, getDb } from "../db";
import { printers, printJobs, restaurants } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { initErrorMonitoring } from "../errorMonitoring";
import { initLocalConnectWsHub } from "../localConnectWsHub";
import { startNativeCrons, stopNativeCrons } from "../nativeCron";

// ─── M3: IP-BASED RATE LIMITER (Login-Endpoint) ─────────────────────────────
// Max. 20 Versuche pro IP in 15 Minuten (grosszügig wegen NAT-Routern)
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Hinter einem Reverse-Proxy (Cloud Run) nutzen wir X-Forwarded-For
  // validate: { trustProxy: false } unterdrückt die Warnung, da trust proxy bewusst gesetzt ist
  validate: { trustProxy: false },
  message: { error: 'Zu viele Anmeldeversuche von dieser IP-Adresse. Bitte in 15 Minuten erneut versuchen.' },
  skip: (req) => {
    // Nur POST-Anfragen an den Login-Endpoint limitieren
    return req.method !== 'POST';
  },
});

// ─── GLOBAL ERROR HANDLERS ─────────────────────────────────────────────────
// Error-Monitoring initialisieren (Owner-Notifications bei kritischen Fehlern)
initErrorMonitoring();

// Prevent unhandled errors from crashing the process (additional handlers below)
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err.message, err.stack);
  // In production, log and continue; don't crash the process
  if (process.env.NODE_ENV === "production") {
    // Give time for logging, then gracefully restart
    setTimeout(() => process.exit(1), 1000);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[ERROR] Unhandled Promise Rejection:", reason);
  // Don't crash - just log it
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] ${signal} received. Graceful shutdown starting...`);

  // Stop native cron jobs
  stopNativeCrons();

  // Close database connections
  try {
    await closeDb();
  } catch (e) {
    console.error("[Server] Error closing DB pool:", e);
  }

  // Stop accepting new connections
  if (httpServer) {
    httpServer.close(() => {
      console.log("[Server] HTTP server closed.");
      process.exit(0);
    });
  }

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─── SERVER SETUP ───────────────────────────────────────────────────────────
let httpServer: ReturnType<typeof createServer>;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // Trust the reverse proxy so req.protocol reflects x-forwarded-proto (HTTPS in production)
  app.set("trust proxy", true);
  const server = createServer(app);
  httpServer = server;
  // WebSocket-Hub für Local Connect initialisieren
  initLocalConnectWsHub(server);
  // Nativen Cron-Service starten (tägliches Backup 03:00 UTC)
  startNativeCrons();

  // ─── HEALTH CHECK (before any middleware) ─────────────────────────────
  app.get("/api/health", async (_req, res) => {
    if (isShuttingDown) {
      return res.status(503).json({ status: "shutting_down" });
    }

    // Erweiterter Health-Check: DB-Verbindung testen
    let dbStatus: "ok" | "error" = "ok";
    let dbLatencyMs: number | null = null;
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (db) {
        const t0 = Date.now();
        await db.execute("SELECT 1");
        dbLatencyMs = Date.now() - t0;
      } else {
        dbStatus = "error";
      }
    } catch {
      dbStatus = "error";
    }

    const mem = process.memoryUsage();
    const memUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const memTotalMb = Math.round(mem.heapTotal / 1024 / 1024);

    const overallStatus = dbStatus === "error" ? "degraded" : "ok";

    res.status(overallStatus === "ok" ? 200 : 503).json({
      status: overallStatus,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      db: { status: dbStatus, latencyMs: dbLatencyMs },
      memory: { usedMb: memUsedMb, totalMb: memTotalMb, usagePercent: Math.round((memUsedMb / memTotalMb) * 100) },
      version: process.env.npm_package_version ?? "unknown",
    });
  });

  // ─── REQUEST TIMEOUT ──────────────────────────────────────────────────
  // ─── M4: HELMET SECURITY HEADERS ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://maps.googleapis.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://*.manus.space", "https://*.manus.computer", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://*.cloudfront.net", "https://simplapos.com"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://*.manus.space", "https://*.manus.computer", "wss://*.manus.computer", "https://maps.googleapis.com",
          // Epson-Drucker im lokalen Netzwerk (HTTP, da Drucker kein HTTPS-Zertifikat hat)
          "http://192.168.*", "http://10.*", "http://172.16.*", "http://172.17.*",
          "http://172.18.*", "http://172.19.*", "http://172.20.*", "http://172.21.*",
          "http://172.22.*", "http://172.23.*", "http://172.24.*", "http://172.25.*",
          "http://172.26.*", "http://172.27.*", "http://172.28.*", "http://172.29.*",
          "http://172.30.*", "http://172.31.*",
        ],
        frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // upgradeInsecureRequests entfernt: Drucker läuft über HTTP im lokalen Netzwerk
      },
    },
    frameguard: { action: 'sameorigin' },
    noSniff: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    dnsPrefetchControl: { allow: false },
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    crossOriginEmbedderPolicy: false,
  }));

  // Prevent hanging requests from consuming resources (Cloud Run has 180s limit)
  app.use((req, res, next) => {
    // Skip timeout for streaming/long-running endpoints
    if (req.path.includes("/api/scheduled/") || req.path.startsWith("/api/sse/")) {
      return next();
    }
    // tRPC-Endpunkte mit LLM-Aufrufen brauchen bis zu 120 Sekunden
    // (Bildanalyse + Social-Media-Text-Generierung + Instagram-Container-Polling)
    const isTrpcEndpoint = req.path.startsWith("/api/trpc");
    const timeoutMs = isTrpcEndpoint ? 120000 : 60000;
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs);
    next();
  });

  // ─── REJECT DURING SHUTDOWN ───────────────────────────────────────────
  app.use((req, res, next) => {
    if (isShuttingDown) {
      return res.status(503).json({ error: "Server is shutting down" });
    }
    next();
  });

  // Stripe webhook MUST be registered BEFORE express.json() for raw body access
  registerStripeWebhook(app);
  // Body parser limit: 10 MB is sufficient for JSON payloads.
  // For file uploads, use storagePut() directly (streaming) instead of base64 in JSON.
  // Cloud Run has 512 MB RAM; 50 MB limit was a risk for OOM under concurrent load.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ─── M3: IP-BASED RATE LIMITING auf Login-Endpoint ─────────────────────
  app.use("/api/trpc/auth.login", loginIpLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerSSERoutes(app);
  registerMenuUploadRoute(app as any);
  registerMenuImportRoute(app as any);
  registerAudioUploadRoute(app as any);
  registerAiMenuUploadRoute(app as any);
  registerWarehouseQrPdfRoute(app as any);
  registerReportPdfRoutes(app as any);
  registerMarketingVideoUploadRoute(app as any);
  // Marketing OAuth-Routen (Login mit Instagram/Facebook/Google/TikTok)
  registerMarketingOAuthRoutes(app);
  // Scheduled cron handlers
  app.post("/api/scheduled/subscription-check", handleSubscriptionCheck);
  app.post("/api/scheduled/critical-alerts", handleCriticalAlertsCheck);
  app.post("/api/scheduled/device-offline-check", handleDeviceOfflineCheck);
  app.post("/api/scheduled/auto-reorder", handleAutoReorder);
  app.post("/api/scheduled/dailyClosing", handleDailyClosing);
  app.post("/api/scheduled/dunning-check", handleDunningCheck);
  app.post("/api/scheduled/debtor-balance-check", handleDebtorBalanceCheck);
  app.post("/api/scheduled/gift-card-expiry-reminder", giftCardExpiryReminderHandler);

  // LOYALTY WALLET ROUTES
  app.get("/api/loyalty/apple-wallet", handleAppleWalletPass);
  app.get("/api/loyalty/google-wallet", handleGoogleWalletUrl);
  app.get("/api/loyalty/apple-wallet-update", handleAppleWalletUpdate);

  // LOYALTY CRON HANDLERS
  app.post("/api/scheduled/loyalty-birthday-bonus", handleLoyaltyBirthdayBonus);
  app.post("/api/scheduled/loyalty-inactivity", handleLoyaltyInactivity);
  app.post("/api/scheduled/loyalty-expire-points", handleLoyaltyExpirePoints);
  app.post("/api/scheduled/mhd-check", mhdCheckHandler);
  app.post("/api/scheduled/tuyaPolling", handleTuyaPolling);
  app.post("/api/scheduled/marketing-weekly-report", handleMarketingReport as unknown as import("express").RequestHandler);
  app.post("/api/scheduled/customer-marketing", handleMarketingReport as unknown as import("express").RequestHandler);
  app.post("/api/scheduled/printer-retry", handlePrinterRetry as unknown as import("express").RequestHandler);
  app.post("/api/scheduled/daily-backup", handleDailyBackup as unknown as import("express").RequestHandler);

  // ─── NETWORK MONITORING ENDPOINTS ─────────────────────────────────────
  // Minimal ping endpoint for latency measurement (no auth, no body parsing overhead)
  app.get("/api/network/ping", (_req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Connection", "keep-alive");
    res.json({ t: Date.now() });
  });

  // Speed test endpoint: returns a payload of specified size for download measurement
  app.get("/api/network/speed-test", (req, res) => {
    // Size in KB (default 100KB, max 500KB to avoid abuse)
    const sizeKB = Math.min(Math.max(parseInt(req.query.size as string) || 100, 10), 500);
    const payload = Buffer.alloc(sizeKB * 1024, "x");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Length", String(payload.length));
    res.set("X-Payload-Size", String(payload.length));
    res.send(payload);
  });

  // ─── PRINT AGENT API (Token-basiert, kein Cookie/Session) ──────────────
  app.get("/api/print-agent/poll", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      // Token = base64(restaurantId:secret) – einfach aber sicher genug
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [restaurantIdStr, secret] = decoded.split(":");
      const restaurantId = parseInt(restaurantIdStr);
      if (!restaurantId || !secret) return res.status(401).json({ error: "Invalid token" });
      // Verify token against DB (secret must match)
      const db = await getDb();
      const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!restaurant) return res.status(401).json({ error: "Invalid token" });
      if ((restaurant as any).printAgentSecret !== secret) return res.status(401).json({ error: "Invalid token" });
      // Update Print-Agent last seen timestamp (Heartbeat)
      await db.update(restaurants).set({ printAgentLastSeenAt: new Date() } as any).where(eq(restaurants.id, restaurantId));
      // Fetch pending print jobs for this restaurant
      const jobs = await db.select().from(printJobs)
        .where(and(eq(printJobs.restaurantId, restaurantId), eq(printJobs.status, "pending")))
        .orderBy(printJobs.createdAt)
        .limit(10);
      // Also fetch printer info for each job
      const printerIds = Array.from(new Set(jobs.map((j: any) => j.printerId))) as number[];
      let printerMap: Record<number, any> = {};
      if (printerIds.length > 0) {
        const printerList = await db.select().from(printers).where(inArray(printers.id, printerIds));
        printerMap = Object.fromEntries(printerList.map((p: any) => [p.id, p]));
      }
      const result = jobs.map((j: any) => ({
        id: j.id,
        jobType: j.jobType,
        payload: j.payload,
        printer: printerMap[j.printerId] ? {
          ip: printerMap[j.printerId].ipAddress,
          port: printerMap[j.printerId].port || 8008,
          name: printerMap[j.printerId].name,
          paperWidth: printerMap[j.printerId].paperWidth,
          autoCut: printerMap[j.printerId].autoCut,
        } : null,
        createdAt: j.createdAt,
      }));
      res.json({ jobs: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/print-agent/ack", express.json(), async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [restaurantIdStr, secret] = decoded.split(":");
      const restaurantId = parseInt(restaurantIdStr);
      if (!restaurantId || !secret) return res.status(401).json({ error: "Invalid token" });
      const { jobId, status, errorMessage } = req.body;
      if (!jobId || !status) return res.status(400).json({ error: "jobId and status required" });
      const db = await getDb();
      // Verify secret
      const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!restaurant || (restaurant as any).printAgentSecret !== secret) return res.status(401).json({ error: "Invalid token" });
      await db.update(printJobs)
        .set({
          status: status as "printed" | "failed",
          errorMessage: errorMessage || null,
          printedAt: status === "printed" ? new Date() : undefined,
        })
        .where(and(eq(printJobs.id, jobId), eq(printJobs.restaurantId, restaurantId)));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── PRINT-AGENT: Server-side print (avoids Mixed Content) ────────────
  // The Print-Agent calls this endpoint, and the SERVER sends the ePOS-XML
  // to the printer via HTTP (server-to-printer, no browser restrictions)
  app.post("/api/print-agent/print", express.json(), async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(401).json({ error: "Token required" });
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [restaurantIdStr, secret] = decoded.split(":");
      const restaurantId = parseInt(restaurantIdStr);
      if (!restaurantId || !secret) return res.status(401).json({ error: "Invalid token" });
      const db = await getDb();
      const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!restaurant || (restaurant as any).printAgentSecret !== secret) return res.status(401).json({ error: "Invalid token" });

      const { jobId, printerIp, port, xmlContent } = req.body;
      if (!printerIp || !xmlContent) return res.status(400).json({ error: "printerIp and xmlContent required" });

      const printerPort = port || 8008;
      const printerUrl = `http://${printerIp}:${printerPort}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

      const soapBody = '<?xml version="1.0" encoding="utf-8"?>' +
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
        '<s:Body>' + xmlContent + '</s:Body></s:Envelope>';

      // Server-side HTTP request to the printer
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const printerRes = await fetch(printerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': '""',
          },
          body: soapBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const responseText = await printerRes.text();
        const success = responseText.includes('success="true"');

        // Update job status
        if (jobId) {
          await db.update(printJobs)
            .set({
              status: success ? "printed" : "failed",
              errorMessage: success ? null : `Drucker-Antwort: ${responseText.substring(0, 200)}`,
              printedAt: success ? new Date() : undefined,
            })
            .where(and(eq(printJobs.id, jobId), eq(printJobs.restaurantId, restaurantId)));
        }

        res.json({ success, response: responseText.substring(0, 500) });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        const errMsg = fetchErr.name === 'AbortError' ? 'Timeout – Drucker antwortet nicht' : fetchErr.message;

        if (jobId) {
          await db.update(printJobs)
            .set({ status: "failed", errorMessage: errMsg })
            .where(and(eq(printJobs.id, jobId), eq(printJobs.restaurantId, restaurantId)));
        }

        res.json({ success: false, error: errMsg });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── tRPC API with error handling ─────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        // Log server errors but don't crash
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC Error] ${path}:`, error.message);
        }
      },
    })
  );

  // ─── GLOBAL EXPRESS ERROR HANDLER ─────────────────────────────────────
  // Catches any unhandled errors in middleware/routes
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Express Error]", err.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Set server timeouts
  server.keepAliveTimeout = 65000; // Slightly higher than Cloud Run's 60s
  server.headersTimeout = 66000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
