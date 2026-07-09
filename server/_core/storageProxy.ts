import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      // 1. Hole signierte URL vom Forge-Backend
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      // 2. Lade Datei direkt von CloudFront und streame sie zum Client
      // (kein Redirect, damit der Browser nie die ablaufende CloudFront-URL sieht)
      const fileResp = await fetch(url);
      if (!fileResp.ok) {
        console.error(`[StorageProxy] CloudFront error: ${fileResp.status}`);
        res.status(502).send("Storage fetch error");
        return;
      }

      // Content-Type und Cache-Control setzen
      const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "public, max-age=3600"); // 1 Stunde cachen

      // Datei streamen
      const buffer = await fileResp.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
