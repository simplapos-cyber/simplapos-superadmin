/**
 * NfcLogin.tsx
 *
 * Öffentliche Seite für iOS NFC Deep-Link:
 * https://simplapos.com/nfc-login?token=<64-Zeichen-Hex>
 *
 * Ablauf:
 * 1. iOS öffnet diese URL automatisch wenn NFC-Tag angetippt wird
 * 2. Token wird aus URL-Params gelesen
 * 3. nfcBadgeScan Mutation wird aufgerufen
 * 4. Bei Erfolg: Kellner wird in WaiterPinContext eingeloggt → /kellner
 * 5. Bei Fehler: Fehlermeldung anzeigen
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Nfc, AlertCircle, CheckCircle2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NfcLogin() {
  const [, navigate] = useLocation();
  const { setActiveWaiter } = useWaiterPin();
  const { user, isAuthenticated } = useAuth();
  const authLoading = !isAuthenticated && user === undefined;

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token" | "not-logged-in">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [waiterName, setWaiterName] = useState("");

  const nfcBadgeScanMutation = trpc.adminShifts.nfcBadgeScan.useMutation();

  useEffect(() => {
    if (user === undefined) return; // noch nicht geladen

    // Token aus URL-Params lesen
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      setStatus("no-token");
      return;
    }

    // Muss eingeloggt sein (Admin-Session erforderlich für nfcBadgeScan)
    if (!user) {
      // Token in sessionStorage speichern, nach Login zurückkommen
      sessionStorage.setItem("nfc_pending_token", token);
      setStatus("not-logged-in");
      return;
    }

    // NFC-Badge-Scan ausführen
    nfcBadgeScanMutation.mutate(
      { token },
      {
        onSuccess: (data) => {
          setActiveWaiter({
            id: data.waiter.id,
            name: data.waiter.name,
            role: data.waiter.role,
            avatarUrl: data.waiter.avatarUrl,
            loginAt: Date.now(),
          });
          setWaiterName(data.waiter.name ?? "Kellner");
          setStatus("success");
          if ("vibrate" in navigator) navigator.vibrate(200);
          // Nach kurzer Verzögerung weiterleiten
          setTimeout(() => navigate("/kellner"), 1500);
        },
        onError: (err) => {
          setErrorMsg(err.message ?? "Ungültiger NFC-Badge");
          setStatus("error");
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        },
      }
    );
  }, [authLoading, user]);

  // Pending-Token nach Login verarbeiten
  useEffect(() => {
    if (!user) return;
    const pendingToken = sessionStorage.getItem("nfc_pending_token");
    if (!pendingToken) return;
    sessionStorage.removeItem("nfc_pending_token");

    nfcBadgeScanMutation.mutate(
      { token: pendingToken },
      {
        onSuccess: (data) => {
          setActiveWaiter({
            id: data.waiter.id,
            name: data.waiter.name,
            role: data.waiter.role,
            avatarUrl: data.waiter.avatarUrl,
            loginAt: Date.now(),
          });
          setWaiterName(data.waiter.name ?? "Kellner");
          setStatus("success");
          if ("vibrate" in navigator) navigator.vibrate(200);
          setTimeout(() => navigate("/kellner"), 1500);
        },
        onError: (err) => {
          setErrorMsg(err.message ?? "Ungültiger NFC-Badge");
          setStatus("error");
        },
      }
    );
  }, [user, authLoading]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "1.5rem",
          padding: "2.5rem 2rem",
          width: "100%",
          maxWidth: 360,
          textAlign: "center",
          color: "white",
        }}
      >
        {/* Logo / Icon */}
        <div
          style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "rgba(167, 139, 250, 0.2)",
            border: "2px solid rgba(167, 139, 250, 0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1.5rem",
          }}
        >
          {status === "success" ? (
            <CheckCircle2 size={40} color="rgb(134, 239, 172)" />
          ) : status === "error" ? (
            <AlertCircle size={40} color="rgb(252, 165, 165)" />
          ) : status === "not-logged-in" ? (
            <LogIn size={40} color="rgb(167, 139, 250)" />
          ) : (
            <Nfc size={40} color="rgb(167, 139, 250)" style={{
              animation: status === "loading" ? "nfc-spin 1.5s ease-in-out infinite" : "none",
            }} />
          )}
        </div>

        {/* Titel */}
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 0.5rem" }}>
          SimplaPOS
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 1.5rem" }}>
          NFC-Badge Login
        </p>

        {/* Status-Meldung */}
        {status === "loading" && (
          <div>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
              Badge wird überprüft...
            </p>
            <div style={{
              width: 40, height: 4, background: "rgba(167, 139, 250, 0.3)",
              borderRadius: 2, margin: "1rem auto 0",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%", background: "rgb(167, 139, 250)",
                animation: "progress-slide 1.2s ease-in-out infinite",
                width: "60%",
              }} />
            </div>
          </div>
        )}

        {status === "success" && (
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "rgb(134, 239, 172)", marginBottom: 8 }}>
              Willkommen, {waiterName}!
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              Du wirst weitergeleitet...
            </p>
          </div>
        )}

        {status === "error" && (
          <div>
            <p style={{ fontSize: 15, color: "rgb(252, 165, 165)", marginBottom: 16 }}>
              {errorMsg}
            </p>
            <button
              onClick={() => navigate("/kellner")}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Zum Kellner-Panel
            </button>
          </div>
        )}

        {status === "no-token" && (
          <div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
              Kein gültiger NFC-Token gefunden. Bitte einen gültigen SimplaPOS NFC-Badge verwenden.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.1)",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Zur Startseite
            </button>
          </div>
        )}

        {status === "not-logged-in" && (
          <div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
              Bitte zuerst als Admin einloggen. Der NFC-Badge wird danach automatisch verarbeitet.
            </p>
            <button
              onClick={() => navigate("/login")}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                background: "rgb(124, 58, 237)",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Zum Login
            </button>
          </div>
        )}
      </div>

      <p style={{ marginTop: "1.5rem", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
        SimplaPOS – Restaurant Management System
      </p>

      <style>{`
        @keyframes nfc-spin {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
        }
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
      `}</style>
    </div>
  );
}
