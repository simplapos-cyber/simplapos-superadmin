import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check, PenLine, MapPin, Loader2, AlertCircle } from "lucide-react";

export interface SignatureData {
  dataUrl: string;
  lat?: number;
  lng?: number;
  address?: string;
  timestamp: string; // ISO-8601
}

interface SignaturePadProps {
  onSave: (data: SignatureData) => void;
  onClear?: () => void;
  label?: string;
}

export function SignaturePad({ onSave, onClear, label = "Bitte hier unterschreiben" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saved, setSaved] = useState(false);

  // GPS-State
  const [gpsState, setGpsState] = useState<"idle" | "loading" | "ok" | "denied" | "unavailable">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);

  // GPS beim Laden der Komponente anfordern
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsState("unavailable");
      return;
    }
    setGpsState("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGpsCoords({ lat, lng });
        setGpsState("ok");
        // Reverse-Geocoding via Browser (Nominatim, kein API-Key nötig)
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=de`)
          .then((r) => r.json())
          .then((data) => {
            const addr = data?.display_name;
            if (addr) setGpsAddress(addr);
          })
          .catch(() => {
            // Fallback: nur Koordinaten als Adresse
            setGpsAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState("denied");
        } else {
          setGpsState("unavailable");
        }
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resize() {
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(ratio, ratio);
      padRef.current?.clear();
      setIsEmpty(true);
      setSaved(false);
    }

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "#1a1a2e",
      minWidth: 1.5,
      maxWidth: 3,
    });
    padRef.current = pad;

    pad.addEventListener("beginStroke", () => {
      setIsEmpty(false);
      setSaved(false);
    });

    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
  }, []);

  function handleClear() {
    padRef.current?.clear();
    setIsEmpty(true);
    setSaved(false);
    onClear?.();
  }

  function handleSave() {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataURL("image/png");
    const timestamp = new Date().toISOString();
    onSave({
      dataUrl,
      lat: gpsCoords?.lat,
      lng: gpsCoords?.lng,
      address: gpsAddress ?? undefined,
      timestamp,
    });
    setSaved(true);
  }

  const gpsStatusEl = (() => {
    if (gpsState === "loading") return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Standort wird ermittelt…
      </span>
    );
    if (gpsState === "ok" && gpsCoords) return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <MapPin className="h-3 w-3" />
        {gpsAddress ? (
          <span className="truncate max-w-[220px]" title={gpsAddress}>{gpsAddress}</span>
        ) : (
          `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}`
        )}
      </span>
    );
    if (gpsState === "denied") return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <AlertCircle className="h-3 w-3" />
        Standort verweigert – Koordinaten werden nicht gespeichert
      </span>
    );
    if (gpsState === "unavailable") return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Kein GPS verfügbar
      </span>
    );
    return null;
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
          <PenLine className="h-4 w-4" />
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Löschen
        </Button>
      </div>

      <div
        className={`relative rounded-lg border-2 transition-colors ${
          saved
            ? "border-green-400 bg-green-50/30"
            : isEmpty
            ? "border-dashed border-gray-300 bg-gray-50/50"
            : "border-blue-300 bg-white"
        }`}
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full rounded-md"
          style={{ height: "160px", display: "block", cursor: "crosshair" }}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-muted-foreground/60 select-none">
              Mit Finger oder Maus unterschreiben
            </span>
          </div>
        )}
      </div>

      {/* Unterschriftslinie */}
      <div className="flex items-center gap-2 px-2">
        <div className="flex-1 border-b border-gray-400" />
        <span className="text-[10px] text-muted-foreground">Unterschrift</span>
        <div className="flex-1 border-b border-gray-400" />
      </div>

      {/* GPS-Status */}
      {gpsStatusEl && (
        <div className="px-1">{gpsStatusEl}</div>
      )}

      <Button
        type="button"
        onClick={handleSave}
        disabled={isEmpty || saved}
        className={`w-full transition-all ${
          saved
            ? "bg-green-600 hover:bg-green-600 text-white"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
        size="sm"
      >
        {saved ? (
          <>
            <Check className="h-4 w-4 mr-1.5" />
            Unterschrift gespeichert
          </>
        ) : (
          <>
            <Check className="h-4 w-4 mr-1.5" />
            Unterschrift bestätigen
          </>
        )}
      </Button>
    </div>
  );
}
