/**
 * KellnerLayout – Layout-Wrapper für Kellner-Routen.
 *
 * Drei Fälle:
 *
 * A) OAuth-Kellner (user.role === "kellner" | "barkeeper" | "koch" etc.):
 *    → Direkt zum vollständigen DashboardLayout. Kein PIN nötig.
 *    Der Kellner hat sich bereits mit E-Mail + Passwort angemeldet.
 *
 * B) Admin mit aktivem PIN-Kellner (activeWaiter gesetzt):
 *    → Vollständiges DashboardLayout mit Kellner-Navigation.
 *    Der Admin bedient die Zentralkasse; der Kellner hat sich per PIN/QR/NFC eingeloggt.
 *
 * C) Admin ohne aktiven PIN-Kellner:
 *    → PIN-Overlay (Zentralkasse-Modus).
 *    Der Admin wählt einen Kellner aus und gibt PIN/QR/NFC ein.
 */

import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { WaiterPinOverlay } from "@/components/WaiterPinOverlay";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import DashboardLayout from "@/components/DashboardLayout";

interface Props {
  children: React.ReactNode;
}

// Rollen die KEIN PIN-Overlay brauchen – sie sind per OAuth authentifiziert
const DIRECT_ACCESS_ROLES = ["kellner", "barkeeper", "koch", "buchhalter", "manager"];

export default function KellnerLayout({ children }: Props) {
  const { user, loading } = useAuth();
  const { activeWaiter } = useWaiterPin();
  const [, navigate] = useLocation();

  // Nicht eingeloggte Benutzer zur Login-Seite weiterleiten
  useEffect(() => {
    if (!loading && !user) {
      const timer = setTimeout(() => navigate("/login"), 300);
      return () => clearTimeout(timer);
    }
  }, [loading, user, navigate]);

  // Warten bis Auth-Status bekannt ist – WICHTIG: Skeleton zeigen bis user geladen
  if (loading) return <DashboardLayoutSkeleton />;

  // Kein User → Weiterleitung läuft bereits, Skeleton zeigen
  if (!user) return <DashboardLayoutSkeleton />;

  // ── Fall A: OAuth-Kellner → Direkt zum vollen Dashboard ─────────────────────
  // Kellner sind per E-Mail + Passwort eingeloggt – kein PIN-Overlay nötig.
  const isDirectAccessRole = DIRECT_ACCESS_ROLES.includes(user.role ?? "");
  if (isDirectAccessRole) {
    return (
      <DashboardLayout>
        {children}
      </DashboardLayout>
    );
  }

  // ── Fall B: Admin mit aktivem PIN-Kellner → Volles Dashboard ─────────────────
  if (activeWaiter) {
    return (
      <DashboardLayout>
        {children}
      </DashboardLayout>
    );
  }

  // ── Fall C: Admin ohne aktiven Kellner → PIN-Overlay (Zentralkasse) ──────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--background)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <WaiterPinOverlay fullscreen={false} />
    </div>
  );
}
