/**
 * WaiterPinContext – Lokale Kellner-Session für Zentralkasse
 *
 * Konzept:
 * - Das Gerät (Zentralkasse) ist dauerhaft als Restaurant-Admin eingeloggt (OAuth).
 * - Kellner melden sich zusätzlich mit einem 4-stelligen PIN an.
 * - Die Kellner-Session ist rein lokal (sessionStorage) – kein neues JWT.
 * - Nach AUTO_LOGOUT_MINUTES Minuten Inaktivität wird der Kellner automatisch ausgeloggt.
 * - Alle Aktionen (Bonieren, Abrechnen) werden mit activeWaiter.id verknüpft.
 *
 * BACK-BUTTON-SCHUTZ:
 * Nach dem Logout wird der Browser-Verlauf mit history.replaceState gesperrt.
 * Ein popstate-Listener verhindert, dass der Zurück-Button den Kellner wieder
 * in eine gesperrte Seite führt.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const AUTO_LOGOUT_MINUTES = 30; // Minuten bis Auto-Logout
const STORAGE_KEY = "waiter_pin_session";

export type ActiveWaiter = {
  id: number;
  name: string;
  role: string;
  avatarUrl?: string | null;
  loginAt: number; // Unix-Timestamp
};

type WaiterPinContextType = {
  activeWaiter: ActiveWaiter | null;
  setActiveWaiter: (waiter: ActiveWaiter | null) => void;
  logout: () => void;
  resetInactivityTimer: () => void;
  autoLogoutMinutes: number;
};

const WaiterPinContext = createContext<WaiterPinContextType | null>(null);

/**
 * Sperrt den Browser-Verlauf nach einem Logout.
 * Ersetzt den aktuellen Eintrag und schiebt einen neuen drauf,
 * damit der Zurück-Button immer auf die aktuelle Seite zeigt.
 * Ein persistenter popstate-Listener verhindert jede Rückwärtsnavigation.
 */
function lockBrowserHistory() {
  const currentPath = window.location.pathname + window.location.search;
  // Aktuellen Eintrag ersetzen (kein Zurück möglich)
  history.replaceState({ locked: true }, "", currentPath);
  // Neuen Eintrag hinzufügen (Back-Taste landet hier)
  history.pushState({ locked: true }, "", currentPath);

  // Listener: Wenn der Nutzer zurück navigiert, sofort wieder vorwärts schieben
  function onPopState() {
    history.pushState({ locked: true }, "", window.location.pathname + window.location.search);
  }

  // Alten Listener entfernen (falls vorhanden) und neuen registrieren
  window.removeEventListener("popstate", (window as Window & { _waiterPopState?: EventListener })._waiterPopState ?? (() => {}));
  (window as Window & { _waiterPopState?: EventListener })._waiterPopState = onPopState;
  window.addEventListener("popstate", onPopState);
}

export function WaiterPinProvider({ children }: { children: React.ReactNode }) {
  const [activeWaiter, setActiveWaiterState] = useState<ActiveWaiter | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed: ActiveWaiter = JSON.parse(stored);
      // Abgelaufene Session verwerfen
      const ageMinutes = (Date.now() - parsed.loginAt) / 60000;
      if (ageMinutes > AUTO_LOGOUT_MINUTES) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setActiveWaiterState(null);
    sessionStorage.removeItem(STORAGE_KEY);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    // Back-Button nach Logout sperren
    lockBrowserHistory();
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      logout();
    }, AUTO_LOGOUT_MINUTES * 60 * 1000);
  }, [logout]);

  const setActiveWaiter = useCallback((waiter: ActiveWaiter | null) => {
    setActiveWaiterState(waiter);
    if (waiter) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(waiter));
      resetInactivityTimer();
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    }
  }, [resetInactivityTimer]);

  // Inaktivitäts-Timer bei Benutzeraktionen zurücksetzen
  useEffect(() => {
    if (!activeWaiter) return;
    const events = ["mousedown", "touchstart", "keydown", "scroll"];
    const handler = () => resetInactivityTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [activeWaiter, resetInactivityTimer]);

  return (
    <WaiterPinContext.Provider value={{
      activeWaiter,
      setActiveWaiter,
      logout,
      resetInactivityTimer,
      autoLogoutMinutes: AUTO_LOGOUT_MINUTES,
    }}>
      {children}
    </WaiterPinContext.Provider>
  );
}

export function useWaiterPin() {
  const ctx = useContext(WaiterPinContext);
  if (!ctx) throw new Error("useWaiterPin must be used within WaiterPinProvider");
  return ctx;
}
