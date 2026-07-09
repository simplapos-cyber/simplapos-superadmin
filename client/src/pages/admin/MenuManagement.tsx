import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, GripVertical, ChevronRight, Search,
  Tag, Layers, Settings2, UtensilsCrossed, Copy, Eye, EyeOff,
  AlertTriangle, Clock, ChefHat, Leaf, Flame, Star, Zap,
  Package, DollarSign, X, Check, BookOpen, Upload, Download,
  ArrowLeft, ShoppingCart, Info, Sparkles
} from "lucide-react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLERGENS = [
  { key: "gluten", label: "Gluten" },
  { key: "krebstiere", label: "Krebstiere" },
  { key: "eier", label: "Eier" },
  { key: "fisch", label: "Fisch" },
  { key: "erdnuesse", label: "Erdnüsse" },
  { key: "soja", label: "Soja" },
  { key: "milch", label: "Milch/Laktose" },
  { key: "nuesse", label: "Schalenfrüchte" },
  { key: "sellerie", label: "Sellerie" },
  { key: "senf", label: "Senf" },
  { key: "sesam", label: "Sesam" },
  { key: "schwefeldioxid", label: "Schwefeldioxid" },
  { key: "lupinen", label: "Lupinen" },
  { key: "weichtiere", label: "Weichtiere" },
];

const LABELS = [
  { key: "vegan", label: "Vegan", icon: Leaf, color: "bg-green-100 text-green-800" },
  { key: "vegetarisch", label: "Vegetarisch", icon: Leaf, color: "bg-lime-100 text-lime-800" },
  { key: "scharf", label: "Scharf", icon: Flame, color: "bg-red-100 text-red-800" },
  { key: "bio", label: "Bio", icon: Leaf, color: "bg-emerald-100 text-emerald-800" },
  { key: "neu", label: "Neu", icon: Zap, color: "bg-blue-100 text-blue-800" },
  { key: "bestseller", label: "Bestseller", icon: Star, color: "bg-yellow-100 text-yellow-800" },
  { key: "glutenfrei", label: "Glutenfrei", icon: Check, color: "bg-purple-100 text-purple-800" },
  { key: "laktosefrei", label: "Laktosefrei", icon: Check, color: "bg-pink-100 text-pink-800" },
  { key: "alkohol", label: "Alkohol", icon: AlertTriangle, color: "bg-orange-100 text-orange-800" },
];

const ITEM_TYPES = [
  { value: "food", label: "Speise" },
  { value: "beverage", label: "Getränk" },
  { value: "dessert", label: "Dessert" },
  { value: "set_menu", label: "Menü-Set" },
  { value: "other", label: "Sonstiges" },
];

const KITCHEN_STATIONS = ["Küche", "Bar", "Grill", "Patisserie", "Sushi", "Pizza", "Wok", "Kalt"];

const CATEGORY_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

const CATEGORY_ICONS = [
  "UtensilsCrossed", "Coffee", "Wine", "Pizza", "Beef", "Fish",
  "Salad", "IceCream", "Soup", "Sandwich", "Cake", "Beer",
];

// ─── Helper Components ────────────────────────────────────────────────────────
function AllergenSelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALLERGENS.map((a) => {
        const active = value.includes(a.key);
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(active ? value.filter((x) => x !== a.key) : [...value, a.key])}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              active ? "bg-orange-100 border-orange-400 text-orange-800" : "bg-muted border-border text-muted-foreground hover:border-orange-300"
            }`}
          >
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

function LabelSelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LABELS.map((l) => {
        const active = value.includes(l.key);
        return (
          <button
            key={l.key}
            type="button"
            onClick={() => onChange(active ? value.filter((x) => x !== l.key) : [...value, l.key])}
            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
              active ? `${l.color} border-current` : "bg-muted border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Category Editor Dialog ───────────────────────────────────────────────────
function CategoryDialog({
  open, onClose, category, restaurantId,
}: {
  open: boolean;
  onClose: () => void;
  category?: any;
  restaurantId: number;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(category?.icon ?? "UtensilsCrossed");
  const [defaultCourseNumber, setDefaultCourseNumber] = useState(category?.defaultCourseNumber ?? 1);
  const [availabilityType, setAvailabilityType] = useState<"always" | "scheduled" | "manual">(category?.availabilityType ?? "always");
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [isVisible, setIsVisible] = useState(category?.isVisible ?? true);
  const [description, setDescription] = useState(category?.description ?? "");

  const create = trpc.menu.upsertCategory.useMutation({
    onSuccess: () => { utils.menu.listCategories.invalidate(); toast.success("Kategorie erstellt"); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const update = trpc.menu.upsertCategory.useMutation({
    onSuccess: () => { utils.menu.listCategories.invalidate(); toast.success("Kategorie gespeichert"); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) return toast.error("Name erforderlich");
    const data = { name: name.trim(), color, icon, defaultCourseNumber, availabilityType, isActive, isVisible, description };
    if (category?.id) update.mutate({ id: category.id, ...data });
    else create.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Vorspeisen, Hauptgänge..." />
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Farbe</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CATEGORY_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <Label>Standard-Gang</Label>
              <Select value={String(defaultCourseNumber)} onValueChange={(v) => setDefaultCourseNumber(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map((n) => (
                    <SelectItem key={n} value={String(n)}>Gang {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Verfügbarkeit</Label>
            <Select value={availabilityType} onValueChange={(v: any) => setAvailabilityType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="always">Immer verfügbar</SelectItem>
                <SelectItem value="scheduled">Zeitgesteuert (z.B. Mittagsmenü)</SelectItem>
                <SelectItem value="manual">Manuell ein/ausschalten</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktiv</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
              <Label>Sichtbar für Kellner</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
            {create.isPending || update.isPending ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Editor Dialog ───────────────────────────────────────────────────────
function ItemDialog({
  open, onClose, item, categories, modifierGroups,
}: {
  open: boolean;
  onClose: () => void;
  item?: any;
  categories: any[];
  modifierGroups: any[];
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [shortDescription, setShortDescription] = useState(item?.shortDescription ?? "");
  const [price, setPrice] = useState(item?.price ?? "");
  const [costPrice, setCostPrice] = useState(item?.costPrice ?? "");
  const [priceType, setPriceType] = useState<"fixed"|"variable"|"from">(item?.priceType ?? "fixed");
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ? String(item.categoryId) : "none");
  const [itemType, setItemType] = useState(item?.itemType ?? "food");
  const [courseNumber, setCourseNumber] = useState(item?.courseNumber ?? 1);
  const [kitchenStation, setKitchenStation] = useState(item?.kitchenStation ?? "");
  const [kdsNote, setKdsNote] = useState(item?.kdsNote ?? "");
  const [preparationTime, setPreparationTime] = useState(item?.preparationTime ? String(item.preparationTime) : "");
  const [allergens, setAllergens] = useState<string[]>(item?.allergens ? (typeof item.allergens === "string" ? JSON.parse(item.allergens) : item.allergens) : []);
  const [labels, setLabels] = useState<string[]>(item?.labels ? (typeof item.labels === "string" ? JSON.parse(item.labels) : item.labels) : []);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [availabilityType, setAvailabilityType] = useState<"always"|"scheduled"|"manual">(item?.availabilityType ?? "always");
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<number[]>(
    item?.modifierLinks?.map((l: any) => l.modifierGroupId) ?? item?.modifierGroups?.map((g: any) => g.id) ?? []
  );
  // Nährwerte
  const [nutritionPer, setNutritionPer] = useState<"100g"|"portion">(item?.nutritionPer ?? "100g");
  const [calories, setCalories] = useState(item?.calories ?? "");
  const [protein, setProtein] = useState(item?.protein ?? "");
  const [fat, setFat] = useState(item?.fat ?? "");
  const [saturatedFat, setSaturatedFat] = useState(item?.saturatedFat ?? "");
  const [carbs, setCarbs] = useState(item?.carbs ?? "");
  const [sugar, setSugar] = useState(item?.sugar ?? "");
  const [fiber, setFiber] = useState(item?.fiber ?? "");
  const [salt, setSalt] = useState(item?.salt ?? "");
  // Bild-Upload
  const [imageUrl, setImageUrl] = useState<string>(item?.imageUrl ?? "");
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("basic");

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Bild zu gross (max. 5 MB)"); return; }
    setImageUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/menu/upload-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      setImageUrl(json.url);
      toast.success("Bild hochgeladen");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImageUploading(false);
    }
  };

  const create = trpc.menu.upsertItem.useMutation({
    onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Artikel erstellt"); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const update = trpc.menu.upsertItem.useMutation({
    onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Artikel gespeichert"); onClose(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) return toast.error("Name erforderlich");
    if (!price || isNaN(parseFloat(price))) return toast.error("Gültiger Preis erforderlich");
    const data = {
      name: name.trim(),
      description: description || undefined,
      shortDescription: shortDescription || undefined,
      price: parseFloat(price).toFixed(2),
      costPrice: costPrice ? parseFloat(costPrice).toFixed(2) : undefined,
      priceType,
      categoryId: categoryId !== "none" ? Number(categoryId) : null,
      itemType: (itemType || "food") as "food" | "beverage" | "dessert" | "set_menu" | "other",
      courseNumber,
      kitchenStation: kitchenStation || undefined,
      kdsNote: kdsNote || undefined,
      preparationTime: preparationTime ? Number(preparationTime) : undefined,
      allergens: allergens as any,
      labels: labels as any,
      isActive,
      availabilityType,
      modifierGroupIds: selectedModifierGroupIds,
      imageUrl: imageUrl || undefined,
      // Nährwerte
      nutritionPer,
      calories: calories || undefined,
      protein: protein || undefined,
      fat: fat || undefined,
      saturatedFat: saturatedFat || undefined,
      carbs: carbs || undefined,
      sugar: sugar || undefined,
      fiber: fiber || undefined,
      salt: salt || undefined,
    };
    if (item?.id) update.mutate({ id: item.id, ...data });
    else create.mutate(data);
  };

  const toggleModifierGroup = (id: number) => {
    setSelectedModifierGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basic">Basis</TabsTrigger>
            <TabsTrigger value="image">Bild</TabsTrigger>
            <TabsTrigger value="kitchen">Küche</TabsTrigger>
            <TabsTrigger value="modifiers">Extras</TabsTrigger>
            <TabsTrigger value="nutrition">Nährwerte</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Wiener Schnitzel" />
              </div>
              <div>
                <Label>Preis (CHF) *</Label>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" type="number" step="0.05" min="0" />
              </div>
              <div>
                <Label>Preistyp</Label>
                <Select value={priceType} onValueChange={(v: any) => setPriceType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixpreis</SelectItem>
                    <SelectItem value="variable">Durch Variante</SelectItem>
                    <SelectItem value="from">Ab-Preis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Einkaufspreis (CHF)</Label>
                <Input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0.00" type="number" step="0.05" min="0" />
              </div>
              <div>
                <Label>Kategorie</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Keine Kategorie —</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Typ</Label>
                <Select value={itemType} onValueChange={setItemType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gang</Label>
                <Select value={String(courseNumber)} onValueChange={(v) => setCourseNumber(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>Gang {n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Verfügbarkeit</Label>
                <Select value={availabilityType} onValueChange={(v: any) => setAvailabilityType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Immer</SelectItem>
                    <SelectItem value="scheduled">Zeitgesteuert</SelectItem>
                    <SelectItem value="manual">Manuell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Beschreibung (für Gäste)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Kurze Beschreibung des Gerichts..." />
              </div>
              <div className="col-span-2">
                <Label>Kurzbezeichnung (für Bon/KDS)</Label>
                <Input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="z.B. W.Schnitzel" maxLength={50} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>Artikel aktiv</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="image" className="space-y-4 mt-4">
            <div className="space-y-4">
              {/* Vorschau */}
              {imageUrl ? (
                <div className="relative group w-full">
                  <img src={imageUrl} alt="Artikelbild" className="w-full h-48 object-cover rounded-lg border" />
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  className="w-full h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f); }}
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Bild hier ablegen oder klicken</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, WebP – max. 5 MB</p>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={imageUploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {imageUploading ? "Wird hochgeladen..." : imageUrl ? "Anderes Bild wählen" : "Bild hochladen"}
                </Button>
                {imageUrl && (
                  <Button type="button" variant="outline" onClick={() => setImageUrl("")}>
                    <X className="w-4 h-4 mr-2" />Entfernen
                  </Button>
                )}
              </div>
              <div>
                <Label>Oder Bild-URL eingeben</Label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="kitchen" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Küchenstation</Label>
                <Select value={kitchenStation || "none"} onValueChange={(v) => setKitchenStation(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Station wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Keine —</SelectItem>
                    {KITCHEN_STATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Zubereitungszeit (Minuten)</Label>
                <Input value={preparationTime} onChange={(e) => setPreparationTime(e.target.value)} type="number" min="0" max="120" placeholder="z.B. 15" />
              </div>
              <div className="col-span-2">
                <Label>KDS-Hinweis (immer anzeigen)</Label>
                <Textarea value={kdsNote} onChange={(e) => setKdsNote(e.target.value)} rows={2} placeholder="z.B. Immer frisch zubereiten, nicht vorkochen" />
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Allergene (14 EU-Pflichtallergene)</Label>
              <p className="text-xs text-muted-foreground mb-2">Aktive Allergene werden auf der Speisekarte und dem Bon angezeigt</p>
              <AllergenSelector value={allergens} onChange={setAllergens} />
            </div>
          </TabsContent>

          <TabsContent value="modifiers" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Wählen Sie Modifier-Gruppen, die für diesen Artikel verfügbar sein sollen (z.B. Beilagen, Saucen, Extras).</p>
            {modifierGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Noch keine Modifier-Gruppen. Erstellen Sie diese zuerst im Tab "Modifier".</p>
              </div>
            ) : (
              <div className="space-y-2">
                {modifierGroups.map((g) => (
                  <div key={g.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedModifierGroupIds.includes(g.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  }`} onClick={() => toggleModifierGroup(g.id)}>
                    <div>
                      <p className="font-medium text-sm">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.selectionType === "single" ? "Einzelauswahl" : g.selectionType === "multiple" ? "Mehrfachauswahl" : "Mengenauswahl"}
                        {g.isRequired ? " · Pflicht" : " · Optional"}
                        {" · "}{g.modifiers?.length ?? 0} Optionen
                      </p>
                    </div>
                    {selectedModifierGroupIds.includes(g.id) && <Check className="w-4 h-4 text-primary" />}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="text-sm font-semibold">Nährwerte pro</Label>
                <Select value={nutritionPer} onValueChange={(v: any) => setNutritionPer(v)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100g">100 g</SelectItem>
                    <SelectItem value="portion">Portion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Energie (kcal)</Label>
                  <Input value={calories} onChange={(e) => setCalories(e.target.value)} type="number" min="0" step="1" placeholder="z.B. 250" />
                </div>
                <div>
                  <Label className="text-xs">Eiweiß (g)</Label>
                  <Input value={protein} onChange={(e) => setProtein(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 12.5" />
                </div>
                <div>
                  <Label className="text-xs">Fett (g)</Label>
                  <Input value={fat} onChange={(e) => setFat(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 8.0" />
                </div>
                <div>
                  <Label className="text-xs">davon gesättigte Fettsäuren (g)</Label>
                  <Input value={saturatedFat} onChange={(e) => setSaturatedFat(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 3.0" />
                </div>
                <div>
                  <Label className="text-xs">Kohlenhydrate (g)</Label>
                  <Input value={carbs} onChange={(e) => setCarbs(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 30.0" />
                </div>
                <div>
                  <Label className="text-xs">davon Zucker (g)</Label>
                  <Input value={sugar} onChange={(e) => setSugar(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 5.0" />
                </div>
                <div>
                  <Label className="text-xs">Ballaststoffe (g)</Label>
                  <Input value={fiber} onChange={(e) => setFiber(e.target.value)} type="number" min="0" step="0.1" placeholder="z.B. 2.5" />
                </div>
                <div>
                  <Label className="text-xs">Salz (g)</Label>
                  <Input value={salt} onChange={(e) => setSalt(e.target.value)} type="number" min="0" step="0.01" placeholder="z.B. 0.8" />
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-sm font-semibold">Labels & Kennzeichnungen</Label>
                <p className="text-xs text-muted-foreground mb-3">Werden auf der Kellner-Oberfläche und der Speisekarte angezeigt</p>
                <LabelSelector value={labels} onChange={setLabels} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
            {create.isPending || update.isPending ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modifier Group Dialog ────────────────────────────────────────────────────
function ModifierGroupDialog({ open, onClose, group }: { open: boolean; onClose: () => void; group?: any }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(group?.name ?? "");
  const [selectionType, setSelectionType] = useState<"single"|"multiple"|"quantity">(group?.selectionType ?? "multiple");
  const [isRequired, setIsRequired] = useState(group?.isRequired ?? false);
  const [minSelections, setMinSelections] = useState(group?.minSelections ?? 0);
  const [maxSelections, setMaxSelections] = useState(group?.maxSelections ? String(group.maxSelections) : "");
  const [modifiers, setModifiers] = useState<Array<{ id?: number; name: string; priceAdjustment: string; isDefault: boolean; isActive: boolean; sortOrder: number }>>(
    group?.modifiers ?? []
  );

  const upsert = trpc.menu.upsertModifierGroup.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); toast.success("Modifier-Gruppe gespeichert"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const addModifier = () => setModifiers((prev) => [...prev, { name: "", priceAdjustment: "0.00", isDefault: false, isActive: true, sortOrder: prev.length }]);
  const removeModifier = (i: number) => setModifiers((prev) => prev.filter((_, idx) => idx !== i));
  const updateModifier = (i: number, field: string, value: any) => setModifiers((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));

  const handleSave = () => {
    if (!name.trim()) return toast.error("Name erforderlich");
    if (modifiers.some((m) => !m.name.trim())) return toast.error("Alle Optionen benötigen einen Namen");
    upsert.mutate({
      id: group?.id,
      name: name.trim(),
      selectionType,
      isRequired,
      minSelections,
      maxSelections: maxSelections ? Number(maxSelections) : null,
      sortOrder: group?.sortOrder ?? 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? "Modifier-Gruppe bearbeiten" : "Neue Modifier-Gruppe"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Gruppenname *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Beilagen, Saucen, Extras..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Auswahltyp</Label>
              <Select value={selectionType} onValueChange={(v: any) => setSelectionType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Einzelauswahl</SelectItem>
                  <SelectItem value="multiple">Mehrfachauswahl</SelectItem>
                  <SelectItem value="quantity">Mengenauswahl</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={isRequired} onCheckedChange={setIsRequired} />
              <Label>Pflichtauswahl</Label>
            </div>
            <div>
              <Label>Min. Auswahl</Label>
              <Input value={minSelections} onChange={(e) => setMinSelections(Number(e.target.value))} type="number" min="0" />
            </div>
            <div>
              <Label>Max. Auswahl (leer = unbegrenzt)</Label>
              <Input value={maxSelections} onChange={(e) => setMaxSelections(e.target.value)} type="number" min="1" placeholder="∞" />
            </div>
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Optionen</Label>
              <Button size="sm" variant="outline" onClick={addModifier}><Plus className="w-3 h-3 mr-1" />Option hinzufügen</Button>
            </div>
            <div className="space-y-2">
              {modifiers.map((m, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input value={m.name} onChange={(e) => updateModifier(i, "name", e.target.value)} placeholder="Name..." className="flex-1" />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">+</span>
                    <Input value={m.priceAdjustment} onChange={(e) => updateModifier(i, "priceAdjustment", e.target.value)} placeholder="0.00" className="pl-5" type="number" step="0.05" />
                  </div>
                  <button type="button" onClick={() => removeModifier(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {modifiers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Noch keine Optionen. Klicken Sie auf "Option hinzufügen".</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>{upsert.isPending ? "Speichern..." : "Speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MenuSetDialog ────────────────────────────────────────────────────────────
function MenuSetDialog({ open, onClose, set, categories, items }: {
  open: boolean; onClose: () => void;
  set?: any; categories: any[]; items: any[];
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [courses, setCourses] = useState<Array<{ id?: number; name: string; courseNumber: number; minChoices: number; maxChoices: number; menuItemIds: number[] }>>([]);

  useEffect(() => {
    if (set) {
      setName(set.name || "");
      setDescription(set.description || "");
      setPrice(set.price || "");
      setCategoryId(set.categoryId ? String(set.categoryId) : "");
      setIsActive(set.isActive !== false);
      setCourses((set.courses || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        courseNumber: c.courseNumber,
        minChoices: c.minChoices || 1,
        maxChoices: c.maxChoices || 1,
        menuItemIds: (() => { try { return typeof c.menuItemIds === 'string' ? JSON.parse(c.menuItemIds) : (c.menuItemIds || []); } catch { return []; } })()
      })));
    } else {
      setName(""); setDescription(""); setPrice(""); setCategoryId(""); setIsActive(true);
      setCourses([{ name: "Gang 1", courseNumber: 1, minChoices: 1, maxChoices: 1, menuItemIds: [] }]);
    }
  }, [set, open]);

  const upsert = trpc.menu.upsertSet.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); toast.success(set ? "Menü-Set aktualisiert" : "Menü-Set erstellt"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const addCourse = () => setCourses(prev => [...prev, { name: `Gang ${prev.length + 1}`, courseNumber: prev.length + 1, minChoices: 1, maxChoices: 1, menuItemIds: [] }]);
  const removeCourse = (idx: number) => setCourses(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, courseNumber: i + 1 })));
  const updateCourse = (idx: number, field: string, value: any) => setCourses(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  const toggleItemInCourse = (idx: number, itemId: number) => {
    setCourses(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const ids = c.menuItemIds.includes(itemId) ? c.menuItemIds.filter(id => id !== itemId) : [...c.menuItemIds, itemId];
      return { ...c, menuItemIds: ids };
    }));
  };

  const handleSave = () => {
    if (!name.trim()) return toast.error("Name erforderlich");
    if (!price || !/^\d+(\.(\d{1,2}))?$/.test(price)) return toast.error("Gültiger Preis erforderlich");
    if (courses.length === 0) return toast.error("Mindestens ein Gang erforderlich");
    upsert.mutate({ id: set?.id, name: name.trim(), description: description || undefined, price, categoryId: categoryId ? Number(categoryId) : null, isActive });
  };

  const foodItems = items.filter(item => item.itemType !== 'set_menu');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{set ? "Menü-Set bearbeiten" : "Neues Menü-Set"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. 3-Gang-Menü, Tagesmenü" /></div>
            <div><Label>Fixpreis (CHF) *</Label><Input value={price} onChange={e => setPrice(e.target.value)} placeholder="65.00" /></div>
            <div><Label>Kategorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Keine" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Keine Kategorie</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Beschreibung</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Kurze Beschreibung des Menüs..." rows={2} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktiv (im Kellner-Panel sichtbar)</Label>
            </div>
          </div>

          <Separator />
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-sm">Gänge ({courses.length})</p>
                <p className="text-xs text-muted-foreground">Definieren Sie die Gänge und welche Artikel wählbar sind</p>
              </div>
              <Button size="sm" variant="outline" onClick={addCourse}><Plus className="w-3.5 h-3.5 mr-1" />Gang hinzufügen</Button>
            </div>
            <div className="space-y-4">
              {courses.map((course, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                    <Input value={course.name} onChange={e => updateCourse(idx, 'name', e.target.value)} placeholder={`Gang ${idx + 1} Name`} className="flex-1" />
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-muted-foreground">Min</span>
                      <Input type="number" min={1} value={course.minChoices} onChange={e => updateCourse(idx, 'minChoices', Number(e.target.value))} className="w-14 h-8 text-center" />
                      <span className="text-muted-foreground">Max</span>
                      <Input type="number" min={1} value={course.maxChoices} onChange={e => updateCourse(idx, 'maxChoices', Number(e.target.value))} className="w-14 h-8 text-center" />
                    </div>
                    {courses.length > 1 && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCourse(idx)}><X className="w-3.5 h-3.5" /></Button>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Wählbare Artikel ({course.menuItemIds.length} ausgewählt):</p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {foodItems.map(item => {
                        const selected = course.menuItemIds.includes(item.id);
                        return (
                          <button key={item.id} onClick={() => toggleItemInCourse(idx, item.id)}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${
                              selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
                            }`}>
                            {item.name} {item.price ? `(${parseFloat(item.price).toFixed(2)})` : ''}
                          </button>
                        );
                      })}
                      {foodItems.length === 0 && <p className="text-xs text-muted-foreground">Keine Artikel vorhanden. Erstellen Sie zuerst Artikel im Tab "Artikel".</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>{upsert.isPending ? "Speichern..." : "Speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MenuPreview ──────────────────────────────────────────────────────────────
function MenuPreview({ open, onClose, categories, items, modifierGroups }: {
  open: boolean; onClose: () => void;
  categories: any[]; items: any[]; modifierGroups: any[];
}) {
  const [previewCategoryId, setPreviewCategoryId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const displayCategories = categories.filter(c => c.isActive);
  const activeCatId = previewCategoryId ?? (displayCategories[0]?.id ?? null);
  const displayItems = items.filter(item => item.isActive && (activeCatId === null || item.categoryId === activeCatId));

  const LABEL_COLORS: Record<string, string> = {
    vegan: "bg-green-100 text-green-800", vegetarisch: "bg-lime-100 text-lime-800",
    scharf: "bg-red-100 text-red-800", bio: "bg-emerald-100 text-emerald-800",
    neu: "bg-blue-100 text-blue-800", bestseller: "bg-yellow-100 text-yellow-800",
    glutenfrei: "bg-purple-100 text-purple-800", laktosefrei: "bg-pink-100 text-pink-800",
    alkohol: "bg-orange-100 text-orange-800",
  };
  const LABEL_NAMES: Record<string, string> = {
    vegan: "Vegan", vegetarisch: "Vegetarisch", scharf: "🌶 Scharf", bio: "Bio",
    neu: "Neu", bestseller: "⭐ Bestseller", glutenfrei: "Glutenfrei", laktosefrei: "Laktosefrei", alkohol: "Alkohol",
  };
  const ALLERGEN_NAMES: Record<string, string> = {
    gluten: "G", krebstiere: "Kr", eier: "Ei", fisch: "Fi", erdnuesse: "En", soja: "So",
    milch: "Mi", nuesse: "Nu", sellerie: "Se", senf: "Sf", sesam: "Ss", schwefeldioxid: "SO₂",
    lupinen: "Lu", weichtiere: "We",
  };

  const getItemModifiers = (item: any) => {
    const groupIds: number[] = (() => { try { return typeof item.modifierGroupIds === 'string' ? JSON.parse(item.modifierGroupIds) : (item.modifierGroupIds || []); } catch { return []; } })();
    return modifierGroups.filter(g => groupIds.includes(g.id));
  };
  const getItemVariants = (item: any) => {
    return item.variantGroups || [];
  };
  const getItemLabels = (item: any): string[] => {
    try { return typeof item.labels === 'string' ? JSON.parse(item.labels) : (item.labels || []); } catch { return []; }
  };
  const getItemAllergens = (item: any): string[] => {
    try { return typeof item.allergens === 'string' ? JSON.parse(item.allergens) : (item.allergens || []); } catch { return []; }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
          <div>
            <SheetTitle className="text-primary-foreground text-base font-semibold">Speisekarten-Vorschau</SheetTitle>
            <p className="text-primary-foreground/70 text-xs">So sieht der Kellner die Karte</p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="border-b bg-background">
          <ScrollArea className="w-full">
            <div className="flex gap-1 px-3 py-2">
              {displayCategories.map(cat => (
                <button key={cat.id} onClick={() => setPreviewCategoryId(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCatId === cat.id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                  }`}>
                  {cat.icon && <span className="mr-1">{cat.icon}</span>}{cat.name}
                  <span className="ml-1 text-xs opacity-60">({items.filter(i => i.categoryId === cat.id && i.isActive).length})</span>
                </button>
              ))}
              {displayCategories.length === 0 && <p className="text-sm text-muted-foreground px-2 py-1">Keine aktiven Kategorien</p>}
            </div>
          </ScrollArea>
        </div>

        {/* Items grid */}
        <ScrollArea className="flex-1">
          <div className="p-3 grid grid-cols-2 gap-2">
            {displayItems.map(item => {
              const labels = getItemLabels(item);
              const allergens = getItemAllergens(item);
              return (
                <button key={item.id} onClick={() => setSelectedItem(item)}
                  className="text-left border rounded-xl p-3 hover:border-primary/50 hover:shadow-sm transition-all active:scale-95 bg-card">
                  {item.imageUrl && (
                    <div className="w-full h-24 rounded-lg overflow-hidden mb-2 bg-muted">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {!item.imageUrl && (
                    <div className="w-full h-16 rounded-lg mb-2 bg-muted/50 flex items-center justify-center">
                      <UtensilsCrossed className="w-6 h-6 text-muted-foreground/30" />
                    </div>
                  )}
                  <p className="font-medium text-sm leading-tight">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-primary">
                      {item.priceType === 'from' ? 'ab ' : ''}{parseFloat(item.price || '0').toFixed(2)}
                    </span>
                    {labels.length > 0 && (
                      <div className="flex gap-0.5">
                        {labels.slice(0, 2).map(l => (
                          <span key={l} className={`text-[10px] px-1 rounded ${LABEL_COLORS[l] || 'bg-gray-100'}`}>{LABEL_NAMES[l] || l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {allergens.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {allergens.map(a => (
                        <span key={a} className="text-[9px] px-1 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">{ALLERGEN_NAMES[a] || a}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
            {displayItems.length === 0 && (
              <div className="col-span-2 text-center py-12 text-muted-foreground">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Keine aktiven Artikel in dieser Kategorie</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Item detail sheet */}
        {selectedItem && (
          <div className="absolute inset-0 bg-background flex flex-col z-10">
            <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3">
              <button onClick={() => setSelectedItem(null)} className="p-1 rounded hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
              <SheetTitle className="text-primary-foreground text-base font-semibold">{selectedItem.name}</SheetTitle>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {selectedItem.imageUrl && (
                  <div className="w-full h-48 rounded-xl overflow-hidden bg-muted">
                    <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <div className="flex items-start justify-between">
                    <h2 className="text-xl font-bold">{selectedItem.name}</h2>
                    <span className="text-xl font-bold text-primary">
                      {selectedItem.priceType === 'from' ? 'ab ' : ''}{parseFloat(selectedItem.price || '0').toFixed(2)} CHF
                    </span>
                  </div>
                  {selectedItem.description && <p className="text-muted-foreground mt-1">{selectedItem.description}</p>}
                </div>

                {/* Labels */}
                {getItemLabels(selectedItem).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {getItemLabels(selectedItem).map(l => (
                      <span key={l} className={`text-xs px-2 py-1 rounded-full font-medium ${LABEL_COLORS[l] || 'bg-gray-100'}`}>{LABEL_NAMES[l] || l}</span>
                    ))}
                  </div>
                )}

                {/* Variants */}
                {getItemVariants(selectedItem).length > 0 && (
                  <div className="space-y-2">
                    {getItemVariants(selectedItem).map((vg: any) => (
                      <div key={vg.id}>
                        <p className="font-medium text-sm">{vg.name} {vg.isRequired && <span className="text-destructive text-xs">*Pflicht</span>}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(vg.options || []).map((opt: any) => (
                            <div key={opt.id} className="px-3 py-1.5 border rounded-lg text-sm">
                              {opt.name} {parseFloat(opt.priceAdjustment || '0') !== 0 && <span className="text-muted-foreground text-xs">(+{parseFloat(opt.priceAdjustment).toFixed(2)})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Modifiers */}
                {getItemModifiers(selectedItem).length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Extras & Optionen</p>
                    {getItemModifiers(selectedItem).map((mg: any) => (
                      <div key={mg.id}>
                        <p className="text-xs text-muted-foreground">{mg.name} {mg.isRequired && '(Pflicht)'}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(mg.modifiers || []).filter((m: any) => m.isActive).map((m: any) => (
                            <div key={m.id} className="px-2 py-1 border rounded text-xs">
                              {m.name} {parseFloat(m.priceAdjustment || '0') !== 0 && <span className="text-muted-foreground">(+{parseFloat(m.priceAdjustment).toFixed(2)})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Allergens */}
                {getItemAllergens(selectedItem).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-800 mb-1">⚠ Allergene</p>
                    <div className="flex flex-wrap gap-1">
                      {getItemAllergens(selectedItem).map(a => (
                        <span key={a} className="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded">{ALLERGEN_NAMES[a] || a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kitchen info */}
                {(selectedItem.preparationTime || selectedItem.calories || selectedItem.kitchenNote) && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    {selectedItem.preparationTime && <p className="text-xs text-muted-foreground">⏱ Zubereitungszeit: ~{selectedItem.preparationTime} Min.</p>}
                    {selectedItem.calories && <p className="text-xs text-muted-foreground">🔥 {selectedItem.calories} kcal</p>}
                    {selectedItem.kitchenNote && <p className="text-xs text-muted-foreground italic">{selectedItem.kitchenNote}</p>}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── CsvImportDialog ──────────────────────────────────────────────────────────
function CsvImportDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: any[] }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const TEMPLATE_HEADERS = ["name", "description", "price", "category", "type", "labels", "allergens", "preparationTime", "calories", "kitchenStation"];
  const TEMPLATE_EXAMPLE = [
    ["Wiener Schnitzel", "Klassisches Schnitzel mit Pommes", "24.50", "Hauptgänge", "food", "bestseller", "gluten,eier,milch", "20", "650", "Küche"],
    ["Tomatensuppe", "Hausgemachte Tomatensuppe", "9.50", "Vorspeisen", "food", "vegan,vegetarisch", "", "10", "180", "Küche"],
    ["Mineralwasser", "", "4.50", "Getränke", "beverage", "", "", "", "", "Bar"],
  ];

  const downloadTemplate = () => {
    const rows = [TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "speisekarte-vorlage.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { rows: [], errors: ["CSV-Datei ist leer oder hat keine Datenzeilen"] };
    const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
    const errs: string[] = [];
    const rows = lines.slice(1).map((line, idx) => {
      const vals = line.split(",").map(v => v.replace(/^"|"$/g, "").trim());
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      if (!row.name) errs.push(`Zeile ${idx + 2}: Name fehlt`);
      if (!row.price || isNaN(parseFloat(row.price))) errs.push(`Zeile ${idx + 2}: Ungültiger Preis "${row.price}"`);
      return row;
    }).filter(r => r.name);
    return { rows, errors: errs };
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, errors: errs } = parseCsv(text);
      setCsvData(rows);
      setErrors(errs);
      setResult(null);
    };
    reader.readAsText(file, "UTF-8");
  };

  const importCsv = trpc.menu.importCsv.useMutation({
    onSuccess: (res) => { setResult({ ...res, errors: [] }); setImporting(false); utils.menu.listItems.invalidate(); utils.menu.listCategories.invalidate(); },
    onError: (e) => { toast.error(e.message); setImporting(false); },
  });

  const handleImport = () => {
    if (csvData.length === 0) return;
    setImporting(true);
    importCsv.mutate({ rows: csvData });
  };

  const handleClose = () => { setCsvData([]); setErrors([]); setResult(null); if (fileRef.current) fileRef.current.value = ""; onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" />CSV-Import</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Template download */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">CSV-Format</p>
                <p className="text-xs mt-0.5">Spalten: name, description, price, category, type (food/beverage/dessert), labels (kommagetrennt), allergens (kommagetrennt), preparationTime, calories, kitchenStation</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="mt-2" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1" />Vorlage herunterladen
            </Button>
          </div>

          {/* File upload */}
          <div>
            <Label>CSV-Datei auswählen</Label>
            <div className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileRef.current?.click()}>
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Klicken zum Auswählen oder CSV hierher ziehen</p>
              {csvData.length > 0 && <p className="text-sm font-medium text-primary mt-1">{csvData.length} Zeilen geladen</p>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-1">Fehler gefunden:</p>
              {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
            </div>
          )}

          {/* Preview */}
          {csvData.length > 0 && !result && (
            <div>
              <p className="text-sm font-medium mb-2">Vorschau ({Math.min(csvData.length, 5)} von {csvData.length} Zeilen):</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>{["Name", "Preis", "Kategorie", "Typ"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.price}</td>
                        <td className="px-3 py-2">{row.category || "–"}</td>
                        <td className="px-3 py-2">{row.type || "food"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 5 && <p className="text-xs text-muted-foreground px-3 py-2 border-t">... und {csvData.length - 5} weitere Zeilen</p>}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-4 ${result.errors.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <p className="font-medium text-sm">{result.errors.length === 0 ? '✓ Import erfolgreich' : '⚠ Import mit Warnungen'}</p>
              <p className="text-sm mt-1">{result.created} Artikel erstellt · {result.skipped} übersprungen</p>
              {result.errors.length > 0 && (
                <div className="mt-2">{result.errors.map((e, i) => <p key={i} className="text-xs text-yellow-800">{e}</p>)}</div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Schliessen</Button>
          {!result && <Button onClick={handleImport} disabled={csvData.length === 0 || importing || errors.length > 0}>
            {importing ? "Importiere..." : `${csvData.length} Artikel importieren`}
          </Button>}
          {result && <Button onClick={handleClose}>Fertig</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MenuManagement() {
  const [activeTab, setActiveTab] = useState("categories");
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: any }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [modifierDialog, setModifierDialog] = useState<{ open: boolean; group?: any }>({ open: false });
  const [menuSetDialog, setMenuSetDialog] = useState<{ open: boolean; set?: any }>({ open: false });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const utils = trpc.useUtils();

  const { data: categories = [], isLoading: catsLoading } = trpc.menu.listCategories.useQuery();
  const { data: items = [], isLoading: itemsLoading } = trpc.menu.listItems.useQuery({
    categoryId: selectedCategoryId ?? undefined,
    search: search || undefined,
  });
  const { data: modifierGroups = [] } = trpc.menu.listModifierGroups.useQuery();
  const { data: menuSets = [] } = trpc.menu.listSets.useQuery();

  const deleteCategory = trpc.menu.deleteCategory.useMutation({
    onSuccess: () => { utils.menu.listCategories.invalidate(); toast.success("Kategorie gelöscht"); setDeletingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteItem = trpc.menu.deleteItem.useMutation({
    onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Artikel gelöscht"); setDeletingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteModifierGroup = trpc.menu.deleteModifierGroup.useMutation({
    onSuccess: () => { utils.menu.listModifierGroups.invalidate(); toast.success("Modifier-Gruppe gelöscht"); setDeletingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const toggleAvailability = trpc.menu.toggleAvailability.useMutation({
    onSuccess: () => utils.menu.listItems.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const duplicateItem = trpc.menu.duplicateItem.useMutation({
    onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Artikel dupliziert"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMenuSet = trpc.menu.deleteSet.useMutation({
    onSuccess: () => { utils.menu.listSets.invalidate(); toast.success("Menü-Set gelöscht"); setDeletingId(null); },
    onError: (e) => toast.error(e.message),
  });

  const filteredItems = items.filter((item: any) =>
    !search || item.name.toLowerCase().includes(search.toLowerCase())
  );

   return (
    <>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UtensilsCrossed className="w-6 h-6 text-primary" />
              Speisekarte
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {categories.length} Kategorien · {items.length} Artikel · {menuSets.length} Menü-Sets
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCsvImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />CSV-Import
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => setLocation("/admin/menu/ki-import")}
            >
              <Sparkles className="w-4 h-4 mr-2" />KI-Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="w-4 h-4 mr-2" />Vorschau
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="categories" className="gap-2">
              <Layers className="w-4 h-4" />Kategorien
            </TabsTrigger>
            <TabsTrigger value="items" className="gap-2">
              <Tag className="w-4 h-4" />Artikel
            </TabsTrigger>
            <TabsTrigger value="modifiers" className="gap-2">
              <Settings2 className="w-4 h-4" />Modifier
            </TabsTrigger>
            <TabsTrigger value="menusets" className="gap-2">
              <BookOpen className="w-4 h-4" />Menü-Sets
            </TabsTrigger>
          </TabsList>

          {/* ── CATEGORIES TAB ── */}
          <TabsContent value="categories" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-muted-foreground">{categories.length} Kategorien</p>
              <Button onClick={() => setCategoryDialog({ open: true })}>
                <Plus className="w-4 h-4 mr-2" />Neue Kategorie
              </Button>
            </div>
            {catsLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : categories.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Kategorien</p>
                <p className="text-sm">Erstellen Sie Ihre erste Kategorie (z.B. Vorspeisen, Hauptgänge)</p>
                <Button className="mt-4" onClick={() => setCategoryDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-2" />Erste Kategorie erstellen
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((cat: any) => (
                  <div key={cat.id} className={`flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-sm transition-all cursor-pointer ${
                    selectedCategoryId === cat.id ? "border-primary ring-1 ring-primary/20" : "border-border"
                  }`} onClick={() => { setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id); setActiveTab("items"); }}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color ?? "#6366F1" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cat.name}</span>
                        {!cat.isActive && <Badge variant="secondary" className="text-xs">Inaktiv</Badge>}
                        {!cat.isVisible && <Badge variant="outline" className="text-xs">Versteckt</Badge>}
                        {cat.availabilityType !== "always" && (
                          <Badge variant="outline" className="text-xs gap-1"><Clock className="w-3 h-3" />Zeitgesteuert</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(cat as any).itemCount ?? 0} Artikel · Gang {cat.defaultCourseNumber}
                      </p>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => setCategoryDialog({ open: true, category: cat })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      {deletingId === cat.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" onClick={() => deleteCategory.mutate({ id: cat.id })}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(cat.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── ITEMS TAB ── */}
          <TabsContent value="items" className="mt-4">
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Artikel suchen..." className="pl-9" />
              </div>
              {selectedCategoryId && (
                <Button variant="outline" onClick={() => setSelectedCategoryId(null)}>
                  <X className="w-4 h-4 mr-1" />Filter: {categories.find((c: any) => c.id === selectedCategoryId)?.name}
                </Button>
              )}
              <Button onClick={() => setItemDialog({ open: true })}>
                <Plus className="w-4 h-4 mr-2" />Neuer Artikel
              </Button>
            </div>

            {/* Category filter pills */}
            <div className="flex gap-2 flex-wrap mb-4">
              <button onClick={() => setSelectedCategoryId(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!selectedCategoryId ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}>
                Alle
              </button>
              {categories.map((c: any) => (
                <button key={c.id} onClick={() => setSelectedCategoryId(c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${selectedCategoryId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: c.color ?? "#6366F1" }} />
                  {c.name}
                </button>
              ))}
            </div>

            {itemsLoading ? (
              <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Keine Artikel gefunden</p>
                <Button className="mt-4" onClick={() => setItemDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-2" />Ersten Artikel erstellen
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item: any) => {
                  const cat = categories.find((c: any) => c.id === item.categoryId);
                  const itemAllergens: string[] = item.allergens ? (typeof item.allergens === "string" ? JSON.parse(item.allergens) : item.allergens as string[]) : [];
                  const itemLabels: string[] = item.labels ? (typeof item.labels === "string" ? JSON.parse(item.labels) : item.labels as string[]) : [];
                  return (
                    <div key={item.id} className={`flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-sm transition-all ${!item.isAvailable ? "opacity-60" : ""}`}>
                      {/* Thumbnail */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <UtensilsCrossed className="w-5 h-5 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{item.name}</span>
                          {!item.isActive && <Badge variant="secondary" className="text-xs">Inaktiv</Badge>}
                          {!item.isAvailable && <Badge variant="destructive" className="text-xs">Ausverkauft</Badge>}
                          {itemLabels.slice(0, 3).map((l) => {
                            const lDef = LABELS.find((ld) => ld.key === l);
                            return lDef ? <span key={l} className={`px-1.5 py-0.5 rounded text-xs font-medium ${lDef.color}`}>{lDef.label}</span> : null;
                          })}
                          {itemAllergens.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                              {itemAllergens.length} Allergene
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm font-semibold text-primary">CHF {parseFloat(item.price).toFixed(2)}</span>
                          {cat && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cat.color ?? "#6366F1" }} />
                              {cat.name}
                            </span>
                          )}
                          {item.kitchenStation && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ChefHat className="w-3 h-3" />{item.kitchenStation}
                            </span>
                          )}
                          {item.preparationTime && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />{item.preparationTime}min
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" title={item.isAvailable ? "Als ausverkauft markieren" : "Wieder verfügbar"}
                          onClick={() => toggleAvailability.mutate({ id: item.id, isAvailable: !item.isAvailable })}>
                          {item.isAvailable ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-destructive" />}
                        </Button>
                        <Button size="sm" variant="ghost" title="Duplizieren" onClick={() => duplicateItem.mutate({ id: item.id })}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setItemDialog({ open: true, item })}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {deletingId === item.id ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="destructive" onClick={() => deleteItem.mutate({ id: item.id })}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── MODIFIERS TAB ── */}
          <TabsContent value="modifiers" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-muted-foreground">{modifierGroups.length} Modifier-Gruppen</p>
                <p className="text-xs text-muted-foreground">Extras, Beilagen, Saucen, Varianten – wiederverwendbar für alle Artikel</p>
              </div>
              <Button onClick={() => setModifierDialog({ open: true })}>
                <Plus className="w-4 h-4 mr-2" />Neue Gruppe
              </Button>
            </div>
            {modifierGroups.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Modifier-Gruppen</p>
                <p className="text-sm">Erstellen Sie Gruppen für Extras, Beilagen, Saucen etc.</p>
                <Button className="mt-4" onClick={() => setModifierDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-2" />Erste Gruppe erstellen
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {modifierGroups.map((group: any) => (
                  <Card key={group.id} className="border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{group.name}</CardTitle>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {group.selectionType === "single" ? "Einzelauswahl" : group.selectionType === "multiple" ? "Mehrfachauswahl" : "Mengenauswahl"}
                            </Badge>
                            {group.isRequired && <Badge variant="secondary" className="text-xs">Pflicht</Badge>}
                            {group.minSelections > 0 && <Badge variant="outline" className="text-xs">Min: {group.minSelections}</Badge>}
                            {group.maxSelections && <Badge variant="outline" className="text-xs">Max: {group.maxSelections}</Badge>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setModifierDialog({ open: true, group })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {deletingId === group.id ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" onClick={() => deleteModifierGroup.mutate({ id: group.id })}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(group.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="flex flex-wrap gap-2">
                        {(group.modifiers ?? []).map((m: any) => (
                          <div key={m.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${!m.isActive ? "opacity-50" : ""}`}>
                            <span>{m.name}</span>
                            {parseFloat(m.priceAdjustment) !== 0 && (
                              <span className="text-muted-foreground">
                                {parseFloat(m.priceAdjustment) > 0 ? "+" : ""}{parseFloat(m.priceAdjustment).toFixed(2)}
                              </span>
                            )}
                          </div>
                        ))}
                        {(!group.modifiers || group.modifiers.length === 0) && (
                          <p className="text-xs text-muted-foreground">Keine Optionen</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── MENU SETS TAB ── */}
          <TabsContent value="menusets" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-muted-foreground">{menuSets.length} Menü-Sets</p>
                <p className="text-xs text-muted-foreground">3-Gang, 5-Gang, Tagesmenü – Fixpreismenüs mit mehreren Gängen</p>
              </div>
              <Button onClick={() => setMenuSetDialog({ open: true })}>
                <Plus className="w-4 h-4 mr-2" />Neues Menü-Set
              </Button>
            </div>
            {menuSets.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Noch keine Menü-Sets</p>
                <p className="text-sm">Erstellen Sie 3-Gang, 5-Gang oder Tagesmenüs mit Fixpreis</p>
                <Button className="mt-4" onClick={() => setMenuSetDialog({ open: true })}>
                  <Plus className="w-4 h-4 mr-2" />Erstes Menü-Set erstellen
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {menuSets.map((set: any) => (
                  <Card key={set.id} className="border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{set.name}</CardTitle>
                            {!set.isActive && <Badge variant="secondary" className="text-xs">Inaktiv</Badge>}
                          </div>
                          {set.description && <p className="text-xs text-muted-foreground mt-0.5">{set.description}</p>}
                          <div className="flex gap-2 mt-1">
                            <Badge className="text-xs bg-primary/10 text-primary border-0">
                              CHF {parseFloat(set.price || '0').toFixed(2)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {(set.courses || []).length} Gänge
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button size="sm" variant="ghost" onClick={() => setMenuSetDialog({ open: true, set })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {deletingId === set.id ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" onClick={() => deleteMenuSet.mutate({ id: set.id })}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(set.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    {(set.courses || []).length > 0 && (
                      <CardContent className="px-4 pb-4">
                        <div className="flex flex-wrap gap-2">
                          {(set.courses || []).map((course: any) => {
                            const itemIds: number[] = (() => { try { return typeof course.menuItemIds === 'string' ? JSON.parse(course.menuItemIds) : (course.menuItemIds || []); } catch { return []; } })();
                            return (
                              <div key={course.id} className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-lg text-xs">
                                <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">{course.courseNumber}</span>
                                <span className="font-medium">{course.name}</span>
                                <span className="text-muted-foreground">({itemIds.length} Artikel)</span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <CategoryDialog
        open={categoryDialog.open}
        onClose={() => setCategoryDialog({ open: false })}
        category={categoryDialog.category}
        restaurantId={0}
      />
      <ItemDialog
        open={itemDialog.open}
        onClose={() => setItemDialog({ open: false })}
        item={itemDialog.item}
        categories={categories}
        modifierGroups={modifierGroups}
      />
      <ModifierGroupDialog
        open={modifierDialog.open}
        onClose={() => setModifierDialog({ open: false })}
        group={modifierDialog.group}
      />
      <MenuSetDialog
        open={menuSetDialog.open}
        onClose={() => setMenuSetDialog({ open: false })}
        set={menuSetDialog.set}
        categories={categories}
        items={items}
      />
      <MenuPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        categories={categories}
        items={items}
        modifierGroups={modifierGroups}
      />
      <CsvImportDialog
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        categories={categories}
      />
    </>
  );
}
