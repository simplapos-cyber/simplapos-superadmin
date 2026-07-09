import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ModuleGate } from "@/components/ModuleGate";
import {
  Wifi, WifiOff, Thermometer, Droplets, Flame, Wind, Zap, Eye, BellRing,
  Plus, Settings, RefreshCw, ChevronRight, AlertTriangle, CheckCircle2,
  Lightbulb, ToggleLeft, Activity, Shield, Waves, Bug, Bell, BellOff,
  Clock, Play, Pause, Pencil
} from "lucide-react";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  temperature: <Thermometer className="h-5 w-5" />,
  humidity: <Droplets className="h-5 w-5" />,
  motion: <Activity className="h-5 w-5" />,
  door: <Shield className="h-5 w-5" />,
  smoke: <Flame className="h-5 w-5" />,
  water_leak: <Waves className="h-5 w-5" />,
  co2: <Wind className="h-5 w-5" />,
  switch: <ToggleLeft className="h-5 w-5" />,
  light: <Lightbulb className="h-5 w-5" />,
  power: <Zap className="h-5 w-5" />,
  camera: <Eye className="h-5 w-5" />,
  pest: <Bug className="h-5 w-5" />,
  air_quality: <Wind className="h-5 w-5" />,
  other: <Wifi className="h-5 w-5" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  temperature: "text-orange-500",
  humidity: "text-blue-400",
  motion: "text-purple-500",
  door: "text-slate-400",
  smoke: "text-red-500",
  water_leak: "text-cyan-500",
  co2: "text-green-400",
  switch: "text-yellow-500",
  light: "text-yellow-300",
  power: "text-amber-500",
  camera: "text-indigo-400",
  pest: "text-lime-500",
  air_quality: "text-teal-400",
  other: "text-slate-400",
};

interface DeviceItem {
  id: number;
  deviceId: string;
  name: string;
  category: string;
  location: string | null;
  isOnline: boolean;
  alertEnabled: boolean;
  alertMinValue: string | null;
  alertMaxValue: string | null;
}

interface AlertItem {
  id: number;
  message: string;
  alertType: string;
  isResolved: boolean;
  createdAt: string | Date;
}

// ─── Push-Subscription Helper ─────────────────────────────────────────────────
async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return sub;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

function SmartBuildingInner() {
  const [addOpen, setAddOpen] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [pollingOpen, setPollingOpen] = useState(false);
  const [configDevice, setConfigDevice] = useState<DeviceItem | null>(null);
  const [newDevice, setNewDevice] = useState({ deviceId: "", name: "", category: "temperature", location: "" });
  const [creds, setCreds] = useState({ clientId: "", clientSecret: "", region: "eu" as "eu" | "us" | "cn" | "in" });
  const [pollingForm, setPollingForm] = useState({ isEnabled: false, intervalMinutes: 10 as 5 | 10 | 15 | 30 });
  const [deviceConfig, setDeviceConfig] = useState({ alertEnabled: true, alertMinValue: "", alertMaxValue: "", name: "", location: "" });

  const stats = trpc.tuya.getDashboardStats.useQuery();
  const devices = trpc.tuya.listDevices.useQuery();
  const alerts = trpc.tuya.getOpenAlerts.useQuery();
  const credentials = trpc.tuya.getCredentials.useQuery();
  const categories = trpc.tuya.getCategories.useQuery();
  const pollingConfig = trpc.tuya.getPollingConfig.useQuery();
  const pushStatus = trpc.tuya.getAdminPushStatus.useQuery();
  const vapidKey = trpc.tuya.getVapidPublicKey.useQuery();

  const utils = trpc.useUtils();

  // Polling-Form mit DB-Werten befüllen
  useEffect(() => {
    if (pollingConfig.data) {
      setPollingForm({
        isEnabled: pollingConfig.data.isEnabled,
        intervalMinutes: (pollingConfig.data.intervalMinutes as 5 | 10 | 15 | 30) ?? 10,
      });
    }
  }, [pollingConfig.data]);

  // Gerätekonfig-Form befüllen
  useEffect(() => {
    if (configDevice) {
      setDeviceConfig({
        alertEnabled: configDevice.alertEnabled,
        alertMinValue: configDevice.alertMinValue ?? "",
        alertMaxValue: configDevice.alertMaxValue ?? "",
        name: configDevice.name,
        location: configDevice.location ?? "",
      });
    }
  }, [configDevice]);

  const addDevice = trpc.tuya.addDevice.useMutation({
    onSuccess: () => { devices.refetch(); setAddOpen(false); toast.success("Gerät hinzugefügt"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const saveCreds = trpc.tuya.saveCredentials.useMutation({
    onSuccess: () => { credentials.refetch(); setCredOpen(false); toast.success("Zugangsdaten gespeichert"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const resolveAlert = trpc.tuya.resolveAlert.useMutation({
    onSuccess: () => { alerts.refetch(); stats.refetch(); },
  });

  const controlDevice = trpc.tuya.controlDevice.useMutation({
    onSuccess: () => { devices.refetch(); toast.success("Befehl gesendet"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const savePolling = trpc.tuya.savePollingConfig.useMutation({
    onSuccess: (data) => {
      pollingConfig.refetch();
      setPollingOpen(false);
      toast.success(data.isEnabled ? `Polling aktiviert (alle ${data.intervalMinutes} Min.)` : "Polling deaktiviert");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const updateDeviceConfig = trpc.tuya.updateDeviceConfig.useMutation({
    onSuccess: () => {
      devices.refetch();
      setConfigDevice(null);
      toast.success("Gerätekonfiguration gespeichert");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const subscribeAdminPush = trpc.tuya.subscribeAdminPush.useMutation({
    onSuccess: () => { pushStatus.refetch(); toast.success("Push-Benachrichtigungen aktiviert"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const unsubscribeAdminPush = trpc.tuya.unsubscribeAdminPush.useMutation({
    onSuccess: () => { pushStatus.refetch(); toast.success("Push-Benachrichtigungen deaktiviert"); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handlePushToggle = async () => {
    if (pushStatus.data?.subscribed) {
      unsubscribeAdminPush.mutate();
    } else {
      const key = vapidKey.data?.publicKey;
      if (!key) { toast.error("VAPID-Key nicht verfügbar"); return; }
      const sub = await subscribeToPush(key);
      if (!sub) { toast.error("Push-Berechtigung verweigert oder nicht unterstützt"); return; }
      const json = sub.toJSON();
      subscribeAdminPush.mutate({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      });
    }
  };

  const s = stats.data;
  const isPollingActive = pollingConfig.data?.isEnabled ?? false;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="h-6 w-6 text-primary" />
            Smart Building
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Alle IoT-Geräte, Sensoren und Automatisierungen auf einen Blick
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Push-Toggle */}
          <Button
            variant={pushStatus.data?.subscribed ? "default" : "outline"}
            size="sm"
            onClick={handlePushToggle}
            disabled={subscribeAdminPush.isPending || unsubscribeAdminPush.isPending}
          >
            {pushStatus.data?.subscribed
              ? <><Bell className="h-4 w-4 mr-1" />Push aktiv</>
              : <><BellOff className="h-4 w-4 mr-1" />Push aktivieren</>
            }
          </Button>

          {/* Polling-Konfiguration */}
          <Dialog open={pollingOpen} onOpenChange={setPollingOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                {isPollingActive
                  ? <><Play className="h-4 w-4 mr-1 text-green-500" />Polling ({pollingConfig.data?.intervalMinutes}m)</>
                  : <><Pause className="h-4 w-4 mr-1 text-slate-400" />Auto-Polling</>
                }
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Automatisches Polling konfigurieren</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Gerätestatus wird automatisch von der Tuya API abgerufen und Alarme werden ausgelöst.
                  Kritische Alarme (Feuer, Wasserleck) senden sofort Push-Benachrichtigungen.
                </p>
                <div className="flex items-center justify-between">
                  <Label>Polling aktivieren</Label>
                  <Switch
                    checked={pollingForm.isEnabled}
                    onCheckedChange={v => setPollingForm(p => ({ ...p, isEnabled: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Intervall</Label>
                  <Select
                    value={String(pollingForm.intervalMinutes)}
                    onValueChange={v => setPollingForm(p => ({ ...p, intervalMinutes: parseInt(v) as 5 | 10 | 15 | 30 }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Alle 5 Minuten</SelectItem>
                      <SelectItem value="10">Alle 10 Minuten</SelectItem>
                      <SelectItem value="15">Alle 15 Minuten</SelectItem>
                      <SelectItem value="30">Alle 30 Minuten</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {pollingConfig.data?.lastPolledAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Letzter Abruf: {new Date(pollingConfig.data.lastPolledAt).toLocaleString("de-CH")}
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={() => savePolling.mutate(pollingForm)}
                  disabled={savePolling.isPending}
                >
                  {savePolling.isPending ? "Speichern..." : "Speichern"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Tuya API Zugangsdaten */}
          <Dialog open={credOpen} onOpenChange={setCredOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Settings className="h-4 w-4 mr-1" />Tuya API</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tuya API-Zugangsdaten</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Zugangsdaten aus dem <a href="https://iot.tuya.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Tuya IoT Platform</a> Dashboard.
                </p>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input value={creds.clientId} onChange={e => setCreds(p => ({ ...p, clientId: e.target.value }))} placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input type="password" value={creds.clientSecret} onChange={e => setCreds(p => ({ ...p, clientSecret: e.target.value }))} placeholder="••••••••••••••••••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={creds.region} onValueChange={v => setCreds(p => ({ ...p, region: v as "eu" | "us" | "cn" | "in" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eu">Europa (eu)</SelectItem>
                      <SelectItem value="us">USA (us)</SelectItem>
                      <SelectItem value="cn">China (cn)</SelectItem>
                      <SelectItem value="in">Indien (in)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => saveCreds.mutate(creds)} disabled={saveCreds.isPending}>
                  {saveCreds.isPending ? "Speichern..." : "Speichern"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Gerät hinzufügen */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Gerät hinzufügen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neues Gerät hinzufügen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tuya Geräte-ID</Label>
                  <Input value={newDevice.deviceId} onChange={e => setNewDevice(p => ({ ...p, deviceId: e.target.value }))} placeholder="bf1234567890abcdef" />
                  <p className="text-xs text-muted-foreground">Zu finden in der Tuya Smart App unter Gerätedetails</p>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newDevice.name} onChange={e => setNewDevice(p => ({ ...p, name: e.target.value }))} placeholder="z.B. Kühlraum A" />
                </div>
                <div className="space-y-2">
                  <Label>Kategorie</Label>
                  <Select value={newDevice.category} onValueChange={v => setNewDevice(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.data?.map(c => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Standort (optional)</Label>
                  <Input value={newDevice.location} onChange={e => setNewDevice(p => ({ ...p, location: e.target.value }))} placeholder="z.B. Küche, Lager, Bar" />
                </div>
                <Button className="w-full" onClick={() => addDevice.mutate(newDevice)} disabled={addDevice.isPending || !newDevice.deviceId || !newDevice.name}>
                  {addDevice.isPending ? "Hinzufügen..." : "Gerät hinzufügen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* API-Status Banner */}
      {credentials.data === null && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">Tuya API nicht verbunden</p>
            <p className="text-sm text-muted-foreground">Klicke auf "Tuya API" um deine Zugangsdaten einzugeben und Geräte zu verbinden.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCredOpen(true)}>Verbinden</Button>
        </div>
      )}

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{s?.totalDevices ?? 0}</div>
            <div className="text-xs text-muted-foreground">Geräte total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-500">{s?.onlineDevices ?? 0}</div>
            <div className="text-xs text-muted-foreground">Online</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-slate-400">{s?.offlineDevices ?? 0}</div>
            <div className="text-xs text-muted-foreground">Offline</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-amber-500">{s?.openAlerts ?? 0}</div>
            <div className="text-xs text-muted-foreground">Offene Alarme</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-red-500">{s?.criticalAlerts ?? 0}</div>
            <div className="text-xs text-muted-foreground">Kritisch</div>
          </CardContent>
        </Card>
      </div>

      {/* Schnellzugriff nach Kategorie */}
      {s && Object.keys(s.devicesByCategory).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(s.devicesByCategory).map(([cat, count]) => (
            <Card key={cat} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <span className={CATEGORY_COLORS[cat] ?? "text-slate-400"}>{CATEGORY_ICONS[cat] ?? <Wifi className="h-5 w-5" />}</span>
                <div>
                  <div className="font-medium text-sm capitalize">{cat.replace(/_/g, " ")}</div>
                  <div className="text-xs text-muted-foreground">{count as number} Gerät{(count as number) !== 1 ? "e" : ""}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Geräteliste */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Alle Geräte</h2>
            <Button variant="ghost" size="sm" onClick={() => devices.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {devices.isLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
            </div>
          )}

          {devices.data?.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">Noch keine Geräte</p>
                <p className="text-sm text-muted-foreground mt-1">Füge dein erstes Tuya-Gerät hinzu</p>
                <Button className="mt-4" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Gerät hinzufügen</Button>
              </CardContent>
            </Card>
          )}

          {(devices.data as DeviceItem[] | undefined)?.map((device: DeviceItem) => (
            <Card key={device.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <span className={CATEGORY_COLORS[device.category] ?? "text-slate-400"}>
                  {CATEGORY_ICONS[device.category] ?? <Wifi className="h-5 w-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{device.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {device.location ?? "—"} · {device.deviceId}
                    {(device.alertMinValue || device.alertMaxValue) && (
                      <span className="ml-1 text-orange-400">
                        ({device.alertMinValue ?? "–"}…{device.alertMaxValue ?? "–"})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {device.isOnline ? (
                    <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10 text-xs">
                      <Wifi className="h-3 w-3 mr-1" />Online
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400 border-slate-400/30 text-xs">
                      <WifiOff className="h-3 w-3 mr-1" />Offline
                    </Badge>
                  )}
                  {device.alertEnabled && (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-xs">
                      <BellRing className="h-3 w-3 mr-1" />Alarm
                    </Badge>
                  )}
                  {/* Schalter-Steuerung */}
                  {(device.category === "switch" || device.category === "light") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => controlDevice.mutate({
                        tuyaDeviceId: device.deviceId,
                        commands: [{ code: "switch_1", value: true }],
                      })}
                    >
                      Ein
                    </Button>
                  )}
                  {/* Konfigurieren */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setConfigDevice(device)}
                    title="Konfigurieren"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link href="/admin/smart-building/temperature">
              <Card className="cursor-pointer hover:border-orange-500/50 transition-colors">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Temperaturkontrolle</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/admin/smart-building/alerts">
              <Card className="cursor-pointer hover:border-red-500/50 transition-colors">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Alarme & Meldungen</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Offene Alarme */}
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <BellRing className="h-4 w-4 text-amber-500" />
            Offene Alarme
            {(alerts.data?.length ?? 0) > 0 && (
              <Badge className="bg-red-500 text-white text-xs">{alerts.data?.length}</Badge>
            )}
          </h2>

          {alerts.data?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium">Alles in Ordnung</p>
                <p className="text-xs text-muted-foreground">Keine offenen Alarme</p>
              </CardContent>
            </Card>
          )}

          {(alerts.data as AlertItem[] | undefined)?.map((alert: AlertItem) => (
            <Card key={alert.id} className="border-l-4 border-l-red-500">
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{alert.alertType.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.createdAt).toLocaleString("de-CH")}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => resolveAlert.mutate({ alertId: alert.id })}
                  >
                    Erledigt
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Gerätekonfiguration Dialog */}
      <Dialog open={!!configDevice} onOpenChange={open => { if (!open) setConfigDevice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {configDevice && (
                <span className="flex items-center gap-2">
                  <span className={CATEGORY_COLORS[configDevice.category] ?? "text-slate-400"}>
                    {CATEGORY_ICONS[configDevice.category] ?? <Wifi className="h-5 w-5" />}
                  </span>
                  {configDevice.name} konfigurieren
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {configDevice && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={deviceConfig.name} onChange={e => setDeviceConfig(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Standort</Label>
                <Input value={deviceConfig.location} onChange={e => setDeviceConfig(p => ({ ...p, location: e.target.value }))} placeholder="z.B. Küche, Lager, Bar" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Alarm aktiviert</Label>
                <Switch
                  checked={deviceConfig.alertEnabled}
                  onCheckedChange={v => setDeviceConfig(p => ({ ...p, alertEnabled: v }))}
                />
              </div>
              {deviceConfig.alertEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Minimalwert</Label>
                    <Input
                      type="number"
                      value={deviceConfig.alertMinValue}
                      onChange={e => setDeviceConfig(p => ({ ...p, alertMinValue: e.target.value }))}
                      placeholder="z.B. 2"
                    />
                    <p className="text-xs text-muted-foreground">Alarm wenn Wert darunter fällt</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Maximalwert</Label>
                    <Input
                      type="number"
                      value={deviceConfig.alertMaxValue}
                      onChange={e => setDeviceConfig(p => ({ ...p, alertMaxValue: e.target.value }))}
                      placeholder="z.B. 8"
                    />
                    <p className="text-xs text-muted-foreground">Alarm wenn Wert darüber steigt</p>
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => updateDeviceConfig.mutate({
                  id: configDevice.id,
                  alertEnabled: deviceConfig.alertEnabled,
                  alertMinValue: deviceConfig.alertMinValue || null,
                  alertMaxValue: deviceConfig.alertMaxValue || null,
                  name: deviceConfig.name,
                  location: deviceConfig.location,
                })}
                disabled={updateDeviceConfig.isPending}
              >
                {updateDeviceConfig.isPending ? "Speichern..." : "Konfiguration speichern"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SmartBuilding() {
  return (
    <ModuleGate moduleId="smart_building">
      <SmartBuildingInner />
    </ModuleGate>
  );
}
