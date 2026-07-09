import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Thermometer, RefreshCw, FileDown, AlertTriangle, CheckCircle2 } from "lucide-react";

interface TempDevice {
  id: number;
  name: string;
  category: string;
  location: string | null;
  isOnline: boolean;
  minThreshold: number | null;
  maxThreshold: number | null;
}

interface TempReading {
  deviceId: number;
  value: number;
  recordedAt: number;
}

export default function SmartBuildingTemperature() {
  const [days, setDays] = useState("7");

  const devices = trpc.tuya.listDevices.useQuery();
  const tempDevices: TempDevice[] = (devices.data ?? [])
    .filter((d: { category: string }) => d.category === "temperature") as TempDevice[];

  const readings = trpc.tuya.getTemperatureReadings.useQuery({ days: parseInt(days) });

  const exportHaccp = trpc.tuya.exportHaccpReport.useMutation({
    onSuccess: (data: { csv: string }) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HACCP_Temperaturprotokoll_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("HACCP-Protokoll exportiert");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Gruppiere Readings nach Gerät-ID
  const readingsByDevice: Record<number, TempReading[]> = {};
  (readings.data as TempReading[] | undefined)?.forEach((r: TempReading) => {
    if (!readingsByDevice[r.deviceId]) readingsByDevice[r.deviceId] = [];
    readingsByDevice[r.deviceId].push(r);
  });

  const getStatusColor = (temp: number, min: number | null, max: number | null) => {
    if (min !== null && temp < min) return "text-blue-500";
    if (max !== null && temp > max) return "text-red-500";
    return "text-green-500";
  };

  const getLatestReading = (deviceId: number): TempReading | null => {
    const rs = readingsByDevice[deviceId];
    if (!rs || rs.length === 0) return null;
    return rs[rs.length - 1] ?? null;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Thermometer className="h-6 w-6 text-orange-500" />
            Temperaturkontrolle
          </h1>
          <p className="text-muted-foreground text-sm mt-1">HACCP-konforme Temperaturüberwachung aller Kühleinheiten</p>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Heute</SelectItem>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
              <SelectItem value="90">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => readings.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => exportHaccp.mutate({ days: parseInt(days) })} disabled={exportHaccp.isPending}>
            <FileDown className="h-4 w-4 mr-1" />
            HACCP-Export
          </Button>
        </div>
      </div>

      {/* Aktuelle Temperaturen */}
      {tempDevices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Thermometer className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Keine Temperatursensoren</p>
            <p className="text-sm text-muted-foreground mt-1">Füge unter Smart Building Temperatursensoren hinzu</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tempDevices.map((device: TempDevice) => {
            const latest = getLatestReading(device.id);
            const temp = latest?.value ?? null;
            const statusColor = temp !== null ? getStatusColor(temp, device.minThreshold, device.maxThreshold) : "text-slate-400";
            const isAlert = temp !== null && (
              (device.minThreshold !== null && temp < device.minThreshold) ||
              (device.maxThreshold !== null && temp > device.maxThreshold)
            );

            return (
              <Card key={device.id} className={isAlert ? "border-red-500/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{device.name}</span>
                    {device.isOnline ? (
                      <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10 text-xs">Online</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 text-xs">Offline</Badge>
                    )}
                  </CardTitle>
                  {device.location && <p className="text-xs text-muted-foreground">{device.location}</p>}
                </CardHeader>
                <CardContent>
                  <div className={`text-4xl font-bold ${statusColor}`}>
                    {temp !== null ? `${temp.toFixed(1)}°C` : "—"}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {device.minThreshold !== null && <span>Min: {device.minThreshold}°C</span>}
                    {device.maxThreshold !== null && <span>Max: {device.maxThreshold}°C</span>}
                  </div>
                  {isAlert && (
                    <div className="mt-2 flex items-center gap-1 text-red-500 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Grenzwert überschritten!</span>
                    </div>
                  )}
                  {!isAlert && temp !== null && (
                    <div className="mt-2 flex items-center gap-1 text-green-500 text-xs">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Temperatur im Normbereich</span>
                    </div>
                  )}
                  {latest && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Letzte Messung: {new Date(latest.recordedAt).toLocaleString("de-CH")}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Verlaufstabelle */}
      {readings.data && (readings.data as TempReading[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Temperaturverlauf – letzte {days} Tage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Zeitpunkt</th>
                    <th className="text-left py-2 pr-4">Gerät</th>
                    <th className="text-right py-2 pr-4">Temperatur</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(readings.data as TempReading[]).slice(-50).reverse().map((r: TempReading, i: number) => {
                    const device = tempDevices.find((d: TempDevice) => d.id === r.deviceId);
                    const isOk = device
                      ? (device.minThreshold === null || r.value >= device.minThreshold) &&
                        (device.maxThreshold === null || r.value <= device.maxThreshold)
                      : true;
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 pr-4 text-muted-foreground text-xs">
                          {new Date(r.recordedAt).toLocaleString("de-CH")}
                        </td>
                        <td className="py-1.5 pr-4 font-medium">{device?.name ?? String(r.deviceId)}</td>
                        <td className={`py-1.5 pr-4 text-right font-mono ${isOk ? "text-green-500" : "text-red-500"}`}>
                          {r.value.toFixed(1)}°C
                        </td>
                        <td className="py-1.5">
                          {isOk ? (
                            <span className="text-green-500 text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />OK</span>
                          ) : (
                            <span className="text-red-500 text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Alarm</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
