/**
 * aiMenuUploadRoute.ts
 * POST /api/ai-import/upload
 * Nimmt eine Speisekarte (PDF oder Bild) entgegen, speichert sie in S3
 * und gibt die öffentliche URL zurück, die dann an den aiImportRouter.analyzeMenu übergeben wird.
 */
import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Nur PDF, JPEG, PNG oder WEBP erlaubt"));
    }
  },
});

export function registerAiMenuUploadRoute(app: ReturnType<typeof Router>) {
  (app as any).post(
    "/api/ai-import/upload",
    async (req: any, res: any, next: any) => {
      try {
        const user = await sdk.authenticateRequest(req as any).catch(() => null);
        if (!user) return res.status(401).json({ error: "Nicht angemeldet" });
        if (!user.restaurantId) return res.status(403).json({ error: "Kein Restaurant zugewiesen" });
        (req as any).user = user;
        next();
      } catch {
        return res.status(401).json({ error: "Nicht angemeldet" });
      }
    },
    upload.single("file"),
    async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Keine Datei hochgeladen" });

        const ext = req.file.mimetype === "application/pdf"
          ? "pdf"
          : req.file.mimetype.split("/")[1] || "jpg";
        const key = `ai-import/${req.user.restaurantId}/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);

        return res.json({
          url,
          key,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
        });
      } catch (err: any) {
        console.error("[AiMenuUpload] Error:", err.message);
        return res.status(500).json({ error: err.message || "Upload fehlgeschlagen" });
      }
    }
  );
}
