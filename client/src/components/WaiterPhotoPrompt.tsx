/**
 * WaiterPhotoPrompt.tsx
 *
 * Vollbild-Overlay das dem Kellner anzeigt, wenn die KI ein Foto für Social Media empfiehlt.
 * - Zeigt KI-Begründung und Relevanz-Score
 * - Öffnet Kamera direkt (mobile-first)
 * - Wenn Admin "Zwang-Modus" aktiviert hat: kein Schliessen-Button
 * - Bild wird hochgeladen, KI analysiert es und erstellt Post
 */

import { useState, useRef, useCallback } from "react";
import { Camera, X, Zap, Star, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface WaiterPhotoPromptProps {
  requestId?: number;
  productName: string;
  reason: string;
  aiScore: number;
  forced: boolean; // Wenn true: Kellner kann nicht überspringen
  onComplete: () => void;
  onSkip?: () => void;
}

export function WaiterPhotoPrompt({
  requestId,
  productName,
  reason,
  aiScore,
  forced,
  onComplete,
  onSkip,
}: WaiterPhotoPromptProps) {
  const [phase, setPhase] = useState<"prompt" | "camera" | "preview" | "uploading" | "done">("prompt");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedMime, setCapturedMime] = useState("image/jpeg");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitPhoto = trpc.marketing.submitWaiterPhoto.useMutation({
    onSuccess: () => {
      setPhase("done");
      toast.success("Super! Post wird vorbereitet und zur Freigabe gesendet.");
      setTimeout(onComplete, 2000);
    },
    onError: (err) => {
      toast.error(`Fehler: ${err.message}`);
      setPhase("preview");
    },
  });

  const skipPhoto = trpc.marketing.skipPhotoRequest.useMutation({
    onSuccess: () => {
      toast.info("Foto übersprungen");
      onSkip?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const startCamera = useCallback(async () => {
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      // Kamera nicht verfügbar → Datei-Upload als Fallback
      toast.info("Kamera nicht verfügbar – bitte Bild auswählen");
      fileInputRef.current?.click();
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    setCapturedMime("image/jpeg");
    // Kamera stoppen
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setPhase("preview");
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedImage(ev.target?.result as string);
      setCapturedMime(file.type || "image/jpeg");
      setPhase("preview");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!capturedImage) return;
    setPhase("uploading");
    // Base64 aus data URL extrahieren
    const base64 = capturedImage.split(",")[1];
    submitPhoto.mutate({
      requestId,
      imageBase64: base64,
      mimeType: capturedMime,
      productName,
    });
  }, [capturedImage, capturedMime, productName, requestId, submitPhoto]);

  const handleSkip = useCallback(() => {
    if (forced) return;
    if (requestId) {
      skipPhoto.mutate({ requestId });
    } else {
      onSkip?.();
    }
  }, [forced, requestId, skipPhoto, onSkip]);

  const scoreColor = aiScore >= 80 ? "text-red-500" : aiScore >= 60 ? "text-orange-500" : "text-yellow-500";
  const scoreBg = aiScore >= 80 ? "bg-red-50 border-red-200" : aiScore >= 60 ? "bg-orange-50 border-orange-200" : "bg-yellow-50 border-yellow-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Phase: Prompt */}
      {phase === "prompt" && (
        <div className={`mx-4 w-full max-w-sm rounded-2xl border-2 ${scoreBg} p-6 shadow-2xl`}>
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow">
                <Zap className={`h-5 w-5 ${scoreColor}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Marketing-KI</p>
                <p className="text-sm font-bold text-gray-900">Foto-Empfehlung</p>
              </div>
            </div>
            <Badge variant="outline" className={`${scoreColor} border-current font-bold`}>
              {aiScore}% relevant
            </Badge>
          </div>

          {/* Gericht */}
          <div className="mb-3 rounded-xl bg-white/80 p-3">
            <p className="text-xs text-gray-500">Gericht</p>
            <p className="text-lg font-bold text-gray-900">{productName}</p>
          </div>

          {/* KI-Begründung */}
          <div className="mb-5 rounded-xl bg-white/60 p-3">
            <p className="text-xs font-medium text-gray-500 mb-1">Warum jetzt?</p>
            <p className="text-sm text-gray-700 leading-relaxed">{reason}</p>
          </div>

          {/* Stars */}
          <div className="mb-5 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map(i => (
              <Star
                key={i}
                className={`h-5 w-5 ${i <= Math.round(aiScore / 20) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={startCamera}
              className="flex-1 gap-2 bg-gray-900 hover:bg-gray-800 text-white"
              size="lg"
            >
              <Camera className="h-4 w-4" />
              Foto machen
            </Button>
            {!forced && (
              <Button
                variant="ghost"
                size="lg"
                onClick={handleSkip}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {forced && (
            <p className="mt-2 text-center text-xs text-gray-500">
              Foto erforderlich – vom Admin aktiviert
            </p>
          )}
        </div>
      )}

      {/* Phase: Kamera */}
      {phase === "camera" && (
        <div className="relative w-full h-full max-w-lg mx-auto">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {/* Overlay-Rahmen */}
          <div className="absolute inset-0 flex flex-col items-center justify-between p-6">
            <div className="rounded-full bg-black/50 px-4 py-2">
              <p className="text-white text-sm font-medium">{productName}</p>
            </div>
            {/* Kamera-Rahmen */}
            <div className="w-64 h-64 border-2 border-white/60 rounded-2xl" />
            {/* Auslöser */}
            <div className="flex items-center gap-6">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70"
                onClick={() => {
                  streamRef.current?.getTracks().forEach(t => t.stop());
                  setPhase("prompt");
                }}
              >
                <X className="h-5 w-5" />
              </Button>
              <button
                onClick={capturePhoto}
                className="h-20 w-20 rounded-full bg-white border-4 border-gray-300 shadow-lg active:scale-95 transition-transform"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-12 w-12 rounded-full bg-black/50 flex items-center justify-center"
              >
                <span className="text-white text-xs">Galerie</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: Vorschau */}
      {phase === "preview" && capturedImage && (
        <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
          <img src={capturedImage} alt="Vorschau" className="w-full aspect-square object-cover" />
          <div className="p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Sieht gut aus! KI wird den Post automatisch erstellen.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setPhase("camera")}
                className="flex-1"
              >
                Nochmal
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-gray-900 hover:bg-gray-800 text-white gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Absenden
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase: Uploading */}
      {phase === "uploading" && (
        <div className="mx-4 w-full max-w-xs rounded-2xl bg-white p-8 shadow-2xl text-center">
          <Loader2 className="h-12 w-12 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="font-semibold text-gray-900">KI analysiert das Bild...</p>
          <p className="text-sm text-gray-500 mt-1">Texte werden generiert</p>
        </div>
      )}

      {/* Phase: Done */}
      {phase === "done" && (
        <div className="mx-4 w-full max-w-xs rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <p className="font-semibold text-gray-900">Post erstellt!</p>
          <p className="text-sm text-gray-500 mt-1">Wartet auf Admin-Freigabe</p>
        </div>
      )}
    </div>
  );
}

/**
 * Hook: Prüft nach jeder Bestellung ob ein Foto sinnvoll wäre
 */
export function useWaiterPhotoCheck() {
  const [photoRequest, setPhotoRequest] = useState<{
    requestId?: number;
    productName: string;
    reason: string;
    aiScore: number;
    forced: boolean;
  } | null>(null);

  const checkOpportunity = trpc.marketing.checkPhotoOpportunity.useMutation({
    onSuccess: (data) => {
      if (data.shouldPhoto) {
        setPhotoRequest({
          productName: "",
          reason: data.reason,
          aiScore: data.score,
          forced: data.forced,
        });
      }
    },
  });

  const triggerCheck = (productName: string, productId?: number, orderId?: number) => {
    checkOpportunity.mutate({ productName, productId, orderId });
  };

  const dismiss = () => setPhotoRequest(null);

  return { photoRequest, triggerCheck, dismiss };
}
