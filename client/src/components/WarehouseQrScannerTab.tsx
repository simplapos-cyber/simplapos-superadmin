/**
 * WarehouseQrScannerTab
 *
 * In-App QR-Code-Scanner für die Lagerverwaltung.
 * Mitarbeiter muss eingeloggt sein. Der Scanner erkennt Lagerort-QR-Codes
 * und zeigt ausschliesslich Lager-Aktionen (kein Tisch/Bestellung-Kontext).
 *
 * Aktionen nach Scan:
 *  - Wareneingang buchen (Artikel auswählen, Menge, Preis, Lieferant)
 *  - Verlust/Bruch melden
 *  - Bestand prüfen (alle Artikel an diesem Lagerort)
 *  - Bestandskorrektur (Inventur)
 */
import { useState, useEffect, useRef, useCallback } from "react";
// html5-qrcode wird dynamisch geladen (nur wenn Scanner aktiv) um Ladeprobleme zu vermeiden
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  QrCode, ScanLine, Package, ArrowDownToLine, ShieldAlert,
  ClipboardList, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  CalendarClock, Warehouse, ChevronLeft, Plus, Trash2
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────

type ScannedLocation = {
  id: number;
  name: string;
  shelf: string | null;
  compartment: string | null;
  zoneId: number;
  qrSlug: string;
  restaurantId: number;
  isActive: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ScannedItem = {
  id: number;
  name: string;
  unit: string;
  currentStock: string | null;
  minStock: string | null;
  reorderPoint: string | null;
  sku: string | null;
  ean: string | null;
};

type ScanResult = {
  location: ScannedLocation;
  items: ScannedItem[];
  zoneName?: string;
};

type ActionMode = "menu" | "incoming" | "loss" | "stock" | "correction";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function stockStatus(item: ScannedItem): "ok" | "low" | "critical" {
  const stock = parseFloat(item.currentStock ?? "0");
  const min = parseFloat(item.minStock ?? "0");
  const reorder = parseFloat(item.reorderPoint ?? "0");
  if (stock <= 0) return "critical";
  if (reorder > 0 && stock <= reorder) return "low";
  if (min > 0 && stock <= min) return "low";
  return "ok";
}

function StockBadge({ item }: { item: ScannedItem }) {
  const status = stockStatus(item);
  if (status === "critical")
    return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Leer</Badge>;
  if (status === "low")
    return <Badge className="bg-amber-500 text-white text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tief</Badge>;
  return <Badge variant="outline" className="text-green-600 border-green-400 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>;
}

// ─── Wareneingang-Dialog ──────────────────────────────────────────────────────

type IncomingEntry = { itemId: number; quantity: string; unitCost: string; notes: string };

function IncomingDialog({
  open, onClose, location, items, onSuccess
}: {
  open: boolean;
  onClose: () => void;
  location: ScannedLocation;
  items: ScannedItem[];
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: suppliers } = trpc.inventory.listSuppliers.useQuery();
  const [entries, setEntries] = useState<IncomingEntry[]>([
    { itemId: 0, quantity: "", unitCost: "", notes: "" }
  ]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [generalNotes, setGeneralNotes] = useState("");

  const recordIncoming = trpc.warehouse.recordIncoming.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} Artikel eingebucht`);
      utils.warehouse.getLocationByQrSlug.invalidate();
      utils.inventory.listItems.invalidate();
      utils.warehouse.getWarehouseStats.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function addEntry() {
    setEntries(prev => [...prev, { itemId: 0, quantity: "", unitCost: "", notes: "" }]);
  }

  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx));
  }

  function updateEntry(idx: number, field: keyof IncomingEntry, value: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  function handleSubmit() {
    const validEntries = entries.filter(e => e.itemId > 0 && parseFloat(e.quantity) > 0);
    if (validEntries.length === 0) {
      toast.error("Bitte mindestens einen Artikel mit Menge angeben");
      return;
    }
    recordIncoming.mutate({
      locationId: location.id,
      generalNotes: generalNotes || undefined,
      items: validEntries.map(e => ({
        itemId: e.itemId,
        quantity: parseFloat(e.quantity),
        unitCost: e.unitCost ? parseFloat(e.unitCost) : undefined,
        notes: e.notes || undefined,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-green-600" />
            Wareneingang – {location.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Lieferant */}
          <div className="space-y-1.5">
            <Label>Lieferant (optional)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Lieferant auswählen…" /></SelectTrigger>
              <SelectContent>
                {suppliers?.map((s: { id: number; name: string }) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Artikel-Einträge */}
          <div className="space-y-3">
            <Label>Artikel</Label>
            {entries.map((entry, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Artikel {idx + 1}</span>
                  {entries.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                      onClick={() => removeEntry(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Select
                  value={entry.itemId > 0 ? String(entry.itemId) : ""}
                  onValueChange={v => updateEntry(idx, "itemId", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Artikel auswählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name} ({item.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Menge *</Label>
                    <Input
                      type="number" min="0.001" step="0.001" placeholder="0"
                      value={entry.quantity}
                      onChange={e => updateEntry(idx, "quantity", e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Preis/Einheit (CHF)</Label>
                    <Input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={entry.unitCost}
                      onChange={e => updateEntry(idx, "unitCost", e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                <Input
                  placeholder="Notiz (optional)"
                  value={entry.notes}
                  onChange={e => updateEntry(idx, "notes", e.target.value)}
                  className="h-9"
                />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEntry} className="w-full">
              <Plus className="h-4 w-4 mr-1.5" /> Weiteren Artikel hinzufügen
            </Button>
          </div>

          {/* Allgemeine Notiz */}
          <div className="space-y-1.5">
            <Label>Allgemeine Notiz</Label>
            <Input
              placeholder="z.B. Lieferschein Nr. 12345"
              value={generalNotes}
              onChange={e => setGeneralNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={recordIncoming.isPending}
            className="bg-green-600 hover:bg-green-700 text-white">
            {recordIncoming.isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Buchen…</>
              : <><ArrowDownToLine className="h-4 w-4 mr-2" />Wareneingang buchen</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Verlust-Dialog ───────────────────────────────────────────────────────────

function LossDialog({
  open, onClose, location, items, onSuccess
}: {
  open: boolean;
  onClose: () => void;
  location: ScannedLocation;
  items: ScannedItem[];
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const [itemId, setItemId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [lossType, setLossType] = useState<"damage" | "theft" | "expiry" | "other">("damage");
  const [reason, setReason] = useState("");

  const recordLoss = trpc.warehouse.recordLoss.useMutation({
    onSuccess: () => {
      toast.success("Verlust gebucht");
      utils.warehouse.getLocationByQrSlug.invalidate();
      utils.inventory.listItems.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!itemId || !quantity || !reason) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    recordLoss.mutate({
      itemId: parseInt(itemId),
      quantity: parseFloat(quantity),
      lossType,
      reason,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Verlust melden – {location.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Artikel *</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue placeholder="Artikel auswählen…" /></SelectTrigger>
              <SelectContent>
                {items.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} (Bestand: {parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Menge *</Label>
              <Input type="number" min="0.001" step="0.001" placeholder="0"
                value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Verlusttyp *</Label>
              <Select value={lossType} onValueChange={v => setLossType(v as typeof lossType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Bruch/Schaden</SelectItem>
                  <SelectItem value="expiry">MHD abgelaufen</SelectItem>
                  <SelectItem value="theft">Diebstahl</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Begründung * (min. 5 Zeichen)</Label>
            <Input placeholder="z.B. Flasche beim Einräumen zerbrochen"
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={recordLoss.isPending}>
            {recordLoss.isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Buchen…</>
              : <><ShieldAlert className="h-4 w-4 mr-2" />Verlust buchen</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bestandskorrektur-Dialog ─────────────────────────────────────────────────

function CorrectionDialog({
  open, onClose, items, onSuccess
}: {
  open: boolean;
  onClose: () => void;
  items: ScannedItem[];
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const [itemId, setItemId] = useState<string>("");
  const [newStock, setNewStock] = useState("");
  const [notes, setNotes] = useState("");

  const selectedItem = items.find(i => String(i.id) === itemId);
  const currentStock = parseFloat(selectedItem?.currentStock ?? "0");
  const diff = newStock ? parseFloat(newStock) - currentStock : 0;

  const adjustStock = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      toast.success("Bestand korrigiert");
      utils.warehouse.getLocationByQrSlug.invalidate();
      utils.inventory.listItems.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!itemId || !newStock) {
      toast.error("Bitte Artikel und neuen Bestand angeben");
      return;
    }
    const target = parseFloat(newStock);
    if (target === currentStock) {
      toast.info("Kein Unterschied zum aktuellen Bestand");
      return;
    }
    const absDiff = Math.abs(diff);
    if (absDiff === 0) return;
    adjustStock.mutate({
      itemId: parseInt(itemId),
      quantity: absDiff,
      type: "correction",
      notes: notes || `Inventur-Korrektur: ${currentStock.toFixed(1)} → ${target.toFixed(1)} ${selectedItem?.unit}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Bestandskorrektur (Inventur)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Artikel *</Label>
            <Select value={itemId} onValueChange={v => { setItemId(v); setNewStock(""); }}>
              <SelectTrigger><SelectValue placeholder="Artikel auswählen…" /></SelectTrigger>
              <SelectContent>
                {items.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name} (aktuell: {parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedItem && (
            <div className="p-3 bg-muted/40 rounded-lg text-sm">
              <span className="text-muted-foreground">Aktueller Bestand: </span>
              <strong>{currentStock.toFixed(3)} {selectedItem.unit}</strong>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tatsächlicher Bestand (Ist-Wert) *</Label>
            <Input type="number" min="0" step="0.001" placeholder="0"
              value={newStock} onChange={e => setNewStock(e.target.value)} />
            {newStock && diff !== 0 && (
              <p className={`text-xs font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                Differenz: {diff > 0 ? "+" : ""}{diff.toFixed(3)} {selectedItem?.unit}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notiz (optional)</Label>
            <Input placeholder="z.B. Jahresinventur 2025"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={adjustStock.isPending}>
            {adjustStock.isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Speichern…</>
              : <><ClipboardList className="h-4 w-4 mr-2" />Korrektur speichern</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function WarehouseQrScannerTab() {
  const [scannerActive, setScannerActive] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>("menu");
  const [manualSlug, setManualSlug] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Lagerort per Slug auflösen (protected – Mitarbeiter muss eingeloggt sein)
  const lookupMutation = trpc.warehouse.getLocationByQrSlug.useQuery(
    { qrSlug: "" },
    { enabled: false }
  );

  const resolveSlug = useCallback(async (slug: string) => {
    if (!slug.trim()) return;
    setIsLookingUp(true);
    setScanError(null);
    try {
      const result = await utils.warehouse.getLocationByQrSlug.fetch({ qrSlug: slug.trim() });
      setScanResult(result as ScanResult);
      setActionMode("menu");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lagerort nicht gefunden";
      setScanError(msg);
      setScanResult(null);
    } finally {
      setIsLookingUp(false);
    }
  }, [utils]);

  // Kamera-Scanner starten
  const startScanner = useCallback(async () => {
    setScanError(null);
    setScanResult(null);
    setScannerActive(true);
  }, []);

  useEffect(() => {
    if (!scannerActive) return;
    const scannerId = "warehouse-qr-scanner-viewport";
    let scanner: any = null;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText: string) => {
            await scanner.stop().catch(() => {});
            setScannerActive(false);
            await resolveSlug(decodedText);
          },
          (_errorMessage: string) => { /* Scan-Fehler ignorieren */ }
        );
      } catch (_err) {
        if (!cancelled) {
          setScanError("Kamera konnte nicht geöffnet werden. Bitte Kamera-Berechtigung prüfen.");
          setScannerActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) scanner.stop().catch(() => {});
    };
  }, [scannerActive, resolveSlug]);

  // Scanner stoppen
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScannerActive(false);
  }, []);

  function reset() {
    setScanResult(null);
    setScanError(null);
    setManualSlug("");
    setActionMode("menu");
  }

  // ── Render: Scanner-Ansicht ────────────────────────────────────────────────
  if (scannerActive) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary animate-pulse" />
            QR-Code scannen
          </h3>
          <Button variant="outline" size="sm" onClick={stopScanner}>
            Abbrechen
          </Button>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div id="warehouse-qr-scanner-viewport" className="w-full" style={{ minHeight: 300 }} />
          </CardContent>
        </Card>
        <p className="text-sm text-center text-muted-foreground">
          Halte die Kamera auf den QR-Code am Lagerort-Etikett
        </p>
      </div>
    );
  }

  // ── Render: Lagerort-Ergebnis ──────────────────────────────────────────────
  if (scanResult) {
    const { location, items } = scanResult;
    const lowCount = items.filter(i => stockStatus(i) !== "ok").length;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={reset} className="flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <div className="flex-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-primary" />
              {location.name}
            </h3>
            {(location.shelf || location.compartment) && (
              <p className="text-sm text-muted-foreground">
                {location.shelf && `Regal ${location.shelf}`}
                {location.shelf && location.compartment && " · "}
                {location.compartment && `Fach ${location.compartment}`}
              </p>
            )}
          </div>
          <Badge variant="secondary">{items.length} Artikel</Badge>
        </div>

        {lowCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span><strong>{lowCount} Artikel</strong> mit niedrigem oder leerem Bestand</span>
          </div>
        )}

        {/* Aktions-Buttons – NUR Lager-Aktionen */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-16 flex-col gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setActionMode("incoming")}
          >
            <ArrowDownToLine className="h-5 w-5" />
            <span className="text-xs font-medium">Wareneingang</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1.5 border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setActionMode("loss")}
          >
            <ShieldAlert className="h-5 w-5" />
            <span className="text-xs font-medium">Verlust melden</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1.5"
            onClick={() => setActionMode("stock")}
          >
            <Package className="h-5 w-5" />
            <span className="text-xs font-medium">Bestand prüfen</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex-col gap-1.5 border-blue-400 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            onClick={() => setActionMode("correction")}
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs font-medium">Inventur / Korrektur</span>
          </Button>
        </div>

        {/* Bestandsübersicht (immer sichtbar) */}
        {actionMode === "stock" || actionMode === "menu" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Artikel an diesem Lagerort
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {items.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Keine Artikel diesem Lagerort zugewiesen</p>
                  <p className="text-xs mt-1">Artikel können im Lagerbestand zugewiesen werden</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-card"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        {item.sku && <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-medium tabular-nums">
                          {parseFloat(item.currentStock ?? "0").toFixed(1)} {item.unit}
                        </span>
                        <StockBadge item={item} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Dialoge */}
        <IncomingDialog
          open={actionMode === "incoming"}
          onClose={() => setActionMode("menu")}
          location={location}
          items={items}
          onSuccess={() => resolveSlug(location.qrSlug)}
        />
        <LossDialog
          open={actionMode === "loss"}
          onClose={() => setActionMode("menu")}
          location={location}
          items={items}
          onSuccess={() => resolveSlug(location.qrSlug)}
        />
        <CorrectionDialog
          open={actionMode === "correction"}
          onClose={() => setActionMode("menu")}
          items={items}
          onSuccess={() => resolveSlug(location.qrSlug)}
        />
      </div>
    );
  }

  // ── Render: Start-Ansicht ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-md mx-auto">
      {/* Hauptkarte */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mx-auto">
            <QrCode className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Lagerort scannen</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Scanne den QR-Code am Regal oder Lagerort-Etikett.<br />
              Das System erkennt den Ort und zeigt alle Lager-Aktionen.
            </p>
          </div>
          <Button size="lg" onClick={startScanner} className="w-full max-w-xs">
            <ScanLine className="h-5 w-5 mr-2" />
            Kamera öffnen & scannen
          </Button>
        </CardContent>
      </Card>

      {/* Manuelle Eingabe als Fallback */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground font-normal">
            Oder QR-Code manuell eingeben (Fallback)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="QR-Slug eingeben…"
              value={manualSlug}
              onChange={e => setManualSlug(e.target.value)}
              onKeyDown={e => e.key === "Enter" && resolveSlug(manualSlug)}
              className="font-mono text-sm"
            />
            <Button
              variant="outline"
              onClick={() => resolveSlug(manualSlug)}
              disabled={!manualSlug.trim() || isLookingUp}
            >
              {isLookingUp ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Suchen"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Den Slug findest du auf dem gedruckten Label unter dem QR-Code.
          </p>
        </CardContent>
      </Card>

      {/* Fehler */}
      {scanError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Ladeindikator */}
      {isLookingUp && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Lagerort wird gesucht…
        </div>
      )}
    </div>
  );
}
