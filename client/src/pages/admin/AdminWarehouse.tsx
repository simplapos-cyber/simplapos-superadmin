import { useState, useMemo, useCallback } from "react";
import WarehouseQrScannerTab from "@/components/WarehouseQrScannerTab";
import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Warehouse, Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  Plus, RefreshCw, Thermometer, MapPin, QrCode, Truck, ClipboardList,
  CheckCircle2, XCircle, ShieldAlert, BarChart3, Trash2, Download,
  CalendarClock, FileText, Printer, ScanLine, Search, X, Filter
} from "lucide-react";
import { toast } from "sonner";

// ─── Typen ────────────────────────────────────────────────────────────────────
type ZoneType = "kuehl" | "tiefkuehl" | "trocken" | "keg" | "leergut" | "sonstige";

const ZONE_TYPE_CONFIG: Record<ZoneType, { label: string; color: string; icon: string }> = {
  kuehl:      { label: "Kühlraum",    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",   icon: "🧊" },
  tiefkuehl:  { label: "Tiefkühl",    color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",   icon: "❄️" },
  trocken:    { label: "Trockenlager",color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",icon: "📦" },
  keg:        { label: "Keg / Fass",  color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30", icon: "🍺" },
  leergut:    { label: "Leergut",     color: "text-gray-600 bg-gray-50 dark:bg-gray-950/30",   icon: "♻️" },
  sonstige:   { label: "Sonstige",    color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30", icon: "🗄️" },
};

const STATUS_DOT: Record<string, string> = {
  ok:       "bg-green-500",
  warning:  "bg-yellow-400",
  critical: "bg-red-500",
};

const LOSS_TYPES = [
  { value: "damage",  label: "Beschädigung / Bruch" },
  { value: "theft",   label: "Diebstahl / Verlust" },
  { value: "expiry",  label: "Ablauf / MHD" },
  { value: "other",   label: "Sonstiges" },
];

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  return new Date(date).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function AdminWarehouse() {
  const params = useParams<{ tab?: string }>();
  const [, navigate] = useLocation();
  const activeTab = params.tab ?? "dashboard";

  const utils = trpc.useUtils();

  // ── Daten ──────────────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = trpc.warehouse.getWarehouseStats.useQuery(undefined, { retry: false, throwOnError: false });
  const { data: zones, isLoading: zonesLoading } = trpc.warehouse.listZones.useQuery(undefined, { retry: false, throwOnError: false });
  const { data: locations } = trpc.warehouse.listLocations.useQuery({ zoneId: undefined }, { retry: false, throwOnError: false });
  const { data: orderList } = trpc.warehouse.generateOrderList.useQuery({ supplierId: undefined }, { retry: false, throwOnError: false });
  const { data: movements } = trpc.warehouse.getMovements.useQuery({ limit: 50, offset: 0 }, { retry: false, throwOnError: false });
  const { data: inventoryItemsData } = trpc.inventory.listItems.useQuery({ search: "" }, { retry: false, throwOnError: false });
  const { data: mhdSettings } = trpc.warehouse.getMhdSettings.useQuery(undefined, { retry: false, throwOnError: false });
  const mhdWarningDays = Number(mhdSettings?.mhdWarningDays ?? 3);
  const mhdWarningDaysSafe = Number.isFinite(mhdWarningDays) && mhdWarningDays >= 1 && mhdWarningDays <= 90 ? mhdWarningDays : 3;
  const { data: expiringData } = trpc.warehouse.getExpiringItems.useQuery({ days: mhdWarningDaysSafe }, { retry: false, throwOnError: false });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createZone = trpc.warehouse.createZone.useMutation({
    onSuccess: () => { utils.warehouse.listZones.invalidate(); utils.warehouse.getWarehouseStats.invalidate(); toast.success("Zone erstellt"); setZoneDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteZone = trpc.warehouse.deleteZone.useMutation({
    onSuccess: () => { utils.warehouse.listZones.invalidate(); toast.success("Zone gelöscht"); },
  });
  const createLocation = trpc.warehouse.createLocation.useMutation({
    onSuccess: () => { utils.warehouse.listLocations.invalidate(); toast.success("Lagerort erstellt"); setLocationDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const recordIncoming = trpc.warehouse.recordIncoming.useMutation({
    onSuccess: (r) => { utils.inventory.listItems.invalidate(); utils.warehouse.getMovements.invalidate(); utils.warehouse.getWarehouseStats.invalidate(); toast.success(`${r.count} Artikel eingebucht`); setIncomingDialog(false); resetIncoming(); },
    onError: (e) => toast.error(e.message),
  });
  const recordLoss = trpc.warehouse.recordLoss.useMutation({
    onSuccess: () => { utils.inventory.listItems.invalidate(); utils.warehouse.getMovements.invalidate(); utils.warehouse.getWarehouseStats.invalidate(); toast.success("Verlust gebucht"); setLossDialog(false); resetLoss(); },
    onError: (e) => toast.error(e.message),
  });
  const saveMhdSettings = trpc.warehouse.saveMhdSettings.useMutation({
    onSuccess: () => { utils.warehouse.getMhdSettings.invalidate(); utils.warehouse.getExpiringItems.invalidate(); toast.success("MHD-Einstellung gespeichert"); },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = trpc.inventory.updateItem.useMutation({
    onSuccess: () => { utils.inventory.listItems.invalidate(); utils.warehouse.getExpiringItems.invalidate(); toast.success("Artikel aktualisiert"); setMhdDialog(false); },
    onError: (e) => toast.error(e.message),
  });

  // ── Dialog-States ──────────────────────────────────────────────────────────
  const [zoneDialog, setZoneDialog] = useState(false);
  const [locationDialog, setLocationDialog] = useState(false);
  const [incomingDialog, setIncomingDialog] = useState(false);
  const [lossDialog, setLossDialog] = useState(false);
  const [mhdDialog, setMhdDialog] = useState(false);
  const [qrPdfLoading, setQrPdfLoading] = useState(false);

  // Zone-Form
  const [zoneName, setZoneName] = useState("");
  const [zoneType, setZoneType] = useState<ZoneType>("trocken");
  const [zoneTemp, setZoneTemp] = useState("");
  const [zoneSize, setZoneSize] = useState("");
  const [zoneDesc, setZoneDesc] = useState("");

  // Location-Form
  const [locZoneId, setLocZoneId] = useState<number | null>(null);
  const [locName, setLocName] = useState("");
  const [locShelf, setLocShelf] = useState("");

  // Incoming-Form
  const [incomingItems, setIncomingItems] = useState<{ itemId: number; quantity: number; unitCost: number }[]>([{ itemId: 0, quantity: 1, unitCost: 0 }]);
  const [incomingNotes, setIncomingNotes] = useState("");

  // Loss-Form
  const [lossItemId, setLossItemId] = useState<number>(0);
  const [lossQty, setLossQty] = useState<number>(1);
  const [lossType, setLossType] = useState<"damage" | "theft" | "expiry" | "other">("damage");
  const [lossReason, setLossReason] = useState("");

  // MHD-Form (QPM-7)
  const [mhdItemId, setMhdItemId] = useState<number>(0);
  const [mhdItemName, setMhdItemName] = useState<string>("");
  const [mhdChargeNr, setMhdChargeNr] = useState<string>("");
  const [mhdBestBefore, setMhdBestBefore] = useState<string>("");

  // QR-PDF Zone-Selector (QPM-5)
  const [qrZoneId, setQrZoneId] = useState<number | null>(null);
  // ── Such- & Filter-States ─────────────────────────────────────────────────
  const [zoneSearch, setZoneSearch] = useState("");
  const [zoneTypeFilter, setZoneTypeFilter] = useState<ZoneType | "all">("all");
  const [locationSearch, setLocationSearch] = useState("");
  const [locationZoneFilter, setLocationZoneFilter] = useState<number | "all">("all");
  const [articleSearch, setArticleSearch] = useState("");

  // MHD-Einstellungen State
  const [mhdDaysInput, setMhdDaysInput] = useState<number | null>(null);

  // ── Gefilterte Daten ──────────────────────────────────────────────────────
  const filteredZones = useMemo(() => {
    if (!zones) return [];
    return (zones as Array<{ id: number; name: string; type: ZoneType; tempCelsius: string | null; sizeM2: string | null; description: string | null; totalItems: number; criticalItems: number; warningItems: number; status: string }>).filter(z => {
      const matchSearch = !zoneSearch || z.name.toLowerCase().includes(zoneSearch.toLowerCase());
      const matchType = zoneTypeFilter === "all" || z.type === zoneTypeFilter;
      return matchSearch && matchType;
    });
  }, [zones, zoneSearch, zoneTypeFilter]);

  const filteredLocations = useMemo(() => {
    if (!locations) return [];
    return (locations as Array<{ id: number; name: string; zoneId: number; shelf: string | null; qrSlug: string; itemCount: number }>).filter(loc => {
      const matchSearch = !locationSearch || loc.name.toLowerCase().includes(locationSearch.toLowerCase()) || (loc.shelf ?? "").toLowerCase().includes(locationSearch.toLowerCase());
      const matchZone = locationZoneFilter === "all" || loc.zoneId === locationZoneFilter;
      return matchSearch && matchZone;
    });
  }, [locations, locationSearch, locationZoneFilter]);

  const highlightText = useCallback((text: string, query: string) => {
    if (!query || !text) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </span>
    );
  }, []);

  function resetIncoming() { setIncomingItems([{ itemId: 0, quantity: 1, unitCost: 0 }]); setIncomingNotes(""); }
  function resetLoss() { setLossItemId(0); setLossQty(1); setLossType("damage"); setLossReason(""); }

  const itemOptions = useMemo(() => {
    if (!inventoryItemsData?.items) return [];
    return inventoryItemsData.items.map((i: { id: number; name: string; unit: string; currentStock: string | null }) => ({
      id: i.id,
      label: `${i.name} (${i.unit}) – Bestand: ${parseFloat(i.currentStock ?? "0").toFixed(1)}`,
    }));
  }, [inventoryItemsData]);

  // ── Wareneingang: Zeilen-Management ───────────────────────────────────────
  function addIncomingRow() { setIncomingItems(prev => [...prev, { itemId: 0, quantity: 1, unitCost: 0 }]); }
  function removeIncomingRow(idx: number) { setIncomingItems(prev => prev.filter((_, i) => i !== idx)); }
  function updateIncomingRow(idx: number, field: "itemId" | "quantity" | "unitCost", val: number) {
    setIncomingItems(prev => prev.map((row, i) => i === idx ? { ...row, [field]: val } : row));
  }

  // ── QPM-5: QR-PDF herunterladen ───────────────────────────────────────────
  async function downloadQrPdf() {
    if (!qrZoneId) return;
    setQrPdfLoading(true);
    try {
      const resp = await fetch(`/api/warehouse/zone-qr-pdf?zoneId=${qrZoneId}`, { credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unbekannter Fehler" }));
        toast.error(err.error ?? "PDF-Generierung fehlgeschlagen");
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zone = zones?.find((z: { id: number; name: string }) => z.id === qrZoneId);
      a.download = `lager-qr-labels-${(zone?.name ?? "zone").replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR-Label-PDF heruntergeladen");
    } catch (err) {
      toast.error("Netzwerkfehler beim PDF-Download");
    } finally {
      setQrPdfLoading(false);
    }
  }

  // ── QPM-7: MHD-Dialog öffnen ──────────────────────────────────────────────
  function openMhdDialog(item: { id: number; name: string; chargeNr?: string | null; bestBefore?: Date | null }) {
    setMhdItemId(item.id);
    setMhdItemName(item.name);
    setMhdChargeNr(item.chargeNr ?? "");
    setMhdBestBefore(item.bestBefore ? new Date(item.bestBefore).toISOString().split("T")[0] : "");
    setMhdDialog(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            Lagerwirtschaft
          </h1>
          <p className="text-muted-foreground mt-1">Bestandsführung, Wareneingangskontrolle, Verlusterfassung</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { utils.warehouse.getWarehouseStats.invalidate(); utils.warehouse.listZones.invalidate(); utils.warehouse.getExpiringItems.invalidate(); }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIncomingDialog(true)}>
            <ArrowDownToLine className="h-4 w-4 mr-1.5" /> Wareneingang
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setLossDialog(true)}>
            <ShieldAlert className="h-4 w-4 mr-1.5" /> Verlust melden
          </Button>
        </div>
      </div>

      {/* QPM-6: MHD-Warnbanner ─────────────────────────────────────────────── */}
      {expiringData && expiringData.totalWarnings > 0 && (
        <div className="space-y-2">
          {expiringData.expired.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle className="font-bold">
                {expiringData.expired.length} Artikel abgelaufen (MHD überschritten)
              </AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  {expiringData.expired.slice(0, 5).map((item: {
                    id: number; name: string; unit: string; currentStock: string | null;
                    bestBefore: Date | null; expiresAt: Date | null; chargeNr: string | null;
                    locationName: string | null; zoneName: string | null;
                  }) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        {item.locationName && <span className="text-muted-foreground">{item.zoneName} › {item.locationName}</span>}
                        <span>Bestand: {parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit}</span>
                        <span className="font-bold">MHD: {formatDate(item.bestBefore ?? item.expiresAt)}</span>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => openMhdDialog(item)}>
                          <CalendarClock className="h-3 w-3 mr-1" /> MHD bearbeiten
                        </Button>
                      </div>
                    </div>
                  ))}
                  {expiringData.expired.length > 5 && (
                    <p className="text-xs text-muted-foreground">… und {expiringData.expired.length - 5} weitere</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          {expiringData.expiringSoon.length > 0 && (
            <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="font-bold text-amber-800 dark:text-amber-400">
                {expiringData.expiringSoon.length} Artikel laufen in den nächsten 3 Tagen ab
              </AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  {expiringData.expiringSoon.slice(0, 5).map((item: {
                    id: number; name: string; unit: string; currentStock: string | null;
                    bestBefore: Date | null; expiresAt: Date | null; chargeNr: string | null;
                    locationName: string | null; zoneName: string | null;
                  }) => {
                    const days = daysUntil(item.bestBefore ?? item.expiresAt);
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-amber-900 dark:text-amber-300">{item.name}</span>
                        <div className="flex items-center gap-3 text-xs">
                          {item.locationName && <span className="text-muted-foreground">{item.zoneName} › {item.locationName}</span>}
                          <span>Bestand: {parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit}</span>
                          <Badge variant="outline" className="text-amber-700 border-amber-400">
                            {days === 0 ? "Heute!" : days === 1 ? "Morgen" : `${days} Tage`}
                          </Badge>
                          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => openMhdDialog(item)}>
                            <CalendarClock className="h-3 w-3 mr-1" /> MHD
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {expiringData.expiringSoon.length > 5 && (
                    <p className="text-xs text-muted-foreground">… und {expiringData.expiringSoon.length - 5} weitere</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Package,       label: "Artikel total",      value: statsLoading ? "…" : stats?.totalItems ?? 0,             color: "text-blue-600" },
          { icon: AlertTriangle, label: "Warnung",            value: statsLoading ? "…" : stats?.warningItems ?? 0,           color: "text-yellow-600" },
          { icon: XCircle,       label: "Kritisch",           value: statsLoading ? "…" : stats?.criticalItems ?? 0,          color: "text-red-600" },
          { icon: Warehouse,     label: "Zonen",              value: statsLoading ? "…" : stats?.totalZones ?? 0,             color: "text-purple-600" },
          { icon: BarChart3,     label: "Buchungen (7 Tage)", value: statsLoading ? "…" : stats?.movementsLast7Days ?? 0,     color: "text-indigo-600" },
          { icon: ShieldAlert,   label: "Verlust CHF (30T)",  value: statsLoading ? "…" : `CHF ${(stats?.lossValueLast30Days ?? 0).toFixed(2)}`, color: "text-orange-600" },
        ].map(s => (
          <Card key={s.label} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-3">
              <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
              <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
              <p className="text-xl font-bold">{String(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={t => navigate(`/admin/warehouse/${t}`)}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard"><Warehouse className="h-4 w-4 mr-1.5" />Zonen</TabsTrigger>
          <TabsTrigger value="incoming"><ArrowDownToLine className="h-4 w-4 mr-1.5" />Wareneingang</TabsTrigger>
          <TabsTrigger value="outgoing"><ArrowUpFromLine className="h-4 w-4 mr-1.5" />Warenausgang</TabsTrigger>
          <TabsTrigger value="losses"><ShieldAlert className="h-4 w-4 mr-1.5" />Verluste</TabsTrigger>
          <TabsTrigger value="order"><ClipboardList className="h-4 w-4 mr-1.5" />Bestellliste</TabsTrigger>
          <TabsTrigger value="movements"><BarChart3 className="h-4 w-4 mr-1.5" />Protokoll</TabsTrigger>
          {/* QPM-5: QR-Druck Tab */}
          <TabsTrigger value="qr"><QrCode className="h-4 w-4 mr-1.5" />QR-Labels</TabsTrigger>
          {/* QPM-6/7: MHD-Tab */}
          <TabsTrigger value="mhd"><CalendarClock className="h-4 w-4 mr-1.5" />MHD-Tracking</TabsTrigger>
          {/* MHD-Einstellungen */}
          <TabsTrigger value="mhd-settings"><Thermometer className="h-4 w-4 mr-1.5" />MHD-Einstellungen</TabsTrigger>
          {/* QR-Scanner */}
          <TabsTrigger value="scanner" className="text-primary font-semibold">
            <ScanLine className="h-4 w-4 mr-1.5" />QR-Scanner
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: ZONEN ── */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-lg">Lagerräume & Zonen</h2>
            <Button size="sm" onClick={() => setZoneDialog(true)}><Plus className="h-4 w-4 mr-1" /> Zone hinzufügen</Button>
          </div>
          {/* ── Zonen Such- & Filterleiste ── */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zone suchen…"
                value={zoneSearch}
                onChange={e => setZoneSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {zoneSearch && (
                <button onClick={() => setZoneSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={zoneTypeFilter} onValueChange={v => setZoneTypeFilter(v as ZoneType | "all")}>
              <SelectTrigger className="h-8 text-sm w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {Object.entries(ZONE_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(zoneSearch || zoneTypeFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setZoneSearch(""); setZoneTypeFilter("all"); }}>
                <X className="h-3 w-3 mr-1" /> Filter zurücksetzen
              </Button>
            )}
          </div>
          {/* ── Zonen Such- & Filterleiste ── */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zone suchen…"
                value={zoneSearch}
                onChange={e => setZoneSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {zoneSearch && (
                <button onClick={() => setZoneSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={zoneTypeFilter} onValueChange={v => setZoneTypeFilter(v as ZoneType | "all")}>
              <SelectTrigger className="h-8 text-sm w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {Object.entries(ZONE_TYPE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(zoneSearch || zoneTypeFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setZoneSearch(""); setZoneTypeFilter("all"); }}>
                <X className="h-3 w-3 mr-1" /> Filter zurücksetzen
              </Button>
            )}
          </div>

          {zonesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <Card key={i} className="animate-pulse h-40" />)}
            </div>
          ) : !zones?.length ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Noch keine Zonen angelegt</p>
              <p className="text-sm mt-1">Klicke auf „Zone hinzufügen" um zu starten</p>
              <Button className="mt-4" onClick={() => setZoneDialog(true)}><Plus className="h-4 w-4 mr-1" /> Zone erstellen</Button>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredZones.length === 0 && (zoneSearch || zoneTypeFilter !== "all") ? (
                <div className="col-span-full text-center py-8 text-muted-foreground text-sm">
                  Keine Zonen gefunden
                </div>
              ) : filteredZones.map((zone: {
                id: number; name: string; type: ZoneType; tempCelsius: string | null;
                sizeM2: string | null; description: string | null;
                totalItems: number; criticalItems: number; warningItems: number; status: string;
              }) => {
                const cfg = ZONE_TYPE_CONFIG[zone.type] ?? ZONE_TYPE_CONFIG.sonstige;
                return (
                  <Card key={zone.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{cfg.icon}</span>
                          <div>
                            <CardTitle className="text-base">{highlightText(zone.name, zoneSearch)}</CardTitle>
                            <Badge variant="outline" className={`text-xs mt-0.5 ${cfg.color}`}>{cfg.label}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[zone.status] ?? "bg-gray-400"}`} />
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => deleteZone.mutate({ id: zone.id })}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="flex gap-3 text-sm text-muted-foreground">
                        {zone.tempCelsius && <span className="flex items-center gap-1"><Thermometer className="h-3.5 w-3.5" />{zone.tempCelsius}°C</span>}
                        {zone.sizeM2 && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{zone.sizeM2} m²</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/50 rounded p-1.5">
                          <p className="text-lg font-bold">{zone.totalItems}</p>
                          <p className="text-xs text-muted-foreground">Artikel</p>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded p-1.5">
                          <p className="text-lg font-bold text-yellow-600">{zone.warningItems}</p>
                          <p className="text-xs text-muted-foreground">Warnung</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-950/20 rounded p-1.5">
                          <p className="text-lg font-bold text-red-600">{zone.criticalItems}</p>
                          <p className="text-xs text-muted-foreground">Kritisch</p>
                        </div>
                      </div>
                      {zone.description && <p className="text-xs text-muted-foreground line-clamp-2">{zone.description}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Lagerorte */}
          <div className="flex justify-between items-center mt-6">
            <h2 className="font-semibold text-lg">Lagerorte / Regale</h2>
            <Button size="sm" variant="outline" onClick={() => setLocationDialog(true)}><Plus className="h-4 w-4 mr-1" /> Lagerort hinzufügen</Button>
          </div>
          {/* ── Lagerort Such- & Filterleiste ── */}
          <div className="flex flex-wrap gap-2 mb-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Lagerort oder Regal suchen…"
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {locationSearch && (
                <button onClick={() => setLocationSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={String(locationZoneFilter)} onValueChange={v => setLocationZoneFilter(v === "all" ? "all" : Number(v))}>
              <SelectTrigger className="h-8 text-sm w-[160px]">
                <Filter className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Alle Zonen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Zonen</SelectItem>
                {zones?.map((z: { id: number; name: string }) => (
                  <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(locationSearch || locationZoneFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setLocationSearch(""); setLocationZoneFilter("all"); }}>
                <X className="h-3 w-3 mr-1" /> Zurücksetzen
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              {!locations?.length ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Noch keine Lagerorte angelegt</p>
              ) : filteredLocations.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Keine Lagerorte gefunden</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 px-4">Name</th>
                      <th className="py-2 px-4">Zone</th>
                      <th className="py-2 px-4">Regal</th>
                      <th className="py-2 px-4">Artikel</th>
                      <th className="py-2 px-4">QR-Slug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLocations.map((loc: {
                      id: number; name: string; zoneId: number; shelf: string | null;
                      qrSlug: string; itemCount: number;
                    }) => {
                      const zone = zones?.find((z: { id: number; name: string }) => z.id === loc.zoneId);
                      return (
                        <tr key={loc.id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-4 font-medium">{highlightText(loc.name, locationSearch)}</td>
                          <td className="py-2 px-4 text-muted-foreground">{zone?.name ?? "–"}</td>
                          <td className="py-2 px-4 text-muted-foreground">{highlightText(loc.shelf ?? "–", locationSearch)}</td>
                          <td className="py-2 px-4"><Badge variant="secondary">{loc.itemCount}</Badge></td>
                          <td className="py-2 px-4 font-mono text-xs text-muted-foreground flex items-center gap-1">
                            <QrCode className="h-3 w-3" />{loc.qrSlug}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: WARENEINGANG ── */}
        <TabsContent value="incoming" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-green-600" /> Wareneingangskontrolle</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm mb-4">
                Erfasse alle angelieferten Waren. Der Bestand wird sofort aktualisiert und der Durchschnittspreis neu berechnet.
              </p>
              <Button onClick={() => setIncomingDialog(true)} className="bg-green-600 hover:bg-green-700">
                <ArrowDownToLine className="h-4 w-4 mr-2" /> Lieferung erfassen
              </Button>
              <div className="mt-6">
                <h3 className="font-medium mb-3">Letzte Eingänge</h3>
                {!movements?.length ? (
                  <p className="text-sm text-muted-foreground">Noch keine Buchungen</p>
                ) : (
                  <div className="space-y-2">
                    {movements.filter((m: { type: string }) => m.type === "purchase").slice(0, 10).map((m: {
                      id: number; itemName: string | null; quantity: string; unitCost: string | null;
                      notes: string | null; createdAt: Date;
                    }) => (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{m.itemName ?? "Unbekannt"}</p>
                          <p className="text-xs text-muted-foreground">{m.notes ?? ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">+{parseFloat(m.quantity).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("de-CH")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: WARENAUSGANG ── */}
        <TabsContent value="outgoing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowUpFromLine className="h-5 w-5 text-blue-600" /> Warenausgangskontrolle</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm mb-4">
                Manuelle Ausgangsbuchungen (z.B. Übergabe an Küche, Transfer zwischen Lagern). Verkäufe über POS werden automatisch abgezogen.
              </p>
              <div className="mt-4">
                <h3 className="font-medium mb-3">Letzte Ausgänge</h3>
                {!movements?.length ? (
                  <p className="text-sm text-muted-foreground">Noch keine Buchungen</p>
                ) : (
                  <div className="space-y-2">
                    {movements.filter((m: { type: string }) => ["sale", "transfer"].includes(m.type)).slice(0, 10).map((m: {
                      id: number; itemName: string | null; quantity: string; type: string;
                      notes: string | null; createdAt: Date;
                    }) => (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{m.itemName ?? "Unbekannt"}</p>
                          <p className="text-xs text-muted-foreground">{m.type === "sale" ? "Verkauf (POS)" : "Transfer"} {m.notes ? `– ${m.notes}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-blue-600">{parseFloat(m.quantity).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("de-CH")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: VERLUSTE ── */}
        <TabsContent value="losses" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-600" /> Verlust- & Schadenserfassung</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm mb-4">
                Erfasse Bruch, Diebstahl, abgelaufene Ware oder sonstige Verluste. Bei Diebstahl wird der Inhaber automatisch benachrichtigt.
              </p>
              <Button variant="destructive" onClick={() => setLossDialog(true)}>
                <ShieldAlert className="h-4 w-4 mr-2" /> Verlust melden
              </Button>
              <div className="mt-6">
                <h3 className="font-medium mb-3">Letzte Verluste</h3>
                {!movements?.length ? (
                  <p className="text-sm text-muted-foreground">Keine Verluste erfasst</p>
                ) : (
                  <div className="space-y-2">
                    {movements.filter((m: { type: string }) => m.type === "waste").slice(0, 10).map((m: {
                      id: number; itemName: string | null; quantity: string;
                      notes: string | null; createdAt: Date;
                    }) => (
                      <div key={m.id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-100 dark:border-red-900/30">
                        <div>
                          <p className="font-medium text-sm">{m.itemName ?? "Unbekannt"}</p>
                          <p className="text-xs text-muted-foreground">{m.notes ?? ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{parseFloat(m.quantity).toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("de-CH")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: BESTELLLISTE ── */}
        <TabsContent value="order" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-600" /> Automatische Bestellliste</CardTitle>
            </CardHeader>
            <CardContent>
              {!orderList ? (
                <p className="text-muted-foreground text-sm">Lade Bestellliste…</p>
              ) : orderList.totalItems === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="font-medium">Alle Bestände sind ausreichend</p>
                  <p className="text-sm text-muted-foreground mt-1">Kein Artikel liegt unter dem Bestellpunkt</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                      {orderList.totalItems} Artikel müssen bestellt werden
                    </p>
                  </div>
                  {orderList.groups.map((group: {
                    supplier: { id: number | null; name: string; email: string | null; phone: string | null; contactName: string | null };
                    items: Array<{ id: number; name: string; sku: string | null; unit: string; currentStock: string | null; reorderQty: string | null; costPerUnit: string | null }>;
                    totalEstimatedCost: number;
                  }) => (
                    <div key={group.supplier.id ?? "no_supplier"} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{group.supplier.name}</span>
                          {group.supplier.contactName && <span className="text-sm text-muted-foreground">({group.supplier.contactName})</span>}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          {group.supplier.email && <a href={`mailto:${group.supplier.email}`} className="text-primary hover:underline">{group.supplier.email}</a>}
                          <Badge variant="secondary">CHF {group.totalEstimatedCost.toFixed(2)}</Badge>
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="border-b">
                          <tr className="text-left text-muted-foreground">
                            <th className="py-2 px-4">Artikel</th>
                            <th className="py-2 px-4">Aktuell</th>
                            <th className="py-2 px-4">Bestellen</th>
                            <th className="py-2 px-4">Preis/Einheit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id} className="border-b hover:bg-muted/20">
                              <td className="py-2 px-4">
                                <p className="font-medium">{item.name}</p>
                                {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                              </td>
                              <td className="py-2 px-4 text-red-600 font-medium">{parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit}</td>
                              <td className="py-2 px-4 font-bold text-green-600">{parseFloat(item.reorderQty ?? "1").toFixed(0)} {item.unit}</td>
                              <td className="py-2 px-4 text-muted-foreground">
                                {item.costPerUnit ? `CHF ${parseFloat(item.costPerUnit).toFixed(2)}` : "–"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: PROTOKOLL ── */}
        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Buchungsprotokoll</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!movements?.length ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Noch keine Buchungen</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 px-4">Datum</th>
                      <th className="py-2 px-4">Artikel</th>
                      <th className="py-2 px-4">Typ</th>
                      <th className="py-2 px-4">Menge</th>
                      <th className="py-2 px-4">Bestand danach</th>
                      <th className="py-2 px-4">Notiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m: {
                      id: number; createdAt: Date; itemName: string | null; itemUnit: string | null;
                      type: string; quantity: string; stockAfter: string | null; notes: string | null;
                    }) => {
                      const qty = parseFloat(m.quantity);
                      const isPos = qty > 0;
                      const typeLabels: Record<string, string> = {
                        purchase: "Eingang", sale: "Verkauf", waste: "Verlust",
                        correction: "Korrektur", transfer: "Transfer", return: "Rückgabe", production: "Produktion"
                      };
                      return (
                        <tr key={m.id} className="border-b hover:bg-muted/20">
                          <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString("de-CH")} {new Date(m.createdAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-2 px-4 font-medium">{m.itemName ?? "–"}</td>
                          <td className="py-2 px-4">
                            <Badge variant="outline" className={m.type === "purchase" ? "text-green-600" : m.type === "waste" ? "text-red-600" : "text-blue-600"}>
                              {typeLabels[m.type] ?? m.type}
                            </Badge>
                          </td>
                          <td className={`py-2 px-4 font-bold ${isPos ? "text-green-600" : "text-red-600"}`}>
                            {isPos ? "+" : ""}{qty.toFixed(1)} {m.itemUnit ?? ""}
                          </td>
                          <td className="py-2 px-4 text-muted-foreground">{m.stockAfter ? parseFloat(m.stockAfter).toFixed(1) : "–"} {m.itemUnit ?? ""}</td>
                          <td className="py-2 px-4 text-muted-foreground text-xs max-w-[200px] truncate">{m.notes ?? "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── QPM-5: TAB: QR-LABELS ── */}
        <TabsContent value="qr" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" /> QR-Code-Labels drucken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-muted-foreground text-sm">
                Generiere ein druckbares A4-PDF mit QR-Code-Labels für alle Lagerorte einer Zone.
                Jedes Label enthält Zonenname, Lagerortname, Regal/Fach und einen QR-Code zum schnellen Scannen.
              </p>

              <div className="max-w-sm space-y-4">
                <div>
                  <Label>Zone auswählen *</Label>
                  <Select value={qrZoneId ? String(qrZoneId) : ""} onValueChange={v => setQrZoneId(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Zone wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones?.map((z: { id: number; name: string; type: ZoneType }) => {
                        const cfg = ZONE_TYPE_CONFIG[z.type] ?? ZONE_TYPE_CONFIG.sonstige;
                        return (
                          <SelectItem key={z.id} value={String(z.id)}>
                            {cfg.icon} {z.name}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {qrZoneId && (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Lagerorte in dieser Zone:</p>
                    {locations?.filter((l: { zoneId: number }) => l.zoneId === qrZoneId).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Keine Lagerorte in dieser Zone</p>
                    ) : (
                      <ul className="text-sm space-y-1">
                        {locations?.filter((l: { zoneId: number }) => l.zoneId === qrZoneId).map((l: { id: number; name: string; shelf: string | null }) => (
                          <li key={l.id} className="flex items-center gap-2">
                            <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{l.name}</span>
                            {l.shelf && <span className="text-muted-foreground text-xs">({l.shelf})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={downloadQrPdf}
                    disabled={!qrZoneId || qrPdfLoading}
                    className="flex-1"
                  >
                    {qrPdfLoading ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generiere PDF…</>
                    ) : (
                      <><Download className="h-4 w-4 mr-2" /> PDF herunterladen</>
                    )}
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Printer className="h-4 w-4" /> Druckanleitung
                </h3>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Zone auswählen und PDF herunterladen</li>
                  <li>PDF auf A4-Papier drucken (4 Labels pro Seite)</li>
                  <li>Labels ausschneiden und an den Lagerorten befestigen</li>
                  <li>QR-Code mit Tablet/Smartphone scannen für schnellen Zugriff</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: MHD-EINSTELLUNGEN ── */}
        <TabsContent value="mhd-settings" className="mt-4">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Thermometer className="h-5 w-5 text-primary" /> MHD-Warngrenze konfigurieren</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-muted-foreground text-sm">
                Lege fest, wie viele Tage vor Ablauf des Mindesthaltbarkeitsdatums eine Warnung angezeigt und eine
                automatische Benachrichtigung versendet wird. Standardwert: 3 Tage.
              </p>
              <div className="space-y-3">
                <Label htmlFor="mhd-days">Warngrenze (Tage vor MHD-Ablauf)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="mhd-days"
                    type="number"
                    min={1}
                    max={90}
                    className="w-32"
                    value={mhdDaysInput ?? mhdWarningDaysSafe}
                    onChange={e => setMhdDaysInput(Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">Tage</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aktuell aktiv: <strong>{mhdWarningDaysSafe} Tage</strong>. Gültige Werte: 1–90 Tage.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => saveMhdSettings.mutate({ mhdWarningDays: mhdDaysInput ?? mhdWarningDaysSafe })}
                  disabled={saveMhdSettings.isPending || (mhdDaysInput === null || mhdDaysInput === mhdWarningDaysSafe)}
                >
                  {saveMhdSettings.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Speichern…</> : "Einstellung speichern"}
                </Button>
                <Button variant="outline" onClick={() => setMhdDaysInput(null)}>Zurücksetzen</Button>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-medium mb-2 text-sm">Automatische Benachrichtigung</h3>
                <p className="text-sm text-muted-foreground">
                  Täglich um 07:00 Uhr (UTC) wird automatisch geprüft, ob Artikel kurz vor dem MHD-Ablauf stehen.
                  Du erhältst eine Benachrichtigung mit der Liste der betroffenen Artikel und deren Lagerorte.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── QPM-6/7: TAB: MHD-TRACKING ── */}
        <TabsContent value="mhd" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-600" /> MHD-Tracking (Mindesthaltbarkeitsdatum)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm mb-4">
                Verwalte Mindesthaltbarkeitsdaten und Chargennummern für alle Lagerartikel.
                Artikel die in den nächsten {mhdWarningDaysSafe} Tagen ablaufen werden oben als Warnung angezeigt.
              </p>

              {!inventoryItemsData?.items?.length ? (
                <p className="text-sm text-muted-foreground">Keine Artikel vorhanden</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 px-4">Artikel</th>
                      <th className="py-2 px-4">Bestand</th>
                      <th className="py-2 px-4">Chargennr.</th>
                      <th className="py-2 px-4">MHD</th>
                      <th className="py-2 px-4">Status</th>
                      <th className="py-2 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItemsData.items.map((item: {
                      id: number; name: string; unit: string; currentStock: string | null;
                      chargeNr?: string | null; bestBefore?: Date | null; expiresAt?: Date | null;
                    }) => {
                      const mhd = item.bestBefore ?? item.expiresAt;
                      const days = daysUntil(mhd);
                      let statusBadge = null;
                      if (mhd) {
                        if (days !== null && days < 0) {
                          statusBadge = <Badge variant="destructive">Abgelaufen</Badge>;
                        } else if (days !== null && days <= 3) {
                          statusBadge = <Badge className="bg-amber-500 text-white">Bald ({days}T)</Badge>;
                        } else {
                          statusBadge = <Badge variant="outline" className="text-green-600">OK</Badge>;
                        }
                      }
                      return (
                        <tr key={item.id} className="border-b hover:bg-muted/20">
                          <td className="py-2 px-4 font-medium">{item.name}</td>
                          <td className="py-2 px-4 text-muted-foreground">{parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit}</td>
                          <td className="py-2 px-4 font-mono text-xs">{item.chargeNr ?? <span className="text-muted-foreground">–</span>}</td>
                          <td className="py-2 px-4">{mhd ? formatDate(mhd) : <span className="text-muted-foreground">–</span>}</td>
                          <td className="py-2 px-4">{statusBadge ?? <span className="text-muted-foreground text-xs">Kein MHD</span>}</td>
                          <td className="py-2 px-4">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openMhdDialog(item)}>
                              <FileText className="h-3 w-3 mr-1" /> Bearbeiten
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG: ZONE ERSTELLEN ── */}
      <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Neue Lagerzone erstellen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="z.B. Kühlraum 1 – Getränke" /></div>
            <div><Label>Typ *</Label>
              <Select value={zoneType} onValueChange={v => setZoneType(v as ZoneType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ZONE_TYPE_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Temperatur (°C)</Label><Input type="number" value={zoneTemp} onChange={e => setZoneTemp(e.target.value)} placeholder="z.B. 5" /></div>
              <div><Label>Grösse (m²)</Label><Input type="number" value={zoneSize} onChange={e => setZoneSize(e.target.value)} placeholder="z.B. 28" /></div>
            </div>
            <div><Label>Beschreibung</Label><Textarea value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} placeholder="Optionale Beschreibung" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneDialog(false)}>Abbrechen</Button>
            <Button onClick={() => createZone.mutate({ name: zoneName, type: zoneType, tempCelsius: zoneTemp ? parseFloat(zoneTemp) : undefined, sizeM2: zoneSize ? parseFloat(zoneSize) : undefined, description: zoneDesc || undefined })} disabled={!zoneName || createZone.isPending}>
              {createZone.isPending ? "Erstelle…" : "Zone erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: LAGERORT ERSTELLEN ── */}
      <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Neuen Lagerort hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Zone *</Label>
              <Select value={locZoneId ? String(locZoneId) : ""} onValueChange={v => setLocZoneId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Zone wählen…" /></SelectTrigger>
                <SelectContent>
                  {zones?.map((z: { id: number; name: string }) => <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Name *</Label><Input value={locName} onChange={e => setLocName(e.target.value)} placeholder="z.B. Regal A – Reihe 2" /></div>
            <div><Label>Regal / Fach</Label><Input value={locShelf} onChange={e => setLocShelf(e.target.value)} placeholder="z.B. A2" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialog(false)}>Abbrechen</Button>
            <Button onClick={() => createLocation.mutate({ zoneId: locZoneId!, name: locName, shelf: locShelf || undefined })} disabled={!locZoneId || !locName || createLocation.isPending}>
              {createLocation.isPending ? "Erstelle…" : "Lagerort erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: WARENEINGANG ── */}
      <Dialog open={incomingDialog} onOpenChange={setIncomingDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5 text-green-600" /> Wareneingang erfassen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {incomingItems.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 items-end">
                <div>
                  {idx === 0 && <Label className="text-xs">Artikel</Label>}
                  <Select value={row.itemId ? String(row.itemId) : ""} onValueChange={v => updateIncomingRow(idx, "itemId", Number(v))}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Artikel wählen…" /></SelectTrigger>
                    <SelectContent>
                      {itemOptions.map((o: { id: number; label: string }) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs">Menge</Label>}
                  <Input type="number" min="0.001" step="0.1" value={row.quantity} onChange={e => updateIncomingRow(idx, "quantity", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  {idx === 0 && <Label className="text-xs">Preis/Einh.</Label>}
                  <Input type="number" min="0" step="0.01" value={row.unitCost} onChange={e => updateIncomingRow(idx, "unitCost", parseFloat(e.target.value) || 0)} placeholder="CHF" />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeIncomingRow(idx)} disabled={incomingItems.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addIncomingRow}><Plus className="h-4 w-4 mr-1" /> Zeile hinzufügen</Button>
            <div><Label>Notiz / Lieferschein-Nr.</Label><Input value={incomingNotes} onChange={e => setIncomingNotes(e.target.value)} placeholder="z.B. Lieferschein #12345" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIncomingDialog(false); resetIncoming(); }}>Abbrechen</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => recordIncoming.mutate({ items: incomingItems.filter(r => r.itemId > 0).map(r => ({ itemId: r.itemId, quantity: r.quantity, unitCost: r.unitCost > 0 ? r.unitCost : undefined })), generalNotes: incomingNotes || undefined })}
              disabled={incomingItems.every(r => r.itemId === 0) || recordIncoming.isPending}
            >
              {recordIncoming.isPending ? "Buche…" : "Eingang buchen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: VERLUST ── */}
      <Dialog open={lossDialog} onOpenChange={setLossDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><ShieldAlert className="h-5 w-5" /> Verlust / Schaden melden</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Artikel *</Label>
              <Select value={lossItemId ? String(lossItemId) : ""} onValueChange={v => setLossItemId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Artikel wählen…" /></SelectTrigger>
                <SelectContent>
                  {itemOptions.map((o: { id: number; label: string }) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Menge *</Label><Input type="number" min="0.001" step="0.1" value={lossQty} onChange={e => setLossQty(parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Verlusttyp *</Label>
                <Select value={lossType} onValueChange={v => setLossType(v as typeof lossType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOSS_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Begründung * (min. 5 Zeichen)</Label><Textarea value={lossReason} onChange={e => setLossReason(e.target.value)} placeholder="z.B. Flasche beim Transport zerbrochen" rows={3} /></div>
            {lossType === "theft" && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg text-sm text-red-700 dark:text-red-400 flex gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Bei Diebstahl wird der Inhaber automatisch benachrichtigt.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLossDialog(false); resetLoss(); }}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => recordLoss.mutate({ itemId: lossItemId, quantity: lossQty, lossType, reason: lossReason })} disabled={!lossItemId || lossQty <= 0 || lossReason.length < 5 || recordLoss.isPending}>
              {recordLoss.isPending ? "Buche…" : "Verlust buchen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QPM-7: DIALOG: MHD & CHARGENNR BEARBEITEN ── */}
      <Dialog open={mhdDialog} onOpenChange={setMhdDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              MHD & Charge: {mhdItemName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Chargennummer (Lot/Batch)</Label>
              <Input
                value={mhdChargeNr}
                onChange={e => setMhdChargeNr(e.target.value)}
                placeholder="z.B. LOT-2024-001 oder 240615"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Chargennummer vom Lieferanten oder eigene Kennzeichnung
              </p>
            </div>
            <div>
              <Label>Mindesthaltbarkeitsdatum (MHD)</Label>
              <Input
                type="date"
                value={mhdBestBefore}
                onChange={e => setMhdBestBefore(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Datum auf der Verpackung. Artikel werden 3 Tage vorher als Warnung angezeigt.
              </p>
            </div>
            {mhdBestBefore && (
              <div className={`p-3 rounded-lg text-sm ${
                daysUntil(new Date(mhdBestBefore)) !== null && daysUntil(new Date(mhdBestBefore))! < 0
                  ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
                  : daysUntil(new Date(mhdBestBefore)) !== null && daysUntil(new Date(mhdBestBefore))! <= 3
                  ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
                  : "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400"
              }`}>
                {(() => {
                  const d = daysUntil(new Date(mhdBestBefore));
                  if (d === null) return null;
                  if (d < 0) return `⚠️ Bereits abgelaufen (vor ${Math.abs(d)} Tagen)`;
                  if (d === 0) return "⚠️ Läuft heute ab!";
                  if (d === 1) return "⚠️ Läuft morgen ab";
                  if (d <= 3) return `⚠️ Läuft in ${d} Tagen ab`;
                  return `✓ Noch ${d} Tage haltbar`;
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMhdDialog(false)}>Abbrechen</Button>
            <Button
              onClick={() => updateItem.mutate({
                id: mhdItemId,
                chargeNr: mhdChargeNr || null,
                bestBefore: mhdBestBefore ? new Date(mhdBestBefore) : null,
              })}
              disabled={updateItem.isPending}
            >
              {updateItem.isPending ? "Speichere…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── TAB: QR-SCANNER ── */}
      <TabsContent value="scanner" className="mt-4">
        {activeTab === "scanner" && <WarehouseQrScannerTab />}
      </TabsContent>
    </div>
  );
}
