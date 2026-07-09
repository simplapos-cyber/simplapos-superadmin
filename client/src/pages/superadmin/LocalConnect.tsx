import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Smartphone, Wifi, WifiOff, Plus, Trash2, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

// ─── QR-Code Anzeige (via qrcode.react oder einfache URL) ────────────────────
function QRCodeDisplay({ value }: { value: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(value)}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <img src={qrUrl} alt="QR-Code" className="w-48 h-48 rounded-lg border" />
      <p className="text-xs text-muted-foreground text-center max-w-xs break-all">{value}</p>
    </div>
  );
}

// ─── Gerätekarte ─────────────────────────────────────────────────────────────
function DeviceCard({
  device,
  onRemove,
}: {
  device: {
    id: number;
    deviceId: string;
    deviceName: string;
    platform: string;
    isOnline: boolean;
    lastSeenAt: Date | null;
    appVersion: string | null;
  };
  onRemove: (deviceId: string) => void;
}) {
  const isOnline = device.isOnline;
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isOnline ? "bg-green-100" : "bg-gray-100"}`}>
          <Smartphone className={`w-5 h-5 ${isOnline ? "text-green-600" : "text-gray-400"}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{device.deviceName}</span>
            <Badge variant={isOnline ? "default" : "secondary"} className="text-xs">
              {isOnline ? "Online" : "Offline"}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">{device.platform}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ID: {device.deviceId.slice(0, 16)}…
            {device.appVersion && ` · v${device.appVersion}`}
            {device.lastSeenAt && ` · Zuletzt: ${new Date(device.lastSeenAt).toLocaleString("de-CH")}`}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(device.deviceId)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Job-Status-Badge ─────────────────────────────────────────────────────────
function JobStatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: "Ausstehend", icon: Clock, className: "bg-yellow-100 text-yellow-700" },
    sent: { label: "Gesendet", icon: Wifi, className: "bg-blue-100 text-blue-700" },
    confirmed: { label: "Erfolgreich", icon: CheckCircle, className: "bg-green-100 text-green-700" },
    failed: { label: "Fehlgeschlagen", icon: XCircle, className: "bg-red-100 text-red-700" },
  }[status] ?? { label: status, icon: AlertCircle, className: "bg-gray-100 text-gray-700" };

  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────
export default function LocalConnect() {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [generatedQr, setGeneratedQr] = useState<string | null>(null);

  // Restaurants laden
  const { data: restaurants } = trpc.restaurants.list.useQuery();

  // Geräte laden
  const { data: devices, refetch: refetchDevices } = trpc.localConnect.listDevices.useQuery(
    { restaurantId: selectedRestaurantId! },
    { enabled: !!selectedRestaurantId, refetchInterval: 10000 }
  );

  // Job-History laden
  const { data: jobHistory, refetch: refetchJobs } = trpc.localConnect.getJobHistory.useQuery(
    { restaurantId: selectedRestaurantId!, limit: 50 },
    { enabled: !!selectedRestaurantId, refetchInterval: 5000 }
  );

  // Mutations
  const generateToken = trpc.localConnect.generateOnboardingToken.useMutation({
    onSuccess: (data) => {
      setGeneratedQr(data.qrPayload);
      setQrDialogOpen(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeDevice = trpc.localConnect.removeDevice.useMutation({
    onSuccess: () => {
      toast.success("Gerät entfernt");
      refetchDevices();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedRestaurant = restaurants?.find((r: { id: number; name: string }) => r.id === selectedRestaurantId);
  const onlineCount = (devices as Array<{ isOnline: boolean }> | undefined)?.filter((d) => d.isOnline).length ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-primary" />
            Local Connect
          </h1>
          <p className="text-muted-foreground mt-1">
            Verwalte Local Connect Apps für direkten Drucker- und Hardware-Zugriff
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchDevices(); refetchJobs(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Restaurant-Auswahl */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Restaurant auswählen</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedRestaurantId?.toString() ?? ""}
            onValueChange={(v) => setSelectedRestaurantId(Number(v))}
          >
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Restaurant wählen…" />
            </SelectTrigger>
            <SelectContent>
              {(restaurants as Array<{ id: number; name: string }> | undefined)?.map((r) => (
                <SelectItem key={r.id} value={r.id.toString()}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedRestaurantId && (
        <>
          {/* Geräte */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Registrierte Geräte
                  {devices && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({onlineCount}/{devices.length} online)
                    </span>
                  )}
                </CardTitle>
                <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      onClick={() => generateToken.mutate({ restaurantId: selectedRestaurantId })}
                      disabled={generateToken.isPending}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Neues Gerät hinzufügen
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Gerät verbinden</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <p className="text-sm text-muted-foreground">
                        Öffne die <strong>SimplaPOS Local Connect App</strong> auf dem Gerät und scanne diesen QR-Code. Der Code ist 24 Stunden gültig und kann nur einmal verwendet werden.
                      </p>
                      {generatedQr && <QRCodeDisplay value={generatedQr} />}
                      <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
                        <strong>Restaurant:</strong> {selectedRestaurant?.name}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!devices || devices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Noch keine Geräte registriert.</p>
                  <p className="text-xs mt-1">Klicke auf "Neues Gerät hinzufügen" um die Local Connect App einzurichten.</p>
                </div>
              ) : (
                (devices as Array<{ id: number; deviceId: string; deviceName: string; platform: string; isOnline: boolean; lastSeenAt: Date | null; appVersion: string | null }>).map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onRemove={(deviceId) => removeDevice.mutate({ deviceId, restaurantId: selectedRestaurantId! })}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Job-History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Job-Protokoll (letzte 50)</CardTitle>
            </CardHeader>
            <CardContent>
              {!jobHistory || jobHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Noch keine Jobs verarbeitet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(jobHistory as Array<{ id: number; status: string; type: string; errorMessage: string | null; createdAt: Date }>).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                      <div className="flex items-center gap-3">
                        <JobStatusBadge status={job.status} />
                        <span className="font-medium capitalize">{job.type.replace(/_/g, " ")}</span>
                        {job.errorMessage && (
                          <span className="text-xs text-destructive truncate max-w-xs">{job.errorMessage}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">
                        {new Date(job.createdAt).toLocaleString("de-CH")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Anleitung */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <h3 className="font-semibold text-blue-900 mb-2">📱 So richtest du Local Connect ein</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Lade die <strong>SimplaPOS Local Connect</strong> App auf dem Gerät herunter</li>
                <li>Klicke oben auf "Neues Gerät hinzufügen"</li>
                <li>Scanne den QR-Code mit der App</li>
                <li>Das Gerät verbindet sich automatisch und erscheint in der Liste</li>
                <li>Ab jetzt werden Druckaufträge über dieses Gerät lokal ausgeführt</li>
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
