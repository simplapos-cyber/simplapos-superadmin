/**
 * useSoundAlert – Hook für Soundalarme bei neuen Bestellungen
 *
 * Nutzt die Web Audio API (kein externes Asset nötig) um einen
 * kurzen, angenehmen Alarmton zu erzeugen.
 *
 * Features:
 * - Kein externes Audio-File benötigt (synthetisierter Ton)
 * - Konfigurierbar: an/aus, Lautstärke
 * - Einstellungen werden in localStorage gespeichert
 * - Respektiert prefers-reduced-motion (kein Ton bei Accessibility-Einstellungen)
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SoundAlertVariant = "kitchen" | "bar";

const STORAGE_KEY_PREFIX = "simplapos_sound_";

interface UseSoundAlertOptions {
  variant: SoundAlertVariant;
  defaultEnabled?: boolean;
  defaultVolume?: number; // 0–1
}

interface UseSoundAlertReturn {
  enabled: boolean;
  volume: number;
  setEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  playAlert: () => void;
}

/**
 * Erzeugt einen synthetischen Alarmton via Web Audio API.
 * Küche: tieferer, markanter Doppelton
 * Bar: hellerer, kurzer Einzelton
 */
function playSyntheticAlert(
  variant: SoundAlertVariant,
  volume: number,
  audioCtxRef: React.MutableRefObject<AudioContext | null>
) {
  try {
    // AudioContext lazy initialisieren (Browser-Autoplay-Policy)
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);

    if (variant === "kitchen") {
      // Küche: Doppelton 880Hz → 660Hz, je 120ms
      const tones = [880, 660];
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.15;
        const end = start + 0.12;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(volume * 0.7, start + 0.01);
        g.gain.linearRampToValueAtTime(0, end);
        osc.start(start);
        osc.stop(end + 0.01);
      });
    } else {
      // Bar: heller Einzelton 1100Hz, 80ms
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 1100;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(volume * 0.6, now + 0.01);
      g.gain.linearRampToValueAtTime(0, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  } catch {
    // Web Audio API nicht verfügbar – still ignorieren
  }
}

export function useSoundAlert({
  variant,
  defaultEnabled = true,
  defaultVolume = 0.7,
}: UseSoundAlertOptions): UseSoundAlertReturn {
  const enabledKey = `${STORAGE_KEY_PREFIX}${variant}_enabled`;
  const volumeKey = `${STORAGE_KEY_PREFIX}${variant}_volume`;

  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(enabledKey);
      return stored !== null ? stored === "true" : defaultEnabled;
    } catch {
      return defaultEnabled;
    }
  });

  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(volumeKey);
      return stored !== null ? parseFloat(stored) : defaultVolume;
    } catch {
      return defaultVolume;
    }
  });

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(enabledKey, String(v)); } catch { /* ignore */ }
  }, [enabledKey]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    try { localStorage.setItem(volumeKey, String(clamped)); } catch { /* ignore */ }
  }, [volumeKey]);

  const playAlert = useCallback(() => {
    if (!enabled) return;
    // Accessibility: kein Ton bei prefers-reduced-motion
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    playSyntheticAlert(variant, volume, audioCtxRef);
  }, [enabled, volume, variant]);

  return { enabled, volume, setEnabled, setVolume, playAlert };
}
