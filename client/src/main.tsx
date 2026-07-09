import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { useState, useCallback } from "react";
import App from "./App";
import { getLoginUrl } from "./const";
import SplashScreen from "./components/SplashScreen";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./index.css";

const STORAGE_KEY = "waiter_pin_session";
const SPLASH_SHOWN_KEY = "simplapos_splash_shown";

/**
 * Liest die aktive PIN-Kellner-ID aus dem sessionStorage.
 * Diese wird als x-active-waiter-id Header an alle tRPC-Requests gesendet,
 * damit das Backend effectiveUserId korrekt setzt.
 */
function getActiveWaiterId(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

/**
 * Determines whether to show the splash screen.
 * Show it when:
 * - Running as a PWA (standalone/fullscreen mode)
 * - OR on first visit in this session (not shown yet)
 */
function shouldShowSplash(): boolean {
  // Check if running as installed PWA
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as any).standalone === true;

  if (isStandalone) return true;

  // On first session load in browser too (nice UX)
  const alreadyShown = sessionStorage.getItem(SPLASH_SHOWN_KEY);
  if (!alreadyShown) {
    sessionStorage.setItem(SPLASH_SHOWN_KEY, "1");
    return true;
  }
  return false;
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        // x-active-waiter-id Header dynamisch setzen (bei jedem Request neu lesen)
        const activeWaiterId = getActiveWaiterId();
        // x-device-id für Single-Session-Enforcement (SSE)
        const deviceId = getOrCreateDeviceId();
        const headers: Record<string, string> = {
          "x-device-id": deviceId,
        };
        if (activeWaiterId) {
          headers["x-active-waiter-id"] = activeWaiterId;
        }
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers: {
            ...(init?.headers ?? {}),
            ...headers,
          },
        });
      },
    }),
  ],
});

function Root() {
  const [splashDone, setSplashDone] = useState(() => !shouldShowSplash());
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <>
      {!splashDone && <SplashScreen onDone={handleSplashDone} />}
      <div style={{ opacity: splashDone ? 1 : 0, transition: "opacity 300ms ease", pointerEvents: splashDone ? "all" : "none" }}>
        <App />
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Root />
      </LanguageProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
