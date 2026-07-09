import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { sdk } from "./_core/sdk";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Nur Bilder erlaubt (jpeg, png, webp, gif)"));
    }
  },
});

export function registerMenuUploadRoute(app: ReturnType<typeof Router>) {
  // POST /api/menu/upload-image
  // Requires: multipart/form-data with field "image"
  // Returns: { url: "/manus-storage/..." }
  (app as any).post(
    "/api/menu/upload-image",
    async (req: any, res: any, next: any) => {
      // Auth check via session cookie
      try {
        const user = await sdk.authenticateRequest(req as any).catch(() => null);
        if (!user) return res.status(401).json({ error: "Nicht angemeldet" });
        if (user.role !== "admin" && user.role !== "superadmin") {
          return res.status(403).json({ error: "Keine Berechtigung" });
        }
        (req as any).user = user;
        next();
      } catch {
        return res.status(401).json({ error: "Nicht angemeldet" });
      }
    },
    upload.single("image"),
    async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Kein Bild hochgeladen" });
        const ext = req.file.mimetype.split("/")[1] || "jpg";
        const key = `menu-items/${Date.now()}.${ext}`;
        const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
        return res.json({ url });
      } catch (err: any) {
        console.error("[MenuUpload] Error:", err.message);
        return res.status(500).json({ error: err.message || "Upload fehlgeschlagen" });
      }
    }
  );
}
