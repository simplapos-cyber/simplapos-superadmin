import { Router } from "express";
import multer from "multer";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB – Whisper limit
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-m4a"];
    if (allowed.some(m => file.mimetype.startsWith(m)) || file.originalname.match(/\.(webm|mp4|m4a|mp3|wav|ogg)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Nur Audio-Dateien erlaubt (webm, mp4, m4a, mp3, wav, ogg)"));
    }
  },
});

function getFileExtension(mimetype: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/x-m4a": "m4a",
  };
  return map[mimetype] || "webm";
}

export function registerAudioUploadRoute(app: ReturnType<typeof Router>) {
  // POST /api/upload-audio
  // Accepts: multipart/form-data with field "file" (audio)
  // Returns: { transcription: string } — transcribes directly via Whisper, no S3 roundtrip
  (app as any).post(
    "/api/upload-audio",
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
    upload.single("file"),
    async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Keine Audio-Datei hochgeladen" });

        const ext = getFileExtension(req.file.mimetype || "audio/webm");
        const filename = `audio.${ext}`;
        const mimeType = req.file.mimetype || "audio/webm";

        // Build FormData for Whisper API
        const formData = new FormData();
        const audioBlob = new Blob([new Uint8Array(req.file.buffer)], { type: mimeType });
        formData.append("file", audioBlob, filename);
        formData.append("model", "whisper-1");
        formData.append("response_format", "json");
        formData.append("prompt", "Restaurantbestellung auf Deutsch. Tischnummer und Speisen mit Mengen.");

        const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
        const whisperUrl = `${forgeUrl}/v1/audio/transcriptions`;

        const whisperResp = await fetch(whisperUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.forgeApiKey}`,
            "Accept-Encoding": "identity",
          },
          body: formData,
        });

        if (!whisperResp.ok) {
          const errText = await whisperResp.text().catch(() => "");
          console.error("[AudioUpload] Whisper error:", whisperResp.status, errText);
          return res.status(500).json({ error: "Spracherkennung fehlgeschlagen. Bitte erneut versuchen." });
        }

        const result = await whisperResp.json() as { text?: string };
        const transcription = result?.text?.trim() ?? "";

        if (!transcription) {
          return res.status(400).json({ error: "Keine Sprache erkannt. Bitte deutlicher sprechen." });
        }

        return res.json({ transcription });
      } catch (err: any) {
        console.error("[AudioUpload] Error:", err.message);
        return res.status(500).json({ error: err.message || "Upload fehlgeschlagen" });
      }
    }
  );
}
