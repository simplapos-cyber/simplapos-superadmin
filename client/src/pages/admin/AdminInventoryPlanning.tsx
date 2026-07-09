import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingCart, Brain, TrendingUp, Sparkles, RefreshCw,
  CheckCircle2, Clock, Send, XCircle, Eye, Plus, Package
} from "lucide-react";
import { toast } from "sonner";

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  draft:     { label: "Entwurf",   className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  sent:      { label: "Gesendet",  className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  partial:   { label: "Teilweise", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  received:  { label: "Erhalten",  className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Storniert", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

export default function AdminInventoryPlanning() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("suggestions");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiForecast, setAiForecast] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [orderDialog, setOrderDialog] = useState(false);
  const [orderDetailDialog, setOrderDetailDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderForm, setOrderForm] = useState<any>({ supplierId: "", notes: "", items: [] });
  const [receiveDialog, setReceiveDialog] = useState(false);
  const [receiveItems, setReceiveItems] = useState<any[]>([]);

  const { data: orders = [], isLoading: loadingOrders, refetch: refetchOrders } = trpc.inventory.listPurchaseOrders.useQuery(
    {}, { enabled: tab === "orders" }
  );
  const { data: lowStock = [] } = trpc.inventory.getLowStockItems.useQuery();
  const { data: suppliers = [] } = trpc.inventory.listSuppliers.useQuery();
  const { data: menuItems = [] } = trpc.inventory.getMenuItemsForRecipe.useQuery();

  const getAiSuggestions = trpc.inventory.getAiOrderSuggestions.useMutation({
    onSuccess: (data: any) => { setAiSuggestions((data as any)?.suggestions ?? (Array.isArray(data) ? data : [])); setAiLoading(false); },
    onError: (e) => { toast.error(e.message); setAiLoading(false); },
  });
  const getAiForecastMutation = trpc.inventory.getAiForecast.useMutation({
    onSuccess: (data) => { setAiForecast(data); setForecastLoading(false); },
    onError: (e) => { toast.error(e.message); setForecastLoading(false); },
  });
  const createOrder = trpc.inventory.createPurchaseOrder.useMutation({
    onSuccess: () => { utils.inventory.listPurchaseOrders.invalidate(); toast.success("Bestellung erstellt"); setOrderDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const sendOrder = trpc.inventory.sendPurchaseOrder.useMutation({
    onSuccess: () => { utils.inventory.listPurchaseOrders.invalidate(); toast.success("Bestellung als gesendet markiert"); },
    onError: (e) => toast.error(e.message),
  });
  const receiveOrder = trpc.inventory.receivePurchaseOrder.useMutation({
    onSuccess: () => { utils.inventory.listPurchaseOrders.invalidate(); utils.inventory.getDashboardStats.invalidate(); toast.success("Wareneingang gebucht"); setReceiveDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const cancelOrder = trpc.inventory.cancelPurchaseOrder.useMutation({
    onSuccess: () => { utils.inventory.listPurchaseOrders.invalidate(); toast.success("Bestellung storniert"); },
    onError: (e) => toast.error(e.message),
  });

  function handleGetAiSuggestions() {
    setAiLoading(true);
    setAiSuggestions([]);
    getAiSuggestions.mutate({ days: 14 });
  }
  function handleGetForecast() {
    setForecastLoading(true);
    setAiForecast(null);
    getAiForecastMutation.mutate({ forecastDays: 14 });
  }
  function openNewOrder() {
    setOrderForm({ supplierId: "", notes: "", items: lowStock.slice(0, 5).map((item: any) => ({
      itemId: item.id, itemName: item.name, unit: item.unit,
      orderedQuantity: item.reorderQty ?? "1", unitPrice: item.costPerUnit ?? "",
    })) });
    setOrderDialog(true);
  }
  function openOrderDetail(order: any) {
    setSelectedOrder(order);
    setOrderDetailDialog(true);
  }
  function openReceive(order: any) {
    setSelectedOrder(order);
    setReceiveItems((order.items ?? []).map((i: any) => ({
      itemId: i.itemId, itemName: i.itemName, unit: i.unit,
      orderedQuantity: i.orderedQuantity, receivedQuantity: i.orderedQuantity,
    })));
    setReceiveDialog(true);
  }
  function saveOrder() {
    if (!orderForm.supplierId) { toast.error("Bitte Lieferant auswählen"); return; }
    createOrder.mutate({
      supplierId: Number(orderForm.supplierId),
      notes: orderForm.notes || undefined,
      items: orderForm.items.filter((i: any) => i.itemId && parseFloat(i.orderedQuantity) > 0).map((i: any) => ({
        itemId: Number(i.itemId), orderedQuantity: i.orderedQuantity,
        unitPrice: i.unitPrice || undefined,
      })),
    });
  }
  function saveReceive() {
    if (!selectedOrder) return;
    receiveOrder.mutate({
      id: selectedOrder.id,
      items: receiveItems.map((i: any) => ({ itemId: Number(i.itemId), orderedQty: Number(i.orderedQuantity ?? 0), receivedQty: Number(i.receivedQuantity) })),
    });
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6" /> Einkaufsplanung & KI-Prognose
            </h1>
            <p className="text-muted-foreground mt-1">KI-gestützte Bestellvorschläge, Verbrauchsprognosen und Bestellverwaltung</p>
          </div>
          <Button onClick={openNewOrder}><Plus className="h-4 w-4 mr-2" />Neue Bestellung</Button>
        </div>

        {lowStock.length > 0 && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-orange-600" />
                <span className="font-semibold text-orange-800 dark:text-orange-400">{lowStock.length} Artikel unter Mindestbestand</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(lowStock as any[]).slice(0, 8).map((item: any) => (
                  <Badge key={item.id} variant="outline" className="text-xs border-orange-400 text-orange-700 dark:text-orange-400">
                    {item.name}: {parseFloat(item.currentStock ?? "0").toFixed(2)} {item.unit}
                  </Badge>
                ))}
                {lowStock.length > 8 && <Badge variant="outline" className="text-xs">+{lowStock.length - 8} weitere</Badge>}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="suggestions"><Brain className="h-4 w-4 mr-1.5" />KI-Bestellvorschläge</TabsTrigger>
            <TabsTrigger value="forecast"><TrendingUp className="h-4 w-4 mr-1.5" />Verbrauchsprognose</TabsTrigger>
            <TabsTrigger value="orders"><ShoppingCart className="h-4 w-4 mr-1.5" />Bestellungen</TabsTrigger>
          </TabsList>

          {/* KI-Bestellvorschläge */}
          <TabsContent value="suggestions" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" /> KI-Bestellvorschläge
                  </CardTitle>
                  <Button onClick={handleGetAiSuggestions} disabled={aiLoading}>
                    {aiLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analysiere...</> : <><Brain className="h-4 w-4 mr-2" />Vorschläge generieren</>}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {aiSuggestions.length === 0 && !aiLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">KI analysiert Ihren Lagerbestand</p>
                    <p className="text-sm mt-1">Klicken Sie auf "Vorschläge generieren" um eine KI-gestützte Einkaufsempfehlung zu erhalten.</p>
                    <p className="text-xs mt-2 text-muted-foreground/60">Die KI berücksichtigt: aktuellen Bestand, Mindestmengen, Verbrauchshistorie und Lieferzeiten</p>
                  </div>
                )}
                {aiLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="h-12 w-12 mx-auto mb-3 animate-spin opacity-50" />
                    <p className="font-medium">KI analysiert Lagerbestand und Verbrauchsmuster...</p>
                    <p className="text-sm mt-1">Dies kann 10–20 Sekunden dauern</p>
                  </div>
                )}
                {aiSuggestions.length > 0 && (
                  <div className="space-y-3">
                    {aiSuggestions.map((s: any, i: number) => (
                      <Card key={i} className="border-l-4 border-l-purple-400">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">{s.itemName}</span>
                                <Badge variant="outline" className={`text-xs ${s.priority === "critical" ? "border-red-400 text-red-600" : s.priority === "high" ? "border-orange-400 text-orange-600" : "border-blue-400 text-blue-600"}`}>
                                  {s.priority === "critical" ? "Kritisch" : s.priority === "high" ? "Hoch" : "Normal"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{s.reason}</p>
                              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                <span>Bestand: <strong>{parseFloat(s.currentStock ?? "0").toFixed(2)} {s.unit}</strong></span>
                                <span>Empfohlen: <strong>{s.suggestedQuantity} {s.unit}</strong></span>
                                {s.estimatedCost && <span>Kosten ca.: <strong>CHF {parseFloat(s.estimatedCost).toFixed(2)}</strong></span>}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => {
                              setOrderForm((f: any) => ({
                                ...f,
                                items: [...(f.items ?? []), { itemId: s.itemId, itemName: s.itemName, unit: s.unit, orderedQuantity: s.suggestedQuantity, unitPrice: s.costPerUnit ?? "" }]
                              }));
                              setOrderDialog(true);
                            }}>
                              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Bestellen
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="pt-2">
                      <Button variant="outline" className="w-full" onClick={() => {
                        setOrderForm({ supplierId: "", notes: "Basierend auf KI-Bestellvorschlägen", items: aiSuggestions.map((s: any) => ({ itemId: s.itemId, itemName: s.itemName, unit: s.unit, orderedQuantity: s.suggestedQuantity, unitPrice: s.costPerUnit ?? "" })) });
                        setOrderDialog(true);
                      }}>
                        <ShoppingCart className="h-4 w-4 mr-2" /> Alle Vorschläge als Bestellung übernehmen
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Verbrauchsprognose */}
          <TabsContent value="forecast" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" /> 14-Tage Verbrauchsprognose
                  </CardTitle>
                  <Button onClick={handleGetForecast} disabled={forecastLoading}>
                    {forecastLoading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analysiere...</> : <><TrendingUp className="h-4 w-4 mr-2" />Prognose erstellen</>}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!aiForecast && !forecastLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">KI-Verbrauchsprognose</p>
                    <p className="text-sm mt-1">Die KI analysiert Ihre Verkaufsdaten und Warenbewegungen der letzten 30 Tage und erstellt eine 14-Tage-Prognose.</p>
                    <p className="text-xs mt-2 text-muted-foreground/60">Berücksichtigt: Wochentag-Muster, saisonale Trends, Rezepturen und geplante Events</p>
                  </div>
                )}
                {forecastLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="h-12 w-12 mx-auto mb-3 animate-spin opacity-50" />
                    <p className="font-medium">KI erstellt Verbrauchsprognose...</p>
                  </div>
                )}
                {aiForecast && (
                  <div className="space-y-4">
                    {aiForecast.summary && (
                      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                        <CardContent className="pt-3 pb-3">
                          <p className="text-sm text-blue-800 dark:text-blue-300">{aiForecast.summary}</p>
                        </CardContent>
                      </Card>
                    )}
                    {aiForecast.items && (aiForecast.items as any[]).map((item: any, i: number) => (
                      <Card key={i}>
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">{item.itemName}</span>
                                {item.trend && (
                                  <Badge variant="outline" className={`text-xs ${item.trend === "increasing" ? "border-red-400 text-red-600" : item.trend === "decreasing" ? "border-green-400 text-green-600" : "border-gray-400 text-gray-600"}`}>
                                    {item.trend === "increasing" ? "↑ Steigend" : item.trend === "decreasing" ? "↓ Fallend" : "→ Stabil"}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Prognose 14 Tage: <strong>{item.forecastedConsumption} {item.unit}</strong></span>
                                <span>Aktuell: <strong>{parseFloat(item.currentStock ?? "0").toFixed(2)} {item.unit}</strong></span>
                                {item.recommendedOrder && <span className="text-orange-600 font-medium">→ Bestellen: {item.recommendedOrder} {item.unit}</span>}
                              </div>
                              {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {aiForecast.recommendations && (
                      <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" />KI-Empfehlungen</CardTitle></CardHeader>
                        <CardContent className="pt-0 pb-3">
                          <ul className="text-sm text-purple-800 dark:text-purple-300 space-y-1">
                            {(aiForecast.recommendations as string[]).map((r: string, i: number) => <li key={i}>• {r}</li>)}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bestellungen */}
          <TabsContent value="orders" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold">Bestellübersicht</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetchOrders()}><RefreshCw className="h-4 w-4 mr-1" />Aktualisieren</Button>
                <Button onClick={openNewOrder}><Plus className="h-4 w-4 mr-2" />Neue Bestellung</Button>
              </div>
            </div>
            {loadingOrders ? (
              <div className="text-center py-8 text-muted-foreground">Lade Bestellungen...</div>
            ) : (orders as any[]).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Keine Bestellungen vorhanden</p>
                  <Button className="mt-4" onClick={openNewOrder}><Plus className="h-4 w-4 mr-2" />Erste Bestellung erstellen</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(orders as any[]).map((order: any) => {
                  const sc = ORDER_STATUS[order.status] ?? ORDER_STATUS.draft;
                  return (
                    <Card key={order.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">Bestellung #{order.id}</span>
                              <Badge className={`text-xs ${sc.className}`}>{sc.label}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>Lieferant: <strong>{order.supplierName ?? `#${order.supplierId}`}</strong></div>
                              <div>Erstellt: {new Date(order.createdAt).toLocaleDateString("de-CH")}</div>
                              {order.totalAmount && <div>Gesamtbetrag: <strong>CHF {parseFloat(order.totalAmount).toFixed(2)}</strong></div>}
                              {order.itemCount && <div>{order.itemCount} Artikel</div>}
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => openOrderDetail(order)}><Eye className="h-3.5 w-3.5 mr-1" />Details</Button>
                            {order.status === "draft" && (
                              <Button variant="outline" size="sm" onClick={() => sendOrder.mutate({ id: order.id })}>
                                <Send className="h-3.5 w-3.5 mr-1" />Als gesendet markieren
                              </Button>
                            )}
                            {(order.status === "sent" || order.status === "partial") && (
                              <Button size="sm" onClick={() => openReceive(order)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Wareneingang buchen
                              </Button>
                            )}
                            {(order.status === "draft" || order.status === "sent") && (
                              <Button variant="ghost" size="sm" className="text-destructive"
                                onClick={() => { if (confirm("Bestellung wirklich stornieren?")) cancelOrder.mutate({ id: order.id }); }}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Neue Bestellung */}
      <Dialog open={orderDialog} onOpenChange={setOrderDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Neue Bestellung erstellen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Lieferant *</Label>
              <Select value={orderForm.supplierId} onValueChange={v => setOrderForm((f: any) => ({ ...f, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Lieferant auswählen..." /></SelectTrigger>
                <SelectContent>
                  {(suppliers as any[]).map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Artikel</Label>
              <div className="space-y-2 mt-1">
                {(orderForm.items ?? []).map((item: any, idx: number) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-sm flex-1 truncate">{item.itemName}</span>
                    <Input type="number" step="0.001" className="w-24" value={item.orderedQuantity}
                      onChange={e => setOrderForm((f: any) => ({ ...f, items: f.items.map((i: any, ii: number) => ii === idx ? { ...i, orderedQuantity: e.target.value } : i) }))} />
                    <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                    <Input type="number" step="0.0001" className="w-24" placeholder="CHF/Einh." value={item.unitPrice ?? ""}
                      onChange={e => setOrderForm((f: any) => ({ ...f, items: f.items.map((i: any, ii: number) => ii === idx ? { ...i, unitPrice: e.target.value } : i) }))} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                      onClick={() => setOrderForm((f: any) => ({ ...f, items: f.items.filter((_: any, ii: number) => ii !== idx) }))}>
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea value={orderForm.notes ?? ""} onChange={e => setOrderForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialog(false)}>Abbrechen</Button>
            <Button onClick={saveOrder} disabled={!orderForm.supplierId || createOrder.isPending}>
              {createOrder.isPending ? "Erstelle..." : "Bestellung erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bestelldetails */}
      <Dialog open={orderDetailDialog} onOpenChange={setOrderDetailDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bestellung #{selectedOrder?.id}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge className={`text-xs ${(ORDER_STATUS[selectedOrder.status] ?? ORDER_STATUS.draft).className}`}>{(ORDER_STATUS[selectedOrder.status] ?? ORDER_STATUS.draft).label}</Badge></div>
                <div><span className="text-muted-foreground">Lieferant:</span> <strong>{selectedOrder.supplierName}</strong></div>
                <div><span className="text-muted-foreground">Erstellt:</span> {new Date(selectedOrder.createdAt).toLocaleDateString("de-CH")}</div>
                {selectedOrder.totalAmount && <div><span className="text-muted-foreground">Gesamt:</span> <strong>CHF {parseFloat(selectedOrder.totalAmount).toFixed(2)}</strong></div>}
              </div>
              {selectedOrder.notes && <p className="text-sm text-muted-foreground border-t pt-2">{selectedOrder.notes}</p>}
              {selectedOrder.items && (
                <div className="border-t pt-2">
                  <p className="text-sm font-medium mb-2">Artikel:</p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-muted-foreground border-b"><th className="text-left pb-1">Artikel</th><th className="text-right pb-1">Bestellt</th><th className="text-right pb-1">Erhalten</th><th className="text-right pb-1">CHF/Einh.</th></tr></thead>
                    <tbody>
                      {(selectedOrder.items as any[]).map((i: any, idx: number) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-1">{i.itemName}</td>
                          <td className="py-1 text-right tabular-nums">{parseFloat(i.orderedQuantity).toFixed(3)} {i.unit}</td>
                          <td className="py-1 text-right tabular-nums">{i.receivedQuantity ? parseFloat(i.receivedQuantity).toFixed(3) : "–"}</td>
                          <td className="py-1 text-right tabular-nums">{i.unitPrice ? parseFloat(i.unitPrice).toFixed(4) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDetailDialog(false)}>Schliessen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Wareneingang */}
      <Dialog open={receiveDialog} onOpenChange={setReceiveDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Wareneingang buchen</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Bitte geben Sie die tatsächlich erhaltenen Mengen ein:</p>
            {receiveItems.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-sm flex-1">{item.itemName}</span>
                <span className="text-xs text-muted-foreground">Bestellt: {parseFloat(item.orderedQuantity).toFixed(3)}</span>
                <Input type="number" step="0.001" className="w-28" value={item.receivedQuantity}
                  onChange={e => setReceiveItems(prev => prev.map((i, ii) => ii === idx ? { ...i, receivedQuantity: e.target.value } : i))} />
                <span className="text-xs text-muted-foreground">{item.unit}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog(false)}>Abbrechen</Button>
            <Button onClick={saveReceive} disabled={receiveOrder.isPending}>
              {receiveOrder.isPending ? "Buche..." : "Wareneingang buchen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
