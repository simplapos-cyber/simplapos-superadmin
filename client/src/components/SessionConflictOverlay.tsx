import { MonitorSmartphone, RefreshCw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * Sperrbildschirm wenn ein Session-Konflikt erkannt wurde.
 * Der Nutzer wird NICHT ausgeloggt – die App bleibt offen.
 * 
 * Option A: "Trotzdem anmelden" → Logout + Weiterleitung zur Login-Seite.
 * Nach erneutem Login wird die alte Session automatisch überschrieben.
 */
export function SessionConflictOverlay() {
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const handleForceLogin = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // ignore – wir leiten sowieso weiter
    } finally {
      localStorage.removeItem("manus-runtime-user-info");
      // Zur Login-Seite – nach erneutem Login wird alte Session überschrieben
      window.location.href = "/login";
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      style={{ fontFamily: "inherit" }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 flex flex-col items-center gap-5 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30">
          <MonitorSmartphone className="w-8 h-8 text-orange-500" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Bereits auf einem anderen Gerät angemeldet
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Dein Konto ist aktuell auf einem anderen Gerät aktiv. Bitte melde dich dort zuerst ab, bevor du hier weiterarbeitest.
          </p>
        </div>

        <div className="w-full flex flex-col gap-2">
          {/* Option A: Erzwungener Login – alte Session wird beim Login überschrieben */}
          <Button
            className="w-full gap-2"
            onClick={handleForceLogin}
            disabled={logoutMutation.isPending}
          >
            <LogIn className="w-4 h-4" />
            {logoutMutation.isPending ? "Wird abgemeldet…" : "Trotzdem anmelden (andere Sitzung beenden)"}
          </Button>

          {/* Seite neu laden – prüft ob andere Session inzwischen beendet wurde */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => window.location.reload()}
            disabled={logoutMutation.isPending}
          >
            <RefreshCw className="w-4 h-4" />
            Erneut prüfen
          </Button>
        </div>

        <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
          Gerät verloren oder vergessen? Klicke auf "Trotzdem anmelden" — du wirst zur Anmeldung weitergeleitet und die andere Sitzung wird automatisch beendet.
        </p>
      </div>
    </div>
  );
}
