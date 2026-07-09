import { useState, useEffect } from "react";
import { Smartphone, Monitor, Share2, Plus, MoreVertical, Download, CheckCircle2, ArrowRight, Wifi, WifiOff } from "lucide-react";

const LOGO_URL = "/manus-storage/simplaPOSLogo.zip-1_cc5313ec.png";
const APP_URL = typeof window !== "undefined" ? window.location.origin : "https://simplapos.com";

// Detect platform
function usePlatform() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | "unknown">("unknown");
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isMobile = isIOS || isAndroid || /mobile/.test(ua);
    if (isIOS) setPlatform("ios");
    else if (isAndroid) setPlatform("android");
    else if (!isMobile) setPlatform("desktop");
    else setPlatform("unknown");
  }, []);
  return platform;
}

// Check if already installed as PWA
function useIsInstalled() {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setInstalled(isStandalone);
  }, []);
  return installed;
}

// Install prompt for Android/Chrome
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return prompt;
}

// Step component
function Step({ number, icon, title, description }: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div style={{
      display: "flex",
      gap: 16,
      padding: "16px 0",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "rgba(59,130,246,0.15)",
        border: "2px solid rgba(59,130,246,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "#60a5fa",
        fontWeight: 700,
        fontSize: 16,
      }}>
        {number}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "#60a5fa" }}>{icon}</span>
          <span style={{ fontWeight: 600, color: "#f1f5f9", fontSize: 15 }}>{title}</span>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.5, margin: 0 }}>{description}</p>
      </div>
    </div>
  );
}

export default function InstallApp() {
  const platform = usePlatform();
  const isInstalled = useIsInstalled();
  const installPrompt = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<"ios" | "android">("ios");
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (platform === "ios") setActiveTab("ios");
    else if (platform === "android") setActiveTab("android");
  }, [platform]);

  const handleAndroidInstall = async () => {
    if (!installPrompt) return;
    setInstalling(true);
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstalling(false);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      color: "#f1f5f9",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflowX: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "24px 20px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        maxWidth: 600,
        margin: "0 auto",
      }}>
        <img src={LOGO_URL} alt="SimplaPOS" style={{ height: 32, filter: "brightness(0) invert(1)" }} />
        <a
          href="/landing"
          style={{
            color: "#94a3b8",
            textDecoration: "none",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Zur Website <ArrowRight style={{ width: 14, height: 14 }} />
        </a>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 40px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", padding: "32px 0 24px" }}>
          <div style={{
            width: 88,
            height: 88,
            borderRadius: 20,
            overflow: "hidden",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
          }}>
            <img
              src="/icon-192.png"
              alt="SimplaPOS App"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px", color: "#f1f5f9" }}>
            SimplaPOS als App installieren
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 15, margin: 0, lineHeight: 1.6 }}>
            Keine App-Store-Installation nötig. Direkt auf Ihrem Gerät – wie eine native App.
          </p>
        </div>

        {/* Already installed banner */}
        {(isInstalled || installed) && (
          <div style={{
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 12,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}>
            <CheckCircle2 style={{ width: 20, height: 20, color: "#4ade80", flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "#4ade80", fontSize: 14 }}>App bereits installiert!</p>
              <p style={{ margin: 0, color: "#86efac", fontSize: 13 }}>SimplaPOS läuft bereits als App auf Ihrem Gerät.</p>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 28,
        }}>
          {[
            { icon: <Smartphone style={{ width: 16, height: 16 }} />, text: "Kein Browser sichtbar" },
            { icon: <Download style={{ width: 16, height: 16 }} />, text: "Kein App Store nötig" },
            { icon: <Wifi style={{ width: 16, height: 16 }} />, text: "Offline-fähig" },
            { icon: <CheckCircle2 style={{ width: 16, height: 16 }} />, text: "Immer aktuell" },
          ].map((b, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#94a3b8",
              fontSize: 13,
            }}>
              <span style={{ color: "#60a5fa" }}>{b.icon}</span>
              {b.text}
            </div>
          ))}
        </div>

        {/* Android: One-click install */}
        {platform === "android" && installPrompt && !installed && (
          <button
            onClick={handleAndroidInstall}
            disabled={installing}
            style={{
              width: "100%",
              padding: "16px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: 14,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginBottom: 28,
              boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
            }}
          >
            <Download style={{ width: 20, height: 20 }} />
            {installing ? "Wird installiert..." : "Jetzt als App installieren"}
          </button>
        )}

        {/* Tab switcher */}
        <div style={{
          display: "flex",
          background: "rgba(255,255,255,0.05)",
          borderRadius: 12,
          padding: 4,
          marginBottom: 20,
        }}>
          {(["ios", "android"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 9,
                border: "none",
                background: activeTab === tab ? "rgba(59,130,246,0.2)" : "transparent",
                color: activeTab === tab ? "#60a5fa" : "#64748b",
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab === "ios" ? "🍎  iPhone / iPad" : "🤖  Android"}
            </button>
          ))}
        </div>

        {/* iOS Instructions */}
        {activeTab === "ios" && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "4px 16px",
            marginBottom: 24,
          }}>
            <Step
              number={1}
              icon={<Share2 style={{ width: 16, height: 16 }} />}
              title='Tippen Sie auf "Teilen"'
              description='Öffnen Sie simplapos.com in Safari und tippen Sie auf das Teilen-Symbol (Quadrat mit Pfeil nach oben) in der unteren Menüleiste.'
            />
            <Step
              number={2}
              icon={<Plus style={{ width: 16, height: 16 }} />}
              title='"Zum Home-Bildschirm" wählen'
              description='Scrollen Sie im Teilen-Menü nach unten und tippen Sie auf "Zum Home-Bildschirm hinzufügen".'
            />
            <Step
              number={3}
              icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}
              title="Bestätigen und fertig!"
              description='Tippen Sie oben rechts auf "Hinzufügen". SimplaPOS erscheint jetzt als App-Symbol auf Ihrem Home-Bildschirm.'
            />
          </div>
        )}

        {/* Android Instructions */}
        {activeTab === "android" && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "4px 16px",
            marginBottom: 24,
          }}>
            {installPrompt ? (
              <Step
                number={1}
                icon={<Download style={{ width: 16, height: 16 }} />}
                title="Direkt installieren"
                description='Tippen Sie oben auf "Jetzt als App installieren" – Chrome erledigt den Rest automatisch.'
              />
            ) : (
              <>
                <Step
                  number={1}
                  icon={<MoreVertical style={{ width: 16, height: 16 }} />}
                  title="Menü öffnen"
                  description='Öffnen Sie simplapos.com in Chrome und tippen Sie auf die drei Punkte (⋮) oben rechts.'
                />
                <Step
                  number={2}
                  icon={<Plus style={{ width: 16, height: 16 }} />}
                  title='"App installieren" wählen'
                  description='Tippen Sie auf "App installieren" oder "Zum Startbildschirm hinzufügen".'
                />
                <Step
                  number={3}
                  icon={<CheckCircle2 style={{ width: 16, height: 16 }} />}
                  title="Bestätigen und fertig!"
                  description='Tippen Sie auf "Installieren". SimplaPOS erscheint jetzt als App auf Ihrem Gerät.'
                />
              </>
            )}
          </div>
        )}

        {/* QR Code section for desktop */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: 20,
          textAlign: "center",
          marginBottom: 24,
        }}>
          <Monitor style={{ width: 20, height: 20, color: "#60a5fa", margin: "0 auto 8px" }} />
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "0 0 12px", lineHeight: 1.5 }}>
            Am Computer? Scannen Sie diesen QR-Code mit Ihrem Smartphone, um die App direkt zu installieren.
          </p>
          {/* QR Code via Google Charts API */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(APP_URL + "/install")}&bgcolor=1e293b&color=f1f5f9&margin=2`}
            alt="QR Code für App-Installation"
            style={{
              width: 160,
              height: 160,
              borderRadius: 12,
              border: "2px solid rgba(255,255,255,0.1)",
            }}
            onError={(e) => {
              // Fallback if QR API fails
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <p style={{ color: "#475569", fontSize: 12, margin: "10px 0 0" }}>{APP_URL}</p>
        </div>

        {/* Direct link button */}
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "14px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            color: "#f1f5f9",
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Direkt zur App öffnen <ArrowRight style={{ width: 16, height: 16 }} />
        </a>

        <p style={{ textAlign: "center", color: "#475569", fontSize: 12, marginTop: 24 }}>
          SimplaPOS – Das moderne Kassensystem für Schweizer Gastronomen
        </p>
      </div>
    </div>
  );
}
