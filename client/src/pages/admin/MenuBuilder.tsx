/**
 * MenuBuilder – Admin-Speisekarte aufbauen
 *
 * Layout (identisch zur Kellner-Bestellansicht):
 *   ┌──────┬─────────────────────────────────────────┐
 *   │      │  [Unterkategorie-Chips]  [+ Hinzufügen] │
 *   │ Ober-├─────────────────────────────────────────┤
 *   │ kat. │                                         │
 *   │ (li) │   Artikel-Grid (Mitte)                  │
 *   │      │                                         │
 *   │  [+] │                                         │
 *   └──────┴─────────────────────────────────────────┘
 *
 * Drag & Drop: Alle drei Ebenen sind per dnd-kit sortierbar.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { MenuImportDialog } from "@/components/MenuImportDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, horizontalListSortingStrategy, rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Pencil, Trash2, X, GripVertical, GripHorizontal,
  UtensilsCrossed, GlassWater, Wine, Coffee, ShoppingBag, Star,
  Layers, Tag, Package, BookOpen, Utensils, Flame, Leaf,
  Check, AlertTriangle, Zap, Clock, ChefHat, Upload, Warehouse, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Icons ────────────────────────────────────────────────────────────────────
const ICON_LIST: { key: string; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { key: "UtensilsCrossed", label: "Essen",        Icon: UtensilsCrossed },
  { key: "GlassWater",      label: "Drinks",       Icon: GlassWater },
  { key: "Wine",            label: "Weine",        Icon: Wine },
  { key: "Coffee",          label: "Heissgetr.",   Icon: Coffee },
  { key: "ShoppingBag",     label: "Takeaway",     Icon: ShoppingBag },
  { key: "Star",            label: "Favoriten",    Icon: Star },
  { key: "Layers",          label: "Diverses",     Icon: Layers },
  { key: "Tag",             label: "Aktionen",     Icon: Tag },
  { key: "Package",         label: "Pakete",       Icon: Package },
  { key: "BookOpen",        label: "Menüs",        Icon: BookOpen },
  { key: "Utensils",        label: "Vorspeisen",   Icon: Utensils },
  { key: "Flame",           label: "Grill",        Icon: Flame },
  { key: "Leaf",            label: "Vegan",        Icon: Leaf },
];
const COLORS = ["#6366F1","#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#F97316","#64748B"];

function resolveIcon(key?: string | null) {
  return ICON_LIST.find(i => i.key === key)?.Icon ?? UtensilsCrossed;
}

// ─── Sortable Wrappers ────────────────────────────────────────────────────────
// WICHTIG: touchAction:'none' darf NICHT auf dem Container-div stehen,
// sonst blockiert es den Browser-Scroll sofort beim ersten Touch.
// Stattdessen: setActivatorNodeRef auf den Drag-Handle zeigen lassen,
// damit nur der Handle-Bereich touch-action:none bekommt.

// dragHandleProps-Typ enthält setActivatorNodeRef separat, damit TypeScript kein 'ref' in HTMLAttributes erwartet
type DragHandleChildProps = {
  dragHandleProps: React.HTMLAttributes<HTMLElement>;
  setHandleRef: (el: HTMLElement | null) => void;
  isDragging: boolean;
};

function SortableTopCat({ id, children }: { id: number; children: (props: DragHandleChildProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.85 : 1,
      zIndex: isDragging ? 999 : undefined,
      scale: isDragging ? '1.05' : '1',
      filter: isDragging ? 'drop-shadow(0 8px 16px rgba(0,0,0,0.25))' : undefined,
      // KEIN touchAction:'none' hier – nur auf dem Handle via setHandleRef
    }}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, setHandleRef: setActivatorNodeRef, isDragging })}
    </div>
  );
}

function SortableSubCat({ id, children }: { id: number; children: (props: DragHandleChildProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.85 : 1,
      zIndex: isDragging ? 999 : undefined,
      scale: isDragging ? '1.08' : '1',
      filter: isDragging ? 'drop-shadow(0 8px 20px rgba(0,0,0,0.2))' : undefined,
    }}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, setHandleRef: setActivatorNodeRef, isDragging })}
    </div>
  );
}

function SortableItem({ id, children }: { id: number; children: (props: DragHandleChildProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition: isDragging ? 'none' : transition,
      opacity: isDragging ? 0.9 : 1,
      zIndex: isDragging ? 999 : undefined,
      scale: isDragging ? '1.06' : '1',
      filter: isDragging ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.3))' : undefined,
    }}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, setHandleRef: setActivatorNodeRef, isDragging })}
    </div>
  );
}

// ─── Oberkategorie-Dialog ─────────────────────────────────────────────────────
function TopCatDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: any }) {
  const utils = trpc.useUtils();
  const [name,  setName]  = useState(initial?.name  ?? "");
  const [icon,  setIcon]  = useState(initial?.icon  ?? "UtensilsCrossed");
  const [color, setColor] = useState(initial?.color ?? "#6366F1");

  // State bei jedem Öffnen zurücksetzen
  useEffect(() => {
    if (open) {
      setName(initial?.name  ?? "");
      setIcon(initial?.icon  ?? "UtensilsCrossed");
      setColor(initial?.color ?? "#6366F1");
    }
  }, [open, initial?.id]);

  const save = trpc.menu.upsertTopCategory.useMutation({
    onSuccess: () => { utils.menu.listTopCategories.invalidate(); toast.success("Gespeichert"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial ? "Oberkategorie bearbeiten" : "Neue Oberkategorie"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label>Name *</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Essen, Drinks, Weine" autoFocus />
          </div>
          <div>
            <Label className="mb-2 block">Icon</Label>
            <div className="grid grid-cols-4 gap-2">
              {ICON_LIST.map(({ key, label, Icon }) => {
                const isSelected = icon === key;
                return (
                  <button key={key} type="button" onClick={() => setIcon(key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all",
                      isSelected
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    )}
                    style={isSelected ? { borderColor: color, backgroundColor: color + "15" } : {}}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: isSelected ? color + "25" : "#f1f5f9", color: isSelected ? color : "#64748b" }}>
                      <Icon className="w-4 h-4 [color:inherit]" />
                    </div>
                    <span className={cn("text-[10px] leading-tight text-center font-medium",
                      isSelected ? "text-foreground" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Farbe</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={cn("w-8 h-8 rounded-full border-[3px] transition-all hover:scale-110",
                    color === c ? "border-foreground scale-110 shadow-md" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => { if (!name.trim()) return toast.error("Name erforderlich"); save.mutate({ id: initial?.id, name: name.trim(), icon, color }); }} disabled={save.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Unterkategorie-Dialog ────────────────────────────────────────────────────
function SubCatDialog({ open, onClose, initial, topCategoryId }: { open: boolean; onClose: () => void; initial?: any; topCategoryId: number }) {
  const utils = trpc.useUtils();
  const [name,  setName]  = useState(initial?.name  ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366F1");

  // State bei jedem Öffnen zurücksetzen
  useEffect(() => {
    if (open) {
      setName(initial?.name  ?? "");
      setColor(initial?.color ?? "#6366F1");
    }
  }, [open, initial?.id]);

  const save = trpc.menu.upsertCategory.useMutation({
    onSuccess: () => { utils.menu.listCategories.invalidate(); toast.success("Gespeichert"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial ? "Unterkategorie bearbeiten" : "Neue Unterkategorie"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <Label>Name *</Label>
            <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Pizza, Salat, Bier" autoFocus />
          </div>
          <div>
            <Label className="mb-2 block">Farbe</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={cn("w-8 h-8 rounded-full border-[3px] transition-all hover:scale-110",
                    color === c ? "border-foreground scale-110 shadow-md" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => { if (!name.trim()) return toast.error("Name erforderlich"); save.mutate({ id: initial?.id, name: name.trim(), color, topCategoryId } as any); }} disabled={save.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Konstanten für Produkt-Dialog ───────────────────────────────────────────
const ALLERGENS = [
  { key: "gluten", label: "Gluten" }, { key: "krebstiere", label: "Krebstiere" },
  { key: "eier", label: "Eier" }, { key: "fisch", label: "Fisch" },
  { key: "erdnuesse", label: "Erdnüsse" }, { key: "soja", label: "Soja" },
  { key: "milch", label: "Milch/Laktose" }, { key: "nuesse", label: "Schalenfrüchte" },
  { key: "sellerie", label: "Sellerie" }, { key: "senf", label: "Senf" },
  { key: "sesam", label: "Sesam" }, { key: "schwefeldioxid", label: "Schwefeldioxid" },
  { key: "lupinen", label: "Lupinen" }, { key: "weichtiere", label: "Weichtiere" },
];
const LABELS_LIST = [
  { key: "vegan", label: "Vegan", color: "bg-green-100 text-green-800" },
  { key: "vegetarisch", label: "Vegetarisch", color: "bg-lime-100 text-lime-800" },
  { key: "scharf", label: "Scharf", color: "bg-red-100 text-red-800" },
  { key: "bio", label: "Bio", color: "bg-emerald-100 text-emerald-800" },
  { key: "neu", label: "Neu", color: "bg-blue-100 text-blue-800" },
  { key: "bestseller", label: "Bestseller", color: "bg-yellow-100 text-yellow-800" },
  { key: "glutenfrei", label: "Glutenfrei", color: "bg-purple-100 text-purple-800" },
  { key: "laktosefrei", label: "Laktosefrei", color: "bg-pink-100 text-pink-800" },
  { key: "alkohol", label: "Alkohol", color: "bg-orange-100 text-orange-800" },
];
const ITEM_TYPES = [
  { value: "food", label: "Speise" }, { value: "beverage", label: "Getränk" },
  { value: "dessert", label: "Dessert" }, { value: "set_menu", label: "Menü-Set" },
  { value: "other", label: "Sonstiges" },
];
const KITCHEN_STATIONS = ["Küche", "Bar", "Grill", "Patisserie", "Sushi", "Pizza", "Wok", "Kalt"];

// ─── Produkt-Dialog ───────────────────────────────────────────────────────────
function ProductDialog({ open, onClose, initial, categoryId }: { open: boolean; onClose: () => void; initial?: any; categoryId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("basis");
  // Basis
  const [name, setName]               = useState(initial?.name ?? "");
  const [price, setPrice]             = useState(initial?.price ?? "");
  const [costPrice, setCostPrice]     = useState(initial?.costPrice ?? "");
  const [priceType, setPriceType]     = useState<"fixed"|"variable"|"from">(initial?.priceType ?? "fixed");
  const [itemType, setItemType]       = useState(initial?.itemType ?? "food");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [shortDesc, setShortDesc]     = useState(initial?.shortDescription ?? "");
  const [courseNumber, setCourseNumber] = useState(initial?.courseNumber ?? 1);
  const [isActive, setIsActive]       = useState(initial?.isActive ?? true);
  const [availabilityType, setAvailType] = useState<"always"|"scheduled"|"manual">(initial?.availabilityType ?? "always");
  // Bild
  const [imageUrl, setImageUrl]       = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading]     = useState(false);
  // Küche
  const [kitchenStation, setKitchen]  = useState(initial?.kitchenStation ?? "");
  const [prepTime, setPrepTime]       = useState(initial?.preparationTime ? String(initial.preparationTime) : "");
  const [kdsNote, setKdsNote]         = useState(initial?.kdsNote ?? "");
  const [allergens, setAllergens]     = useState<string[]>(initial?.allergens ? (typeof initial.allergens === "string" ? JSON.parse(initial.allergens) : initial.allergens) : []);
  // Labels
  const [labels, setLabels]           = useState<string[]>(initial?.labels ? (typeof initial.labels === "string" ? JSON.parse(initial.labels) : initial.labels) : []);
  // Extras (Modifier-Gruppen)
  const { data: modGroupsData = [] }  = trpc.menu.listModifierGroups.useQuery({} as any);
  const modGroups = modGroupsData as any[];
  const [selModIds, setSelModIds]     = useState<number[]>(initial?.modifierLinks?.map((l: any) => l.modifierGroupId) ?? []);
  // Steuerklasse
  const { data: taxClassesData = [] }  = trpc.menu.listTaxClasses.useQuery();
  const taxClasses = taxClassesData as any[];
  const defaultTaxClass = taxClasses.find((tc: any) => tc.isDefault);
  const [taxClassId, setTaxClassId]   = useState<number | null>(initial?.taxClassId ?? null);
  // Nährwerte
  const [nutritionPer, setNutritionPer] = useState<"100g"|"portion">(initial?.nutritionPer ?? "100g");
  const [calories, setCalories]       = useState(initial?.calories ?? "");
  const [protein, setProtein]         = useState(initial?.protein ?? "");
  const [fat, setFat]                 = useState(initial?.fat ?? "");
  const [saturatedFat, setSatFat]     = useState(initial?.saturatedFat ?? "");
  const [carbs, setCarbs]             = useState(initial?.carbs ?? "");
  const [sugar, setSugar]             = useState(initial?.sugar ?? "");
  const [fiber, setFiber]             = useState(initial?.fiber ?? "");
  const [salt, setSalt]               = useState(initial?.salt ?? "");
  // Lager
  const { data: recipeData }          = trpc.inventory.getRecipeForMenuItem.useQuery(
    { menuItemId: initial?.id ?? -1 },
    { enabled: !!initial?.id }
  );
  const recipe = (recipeData as any[]) ?? [];

  // State bei jedem Öffnen zurücksetzen (verhindert alte Daten bei Wechsel zwischen Produkten)
  useEffect(() => {
    if (open) {
      setTab("basis");
      setName(initial?.name ?? "");
      setPrice(initial?.price ?? "");
      setCostPrice(initial?.costPrice ?? "");
      setPriceType(initial?.priceType ?? "fixed");
      setItemType(initial?.itemType ?? "food");
      setDescription(initial?.description ?? "");
      setShortDesc(initial?.shortDescription ?? "");
      setCourseNumber(initial?.courseNumber ?? 1);
      setIsActive(initial?.isActive ?? true);
      setAvailType(initial?.availabilityType ?? "always");
      setImageUrl(initial?.imageUrl ?? "");
      setKitchen(initial?.kitchenStation ?? "");
      setPrepTime(initial?.preparationTime ? String(initial.preparationTime) : "");
      setKdsNote(initial?.kdsNote ?? "");
      setAllergens(initial?.allergens ? (typeof initial.allergens === "string" ? JSON.parse(initial.allergens) : initial.allergens) : []);
      setLabels(initial?.labels ? (typeof initial.labels === "string" ? JSON.parse(initial.labels) : initial.labels) : []);
      setSelModIds(initial?.modifierLinks?.map((l: any) => l.modifierGroupId) ?? []);
      setTaxClassId(initial?.taxClassId ?? null);
      setNutritionPer(initial?.nutritionPer ?? "100g");
      setCalories(initial?.calories ?? "");
      setProtein(initial?.protein ?? "");
      setFat(initial?.fat ?? "");
      setSatFat(initial?.saturatedFat ?? "");
      setCarbs(initial?.carbs ?? "");
      setSugar(initial?.sugar ?? "");
      setFiber(initial?.fiber ?? "");
      setSalt(initial?.salt ?? "");
    }
  }, [open, initial?.id]);

  const save = trpc.menu.upsertItem.useMutation({
    onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Gespeichert"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) return toast.error("Max. 5 MB");
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("image", file);
      const res = await fetch("/api/menu/upload-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload fehlgeschlagen");
      setImageUrl(json.url); toast.success("Bild hochgeladen");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  function handleSave() {
    if (!name.trim()) return toast.error("Name erforderlich");
    if (!price || isNaN(parseFloat(price))) return toast.error("Gültiger Preis erforderlich");
    save.mutate({
      id: initial?.id,
      name: name.trim(), description: description || undefined, shortDescription: shortDesc || undefined,
      price: parseFloat(price).toFixed(2), costPrice: costPrice ? parseFloat(costPrice).toFixed(2) : undefined,
      priceType, categoryId, itemType: itemType as any,
      courseNumber, kitchenStation: kitchenStation || undefined,
      kdsNote: kdsNote || undefined, preparationTime: prepTime ? Number(prepTime) : undefined,
      allergens: allergens, labels: labels,
      isActive, availabilityType,
      modifierGroupIds: selModIds,
      imageUrl: imageUrl || undefined,
      nutritionPer, calories: calories || undefined, protein: protein || undefined,
      fat: fat || undefined, saturatedFat: saturatedFat || undefined,
      carbs: carbs || undefined, sugar: sugar || undefined,
      fiber: fiber || undefined, salt: salt || undefined,
      taxClassId: taxClassId ?? undefined,
    } as any);
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="basis">Basis</TabsTrigger>
            <TabsTrigger value="bild">Bild</TabsTrigger>
            <TabsTrigger value="kueche">Küche</TabsTrigger>
            <TabsTrigger value="extras">Extras</TabsTrigger>
            <TabsTrigger value="naehr">Nährwerte</TabsTrigger>
            <TabsTrigger value="lager">Lager</TabsTrigger>
          </TabsList>

          {/* ── Basis ── */}
          <TabsContent value="basis" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Name *</Label>
                <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Margherita" autoFocus /></div>
              <div><Label>Preis (CHF) *</Label>
                <Input className="mt-1" type="number" step="0.05" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
              <div><Label>Einkaufspreis (CHF)</Label>
                <Input className="mt-1" type="number" step="0.05" min="0" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0.00" /></div>
              <div><Label>Preistyp</Label>
                <Select value={priceType} onValueChange={(v: any) => setPriceType(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixpreis</SelectItem>
                    <SelectItem value="variable">Durch Variante</SelectItem>
                    <SelectItem value="from">Ab-Preis</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label>Typ</Label>
                <Select value={itemType} onValueChange={setItemType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ITEM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Gang</Label>
                <Select value={String(courseNumber)} onValueChange={v => setCourseNumber(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>Gang {n}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Verfügbarkeit</Label>
                <Select value={availabilityType} onValueChange={(v: any) => setAvailType(v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Immer</SelectItem>
                    <SelectItem value="scheduled">Zeitgesteuert</SelectItem>
                    <SelectItem value="manual">Manuell</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="col-span-2"><Label>Beschreibung (für Gäste)</Label>
                <Textarea className="mt-1" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Kurze Beschreibung..." /></div>
              <div className="col-span-2"><Label>Kurzbezeichnung (für Bon/KDS)</Label>
                <Input className="mt-1" value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="z.B. Margherita" maxLength={50} /></div>
              <div>
                <Label>Steuerklasse (MwSt.)</Label>
                <Select
                  value={taxClassId ? String(taxClassId) : "__default__"}
                  onValueChange={v => setTaxClassId(v === "__default__" ? null : Number(v))}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Standard" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      Standard{defaultTaxClass ? ` (${defaultTaxClass.name} ${parseFloat(defaultTaxClass.rate).toFixed(2)}%)` : " (8.10%"}
                    </SelectItem>
                    {taxClasses.map((tc: any) => (
                      <SelectItem key={tc.id} value={String(tc.id)}>
                        {tc.name} – {parseFloat(tc.rate).toFixed(2)}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Schweizer MwSt.: 8.1% vor Ort, 2.6% Take-away Speisen</p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Artikel aktiv</Label></div>
            </div>
          </TabsContent>

          {/* ── Bild ── */}
          <TabsContent value="bild" className="space-y-3 mt-4">
            {imageUrl ? (
              <div className="relative group w-full">
                <img src={imageUrl} alt="" className="w-full h-48 object-cover rounded-lg border" />
                <button type="button" onClick={() => setImageUrl("")} className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="w-full h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Bild hier ablegen oder klicken</p>
                <p className="text-xs text-muted-foreground">JPEG, PNG, WebP – max. 5 MB</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="w-4 h-4 mr-2" />{uploading ? "Wird hochgeladen..." : imageUrl ? "Anderes Bild wählen" : "Bild hochladen"}
              </Button>
              {imageUrl && <Button type="button" variant="outline" onClick={() => setImageUrl("")}><X className="w-4 h-4 mr-2" />Entfernen</Button>}
            </div>
            <div><Label>Oder Bild-URL eingeben</Label>
              <Input className="mt-1" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." /></div>
          </TabsContent>

          {/* ── Küche & Allergene ── */}
          <TabsContent value="kueche" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Küchenstation</Label>
                <Select value={kitchenStation || "none"} onValueChange={v => setKitchen(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Station wählen..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Keine —</SelectItem>
                    {KITCHEN_STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Zubereitungszeit (Min.)</Label>
                <Input className="mt-1" type="number" min="0" max="120" value={prepTime} onChange={e => setPrepTime(e.target.value)} placeholder="z.B. 15" /></div>
              <div className="col-span-2"><Label>KDS-Hinweis</Label>
                <Textarea className="mt-1" rows={2} value={kdsNote} onChange={e => setKdsNote(e.target.value)} placeholder="z.B. Immer frisch zubereiten" /></div>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Allergene (14 EU-Pflichtallergene)</Label>
              <p className="text-xs text-muted-foreground mb-2">Aktive Allergene werden auf der Speisekarte angezeigt</p>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map(a => (
                  <button key={a.key} type="button" onClick={() => setAllergens(prev => prev.includes(a.key) ? prev.filter(x => x !== a.key) : [...prev, a.key])}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all",
                      allergens.includes(a.key) ? "bg-orange-100 text-orange-800 border-orange-300" : "bg-muted text-muted-foreground border-transparent hover:border-orange-200")}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-sm font-semibold">Labels &amp; Kennzeichnungen</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {LABELS_LIST.map(l => (
                  <button key={l.key} type="button" onClick={() => setLabels(prev => prev.includes(l.key) ? prev.filter(x => x !== l.key) : [...prev, l.key])}
                    className={cn("px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all",
                      labels.includes(l.key) ? l.color + " border-current" : "bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/30")}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Extras / Modifier ── */}
          <TabsContent value="extras" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">Modifier-Gruppen für diesen Artikel (z.B. Beilagen, Saucen, Extras).</p>
            {modGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Noch keine Modifier-Gruppen. Erstelle diese zuerst unter Speisekarte → Modifier.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {modGroups.map((g: any) => (
                  <div key={g.id} onClick={() => setSelModIds(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])}
                    className={cn("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                      selModIds.includes(g.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                    <div>
                      <p className="font-medium text-sm">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.selectionType === "single" ? "Einzelauswahl" : g.selectionType === "multiple" ? "Mehrfachauswahl" : "Mengenauswahl"}
                        {g.isRequired ? " · Pflicht" : " · Optional"} · {g.modifiers?.length ?? 0} Optionen
                      </p>
                    </div>
                    {selModIds.includes(g.id) && <Check className="w-4 h-4 text-primary" />}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Nährwerte ── */}
          <TabsContent value="naehr" className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
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
              <div><Label className="text-xs">Energie (kcal)</Label><Input className="mt-1" type="number" min="0" value={calories} onChange={e => setCalories(e.target.value)} placeholder="z.B. 250" /></div>
              <div><Label className="text-xs">Eiweiß (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={protein} onChange={e => setProtein(e.target.value)} placeholder="z.B. 12.5" /></div>
              <div><Label className="text-xs">Fett (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={fat} onChange={e => setFat(e.target.value)} placeholder="z.B. 8.0" /></div>
              <div><Label className="text-xs">davon gesättigte Fettsäuren (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={saturatedFat} onChange={e => setSatFat(e.target.value)} placeholder="z.B. 3.0" /></div>
              <div><Label className="text-xs">Kohlenhydrate (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={carbs} onChange={e => setCarbs(e.target.value)} placeholder="z.B. 30.0" /></div>
              <div><Label className="text-xs">davon Zucker (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={sugar} onChange={e => setSugar(e.target.value)} placeholder="z.B. 5.0" /></div>
              <div><Label className="text-xs">Ballaststoffe (g)</Label><Input className="mt-1" type="number" min="0" step="0.1" value={fiber} onChange={e => setFiber(e.target.value)} placeholder="z.B. 2.5" /></div>
              <div><Label className="text-xs">Salz (g)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={salt} onChange={e => setSalt(e.target.value)} placeholder="z.B. 0.8" /></div>
            </div>
          </TabsContent>

          {/* ── Lagerwirtschaft ── */}
          <TabsContent value="lager" className="space-y-3 mt-4">
            {!initial?.id ? (
              <div className="text-center py-8 text-muted-foreground">
                <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Speichere das Produkt zuerst, um Lager-Verknüpfungen zu verwalten.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Rezeptur-Zutaten</p>
                  <p className="text-xs text-muted-foreground">Beim Verkauf wird der Lagerbestand automatisch reduziert</p>
                </div>
                {recipe.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Package className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">Noch keine Zutaten verknüpft.</p>
                    <p className="text-xs mt-0.5">Gehe zu <strong>Lager → Rezepturen</strong> um Zutaten zuzuweisen.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipe.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                        <span className="font-medium">{r.inventoryItemName ?? r.inventoryItemId}</span>
                        <Badge variant="secondary">{r.quantity} {r.unit}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground pt-1">
                  Zutaten können unter <strong>Lager → Rezepturen</strong> detailliert bearbeitet werden.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Speichern..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function MenuBuilder() {
  const utils = trpc.useUtils();
  // staleTime: Infinity verhindert automatische Background-Refetches (z.B. beim Tab-Wechsel).
  // Dadurch wird der lokale Sortier-State nie unerwartet überschrieben.
  // Manuelle Invalidierungen (nach Hinzufügen/Löschen) funktionieren weiterhin.
  const { data: topCatsData   = [] } = trpc.menu.listTopCategories.useQuery(undefined, { staleTime: Infinity });
  const { data: allSubCatsData = [] } = trpc.menu.listCategories.useQuery({} as any, { staleTime: Infinity });
  const { data: allItemsData   = [] } = trpc.menu.listItems.useQuery({}, { staleTime: Infinity });

  // Lokale Sortier-States – werden via useEffect mit Server-Daten synchronisiert
  // Reorder setzt den State direkt (optimistisch) ohne invalidate, daher kein Snap-Back.
  // Server-Daten werden nur beim ersten Laden und nach Fehlern übernommen.
  const [topCats,    setTopCats]    = useState<any[]>([]);
  const [allSubCats, setAllSubCats] = useState<any[]>([]);
  const [allItems,   setAllItems]   = useState<any[]>([]);

  // Sync: Server-Daten → lokaler State.
  // Mit staleTime:Infinity wird dieser useEffect nur beim initialen Laden und nach
  // manuellen invalidate()-Aufrufen (Hinzufügen/Löschen) ausgeführt.
  // Drag & Drop setzt den State direkt (optimistisch) und ruft kein invalidate() auf.
  useEffect(() => { setTopCats(topCatsData as any[]); }, [topCatsData]);
  useEffect(() => { setAllSubCats(allSubCatsData as any[]); }, [allSubCatsData]);
  useEffect(() => { setAllItems(allItemsData as any[]); }, [allItemsData]);

  // Effektive Daten = immer der lokale State
  const effectiveTopCats    = topCats;
  const effectiveAllSubCats = allSubCats;
  const effectiveAllItems   = allItems;

  // Auswahl-State
  const [selTopId, setSelTopId] = useState<number | null>(null);
  const [selSubId, setSelSubId] = useState<number | null>(null);

  // Dialoge
  const [topDlg,  setTopDlg]  = useState<{ open: boolean; item?: any }>({ open: false });
  const [subDlg,  setSubDlg]  = useState<{ open: boolean; item?: any }>({ open: false });
  const [prodDlg, setProdDlg] = useState<{ open: boolean; item?: any }>({ open: false });
  const [importDlg, setImportDlg] = useState(false);

  // Delete-Mutations
  const delTop  = trpc.menu.deleteTopCategory.useMutation({ onSuccess: () => { utils.menu.listTopCategories.invalidate(); toast.success("Gelöscht"); setSelTopId(null); setSelSubId(null); }, onError: e => toast.error(e.message) });
  const delSub  = trpc.menu.deleteCategory.useMutation({ onSuccess: () => { utils.menu.listCategories.invalidate(); toast.success("Gelöscht"); setSelSubId(null); }, onError: e => toast.error(e.message) });
  const delItem = trpc.menu.deleteItem.useMutation({ onSuccess: () => { utils.menu.listItems.invalidate(); toast.success("Gelöscht"); }, onError: e => toast.error(e.message) });

  // Reorder-Mutations: Optimistisches Update ohne Snap-Back
  // Strategie: Lokalen State sofort setzen + React Query Cache direkt aktualisieren (setData).
  // Kein invalidate() = kein Server-Refetch = kein Zurückspringen.
  // Der Cache wird mit der neuen Reihenfolge befüllt, damit spätere Refetches konsistent sind.
  const reorderTop  = trpc.menu.reorderTopCategories.useMutation({
    onError: (e) => { toast.error(e.message); utils.menu.listTopCategories.invalidate(); },
  });
  const reorderSub  = trpc.menu.reorderCategories.useMutation({
    onError: (e) => { toast.error(e.message); utils.menu.listCategories.invalidate(); },
  });
  const reorderItem = trpc.menu.reorderItems.useMutation({
    onError: (e) => { toast.error(e.message); utils.menu.listItems.invalidate(); },
  });

  // DnD Sensors
  // Desktop: 5px Bewegung aktiviert Drag
  // Mobile/Touch: 500ms Long-Press aktiviert Drag (wie iPhone App-Verschieben)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 800ms Long-Press: genug Zeit um zu scrollen, aber klar genug als Drag-Geste
    // tolerance: 10px erlaubt leichtes Zittern der Hand während des Haltens
    useSensor(TouchSensor, { activationConstraint: { delay: 1500, tolerance: 10 } })
  );

  // Drag-State für visuelles Feedback
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
    // Haptisches Feedback auf Mobile (falls verfügbar)
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);
  const handleDragEnd = useCallback(() => setActiveDragId(null), []);

  // Gefilterte Daten
  const subCats = effectiveAllSubCats.filter((c: any) => c.topCategoryId === selTopId);
  const items   = effectiveAllItems.filter((i: any) => i.categoryId === selSubId);

  const selTop = effectiveTopCats.find((t: any) => t.id === selTopId);
  const selSub = effectiveAllSubCats.find((s: any) => s.id === selSubId);

  // ── DnD Handlers ──────────────────────────────────────────────────────────
  const handleTopCatDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = effectiveTopCats.findIndex((t: any) => t.id === active.id);
    const newIndex = effectiveTopCats.findIndex((t: any) => t.id === over.id);
    const newOrder = arrayMove(effectiveTopCats, oldIndex, newIndex);
    setTopCats(newOrder);
    reorderTop.mutate(newOrder.map((t: any, idx: number) => ({ id: t.id, sortOrder: idx })));
  }, [effectiveTopCats, reorderTop]);

  const handleSubCatDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subCats.findIndex((c: any) => c.id === active.id);
    const newIndex = subCats.findIndex((c: any) => c.id === over.id);
    const newSubOrder = arrayMove(subCats, oldIndex, newIndex);
    // Wichtig: Array-Reihenfolge in allSubCats direkt ändern (nicht nur sortOrder-Feld).
    // Die gefilterten subCats werden durch .filter() aus allSubCats abgeleitet,
    // daher muss die Reihenfolge im Gesamt-Array stimmen.
    // Alle Elemente dieser Oberkategorie durch die neu sortierte Reihenfolge ersetzen.
    const withoutCurrent = effectiveAllSubCats.filter((c: any) => c.topCategoryId !== selTopId);
    const updated = [...withoutCurrent, ...newSubOrder];
    setAllSubCats(updated);
    reorderSub.mutate(newSubOrder.map((c: any, idx: number) => ({ id: c.id, sortOrder: idx })));
  }, [subCats, effectiveAllSubCats, selTopId, reorderSub]);

  const handleItemDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i: any) => i.id === active.id);
    const newIndex = items.findIndex((i: any) => i.id === over.id);
    const newItemOrder = arrayMove(items, oldIndex, newIndex);
    // Wichtig: Array-Reihenfolge in allItems direkt ändern.
    const withoutCurrent = effectiveAllItems.filter((i: any) => i.categoryId !== selSubId);
    const updated = [...withoutCurrent, ...newItemOrder];
    setAllItems(updated);
    reorderItem.mutate(newItemOrder.map((i: any, idx: number) => ({ id: i.id, sortOrder: idx })));
  }, [items, effectiveAllItems, selSubId, reorderItem]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* ══ ZONE 1: Oberkategorien – linke Spalte ══════════════════════════ */}
      <aside className="w-[72px] shrink-0 flex flex-col border-r bg-muted/10 overflow-y-auto">
        <div className="px-1 py-2 border-b text-center">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Kat.</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={(e) => { handleTopCatDragEnd(e); handleDragEnd(); }}>
          <SortableContext items={effectiveTopCats.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
            {effectiveTopCats.map((tc: any) => {
              const Icon = resolveIcon(tc.icon);
              const active = selTopId === tc.id;
              return (
                <SortableTopCat key={tc.id} id={tc.id}>
                  {({ dragHandleProps, setHandleRef, isDragging }) => (
                    <div className="relative group">
                      <button
                        onClick={(e) => { if (!isDragging) { setSelTopId(tc.id); setSelSubId(null); } }}
                        className={cn(
                          "w-full flex flex-col items-center gap-1 py-3 px-1 transition-colors select-none",
                          "border-b border-l-[3px]",
                          isDragging ? "bg-primary/20 border-l-primary" : active ? "bg-primary/10 border-l-primary" : "hover:bg-muted/40 border-l-transparent"
                        )}
                      >
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: (tc.color ?? "#6366F1") + "22" }}>
                          <Icon className="w-5 h-5" style={{ color: tc.color ?? "#6366F1" } as React.CSSProperties} />
                        </div>
                        <span className={cn("text-[9px] leading-tight text-center line-clamp-2 w-full px-0.5",
                          active ? "font-bold text-primary" : "text-muted-foreground")}>
                          {tc.name}
                        </span>
                      </button>
                      {/* Hover-Aktionen */}
                      <div className="absolute top-0.5 right-0.5 flex flex-col gap-0.5 z-10">
                        {/* Drag Handle – immer sichtbar, touchAction:none nur hier */}
                        <div
                          ref={setHandleRef}
                          {...dragHandleProps}
                          className="p-0.5 rounded bg-background/90 border shadow cursor-grab active:cursor-grabbing hover:bg-muted"
                          style={{ touchAction: 'none' }}
                        >
                          <GripVertical className="w-2.5 h-2.5 text-muted-foreground" />
                        </div>
                        <button onClick={e => { e.stopPropagation(); setTopDlg({ open: true, item: tc }); }}
                          className="p-0.5 rounded bg-background/90 border shadow hover:bg-muted">
                          <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); if (confirm(`"${tc.name}" löschen?`)) delTop.mutate({ id: tc.id }); }}
                          className="p-0.5 rounded bg-background/90 border shadow hover:bg-destructive/10">
                          <Trash2 className="w-2.5 h-2.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  )}
                </SortableTopCat>
              );
            })}
          </SortableContext>
        </DndContext>

        {/* + Neue Oberkategorie */}
        <button
          onClick={() => setTopDlg({ open: true, item: null })}
          className="w-full flex flex-col items-center gap-1 py-3 px-1 hover:bg-muted/40 transition-colors border-b border-dashed text-muted-foreground hover:text-primary"
          title="Neue Oberkategorie"
        >
          <div className="w-9 h-9 rounded-xl border-2 border-dashed border-current flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-[9px] leading-tight text-center">Neu</span>
        </button>
      </aside>

      {/* ══ RECHTS: Unterkategorien + Artikel ══════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ══ ZONE 2: Unterkategorien – horizontale Leiste oben ══════════ */}
        <div className="shrink-0 border-b bg-muted/5 min-h-[52px]">
          <div className="flex items-center gap-0 px-2 py-2">
            {/* Scrollbarer Chip-Bereich */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-none pr-1">
              {selTopId === null ? (
                <p className="text-sm text-muted-foreground italic px-1">Oberkategorie auswählen</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={(e) => { handleSubCatDragEnd(e); handleDragEnd(); }}>
                  <SortableContext items={subCats.map((c: any) => c.id)} strategy={horizontalListSortingStrategy}>
                    {subCats.map((sc: any) => (
                      <SortableSubCat key={sc.id} id={sc.id}>
                        {({ dragHandleProps, setHandleRef, isDragging }) => (
                          <div className="relative group shrink-0 flex items-center">
                            {/* Drag Handle links am Chip – immer sichtbar, touchAction:none nur hier */}
                            <div
                              ref={setHandleRef}
                              {...dragHandleProps}
                              className="absolute -left-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-background/90 border shadow cursor-grab active:cursor-grabbing z-10"
                              style={{ touchAction: 'none' }}
                            >
                              <GripHorizontal className="w-2.5 h-2.5 text-muted-foreground" />
                            </div>
                            <button
                              onClick={() => { if (!isDragging) setSelSubId(sc.id); }}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all select-none",
                                isDragging ? "shadow-lg ring-2 ring-primary/40" : "",
                                selSubId === sc.id ? "text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              )}
                              style={selSubId === sc.id ? { backgroundColor: sc.color ?? "#6366F1" } : {}}
                            >
                              {sc.name}
                            </button>
                            {/* Edit/Delete – immer sichtbar (kein Hover auf Mobile) */}
                            <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
                              <button onClick={e => { e.stopPropagation(); setSubDlg({ open: true, item: sc }); }}
                                className="p-0.5 rounded-full bg-background border shadow hover:bg-muted">
                                <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); if (confirm(`"${sc.name}" löschen?`)) delSub.mutate({ id: sc.id }); }}
                                className="p-0.5 rounded-full bg-background border shadow hover:bg-destructive/10">
                                <Trash2 className="w-2.5 h-2.5 text-destructive" />
                              </button>
                            </div>
                          </div>
                        )}
                      </SortableSubCat>
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
            {/* + Neue Unterkategorie – immer sichtbar, rechts fixiert */}
            {selTopId !== null && (
              <button
                onClick={() => setSubDlg({ open: true, item: null })}
                className="shrink-0 ml-2 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                title="Neue Unterkategorie"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ══ ZONE 3: Artikel-Grid – Mitte ═══════════════════════════════ */}
        <div className="flex-1 overflow-y-auto">
          {/* KI-Import-Button im Header */}
          <div className="flex justify-end px-4 pt-3 pb-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/5 h-7"
              onClick={() => setImportDlg(true)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              KI-Import
            </Button>
          </div>
          <div className="p-4">

          {/* Leerer Zustand: keine Oberkategorie */}
          {selTopId === null && (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <UtensilsCrossed className="w-8 h-8 opacity-30" />
              </div>
              <div>
                <p className="font-semibold text-base text-foreground">Speisekarte aufbauen</p>
                <p className="text-sm mt-1">Klicke links auf <strong>"Neu"</strong> um die erste Oberkategorie zu erstellen<br />(z.B. Essen, Drinks, Weine)</p>
              </div>
              <Button variant="outline" onClick={() => setTopDlg({ open: true, item: null })}>
                <Plus className="w-4 h-4 mr-2" /> Erste Oberkategorie erstellen
              </Button>
            </div>
          )}

          {/* Leerer Zustand: Oberkategorie gewählt, keine Unterkategorie */}
          {selTopId !== null && selSubId === null && (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <Tag className="w-8 h-8 opacity-30" />
              </div>
              <div>
                <p className="font-semibold text-base text-foreground">
                  {subCats.length === 0
                    ? `Erste Unterkategorie für "${selTop?.name}" erstellen`
                    : "Unterkategorie auswählen"}
                </p>
                <p className="text-sm mt-1">
                  {subCats.length === 0
                    ? "Klicke oben auf '+ Unterkategorie' (z.B. Pizza, Salat)"
                    : "Klicke oben auf einen Chip um die Produkte zu sehen"}
                </p>
              </div>
              {subCats.length === 0 && (
                <Button variant="outline" onClick={() => setSubDlg({ open: true, item: null })}>
                  <Plus className="w-4 h-4 mr-2" /> Erste Unterkategorie erstellen
                </Button>
              )}
            </div>
          )}

          {/* Artikel-Grid */}
          {selTopId !== null && selSubId !== null && (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selTop?.name}</span>
                <span>›</span>
                <span className="font-medium px-2 py-0.5 rounded-full text-white text-xs"
                  style={{ backgroundColor: selSub?.color ?? "#6366F1" }}>
                  {selSub?.name}
                </span>
                <span>· {items.length} Produkte</span>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={(e) => { handleItemDragEnd(e); handleDragEnd(); }}>
                <SortableContext items={items.map((i: any) => i.id)} strategy={rectSortingStrategy}>
                  {/* 3 Spalten fix, 6 Reihen = 18 Felder sichtbar, dann scrollbar */}
                  {/* touch-action:none während Drag verhindert Browser-Scroll-Konflikt */}
                  <div className="grid grid-cols-3 gap-2">
                    {items.map((item: any) => (
                      <SortableItem key={item.id} id={item.id}>
                        {({ dragHandleProps, setHandleRef, isDragging }) => (
                          <div
                            className={cn(
                              "relative group rounded-xl border bg-card transition-all cursor-pointer select-none",
                              isDragging ? "shadow-2xl ring-2 ring-primary/40" : "hover:shadow-md"
                            )}
                            onClick={() => { if (!isDragging) setProdDlg({ open: true, item }); }}>
                            {/* Bild-Container mit overflow-hidden nur fürs Bild */}
                            <div className="w-full aspect-square overflow-hidden rounded-t-xl">
                              {item.imageUrl
                                ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full bg-muted flex items-center justify-center">
                                    <Utensils className="w-6 h-6 text-muted-foreground/20" />
                                  </div>}
                            </div>
                            <div className="p-1.5">
                              <p className="font-semibold text-xs leading-tight line-clamp-2">{item.name}</p>
                              <p className="font-bold text-primary text-xs mt-0.5">CHF {parseFloat(item.price || "0").toFixed(2)}</p>
                            </div>
                            {/* Drag Handle – oben links, immer sichtbar, touchAction:none nur hier */}
                            <div
                              ref={setHandleRef}
                              {...dragHandleProps}
                              className="absolute top-1 left-1 p-1 rounded-lg bg-background/90 border shadow cursor-grab active:cursor-grabbing"
                              style={{ touchAction: 'none' }}
                              onClick={e => e.stopPropagation()}
                            >
                              <GripVertical className="w-3 h-3 text-muted-foreground" />
                            </div>
                            {/* Edit/Delete Buttons – immer sichtbar (kein Hover auf Mobile) */}
                            <div className="absolute top-1 right-1 flex flex-col gap-1">
                              <button onClick={e => { e.stopPropagation(); setProdDlg({ open: true, item }); }}
                                className="p-1 rounded-lg bg-background/90 border shadow hover:bg-muted">
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); if (confirm(`"${item.name}" löschen?`)) delItem.mutate({ id: item.id }); }}
                                className="p-1 rounded-lg bg-background/90 border shadow hover:bg-destructive/10">
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </button>
                            </div>
                            {!item.isAvailable && (
                              <div className="absolute top-1 left-8 bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Inaktiv
                              </div>
                            )}
                          </div>
                        )}
                      </SortableItem>
                    ))}

                    {/* + Neues Produkt – immer sichtbar im Grid */}
                    <button
                      onClick={() => setProdDlg({ open: true, item: null })}
                      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 aspect-square text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                    >
                      <div className="w-8 h-8 rounded-xl border-2 border-dashed border-current flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-medium text-center leading-tight px-1">Produkt<br/>hinzufügen</span>
                    </button>

                    {/* Leere Platzhalter-Felder um 18er-Grid aufzufüllen */}
                    {Array.from({ length: Math.max(0, 17 - items.length) }).map((_, i) => (
                      <div key={`empty-${i}`}
                        className="rounded-xl border border-dashed border-muted/40 aspect-square bg-muted/10" />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
          </div>
        </div>
      </div>

      {/* ══ Dialoge ════════════════════════════════════════════════════════ */}
      <MenuImportDialog
        open={importDlg}
        onClose={() => setImportDlg(false)}
        onImported={() => {
          utils.menu.listTopCategories.invalidate();
          utils.menu.listCategories.invalidate();
          utils.menu.listItems.invalidate();
          setTopCats([]);
          setAllSubCats([]);
          setAllItems([]);
        }}
      />
      <TopCatDialog
        open={topDlg.open}
        initial={topDlg.item}
        onClose={() => { setTopDlg({ open: false }); utils.menu.listTopCategories.invalidate().then(() => setTopCats([])); }}
      />

      {selTopId !== null && (
        <SubCatDialog
          open={subDlg.open}
          initial={subDlg.item}
          topCategoryId={selTopId}
          onClose={() => { setSubDlg({ open: false }); utils.menu.listCategories.invalidate().then(() => setAllSubCats([])); }}
        />
      )}

      {selSubId !== null && (
        <ProductDialog
          open={prodDlg.open}
          initial={prodDlg.item}
          categoryId={selSubId}
          onClose={() => { setProdDlg({ open: false }); utils.menu.listItems.invalidate().then(() => setAllItems([])); }}
        />
      )}
    </div>
  );
}
