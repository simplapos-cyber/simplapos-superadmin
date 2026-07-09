import { useEffect, useState } from "react";

/**
 * SplashScreen – shown for ~1.5s when the app first loads.
 * Displays the SimplaPOS logo with a smooth scale+fade-in animation,
 * then fades out before revealing the app.
 *
 * Only shown when running as a PWA (standalone mode) or on first load
 * to avoid disrupting normal browser navigation.
 */

const LOGO_URL = "/icon-512.png";

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    // Phase 1: fade/scale in (600ms)
    const t1 = setTimeout(() => setPhase("hold"), 600);
    // Phase 2: hold (800ms)
    const t2 = setTimeout(() => setPhase("out"), 1400);
    // Phase 3: fade out (500ms) → done
    const t3 = setTimeout(() => onDone(), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    transition: phase === "out" ? "opacity 500ms cubic-bezier(0.23, 1, 0.32, 1)" : "none",
    opacity: phase === "out" ? 0 : 1,
    pointerEvents: phase === "out" ? "none" : "all",
  };

  const logoStyle: React.CSSProperties = {
    width: "clamp(120px, 40vw, 200px)",
    height: "clamp(120px, 40vw, 200px)",
    objectFit: "contain",
    transition: phase === "in"
      ? "opacity 600ms cubic-bezier(0.23, 1, 0.32, 1), transform 600ms cubic-bezier(0.23, 1, 0.32, 1)"
      : "none",
    opacity: phase === "in" ? 0 : 1,
    transform: phase === "in" ? "scale(0.85)" : "scale(1)",
  };

  const dotsContainerStyle: React.CSSProperties = {
    marginTop: 32,
    display: "flex",
    gap: 8,
    alignItems: "center",
  };

  return (
    <div style={containerStyle} aria-hidden="true">
      <img src={LOGO_URL} alt="SimplaPOS" style={logoStyle} />
      {/* Animated loading dots */}
      <div style={dotsContainerStyle}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#2dd4bf",
              display: "inline-block",
              animation: `splashDot 1.2s ease-in-out ${i * 0.2}s infinite`,
              opacity: phase === "in" ? 0 : 1,
              transition: "opacity 400ms ease",
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes splashDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
