/**
 * AdminPrinters.tsx
 * Vollständige Druckerverwaltung für Synclapos
 *
 * Funktionen:
 * - Drucker hinzufügen / bearbeiten / löschen
 * - Testdruck
 * - Routing-Regeln: Kategorie → Drucker
 * - Druckauftrags-Log
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Printer,
  Plus,
  Trash2,
  Pencil,
  FlaskConical,
  ChefHat,
  Utensils,
  Wine,
  Receipt,
  Tag,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  ExternalLink,
  Copy,
  Key,
} from "lucide-react";
import { toast } from "sonner";
// Direktdruck: Frontend sendet ePOS-XML direkt an den Drucker via HTTPS

// ─── Typ-Hilfsfunktionen ──────────────────────────────────────────────────────

const PRINTER_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  kitchen: { label: "Küche (warm)", icon: <ChefHat className="h-4 w-4" />, color: "bg-orange-100 text-orange-700" },
  bar:     { label: "Bar / Getränke", icon: <Wine className="h-4 w-4" />, color: "bg-blue-100 text-blue-700" },
  receipt: { label: "Gastbon / Kasse", icon: <Receipt className="h-4 w-4" />, color: "bg-green-100 text-green-700" },
  label:   { label: "Etiketten", icon: <Tag className="h-4 w-4" />, color: "bg-purple-100 text-purple-700" },
};

const CONNECTION_LABELS: Record<string, string> = {
  network:   "Netzwerk (IP)",
  usb:       "USB",
  bluetooth: "Bluetooth",
  cloud:     "Cloud",
};

const JOB_STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: "Ausstehend", icon: <Clock className="h-3 w-3" />, color: "bg-yellow-100 text-yellow-700" },
  sent:    { label: "Gesendet",   icon: <CheckCircle className="h-3 w-3" />, color: "bg-blue-100 text-blue-700" },
  printed: { label: "Gedruckt",  icon: <CheckCircle className="h-3 w-3" />, color: "bg-green-100 text-green-700" },
  failed:  { label: "Fehler",    icon: <XCircle className="h-3 w-3" />, color: "bg-red-100 text-red-700" },
};

// ─── Drucker-Formular ─────────────────────────────────────────────────────────

interface PrinterFormData {
  name: string;
  type: "kitchen" | "bar" | "receipt" | "label";
  connectionType: "network" | "usb" | "bluetooth" | "cloud";
  ipAddress: string;
  port: number;
  paperWidth: "58mm" | "80mm";
  printCopies: number;
  isDefault: boolean;
  autoCut: boolean;
  openCashDrawer: boolean;
  headerLine1: string;
  headerLine2: string;
  footerLine1: string;
  footerLine2: string;
  sortOrder: number;
  authUsername: string;
  authPassword: string;
}

const DEFAULT_FORM: PrinterFormData = {
  name: "",
  type: "kitchen",
  connectionType: "network",
  ipAddress: "",
  port: 9100,
  paperWidth: "80mm",
  printCopies: 1,
  isDefault: false,
  autoCut: true,
  openCashDrawer: false,
  headerLine1: "",
  headerLine2: "",
  footerLine1: "",
  footerLine2: "",
  sortOrder: 0,
  authUsername: "",
  authPassword: "",
};

function PrinterFormDialog({
  open,
  onClose,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: PrinterFormData;
  onSave: (data: PrinterFormData) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PrinterFormData>(initial);
  const set = (k: keyof PrinterFormData, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial.name ? "Drucker bearbeiten" : "Neuen Drucker hinzufügen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              placeholder="z.B. Warme Küche, Bar, Kasse"
              value={form.name}
              onChange={e => set("name", e.target.value)}
            />
          </div>

          {/* Typ */}
          <div className="space-y-1">
            <Label>Drucker-Typ *</Label>
            <Select value={form.type} onValueChange={v => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRINTER_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">{v.icon} {v.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Verbindungsart */}
          <div className="space-y-1">
            <Label>Verbindungsart</Label>
            <Select value={form.connectionType} onValueChange={v => set("connectionType", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONNECTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* IP + Port (nur bei Netzwerk) */}
          {form.connectionType === "network" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>IP-Adresse</Label>
                <Input
                  placeholder="192.168.1.100"
                  value={form.ipAddress}
                  onChange={e => set("ipAddress", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={e => set("port", Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Papierbreite */}
          <div className="space-y-1">
            <Label>Papierbreite</Label>
            <Select value={form.paperWidth} onValueChange={v => set("paperWidth", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80mm">80mm (Standard)</SelectItem>
                <SelectItem value="58mm">58mm (Kompakt)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Kopien */}
          <div className="space-y-1">
            <Label>Anzahl Kopien</Label>
            <Select value={String(form.printCopies)} onValueChange={v => set("printCopies", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optionen */}
          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-medium">Optionen</p>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Standard-Drucker für diesen Typ</Label>
              <Switch checked={form.isDefault} onCheckedChange={v => set("isDefault", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Automatischer Papierschnitt</Label>
              <Switch checked={form.autoCut} onCheckedChange={v => set("autoCut", v)} />
            </div>
            {form.type === "receipt" && (
              <div className="flex items-center justify-between">
                <Label className="font-normal">Kassenschublade öffnen bei Druck</Label>
                <Switch checked={form.openCashDrawer} onCheckedChange={v => set("openCashDrawer", v)} />
              </div>
            )}
          </div>

          {/* HTTP Basic Auth (optional) */}
          {form.connectionType === "network" && (
            <div className="space-y-2 border rounded-lg p-3">
              <p className="text-sm font-medium">Passwort-Schutz (optional)</p>
              <p className="text-xs text-muted-foreground">Nur ausfüllen wenn der Drucker einen Benutzernamen und Passwort verlangt</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Benutzername</Label>
                  <Input
                    placeholder="z.B. epson"
                    value={form.authUsername}
                    onChange={e => set("authUsername", e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Passwort</Label>
                  <Input
                    type="password"
                    placeholder="Passwort"
                    value={form.authPassword}
                    onChange={e => set("authPassword", e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Kopf- / Fusszeilen */}
          <div className="space-y-2 border rounded-lg p-3">
            <p className="text-sm font-medium">Kopf- und Fusszeilen (optional)</p>
            <Input placeholder="Kopfzeile 1 (z.B. Restaurantname)" value={form.headerLine1} onChange={e => set("headerLine1", e.target.value)} />
            <Input placeholder="Kopfzeile 2 (z.B. Adresse)" value={form.headerLine2} onChange={e => set("headerLine2", e.target.value)} />
            <Input placeholder="Fusszeile 1 (z.B. Danke für Ihren Besuch)" value={form.footerLine1} onChange={e => set("footerLine1", e.target.value)} />
            <Input placeholder="Fusszeile 2 (z.B. www.restaurant.ch)" value={form.footerLine2} onChange={e => set("footerLine2", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.name}>
            {saving ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Routing-Dialog ───────────────────────────────────────────────────────────

function AddRouteDialog({
  open,
  onClose,
  printers,
  categories,
  topCategories,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  printers: any[];
  categories: any[];
  topCategories: any[];
  onSave: (data: { printerId: number; categoryId?: number | null; topCategoryId?: number | null; itemType?: string | null; priority: number }) => void;
  saving: boolean;
}) {
  const [printerId, setPrinterId] = useState<string>("");
  const [mode, setMode] = useState<"category" | "topCategory" | "itemType">("topCategory");
  const [categoryId, setCategoryId] = useState<string>("");
  const [topCategoryId, setTopCategoryId] = useState<string>("");
  const [itemType, setItemType] = useState<string>("");
  const [priority, setPriority] = useState(0);

  const handleSave = () => {
    if (!printerId) { toast.error("Bitte Drucker auswählen"); return; }
    onSave({
      printerId: Number(printerId),
      categoryId: mode === "category" && categoryId ? Number(categoryId) : null,
      topCategoryId: mode === "topCategory" && topCategoryId ? Number(topCategoryId) : null,
      itemType: mode === "itemType" && itemType ? itemType : null,
      priority,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Routing-Regel hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Drucker *</Label>
            <Select value={printerId} onValueChange={setPrinterId}>
              <SelectTrigger><SelectValue placeholder="Drucker auswählen..." /></SelectTrigger>
              <SelectContent>
                {printers.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {PRINTER_TYPE_LABELS[p.type]?.icon} {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Routing nach</Label>
            <Select value={mode} onValueChange={v => setMode(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="topCategory">Oberkategorie (z.B. Speisen, Getränke)</SelectItem>
                <SelectItem value="category">Unterkategorie (z.B. Vorspeisen, Weine)</SelectItem>
                <SelectItem value="itemType">Artikel-Typ (Essen / Getränk)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "topCategory" && (
            <div className="space-y-1">
              <Label>Oberkategorie</Label>
              <Select value={topCategoryId} onValueChange={setTopCategoryId}>
                <SelectTrigger><SelectValue placeholder="Oberkategorie wählen..." /></SelectTrigger>
                <SelectContent>
                  {topCategories.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "category" && (
            <div className="space-y-1">
              <Label>Unterkategorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Unterkategorie wählen..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "itemType" && (
            <div className="space-y-1">
              <Label>Artikel-Typ</Label>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger><SelectValue placeholder="Typ wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">Essen (food)</SelectItem>
                  <SelectItem value="drink">Getränk (drink)</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Priorität (höher = zuerst geprüft)</Label>
            <Input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern..." : "Regel hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminPrinters() {
  const utils = trpc.useUtils();

  // Daten laden
  const { data: printers = [], isLoading } = trpc.printer.list.useQuery();
  const { data: routes = [] } = trpc.printer.listRoutes.useQuery();
  const { data: jobs = [] } = trpc.printer.listJobs.useQuery({ limit: 50 });
  const { data: categories = [] } = trpc.menu.listCategories.useQuery();
  const { data: topCategories = [] } = trpc.menu.listTopCategories.useQuery();

  // Mutations
  const createPrinter = trpc.printer.create.useMutation({
    onSuccess: () => { utils.printer.list.invalidate(); toast.success("Drucker hinzugefügt"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updatePrinter = trpc.printer.update.useMutation({
    onSuccess: () => { utils.printer.list.invalidate(); toast.success("Drucker aktualisiert"); setEditPrinter(null); },
    onError: (e) => toast.error(e.message),
  });
  const deletePrinter = trpc.printer.delete.useMutation({
    onSuccess: () => { utils.printer.list.invalidate(); toast.success("Drucker gelöscht"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  // Testdruck: Job in Local Connect Queue einstellen → App druckt im WLAN
  const testPrintMutation = trpc.printer.createTestPrintJob.useMutation();
  const [testPrintPending, setTestPrintPending] = useState<number | null>(null);
  const handleTestPrint = async (printer: any) => {
    if (!printer.ipAddress) { toast.error("Keine IP-Adresse konfiguriert"); return; }
    setTestPrintPending(printer.id);
    try {
      await testPrintMutation.mutateAsync({ printerId: printer.id });
      toast.success('Testdruck gesendet – Local Connect App druckt in wenigen Sekunden.');
    } catch (err: any) {
      if (err?.message?.includes('Local Connect')) {
        toast.error('Kein Local Connect Gerät online. Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.');
      } else {
        toast.error(err?.message || 'Testdruck fehlgeschlagen');
      }
    }
    setTestPrintPending(null);
  };
  const createRoute = trpc.printer.createRoute.useMutation({
    onSuccess: () => { utils.printer.listRoutes.invalidate(); toast.success("Routing-Regel hinzugefügt"); setShowRouteForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRoute = trpc.printer.deleteRoute.useMutation({
    onSuccess: () => { utils.printer.listRoutes.invalidate(); toast.success("Routing-Regel gelöscht"); },
    onError: (e) => toast.error(e.message),
  });
  const reprint = trpc.printer.reprint.useMutation({
    onSuccess: () => toast.success("Nachdruck gesendet"),
    onError: (e) => toast.error(e.message),
  });
  // Server-seitiger Status-Check
  const checkAllStatusMutation = trpc.printer.checkAllStatus.useMutation({
    onSuccess: (results) => {
      const map: Record<number, { online: boolean | null; latencyMs?: number | null; message: string }> = {};
      results.forEach((r: any) => { map[r.id] = { online: r.online, latencyMs: r.latencyMs, message: r.message }; });
      setStatusMap(map);
      const offline = results.filter((r: any) => r.online === false);
      if (offline.length > 0) {
        toast.warning(`${offline.length} Drucker nicht erreichbar: ${offline.map((r: any) => r.name).join(", ")}`);
      } else if (results.length > 0) {
        toast.success("Alle Drucker erreichbar");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const [checkingAll, setCheckingAll] = useState(false);
  const checkAllStatus = {
    mutate: async () => {
      setCheckingAll(true);
      try { await checkAllStatusMutation.mutateAsync(); } catch { /* handled */ }
      setCheckingAll(false);
    },
    isPending: false,
  };

  // UI-State
  const [showForm, setShowForm] = useState(false);
  const [editPrinter, setEditPrinter] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<number, { online: boolean | null; latencyMs?: number | null; message: string }>>({});

  // Status-Check einmalig beim Laden
  useEffect(() => {
    if (printers && printers.length > 0) {
      const timer = setTimeout(() => checkAllStatus.mutate(), 2000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printers?.length]);

  const handleSavePrinter = (data: PrinterFormData) => {
    if (editPrinter) {
      updatePrinter.mutate({ id: editPrinter.id, ...data });
    } else {
      createPrinter.mutate(data);
    }
  };

  const openEdit = (p: any) => {
    setEditPrinter(p);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Printer className="h-6 w-6" /> Drucker
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Bon-, Küchen- und Bardrucker verwalten und Routing konfigurieren
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => checkAllStatus.mutate()}
            disabled={checkingAll}
            title="Alle Drucker auf Erreichbarkeit prüfen"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${checkingAll ? "animate-spin" : ""}`} />
            {checkingAll ? "Prüfe..." : "Alle prüfen"}
          </Button>
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Drucker hinzufügen
          </Button>
        </div>
      </div>

      <Tabs defaultValue="printers">
        <TabsList>
          <TabsTrigger value="printers">
            <Printer className="h-4 w-4 mr-1" /> Drucker ({printers.length})
          </TabsTrigger>
          <TabsTrigger value="print-agent">
            <ExternalLink className="h-4 w-4 mr-1" /> Print-Agent
          </TabsTrigger>
          <TabsTrigger value="routing">
            <ArrowRight className="h-4 w-4 mr-1" /> Routing ({routes.length})
          </TabsTrigger>
          <TabsTrigger value="log">
            <Clock className="h-4 w-4 mr-1" /> Drucklog
          </TabsTrigger>
        </TabsList>



        {/* ── Tab: Drucker ── */}
        <TabsContent value="printers" className="mt-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Lade Drucker...</div>
          ) : printers.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Printer className="h-14 w-14 mx-auto text-muted-foreground mb-4" />
                <p className="font-semibold text-lg">Noch keine Drucker konfiguriert</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Füge Küchen-, Bar- und Kassendrucker hinzu
                </p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Ersten Drucker hinzufügen
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {printers.map((p: any) => {
                const typeInfo = PRINTER_TYPE_LABELS[p.type] ?? { label: p.type, icon: <Printer className="h-4 w-4" />, color: "bg-gray-100 text-gray-700" };
                return (
                  <Card key={p.id} className={`border-l-4 ${p.isActive ? "border-l-green-500" : "border-l-gray-300"}`}>
                    <CardContent className="pt-4 pb-4 space-y-3">
                      {/* Kopfzeile */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.color}`}>
                            {typeInfo.icon} {typeInfo.label}
                          </span>
                          {p.isDefault && (
                            <Badge variant="outline" className="text-xs">Standard</Badge>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => openEdit(p)}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteId(p.id)}
                            title="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Name + Online-Status */}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{p.name}</p>
                          {statusMap[p.id] !== undefined && (
                            statusMap[p.id].online === true ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                <Wifi className="h-3 w-3" />
                                {statusMap[p.id].latencyMs != null ? `${statusMap[p.id].latencyMs}ms` : "Online"}
                              </span>
                            ) : statusMap[p.id].online === false ? (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium" title={statusMap[p.id].message}>
                                <WifiOff className="h-3 w-3" /> Offline
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertTriangle className="h-3 w-3" /> Kein Netz
                              </span>
                            )
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {CONNECTION_LABELS[p.connectionType] ?? p.connectionType}
                          {p.ipAddress && ` · ${p.ipAddress}:${p.port}`}
                        </p>
                      </div>

                      {/* Details */}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{p.paperWidth}</span>
                        <span>·</span>
                        <span>{p.printCopies}x Kopie{p.printCopies > 1 ? "n" : ""}</span>
                        {p.autoCut && <span>· Autoschnitt</span>}
                        {p.openCashDrawer && <span>· Kassenschublade</span>}
                      </div>

                      {/* Testdruck */}
                      <Button
                        variant="outline" size="sm" className="w-full"
                        onClick={() => handleTestPrint(p)}
                        disabled={testPrintPending === p.id}
                      >
                        <FlaskConical className="h-3.5 w-3.5 mr-1" />
                        {testPrintPending === p.id ? "Drucke..." : "Testdruck"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Drucker-Typen Erklärung */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Utensils className="h-4 w-4" /> Drucker-Typen im Überblick
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(PRINTER_TYPE_LABELS).map(([k, v]) => (
                  <div key={k} className={`rounded-lg p-3 ${v.color.replace("text-", "border-").replace("bg-", "border-")} border`}>
                    <div className="flex items-center gap-2 mb-1">
                      {v.icon}
                      <p className="font-medium text-sm">{v.label}</p>
                    </div>
                    <p className="text-xs opacity-75">
                      {k === "kitchen" && "Küchenbon bei Bestellungseingang"}
                      {k === "bar" && "Getränkebon für Bar/Barista"}
                      {k === "receipt" && "Gastbon bei Kassenabschluss"}
                      {k === "label" && "Etiketten für Takeaway/Lieferung"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Routing ── */}
        <TabsContent value="routing" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-medium">Routing-Regeln</p>
              <p className="text-sm text-muted-foreground">
                Lege fest, welche Produkte zu welchem Drucker gehen.
                Spezifischere Regeln (Unterkategorie) haben Vorrang vor allgemeinen.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowRouteForm(true)} disabled={printers.length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Regel hinzufügen
            </Button>
          </div>

          {printers.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>Bitte zuerst mindestens einen Drucker hinzufügen.</p>
              </CardContent>
            </Card>
          )}

          {printers.length > 0 && routes.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <ArrowRight className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Noch keine Routing-Regeln</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Ohne Regeln werden alle Artikel zum Standard-Drucker des jeweiligen Typs gesendet.
                </p>
                <Button onClick={() => setShowRouteForm(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Erste Regel hinzufügen
                </Button>
              </CardContent>
            </Card>
          )}

          {routes.length > 0 && (
            <div className="space-y-2">
              {routes.map((r: any) => {
                const printer = printers.find((p: any) => p.id === r.printerId);
                const typeInfo = printer ? PRINTER_TYPE_LABELS[printer.type] : null;
                return (
                  <Card key={r.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Quelle */}
                          <div className="min-w-0">
                            {r.categoryId && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                Unterkategorie: {r.categoryName ?? `#${r.categoryId}`}
                              </span>
                            )}
                            {r.topCategoryId && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                Oberkategorie: {r.topCategoryName ?? `#${r.topCategoryId}`}
                              </span>
                            )}
                            {r.itemType && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                Typ: {r.itemType === "food" ? "Essen" : r.itemType === "drink" ? "Getränk" : "Sonstiges"}
                              </span>
                            )}
                          </div>

                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                          {/* Ziel-Drucker */}
                          <div className="min-w-0">
                            {printer ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeInfo?.color ?? ""}`}>
                                {typeInfo?.icon} {printer.name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Drucker nicht gefunden</span>
                            )}
                          </div>

                          {/* Priorität */}
                          {r.priority !== 0 && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Prio {r.priority}
                            </Badge>
                          )}
                        </div>

                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => deleteRoute.mutate({ id: r.id })}
                          title="Regel löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Routing-Erklärung */}
          <Card className="mt-6 border-dashed">
            <CardContent className="py-4 px-4">
              <p className="text-sm font-medium mb-2">Wie funktioniert das Routing?</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Zuerst wird nach einer passenden <strong>Unterkategorie</strong>-Regel gesucht (höchste Priorität)</li>
                <li>Dann nach einer passenden <strong>Oberkategorie</strong>-Regel</li>
                <li>Dann nach einer passenden <strong>Artikel-Typ</strong>-Regel (Essen/Getränk)</li>
                <li>Wenn keine Regel passt: <strong>Standard-Drucker</strong> des Typs (Küche oder Bar)</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Drucklog ── */}
        <TabsContent value="log" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="font-medium">Letzte Druckaufträge</p>
            <Button variant="outline" size="sm" onClick={() => utils.printer.listJobs.invalidate()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Aktualisieren
            </Button>
          </div>

          {jobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3" />
                <p>Noch keine Druckaufträge</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {jobs.map((j: any) => {
                const statusInfo = JOB_STATUS_LABELS[j.status] ?? { label: j.status, icon: null, color: "bg-gray-100 text-gray-700" };
                const printer = printers.find((p: any) => p.id === j.printerId);
                return (
                  <Card key={j.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                            {statusInfo.icon} {statusInfo.label}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {j.jobType === "kitchen_order" && "Küchenbon"}
                              {j.jobType === "bar_order" && "Barbon"}
                              {j.jobType === "receipt" && "Gastbon"}
                              {j.jobType === "test" && "Testdruck"}
                              {j.orderId && ` · Bestellung #${j.orderId}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {printer?.name ?? `Drucker #${j.printerId}`}
                              {j.createdAt && ` · ${new Date(j.createdAt).toLocaleString("de-CH")}`}
                            </p>
                            {j.errorMessage && (
                              <p className="text-xs text-red-600 mt-0.5">{j.errorMessage}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => reprint.mutate({ jobId: j.id })}
                          disabled={reprint.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Nachdruck
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Print-Agent ── */}
        <TabsContent value="print-agent" className="mt-4 space-y-4">
          <PrintAgentTab />
        </TabsContent>

      </Tabs>

      {/* ── Dialoge ── */}
      <PrinterFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        initial={DEFAULT_FORM}
        onSave={handleSavePrinter}
        saving={createPrinter.isPending}
      />

      {editPrinter && (
        <PrinterFormDialog
          open={!!editPrinter}
          onClose={() => setEditPrinter(null)}
          initial={{
            name: editPrinter.name,
            type: editPrinter.type,
            connectionType: editPrinter.connectionType,
            ipAddress: editPrinter.ipAddress ?? "",
            port: editPrinter.port ?? 9100,
            paperWidth: editPrinter.paperWidth,
            printCopies: editPrinter.printCopies,
            isDefault: editPrinter.isDefault,
            autoCut: editPrinter.autoCut,
            openCashDrawer: editPrinter.openCashDrawer,
            headerLine1: editPrinter.headerLine1 ?? "",
            headerLine2: editPrinter.headerLine2 ?? "",
            footerLine1: editPrinter.footerLine1 ?? "",
            footerLine2: editPrinter.footerLine2 ?? "",
            sortOrder: editPrinter.sortOrder ?? 0,
            authUsername: editPrinter.authUsername ?? "",
            authPassword: editPrinter.authPassword ?? "",
          }}
          onSave={handleSavePrinter}
          saving={updatePrinter.isPending}
        />
      )}

      <AddRouteDialog
        open={showRouteForm}
        onClose={() => setShowRouteForm(false)}
        printers={printers}
        categories={categories}
        topCategories={topCategories}
        onSave={(data) => createRoute.mutate(data as any)}
        saving={createRoute.isPending}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drucker löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle Routing-Regeln für diesen Drucker werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deletePrinter.mutate({ id: deleteId })}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Print-Agent Tab ──────────────────────────────────────────────────────────
function PrintAgentTab() {
  const { data: tokenData, refetch } = trpc.printer.getPrintAgentToken.useQuery();
  const regenerate = trpc.printer.regeneratePrintAgentToken.useMutation({
    onSuccess: () => { refetch(); toast.success("Token erneuert"); },
    onError: (e) => toast.error(e.message),
  });

  const token = tokenData?.token ?? "";
  const agentUrl = `${window.location.origin}/print-agent.html`;
  const agentUrlWithToken = `${agentUrl}#token=${encodeURIComponent(token)}`;

  const copyToken = () => {
    navigator.clipboard.writeText(token).then(() => toast.success("Token kopiert"));
  };

  return (
    <div className="space-y-4">
      {/* Erklärung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ExternalLink className="h-5 w-5" /> Was ist der Print-Agent?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Der Print-Agent ist eine Webseite, die auf Ihrem Tablet oder PC im Restaurant geöffnet bleiben muss.
            Er verbindet sich direkt mit Ihrem Epson-Drucker im lokalen Netzwerk.
          </p>
          <p className="font-medium text-foreground">
            Einrichtung (einmalig, ca. 2 Minuten):
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Klicken Sie auf <strong>"Print-Agent öffnen"</strong> unten</li>
            <li>Beim ersten Mal erscheint eine Sicherheitswarnung des Druckers → klicken Sie auf <strong>"Erweitert"</strong> und dann <strong>"Trotzdem fortfahren"</strong></li>
            <li>Der Print-Agent verbindet sich automatisch und wartet auf Druckaufträge</li>
            <li>Lassen Sie diesen Tab immer geöffnet, solange Sie drucken möchten</li>
          </ol>
        </CardContent>
      </Card>

      {/* Token + Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5" /> Ihr Print-Agent Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={token}
              className="flex-1 text-xs font-mono bg-muted rounded px-3 py-2 border border-border overflow-hidden text-ellipsis"
            />
            <Button variant="outline" size="sm" onClick={copyToken} title="Token kopieren">
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
              title="Token erneuern"
            >
              <RefreshCw className={`h-4 w-4 ${regenerate.isPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <a
            href={agentUrlWithToken}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Print-Agent öffnen
          </a>
          <p className="text-xs text-muted-foreground text-center">
            Dieser Link öffnet den Print-Agent mit Ihrem Token bereits ausgefüllt.
          </p>
        </CardContent>
      </Card>

      {/* Zertifikats-Anleitung */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" /> Sicherheitswarnung beim ersten Mal
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-700 dark:text-amber-400 space-y-2">
          <p>
            Beim ersten Verbinden zeigt Chrome/Android eine Sicherheitswarnung für das Drucker-Zertifikat.
            Das ist normal – Epson-Drucker verwenden ein eigenes Sicherheitszertifikat.
          </p>
          <p className="font-medium">So bestätigen Sie die Warnung:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Im Print-Agent erscheint eine Anleitung mit einem Link</li>
            <li>Klicken Sie auf <strong>"Drucker-Zertifikat freigeben"</strong></li>
            <li>Es öffnet sich eine Seite mit einer Warnung</li>
            <li>Klicken Sie auf <strong>"Erweitert"</strong> → <strong>"Trotzdem fortfahren"</strong></li>
            <li>Schliessen Sie das Tab und klicken Sie im Print-Agent auf <strong>"Erneut versuchen"</strong></li>
          </ol>
          <p className="text-xs">Diese Freigabe muss nur einmal pro Gerät gemacht werden.</p>
        </CardContent>
      </Card>
    </div>
  );
}
