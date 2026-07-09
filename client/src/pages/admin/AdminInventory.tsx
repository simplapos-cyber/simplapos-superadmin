import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Package, Plus, Search, AlertTriangle, Warehouse, TrendingDown,
  ArrowUpDown, Truck, RefreshCw, Edit, Trash2,
  ArrowUp, ArrowDown, CheckCircle2, XCircle, BarChart3, Star, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

type StockStatus = "ok" | "low" | "critical" | "out";

const STATUS_CONFIG: Record<StockStatus, { label: string; className: string }> = {
  ok:       { label: "OK",       className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  low:      { label: "Niedrig",  className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  critical: { label: "Kritisch", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
  out:      { label: "Leer",     className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

const MOVEMENT_TYPES: Record<string, { label: string; color: string }> = {
  purchase:   { label: "Einkauf",    color: "text-green-600" },
  sale:       { label: "Verkauf",    color: "text-blue-600" },
  waste:      { label: "Abfall",     color: "text-red-600" },
  correction: { label: "Korrektur", color: "text-purple-600" },
  transfer:   { label: "Transfer",  color: "text-orange-600" },
  return:     { label: "Rückgabe",  color: "text-teal-600" },
  production: { label: "Produktion",color: "text-indigo-600" },
};

function StockBar({ current, min, max }: { current: number; min: number; max: number | null }) {
  if (!max || max <= 0) return null;
  const pct = Math.min(100, (current / max) * 100);
  const color = current <= 0 ? "bg-red-500" : current <= min ? "bg-orange-400" : "bg-green-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full mt-1">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminInventory() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showLowOnly, setShowLowOnly] = useState(false);

  const [itemDialog, setItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [itemForm, setItemForm] = useState<any>({});

  const [movementDialog, setMovementDialog] = useState(false);
  const [movementForm, setMovementForm] = useState<any>({ type: "purchase", quantity: "" });
  const [movementItemId, setMovementItemId] = useState<number | null>(null);

  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [supplierForm, setSupplierForm] = useState<any>({});

  const { data: items = [], isLoading: loadingItems } = trpc.inventory.listItems.useQuery({
    search: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    lowStock: showLowOnly || undefined,
  });
  const { data: stats } = trpc.inventory.getDashboardStats.useQuery();
  const { data: movements = [], isLoading: loadingMovements } = trpc.inventory.listMovements.useQuery(
    { limit: 100 }, { enabled: tab === "movements" }
  );
  const { data: suppliers = [], isLoading: loadingSuppliers } = trpc.inventory.listSuppliers.useQuery(
    undefined, { enabled: tab === "suppliers" }
  );
  const { data: categoriesData } = trpc.inventory.getCategories.useQuery();

  const createItem = trpc.inventory.createItem.useMutation({
    onSuccess: () => { utils.inventory.listItems.invalidate(); utils.inventory.getDashboardStats.invalidate(); toast.success("Artikel erstellt"); setItemDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateItem = trpc.inventory.updateItem.useMutation({
    onSuccess: () => { utils.inventory.listItems.invalidate(); utils.inventory.getDashboardStats.invalidate(); toast.success("Artikel aktualisiert"); setItemDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteItem = trpc.inventory.deleteItem.useMutation({
    onSuccess: () => { utils.inventory.listItems.invalidate(); utils.inventory.getDashboardStats.invalidate(); toast.success("Artikel gelöscht"); },
    onError: (e) => toast.error(e.message),
  });
  const adjustStock = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      utils.inventory.listItems.invalidate();
      utils.inventory.getDashboardStats.invalidate();
      utils.inventory.listMovements.invalidate();
      toast.success("Bewegung erfasst");
      setMovementDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const createSupplier = trpc.inventory.createSupplier.useMutation({
    onSuccess: () => { utils.inventory.listSuppliers.invalidate(); toast.success("Lieferant erstellt"); setSupplierDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateSupplier = trpc.inventory.updateSupplier.useMutation({
    onSuccess: () => { utils.inventory.listSuppliers.invalidate(); toast.success("Lieferant aktualisiert"); setSupplierDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSupplier = trpc.inventory.deleteSupplier.useMutation({
    onSuccess: () => { utils.inventory.listSuppliers.invalidate(); toast.success("Lieferant gelöscht"); },
    onError: (e) => toast.error(e.message),
  });

  function openNewItem() {
    setEditItem(null);
    setItemForm({ name: "", unit: "kg", category: "", minStock: "0", maxStock: "", reorderPoint: "0", reorderQty: "", costPerUnit: "", autoReorder: false });
    setItemDialog(true);
  }
  function openEditItem(item: any) {
    setEditItem(item);
    setItemForm({
      name: item.name, unit: item.unit, category: item.category ?? "",
      storageLocation: item.storageLocation ?? "", description: item.description ?? "",
      sku: item.sku ?? "", supplierId: item.supplierId ?? "",
      minStock: item.minStock ?? "0", maxStock: item.maxStock ?? "",
      reorderPoint: item.reorderPoint ?? "0", reorderQty: item.reorderQty ?? "",
      costPerUnit: item.costPerUnit ?? "", shelfLifeDays: item.shelfLifeDays ?? "",
      autoReorder: item.autoReorder ?? false,
    });
    setItemDialog(true);
  }
  function saveItem() {
    const payload = {
      name: itemForm.name, unit: itemForm.unit,
      category: itemForm.category || undefined,
      storageLocation: itemForm.storageLocation || undefined,
      description: itemForm.description || undefined,
      sku: itemForm.sku || undefined,
      supplierId: itemForm.supplierId ? Number(itemForm.supplierId) : undefined,
      minStock: itemForm.minStock || "0",
      maxStock: itemForm.maxStock || undefined,
      reorderPoint: itemForm.reorderPoint || "0",
      reorderQty: itemForm.reorderQty || undefined,
      costPerUnit: itemForm.costPerUnit || undefined,
      shelfLifeDays: itemForm.shelfLifeDays ? Number(itemForm.shelfLifeDays) : undefined,
      autoReorder: itemForm.autoReorder ?? false,
    };
    if (editItem) updateItem.mutate({ id: editItem.id, ...payload });
    else createItem.mutate(payload);
  }
  function openMovement(itemId: number) {
    setMovementItemId(itemId);
    setMovementForm({ type: "purchase", quantity: "", notes: "" });
    setMovementDialog(true);
  }
  function saveMovement() {
    if (!movementItemId) return;
    adjustStock.mutate({ itemId: movementItemId, type: movementForm.type, quantity: movementForm.quantity, notes: movementForm.notes || undefined });
  }
  function openNewSupplier() {
    setEditSupplier(null);
    setSupplierForm({ name: "", contactName: "", email: "", phone: "", address: "", deliveryDays: "2", minOrderValue: "", paymentTerms: "", notes: "" });
    setSupplierDialog(true);
  }
  function openEditSupplier(s: any) {
    setEditSupplier(s);
    setSupplierForm({
      name: s.name, contactName: s.contactName ?? "", email: s.email ?? "",
      phone: s.phone ?? "", address: s.address ?? "", website: s.website ?? "",
      deliveryDays: s.deliveryDays ?? "2", minOrderValue: s.minOrderValue ?? "",
      paymentTerms: s.paymentTerms ?? "", orderDays: s.orderDays ?? "", notes: s.notes ?? "",
    });
    setSupplierDialog(true);
  }
  function saveSupplier() {
    const payload = {
      name: supplierForm.name,
      contactName: supplierForm.contactName || undefined,
      email: supplierForm.email || undefined,
      phone: supplierForm.phone || undefined,
      address: supplierForm.address || undefined,
      website: supplierForm.website || undefined,
      deliveryDays: supplierForm.deliveryDays ? Number(supplierForm.deliveryDays) : undefined,
      minOrderValue: supplierForm.minOrderValue || undefined,
      paymentTerms: supplierForm.paymentTerms || undefined,
      orderDays: supplierForm.orderDays || undefined,
      notes: supplierForm.notes || undefined,
    };
    if (editSupplier) updateSupplier.mutate({ id: editSupplier.id, ...payload });
    else createSupplier.mutate(payload);
  }

  const categoryList = useMemo(() => Array.isArray(categoriesData) ? (categoriesData as string[]) : [], [categoriesData]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Warehouse className="h-6 w-6" /> Waren- & Lagerwirtschaft
            </h1>
            <p className="text-muted-foreground mt-1">Lagerbestand, Lieferanten und Einkaufsplanung</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { utils.inventory.listItems.invalidate(); utils.inventory.getDashboardStats.invalidate(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/warehouse")}>
              <Warehouse className="h-4 w-4 mr-1" /> Lager-Zonen & Standorte
            </Button>
            <Button onClick={openNewItem}><Plus className="h-4 w-4 mr-2" /> Artikel hinzufügen</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Package, label: "Artikel gesamt", value: stats?.totalItems ?? "–", color: "text-blue-600" },
            { icon: AlertTriangle, label: "Niedriger Bestand", value: stats?.lowCount ?? "–", color: "text-yellow-600" },
            { icon: XCircle, label: "Leer / Kritisch", value: stats?.outCount ?? "–", color: "text-red-600" },
            { icon: TrendingDown, label: "Lagerwert (CHF)", value: stats?.totalValue != null ? stats.totalValue.toFixed(2) : "–", color: "text-green-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <s.icon className={`h-5 w-5 ${s.color} mb-1`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview"><Package className="h-4 w-4 mr-1.5" />Lagerbestand</TabsTrigger>
            <TabsTrigger value="movements"><ArrowUpDown className="h-4 w-4 mr-1.5" />Bewegungen</TabsTrigger>
            <TabsTrigger value="suppliers"><Truck className="h-4 w-4 mr-1.5" />Lieferanten</TabsTrigger>
            <TabsTrigger value="stats"><BarChart3 className="h-4 w-4 mr-1.5" />Verbrauchsstatistik</TabsTrigger>
            <TabsTrigger value="discrepancies"><ShieldAlert className="h-4 w-4 mr-1.5" />Abweichungen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Artikel suchen..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kategorie" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Kategorien</SelectItem>
                      {categoryList.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 text-sm">
                    <Switch checked={showLowOnly} onCheckedChange={setShowLowOnly} id="lowonly" />
                    <Label htmlFor="lowonly">Nur kritisch</Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingItems ? (
                  <div className="text-center py-8 text-muted-foreground">Lade Lagerbestand...</div>
                ) : items.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Keine Artikel gefunden</p>
                    <Button className="mt-4" onClick={openNewItem}><Plus className="h-4 w-4 mr-2" />Ersten Artikel erstellen</Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 pr-3">Artikel</th>
                          <th className="text-left py-2 pr-3">Kategorie</th>
                          <th className="text-right py-2 pr-3">Bestand</th>
                          <th className="text-right py-2 pr-3">Min.</th>
                          <th className="text-left py-2 pr-3">Lagerort</th>
                          <th className="text-right py-2 pr-3">CHF/Einh.</th>
                          <th className="text-center py-2 pr-3">Auto</th>
                          <th className="text-left py-2 pr-3">Status</th>
                          <th className="text-right py-2">Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any) => {
                          const status = (item.stockStatus ?? "ok") as StockStatus;
                          const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ok;
                          return (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2.5 pr-3">
                                <div className="font-medium">{item.name}</div>
                                {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                                <StockBar current={parseFloat(item.currentStock ?? "0")} min={parseFloat(item.minStock ?? "0")} max={item.maxStock ? parseFloat(item.maxStock) : null} />
                              </td>
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{item.category ?? "–"}</td>
                              <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                                {parseFloat(item.currentStock ?? "0").toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                              </td>
                              <td className="py-2.5 pr-3 text-right text-xs text-muted-foreground tabular-nums">{parseFloat(item.minStock ?? "0").toFixed(2)}</td>
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground">{item.storageLocation ?? "–"}</td>
                              <td className="py-2.5 pr-3 text-right text-xs tabular-nums">{item.costPerUnit ? parseFloat(item.costPerUnit).toFixed(4) : "–"}</td>
                              <td className="py-2.5 pr-3 text-center">
                                {item.autoReorder ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <span className="text-muted-foreground text-xs">–</span>}
                              </td>
                              <td className="py-2.5 pr-3"><Badge className={`text-xs ${cfg.className}`}>{cfg.label}</Badge></td>
                              <td className="py-2.5 text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Bewegung" onClick={() => openMovement(item.id)}><ArrowUpDown className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Bearbeiten" onClick={() => openEditItem(item)}><Edit className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Löschen"
                                    onClick={() => { if (confirm(`"${item.name}" wirklich löschen?`)) deleteItem.mutate({ id: item.id }); }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movements" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Warenbewegungsprotokoll</CardTitle></CardHeader>
              <CardContent>
                {loadingMovements ? (
                  <div className="text-center py-8 text-muted-foreground">Lade Bewegungen...</div>
                ) : movements.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ArrowUpDown className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Noch keine Warenbewegungen erfasst</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 pr-3">Datum</th>
                          <th className="text-left py-2 pr-3">Artikel</th>
                          <th className="text-left py-2 pr-3">Typ</th>
                          <th className="text-right py-2 pr-3">Menge</th>
                          <th className="text-right py-2 pr-3">Bestand danach</th>
                          <th className="text-right py-2 pr-3">Kosten</th>
                          <th className="text-left py-2">Notiz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m: any) => {
                          const mt = MOVEMENT_TYPES[m.type] ?? { label: m.type, color: "text-foreground" };
                          const qty = parseFloat(m.quantity ?? "0");
                          const isPositive = ["purchase", "return", "correction"].includes(m.type) && qty > 0;
                          return (
                            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(m.createdAt).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="py-2.5 pr-3 font-medium">{m.itemName ?? `#${m.itemId}`}</td>
                              <td className="py-2.5 pr-3"><span className={`text-xs font-medium ${mt.color}`}>{mt.label}</span></td>
                              <td className="py-2.5 pr-3 text-right tabular-nums font-bold">
                                <span className={isPositive ? "text-green-600" : "text-red-600"}>
                                  {isPositive ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />}
                                  {" "}{Math.abs(qty).toFixed(3)} {m.unit}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-right text-xs tabular-nums text-muted-foreground">{m.stockAfter != null ? parseFloat(m.stockAfter).toFixed(3) : "–"}</td>
                              <td className="py-2.5 pr-3 text-right text-xs tabular-nums">{m.totalCost ? `CHF ${parseFloat(m.totalCost).toFixed(2)}` : "–"}</td>
                              <td className="py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{m.notes ?? "–"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold">Lieferantenverwaltung</h2>
              <Button onClick={openNewSupplier}><Plus className="h-4 w-4 mr-2" />Lieferant hinzufügen</Button>
            </div>
            {loadingSuppliers ? (
              <div className="text-center py-8 text-muted-foreground">Lade Lieferanten...</div>
            ) : suppliers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Keine Lieferanten erfasst</p>
                  <Button className="mt-4" onClick={openNewSupplier}><Plus className="h-4 w-4 mr-2" />Ersten Lieferanten erstellen</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {suppliers.map((s: any) => (
                  <Card key={s.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold">{s.name}</h3>
                          {s.contactName && <p className="text-xs text-muted-foreground">{s.contactName}</p>}
                        </div>
                        <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">{s.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {s.email && <div>📧 {s.email}</div>}
                        {s.phone && <div>📞 {s.phone}</div>}
                        {s.deliveryDays && <div>🚚 Lieferzeit: {s.deliveryDays} Tage</div>}
                        {s.minOrderValue && <div>💰 Mindestbestellung: CHF {parseFloat(s.minOrderValue).toFixed(2)}</div>}
                        {s.paymentTerms && <div>📋 {s.paymentTerms}</div>}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditSupplier(s)}><Edit className="h-3.5 w-3.5 mr-1" /> Bearbeiten</Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => { if (confirm(`"${s.name}" wirklich löschen?`)) deleteSupplier.mutate({ id: s.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: VERBRAUCHSSTATISTIK ─────────────────────────────────────── */}
          <TabsContent value="stats" className="mt-4">
            <StatsTab />
          </TabsContent>

          {/* ─── TAB: ABWEICHUNGSPROTOKOLL ────────────────────────────────────── */}
          <TabsContent value="discrepancies" className="mt-4">
            <DiscrepanciesTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Artikel */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2">
              <Label>Artikelname *</Label>
              <Input value={itemForm.name ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="z.B. Mehl Type 550" />
            </div>
            <div>
              <Label>Einheit *</Label>
              <Select value={itemForm.unit ?? "kg"} onValueChange={v => setItemForm((f: any) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["kg", "g", "l", "ml", "Stk", "Fl.", "Pkg", "Bund", "Dose", "Karton", "Portion"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategorie</Label>
              <Input value={itemForm.category ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, category: e.target.value }))} placeholder="z.B. Trockenwaren" list="cat-list" />
              <datalist id="cat-list">{categoryList.map((c: string) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <Label>Lagerort</Label>
              <Input value={itemForm.storageLocation ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, storageLocation: e.target.value }))} placeholder="z.B. Kühlraum A" />
            </div>
            <div>
              <Label>SKU / Artikelnummer</Label>
              <Input value={itemForm.sku ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, sku: e.target.value }))} placeholder="Optional" />
            </div>
            <div><Label>Mindestbestand</Label><Input type="number" step="0.001" value={itemForm.minStock ?? "0"} onChange={e => setItemForm((f: any) => ({ ...f, minStock: e.target.value }))} /></div>
            <div><Label>Maximalbestand</Label><Input type="number" step="0.001" value={itemForm.maxStock ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, maxStock: e.target.value }))} placeholder="Optional" /></div>
            <div><Label>Nachbestellpunkt</Label><Input type="number" step="0.001" value={itemForm.reorderPoint ?? "0"} onChange={e => setItemForm((f: any) => ({ ...f, reorderPoint: e.target.value }))} /></div>
            <div><Label>Nachbestellmenge</Label><Input type="number" step="0.001" value={itemForm.reorderQty ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, reorderQty: e.target.value }))} placeholder="Optional" /></div>
            <div><Label>Kosten pro Einheit (CHF)</Label><Input type="number" step="0.0001" value={itemForm.costPerUnit ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, costPerUnit: e.target.value }))} placeholder="Optional" /></div>
            <div><Label>Haltbarkeit (Tage)</Label><Input type="number" value={itemForm.shelfLifeDays ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, shelfLifeDays: e.target.value }))} placeholder="Optional" /></div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Switch checked={itemForm.autoReorder ?? false} onCheckedChange={v => setItemForm((f: any) => ({ ...f, autoReorder: v }))} id="auto-reorder" />
              <Label htmlFor="auto-reorder">Automatische Nachbestellung aktivieren</Label>
            </div>
            <div className="sm:col-span-2">
              <Label>Beschreibung / Notizen</Label>
              <Textarea value={itemForm.description ?? ""} onChange={e => setItemForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(false)}>Abbrechen</Button>
            <Button onClick={saveItem} disabled={!itemForm.name || !itemForm.unit || createItem.isPending || updateItem.isPending}>
              {createItem.isPending || updateItem.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Warenbewegung */}
      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Warenbewegung erfassen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Bewegungstyp *</Label>
              <Select value={movementForm.type} onValueChange={v => setMovementForm((f: any) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MOVEMENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Menge *</Label>
              <Input type="number" step="0.001" value={movementForm.quantity} onChange={e => setMovementForm((f: any) => ({ ...f, quantity: e.target.value }))} placeholder="z.B. 5.000" />
            </div>
            <div>
              <Label>Notiz</Label>
              <Textarea value={movementForm.notes ?? ""} onChange={e => setMovementForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialog(false)}>Abbrechen</Button>
            <Button onClick={saveMovement} disabled={!movementForm.quantity || adjustStock.isPending}>
              {adjustStock.isPending ? "Speichern..." : "Bewegung erfassen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Lieferant */}
      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editSupplier ? "Lieferant bearbeiten" : "Neuer Lieferant"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2"><Label>Firmenname *</Label><Input value={supplierForm.name ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="z.B. Metro AG" /></div>
            <div><Label>Ansprechpartner</Label><Input value={supplierForm.contactName ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, contactName: e.target.value }))} /></div>
            <div><Label>E-Mail</Label><Input type="email" value={supplierForm.email ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Telefon</Label><Input value={supplierForm.phone ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Website</Label><Input value={supplierForm.website ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
            <div><Label>Lieferzeit (Tage)</Label><Input type="number" value={supplierForm.deliveryDays ?? "2"} onChange={e => setSupplierForm((f: any) => ({ ...f, deliveryDays: e.target.value }))} /></div>
            <div><Label>Mindestbestellwert (CHF)</Label><Input type="number" step="0.01" value={supplierForm.minOrderValue ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, minOrderValue: e.target.value }))} /></div>
            <div><Label>Bestelltage</Label><Input value={supplierForm.orderDays ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, orderDays: e.target.value }))} placeholder="z.B. Mo, Mi, Fr" /></div>
            <div><Label>Zahlungsbedingungen</Label><Input value={supplierForm.paymentTerms ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, paymentTerms: e.target.value }))} placeholder="z.B. 30 Tage netto" /></div>
            <div className="sm:col-span-2"><Label>Adresse</Label><Textarea value={supplierForm.address ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, address: e.target.value }))} rows={2} /></div>
            <div className="sm:col-span-2"><Label>Notizen</Label><Textarea value={supplierForm.notes ?? ""} onChange={e => setSupplierForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialog(false)}>Abbrechen</Button>
            <Button onClick={saveSupplier} disabled={!supplierForm.name || createSupplier.isPending || updateSupplier.isPending}>
              {createSupplier.isPending || updateSupplier.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── VERBRAUCHSSTATISTIK-KOMPONENTE ───────────────────────────────────────────
function StatsTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = trpc.inventory.getConsumptionStats.useQuery({ days });
  const { data: supplierPerf, isLoading: loadingPerf } = trpc.inventory.getSupplierPerformance.useQuery();

  return (
    <div className="space-y-6">
      {/* Zeitraum-Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Zeitraum:</span>
        {[7, 14, 30, 90].map(d => (
          <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
            {d} Tage
          </Button>
        ))}
      </div>

      {/* Gesamtstatistik */}
      {data?.totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Warenbewegungen</p>
              <p className="text-2xl font-bold">{data.totals.totalMovements}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Verbrauchswert</p>
              <p className="text-2xl font-bold text-red-600">CHF {parseFloat(String(data.totals.totalConsumedValue ?? 0)).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Einkaufswert</p>
              <p className="text-2xl font-bold text-green-600">CHF {parseFloat(String(data.totals.totalPurchasedValue ?? 0)).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top-Verbrauch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />Top-Verbrauch (letzte {days} Tage)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-6 text-muted-foreground">Lade Statistik...</div>
          ) : !data?.consumption?.length ? (
            <div className="text-center py-6 text-muted-foreground">Keine Verbrauchsdaten im gewählten Zeitraum</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Artikel</th>
                    <th className="text-left py-2 pr-4">Kategorie</th>
                    <th className="text-right py-2 pr-4">Verbraucht</th>
                    <th className="text-right py-2 pr-4">Eingekauft</th>
                    <th className="text-right py-2">Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {data.consumption.map((row: any) => (
                    <tr key={row.itemId} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{row.itemName ?? "–"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.category ?? "–"}</td>
                      <td className="py-2 pr-4 text-right text-red-600">{parseFloat(String(row.totalConsumed ?? 0)).toFixed(2)} {row.unit}</td>
                      <td className="py-2 pr-4 text-right text-green-600">{parseFloat(String(row.totalPurchased ?? 0)).toFixed(2)} {row.unit}</td>
                      <td className="py-2 text-right">CHF {parseFloat(String(row.totalCost ?? 0)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lieferantenbewertung */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4" />Lieferantenbewertung
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingPerf ? (
            <div className="text-center py-6 text-muted-foreground">Lade Bewertungen...</div>
          ) : !supplierPerf?.length ? (
            <div className="text-center py-6 text-muted-foreground">Keine Lieferantendaten vorhanden</div>
          ) : (
            <div className="space-y-3">
              {supplierPerf.map((s: any) => {
                const acc = parseFloat(String(s.deliveryAccuracy ?? 100));
                const accColor = acc >= 95 ? "text-green-600" : acc >= 80 ? "text-yellow-600" : "text-red-600";
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.totalDeliveries ?? 0} Lieferungen · Ø {s.avgDeliveryDaysActual ?? s.deliveryDays ?? "–"} Tage
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${accColor}`}>{acc.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Liefergenauigkeit</p>
                      {Number(s.openDiscrepancies) > 0 && (
                        <Badge variant="destructive" className="text-xs mt-1">{s.openDiscrepancies} offen</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ABWEICHUNGSPROTOKOLL-KOMPONENTE ─────────────────────────────────────────
function DiscrepanciesTab() {
  const [filter, setFilter] = useState<boolean | undefined>(false); // false = ungelöst
  const { data, isLoading, refetch } = trpc.inventory.getDeliveryDiscrepancies.useQuery({ resolved: filter });
  const resolve = trpc.inventory.resolveDiscrepancy.useMutation({
    onSuccess: () => { toast.success("Abweichung als gelöst markiert"); refetch(); },
    onError: () => toast.error("Fehler beim Lösen der Abweichung"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Anzeigen:</span>
        <Button size="sm" variant={filter === false ? "default" : "outline"} onClick={() => setFilter(false)}>Offen</Button>
        <Button size="sm" variant={filter === true ? "default" : "outline"} onClick={() => setFilter(true)}>Gelöst</Button>
        <Button size="sm" variant={filter === undefined ? "default" : "outline"} onClick={() => setFilter(undefined)}>Alle</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Lade Abweichungen...</div>
      ) : !data?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30 text-green-500" />
            <p className="font-medium">Keine {filter === false ? "offenen " : ""}Abweichungen</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((d: any) => {
            const pct = parseFloat(String(d.discrepancyPct ?? 0));
            const isUnder = d.discrepancyQty < 0;
            return (
              <Card key={d.id} className={d.resolvedAt ? "opacity-60" : ""}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={isUnder ? "destructive" : "secondary"} className="text-xs">
                          {isUnder ? "Unterlieferung" : "Überlieferung"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Bestellung #{d.purchaseOrderId}</span>
                      </div>
                      <p className="font-medium">{d.itemName ?? "Unbekannter Artikel"}</p>
                      <p className="text-sm text-muted-foreground">{d.supplierName ?? "Unbekannter Lieferant"}</p>
                      <div className="flex gap-4 mt-2 text-xs">
                        <span>Bestellt: <strong>{parseFloat(String(d.orderedQty)).toFixed(2)} {d.itemUnit}</strong></span>
                        <span>Geliefert: <strong>{parseFloat(String(d.receivedQty)).toFixed(2)} {d.itemUnit}</strong></span>
                        <span className={isUnder ? "text-red-600" : "text-orange-600"}>
                          Differenz: <strong>{Math.abs(pct).toFixed(1)}%</strong>
                        </span>
                        {d.discrepancyValue && (
                          <span>Wert: <strong>CHF {parseFloat(String(d.discrepancyValue)).toFixed(2)}</strong></span>
                        )}
                      </div>
                    </div>
                    {!d.resolvedAt && (
                      <Button size="sm" variant="outline" className="text-green-600 border-green-600"
                        onClick={() => resolve.mutate({ id: d.id })}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Lösen
                      </Button>
                    )}
                    {d.resolvedAt && (
                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Gelöst</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
