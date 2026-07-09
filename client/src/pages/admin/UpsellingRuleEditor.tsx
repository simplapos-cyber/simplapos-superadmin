import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

export default function UpsellingRuleEditor() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const restaurantId = (me as { restaurantId?: number } | null)?.restaurantId ?? 0;

  // Upselling-Regeln
  const { data: rules, isLoading: rulesLoading } = trpc.upselling.listRules.useQuery(
    { restaurantId },
    { enabled: restaurantId > 0 }
  );
  const createRuleMutation = trpc.upselling.createRule.useMutation({
    onSuccess: () => { utils.upselling.listRules.invalidate(); toast.success("Regel erstellt"); setNewRule(defaultRule); },
    onError: (e) => toast.error("Fehler: " + e.message),
  });
  const deleteRuleMutation = trpc.upselling.deleteRule.useMutation({
    onSuccess: () => { utils.upselling.listRules.invalidate(); toast.success("Regel gelöscht"); },
  });

  // Ablaufende Lagerartikel
  const { data: expiringItems, isLoading: expiryLoading, refetch: refetchExpiry } = trpc.upselling.getExpiringInventory.useQuery(
    { restaurantId, daysAhead: 14 },
    { enabled: restaurantId > 0 }
  );
  const setExpiryMutation = trpc.upselling.setItemExpiry.useMutation({
    onSuccess: () => { refetchExpiry(); toast.success("Ablaufdatum gespeichert"); setExpiryForm(null); },
    onError: (e) => toast.error("Fehler: " + e.message),
  });

  const defaultRule = {
    triggerType: "any" as "product" | "category" | "any" | "expiry",
    triggerProductId: "",
    triggerCategory: "",
    suggestedLabel: "",
    comboPrice: "",
    discountPct: "",
    priority: "0",
  };
  const [newRule, setNewRule] = useState(defaultRule);
  const [expiryForm, setExpiryForm] = useState<{ itemId: number; expiresAt: string; discountPct: string } | null>(null);

  const handleCreateRule = () => {
    if (!newRule.suggestedLabel) { toast.error("Bitte Empfehlungsbezeichnung eingeben"); return; }
    createRuleMutation.mutate({
      restaurantId,
      triggerType: newRule.triggerType,
      triggerProductId: newRule.triggerProductId ? Number(newRule.triggerProductId) : undefined,
      triggerCategory: newRule.triggerCategory || undefined,
      suggestedLabel: newRule.suggestedLabel,
      comboPrice: newRule.comboPrice ? Number(newRule.comboPrice) : undefined,
      discountPct: newRule.discountPct ? Number(newRule.discountPct) : undefined,
      priority: Number(newRule.priority),
    });
  };

  const handleSaveExpiry = () => {
    if (!expiryForm) return;
    if (!expiryForm.expiresAt) { toast.error("Bitte Ablaufdatum eingeben"); return; }
    setExpiryMutation.mutate({
      itemId: expiryForm.itemId,
      restaurantId,
      expiresAt: new Date(expiryForm.expiresAt),
      expiryDiscountPct: expiryForm.discountPct ? Number(expiryForm.discountPct) : undefined,
    });
  };

  const triggerTypeLabels: Record<string, string> = {
    any: "Immer (bei jedem Scan)",
    product: "Bestimmtes Produkt gescannt",
    category: "Bestimmte Kategorie",
    expiry: "Ablaufende Artikel",
  };

  return (
    <div className="space-y-6">
      {/* ── Upselling-Regeln ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upselling-Regeln</CardTitle>
          <CardDescription>
            Definieren Sie, welche Produkte oder Essen nach einem Scan empfohlen werden.
            Die KI berücksichtigt diese Regeln zusätzlich zu Lagerbestand und Ablaufdaten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bestehende Regeln */}
          {rulesLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Lade Regeln…</div>
          ) : rules && rules.length > 0 ? (
            <div className="space-y-2">
              {rules.map((r: {
                id: number; triggerType: string; triggerCategory: string | null;
                suggestedLabel: string | null; comboPrice: string | null;
                discountPct: string | null; priority: number; isActive: boolean;
              }) => (
                <div key={r.id} className="flex items-center justify-between p-3 border rounded-xl bg-muted/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.isActive ? "default" : "secondary"} className="text-xs">
                        {triggerTypeLabels[r.triggerType] ?? r.triggerType}
                      </Badge>
                      {r.triggerCategory && <span className="text-xs text-muted-foreground">Kat: {r.triggerCategory}</span>}
                    </div>
                    <p className="text-sm font-medium mt-1">{r.suggestedLabel ?? "(kein Label)"}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {r.comboPrice && <span className="text-xs text-green-700">Kombi-Preis: CHF {Number(r.comboPrice).toFixed(2)}</span>}
                      {r.discountPct && <span className="text-xs text-amber-700">Rabatt: {r.discountPct}%</span>}
                      <span className="text-xs text-muted-foreground">Priorität: {r.priority}</span>
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => deleteRuleMutation.mutate({ ruleId: r.id, restaurantId })}
                    disabled={deleteRuleMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-3">Noch keine Regeln definiert.</p>
          )}

          {/* Neue Regel erstellen */}
          <div className="border rounded-xl p-4 space-y-3 bg-blue-50/50">
            <p className="text-sm font-semibold text-blue-800">Neue Regel erstellen</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Auslöser</Label>
                <Select value={newRule.triggerType} onValueChange={(v) => setNewRule(r => ({ ...r, triggerType: v as typeof r.triggerType }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Immer</SelectItem>
                    <SelectItem value="product">Produkt-ID</SelectItem>
                    <SelectItem value="category">Kategorie</SelectItem>
                    <SelectItem value="expiry">Ablaufend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRule.triggerType === "product" && (
                <div>
                  <Label className="text-xs">Produkt-ID</Label>
                  <Input className="h-9" placeholder="z.B. 42" value={newRule.triggerProductId}
                    onChange={e => setNewRule(r => ({ ...r, triggerProductId: e.target.value }))} />
                </div>
              )}
              {newRule.triggerType === "category" && (
                <div>
                  <Label className="text-xs">Kategorie</Label>
                  <Input className="h-9" placeholder="z.B. Getränke" value={newRule.triggerCategory}
                    onChange={e => setNewRule(r => ({ ...r, triggerCategory: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Empfehlung (Bezeichnung)</Label>
              <Input className="h-9" placeholder="z.B. Pommes dazu? CHF 4.50" value={newRule.suggestedLabel}
                onChange={e => setNewRule(r => ({ ...r, suggestedLabel: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Kombi-Preis (CHF)</Label>
                <Input className="h-9" placeholder="optional" value={newRule.comboPrice}
                  onChange={e => setNewRule(r => ({ ...r, comboPrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Rabatt (%)</Label>
                <Input className="h-9" placeholder="optional" value={newRule.discountPct}
                  onChange={e => setNewRule(r => ({ ...r, discountPct: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Priorität</Label>
                <Input className="h-9" placeholder="0" value={newRule.priority}
                  onChange={e => setNewRule(r => ({ ...r, priority: e.target.value }))} />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={handleCreateRule} disabled={createRuleMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Regel speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Ablaufdatum-Verwaltung ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ablaufdatum-Verwaltung</CardTitle>
          <CardDescription>
            Lagerartikel mit Ablaufdatum werden dem Gast automatisch mit Rabatt empfohlen.
            Hier sehen Sie alle Artikel, die in den nächsten 14 Tagen ablaufen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {expiryLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Lade Lagerartikel…</div>
          ) : expiringItems && expiringItems.length > 0 ? (
            <div className="space-y-2">
              {expiringItems.map((item: {
                id: number; name: string; expiresAt: Date | null;
                expiryDiscountPct: string | null; quantity: string; unit: string;
              }) => {
                const daysLeft = item.expiresAt
                  ? Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000)
                  : null;
                const isUrgent = daysLeft !== null && daysLeft <= 3;
                return (
                  <div key={item.id} className={`flex items-center justify-between p-3 border rounded-xl ${isUrgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className={`text-xs font-semibold ${isUrgent ? "text-red-700" : "text-amber-700"}`}>
                          {daysLeft !== null
                            ? (daysLeft <= 0 ? "Abgelaufen!" : `Noch ${daysLeft} Tag${daysLeft === 1 ? "" : "e"}`)
                            : "Kein Datum"}
                        </span>
                        <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                        {item.expiryDiscountPct && (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                            {item.expiryDiscountPct}% Rabatt aktiv
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setExpiryForm({
                        itemId: item.id,
                        expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().split("T")[0] : "",
                        discountPct: item.expiryDiscountPct ?? "",
                      })}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Keine Artikel mit Ablaufdatum in den nächsten 14 Tagen.
              Ablaufdaten können im Lager-Modul pro Artikel gesetzt werden.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ablaufdatum-Edit-Dialog */}
      <Dialog open={!!expiryForm} onOpenChange={(o) => { if (!o) setExpiryForm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ablaufdatum bearbeiten</DialogTitle>
            <DialogDescription>Setzen Sie Ablaufdatum und optionalen Rabatt für diesen Lagerartikel.</DialogDescription>
          </DialogHeader>
          {expiryForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Ablaufdatum</Label>
                <Input type="date" value={expiryForm.expiresAt}
                  onChange={e => setExpiryForm(f => f ? { ...f, expiresAt: e.target.value } : f)} />
              </div>
              <div>
                <Label>Automatischer Rabatt (%)</Label>
                <Input type="number" min="0" max="100" placeholder="z.B. 20" value={expiryForm.discountPct}
                  onChange={e => setExpiryForm(f => f ? { ...f, discountPct: e.target.value } : f)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpiryForm(null)}>Abbrechen</Button>
            <Button onClick={handleSaveExpiry} disabled={setExpiryMutation.isPending}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
