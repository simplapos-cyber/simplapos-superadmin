import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Offline Indicator - zeigt dem Benutzer an wenn die Verbindung verloren geht
 * und informiert wenn sie wiederhergestellt ist.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // Clear any existing timer before setting a new one
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
        isOnline
          ? "bg-green-600 text-white"
          : "bg-destructive text-destructive-foreground"
      }`}
      role="alert"
      aria-live="polite"
    >
      {isOnline ? (
        <>
          <Wifi size={16} />
          <span>Verbindung wiederhergestellt</span>
        </>
      ) : (
        <>
          <WifiOff size={16} />
          <span>Keine Internetverbindung</span>
        </>
      )}
    </div>
  );
}
