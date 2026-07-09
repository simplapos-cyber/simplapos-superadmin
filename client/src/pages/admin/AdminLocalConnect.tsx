/**
 * AdminLocalConnect.tsx
 *
 * Admin-Seite für die SimplaPOS Local Connect App.
 *
 * Zeigt:
 * - Status der registrierten Local Connect Geräte (online/offline)
 * - Onboarding-Token generieren
 * - Testdruck direkt auslösen (mit Live-Status)
 * - Job-Verlauf (letzte Druckaufträge)
 * - Anleitung zur Einrichtung
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, Wifi, WifiOff, RefreshCw, Plus, CheckCircle,
  XCircle, Clock, Printer, AlertTriangle, Info, Copy, Trash2,
  FlaskConical, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string | Date | null): string {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  return `vor ${Math.floor(diffH / 24)} Tagen`;
}

const JOB_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending:   { label: "Ausstehend", icon: <Clock className="h-3 w-3" />,        color: "bg-yellow-100 text-yellow-700" },
  sent:      { label: "Gesendet",   icon: <CheckCircle className="h-3 w-3" />,  color: "bg-blue-100 text-blue-700" },
  confirmed: { label: "Gedruckt",   icon: <CheckCircle className="h-3 w-3" />,  color: "bg-green-100 text-green-700" },
  failed:    { label: "Fehler",     icon: <XCircle className="h-3 w-3" />,      color: "bg-red-100 text-red-700" },
};

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminLocalConnect() {
  const [showToken, setShowToken] = useState<string | null>(null);
  const [testPrintStatus, setTestPrintStatus] = useState<
    "idle" | "sending" | "waiting" | "success" | "error"
  >("idle");
  const [testPrintMessage, setTestPrintMessage] = useState<string>("");
  const [testJobId, setTestJobId] = useState<number | null>(null);

  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;

  const { data: devices = [], refetch: refetchDevices, isLoading: devicesLoading } =
    trpc.localConnect.listDevices.useQuery(
      { restaurantId },
      { refetchInterval: 10_000, enabled: !!restaurantId }
    );

  const { data: jobHistory = [], refetch: refetchJobs } =
    trpc.localConnect.getJobHistory.useQuery(
      { restaurantId, limit: 30 },
      { refetchInterval: 5_000, enabled: !!restaurantId }
    );

  const { data: printerList = [] } = trpc.printer.list.useQuery(
    undefined,
    { enabled: !!restaurantId }
  );

  const generateToken = trpc.localConnect.generateOnboardingToken.useMutation({
    onSuccess: (data) => setShowToken(data.token),
    onError: (e) => toast.error(e.message),
  });

  const removeDevice = trpc.localConnect.removeDevice.useMutation({
    onSuccess: () => {
      toast.success("Gerät entfernt");
      refetchDevices();
    },
    onError: (e) => toast.error(e.message),
  });

  const testPrintMutation = trpc.printer.createTestPrintJob.useMutation();

  // Warte auf Job-Bestätigung (polling)
  useEffect(() => {
    if (testPrintStatus !== "waiting" || testJobId === null) return;

    const interval = setInterval(() => {
      refetchJobs();
    }, 1500);

    return () => clearInterval(interval);
  }, [testPrintStatus, testJobId, refetchJobs]);

  // Prüfe ob der Test-Job bestätigt wurde
  useEffect(() => {
    if (testPrintStatus !== "waiting" || testJobId === null) return;

    const job = (jobHistory as any[]).find((j: any) => j.id === testJobId);
    if (!job) return;

    if (job.status === "confirmed") {
      setTestPrintStatus("success");
      setTestPrintMessage("✅ Testdruck erfolgreich! Der Drucker hat den Bon gedruckt.");
      setTestJobId(null);
    } else if (job.status === "failed") {
      setTestPrintStatus("error");
      setTestPrintMessage(`❌ Testdruck fehlgeschlagen: ${job.errorMessage || "Unbekannter Fehler"}`);
      setTestJobId(null);
    }
  }, [jobHistory, testPrintStatus, testJobId]);

  async function handleTestPrint(printerId: number) {
    setTestPrintStatus("sending");
    setTestPrintMessage("Testdruck-Job wird erstellt...");
    setTestJobId(null);

    try {
      const result = await testPrintMutation.mutateAsync({ printerId });
      setTestPrintStatus("waiting");
      setTestPrintMessage("⏳ Job gesendet – warte auf Bestätigung der Local Connect App...");
      // Job-ID aus dem History holen (neuester Job)
      await refetchJobs();
    } catch (err: any) {
      setTestPrintStatus("error");
      if (err?.message?.includes("Local Connect") || err?.message?.includes("online")) {
        setTestPrintMessage("❌ Kein Local Connect Gerät online. Bitte starte die App im Restaurant-WLAN.");
      } else if (err?.message?.includes("IP")) {
        setTestPrintMessage("❌ Keine IP-Adresse für diesen Drucker konfiguriert. Bitte unter Admin → Drucker eintragen.");
      } else {
        setTestPrintMessage(`❌ Fehler: ${err?.message || "Unbekannter Fehler"}`);
      }
    }
  }

  // Neuesten pending Job als Test-Job tracken
  useEffect(() => {
    if (testPrintStatus !== "waiting" || testJobId !== null) return;
    const newest = (jobHistory as any[]).find((j: any) => j.type === "print_test" && j.status === "pending");
    if (newest) setTestJobId(newest.id);
  }, [jobHistory, testPrintStatus, testJobId]);

  const onlineDevices = devices.filter((d: any) => d.isOnline);
  const offlineDevices = devices.filter((d: any) => !d.isOnline);
  const hasOnlineDevice = onlineDevices.length > 0;
  const firstPrinter = (printerList as any[])[0];

  function copyToken(token: string) {
    navigator.clipboard.writeText(token).then(() => toast.success("Token kopiert"));
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" />
            Local Connect App
          </h1>
          <p className="text-muted-foreground mt-1">
            Verbindet die SimplaPOS Web-App mit Ihrem Epson-Drucker im Restaurant-WLAN
          </p>
        </div>
        <Button
          onClick={() => { refetchDevices(); refetchJobs(); }}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      {/* Status-Banner */}
      {hasOnlineDevice ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="font-medium text-green-800">
              {onlineDevices.length} Gerät{onlineDevices.length > 1 ? "e" : ""} online
            </p>
            <p className="text-sm text-green-700">
              Druckaufträge werden automatisch verarbeitet.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Kein Gerät online</p>
            <p className="text-sm text-amber-700">
              Bitte starte die SimplaPOS Local Connect App auf einem Android-Gerät im Restaurant-WLAN.
            </p>
          </div>
        </div>
      )}

      {/* Testdruck-Karte */}
      <Card className={hasOnlineDevice ? "border-primary/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Testdruck
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasOnlineDevice ? (
            <p className="text-sm text-muted-foreground">
              Kein Local Connect Gerät online. Bitte starte die App zuerst.
            </p>
          ) : !firstPrinter ? (
            <p className="text-sm text-muted-foreground">
              Kein Drucker konfiguriert. Bitte zuerst unter <strong>Admin → Drucker</strong> einen Drucker anlegen.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{firstPrinter.name}</p>
                  <p className="text-xs text-muted-foreground">
                    IP: {firstPrinter.ipAddress || "–"} · {firstPrinter.type === "receipt" ? "Gastbon" : "Küche"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleTestPrint(firstPrinter.id)}
                  disabled={testPrintStatus === "sending" || testPrintStatus === "waiting"}
                  className="gap-2"
                >
                  {(testPrintStatus === "sending" || testPrintStatus === "waiting") ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  Testdruck senden
                </Button>
              </div>

              {testPrintStatus !== "idle" && (
                <div className={`p-3 rounded-lg text-sm font-medium ${
                  testPrintStatus === "success" ? "bg-green-50 text-green-800 border border-green-200" :
                  testPrintStatus === "error" ? "bg-red-50 text-red-800 border border-red-200" :
                  "bg-blue-50 text-blue-800 border border-blue-200"
                }`}>
                  {testPrintMessage}
                  {testPrintStatus === "waiting" && (
                    <div className="mt-2 text-xs text-blue-600">
                      Die Local Connect App pollt alle 2 Sekunden. Bitte kurz warten...
                    </div>
                  )}
                </div>
              )}

              {(testPrintStatus === "success" || testPrintStatus === "error") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTestPrintStatus("idle"); setTestPrintMessage(""); }}
                >
                  Zurücksetzen
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Geräte-Liste */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Registrierte Geräte ({devices.length})
          </CardTitle>
          <Button
            size="sm"
            onClick={() => generateToken.mutate({ restaurantId })}
            disabled={generateToken.isPending}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Neues Gerät verbinden
          </Button>
        </CardHeader>
        <CardContent>
          {devicesLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Lädt...</p>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Smartphone className="h-12 w-12 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">Noch kein Gerät verbunden</p>
              <p className="text-sm text-muted-foreground">
                Klicke auf "Neues Gerät verbinden" um einen Onboarding-Token zu generieren.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device: any) => (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${device.isOnline ? "bg-green-100" : "bg-muted"}`}>
                      {device.isOnline
                        ? <Wifi className="h-4 w-4 text-green-600" />
                        : <WifiOff className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                    <div>
                      <p className="font-medium text-sm">{device.deviceName || device.deviceId}</p>
                      <p className="text-xs text-muted-foreground">
                        {device.platform === "android" ? "Android" : "iOS"}
                        {device.appVersion ? ` · v${device.appVersion}` : ""}
                        {device.localIp ? ` · ${device.localIp}` : ""}
                        {" · "}Zuletzt: {timeAgo(device.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={device.isOnline
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground"
                    }>
                      {device.isOnline ? "Online" : "Offline"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeDevice.mutate({ deviceId: device.deviceId, restaurantId })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Onboarding-Token */}
      {showToken && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Onboarding-Token
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Öffne die SimplaPOS Local Connect App auf deinem Android-Gerät und gib diesen Token ein:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 rounded-lg bg-background border font-mono text-sm break-all">
                {showToken}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToken(showToken)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Der Token ist 24 Stunden gültig. Nach dem Verbinden erscheint das Gerät in der Liste oben.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowToken(null)}>
              Schliessen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Job-Verlauf */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Letzte Druckaufträge
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(jobHistory as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Noch keine Druckaufträge
            </p>
          ) : (
            <div className="space-y-2">
              {(jobHistory as any[]).map((job: any) => {
                const statusCfg = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.pending;
                return (
                  <div
                    key={job.id}
                    className={`flex items-center justify-between py-2 border-b last:border-0 ${
                      job.id === testJobId ? "bg-blue-50 rounded px-2" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={`gap-1 ${statusCfg.color}`}>
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>
                      <span className="text-sm">
                        {job.type === "print" ? "Gastbon" :
                         job.type === "print_test" ? "🧪 Testdruck" :
                         job.type === "drawer_open" ? "Kassenschublade" :
                         job.type}
                      </span>
                      {job.errorMessage && (
                        <span className="text-xs text-destructive truncate max-w-48">
                          {job.errorMessage}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(job.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anleitung */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            Einrichtungsanleitung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium">Drucker konfigurieren</p>
                <p className="text-muted-foreground">
                  Gehe zu <strong>Admin → Drucker</strong> und trage die IP-Adresse deines Epson-Druckers ein.
                  Benutzername: <code>epson</code>, Passwort falls gesetzt.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium">App installieren</p>
                <p className="text-muted-foreground">
                  Lade die SimplaPOS Local Connect App (APK) auf ein Android-Gerät herunter.
                  Das Gerät muss dauerhaft im Restaurant-WLAN bleiben.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium">Gerät verbinden</p>
                <p className="text-muted-foreground">
                  Klicke auf "Neues Gerät verbinden", kopiere den Token und gib ihn in der App ein.
                  Das Gerät erscheint dann oben als "Online".
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium">Testdruck durchführen</p>
                <p className="text-muted-foreground">
                  Klicke oben auf "Testdruck senden". Der Bon sollte innerhalb von 2–3 Sekunden gedruckt werden
                  und der Status wechselt auf "Gedruckt".
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
