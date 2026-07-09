/**
 * AdminDevices.tsx – Geräte & Hardware (echte Daten, alle Prioritäten)
 * Priorität 1: Echte Drucker + Browser-Sessions mit Heartbeat
 * Priorität 2: Kellner-Aktivitätsübersicht
 * Priorität 3: Gerät umbenennen/entfernen, Warnbanner bei Ausfall
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Monitor, Printer, Wifi, WifiOff, RefreshCw, Pencil, Trash2,
  User, Clock, ChefHat, GlassWater, Tablet, Smartphone, Laptop,
  AlertTriangle, CheckCircle2, Activity, MapPin, ShoppingCart,
  Loader2, Save, X
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatSecondsAgo(seconds: number): string {
  if (seconds < 60) return `vor ${seconds}s`;
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

function formatPage(page: string | null | undefined): string {
  if (!page) return "—";
  const map: Record<string, string> = {
    "/": "Dashboard", "/order": "Bestellmaske", "/tables": "Tischplan",
    "/kitchen": "Küche", "/bar": "Bar", "/closings": "Tagesabschluss",
    "/menu": "Menüverwaltung", "/settings": "Einstellungen",
    "/reservations": "Reservierungen", "/shifts": "Schichten",
    "/inventory": "Inventar", "/vouchers": "Gutscheine",
  };
  for (const [key, label] of Object.entries(map)) {
    if (page.startsWith(key)) return label;
  }
  return page;
}

function getRoleLabel(role: string | null | undefined): string {
  const map: Record<string, string> = {
    admin: "Admin", superadmin: "Superadmin", kellner: "Kellner",
    koch: "Koch", barkeeper: "Barkeeper", manager: "Manager",
  };
  return map[role ?? ""] ?? role ?? "—";
}

function getRoleIcon(role: string | null | undefined) {
  switch (role) {
    case "kellner": return <User className="w-3 h-3" />;
    case "koch": return <ChefHat className="w-3 h-3" />;
    case "barkeeper": return <GlassWater className="w-3 h-3" />;
    default: return <User className="w-3 h-3" />;
  }
}

function getDeviceIcon(type: string | null | undefined) {
  switch (type) {
    case "tablet": return <Tablet className="w-4 h-4" />;
    case "mobile": return <Smartphone className="w-4 h-4" />;
    case "desktop": return <Laptop className="w-4 h-4" />;
    default: return <Monitor className="w-4 h-4" />;
  }
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminDevices() {
  const [activeTab, setActiveTab] = useState<"all" | "waiters" | "printers">("all");
  const [renameDialog, setRenameDialog] = useState<{ id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const statsQuery = trpc.device.getStats.useQuery(undefined, { refetchInterval: 30_000 });
  const devicesQuery = trpc.device.listDevices.useQuery(undefined, { refetchInterval: 30_000 });
  const waitersQuery = trpc.device.listWaiters.useQuery(undefined, { refetchInterval: 30_000 });
  const printersQuery = trpc.printer.list.useQuery(undefined, { refetchInterval: 60_000 });

  const renameMutation = trpc.device.renameDevice.useMutation({
    onSuccess: () => { toast.success("Gerät umbenannt"); devicesQuery.refetch(); setRenameDialog(null); },
  });
  const removeMutation = trpc.device.removeDevice.useMutation({
    onSuccess: () => { toast.success("Gerät entfernt"); devicesQuery.refetch(); },
  });
  const checkPrintersMutation = trpc.printer.checkAllStatus.useMutation({
    onSuccess: () => { toast.success("Drucker-Status aktualisiert"); printersQuery.refetch(); },
  });

  const handleRefresh = () => {
    statsQuery.refetch(); devicesQuery.refetch();
    waitersQuery.refetch(); printersQuery.refetch();
  };

  const stats = statsQuery.data ?? { total: 0, online: 0, offline: 0, waitersOnline: 0 };
  type DeviceEntry = { id: number; userId: number | null; role: string | null; deviceName: string | null; deviceType: string | null; browserInfo: string | null; currentPage: string | null; lastAction: string | null; isOnline: boolean; lastSeenAgo: number; appVersion: string | null };
  const devices = (devicesQuery.data ?? []) as DeviceEntry[];
  const waiters = waitersQuery.data ?? [];
  const printers = (printersQuery.data ?? []) as Array<{
    id: number; name: string; type: string; ipAddress: string | null;
    port: number | null; isOnline: boolean | null; lastSeenAt: Date | null;
  }>;

  type WaiterEntry = { id: number; userId: number | null; role: string | null; deviceName: string | null; deviceType: string | null; browserInfo: string | null; currentPage: string | null; lastAction: string | null; lastActionAt: Date | null; lastTableId: number | null; lastOrderId: number | null; isOnline: boolean; connectedAt: Date; lastSeenAt: Date; lastSeenAgo: number };
  const onlineWaiters = (waiters as WaiterEntry[]).filter(w => w.isOnline);
  const offlinePrinters = printers.filter(p => p.isOnline === false);
  const offlineDevices = devices.filter((d: DeviceEntry) => !d.isOnline);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="w-6 h-6 text-primary" /> Geräte & Hardware
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Echtzeit-Übersicht aller verbundenen Geräte und aktiven Kellner
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Aktualisieren
        </Button>
      </div>

      {/* Warnbanner */}
      {(offlinePrinters.length > 0 || offlineDevices.length > 0) && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">Achtung: Geräte offline</p>
            <p className="text-amber-700 mt-0.5">
              {offlinePrinters.length > 0 && `${offlinePrinters.length} Drucker nicht erreichbar. `}
              {offlineDevices.length > 0 && `${offlineDevices.length} Gerät${offlineDevices.length > 1 ? "e" : ""} seit über 2 Minuten inaktiv.`}
            </p>
          </div>
        </div>
      )}

      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gesamt", value: stats.total + printers.length, icon: Monitor, color: "blue" },
          { label: "Online", value: stats.online + printers.filter(p => p.isOnline === true).length, icon: Wifi, color: "green" },
          { label: "Offline / Fehler", value: stats.offline + offlinePrinters.length, icon: WifiOff, color: "red" },
          { label: "Kellner aktiv", value: stats.waitersOnline, icon: Activity, color: "purple" },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 bg-${s.color}-100 rounded-lg`}>
                    <Icon className={`w-5 h-5 text-${s.color}-600`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color !== "blue" ? `text-${s.color}-600` : ""}`}>{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b">
        {[
          { key: "all", label: `Alle Geräte (${devices.length})` },
          { key: "waiters", label: `Kellner (${onlineWaiters.length} aktiv)` },
          { key: "printers", label: `Drucker (${printers.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Alle Geräte */}
      {activeTab === "all" && (
        <div className="space-y-2">
          {devicesQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade Geräte...
            </div>
          )}
          {!devicesQuery.isLoading && devices.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Noch keine Geräte verbunden</p>
              <p className="text-sm mt-1">Sobald sich ein Gerät anmeldet, erscheint es hier automatisch.</p>
            </div>
          )}
          {devices.map((device: DeviceEntry) => (
            <Card key={device.id} className={!device.isOnline ? "opacity-60" : ""}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${device.isOnline ? "bg-green-100" : "bg-gray-100"}`}>
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {device.deviceName ?? device.browserInfo ?? "Unbekanntes Gerät"}
                        </span>
                        <Badge variant={device.isOnline ? "default" : "secondary"} className="text-xs">
                          {device.isOnline
                            ? <><Wifi className="w-3 h-3 mr-1" />Online</>
                            : <><WifiOff className="w-3 h-3 mr-1" />Offline</>}
                        </Badge>
                        {device.role && (
                          <Badge variant="outline" className="text-xs gap-1">
                            {getRoleIcon(device.role)}{getRoleLabel(device.role)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        {device.currentPage && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{formatPage(device.currentPage)}
                          </span>
                        )}
                        {device.lastAction && (
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />{device.lastAction}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatSecondsAgo(device.lastSeenAgo)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setRenameDialog({ id: device.id, name: device.deviceName ?? "" }); setRenameValue(device.deviceName ?? ""); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {!device.isOnline && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Gerät entfernen?")) removeMutation.mutate({ deviceId: device.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tab: Kellner */}
      {activeTab === "waiters" && (
        <div className="space-y-3">
          {waitersQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade Kellner...
            </div>
          )}
          {!waitersQuery.isLoading && waiters.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Kein Kellner eingeloggt</p>
            </div>
          )}

          {onlineWaiters.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> Aktiv ({onlineWaiters.length})
              </h3>
              <div className="space-y-2">
                {onlineWaiters.map(w => (
                  <Card key={w.id} className="border-green-200">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                          {getRoleIcon(w.role)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {w.deviceName ?? `${getRoleLabel(w.role)} #${w.userId}`}
                            </span>
                            <Badge className="bg-green-500 text-white text-xs">Online</Badge>
                            <Badge variant="outline" className="text-xs gap-1">
                              {getRoleIcon(w.role)}{getRoleLabel(w.role)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                            {w.currentPage && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />{formatPage(w.currentPage)}
                              </span>
                            )}
                            {w.lastAction && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <ShoppingCart className="w-3 h-3" />{w.lastAction}
                                {w.lastActionAt && ` (${formatSecondsAgo(Math.round((Date.now() - new Date(w.lastActionAt).getTime()) / 1000))})`}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Eingeloggt seit {formatSecondsAgo(Math.round((Date.now() - new Date(w.connectedAt).getTime()) / 1000))}
                            </span>
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {(waiters as WaiterEntry[]).filter(w => !w.isOnline).length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-gray-400" /> Inaktiv ({(waiters as WaiterEntry[]).filter(w => !w.isOnline).length})
              </h3>
              <div className="space-y-2">
                {(waiters as WaiterEntry[]).filter(w => !w.isOnline).map(w => (
                  <Card key={w.id} className="opacity-60">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                          {getRoleIcon(w.role)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {w.deviceName ?? `${getRoleLabel(w.role)} #${w.userId}`}
                            </span>
                            <Badge variant="secondary" className="text-xs">Offline</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Zuletzt aktiv: {formatSecondsAgo(w.lastSeenAgo)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Drucker */}
      {activeTab === "printers" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2"
              onClick={() => checkPrintersMutation.mutate()}
              disabled={checkPrintersMutation.isPending}>
              {checkPrintersMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Wifi className="w-4 h-4" />}
              Alle Drucker prüfen
            </Button>
          </div>
          {printersQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade Drucker...
            </div>
          )}
          {!printersQuery.isLoading && printers.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Printer className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Keine Drucker konfiguriert</p>
              <p className="text-sm mt-1">Drucker können unter Admin → Drucker hinzugefügt werden.</p>
            </div>
          )}
          {printers.map(printer => (
            <Card key={printer.id} className={printer.isOnline === false ? "border-red-200" : ""}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    printer.isOnline === true ? "bg-green-100" :
                    printer.isOnline === false ? "bg-red-100" : "bg-gray-100"
                  }`}>
                    <Printer className={`w-4 h-4 ${
                      printer.isOnline === true ? "text-green-600" :
                      printer.isOnline === false ? "text-red-600" : "text-gray-500"
                    }`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{printer.name}</span>
                      <Badge
                        variant={printer.isOnline === true ? "default" : printer.isOnline === false ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {printer.isOnline === true
                          ? <><Wifi className="w-3 h-3 mr-1" />Online</>
                          : printer.isOnline === false
                          ? <><WifiOff className="w-3 h-3 mr-1" />Offline</>
                          : "Nicht geprüft"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{printer.type}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {printer.ipAddress && <span>{printer.ipAddress}:{printer.port ?? 9100}</span>}
                      {printer.lastSeenAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatSecondsAgo(Math.round((Date.now() - new Date(printer.lastSeenAt).getTime()) / 1000))}
                        </span>
                      )}
                    </div>
                  </div>
                  {printer.isOnline === false && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  {printer.isOnline === true && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: Umbenennen */}
      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerät umbenennen</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder="z.B. iPad Bar, Kasse 1, Tablet Terrasse"
              onKeyDown={e => {
                if (e.key === "Enter" && renameDialog) {
                  renameMutation.mutate({ deviceId: renameDialog.id, name: renameValue });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>
              <X className="w-4 h-4 mr-1" /> Abbrechen
            </Button>
            <Button
              onClick={() => renameDialog && renameMutation.mutate({ deviceId: renameDialog.id, name: renameValue })}
              disabled={!renameValue.trim() || renameMutation.isPending}
            >
              {renameMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
