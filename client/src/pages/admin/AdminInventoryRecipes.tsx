import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2, Edit2, Search, ChefHat, Package, AlertCircle, CheckCircle2, Save } from "lucide-react";

interface RecipeIngredient {
  id: number;
  inventoryItemId: number | null;
  quantity: string;
  unit: string;
  conversionFactor: string | null;
  notes: string | null;
  itemName?: string | null;
  itemUnit?: string | null;
}

export default function AdminInventoryRecipes() {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(null);
  const [searchMenu, setSearchMenu] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editIngredient, setEditIngredient] = useState<RecipeIngredient | null>(null);

  // Form state für neue Zutat
  const [form, setForm] = useState({
    inventoryItemId: "",
    quantity: "",
    unit: "kg",
    conversionFactor: "1",
    notes: "",
  });

  // Daten laden
  const { data: menuItems, isLoading: menuLoading } = trpc.inventory.getMenuItemsForRecipe.useQuery();
  const { data: inventoryItemsList } = trpc.inventory.listItems.useQuery({});
  const { data: recipe, refetch: refetchRecipe } = trpc.inventory.getRecipeForMenuItem.useQuery(
    { menuItemId: selectedMenuItemId! },
    { enabled: !!selectedMenuItemId }
  );

  const utils = trpc.useUtils();

  const addIngredient = trpc.inventory.addRecipeIngredient.useMutation({
    onSuccess: () => {
      toast.success("Zutat hinzugefügt");
      refetchRecipe();
      setAddDialogOpen(false);
      setForm({ inventoryItemId: "", quantity: "", unit: "kg", conversionFactor: "1", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateIngredient = trpc.inventory.updateRecipeIngredient.useMutation({
    onSuccess: () => {
      toast.success("Zutat aktualisiert");
      refetchRecipe();
      setEditIngredient(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const removeIngredient = trpc.inventory.removeRecipeIngredient.useMutation({
    onSuccess: () => {
      toast.success("Zutat entfernt");
      refetchRecipe();
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredMenuItems = (menuItems ?? []).filter((m: { name: string }) =>
    m.name.toLowerCase().includes(searchMenu.toLowerCase())
  );

  const selectedMenuItem = (menuItems ?? []).find((m: { id: number }) => m.id === selectedMenuItemId);

  const handleAddIngredient = () => {
    if (!selectedMenuItemId || !form.inventoryItemId || !form.quantity || !form.unit) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    addIngredient.mutate({
      menuItemId: selectedMenuItemId,
      inventoryItemId: parseInt(form.inventoryItemId),
      quantity: parseFloat(form.quantity),
      unit: form.unit,
      conversionFactor: parseFloat(form.conversionFactor) || 1,
      notes: form.notes || undefined,
    });
  };

  const handleUpdateIngredient = () => {
    if (!editIngredient) return;
    updateIngredient.mutate({
      id: editIngredient.id,
      quantity: parseFloat(editIngredient.quantity),
      unit: editIngredient.unit,
      conversionFactor: parseFloat(editIngredient.conversionFactor ?? "1"),
      notes: editIngredient.notes ?? undefined,
    });
  };

  const commonUnits = ["kg", "g", "L", "ml", "Stk", "Pkg", "Dose", "Flasche", "Bund", "EL", "TL", "Prise"];

  return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <BookOpen className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Rezepturverwaltung</h1>
            <p className="text-sm text-muted-foreground">Verknüpfen Sie Menüartikel mit Lagerartikeln für automatischen Verbrauchsabzug</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Linke Spalte: Menüartikel-Liste */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ChefHat className="h-4 w-4" />
                Menüartikel
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={searchMenu}
                  onChange={(e) => setSearchMenu(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {menuLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Lädt...</div>
              ) : filteredMenuItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Keine Menüartikel gefunden</div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  {filteredMenuItems.map((item: { id: number; name: string; categoryName?: string | null }) => {
                    const hasRecipe = false; // Könnte aus einer separaten Query kommen
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedMenuItemId(item.id)}
                        className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                          selectedMenuItemId === item.id ? "bg-orange-50 dark:bg-orange-900/20 border-l-2 border-l-orange-500" : ""
                        }`}
                      >
                        <div className="font-medium text-sm">{item.name}</div>
                        {item.categoryName && (
                          <div className="text-xs text-muted-foreground mt-0.5">{item.categoryName}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rechte Spalte: Rezeptur-Details */}
          <Card className="lg:col-span-2">
            {!selectedMenuItemId ? (
              <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Wählen Sie einen Menüartikel aus, um seine Rezeptur zu bearbeiten</p>
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Rezeptur: {selectedMenuItem?.name}
                    </CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setAddDialogOpen(true)}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Zutat hinzufügen
                    </Button>
                  </div>
                  {recipe && recipe.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      {recipe.length} Zutat{recipe.length !== 1 ? "en" : ""} verknüpft – Lagerabzug aktiv
                    </div>
                  )}
                  {recipe && recipe.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-4 w-4" />
                      Noch keine Zutaten – kein automatischer Lagerabzug
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {!recipe ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Lädt Rezeptur...</div>
                  ) : recipe.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      Noch keine Zutaten definiert. Fügen Sie Zutaten hinzu, um den automatischen Lagerabzug beim Verkauf zu aktivieren.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Tabellenkopf */}
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3 py-1">
                        <div className="col-span-4">Lagerartikel</div>
                        <div className="col-span-2 text-right">Menge</div>
                        <div className="col-span-2">Einheit</div>
                        <div className="col-span-2">Faktor</div>
                        <div className="col-span-2 text-right">Aktionen</div>
                      </div>
                      {recipe.map((ing: RecipeIngredient) => (
                        <div
                          key={ing.id}
                          className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-lg px-3 py-2.5 text-sm"
                        >
                          <div className="col-span-4 font-medium truncate">{ing.itemName ?? "–"}</div>
                          <div className="col-span-2 text-right font-mono">{parseFloat(ing.quantity).toFixed(3)}</div>
                          <div className="col-span-2 text-muted-foreground">{ing.unit}</div>
                          <div className="col-span-2 text-muted-foreground text-xs">×{parseFloat(ing.conversionFactor ?? "1").toFixed(2)}</div>
                          <div className="col-span-2 flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditIngredient(ing)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Zutat entfernen?")) {
                                  removeIngredient.mutate({ id: ing.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {/* Kostenübersicht */}
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Automatischer Lagerabzug</div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          Beim Abschluss einer Bestellung werden die Lagerbestände dieser Zutaten automatisch reduziert.
                          Der Faktor ermöglicht Einheitenumrechnungen (z.B. Rezept in ml, Lager in L → Faktor 0.001).
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </>
            )}
          </Card>
        </div>

        {/* Info-Karte */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">So funktioniert der automatische Lagerabzug</p>
                <p>Wenn ein Kellner eine Bestellung abschliesst, werden die hier definierten Zutaten automatisch vom Lagerbestand abgezogen.
                Der <strong>Konversionsfaktor</strong> ermöglicht Einheitenumrechnungen: Wenn Sie z.B. Mehl in der Rezeptur in Gramm angeben,
                aber im Lager in Kilogramm führen, setzen Sie den Faktor auf 0.001.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Zutat hinzufügen */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zutat hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lagerartikel *</Label>
              <Select value={form.inventoryItemId} onValueChange={(v) => setForm(f => ({ ...f, inventoryItemId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Artikel wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {(inventoryItemsList ?? []).map((item: { id: number; name: string; unit: string }) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name} ({item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Menge pro Portion *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="z.B. 0.200"
                  value={form.quantity}
                  onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <Label>Einheit *</Label>
                <Select value={form.unit} onValueChange={(v) => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {commonUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Konversionsfaktor</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="1.0"
                value={form.conversionFactor}
                onChange={(e) => setForm(f => ({ ...f, conversionFactor: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">Umrechnungsfaktor zur Lagereinheit (Standard: 1)</p>
            </div>
            <div>
              <Label>Notiz (optional)</Label>
              <Input
                placeholder="z.B. frisch, bio..."
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleAddIngredient} disabled={addIngredient.isPending}>
              {addIngredient.isPending ? "Wird hinzugefügt..." : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Zutat bearbeiten */}
      <Dialog open={!!editIngredient} onOpenChange={(open) => { if (!open) setEditIngredient(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zutat bearbeiten: {editIngredient?.itemName}</DialogTitle>
          </DialogHeader>
          {editIngredient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Menge pro Portion</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={editIngredient.quantity}
                    onChange={(e) => setEditIngredient(ei => ei ? { ...ei, quantity: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label>Einheit</Label>
                  <Select
                    value={editIngredient.unit}
                    onValueChange={(v) => setEditIngredient(ei => ei ? { ...ei, unit: v } : null)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {commonUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Konversionsfaktor</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={editIngredient.conversionFactor ?? "1"}
                  onChange={(e) => setEditIngredient(ei => ei ? { ...ei, conversionFactor: e.target.value } : null)}
                />
              </div>
              <div>
                <Label>Notiz</Label>
                <Input
                  value={editIngredient.notes ?? ""}
                  onChange={(e) => setEditIngredient(ei => ei ? { ...ei, notes: e.target.value } : null)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditIngredient(null)}>Abbrechen</Button>
            <Button onClick={handleUpdateIngredient} disabled={updateIngredient.isPending} className="gap-1.5">
              <Save className="h-4 w-4" />
              {updateIngredient.isPending ? "Speichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
