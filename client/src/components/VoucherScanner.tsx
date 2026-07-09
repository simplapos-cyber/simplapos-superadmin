import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Camera, CameraOff } from "lucide-react";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function VoucherScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scheduleFrame();
      }
    } catch {
      setError("Kamera-Zugriff verweigert. Bitte Berechtigung erteilen.");
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const scheduleFrame = () => {
    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const scanFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      scheduleFrame();
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { scheduleFrame(); return; }
    ctx.drawImage(video, 0, 0);

    try {
      // Use BarcodeDetector API if available (Chrome/Android)
      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        const barcodes = await detector.detect(canvas);
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue as string;
          stopCamera();
          onScan(raw.toUpperCase().trim());
          return;
        }
      } else {
        // Fallback: ZXing
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const imageData = canvas.toDataURL("image/png");
        const img = new Image();
        img.src = imageData;
        await new Promise(r => { img.onload = r; });
        try {
          const result = await reader.decodeFromImageElement(img);
          if (result?.getText()) {
            stopCamera();
            onScan(result.getText().toUpperCase().trim());
            return;
          }
        } catch {
          // No QR found in this frame
        }
      }
    } catch {
      // Ignore decode errors
    }

    scheduleFrame();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-purple-400" />
            <span className="font-semibold text-sm">QR-Code scannen</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0 text-white hover:bg-white/10">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Kamera-Bereich */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center">
              <CameraOff className="h-12 w-12 text-red-400" />
              <p className="text-sm">{error}</p>
              <Button size="sm" onClick={startCamera} className="bg-purple-600 hover:bg-purple-700">
                Erneut versuchen
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="hidden" />
              {/* Scan-Rahmen */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-48 h-48">
                  {/* Ecken */}
                  {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
                    <div key={i} className={`absolute ${pos} w-8 h-8`}>
                      <div className={`absolute bg-purple-400 ${i < 2 ? "top-0" : "bottom-0"} ${i % 2 === 0 ? "left-0" : "right-0"} w-full h-1`} />
                      <div className={`absolute bg-purple-400 ${i < 2 ? "top-0" : "bottom-0"} ${i % 2 === 0 ? "left-0" : "right-0"} w-1 h-full`} />
                    </div>
                  ))}
                  {/* Scan-Linie */}
                  {scanning && (
                    <div className="absolute left-2 right-2 h-0.5 bg-purple-400/80 animate-bounce" style={{ top: "50%" }} />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hinweis */}
        <div className="px-4 py-3 text-center text-xs text-gray-500 bg-gray-50">
          Halte den QR-Code des Gutscheins in den Rahmen
        </div>
      </div>
    </div>
  );
}
