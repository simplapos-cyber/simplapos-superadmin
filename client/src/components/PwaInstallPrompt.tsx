import { useState, useEffect } from "react";
import { X, Download, Smartphone, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Key used to track if the prompt has been shown
const INSTALL_PROMPT_KEY = "simplapos_pwa_install_prompted";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // Check if already prompted before
    const alreadyPrompted = localStorage.getItem(INSTALL_PROMPT_KEY);
    if (alreadyPrompted) return;

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for Chrome/Android install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Show the prompt after a short delay (let the page settle)
    const timer = setTimeout(() => {
      setShow(true);
    }, 2500);

    // For iOS: show after 2.5s if not already installed
    if (ios) {
      setTimeout(() => setShow(true), 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShow(false);
        localStorage.setItem(INSTALL_PROMPT_KEY, "1");
      }
    }
    dismiss();
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(INSTALL_PROMPT_KEY, "1");
  };

  if (!show || isInstalled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "min(420px, calc(100vw - 32px))",
        background: "#0f172a",
        border: "1px solid rgba(99,102,241,0.3)",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        padding: "16px 20px",
        color: "#f1f5f9",
        animation: "slideUp 0.3s cubic-bezier(0.23,1,0.32,1)",
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Close button */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "transparent",
          border: "none",
          color: "#94a3b8",
          cursor: "pointer",
          padding: 4,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Schliessen"
      >
        <X size={16} />
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <img
          src="/icon-192.png"
          alt="SimplaPOS"
          style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
        />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>
            SimplaPOS als App installieren
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            Kein App Store nötig – direkt auf Ihrem Gerät
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {["Kein Browser", "Offline-fähig", "Schneller Start"].map((b) => (
          <span
            key={b}
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: 11,
              color: "#a5b4fc",
            }}
          >
            {b}
          </span>
        ))}
      </div>

      {/* Android / Chrome: One-click install */}
      {!isIOS && deferredPrompt && (
        <Button
          onClick={handleInstall}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, #6366f1, #06b6d4)",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            padding: "10px 0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Download size={16} />
          Jetzt installieren
        </Button>
      )}

      {/* Android / Chrome: no prompt available yet */}
      {!isIOS && !deferredPrompt && (
        <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
          <Smartphone size={14} style={{ display: "inline", marginRight: 4 }} />
          Chrome-Menü (⋮) öffnen → <strong style={{ color: "#f1f5f9" }}>"App installieren"</strong> tippen
        </div>
      )}

      {/* iOS: Step-by-step */}
      {isIOS && (
        <div style={{ fontSize: 13, color: "#cbd5e1" }}>
          <div style={{ marginBottom: 6, fontWeight: 600, color: "#f1f5f9" }}>
            So installieren Sie die App auf iOS:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: "rgba(99,102,241,0.2)",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#a5b4fc",
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span>
                Tippen Sie auf{" "}
                <Share size={13} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                <strong style={{ color: "#f1f5f9" }}>Teilen</strong> in Safari
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: "rgba(99,102,241,0.2)",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#a5b4fc",
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span>
                <Plus size={13} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                <strong style={{ color: "#f1f5f9" }}>"Zum Home-Bildschirm"</strong> wählen
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  background: "rgba(99,102,241,0.2)",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#a5b4fc",
                  flexShrink: 0,
                }}
              >
                3
              </span>
              <span>
                <strong style={{ color: "#f1f5f9" }}>"Hinzufügen"</strong> bestätigen
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
