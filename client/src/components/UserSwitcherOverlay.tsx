/**
 * UserSwitcherOverlay
 *
 * Zeigt eine Nutzer-Auswahl:
 * - Admin-Konto (oben, mit Krone-Icon)
 * - Alle Kellner mit PIN
 *
 * Ablauf:
 * 1. Nutzer klickt auf seinen Namen
 * 2. PIN-Eingabe erscheint
 * 3. Nach korrektem PIN → Routing zum entsprechenden Panel
 *
 * Wird geöffnet:
 * - Wenn Admin auf "Als Kellner einloggen" klickt
 * - Wenn Kellner sich ausloggt
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useWaiterPin } from "@/contexts/WaiterPinContext";
import { useLocation } from "wouter";
import { Shield, User, Delete, ChevronLeft, Nfc, Smartphone, LogOut } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wenn true: Admin-Konto ist auswählbar (zeigt PIN-Eingabe für Admin-Rückkehr) */
  showAdmin?: boolean;
}

type SelectedUser =
  | { type: "admin"; name: string; email: string }
  | { type: "waiter"; id: number; name: string; role: string };

type LoginMode = "list" | "pin" | "nfc";

export function UserSwitcherOverlay({ open, onClose, showAdmin = true }: Props) {
  const { user } = useAuth();
  const { setActiveWaiter, activeWaiter, logout } = useWaiterPin();
  const [, navigate] = useLocation();

  // ── KELLNER-ISOLATION: Wenn ein Kellner aktiv eingeloggt ist, darf er
  // weder andere Kellner noch das Admin-Panel sehen/wechseln.
  // Er bekommt nur einen "Abmelden"-Screen.
  if (open && activeWaiter) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div
          style={{
            background: "var(--card)",
            color: "var(--card-foreground)",
            borderRadius: "1.25rem",
            padding: "2rem",
            width: "100%",
            maxWidth: 360,
            boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1rem",
            color: "var(--primary-foreground)",
          }}>
            <User size={28} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 0.25rem" }}>
            {activeWaiter.name}
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "0 0 1.5rem" }}>
            {activeWaiter.role === "kellner" ? "Kellner" :
             activeWaiter.role === "barkeeper" ? "Barkeeper" : activeWaiter.role}
          </p>
          <button
            onClick={() => { logout(); onClose(); }}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              background: "var(--destructive)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <LogOut size={16} />
            Abmelden
          </button>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  const [selected, setSelected] = useState<SelectedUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>("list");

  // NFC-Reader-State
  const [nfcStatus, setNfcStatus] = useState<"idle" | "scanning" | "success" | "error" | "unsupported">("idle");
  const [nfcError, setNfcError] = useState("");
  const nfcAbortRef = useRef<AbortController | null>(null);

  const waitersQuery = trpc.adminShifts.listWaitersForPanel.useQuery(undefined, {
    enabled: open,
  });

  const waiterLoginMutation = trpc.adminShifts.waiterPanelLogin.useMutation();
  const nfcBadgeScanMutation = trpc.adminShifts.nfcBadgeScan.useMutation();

  // NFC-Reader starten wenn mode === "nfc"
  useEffect(() => {
    if (mode !== "nfc" || !open) {
      // Abbrechen wenn nicht mehr im NFC-Modus
      if (nfcAbortRef.current) {
        nfcAbortRef.current.abort();
        nfcAbortRef.current = null;
      }
      return;
    }

    // Prüfen ob Web NFC verfügbar (Android Chrome)
    if (typeof (window as any).NDEFReader === "undefined") {
      setNfcStatus("unsupported");
      return;
    }

    setNfcStatus("scanning");
    setNfcError("");

    const controller = new AbortController();
    nfcAbortRef.current = controller;

    const startNfc = async () => {
      try {
        const reader = new (window as any).NDEFReader();
        await reader.scan({ signal: controller.signal });

        reader.addEventListener("reading", async ({ message }: any) => {
          for (const record of message.records) {
            let url = "";
            if (record.recordType === "url") {
              const decoder = new TextDecoder();
              url = decoder.decode(record.data);
            } else if (record.recordType === "text") {
              const decoder = new TextDecoder(record.encoding ?? "utf-8");
              url = decoder.decode(record.data);
            }

            // Token aus URL extrahieren: https://simplapos.com/nfc-login?token=...
            const match = url.match(/[?&]token=([a-f0-9]{64})/i);
            if (match) {
              const token = match[1];
              controller.abort();
              nfcAbortRef.current = null;
              setNfcStatus("success");
              handleNfcToken(token);
              return;
            }
          }
          // Kein gültiger Token gefunden
          setNfcError("Kein gültiger SimplaPOS NFC-Tag");
          if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
        });

        reader.addEventListener("readingerror", () => {
          setNfcError("NFC-Lesefehler. Bitte erneut versuchen.");
          setNfcStatus("error");
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setNfcError(err.message ?? "NFC nicht verfügbar");
          setNfcStatus("error");
        }
      }
    };

    startNfc();

    return () => {
      controller.abort();
      nfcAbortRef.current = null;
    };
  }, [mode, open]);

  // NFC-Token verarbeiten: nfcBadgeScan aufrufen und Kellner einloggen
  const handleNfcToken = async (token: string) => {
    setLoading(true);
    try {
      const result = await nfcBadgeScanMutation.mutateAsync({ token });
      setActiveWaiter({
        id: result.waiter.id,
        name: result.waiter.name,
        role: result.waiter.role,
        avatarUrl: result.waiter.avatarUrl,
        loginAt: Date.now(),
      });
      if ("vibrate" in navigator) navigator.vibrate(200);
      navigate("/kellner");
      onClose();
    } catch (err: any) {
      setNfcError(err.message ?? "Ungültiger NFC-Badge");
      setNfcStatus("error");
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = (u: SelectedUser) => {
    setSelected(u);
    setPin("");
    setError("");
    setMode("pin");
  };

  const handleBack = () => {
    setSelected(null);
    setPin("");
    setError("");
    setMode("list");
    setNfcStatus("idle");
    setNfcError("");
  };

  const handlePinDigit = useCallback((digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      handleSubmit(newPin);
    }
  }, [pin, selected]);

  const handleDelete = () => {
    setPin(p => p.slice(0, -1));
    setError("");
  };

  const handleSubmit = async (submittedPin: string) => {
    if (!selected) return;
    setLoading(true);
    setError("");

    try {
      if (selected.type === "admin") {
        await waiterLoginMutation.mutateAsync({
          staffId: user!.id,
          pin: submittedPin,
        });
        setActiveWaiter(null);
        navigate("/admin");
        onClose();
      } else {
        const result = await waiterLoginMutation.mutateAsync({
          staffId: selected.id,
          pin: submittedPin,
        });
        setActiveWaiter({
          id: result.waiter.id,
          name: result.waiter.name,
          role: result.waiter.role,
          avatarUrl: result.waiter.avatarUrl,
          loginAt: Date.now(),
        });
        navigate("/kellner");
        onClose();
      }
    } catch {
      setError("Falscher PIN. Bitte erneut versuchen.");
      setPin("");
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const waiters = waitersQuery.data ?? [];
  const hasNfc = typeof (window as any).NDEFReader !== "undefined";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          color: "var(--card-foreground)",
          borderRadius: "1.25rem",
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          {(mode === "pin" || mode === "nfc") ? (
            <button
              onClick={handleBack}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted-foreground)",
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              <ChevronLeft size={16} />
              Zurück
            </button>
          ) : null}
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {mode === "pin" && selected ? `PIN für ${selected.name}` :
             mode === "nfc" ? "NFC-Badge antippen" :
             "Wer arbeitet heute?"}
          </h2>
          {mode === "list" && (
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4 }}>
              Wähle deinen Account und gib deinen PIN ein
            </p>
          )}
        </div>

        {/* Nutzer-Auswahl (Liste) */}
        {mode === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Admin-Konto */}
            {showAdmin && user && (
              <button
                onClick={() => handleSelectUser({ type: "admin", name: user.name || "Admin", email: user.email || "" })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "2px solid var(--primary)",
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Shield size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name || "Admin"}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Administrator</div>
                </div>
              </button>
            )}

            {/* Kellner-Liste */}
            {waitersQuery.isLoading ? (
              <div style={{ textAlign: "center", padding: "1rem", color: "var(--muted-foreground)", fontSize: 14 }}>
                Lade Mitarbeiter...
              </div>
            ) : waiters.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1rem", color: "var(--muted-foreground)", fontSize: 14 }}>
                Keine Kellner mit PIN gefunden.
              </div>
            ) : (
              waiters.map(w => (
                <button
                  key={w.id}
                  onClick={() => handleSelectUser({ type: "waiter", id: w.id, name: w.name, role: w.role })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--muted)")}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "var(--primary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, color: "var(--primary-foreground)",
                  }}>
                    {w.avatarUrl ? (
                      <img src={w.avatarUrl} alt={w.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <User size={18} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                      {w.role === "kellner" ? "Kellner" : w.role === "barkeeper" ? "Barkeeper" : w.role}
                    </div>
                  </div>
                </button>
              ))
            )}

            {/* NFC-Login-Button (nur wenn Kellner vorhanden) */}
            {waiters.length > 0 && (
              <button
                onClick={() => { setMode("nfc"); setNfcStatus("idle"); setNfcError(""); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  cursor: "pointer",
                  fontSize: 14,
                  marginTop: 4,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <Nfc size={16} />
                Mit NFC-Badge einloggen
              </button>
            )}
          </div>
        )}

        {/* PIN-Eingabe */}
        {mode === "pin" && selected && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            {/* PIN-Punkte */}
            <div style={{ display: "flex", gap: 12 }}>
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: i < pin.length ? "var(--primary)" : "var(--border)",
                    transition: "background 0.15s, transform 0.1s",
                    transform: i < pin.length ? "scale(1.2)" : "scale(1)",
                  }}
                />
              ))}
            </div>

            {/* Fehler */}
            {error && (
              <p style={{ color: "var(--destructive)", fontSize: 13, textAlign: "center", margin: 0 }}>
                {error}
              </p>
            )}

            {/* Ziffernblock */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%" }}>
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, idx) => {
                if (key === "") return <div key={idx} />;
                const isDelete = key === "⌫";
                return (
                  <button
                    key={idx}
                    onClick={() => isDelete ? handleDelete() : handlePinDigit(key)}
                    disabled={loading}
                    style={{
                      height: 60,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: isDelete ? "var(--muted)" : "var(--card)",
                      color: "var(--foreground)",
                      fontSize: isDelete ? 20 : 22,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.1s, transform 0.1s",
                      opacity: loading ? 0.5 : 1,
                    }}
                    onMouseDown={e => (e.currentTarget.style.transform = "scale(0.94)")}
                    onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    {isDelete ? <Delete size={20} /> : key}
                  </button>
                );
              })}
            </div>

            {loading && (
              <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Anmelden...</p>
            )}
          </div>
        )}

        {/* NFC-Modus */}
        {mode === "nfc" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "1rem 0" }}>
            {hasNfc ? (
              /* Android Chrome: NDEFReader verfügbar */
              <>
                {nfcStatus === "scanning" && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      width: 100, height: 100, borderRadius: "50%",
                      background: "rgba(124, 58, 237, 0.1)",
                      border: "3px solid rgba(124, 58, 237, 0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 16px",
                      animation: "nfc-pulse 1.5s ease-in-out infinite",
                    }}>
                      <Nfc size={44} color="rgb(124, 58, 237)" />
                    </div>
                    <p style={{ fontWeight: 600, fontSize: 16, margin: "0 0 8px" }}>NFC-Badge antippen</p>
                    <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0 }}>
                      Halte den NFC-Badge an die Rückseite des Geräts
                    </p>
                  </div>
                )}
                {nfcStatus === "success" && (
                  <div style={{ textAlign: "center", color: "rgb(22, 163, 74)" }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
                    <p style={{ fontWeight: 600, fontSize: 16 }}>Eingeloggt!</p>
                  </div>
                )}
                {(nfcStatus === "error" || nfcStatus === "idle") && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: "50%",
                      background: "rgba(239, 68, 68, 0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 12px",
                    }}>
                      <Nfc size={36} color="rgb(239, 68, 68)" />
                    </div>
                    <p style={{ color: "var(--destructive)", fontSize: 14, marginBottom: 12 }}>
                      {nfcError || "NFC-Fehler"}
                    </p>
                    <button
                      onClick={() => { setNfcStatus("idle"); setNfcError(""); setMode("nfc"); }}
                      style={{
                        padding: "8px 20px", borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--muted)", cursor: "pointer", fontSize: 14,
                        color: "var(--foreground)",
                      }}
                    >
                      Erneut versuchen
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* iOS / Desktop: NDEFReader nicht verfügbar */
              <div style={{ textAlign: "center", padding: "0.5rem" }}>
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <Smartphone size={36} color="rgb(59, 130, 246)" />
                </div>
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>NFC auf iOS</p>
                <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 16, lineHeight: 1.5 }}>
                  iOS öffnet NFC-Tags automatisch als URL.<br />
                  Halte den NFC-Badge ans iPhone – Safari öffnet dann die Login-Seite automatisch.
                </p>
                <div style={{
                  padding: "12px 16px",
                  background: "var(--muted)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "var(--muted-foreground)",
                  textAlign: "left",
                  lineHeight: 1.6,
                }}>
                  <strong>Anleitung:</strong><br />
                  1. iPhone entsperren<br />
                  2. NFC-Badge ans obere iPhone-Ende halten<br />
                  3. Safari öffnet simplapos.com automatisch<br />
                  4. Kellner wird eingeloggt
                </div>
              </div>
            )}

            {loading && (
              <p style={{ color: "var(--muted-foreground)", fontSize: 13 }}>Einloggen...</p>
            )}
          </div>
        )}

        {/* Abbrechen */}
        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "10px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Abbrechen
        </button>
      </div>

      {/* NFC-Puls-Animation */}
      <style>{`
        @keyframes nfc-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
