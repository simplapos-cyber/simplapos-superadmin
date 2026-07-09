import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Warehouse, Package, MapPin, AlertTriangle, CheckCircle2,
  XCircle, CalendarClock, Thermometer, QrCode
} from "lucide-react";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  return new Date(date).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type MhdStatus = "ok" | "warning" | "expired";

function MhdBadge({ status, days }: { status: MhdStatus; days: number | null }) {
  if (status === "expired") {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" /> Abgelaufen
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge className="bg-amber-500 text-white flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        {days === 0 ? "Heute!" : days === 1 ? "Morgen" : `${days} Tage`}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-600 border-green-400 flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" /> OK
    </Badge>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function WarehouseQrScan() {
  const [match, params] = useRoute("/lager/:qrSlug");
  const qrSlug = match ? (params as { qrSlug: string }).qrSlug : null;

  const { data, isLoading, error } = trpc.warehouse.getLocationBySlug.useQuery(
    { slug: qrSlug ?? "" },
    { enabled: !!qrSlug, retry: false }
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <Card>
            <CardContent className="pt-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Fehler / nicht gefunden ────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <QrCode className="h-16 w-16 mx-auto text-muted-foreground opacity-40" />
            <h2 className="text-xl font-bold">Lagerort nicht gefunden</h2>
            <p className="text-muted-foreground text-sm">
              Dieser QR-Code ist ungültig oder der Lagerort wurde gelöscht.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { location, items, scannedAt } = data;

  // Zähler
  const expiredCount = items.filter((i: { mhdStatus: MhdStatus }) => i.mhdStatus === "expired").length;
  const warningCount = items.filter((i: { mhdStatus: MhdStatus }) => i.mhdStatus === "warning").length;
  const criticalStockCount = items.filter((i: { currentStock: string | null; minStock: string | null }) =>
    parseFloat(i.currentStock ?? "0") <= parseFloat(i.minStock ?? "0")
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center pt-4 pb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-3">
            <Warehouse className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          {location.zoneName && (
            <p className="text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <MapPin className="h-4 w-4" />
              {location.zoneName}
              {location.shelf && <span className="text-xs ml-1">· Regal {location.shelf}</span>}
              {location.compartment && <span className="text-xs">· Fach {location.compartment}</span>}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Gescannt: {new Date(scannedAt).toLocaleString("de-CH")}
          </p>
        </div>

        {/* Warnungen */}
        {(expiredCount > 0 || warningCount > 0 || criticalStockCount > 0) && (
          <div className="space-y-2">
            {expiredCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                <XCircle className="h-4 w-4 flex-shrink-0" />
                <span><strong>{expiredCount} Artikel</strong> mit abgelaufenem MHD – bitte sofort prüfen!</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span><strong>{warningCount} Artikel</strong> laufen bald ab</span>
              </div>
            )}
            {criticalStockCount > 0 && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg text-sm text-orange-700 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span><strong>{criticalStockCount} Artikel</strong> unter Mindestbestand</span>
              </div>
            )}
          </div>
        )}

        {/* Artikelliste */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-primary" />
              Artikel an diesem Lagerort
              <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Keine Artikel an diesem Lagerort</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item: {
                  id: number;
                  name: string;
                  unit: string;
                  currentStock: string | null;
                  minStock: string | null;
                  bestBefore: Date | null;
                  chargeNr: string | null;
                  category: string | null;
                  mhdStatus: MhdStatus;
                }) => {
                  const stock = parseFloat(item.currentStock ?? "0");
                  const minStock = parseFloat(item.minStock ?? "0");
                  const isLowStock = stock <= minStock;
                  const days = daysUntil(item.bestBefore);

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        item.mhdStatus === "expired"
                          ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
                          : item.mhdStatus === "warning"
                          ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                          : isLowStock
                          ? "border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/20"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.name}</p>
                          {item.category && (
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {item.mhdStatus !== "ok" ? (
                            <MhdBadge status={item.mhdStatus} days={days} />
                          ) : isLowStock ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">
                              Tief
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {/* Bestand */}
                        <span className={`flex items-center gap-1 font-medium ${isLowStock ? "text-orange-600" : "text-foreground"}`}>
                          <Package className="h-3 w-3" />
                          {stock.toFixed(1)} {item.unit}
                          {isLowStock && minStock > 0 && (
                            <span className="text-orange-500">(Min: {minStock.toFixed(1)})</span>
                          )}
                        </span>

                        {/* MHD */}
                        {item.bestBefore && (
                          <span className={`flex items-center gap-1 ${
                            item.mhdStatus === "expired" ? "text-red-600 font-medium" :
                            item.mhdStatus === "warning" ? "text-amber-600 font-medium" : ""
                          }`}>
                            <CalendarClock className="h-3 w-3" />
                            MHD: {formatDate(item.bestBefore)}
                          </span>
                        )}

                        {/* Charge */}
                        {item.chargeNr && (
                          <span className="flex items-center gap-1 font-mono">
                            <Thermometer className="h-3 w-3" />
                            Ch: {item.chargeNr}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-6">
          <p>Simplapos Lagerwirtschaft</p>
          <p className="mt-0.5">Diese Seite ist nur für autorisiertes Personal bestimmt.</p>
        </div>
      </div>
    </div>
  );
}
