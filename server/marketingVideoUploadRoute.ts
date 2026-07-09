/**
 * marketingVideoUploadRoute.ts
 *
 * POST /api/marketing/upload-video
 * Accepts: multipart/form-data mit Feld "video" (max 200 MB)
 * Returns: { videoKey, videoUrl, thumbnailsBase64: string[] }
 *
 * Workflow:
 * 1. Video per Multipart empfangen (kein Base64 → kein JSON-Limit-Problem)
 * 2. Video in Storage hochladen
 * 3. 3 Frames mit ffmpeg extrahieren (10%, 50%, 85%)
 * 4. Frames als Base64 zurückgeben für KI-Analyse
 */

import { Router } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { storagePut, storageGetSignedUrl } from "./storage";
import { extractVideoFrames } from "./videoFrameExtractor";

// Validiert ob ein Base64-String ein gültiges JPEG ist (Magic Bytes: FF D8 FF)
function isValidJpegBase64(b64: string): boolean {
  if (!b64 || b64.length < 8) return false;
  try {
    const bytes = Buffer.from(b64.substring(0, 8), "base64");
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  } catch { return false; }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg"];
    if (allowed.some(m => file.mimetype.startsWith(m)) || file.originalname.match(/\.(mp4|mov|webm|avi|mpeg|mpg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Nur Video-Dateien erlaubt (mp4, mov, webm)"));
    }
  },
});

export function registerMarketingVideoUploadRoute(app: ReturnType<typeof Router>) {
  (app as any).post(
    "/api/marketing/upload-video",
    async (req: any, res: any, next: any) => {
      try {
        const user = await sdk.authenticateRequest(req as any).catch(() => null);
        if (!user) return res.status(401).json({ error: "Nicht angemeldet" });
        (req as any).user = user;
        next();
      } catch {
        return res.status(401).json({ error: "Nicht angemeldet" });
      }
    },
    upload.single("video"),
    async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Kein Video hochgeladen" });

        const mimeType = req.file.mimetype || "video/mp4";
        const ext = mimeType.includes("mp4") ? "mp4"
          : mimeType.includes("quicktime") || mimeType.includes("mov") ? "mov"
          : mimeType.includes("webm") ? "webm"
          : "mp4";

        // 1. Video in Storage hochladen
        const restaurantId = (req as any).user?.restaurantId ?? "unknown";
        const fileName = `marketing/${restaurantId}/${Date.now()}.${ext}`;
        const { key: videoKey, url: videoUrl } = await storagePut(fileName, req.file.buffer, mimeType);

        // 2. Frames mit ffmpeg extrahieren und validieren
        let thumbnailsBase64: string[] = [];
        let videoSignedUrl: string | undefined;
        try {
          const rawFrames = await extractVideoFrames(req.file.buffer, mimeType);
          // Nur gültige JPEGs akzeptieren
          thumbnailsBase64 = rawFrames.filter(isValidJpegBase64);
          console.log(`[MarketingVideo] ${thumbnailsBase64.length}/${rawFrames.length} gültige Frames extrahiert für ${fileName}`);
        } catch (err) {
          console.error("[MarketingVideo] Frame-Extraktion fehlgeschlagen:", err);
        }

        // Wenn keine gültigen Frames: signierte URL holen damit Claude das Video direkt analysieren kann
        if (thumbnailsBase64.length === 0) {
          try {
            videoSignedUrl = await storageGetSignedUrl(videoKey);
            console.log(`[MarketingVideo] Signierte URL als Fallback: ${videoSignedUrl?.substring(0, 60)}...`);
          } catch (err) {
            console.error("[MarketingVideo] Signierte URL fehlgeschlagen:", err);
          }
        }

        return res.json({ videoKey, videoUrl, thumbnailsBase64, videoSignedUrl, mimeType });
      } catch (err: any) {
        console.error("[MarketingVideo] Upload-Fehler:", err.message);
        return res.status(500).json({ error: err.message || "Video-Upload fehlgeschlagen" });
      }
    }
  );
}
