import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";

const execFileAsync = promisify(execFile);

// ffmpeg-static Binary-Pfad (createRequire für ES-Modul-Kompatibilität)
const _require = createRequire(import.meta.url);
const ffmpegPath: string = _require("ffmpeg-static");

/**
 * Extrahiert 3 JPEG-Frames aus einem Video-Buffer:
 * - Frame 1: bei 10% der Video-Länge (nach Logo/Intro)
 * - Frame 2: bei 50% der Video-Länge (Mitte)
 * - Frame 3: bei 85% der Video-Länge (gegen Ende)
 *
 * @returns Array von Base64-JPEG-Strings (max. 3 Elemente)
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  mimeType: string
): Promise<string[]> {
  const tmpDir = os.tmpdir();
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : mimeType.includes("quicktime") || mimeType.includes("mov") ? "mov" : "mp4";
  const videoPath = path.join(tmpDir, `video_${Date.now()}.${ext}`);
  const framePaths: string[] = [];
  console.log(`[VideoFrameExtractor] Start: mimeType=${mimeType}, bufferSize=${videoBuffer.length}, ffmpegPath=${ffmpegPath}`);
  try {
    // Video temporär speichern
    fs.writeFileSync(videoPath, videoBuffer);
    console.log(`[VideoFrameExtractor] Video gespeichert: ${videoPath}`);

    // Video-Dauer ermitteln
    let duration = 10; // Fallback: 10 Sekunden
    try {
      const { stdout } = await execFileAsync(ffmpegPath, [
        "-i", videoPath,
        "-f", "null",
        "-"
      ], { timeout: 30000 }).catch((e: { stderr?: string }) => ({ stdout: "", stderr: e.stderr || "" })) as { stdout: string; stderr?: string };
      const durationMatch = (stdout + "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!durationMatch) {
        // Versuche stderr
        const probeResult = await execFileAsync(ffmpegPath, ["-i", videoPath], { timeout: 10000 }).catch((e: { stderr?: string }) => ({ stdout: "", stderr: e.stderr || "" })) as { stdout: string; stderr?: string };
        const match = ((probeResult as { stderr?: string }).stderr || "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        }
      } else {
        duration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
      }
    } catch {
      // Fallback-Dauer verwenden
    }

    // 3 Zeitpunkte berechnen
    const times = [
      Math.max(0.5, duration * 0.10),
      duration * 0.50,
      duration * 0.85,
    ];
    console.log(`[VideoFrameExtractor] Dauer: ${duration}s, Zeitpunkte: ${times.map(t => t.toFixed(1)).join(', ')}s`);

    // Frames extrahieren
    const framePromises = times.map(async (t, i) => {
      const framePath = path.join(tmpDir, `frame_${Date.now()}_${i}.jpg`);
      framePaths.push(framePath);
      try {
        await execFileAsync(ffmpegPath, [
          "-ss", t.toFixed(2),
          "-i", videoPath,
          "-vframes", "1",
          "-vf", "scale=960:-1",
          "-q:v", "3",
          "-y",
          framePath,
        ], { timeout: 30000 });
        if (fs.existsSync(framePath)) {
          const frameBuffer = fs.readFileSync(framePath);
          const b64 = frameBuffer.toString("base64");
          console.log(`[VideoFrameExtractor] Frame ${i+1} OK: ${framePath} (${frameBuffer.length} bytes)`);
          return b64;
        } else {
          console.error(`[VideoFrameExtractor] Frame ${i+1} FEHLT: ${framePath}`);
        }
      } catch (e: any) {
        console.error(`[VideoFrameExtractor] Frame ${i+1} FEHLER: ${e.message}`);
      }
      return null;
    });

    const results = await Promise.all(framePromises);
    const filtered = results.filter((r): r is string => r !== null && r.length > 0);
    console.log(`[VideoFrameExtractor] Fertig: ${filtered.length}/${times.length} Frames extrahiert`);
    return filtered;
  } finally {
    // Temporäre Dateien aufräumen
    try { fs.unlinkSync(videoPath); } catch { /* ignore */ }
    for (const fp of framePaths) {
      try { fs.unlinkSync(fp); } catch { /* ignore */ }
    }
  }
}
