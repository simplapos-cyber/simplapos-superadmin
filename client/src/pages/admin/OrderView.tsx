import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useSSE } from "@/hooks/useSSE";
import { SSEStatusBadge } from "@/components/SSEStatusBadge";
import { SharedFloorPlan, type SharedTableEntry, type SharedPlanGroup } from "@/components/SharedFloorPlan";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ShoppingCart, ChevronLeft, Plus, Minus, Trash2, Send,
  CreditCard, Banknote, Smartphone, Search, ChefHat,
  UtensilsCrossed, Users, Receipt, Loader2, Utensils,
  Wine, Package, AlertTriangle, Star, Clock, StickyNote,
  Hash, Edit3, CheckCircle2, Scissors, XCircle, Ban, Wallet,
  ArrowLeftRight, Merge, GlassWater, Coffee, ShoppingBag, Layers, Tag, BookOpen, Flame, Leaf,
  ZoomIn, ZoomOut, Maximize2, Pencil, Gift, ScanLine,
  FileText, User, Mail, MapPin, CalendarDays, Info, BookUser,
  Mic, MicOff, Volume2, Filter, X, RotateCcw,
} from "lucide-react";
import { VoucherScanner } from "@/components/VoucherScanner";
import { VoiceOrderConfirmDialog } from "@/components/VoiceOrderConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SignaturePad, type SignatureData } from "@/components/SignaturePad";
import { SwipeableItem } from "@/components/SwipeableItem";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { addItemToPendingOrder } from "@/lib/offlineQueue";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanTable = {
  id: number;
  sourceType: "floor_plan" | "legacy";
  floorPlanId: number | null;
  planName: string;
  label: string;
  seats: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  objType: string;
  currentOrder: {
    id: number;
    status: string;
    totalAmount: string | null;
    guestCount: number | null;
  } | null;
};

type DevicePosition = {
  objectId: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  hidden: boolean;
};

type PlanGroup = {
  planId: number;
  planName: string;
  canvasWidth: number;
  canvasHeight: number;
  floorStyle: string;
  phoneLayout: { canvasWidth: number; canvasHeight: number; positions: DevicePosition[] } | null;
  tables: PlanTable[];
};

type TopCategory = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
};

type MenuSetCourse = {
  id: number;
  menuSetId: number;
  name: string;
  courseNumber: number;
  minChoices: number;
  maxChoices: number;
  menuItemIds: unknown;
  sortOrder: number;
  items: MenuItem[];
};

type MenuSet = {
  id: number;
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
  availabilityType: string;
  sortOrder: number;
  isActive: boolean;
  courses: MenuSetCourse[];
};

type MenuCategory = {
  id: number;
  name: string;
  color: string | null;
  topCategoryId: number | null;
};

type MenuItem = {
  id: number;
  name: string;
  price: string;
  categoryId: number | null;
  description: string | null;
  imageUrl: string | null;
  itemType: string;
  labels: unknown;
  modifierGroups: Array<{
    id: number;
    name: string;
    selectionType: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number | null;
    options: Array<{ id: number; name: string; priceAdjustment: string; isDefault: boolean }>;
  }>;
  variantGroups: Array<{
    id: number;
    name: string;
    isRequired: boolean;
    options: Array<{ id: number; name: string; priceAdjustment: string; isDefault: boolean }>;
  }>;
  allergens?: unknown; // string[] | null, gespeichert als JSON
};

type OrderItem = {
  id: number;
  productId?: number | null;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  notes: string | null;
  status: string;
  seatNumber?: number | null;
  course?: number | null;
  priority?: string | null;
  itemType?: string | null;
  selectedVariantName?: string | null;
  selectedModifiers?: Array<{ id?: number | null; name: string; priceAdjustment: number }> | null;
};

type OrderWithItems = {
  id: number;
  orderNumber: string | null;
  status: string;
  tableId: number | null;
  floorPlanObjectId?: number | null;
  subtotal: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  notes: string | null;
  guestCount?: number | null;
  type?: string | null;
  tableLabel?: string | null;
  taxBreakdown?: Array<{ rate: string; gross: string; base: string; amount: string }> | null;
  items: OrderItem[];
};

type SelectedModifier = { id: number; name: string; price: number };
type SelectedVariant = {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  priceAdjust: number;
};

type ItemConfig = {
  name: string;
  unitPrice: number;
  modifiers: SelectedModifier[];
  variant: SelectedVariant | null;
  notes: string;
  seatNumber: number | null;
  course: number;
  priority: "normal" | "rush" | "hold";
  itemType: "food" | "drink" | "other";
  quantity: number;
};

// ─── Status helpers ───────────────────────────────────────────────────────────
const TABLE_STATUS_COLORS: Record<string, string> = {
  free: "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100 active:scale-95",
  occupied: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 active:scale-95",
  preparing: "bg-blue-50 border-blue-300 text-blue-900 hover:bg-blue-100 active:scale-95",
  ready: "bg-purple-50 border-purple-300 text-purple-900 hover:bg-purple-100 active:scale-95",
};

function getTableStatus(table: PlanTable): string {
  if (!table.currentOrder) return "free";
  const s = table.currentOrder.status;
  if (s === "preparing") return "preparing";
  if (s === "ready") return "ready";
  return "occupied";
}

const PRIORITY_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  normal: { label: "Normal", color: "text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> },
  rush: { label: "Eilig", color: "text-red-600", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  hold: { label: "Halten", color: "text-amber-600", icon: <Star className="h-3.5 w-3.5" /> },
};

const ITEM_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  food: { label: "Speise", icon: <Utensils className="h-3.5 w-3.5" /> },
  drink: { label: "Getränk", icon: <Wine className="h-3.5 w-3.5" /> },
  other: { label: "Sonstiges", icon: <Package className="h-3.5 w-3.5" /> },
};

// ─── Item Configurator Sheet ──────────────────────────────────────────────────
function ItemConfigSheet({
  item,
  guestCount,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  guestCount: number;
  onAdd: (config: ItemConfig) => void;
  onClose: () => void;
}) {
  const basePrice = parseFloat(item.price);

  // Determine default itemType from menu item's itemType
  const defaultItemType = useMemo((): "food" | "drink" | "other" => {
    const t = item.itemType?.toLowerCase() ?? "";
    if (t === "beverage" || t === "drink") return "drink";
    if (t === "other") return "other";
    return "food";
  }, [item.itemType]);

  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null>(() => {
    for (const vg of (item.variantGroups ?? [])) {
      const def = vg.options.find(o => o.isDefault);
      if (def) return {
        groupId: vg.id, groupName: vg.name, optionId: def.id,
        optionName: def.name, priceAdjust: parseFloat(def.priceAdjustment),
      };
    }
    return null;
  });

  const [selectedModifiers, setSelectedModifiers] = useState<SelectedModifier[]>(() => {
    const defaults: SelectedModifier[] = [];
    for (const mg of (item.modifierGroups ?? [])) {
      for (const opt of mg.options) {
        if (opt.isDefault) defaults.push({ id: opt.id, name: opt.name, price: parseFloat(opt.priceAdjustment) });
      }
    }
    return defaults;
  });

  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [seatNumber, setSeatNumber] = useState<number | null>(null);
  const [course, setCourse] = useState(1);
  const [priority, setPriority] = useState<"normal" | "rush" | "hold">("normal");
  const [itemType, setItemType] = useState<"food" | "drink" | "other">(defaultItemType);

  const totalModifiers = selectedModifiers.reduce((s, m) => s + m.price, 0);
  const variantAdjust = selectedVariant?.priceAdjust ?? 0;
  const unitPrice = basePrice + totalModifiers + variantAdjust;
  const totalPrice = unitPrice * qty;

  function toggleModifier(mg: MenuItem["modifierGroups"][0], opt: MenuItem["modifierGroups"][0]["options"][0]) {
    const price = parseFloat(opt.priceAdjustment);
    const existing = selectedModifiers.find(m => m.id === opt.id);
    if (existing) {
      setSelectedModifiers(prev => prev.filter(m => m.id !== opt.id));
    } else {
      if (mg.selectionType === "single") {
        const groupOptIds = mg.options.map(o => o.id);
        setSelectedModifiers(prev => [
          ...prev.filter(m => !groupOptIds.includes(m.id)),
          { id: opt.id, name: opt.name, price },
        ]);
      } else {
        setSelectedModifiers(prev => [...prev, { id: opt.id, name: opt.name, price }]);
      }
    }
  }

  function handleAdd() {
    for (const vg of (item.variantGroups ?? [])) {
      if (vg.isRequired && (!selectedVariant || selectedVariant.groupId !== vg.id)) {
        toast.error(`Bitte wählen Sie: ${vg.name}`);
        return;
      }
    }
    for (const mg of (item.modifierGroups ?? [])) {
      if (mg.isRequired) {
        const count = selectedModifiers.filter(m => mg.options.some(o => o.id === m.id)).length;
        if (count < mg.minSelections) {
          toast.error(`Bitte wählen Sie mindestens ${mg.minSelections} Option(en) für: ${mg.name}`);
          return;
        }
      }
    }
    onAdd({
      name: item.name,
      unitPrice: basePrice,
      modifiers: selectedModifiers,
      variant: selectedVariant,
      notes,
      seatNumber,
      course,
      priority,
      itemType,
      quantity: qty,
    });
    onClose();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-muted/20">
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{item.name}</h3>
          <p className="text-sm text-muted-foreground">
            CHF {basePrice.toFixed(2)}
            {item.description && <span className="ml-2 text-xs opacity-70 truncate">{item.description}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold text-primary text-lg">CHF {totalPrice.toFixed(2)}</div>
          {qty > 1 && <div className="text-xs text-muted-foreground">×{qty} à {unitPrice.toFixed(2)}</div>}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">

          {/* ─── Variant Groups ─── */}
          {(item.variantGroups ?? []).map(vg => (
            <div key={vg.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{vg.name}</span>
                {vg.isRequired
                  ? <Badge variant="destructive" className="text-xs px-1.5 py-0">Pflicht</Badge>
                  : <span className="text-xs text-muted-foreground">Optional</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {vg.options.map(opt => {
                  const adj = parseFloat(opt.priceAdjustment);
                  const isSelected = selectedVariant?.optionId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedVariant({
                        groupId: vg.id, groupName: vg.name, optionId: opt.id,
                        optionName: opt.name, priceAdjust: adj,
                      })}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="font-medium text-sm">{opt.name}</span>
                      </div>
                      {adj !== 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {adj > 0 ? "+" : ""}CHF {adj.toFixed(2)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ─── Modifier Groups ─── */}
          {(item.modifierGroups ?? []).map(mg => (
            <div key={mg.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{mg.name}</span>
                {mg.isRequired
                  ? <Badge variant="destructive" className="text-xs px-1.5 py-0">Pflicht</Badge>
                  : <span className="text-xs text-muted-foreground">Optional</span>}
                {mg.maxSelections && mg.maxSelections > 1 && (
                  <span className="text-xs text-muted-foreground">max. {mg.maxSelections}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mg.options.map(opt => {
                  const adj = parseFloat(opt.priceAdjustment);
                  const isSelected = selectedModifiers.some(m => m.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleModifier(mg, opt)}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="font-medium text-sm">{opt.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {adj === 0 ? "Gratis" : `${adj > 0 ? "+" : ""}CHF ${adj.toFixed(2)}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ─── Item Type ─── */}
          <div>
            <span className="font-semibold text-sm block mb-2">Typ</span>
            <div className="flex gap-2">
              {(["food", "drink", "other"] as const).map(t => {
                const info = ITEM_TYPE_LABELS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setItemType(t)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                      itemType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 text-muted-foreground"
                    )}
                  >
                    {info.icon}
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Priority ─── */}
          <div>
            <span className="font-semibold text-sm block mb-2">Priorität</span>
            <div className="flex gap-2">
              {(["normal", "rush", "hold"] as const).map(p => {
                const info = PRIORITY_LABELS[p];
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-medium transition-all",
                      priority === p
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 text-muted-foreground"
                    )}
                  >
                    {info.icon}
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Gang (Course) ─── */}
          <div>
            <span className="font-semibold text-sm block mb-2">Gang</span>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map(g => (
                <button
                  key={g}
                  onClick={() => setCourse(g)}
                  className={cn(
                    "w-11 h-11 rounded-xl border-2 text-sm font-bold transition-all",
                    course === g
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40 text-muted-foreground"
                  )}
                >
                  {g}.
                </button>
              ))}
            </div>
          </div>

          {/* ─── Sitzplatz ─── */}
          {guestCount > 0 && (
            <div>
              <span className="font-semibold text-sm block mb-2">Sitzplatz (optional)</span>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSeatNumber(null)}
                  className={cn(
                    "px-3 h-9 rounded-xl border-2 text-sm font-medium transition-all",
                    seatNumber === null
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40 text-muted-foreground"
                  )}
                >
                  Alle
                </button>
                {Array.from({ length: guestCount }, (_, i) => i + 1).map(seat => (
                  <button
                    key={seat}
                    onClick={() => setSeatNumber(seat)}
                    className={cn(
                      "w-9 h-9 rounded-xl border-2 text-sm font-bold transition-all",
                      seatNumber === seat
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 text-muted-foreground"
                    )}
                  >
                    {seat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Anmerkung ─── */}
          <div>
            <label className="font-semibold text-sm block mb-2">
              <StickyNote className="h-3.5 w-3.5 inline mr-1.5" />
              Anmerkung (optional)
            </label>
            <Textarea
              placeholder="z.B. ohne Zwiebeln, extra scharf, Allergie..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="resize-none"
              rows={2}
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t space-y-3 bg-background">
        {/* Quantity */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Menge</span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => setQty(q => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="font-bold text-xl w-8 text-center">{qty}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-xl"
              onClick={() => setQty(q => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-1.5">
          {priority !== "normal" && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", PRIORITY_LABELS[priority].color, "border-current")}>
              {PRIORITY_LABELS[priority].label}
            </span>
          )}
          {course > 1 && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-muted-foreground text-muted-foreground font-medium">
              {course}. Gang
            </span>
          )}
          {seatNumber && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-muted-foreground text-muted-foreground font-medium">
              Platz {seatNumber}
            </span>
          )}
          {selectedVariant && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/50 text-primary font-medium">
              {selectedVariant.optionName}
            </span>
          )}
          {selectedModifiers.map(m => (
            <span key={m.id} className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary/80 font-medium">
              {m.name}
            </span>
          ))}
        </div>

        <Button
          className="w-full h-12 text-base font-semibold rounded-xl"
          onClick={handleAdd}
        >
          <Plus className="h-5 w-5 mr-2" />
          Hinzufügen · CHF {totalPrice.toFixed(2)}
        </Button>
      </div>
    </div>
  );
}

// ─── Order Item Edit Dialog ───────────────────────────────────────────────────
function OrderItemEditDialog({
  item,
  orderId,
  onClose,
  onSaved,
}: {
  item: OrderItem;
  orderId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(item.notes ?? "");
  const [seatNumber, setSeatNumber] = useState<number | null>(item.seatNumber ?? null);
  const [course, setCourse] = useState(item.course ?? 1);
  const [priority, setPriority] = useState<"normal" | "rush" | "hold">((item.priority as "normal" | "rush" | "hold") ?? "normal");
  const [itemType, setItemType] = useState<"food" | "drink" | "other">((item.itemType as "food" | "drink" | "other") ?? "food");

  const updateItem = trpc.order.updateItem.useMutation({
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="truncate">{item.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-1">
        {/* Item Type */}
        <div>
          <span className="text-sm font-semibold block mb-2">Typ</span>
          <div className="flex gap-2">
            {(["food", "drink", "other"] as const).map(t => (
              <button
                key={t}
                onClick={() => setItemType(t)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 text-xs font-medium transition-all",
                  itemType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {ITEM_TYPE_LABELS[t].icon}
                {ITEM_TYPE_LABELS[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <span className="text-sm font-semibold block mb-2">Priorität</span>
          <div className="flex gap-2">
            {(["normal", "rush", "hold"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border-2 text-xs font-medium transition-all",
                  priority === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {PRIORITY_LABELS[p].icon}
                {PRIORITY_LABELS[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Gang */}
        <div>
          <span className="text-sm font-semibold block mb-2">Gang</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(g => (
              <button
                key={g}
                onClick={() => setCourse(g)}
                className={cn(
                  "w-10 h-10 rounded-xl border-2 text-sm font-bold transition-all",
                  course === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {g}.
              </button>
            ))}
          </div>
        </div>

        {/* Sitzplatz */}
        <div>
          <span className="text-sm font-semibold block mb-2">Sitzplatz</span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSeatNumber(null)}
              className={cn(
                "px-3 h-9 rounded-xl border-2 text-xs font-medium transition-all",
                seatNumber === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              )}
            >
              Alle
            </button>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
              <button
                key={s}
                onClick={() => setSeatNumber(s)}
                className={cn(
                  "w-9 h-9 rounded-xl border-2 text-xs font-bold transition-all",
                  seatNumber === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Anmerkung */}
        <div>
          <span className="text-sm font-semibold block mb-2">Anmerkung</span>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="resize-none text-sm"
            style={{ fontSize: "16px" }}
            placeholder="z.B. ohne Zwiebeln..."
          />
        </div>

        <Button
          className="w-full"
          onClick={() => updateItem.mutate({ orderId, itemId: item.id, notes, seatNumber, course, priority, itemType })}
          disabled={updateItem.isPending}
        >
          {updateItem.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Speichern
        </Button>
      </div>
    </DialogContent>
  );
}

// ─── Order Sidebar ────────────────────────────────────────────────────────────
function OrderSidebar({
  order,
  tableLabel,
  onClose,
  onRefresh,
}: {
  order: OrderWithItems;
  tableLabel: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [showMixedPayDialog, setShowMixedPayDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState<{ itemId: number; itemName: string; maxQty: number } | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [selectedMoveItems, setSelectedMoveItems] = useState<number[]>([]);
  const [moveTargetOrderId, setMoveTargetOrderId] = useState<number | null>(null);
  const [voidQty, setVoidQty] = useState(1);
  const [voidReason, setVoidReason] = useState<"wrong_order"|"customer_change"|"quality"|"duplicate"|"other">("other");
  const [voidNote, setVoidNote] = useState("");
  const [splitItems, setSplitItems] = useState<Record<number, number>>({});
  const [splitPersonCount, setSplitPersonCount] = useState(2);

  // ─── Personen-Split State ─────────────────────────────────────────────────
  const [showPersonSplitDialog, setShowPersonSplitDialog] = useState(false);
  // Schritt: 1=Personen festlegen, 2=Artikel zuweisen, 3=Bezahlen
  const [personSplitStep, setPersonSplitStep] = useState<1|2|3>(1);
  // Personen-Namen
  const [personLabels, setPersonLabels] = useState<string[]>(["Gast 1", "Gast 2"]);
  // Zuweisung: itemId -> { personIdx: number, qty: number }[]
  // Für geteilte Artikel: mehrere Einträge mit gleichem itemId
  type PersonItemAssignment = { personIdx: number; qty: number; amount: number };
  const [personAssignments, setPersonAssignments] = useState<Record<number, PersonItemAssignment[]>>({});
  // Welcher Artikel wird gerade geteilt?
  const [splitItemDialog, setSplitItemDialog] = useState<{ itemId: number; itemName: string; unitPrice: number; totalQty: number } | null>(null);
  // Zahlungsmethode pro Person
  const [personPayMethods, setPersonPayMethods] = useState<Record<number, "cash"|"card"|"twint"|"voucher"|"invoice">>({});
  const [mixedMethod, setMixedMethod] = useState<"cash"|"card"|"twint"|"voucher"|"invoice">("cash");
  const [mixedAmount, setMixedAmount] = useState("");
  const [tip, setTip] = useState("");
  const [cashGiven, setCashGiven] = useState("");
  const [payMethod, setPayMethod] = useState<"cash"|"card"|"twint"|"invoice">("cash");

  // ─── Invoice / Debitor State ─────────────────────────────────────────────────
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  // Wenn gesetzt: Invoice-Dialog wurde aus dem Personen-Split heraus geöffnet
  const [splitInvoiceContext, setSplitInvoiceContext] = useState<{ splitId: number; splitLabel: string; amount: number } | null>(null);
  const [debtorSearch, setDebtorSearch] = useState("");
  const [showDebtorDropdown, setShowDebtorDropdown] = useState(false);
  const [showDebtorSheet, setShowDebtorSheet] = useState(false);
  const [debtorSheetSearch, setDebtorSheetSearch] = useState("");
  const [saveAsDebtor, setSaveAsDebtor] = useState(false);
  const [newDebtorIban, setNewDebtorIban] = useState("");
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [guestData, setGuestData] = useState({
    recipientName: "",
    recipientEmail: "",
    recipientAddress: "",
    dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })(),
    additionalInfo: "",
    discountPercent: 0,
  });

  // ─── Gutschein-State ─────────────────────────────────────────────────────────
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; amountDeducted: number } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherLookupCode, setVoucherLookupCode] = useState("");
  const [showVoucherScanner, setShowVoucherScanner] = useState(false);
  // ── SumUp Terminal ────────────────────────────────────────────────────────
  const [sumupTxId, setSumupTxId] = useState<number | null>(null);
  const [sumupStatus, setSumupStatus] = useState<"idle" | "pending" | "paid" | "failed" | "cancelled">("idle");
  const [showSumupDialog, setShowSumupDialog] = useState(false);
  const sumupCheckout = trpc.sumup.createCheckout.useMutation({
    onSuccess: (data) => { setSumupTxId(data.transactionId); setSumupStatus("pending"); },
    onError: (e) => { toast.error("Terminal-Fehler: " + e.message); setSumupStatus("failed"); },
  });
  const sumupCancelMutation = trpc.sumup.terminateCheckout.useMutation({
    onSuccess: () => { setSumupStatus("cancelled"); setSumupTxId(null); },
  });
  const sumupPoll = trpc.sumup.getTransactionStatus.useQuery(
    { transactionId: sumupTxId! },
    { enabled: sumupTxId !== null && sumupStatus === "pending", refetchInterval: 3000 }
  );
  // React to poll result – moved to useEffect below after closeOrder/tipAmount are declared
  const [orderNotes, setOrderNotes] = useState(order.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [guestCount, setGuestCount] = useState(order.guestCount ?? 0);
  const [editingGuests, setEditingGuests] = useState(false);

  const utils = trpc.useUtils();
  const { user } = useAuth();
  const restaurantId = user?.restaurantId ?? 0;
  const { data: restaurantSettings } = trpc.restaurantAdmin.getSettings.useQuery();
  const requireSignature = (() => {
    try { return JSON.parse((restaurantSettings as any)?.waiterPermissions ?? '{}').requireSignature === true; } catch { return false; }
  })();

  // Debitorenstamm laden (für Dropdown-Auswahl im Rechnungs-Dialog)
  const { data: debtorOptions = [] } = trpc.debtors.listForSelect.useQuery(
    { restaurantId, searchQuery: debtorSearch },
    { enabled: !!restaurantId && showInvoiceDialog }
  );
  // Alle Debitoren für das Sheet-Fenster
  const { data: allDebtors = [], isLoading: allDebtorsLoading } = trpc.debtors.listForSelect.useQuery(
    { restaurantId, searchQuery: debtorSheetSearch },
    { enabled: !!restaurantId && showDebtorSheet }
  );

  // Debitor direkt aus Tisch-Bezahlung erstellen
  const createDebtorMutation = trpc.debtors.create.useMutation({
    onSuccess: () => toast.success("Debitor im Stamm gespeichert"),
    onError: (e) => toast.error(`Debitor konnte nicht gespeichert werden: ${e.message}`),
  });

  // Rechnung aus Bestellung erstellen
  const createInvoiceFromOrder = trpc.invoicing.createInvoiceFromOrder.useMutation({
    onSuccess: (data) => {
      setShowInvoiceDialog(false);
      toast.success(`Rechnung ${data.invoiceNumber} erstellt`);
      if (splitInvoiceContext) {
        // Split-Kontext: paySplit aufrufen und Split als bezahlt markieren
        paySplitMutation.mutate({ splitId: splitInvoiceContext.splitId, method: "invoice" });
        setSplitInvoiceContext(null);
      } else {
        // Normaler Tisch-Checkout: Bestellung schliessen
        closeOrder.mutate({ orderId: order.id, paymentMethod: "invoice", tipAmount: tipAmount });
        utils.order.getTableStatus.invalidate();
      }
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  function fillFromDebtor(debtor: typeof debtorOptions[number]) {
    const addressParts = [
      debtor.address,
      debtor.zip && debtor.city ? `${debtor.zip} ${debtor.city}` : debtor.city || debtor.zip,
    ].filter(Boolean);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (debtor.paymentTermDays || 30));
    setGuestData(d => ({
      ...d,
      recipientName: debtor.company ? `${debtor.name} / ${debtor.company}` : debtor.name,
      recipientEmail: debtor.email || d.recipientEmail,
      recipientAddress: addressParts.join("\n") || d.recipientAddress,
      dueDate: dueDate.toISOString().split("T")[0],
    }));
    setDebtorSearch("");
    setShowDebtorDropdown(false);
  }

  function handleInvoiceSubmit() {
    if (!guestData.recipientName.trim()) {
      toast.error("Bitte Name des Rechnungsempfängers eingeben");
      return;
    }
    if (requireSignature && !signatureData) {
      toast.error("Unterschrift des Gastes ist obligatorisch — bitte unterschreiben lassen");
      return;
    }
    if (saveAsDebtor) {
      if (!newDebtorIban.trim()) {
        toast.error("IBAN ist Pflichtfeld für Debitor-Speicherung");
        return;
      }
      const cleanIban = newDebtorIban.replace(/\s/g, "").toUpperCase();
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(cleanIban)) {
        toast.error("Ungültiges IBAN-Format");
        return;
      }
      createDebtorMutation.mutate({
        restaurantId,
        name: guestData.recipientName.trim(),
        email: guestData.recipientEmail.trim() || undefined,
        address: guestData.recipientAddress.trim() || undefined,
        iban: cleanIban,
        country: "CH",
      });
    }
    createInvoiceFromOrder.mutate({
      orderId: order.id,
      restaurantId,
      splitId: splitInvoiceContext?.splitId,
      recipientName: guestData.recipientName.trim(),
      recipientEmail: guestData.recipientEmail.trim() || undefined,
      recipientAddress: guestData.recipientAddress.trim() || undefined,
      dueDate: guestData.dueDate || undefined,
      additionalInfo: guestData.additionalInfo.trim() || undefined,
      discountPercent: guestData.discountPercent,
      signatureDataUrl: signatureData?.dataUrl || undefined,
      signatureLat: signatureData?.lat,
      signatureLng: signatureData?.lng,
      signatureAddress: signatureData?.address,
      signatureTimestamp: signatureData?.timestamp,
    });
  }
  const updateOrderType = trpc.order.updateOrderType.useMutation({
    onSuccess: onRefresh,
    onError: (e) => toast.error(e.message),
  });

  const updateQty = trpc.order.updateItemQty.useMutation({
    onSuccess: onRefresh,
    onError: (e) => toast.error(e.message),
  });
  const removeItem = trpc.order.removeItem.useMutation({
    onSuccess: onRefresh,
    onError: (e) => toast.error(e.message),
  });
  // Druck via Local Connect Queue: Server speichert Job, App druckt im WLAN
  const printKitchenJobMutation = trpc.printer.createKitchenPrintJob.useMutation();
  const printKitchenOrder = {
    mutate: (input: { orderId: number; itemIds?: number[] }) => {
      printKitchenJobMutation.mutateAsync(input).then((data) => {
        if (data.printed === 0) { toast.info("Kein Küchenbon nötig"); return; }
        if ("error" in data && data.error) {
          toast.warning("Küchenbon: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.");
          return;
        }
        toast.success("Küchenbon gesendet – Local Connect App druckt in wenigen Sekunden.");
      }).catch((e: any) => toast.error(`Drucker: ${e?.message}`));
    },
  };
  const printReceiptJobMutation = trpc.printer.createReceiptPrintJob.useMutation();
  const printReceiptMutation = {
    mutate: (input: { orderId: number; paymentMethod?: string; amountPaid?: number; tip?: number }) => {
      printReceiptJobMutation.mutateAsync(input).then(() => {
        toast.success("Bon wird gedruckt – Local Connect App druckt in wenigen Sekunden.");
      }).catch((e: any) => {
        if (e?.message?.includes('Local Connect')) {
          toast.error('Drucken nicht möglich: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.');
        } else {
          toast.error(`Bondrucker: ${e?.message}`);
        }
      });
    },
  };
  const sendToKitchen = trpc.order.sendToKitchen.useMutation({
    onSuccess: (data) => {
      toast.success(`Bon ${data.orderNumber} an Küche gesendet`);
      printKitchenOrder.mutate({ orderId: order.id });
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const sendCourse = trpc.order.sendCourse.useMutation({
    onSuccess: (data) => {
      toast.success(`Gang ${data.courseNumber} gesendet (${data.sentItems} Pos.)`);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const closeOrder = trpc.order.closeOrder.useMutation({
    onSuccess: (data) => {
      const tipVal = parseFloat(tip || "0");
      const cashVal = parseFloat(cashGiven) || 0;
      const change = payMethod === "cash" ? Math.max(0, cashVal - data.totalAmount) : 0;
      toast.success("Bestellung abgeschlossen – Bon wird gedruckt");
      printReceiptMutation.mutate({
        orderId: order.id,
        paymentMethod: payMethod,
        amountPaid: cashVal > 0 ? cashVal : undefined,
        tip: tipVal > 0 ? tipVal : undefined,
        // discount is already applied in the order total
      });
      utils.order.getTableStatus.invalidate();
      setShowPayDialog(false);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelOrder = trpc.order.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("Bestellung storniert");
      utils.order.getTableStatus.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateNotes = trpc.order.updateOrderNotes.useMutation({
    onSuccess: () => { setEditingNotes(false); onRefresh(); },
  });
  const updateGuestCount = trpc.order.updateGuestCount.useMutation({
    onSuccess: () => { setEditingGuests(false); onRefresh(); },
  });
  const voidItemMutation = trpc.order.voidItem.useMutation({
    onSuccess: (data) => {
      toast.success(`Storniert: CHF ${data.totalVoided.toFixed(2)}`);
      setShowVoidDialog(null); setVoidQty(1); setVoidReason("other"); setVoidNote("");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const addPaymentMutation = trpc.order.addPayment.useMutation({
    onSuccess: (data) => {
      if (data.isFullyPaid) {
        toast.success("Vollständig bezahlt!");
        utils.order.getTableStatus.invalidate();
        onClose();
      } else {
        toast.success(`Zahlung erfasst. Restbetrag: CHF ${data.remaining.toFixed(2)}`);
        setMixedAmount("");
        onRefresh();
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const splitBillMutation = trpc.order.splitBill.useMutation({
    onSuccess: () => {
      toast.success("Rechnung aufgeteilt");
      setShowSplitDialog(false);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const splitByPersonsMutation = trpc.order.splitByPersons.useMutation({
    onSuccess: () => {
      toast.success("Personen-Splits erstellt");
      setPersonSplitStep(3);
      utils.order.getBillSplits.invalidate({ orderId: order.id });
    },
    onError: (e) => toast.error(e.message),
  });
  const paySplitMutation = trpc.order.paySplit.useMutation({
    onSuccess: (data) => {
      // Immer billSplits neu laden damit Status aktualisiert wird
      utils.order.getBillSplits.invalidate({ orderId: order.id });
      if (data.allPaid) {
        toast.success("Alle Splits bezahlt!");
        utils.order.getTableStatus.invalidate();
        onClose();
      } else {
        toast.success("Split bezahlt ✓");
        onRefresh();
      }
    },
    onError: (e) => toast.error(e.message),
  });
  // ─── Gutschein-Mutations ────────────────────────────────────────────────────
  const { data: voucherLookupData, isLoading: voucherLookupLoading } = trpc.voucher.lookupByCode.useQuery(
    { code: voucherLookupCode },
    { enabled: voucherLookupCode.length >= 3 }
  );
  const redeemVoucherMutation = trpc.voucher.redeem.useMutation({
    onSuccess: (data) => {
      setAppliedVoucher({ code: voucherCode, amountDeducted: data.amountDeducted });
      setVoucherError(null);
      toast.success(`Gutschein eingelöst: - CHF ${data.amountDeducted.toFixed(2)}`);
    },
    onError: (e) => { setVoucherError(e.message); toast.error(e.message); },
  });

  const { data: billSplitsData } = trpc.order.getBillSplits.useQuery(
    { orderId: order.id },
    { enabled: showSplitDialog || (showPersonSplitDialog && personSplitStep === 3) }
  );
  const { data: paymentsData } = trpc.order.getOrderPayments.useQuery(
    { orderId: order.id },
    { enabled: showMixedPayDialog }
  );
  const { data: openTablesData, isLoading: openTablesLoading } = trpc.order.getTableStatus.useQuery(
    undefined,
    { enabled: showMoveDialog || showMergeDialog }
  );
  const moveItemsMutation = trpc.order.moveItems.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.movedCount} Artikel verschoben`);
      setShowMoveDialog(false);
      setSelectedMoveItems([]);
      setMoveTargetOrderId(null);
      utils.order.getTableStatus.invalidate();
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const mergeTablesMutation = trpc.order.mergeTables.useMutation({
    onSuccess: () => {
      toast.success("Tische zusammengeführt");
      setShowMergeDialog(false);
      setMoveTargetOrderId(null);
      utils.order.getTableStatus.invalidate();
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingItems = order.items.filter(i => i.status === "pending");
  const sentItems = order.items.filter(i => i.status !== "pending");
  const subtotal = parseFloat(order.subtotal ?? "0");
  const taxAmount = parseFloat(order.taxAmount ?? "0");
  const tipAmount = parseFloat(tip || "0");

  // React to SumUp poll result
  useEffect(() => {
    if (sumupPoll.data?.status === "paid" && sumupStatus === "pending") {
      setSumupStatus("paid");
      closeOrder.mutate({ orderId: order.id, paymentMethod: "card", tipAmount });
      setShowSumupDialog(false);
    }
    if ((sumupPoll.data?.status === "failed" || sumupPoll.data?.status === "cancelled") && sumupStatus === "pending") {
      setSumupStatus(sumupPoll.data.status as "failed" | "cancelled");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sumupPoll.data?.status]);

  const statusColor: Record<string, string> = {
    pending: "text-amber-600",
    preparing: "text-blue-600",
    ready: "text-purple-600",
    served: "text-emerald-600",
  };

  const priorityBadge: Record<string, string> = {
    rush: "text-red-600 bg-red-50 border-red-200",
    hold: "text-amber-600 bg-amber-50 border-amber-200",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{tableLabel}</div>
          <div className="text-xs text-muted-foreground">{order.orderNumber}</div>
        </div>
        {/* Guest count */}
        <button
          onClick={() => setEditingGuests(true)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="h-4 w-4" />
          <span>{guestCount > 0 ? guestCount : "–"}</span>
        </button>
        {/* Vor-Ort / Take-away Toggle (MWST-7) */}
        {(order.status === "pending" || order.status === "preparing") && (() => {
          const isTakeaway = order.type === "takeaway";
          return (
            <button
              onClick={() => updateOrderType.mutate({ orderId: order.id, type: isTakeaway ? "dine_in" : "takeaway" })}
              disabled={updateOrderType.isPending}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                isTakeaway
                  ? "bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200"
                  : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
              }`}
              title={isTakeaway ? "Take-away (2.6% MwSt.) – klicken für Vor-Ort" : "Vor-Ort (8.1% MwSt.) – klicken für Take-away"}
            >
              {isTakeaway ? (
                <><ShoppingBag className="h-3 w-3" /><span>Take-away</span></>
              ) : (
                <><Utensils className="h-3 w-3" /><span>Vor Ort</span></>
              )}
            </button>
          );
        })()}
        <Badge variant={order.status === "pending" ? "secondary" : "default"} className="text-xs shrink-0">
          {order.status === "pending" ? "Offen"
            : order.status === "preparing" ? "Küche"
            : order.status === "ready" ? "Bereit"
            : order.status}
        </Badge>
      </div>

      <div className="flex-1 min-h-0" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="p-4 space-y-4">
          {/* Pending items */}
          {pendingItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  Noch nicht gesendet ({pendingItems.length})
                </span>
              </div>
              <div className="space-y-2">
                {pendingItems.map(item => (
                  <SwipeableItem
                    key={item.id}
                    onDelete={() => removeItem.mutate({ orderId: order.id, itemId: item.id })}
                  >
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">{item.name}</span>
                        {item.priority && item.priority !== "normal" && (
                          <span className={cn("text-xs px-1.5 py-0 rounded border font-medium", priorityBadge[item.priority])}>
                            {PRIORITY_LABELS[item.priority]?.label}
                          </span>
                        )}
                        {item.course && item.course > 1 && (
                          <span className="text-xs text-muted-foreground">{item.course}. Gang</span>
                        )}
                        {item.seatNumber && (
                          <span className="text-xs text-muted-foreground">Platz {item.seatNumber}</span>
                        )}
                      </div>
                      {item.notes && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.notes}</div>}
                      <div className="text-xs text-muted-foreground">CHF {parseFloat(item.unitPrice).toFixed(2)} / Stk</div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => updateQty.mutate({ orderId: order.id, itemId: item.id, quantity: item.quantity - 1 })}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-bold text-sm w-5 text-center">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => updateQty.mutate({ orderId: order.id, itemId: item.id, quantity: item.quantity + 1 })}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingItem(item)}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeItem.mutate({ orderId: order.id, itemId: item.id })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-sm font-semibold shrink-0 w-16 text-right">
                      CHF {parseFloat(item.totalPrice).toFixed(2)}
                    </div>
                  </div>
                  </SwipeableItem>
                ))}
              </div>
            </div>
          )}

          {/* Sent items */}
          {sentItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  In Küche / Serviert ({sentItems.length})
                </span>
              </div>
              <div className="space-y-2">
                {sentItems.map(item => (
                  <div key={item.id} className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">{item.name}</span>
                        {item.seatNumber && (
                          <span className="text-xs text-muted-foreground">Platz {item.seatNumber}</span>
                        )}
                      </div>
                      {item.notes && <div className="text-xs text-muted-foreground line-clamp-1">{item.notes}</div>}
                    </div>
                    <span className={cn("text-xs font-medium shrink-0", statusColor[item.status] ?? "text-muted-foreground")}>
                      ×{item.quantity}
                    </span>
                    <div className="text-sm font-semibold shrink-0 w-16 text-right">
                      CHF {parseFloat(item.totalPrice).toFixed(2)}
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                      title="Position stornieren"
                      onClick={() => { setShowVoidDialog({ itemId: item.id, itemName: item.name, maxQty: item.quantity }); setVoidQty(1); }}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Noch keine Artikel</p>
              <p className="text-xs mt-1 opacity-60">Tippen Sie auf ein Produkt um es hinzuzufügen</p>
            </div>
          )}

          {/* Order Notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tischnotiz</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditingNotes(!editingNotes)}>
                {editingNotes ? "Abbrechen" : "Bearbeiten"}
              </Button>
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                  style={{ fontSize: "16px" }}
                />
                <Button size="sm" className="w-full"
                  onClick={() => updateNotes.mutate({ orderId: order.id, notes: orderNotes })}>
                  Speichern
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{order.notes || "Keine Notiz"}</p>
            )}
          </div>

          {/* Totals */}
          <div className="rounded-xl border p-3 space-y-1.5 bg-muted/20">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Zwischensumme</span>
              <span>CHF {subtotal.toFixed(2)}</span>
            </div>
            {/* MwSt.-Aufschlüsselung per Steuerklasse */}
            {order.taxBreakdown && (order.taxBreakdown as any[]).length > 0 ? (
              (order.taxBreakdown as any[]).map((b: any) => (
                <div key={b.rate} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">MwSt. {parseFloat(b.rate).toFixed(1)}% (Basis CHF {parseFloat(b.base).toFixed(2)})</span>
                  <span>CHF {parseFloat(b.amount).toFixed(2)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">MwSt. 8.1% (inkl.)</span>
                <span>CHF {taxAmount.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total (inkl. MwSt.)</span>
              <span>CHF {subtotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t space-y-2 bg-background">
        {pendingItems.length > 0 && (() => {
          const courseGroups = pendingItems.reduce((acc, item) => {
            const c = item.course ?? 1;
            if (!acc[c]) acc[c] = [];
            acc[c].push(item);
            return acc;
          }, {} as Record<number, typeof pendingItems>);
          const courseNums = Object.keys(courseGroups).map(Number).sort();
          const COURSE_LABELS: Record<number, string> = { 1: "Vorspeise", 2: "Hauptgang", 3: "Dessert", 4: "Nachspeise" };
          return (
            <div className="space-y-1.5">
              {courseNums.length > 1 ? (
                courseNums.map(c => {
                  const items = courseGroups[c];
                  const total = items.reduce((s, i) => s + parseFloat(i.totalPrice), 0);
                  return (
                    <Button key={c}
                      className="w-full h-10 font-semibold bg-blue-600 hover:bg-blue-700 rounded-xl text-sm"
                      onClick={() => sendCourse.mutate({ orderId: order.id, courseNumber: c })}
                      disabled={sendCourse.isPending}
                    >
                      {sendCourse.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                      {COURSE_LABELS[c] ?? `Gang ${c}`} senden ({items.length} Pos.) · CHF {total.toFixed(2)}
                    </Button>
                  );
                })
              ) : null}
              <Button
                className="w-full h-11 font-semibold bg-blue-600 hover:bg-blue-700 rounded-xl"
                onClick={() => sendToKitchen.mutate({ orderId: order.id })}
                disabled={sendToKitchen.isPending}
              >
                {sendToKitchen.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {courseNums.length > 1 ? "Alle Gänge" : "Bon"} senden ({pendingItems.length} Pos.) · CHF {pendingItems.reduce((s, i) => s + parseFloat(i.totalPrice), 0).toFixed(2)}
              </Button>
            </div>
          );
        })()}
        {order.items.length > 0 && (
          <Button
            variant="outline"
            className="w-full h-11 font-semibold border-emerald-500 text-emerald-700 hover:bg-emerald-50 rounded-xl"
            onClick={() => setShowPayDialog(true)}
          >
            <Receipt className="h-4 w-4 mr-2" />
            Rechnung · CHF {(subtotal + taxAmount).toFixed(2)}
          </Button>
        )}
        {order.items.length > 1 && (
          <Button
            variant="outline"
            className="w-full h-10 text-sm border-violet-400 text-violet-700 hover:bg-violet-50 rounded-xl"
            onClick={() => {
              // Personen-Split-Dialog öffnen (neuer Workflow)
              setPersonSplitStep(1);
              setPersonLabels(["Gast 1", "Gast 2"]);
              setPersonAssignments({});
              setPersonPayMethods({});
              setShowPersonSplitDialog(true);
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            Rechnung aufteilen
          </Button>
        )}
        {order.items.length > 0 && (
          <Button
            variant="outline"
            className="w-full h-10 text-sm border-orange-400 text-orange-700 hover:bg-orange-50 rounded-xl"
            onClick={() => setShowMixedPayDialog(true)}
          >
            <Wallet className="h-4 w-4 mr-2" />
            Mischzahlung
          </Button>
        )}
        {order.items.length > 0 && (
          <Button
            variant="outline"
            className="w-full h-10 text-sm border-sky-400 text-sky-700 hover:bg-sky-50 rounded-xl"
            onClick={() => { setSelectedMoveItems([]); setMoveTargetOrderId(null); setShowMoveDialog(true); }}
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Artikel verschieben
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full h-10 text-sm border-amber-400 text-amber-700 hover:bg-amber-50 rounded-xl"
          onClick={() => { setMoveTargetOrderId(null); setShowMergeDialog(true); }}
        >
          <Merge className="h-4 w-4 mr-2" />
          Tisch zusammenführen
        </Button>
        <Button
          variant="outline"
          className="w-full h-10 text-sm border-red-300 text-red-600 hover:bg-red-50 rounded-xl"
          onClick={() => setShowCancelDialog(true)}
          disabled={cancelOrder.isPending}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Bestellung stornieren
        </Button>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechnung abschliessen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Restaurant-Header auf Bon */}
            {restaurantSettings && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-0.5">
                <p className="font-semibold text-sm">{restaurantSettings.companyName || restaurantSettings.name}</p>
                {restaurantSettings.address && <p className="text-muted-foreground">{restaurantSettings.address}, {restaurantSettings.zip} {restaurantSettings.city}</p>}
                {restaurantSettings.vatNumber && <p className="text-muted-foreground">MwSt-Nr: {restaurantSettings.vatNumber}</p>}
              </div>
            )}
            <div className="rounded-xl border p-3 space-y-1.5 bg-muted/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Brutto (inkl. MwSt.)</span>
                <span>CHF {subtotal.toFixed(2)}</span>
              </div>
              {/* MwSt.-Aufschlüsselung */}
              {order.taxBreakdown && (order.taxBreakdown as any[]).length > 0 ? (
                (order.taxBreakdown as any[]).map((b: any) => (
                  <div key={b.rate} className="flex justify-between text-xs text-muted-foreground">
                    <span>davon MwSt. {parseFloat(b.rate).toFixed(1)}% (Basis CHF {parseFloat(b.base).toFixed(2)})</span>
                    <span>CHF {parseFloat(b.amount).toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>davon MwSt. 8.1% (Basis CHF {(subtotal / 1.081).toFixed(2)})</span>
                  <span>CHF {taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Trinkgeld CHF</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={tip}
                  onChange={e => setTip(e.target.value)}
                  className="h-8 text-sm"
                  style={{ fontSize: "16px" }}
                />
              </div>
              {appliedVoucher && (
                <div className="flex justify-between text-sm text-green-700 font-medium">
                  <span>Gutschein ({appliedVoucher.code})</span>
                  <span>- CHF {appliedVoucher.amountDeducted.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>CHF {Math.max(0, subtotal + tipAmount - (appliedVoucher?.amountDeducted ?? 0)).toFixed(2)}</span>
              </div>
            </div>
            {/* Gutschein-Eingabe */}
            <div className="rounded-xl border p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Gutschein einlösen
              </p>
              {appliedVoucher ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono font-bold">{appliedVoucher.code}</p>
                    <p className="text-xs text-green-700">- CHF {appliedVoucher.amountDeducted.toFixed(2)} abgezogen</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-500 h-7" onClick={() => setAppliedVoucher(null)}>
                    Entfernen
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Gutschein-Code"
                    value={voucherCode}
                    onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(null); }}
                    className="font-mono h-9 text-sm flex-1"
                    style={{ fontSize: "16px" }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 w-9 p-0 shrink-0"
                    title="QR-Code scannen"
                    onClick={() => setShowVoucherScanner(true)}
                  >
                    <ScanLine className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 bg-purple-600 hover:bg-purple-700 shrink-0"
                    disabled={!voucherCode || redeemVoucherMutation.isPending}
                    onClick={() => redeemVoucherMutation.mutate({
                      code: voucherCode,
                      orderTotal: subtotal + tipAmount,
                      orderId: order.id,
                    })}
                  >
                    {redeemVoucherMutation.isPending ? "..." : "Einlösen"}
                  </Button>
                </div>
              )}
              {voucherError && <p className="text-xs text-red-600">{voucherError}</p>}
            </div>
            {/* Zahlungsmethode wählen */}
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { method: "cash" as const, label: "Bar", icon: Banknote },
                { method: "card" as const, label: "Karte", icon: CreditCard },
                { method: "twint" as const, label: "TWINT", icon: Smartphone },
                { method: "invoice" as const, label: "Rechnung", icon: Receipt },
              ] as const).map(({ method, label, icon: Icon }) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => { setPayMethod(method); if (method !== "cash") setCashGiven(""); }}
                  className={`h-14 flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all text-xs font-medium ${
                    payMethod === method
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Wechselgeld bei Barzahlung */}
            {payMethod === "cash" && (() => {
              const total = Math.max(0, subtotal + tipAmount - (appliedVoucher?.amountDeducted ?? 0));
              const given = parseFloat(cashGiven) || 0;
              const change = given - total;
              // Schnellbeträge: nächste CHF-Noten über dem Total
              const quickAmounts = [5, 10, 20, 50, 100, 200].filter(a => a >= total).slice(0, 4);
              return (
                <div className="rounded-xl border p-3 space-y-2.5 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Banknote className="h-3.5 w-3.5" /> Barzahlung
                  </p>
                  {quickAmounts.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {quickAmounts.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setCashGiven(a.toFixed(2))}
                          className={`px-3 h-8 rounded-lg border text-xs font-semibold transition-all ${
                            cashGiven === a.toFixed(2)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          CHF {a}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">Erhalten CHF</span>
                    <Input
                      type="number"
                      placeholder={total.toFixed(2)}
                      value={cashGiven}
                      onChange={e => setCashGiven(e.target.value)}
                      className="h-8 text-sm"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  {given > 0 && (
                    <div className={`flex justify-between items-center rounded-lg px-3 py-2 font-bold text-sm ${
                      change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>
                      <span>{change >= 0 ? "Rückgeld" : "Fehlbetrag"}</span>
                      <span>CHF {Math.abs(change).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* SumUp Terminal-Zahlung (nur bei Kartenzahlung) */}
            {payMethod === "card" && (
              <Button
                variant="outline"
                className="w-full h-10 font-medium rounded-xl border-blue-400 text-blue-700 hover:bg-blue-50"
                onClick={() => {
                  const total = Math.max(0, subtotal + tipAmount - (appliedVoucher?.amountDeducted ?? 0));
                  setSumupStatus("idle");
                  setSumupTxId(null);
                  setShowSumupDialog(true);
                  sumupCheckout.mutate({ orderId: order.id, amount: total, currency: "CHF" });
                }}
                disabled={sumupCheckout.isPending}
              >
                {sumupCheckout.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Am Terminal bezahlen (SumUp)
              </Button>
            )}

            {/* Bezahlen-Button */}
            <Button
              className="w-full h-12 font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                if (payMethod === "invoice") {
                  setShowPayDialog(false);
                  setShowInvoiceDialog(true);
                } else {
                  closeOrder.mutate({ orderId: order.id, paymentMethod: payMethod, tipAmount: tipAmount });
                }
              }}
              disabled={closeOrder.isPending}
            >
              {closeOrder.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {payMethod === "cash" ? "Bar bezahlen" : payMethod === "card" ? "Manuell Karte" : payMethod === "twint" ? "TWINT bezahlen" : "Rechnung stellen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SumUp Terminal-Status Dialog */}
      <Dialog open={showSumupDialog} onOpenChange={(open) => { if (!open) { sumupCancelMutation.mutate({ transactionId: sumupTxId! }); setShowSumupDialog(false); setSumupStatus("idle"); setSumupTxId(null); } }}>
        <DialogContent className="w-full max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" /> SumUp Terminal
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {sumupStatus === "pending" && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
                <p className="text-center font-medium">Warte auf Kartenzahlung am Terminal...</p>
                <p className="text-sm text-muted-foreground text-center">Bitte Karte am Terminal präsentieren</p>
                <Button variant="outline" size="sm" onClick={() => { sumupCancelMutation.mutate({ transactionId: sumupTxId! }); setShowSumupDialog(false); setSumupStatus("idle"); setSumupTxId(null); }}>Abbrechen</Button>
              </>
            )}
            {sumupStatus === "paid" && (
              <>
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center"><span className="text-2xl">✓</span></div>
                <p className="text-center font-semibold text-emerald-700">Zahlung erfolgreich!</p>
              </>
            )}
            {(sumupStatus === "failed" || sumupStatus === "cancelled") && (
              <>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center"><span className="text-2xl">✗</span></div>
                <p className="text-center font-semibold text-red-700">{sumupStatus === "cancelled" ? "Zahlung abgebrochen" : "Zahlung fehlgeschlagen"}</p>
                <Button size="sm" onClick={() => { const total = Math.max(0, subtotal + tipAmount - (appliedVoucher?.amountDeducted ?? 0)); setSumupStatus("idle"); setSumupTxId(null); sumupCheckout.mutate({ orderId: order.id, amount: total, currency: "CHF" }); }}>Erneut versuchen</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice / Debitor Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={(open) => { setShowInvoiceDialog(open); if (!open && !showDebtorSheet) setSplitInvoiceContext(null); }}>
        <DialogContent className="w-full max-w-md max-h-[90dvh] overflow-y-auto sm:top-[50%] sm:translate-y-[-50%] top-auto bottom-0 sm:bottom-auto translate-y-0 rounded-b-none sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Rechnungsempfänger erfassen
            </DialogTitle>
            <DialogDescription>
              Angaben des Gastes / Debitors eingeben. Eine Schweizer QR-Rechnung über{" "}
              <strong>CHF {splitInvoiceContext ? splitInvoiceContext.amount.toFixed(2) : (subtotal + tipAmount).toFixed(2)}</strong>
              {splitInvoiceContext && <> für <strong>{splitInvoiceContext.splitLabel}</strong></>} wird automatisch erstellt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Debitor aus Stamm auswählen */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <BookUser className="h-3.5 w-3.5" />
                  Aus Debitorenstamm auswählen (optional)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => { setDebtorSheetSearch(""); setShowInvoiceDialog(false); setTimeout(() => setShowDebtorSheet(true), 200); }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Debitor auswählen
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-name" className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Name / Firma <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ov-inv-name"
                placeholder="Max Mustermann / Muster AG"
                value={guestData.recipientName}
                onChange={(e) => setGuestData(d => ({ ...d, recipientName: e.target.value }))}
                style={{ fontSize: "16px" }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                E-Mail (für Rechnungsversand)
              </Label>
              <Input
                id="ov-inv-email"
                type="email"
                placeholder="max@beispiel.ch"
                value={guestData.recipientEmail}
                onChange={(e) => setGuestData(d => ({ ...d, recipientEmail: e.target.value }))}
                style={{ fontSize: "16px" }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-address" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Adresse
              </Label>
              <Textarea
                id="ov-inv-address"
                placeholder={"Musterstrasse 1\n8000 Zürich"}
                value={guestData.recipientAddress}
                onChange={(e) => setGuestData(d => ({ ...d, recipientAddress: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-due" className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Zahlungsfrist
              </Label>
              <Input
                id="ov-inv-due"
                type="text"
                inputMode="numeric"
                placeholder="TT.MM.JJJJ"
                value={guestData.dueDate ? (() => { const [y,m,d] = guestData.dueDate.split('-'); return `${d}.${m}.${y}`; })() : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, '');
                  // Konvertiere TT.MM.JJJJ → JJJJ-MM-TT für internen State
                  const parts = raw.split('.');
                  if (parts.length === 3 && parts[2].length === 4) {
                    setGuestData(d => ({ ...d, dueDate: `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` }));
                  } else {
                    // Während Eingabe: raw speichern und erst bei vollständigem Datum konvertieren
                    setGuestData(d => ({ ...d, dueDate: e.target.value }));
                  }
                }}
                style={{ fontSize: '16px' }}
              />
              <div className="flex gap-1.5 mt-1">
                {[10, 30, 60].map(days => (
                  <button
                    key={days}
                    type="button"
                    className="flex-1 rounded-md border border-border bg-muted/50 hover:bg-muted text-xs py-1 font-medium transition-colors"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + days);
                      setGuestData(prev => ({ ...prev, dueDate: d.toISOString().split('T')[0] }));
                    }}
                  >
                    +{days} Tage
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-discount">Rabatt (%)</Label>
              <Input
                id="ov-inv-discount"
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0"
                value={guestData.discountPercent || ""}
                onChange={(e) => setGuestData(d => ({ ...d, discountPercent: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ov-inv-info" className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Mitteilung (max. 140 Zeichen)
              </Label>
              <Input
                id="ov-inv-info"
                maxLength={140}
                placeholder="z.B. Tisch 5, Geschäftsessen"
                value={guestData.additionalInfo}
                onChange={(e) => setGuestData(d => ({ ...d, additionalInfo: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground text-right">{guestData.additionalInfo.length}/140</p>
            </div>

            {/* Als Debitor speichern */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAsDebtor}
                  onChange={e => setSaveAsDebtor(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-sm font-medium text-blue-800">Als Debitor im Stamm speichern</span>
              </label>
              {saveAsDebtor && (
                <div className="space-y-1">
                  <Label className="text-xs text-blue-700">IBAN <span className="text-red-500">*</span></Label>
                  <Input
                    value={newDebtorIban}
                    onChange={e => setNewDebtorIban(e.target.value)}
                    placeholder="CH56 0483 5012 3456 7800 9"
                    className={`font-mono text-sm h-8 ${
                      newDebtorIban && /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(newDebtorIban.replace(/\s/g, "").toUpperCase())
                        ? "border-green-400"
                        : newDebtorIban ? "border-red-400" : ""
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Digitale Unterschrift */}
            <div className={`rounded-lg border p-3 ${requireSignature ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 bg-gray-50/50'}`}>
              {requireSignature && !signatureData && (
                <div className="flex items-center gap-2 mb-2 text-orange-700 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Unterschrift obligatorisch — ohne Unterschrift kann nicht abgeschlossen werden
                </div>
              )}
              <SignaturePad
                label="Unterschrift des Gastes"
                onSave={(data) => setSignatureData(data)}
                onClear={() => setSignatureData(null)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowInvoiceDialog(false)}
              disabled={createInvoiceFromOrder.isPending}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleInvoiceSubmit}
              disabled={!guestData.recipientName.trim() || createInvoiceFromOrder.isPending || (requireSignature && !signatureData)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createInvoiceFromOrder.isPending ? (
                "Erstelle Rechnung..."
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Rechnung erstellen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debitor-Auswahl Overlay (eigenes Portal, kein Radix-Konflikt mit Invoice-Dialog) */}
      {showDebtorSheet && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDebtorSheet(false); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDebtorSheet(false)} />
          {/* Panel */}
          <div className="relative z-10 bg-background rounded-t-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold">
                  <BookUser className="h-5 w-5 text-blue-600" />
                  Debitor auswählen
                </div>
                <button
                  type="button"
                  className="rounded-full p-1 hover:bg-muted"
                  onClick={() => setShowDebtorSheet(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Suche nach Name, Firma, E-Mail..."
                  value={debtorSheetSearch}
                  onChange={(e) => setDebtorSheetSearch(e.target.value)}
                  className="pl-8"
                  autoComplete="off"
                  style={{ fontSize: "16px" }}
                />
              </div>
            </div>
            {/* Liste */}
            <div className="flex-1 overflow-y-auto">
              {allDebtorsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allDebtors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BookUser className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">{debtorSheetSearch ? "Kein Debitor gefunden" : "Noch keine Debitoren erfasst"}</p>
                </div>
              ) : (
                <div className="divide-y">
                  {allDebtors.map((d: typeof allDebtors[number]) => (
                    <button
                      key={d.id}
                      type="button"
                      className="w-full text-left px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors"
                      onClick={() => {
                        fillFromDebtor(d);
                        setShowDebtorSheet(false);
                        setTimeout(() => setShowInvoiceDialog(true), 50);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{d.name}{d.company ? ` / ${d.company}` : ""}</div>
                          {d.email && <div className="text-xs text-muted-foreground mt-0.5">{d.email}</div>}
                          {d.address && <div className="text-xs text-muted-foreground">{d.address}{d.zip ? `, ${d.zip} ${d.city}` : ""}</div>}
                        </div>
                        <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guest Count Dialog */}
      <Dialog open={editingGuests} onOpenChange={setEditingGuests}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Anzahl Gäste</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-4 py-4">
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl"
              onClick={() => setGuestCount(g => Math.max(0, g - 1))}>
              <Minus className="h-5 w-5" />
            </Button>
            <span className="font-bold text-3xl w-12 text-center">{guestCount}</span>
            <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl"
              onClick={() => setGuestCount(g => g + 1)}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <Button className="w-full"
            onClick={() => updateGuestCount.mutate({ orderId: order.id, guestCount })}>
            Speichern
          </Button>
        </DialogContent>
      </Dialog>

      {/* Item Edit Dialog */}
      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <OrderItemEditDialog
            item={editingItem}
            orderId={order.id}
            onClose={() => setEditingItem(null)}
            onSaved={onRefresh}
          />
        </Dialog>
      )}

      {/* ─── PERSONEN-SPLIT DIALOG (3-Schritt-Prozess) ───────────────────────────── */}
      <Dialog open={showPersonSplitDialog} onOpenChange={(o) => { if (!o) setShowPersonSplitDialog(false); }}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="px-6 pt-6 pb-3 shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-600" />
                Rechnung aufteilen
                <span className="ml-auto text-xs text-muted-foreground font-normal">Schritt {personSplitStep}/3</span>
              </DialogTitle>
            </DialogHeader>
            {/* Schritt-Indikatoren */}
            <div className="flex gap-1 mt-3">
              {[1,2,3].map(s => (
                <div key={s} className={cn("flex-1 h-1 rounded-full transition-colors",
                  s <= personSplitStep ? "bg-violet-600" : "bg-muted")} />
              ))}
            </div>
          </div>

          {/* SCHRITT 1: Personen festlegen */}
          {personSplitStep === 1 && (
            <div className="space-y-4 px-6 pb-6 overflow-y-auto">
              <p className="text-sm text-muted-foreground">Wie viele Personen teilen die Rechnung? Du kannst die Namen anpassen.</p>
              <div className="flex items-center gap-3 justify-center">
                <Button size="icon" variant="outline" className="h-9 w-9"
                  onClick={() => setPersonLabels(l => l.length > 1 ? l.slice(0, -1) : l)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-2xl font-bold w-10 text-center">{personLabels.length}</span>
                <Button size="icon" variant="outline" className="h-9 w-9"
                  onClick={() => setPersonLabels(l => l.length < 20 ? [...l, `Gast ${l.length + 1}`] : l)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {personLabels.map((label, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</div>
                    <Input
                      value={label}
                      onChange={e => setPersonLabels(l => l.map((x, i) => i === idx ? e.target.value : x))}
                      className="h-8 text-sm"
                      placeholder={`Gast ${idx + 1}`}
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowPersonSplitDialog(false)}>Abbrechen</Button>
                <Button className="flex-1 bg-violet-600 hover:bg-violet-700"
                  onClick={() => {
                    // Initialisiere Zuweisungen leer
                    setPersonAssignments({});
                    setPersonSplitStep(2);
                  }}>
                  Weiter
                </Button>
              </div>
            </div>
          )}

          {/* SCHRITT 2: Artikel zuweisen */}
          {personSplitStep === 2 && (() => {
            const items = order.items ?? [];
            // Berechne zugewiesene Menge pro Artikel
            const assignedQty = (itemId: number) =>
              (personAssignments[itemId] ?? []).reduce((s, a) => s + a.qty, 0);
            const totalAssigned = items.reduce((s, i) => s + assignedQty(i.id), 0);
            const totalItems = items.reduce((s, i) => s + (i.quantity ?? 1), 0);
            const allAssigned = totalAssigned >= totalItems;

            return (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Beschreibung */}
                <p className="text-xs text-muted-foreground px-6 pb-2">Tippe auf einen Artikel um ihn einer Person zuzuweisen. Tippe auf « Aufteilen » um einen Artikel auf mehrere Personen zu verteilen.</p>
                {/* Scrollbarer Artikel-Bereich */}
                <div className="flex-1 overflow-y-auto px-6">
                  <div className="space-y-2 pb-2">
                    {items.map(item => {
                      const qty = item.quantity ?? 1;
                      const unitPrice = parseFloat(item.unitPrice ?? "0") || 0;
                      const assigned = personAssignments[item.id] ?? [];
                      const aQty = assignedQty(item.id);
                      const remaining = qty - aQty;

                      return (
                        <div key={item.id} className="border rounded-lg p-3 space-y-2">
                          {/* Zeile 1: Artikel-Name + Aufteilen-Button */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold leading-tight">{item.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{qty}x à CHF {unitPrice.toFixed(2)}</div>
                            </div>
                            <Button size="sm" variant="outline"
                              className="shrink-0 h-7 text-xs border-violet-400 text-violet-700 hover:bg-violet-50"
                              onClick={() => setSplitItemDialog({ itemId: item.id, itemName: item.name, unitPrice, totalQty: qty })}>
                              Aufteilen
                            </Button>
                          </div>

                          {/* Zeile 2: Zugewiesene Personen-Tags */}
                          {assigned.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {assigned.map((a, ai) => (
                                <span key={ai} className="inline-flex items-center gap-1 bg-violet-100 text-violet-800 text-xs font-medium rounded-full px-2.5 py-1">
                                  <span className="truncate max-w-[80px]">{personLabels[a.personIdx] ?? `Gast ${a.personIdx+1}`}</span>
                                  <span className="text-violet-500">×{a.qty.toFixed(2)}</span>
                                  <button
                                    className="ml-0.5 text-violet-400 hover:text-red-500 transition-colors"
                                    onClick={() => setPersonAssignments(prev => {
                                      const arr = (prev[item.id] ?? []).filter((_, i) => i !== ai);
                                      return { ...prev, [item.id]: arr };
                                    })}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Zeile 3: Schnell-Zuweisung für verbleibende Menge */}
                          {remaining > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {personLabels.map((label, pIdx) => (
                                <Button key={pIdx} size="sm" variant="outline"
                                  className="h-7 text-xs rounded-full border-dashed hover:bg-violet-50 hover:border-violet-400 hover:text-violet-700"
                                  onClick={() => setPersonAssignments(prev => {
                                    const arr = [...(prev[item.id] ?? []), { personIdx: pIdx, qty: remaining, amount: remaining * unitPrice }];
                                    return { ...prev, [item.id]: arr };
                                  })}>
                                  + {label}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Fixer Footer */}
                <div className="shrink-0 border-t bg-background px-6 py-4 space-y-2">
                  <div className="text-xs text-center text-muted-foreground">
                    {totalAssigned}/{totalItems} Positionen zugewiesen
                    {allAssigned && <span className="text-green-600 font-semibold ml-1">✓ Alle zugewiesen</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setPersonSplitStep(1)}>Zurück</Button>
                    <Button className="flex-1 bg-violet-600 hover:bg-violet-700"
                      disabled={!allAssigned || splitByPersonsMutation.isPending}
                      onClick={() => {
                        const persons = personLabels.map((label, pIdx) => {
                          const items: Array<{ orderItemId: number; quantity: number; amount: number }> = [];
                          for (const [itemIdStr, assignments] of Object.entries(personAssignments)) {
                            const itemId = Number(itemIdStr);
                            const pAssignments = assignments.filter(a => a.personIdx === pIdx);
                            for (const a of pAssignments) {
                              if (a.qty > 0) items.push({ orderItemId: itemId, quantity: a.qty, amount: a.amount });
                            }
                          }
                          return { label, items };
                        }).filter(p => p.items.length > 0);
                        splitByPersonsMutation.mutate({ orderId: order.id, persons });
                      }}>
                      {splitByPersonsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Splits erstellen"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* SCHRITT 3: Bezahlen */}
          {personSplitStep === 3 && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Beschreibung */}
              <p className="text-xs text-muted-foreground px-6 pb-3">Jede Person kann separat bezahlen. Wähle die Zahlungsmethode und bestätige.</p>
              {/* Scrollbare Personen-Liste */}
              <div className="flex-1 overflow-y-auto px-6">
                <div className="space-y-2 pb-2">
                  {(billSplitsData?.splits ?? []).map((split: { id: number; splitNumber: number; totalAmount: string; status: string; paymentMethod: string | null; splitLabel?: string }, idx: number) => (
                    <div key={split.id} className={cn("border rounded-xl p-3 transition-all",
                      split.status === "paid" ? "border-green-400 bg-green-50" : "border-border bg-card")}>
                      {/* Kopfzeile: Avatar + Name + Status */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                          split.status === "paid" ? "bg-green-100 text-green-700" : "bg-violet-100 text-violet-700")}>
                          {split.status === "paid" ? "✓" : idx+1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold leading-tight">{split.splitLabel ?? `Gast ${idx+1}`}</div>
                          <div className="text-xs text-muted-foreground">CHF {parseFloat(split.totalAmount).toFixed(2)}</div>
                        </div>
                        {split.status === "paid"
                          ? <Badge className="bg-green-600 text-white shrink-0">Bezahlt</Badge>
                          : <Badge variant="secondary" className="shrink-0">Offen</Badge>}
                      </div>
                      {/* Zahlungsbuttons nur wenn noch offen */}
                      {split.status === "open" && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1">
                            {(["cash","card","twint"] as const).map(method => (
                              <button key={method}
                                className={cn("flex-1 h-8 rounded-lg text-xs font-medium transition-colors",
                                  (personPayMethods[split.id] ?? "cash") === method
                                    ? "bg-violet-600 text-white"
                                    : "bg-muted text-foreground hover:bg-violet-50")}
                                onClick={() => setPersonPayMethods(p => ({ ...p, [split.id]: method }))}>
                                {method === "cash" ? "Bar" : method === "card" ? "Karte" : "Twint"}
                              </button>
                            ))}
                            <button
                              className={cn("flex-1 h-8 rounded-lg text-xs font-medium transition-colors",
                                (personPayMethods[split.id] ?? "cash") === "invoice"
                                  ? "bg-blue-600 text-white"
                                  : "bg-muted text-foreground hover:bg-blue-50")}
                              onClick={() => setPersonPayMethods(p => ({ ...p, [split.id]: "invoice" }))}>
                              Rechnung
                            </button>
                          </div>
                          <button
                            className="w-full h-9 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                            disabled={paySplitMutation.isPending || createInvoiceFromOrder.isPending}
                            onClick={() => {
                              const method = personPayMethods[split.id] ?? "cash";
                              if (method === "invoice") {
                                // Debitor-Dialog öffnen mit Split-Kontext
                                setSplitInvoiceContext({
                                  splitId: split.id,
                                  splitLabel: split.splitLabel ?? `Gast ${idx + 1}`,
                                  amount: parseFloat(split.totalAmount),
                                });
                                setGuestData({
                                  recipientName: split.splitLabel ?? "",
                                  recipientEmail: "",
                                  recipientAddress: "",
                                  dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })(),
                                  additionalInfo: "",
                                  discountPercent: 0,
                                });
                                setSignatureData(null);
                                setSaveAsDebtor(false);
                                setDebtorSearch("");
                                setShowInvoiceDialog(true);
                              } else {
                                paySplitMutation.mutate({ splitId: split.id, method });
                              }
                            }}>
                            {(paySplitMutation.isPending || createInvoiceFromOrder.isPending)
                              ? <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                              : (personPayMethods[split.id] ?? "cash") === "invoice" ? "📄 Rechnung stellen" : "✓ Zahlen"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Fixer Footer */}
              <div className="shrink-0 border-t bg-background px-6 py-4">
                <Button variant="outline" className="w-full" onClick={() => setShowPersonSplitDialog(false)}>Schliessen</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Artikel-Aufteilen Sub-Dialog */}
      <Dialog open={!!splitItemDialog} onOpenChange={(o) => { if (!o) setSplitItemDialog(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Aufteilen: {splitItemDialog?.itemName}</DialogTitle>
          </DialogHeader>
          {splitItemDialog && (() => {
            const { itemId, unitPrice, totalQty } = splitItemDialog;
            const existing = personAssignments[itemId] ?? [];
            const assignedQty = existing.reduce((s, a) => s + a.qty, 0);
            const remaining = totalQty - assignedQty;

            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Verbleibend: {remaining.toFixed(2)} × CHF {unitPrice.toFixed(2)}
                  = CHF {(remaining * unitPrice).toFixed(2)}
                </p>
                <p className="text-xs font-medium">Auf wie viele Personen aufteilen?</p>
                <div className="space-y-2">
                  {personLabels.map((label, pIdx) => {
                    const alreadyHas = existing.find(a => a.personIdx === pIdx);
                    return (
                      <div key={pIdx} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{pIdx+1}</div>
                        <span className="text-sm flex-1 truncate">{label}</span>
                        {alreadyHas
                          ? <span className="text-xs text-violet-600">✓ {alreadyHas.qty.toFixed(2)}x</span>
                          : <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700"
                              onClick={() => {
                                // Gleichmäßig aufteilen: verbleibende Menge / Anzahl noch nicht zugewiesener Personen
                                const notYet = personLabels.filter((_, i) => !existing.find(a => a.personIdx === i));
                                const share = remaining / notYet.length;
                                const amount = share * unitPrice;
                                setPersonAssignments(prev => ({
                                  ...prev,
                                  [itemId]: [...(prev[itemId] ?? []), { personIdx: pIdx, qty: share, amount }],
                                }));
                              }}>
                              + Zuweisen
                            </Button>
                        }
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setSplitItemDialog(null)}>Fertig</Button>
                  <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-xs"
                    onClick={() => {
                      // Gleichmäßig auf alle Personen aufteilen
                      const share = totalQty / personLabels.length;
                      const amount = share * unitPrice;
                      setPersonAssignments(prev => ({
                        ...prev,
                        [itemId]: personLabels.map((_, pIdx) => ({ personIdx: pIdx, qty: share, amount })),
                      }));
                      setSplitItemDialog(null);
                    }}>
                    Gleichmäßig aufteilen
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Storno-Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" /> Bestellung stornieren
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Möchtest du die Bestellung <strong>{order.orderNumber}</strong> wirklich stornieren?
            Diese Aktion kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowCancelDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={cancelOrder.isPending}
              onClick={() => cancelOrder.mutate({ orderId: order.id })}
            >
              {cancelOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Stornieren"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Split-Bill Dialog – verbessert mit echter splitBill-Mutation */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" /> Rechnung aufteilen
            </DialogTitle>
          </DialogHeader>
          {/* Bestehende Splits anzeigen */}
          {billSplitsData && billSplitsData.splits.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bestehende Splits</p>
              {billSplitsData.splits.map((split: { id: number; splitNumber: number; totalAmount: string; status: string; paymentMethod: string | null }) => (
                <div key={split.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                  <span>Split #{split.splitNumber}</span>
                  <span>CHF {parseFloat(split.totalAmount).toFixed(2)}</span>
                  <Badge variant={split.status === "paid" ? "default" : "secondary"}>{split.status === "paid" ? "Bezahlt" : "Offen"}</Badge>
                  {split.status === "open" && (
                    <Button size="sm" className="h-6 text-xs" onClick={() => paySplitMutation.mutate({ splitId: split.id, method: "cash" })}>
                      Bar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-3">
            Wähle Artikel für einen neuen Split. Die restlichen Artikel bleiben auf der Hauptrechnung.
          </p>
          <ScrollArea className="max-h-52">
            <div className="space-y-2">
              {(order.items ?? []).map(item => {
                const selected = splitItems[item.id] ?? 0;
                const qty = item.quantity ?? 1;
                const unitPrice = parseFloat(item.unitPrice ?? "0") || 0;
                const splitTotal = selected * unitPrice;
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{qty}x à CHF {unitPrice.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => setSplitItems(s => ({ ...s, [item.id]: Math.max(0, (s[item.id] ?? 0) - 1) }))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold">{selected}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => setSplitItems(s => ({ ...s, [item.id]: Math.min(qty, (s[item.id] ?? 0) + 1) }))}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    {selected > 0 && <span className="text-xs font-semibold text-violet-700 w-14 text-right">CHF {(selected * unitPrice).toFixed(2)}</span>}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="pt-2 border-t">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Split-Betrag:</span>
              <span className="font-bold text-violet-700">
                CHF {(order.items ?? []).reduce((s, i) => s + (splitItems[i.id] ?? 0) * (parseFloat(i.unitPrice ?? "0") || 0), 0).toFixed(2)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSplitDialog(false)}>Abbrechen</Button>
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                disabled={Object.values(splitItems).every(v => v === 0) || splitBillMutation.isPending}
                onClick={() => {
                  const selectedEntries = Object.entries(splitItems).filter(([,v]) => v > 0);
                  const splitTotal = selectedEntries.reduce((s, [id, qty]) => {
                    const item = (order.items ?? []).find(i => i.id === Number(id));
                    return s + (item ? qty * (parseFloat(item.unitPrice ?? "0") || 0) : 0);
                  }, 0);
                  splitBillMutation.mutate({
                    orderId: order.id,
                    splitType: "product",
                    splits: [{
                      label: `Split ${(billSplitsData?.splits.length ?? 0) + 1}`,
                      amount: splitTotal,
                      itemIds: selectedEntries.map(([id]) => Number(id)),
                    }],
                  });
                }}
              >
                {splitBillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Split erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Item Dialog */}
      <Dialog open={!!showVoidDialog} onOpenChange={(o) => !o && setShowVoidDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Ban className="h-5 w-5" /> Position stornieren
            </DialogTitle>
          </DialogHeader>
          {showVoidDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium">{showVoidDialog.itemName}</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Menge stornieren (max. {showVoidDialog.maxQty})</label>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setVoidQty(q => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="font-bold text-xl w-8 text-center">{voidQty}</span>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setVoidQty(q => Math.min(showVoidDialog.maxQty, q + 1))}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Grund</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["wrong_order","customer_change","quality","duplicate","other"] as const).map(r => (
                    <button key={r} onClick={() => setVoidReason(r)}
                      className={cn("p-2 rounded-lg border text-xs font-medium transition-all",
                        voidReason === r ? "border-red-500 bg-red-50 text-red-700" : "border-border hover:border-red-300"
                      )}>
                      {r === "wrong_order" ? "Falsche Bestellung" : r === "customer_change" ? "Gast ändert" : r === "quality" ? "Qualitätsproblem" : r === "duplicate" ? "Doppelt" : "Sonstiges"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notiz (optional)</label>
                <Textarea value={voidNote} onChange={e => setVoidNote(e.target.value)} rows={2} className="text-sm resize-none" placeholder="Zusatzinfo..." style={{ fontSize: "16px" }} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowVoidDialog(null)}>Abbrechen</Button>
                <Button variant="destructive" className="flex-1" disabled={voidItemMutation.isPending}
                  onClick={() => voidItemMutation.mutate({ orderId: order.id, orderItemId: showVoidDialog.itemId, quantity: voidQty, reason: voidReason, reasonNote: voidNote })}>
                  {voidItemMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Stornieren"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mischzahlung Dialog */}
      <Dialog open={showMixedPayDialog} onOpenChange={setShowMixedPayDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Mischzahlung
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Bereits erfasste Zahlungen */}
            {paymentsData && paymentsData.payments.length > 0 && (
              <div className="rounded-xl border p-3 space-y-1.5 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Erfasste Zahlungen</p>
                {paymentsData.payments.map((p: { id: number; method: string; amount: string }) => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span className="capitalize">{p.method === "cash" ? "Bar" : p.method === "card" ? "Karte" : p.method === "twint" ? "TWINT" : p.method}</span>
                    <span className="font-medium">CHF {parseFloat(p.amount).toFixed(2)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between text-sm font-bold">
                  <span>Bezahlt</span>
                  <span className="text-emerald-600">CHF {paymentsData.paid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Restbetrag</span>
                  <span className="text-red-600">CHF {paymentsData.remaining.toFixed(2)}</span>
                </div>
              </div>
            )}
            {/* Neue Zahlung hinzufügen */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Zahlungsart</label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash","card","twint","voucher","invoice"] as const).map(m => (
                  <button key={m} onClick={() => setMixedMethod(m)}
                    className={cn("p-2 rounded-lg border text-xs font-medium transition-all",
                      mixedMethod === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                    )}>
                    {m === "cash" ? "Bar" : m === "card" ? "Karte" : m === "twint" ? "TWINT" : m === "voucher" ? "Gutschein" : "Rechnung"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Betrag CHF</label>
              <Input type="number" placeholder="0.00" value={mixedAmount} onChange={e => setMixedAmount(e.target.value)} className="h-10" style={{ fontSize: "16px" }} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowMixedPayDialog(false)}>Schliessen</Button>
              <Button className="flex-1" disabled={!mixedAmount || addPaymentMutation.isPending}
                onClick={() => addPaymentMutation.mutate({ orderId: order.id, method: mixedMethod, amount: parseFloat(mixedAmount || "0") })}>
                {addPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zahlung erfassen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Artikel verschieben Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" /> Artikel verschieben
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Artikel auswählen (Mehrfachauswahl möglich):</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {order.items.filter(i => i.status !== "void").map(item => (
                  <button key={item.id}
                    onClick={() => setSelectedMoveItems(prev =>
                      prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                    )}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-lg border text-sm text-left transition-all",
                      selectedMoveItems.includes(item.id)
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-border hover:border-sky-300"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                      selectedMoveItems.includes(item.id) ? "border-sky-500 bg-sky-500" : "border-muted-foreground"
                    )}>
                      {selectedMoveItems.includes(item.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    <span className="flex-1">{item.name} ×{item.quantity}</span>
                    <span className="text-muted-foreground">CHF {parseFloat(item.totalPrice).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Ziel-Tisch auswählen:</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {openTablesLoading && <p className="text-xs text-muted-foreground text-center py-2">Lade Tische...</p>}
                {!openTablesLoading && openTablesData?.flatMap((g: { tables: PlanTable[] }) => g.tables)
                  .filter((t: PlanTable) => t.currentOrder && t.currentOrder.id !== order.id)
                  .map((t: PlanTable) => (
                    <button key={t.currentOrder!.id}
                      onClick={() => setMoveTargetOrderId(t.currentOrder!.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg border text-sm transition-all",
                        moveTargetOrderId === t.currentOrder!.id
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-border hover:border-sky-300"
                      )}
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">CHF {parseFloat(t.currentOrder!.totalAmount ?? "0").toFixed(2)}</span>
                    </button>
                  ))}
                {!openTablesLoading && (openTablesData?.flatMap((g: { tables: PlanTable[] }) => g.tables).filter((t: PlanTable) => t.currentOrder && t.currentOrder.id !== order.id).length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Keine anderen offenen Tische</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowMoveDialog(false)}>Abbrechen</Button>
              <Button className="flex-1 bg-sky-600 hover:bg-sky-700"
                disabled={selectedMoveItems.length === 0 || !moveTargetOrderId || moveItemsMutation.isPending}
                onClick={() => moveItemsMutation.mutate({ sourceOrderId: order.id, targetOrderId: moveTargetOrderId!, itemIds: selectedMoveItems })}>
                {moveItemsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `${selectedMoveItems.length} Artikel verschieben`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tisch zusammenführen Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5" /> Tisch zusammenführen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border p-3 bg-amber-50 border-amber-200">
              <p className="text-xs text-amber-700 font-medium">Haupttisch: <span className="font-bold">{tableLabel}</span></p>
              <p className="text-xs text-amber-600 mt-1">Alle Artikel des gewählten Tisches werden zu diesem Tisch verschoben.</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Tisch auswählen der zusammengeführt werden soll:</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {openTablesLoading && <p className="text-xs text-muted-foreground text-center py-2">Lade Tische...</p>}
                {!openTablesLoading && openTablesData?.flatMap((g: { tables: PlanTable[] }) => g.tables)
                  .filter((t: PlanTable) => t.currentOrder && t.currentOrder.id !== order.id)
                  .map((t: PlanTable) => (
                    <button key={t.currentOrder!.id}
                      onClick={() => setMoveTargetOrderId(t.currentOrder!.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-lg border text-sm transition-all",
                        moveTargetOrderId === t.currentOrder!.id
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-border hover:border-amber-300"
                      )}
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">{t.currentOrder!.guestCount ?? 0} Gäste · CHF {parseFloat(t.currentOrder!.totalAmount ?? "0").toFixed(2)}</span>
                    </button>
                  ))}
                {!openTablesLoading && (openTablesData?.flatMap((g: { tables: PlanTable[] }) => g.tables).filter((t: PlanTable) => t.currentOrder && t.currentOrder.id !== order.id).length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Keine anderen offenen Tische</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowMergeDialog(false); setMoveTargetOrderId(null); }}>Abbrechen</Button>
              <Button className="flex-1 bg-amber-600 hover:bg-amber-700"
                disabled={!moveTargetOrderId || mergeTablesMutation.isPending}
                onClick={() => mergeTablesMutation.mutate({ masterOrderId: order.id, sourceOrderId: moveTargetOrderId! })}>
                {mergeTablesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zusammenführen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR-Scanner für Gutscheine */}
      {showVoucherScanner && (
        <VoucherScanner
          onScan={(code) => {
            setVoucherCode(code);
            setShowVoucherScanner(false);
          }}
          onClose={() => setShowVoucherScanner(false)}
        />
      )}
    </div>
  );
}

// ─── Floor Styles (same as Designer) ─────────────────────────────────────────
const FLOOR_STYLES: { id: string; color: string }[] = [
  { id: "none", color: "#ffffff" },
  { id: "parkett_hell", color: "#d4a76a" },
  { id: "parkett_dunkel", color: "#8b5e3c" },
  { id: "laminat_grau", color: "#b8b8b8" },
  { id: "laminat_eiche", color: "#c9a96e" },
  { id: "fliesen_weiss", color: "#f0f0f0" },
  { id: "fliesen_grau", color: "#9e9e9e" },
  { id: "fliesen_schwarz", color: "#3a3a3a" },
  { id: "fliesen_terrakotta", color: "#c75b39" },
  { id: "rasen", color: "#4a8c3f" },
  { id: "beton", color: "#8c8c8c" },
  { id: "holz_natur", color: "#a67c52" },
  { id: "marmor_weiss", color: "#e8e4df" },
  { id: "marmor_schwarz", color: "#2d2d2d" },
  { id: "teppich_rot", color: "#8b2020" },
  { id: "teppich_blau", color: "#1e3a5f" },
];

function getFloorStyleCSS(styleId: string): React.CSSProperties {
  const style = FLOOR_STYLES.find(s => s.id === styleId);
  if (!style || styleId === "none") return { backgroundColor: "#ffffff" };
  if (styleId.startsWith("parkett")) {
    return { backgroundColor: style.color, backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 30px, rgba(0,0,0,0.05) 30px, rgba(0,0,0,0.05) 31px), repeating-linear-gradient(0deg, transparent, transparent 120px, rgba(0,0,0,0.08) 120px, rgba(0,0,0,0.08) 121px)` };
  }
  if (styleId.startsWith("fliesen")) {
    return { backgroundColor: style.color, backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`, backgroundSize: "40px 40px" };
  }
  if (styleId === "rasen") {
    return { backgroundColor: style.color, backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)`, backgroundSize: "8px 8px" };
  }
  if (styleId.startsWith("marmor")) {
    return { backgroundColor: style.color, backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.1) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 75%, transparent 75%)`, backgroundSize: "60px 60px" };
  }
  if (styleId.startsWith("laminat") || styleId.startsWith("holz")) {
    return { backgroundColor: style.color, backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(0,0,0,0.04) 60px, rgba(0,0,0,0.04) 61px)` };
  }
  return { backgroundColor: style.color };
}

// ─── Floor Plan Canvas (1:1 identical to Designer) ───────────────────────────
function FloorPlanCanvas({
  plan,
  selectedTableId,
  loadingTableId,
  onTableTap,
}: {
  plan: PlanGroup;
  selectedTableId: number | null;
  loadingTableId: number | null;
  onTableTap: (table: PlanTable) => void;
}) {
  const TABLE_FILL: Record<string, string> = {
    free: "#ffffff",
    occupied: "#fffbeb",
    preparing: "#eff6ff",
    ready: "#faf5ff",
  };
  const TABLE_BORDER: Record<string, string> = {
    free: "#cbd5e1",
    occupied: "#fcd34d",
    preparing: "#93c5fd",
    ready: "#c4b5fd",
  };
  const TABLE_TEXT: Record<string, string> = {
    free: "#1e293b",
    occupied: "#78350f",
    preparing: "#1e3a5f",
    ready: "#4c1d95",
  };

  // Use phone layout if available, otherwise use desktop canvas
  const usePhone = plan.phoneLayout !== null;
  const canvasW = usePhone ? plan.phoneLayout!.canvasWidth : plan.canvasWidth;
  const canvasH = usePhone ? plan.phoneLayout!.canvasHeight : plan.canvasHeight;
  const phonePositions = usePhone ? plan.phoneLayout!.positions : null;

  const posMap = useMemo(() => {
    if (!phonePositions) return null;
    const m = new Map<number, DevicePosition>();
    for (const p of phonePositions) m.set(p.objectId, p);
    return m;
  }, [phonePositions]);

  // ── Zoom / Pan ──────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const computeFit = useCallback((w: number, h: number) => {
    const zoomX = (w - 32) / canvasW;
    const zoomY = (h - 32) / canvasH;
    const fitZoom = Math.min(zoomX, zoomY, 1);
    const scaledW = canvasW * fitZoom;
    const scaledH = canvasH * fitZoom;
    return { zoom: fitZoom, pan: { x: (w - scaledW) / 2, y: (h - scaledH) / 2 } };
  }, [canvasW, canvasH]);

  const doFit = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (!clientWidth || !clientHeight) return;
    const fit = computeFit(clientWidth, clientHeight);
    setZoom(fit.zoom);
    setPan(fit.pan);
  }, [computeFit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let fitted = false;
    const tryFit = () => {
      if (!el) return;
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) {
        const fit = computeFit(clientWidth, clientHeight);
        setZoom(fit.zoom);
        setPan(fit.pan);
        fitted = true;
      }
    };
    tryFit();
    if (!fitted) {
      const observer = new ResizeObserver(() => { if (!fitted) { tryFit(); } });
      observer.observe(el);
      return () => observer.disconnect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.planId, canvasW, canvasH]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-table]")) return;
    isPanning.current = true;
    lastPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    setPan({ x: e.clientX - lastPan.current.x, y: e.clientY - lastPan.current.y });
  }, []);

  const onPointerUp = useCallback(() => { isPanning.current = false; }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", flex: 1, overflow: "hidden", background: "#e2e8f0", borderRadius: 12 }}>
      {/* Zoom controls */}
      <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          onClick={() => setZoom(z => Math.min(3, z + 0.15))}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><ZoomIn size={14} /></button>
        <button
          onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><ZoomOut size={14} /></button>
        <button
          onClick={doFit}
          style={{ width: 32, height: 32, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }}
        ><Maximize2 size={14} /></button>
      </div>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", cursor: "grab", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={handleWheel}
      >
        <div style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: canvasW,
          height: canvasH,
          position: "relative",
          ...getFloorStyleCSS(plan.floorStyle),
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}>
          {plan.tables.map((table: PlanTable) => {
            const pos = posMap?.get(table.id);
            if (posMap && !pos) return null;
            if (pos?.hidden) return null;

            const x = pos ? pos.x : table.x;
            const y = pos ? pos.y : table.y;
            const w = pos ? pos.width : table.width;
            const h = pos ? pos.height : table.height;
            const rot = pos ? pos.rotation : table.rotation;

            const status = getTableStatus(table);
            const isRound = table.objType === "table_round" || table.objType === "table_oval";
            const isLoading = loadingTableId === table.id;
            const isSelected = selectedTableId === table.id;
            const fill = TABLE_FILL[status];
            const border = TABLE_BORDER[status];
            const textColor = TABLE_TEXT[status];
            const order = table.currentOrder;

            return (
              <div key={table.id} data-table="true" style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
                <button
                  onClick={() => onTableTap(table)}
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: rot ? `rotate(${rot}deg)` : undefined,
                    transformOrigin: "center center",
                    background: fill,
                    border: `2px solid ${isSelected ? "#2563eb" : border}`,
                    borderRadius: isRound ? "50%" : 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 4,
                    cursor: "pointer",
                    boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.3)" : "0 1px 3px rgba(0,0,0,0.08)",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                  }}
                >
                  {isLoading && (
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.08)",
                      borderRadius: isRound ? "50%" : 10,
                    }}>
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: textColor }} />
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 11, color: textColor, lineHeight: 1.2, textAlign: "center", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {table.label}
                  </span>
                  <span style={{ fontSize: 9, color: textColor, opacity: 0.7, marginTop: 1 }}>
                    {table.seats}P
                  </span>
                  {order && (
                    <span style={{ fontSize: 8, fontWeight: 600, color: textColor, marginTop: 1 }}>
                      {parseFloat(order.totalAmount ?? "0").toFixed(0)}.-
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main OrderView ───────────────────────────────────────────────────────────
export default function OrderView() {
  const { user } = useAuth();
  const restaurantId = user?.restaurantId;
  const utils = trpc.useUtils();
  const [currentPath, navigate] = useLocation();
  // Offline-Support (fetch-basierter Ping, iOS/Safari-kompatibel)
  const { isOffline: isOfflineNow, isOnline } = useOfflineStatus();
  useOfflineSync(restaurantId ?? undefined);
  // Detect admin vs waiter mode based on route
  const isAdminBetrieb = currentPath.startsWith("/admin/betrieb") || currentPath.startsWith("/admin/order");
  const [selectedTable, setSelectedTable] = useState<PlanTable | null>(null);
  const [currentOrder, setCurrentOrder] = useState<OrderWithItems | null>(null);
  // If URL has ?orderId=X, skip the table view and go directly to menu
  const urlOrderId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("orderId");
    return id ? parseInt(id, 10) : null;
  }, []);
  // Offline-Tisch: wenn ?offlineTable=X gesetzt, direkt zur Menüansicht mit leerer Offline-Bestellung
  const offlineTableParam = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const tableId = params.get("offlineTable");
    const tableType = params.get("offlineType") ?? "table";
    const cachedOrderId = params.get("cachedOrderId");
    return tableId ? { id: parseInt(tableId, 10), sourceType: tableType, cachedOrderId: cachedOrderId ? parseInt(cachedOrderId, 10) : null } : null;
  }, []);
  const [view, setView] = useState<"tables" | "menu" | "order">(urlOrderId || offlineTableParam ? "menu" : "tables");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedTopCategory, setSelectedTopCategory] = useState<number | null>(null);
  // Allergen-Filter: Set von Allergenen die AUSGESCHLOSSEN werden sollen
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());
  const [showAllergenFilter, setShowAllergenFilter] = useState(false);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(true); // always dismissed – hint removed per UX request
  const SETS_VIRTUAL_ID = -999; // Virtuelle ID für Menüs/Sets-Kategorie
  const [showSetsView, setShowSetsView] = useState(false);
  const [configuringSet, setConfiguringSet] = useState<MenuSet | null>(null);
  const [setCourseSelections, setSetCourseSelections] = useState<Record<number, MenuItem[]>>({});
  const [configuringItem, setConfiguringItem] = useState<MenuItem | null>(null);
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  // Badge-Klick-Dialog: zeigt alle Positionen eines Produkts in der aktuellen Bestellung
  const [badgeDialog, setBadgeDialog] = useState<{ item: MenuItem; orderItems: OrderItem[] } | null>(null);

  // ─── Voice Order State ────────────────────────────────────────────────────────
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceInterimText, setVoiceInterimText] = useState<string>("");
  const [voiceElapsedSec, setVoiceElapsedSec] = useState(0);
  const voiceTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceFinalTranscriptRef = React.useRef<string>("");
  const [voiceResult, setVoiceResult] = useState<{
    transcription: string;
    tableNumber: number | null;
    isMultiTable: boolean;
    items: Array<{
      recognizedName: string;
      qty: number;
      comment: string | null;
      course: string | null;
      action: "add" | "remove";
      menuItemId: number | null;
      matchedName: string;
      unitPrice: number;
      itemType: string;
      confidence: number;
      matched: boolean;
    }>;
    groups: Array<{
      tableNumber: number | null;
      items: Array<{
        recognizedName: string;
        qty: number;
        comment: string | null;
        course: string | null;
        action: "add" | "remove";
        menuItemId: number | null;
        matchedName: string;
        unitPrice: number;
        itemType: string;
        confidence: number;
        matched: boolean;
      }>;
    }>;
  } | null>(null);
  const [voiceComments, setVoiceComments] = useState<Record<number, string>>({});
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [manualVoiceTableId, setManualVoiceTableId] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = React.useRef<any>(null);
  // Items die nach dem Tischöffnen automatisch boniert werden
  const pendingVoiceItemsRef = React.useRef<Array<{ menuItemId: number; matchedName: string; unitPrice: number; qty: number; notes?: string }> | null>(null);

  const badgeUpdateQty = trpc.order.updateItemQty.useMutation({
    onSuccess: (data) => {
      setCurrentOrder(data as OrderWithItems);
      // Dialog-Items aktualisieren
      if (badgeDialog) {
        const updated = (data as OrderWithItems).items.filter(
          i => i.productId === badgeDialog.item.id && i.status !== "cancelled"
        );
        if (updated.length === 0) setBadgeDialog(null);
        else setBadgeDialog(prev => prev ? { ...prev, orderItems: updated } : null);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const badgeRemoveItem = trpc.order.removeItem.useMutation({
    onSuccess: (data) => {
      setCurrentOrder(data as OrderWithItems);
      if (badgeDialog) {
        const updated = (data as OrderWithItems).items.filter(
          i => i.productId === badgeDialog.item.id && i.status !== "cancelled"
        );
        if (updated.length === 0) setBadgeDialog(null);
        else setBadgeDialog(prev => prev ? { ...prev, orderItems: updated } : null);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Load order from URL param (e.g. when navigating from waiter table view) ──
  const loadOrderByIdMutation = trpc.order.getOrder.useQuery(
    { orderId: urlOrderId! },
    {
      // Offline: Query deaktivieren damit kein Netzwerkfehler entsteht
      enabled: !!urlOrderId && !isOfflineNow,
      staleTime: 0,
      retry: isOfflineNow ? false : 2,
    }
  );
  useEffect(() => {
    // Nur bei echtem Fehler (nicht offline) zurück zur Tischliste
    if (loadOrderByIdMutation.error && urlOrderId && !isOfflineNow) {
      toast.error("Bestellung konnte nicht geladen werden");
      navigate("/kellner/tables");
    }
  }, [loadOrderByIdMutation.error, urlOrderId, isOfflineNow]);
  useEffect(() => {
    if (loadOrderByIdMutation.data && urlOrderId) {
      setCurrentOrder(prev => {
        // Nur aktualisieren wenn sich die Daten wirklich geändert haben (SSE-Refresh)
        const newData = loadOrderByIdMutation.data as OrderWithItems;
        if (!prev) {
          setView("menu");
          return newData;
        }
        // Items-Anzahl oder Gesamtbetrag hat sich geändert → aktualisieren
        return newData;
      });
      if (!currentOrder) setView("menu");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadOrderByIdMutation.data, urlOrderId]);

  // Offline-Tisch: Offline-Bestellung initialisieren wenn ?offlineTable gesetzt
  useEffect(() => {
    if (offlineTableParam && !currentOrder) {
      const tableId = offlineTableParam.id;
      const sourceType = offlineTableParam.sourceType as 'floor_plan' | 'table';
      const cachedOrderId = offlineTableParam.cachedOrderId;
      // Tisch-Label aus planGroups suchen
      const allObjects = planGroups ? (planGroups as any[]).flatMap((g: any) => g.objects ?? g.tables ?? []) : [];
      const tableObj = allObjects.find((o: any) => o.id === tableId);
      const tableLabel = tableObj?.label ?? tableObj?.name ?? `Tisch ${tableId}`;
      setSelectedTable({ id: tableId, sourceType, label: tableLabel } as unknown as PlanTable);

      // Wenn cachedOrderId gesetzt: Bestellung aus planGroups-Cache laden (Tisch mit bestehender Bestellung)
      if (cachedOrderId && tableObj?.currentOrder) {
        const cachedOrder = tableObj.currentOrder;
        setCurrentOrder({
          id: cachedOrder.id,
          orderNumber: cachedOrder.orderNumber ?? `#${cachedOrder.id}`,
          status: cachedOrder.status ?? 'pending',
          tableId: sourceType === 'floor_plan' ? null : tableId,
          floorPlanObjectId: sourceType === 'floor_plan' ? tableId : null,
          guestCount: cachedOrder.guestCount ?? 0,
          items: cachedOrder.items ?? [],
          payments: [],
          notes: cachedOrder.notes ?? null,
          totalAmount: cachedOrder.totalAmount ?? 0,
          createdAt: new Date(cachedOrder.createdAt ?? Date.now()),
          updatedAt: new Date(),
        } as unknown as OrderWithItems);
        setView('menu');
        return;
      }

      // IndexedDB nach bestehender Offline-Bestellung für diesen Tisch durchsuchen
      import('@/lib/offlineQueue').then(({ getPendingOrders }) => {
        getPendingOrders().then(pending => {
          const existing = pending.find(o =>
            o.sourceType === sourceType &&
            (sourceType === 'floor_plan'
              ? o.floorPlanObjectId === tableId
              : o.tableId === tableId)
          );

          const negId = -(Date.now());
          if (existing && existing.items.length > 0) {
            // Gecachte Items aus IndexedDB wiederherstellen
            const restoredItems = existing.items.map((item, idx) => ({
              id: -(idx + 1),
              productId: item.menuItemId ?? null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.price.toFixed(2),
              totalPrice: (item.price * item.quantity).toFixed(2),
              notes: item.notes ?? null,
              status: 'pending' as const,
              seatNumber: item.seatNumber ?? null,
              course: item.course ?? 1,
              priority: item.priority ?? 'normal',
              itemType: item.itemType ?? 'food',
              selectedVariantName: item.variantLabel ?? null,
              selectedModifiers: (item.modifiers ?? []).map(m => ({ id: m.id, name: m.name, priceAdjustment: m.price })),
            }));
            setCurrentOrder({
              id: negId,
              orderNumber: `OFFLINE-${tableLabel}`,
              status: 'pending',
              tableId: sourceType === 'floor_plan' ? null : tableId,
              floorPlanObjectId: sourceType === 'floor_plan' ? tableId : null,
              guestCount: 0,
              items: restoredItems,
              payments: [],
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as unknown as OrderWithItems);
          } else {
            // Keine gecachten Items – leere Offline-Bestellung
            setCurrentOrder({
              id: negId,
              orderNumber: `OFFLINE-${tableLabel}`,
              status: 'pending',
              tableId: sourceType === 'floor_plan' ? null : tableId,
              floorPlanObjectId: sourceType === 'floor_plan' ? tableId : null,
              guestCount: 0,
              items: [],
              payments: [],
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as unknown as OrderWithItems);
          }
          setView('menu');
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineTableParam]);

  // ─── SSE: Echtzeit-Updates für Tischplan und Bestellungen ────────────────────
  const { status: sseStatus, retryCount: sseRetryCount } = useSSE(restaurantId, {
    channels: ["floor", "order"],
    onEvent: useCallback((event: import("@/hooks/useSSE").SSEEvent) => {
      if (event.type === "floor_update" || event.type === "order_update") {
        utils.order.getTableStatus.invalidate();
      }
      // Wenn ein floor_update für den aktuell geöffneten Tisch kommt und die Bestellung abgeschlossen wurde
      if (event.type === "floor_update" && event.payload && !urlOrderId) {
        const payload = event.payload as { orderId?: number; tableId?: number; floorPlanObjectId?: number; status?: string; action?: string };
        if ((payload.action === "order_closed" || payload.status === "closed") && currentOrder && payload.orderId === currentOrder.id) {
          // Tisch wurde abgeschlossen → zur Tischliste navigieren
          setView("tables");
          setSelectedTable(null);
          setCurrentOrder(null);
        }
      }
      // Wenn ein order_update für die aktuell geöffnete Bestellung kommt → sofort neu laden
      if (event.type === "order_update" && event.payload) {
        const eventOrderId = (event.payload as { orderId?: number }).orderId;
        if (eventOrderId && urlOrderId && eventOrderId === urlOrderId) {
          utils.order.getOrder.invalidate({ orderId: urlOrderId });
        }
      }
    }, [utils, urlOrderId, currentOrder]),
  });

  // ─── Queries ───────────────────────────────────────────────────────────────
  // Offline-Cache für Tischplan
  const FLOOR_PLAN_CACHE_KEY = restaurantId ? `cachedFloorPlan_${restaurantId}` : 'cachedFloorPlan';
  const { data: planGroupsRaw, refetch: refetchTables, isLoading: tablesLoadingRaw } =
    trpc.order.getTableStatus.useQuery(undefined, {
      // Only poll when the tab is visible (saves battery + API calls on idle devices/iPads)
      refetchInterval: () => document.visibilityState === "visible" ? 30_000 : false,
      staleTime: 15_000,
      enabled: !isOfflineNow,
    });

  // Cache successful responses in localStorage
  useEffect(() => {
    if (planGroupsRaw && planGroupsRaw.length > 0) {
      try {
        localStorage.setItem(FLOOR_PLAN_CACHE_KEY, JSON.stringify(planGroupsRaw));
      } catch {
        // localStorage full – ignore
      }
    }
  }, [planGroupsRaw, FLOOR_PLAN_CACHE_KEY]);

  // When offline, load from cache
  const planGroups = isOfflineNow
    ? (() => {
        try {
          const cached = localStorage.getItem(FLOOR_PLAN_CACHE_KEY);
          return cached ? JSON.parse(cached) : undefined;
        } catch {
          return undefined;
        }
      })()
    : planGroupsRaw;

  const tablesLoading = !isOfflineNow && tablesLoadingRaw;

  // Offline-Cache für Menüdaten
  const MENU_CACHE_KEY = restaurantId ? `cachedMenu_${restaurantId}` : 'cachedMenu';
  const { data: menuDataRaw, isLoading: menuLoadingRaw } = trpc.order.getMenuForOrder.useQuery(undefined, {
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Offline: Query deaktivieren damit kein Netzwerkfehler entsteht
    enabled: !isOfflineNow,
  });
  // Menüdaten im localStorage cachen wenn online
  useEffect(() => {
    if (menuDataRaw) {
      try {
        localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(menuDataRaw));
      } catch {
        // localStorage full – ignore
      }
    }
  }, [menuDataRaw, MENU_CACHE_KEY]);
  // Offline: gecachte Menüdaten verwenden
  const menuData = isOfflineNow
    ? (() => {
        try {
          const cached = localStorage.getItem(MENU_CACHE_KEY);
          return cached ? JSON.parse(cached) : undefined;
        } catch {
          return undefined;
        }
      })()
    : menuDataRaw;
  const menuLoading = !isOfflineNow && menuLoadingRaw;

  // Offline-Fallback für urlOrderId: Bestellung aus planGroups-Cache laden
  // (planGroups ist jetzt deklariert, daher hier platziert)
  useEffect(() => {
    if (!isOfflineNow || !urlOrderId || currentOrder) return;
    // Bestellung aus gecachtem Tischplan suchen
    const allTables = (planGroups as any[] ?? []).flatMap((g: any) => g.tables ?? g.objects ?? []);
    const cachedTable = allTables.find((t: any) => t.currentOrder?.id === urlOrderId);
    if (cachedTable?.currentOrder) {
      setCurrentOrder(cachedTable.currentOrder as OrderWithItems);
      setSelectedTable({ id: cachedTable.id, sourceType: cachedTable.sourceType, label: cachedTable.label } as unknown as PlanTable);
      setView('menu');
    } else {
      // Keine gecachte Bestellung gefunden – leere Offline-Bestellung erstellen
      setCurrentOrder({
        id: -(Date.now()),
        orderNumber: `OFFLINE-${urlOrderId}`,
        status: 'pending',
        tableId: null,
        floorPlanObjectId: null,
        guestCount: 0,
        items: [],
        payments: [],
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as OrderWithItems);
      setView('menu');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOfflineNow, urlOrderId, planGroups]);

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const getOrCreateOrder = trpc.order.getOrCreateTableOrder.useMutation({
    onSuccess: (data) => {
      const order = data as OrderWithItems;
      setCurrentOrder(order);
      setView("menu");
      // Sprachbestellung: ausstehende Items bonieren / stornieren
      const pending = pendingVoiceItemsRef.current;
      if (pending && pending.length > 0) {
        pendingVoiceItemsRef.current = null;
        pending.forEach((item) => {
          addItem.mutate({
            orderId: order.id,
            menuItemId: item.menuItemId,
            name: item.matchedName,
            unitPrice: item.unitPrice,
            quantity: item.qty,
            notes: item.notes,
          });
        });
      }
      // Sprachbestellung: ausstehende Stornierungen
      const pendingRemove = (pendingVoiceItemsRef as any).removeItems as Array<{ menuItemId: number; qty: number; matchedName: string }> | undefined;
      if (pendingRemove && pendingRemove.length > 0) {
        delete (pendingVoiceItemsRef as any).removeItems;
        pendingRemove.forEach((item) => {
          removeItemByMenuItemId.mutate({
            orderId: order.id,
            menuItemId: item.menuItemId,
            quantity: item.qty,
          });
        });
      }
    },
        onError: (e) => {
      // Bei Netzwerkfehler: Offline-Fallback – Tisch trotzdem öffnen
      if (isOfflineNow || e.message?.toLowerCase().includes('fetch') || e.message?.toLowerCase().includes('network') || e.message?.toLowerCase().includes('failed')) {
        if (selectedTable) {
          // WICHTIG: Bestehende Items im currentOrder NICHT überschreiben!
          // Wenn bereits Artikel optimistisch hinzugefügt wurden, diese behalten.
          setCurrentOrder(prev => {
            // Falls bereits eine Offline-Bestellung mit Items existiert, diese behalten
            if (prev && prev.id < 0 && prev.items.length > 0) {
              return prev; // Items behalten!
            }
            // Falls eine echte Bestellung existiert (vom Server), diese behalten
            if (prev && prev.id > 0) {
              return prev;
            }
            // Sonst: bestehende Bestellung vom Tisch laden oder neue erstellen
            const existingOrder = (selectedTable as any).currentOrder;
            if (existingOrder && !['paid', 'cancelled'].includes(existingOrder.status)) {
              return existingOrder as OrderWithItems;
            }
            // Neue leere Offline-Bestellung erstellen
            return {
              id: -(Date.now()),
              orderNumber: `OFFLINE-${selectedTable.label ?? selectedTable.id}`,
              status: 'pending',
              tableId: selectedTable.sourceType === 'floor_plan' ? null : selectedTable.id,
              floorPlanObjectId: selectedTable.sourceType === 'floor_plan' ? selectedTable.id : null,
              guestCount: 0,
              items: [],
              payments: [],
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as unknown as OrderWithItems;
          });
          setView('menu');
          // Toast nur beim ersten Mal zeigen (nicht bei jedem Item-Tippen)
          if (!currentOrder || currentOrder.items.length === 0) {
            toast.warning('Offline-Modus: Artikel werden gespeichert und synchronisiert wenn Internet verfügbar ist');
          }
          return;
        }
      }
      toast.error(e.message);
    },
  });
  // ─── Pending-Queue für schnelle Mehrfachklicks (Debounce + Batching) ──────────
  // Key: "name|variant|modifiers|notes" → { totalQty, menuItem, timeout }
  // Der optimistische State wird über einen separaten Ref (optimisticItems) verwaltet,
  // damit setCurrentOrder-Callbacks immer den aktuellen Wert sehen.
  type QueueEntry = { totalQty: number; config: ItemConfig; menuItem?: MenuItem; timeout: ReturnType<typeof setTimeout> };
  const pendingQueue = useRef<Map<string, QueueEntry>>(new Map());
  // Optimistischer Overlay: temporäre Items und Mengenänderungen die noch nicht vom Server bestätigt sind
  const optimisticItems = useRef<Map<string, { tempId: number; qty: number }>>(new Map());

  const addItem = trpc.order.addItem.useMutation({
    onSuccess: (data) => {
      setCurrentOrder(data as OrderWithItems);
    },
    onError: (e, variables) => {
      // Bei Netzwerkfehler: Item in Offline-Queue speichern
      if (isOfflineNow && currentOrder && variables.orderId) {
        const sourceType = selectedTable?.sourceType === 'floor_plan' ? 'floor_plan' : 'table';
        const tableId = sourceType === 'table' ? (selectedTable?.id ?? null) : null;
        const floorPlanObjectId = sourceType === 'floor_plan' ? (selectedTable?.id ?? null) : null;
        addItemToPendingOrder(
          tableId,
          floorPlanObjectId,
          sourceType,
          selectedTable?.label ?? `Tisch ${selectedTable?.id ?? 0}`,
          restaurantId ?? 0,
          {
            menuItemId: (variables.menuItemId ?? 0) as number,
            name: variables.name,
            quantity: Number(variables.quantity),
            price: Number(variables.unitPrice),
            notes: variables.notes ?? undefined,
            modifiers: (variables.modifiers as any) ?? [],
            variantLabel: variables.variantLabel ?? undefined,
            variantPriceAdjust: variables.variantPriceAdjust ?? undefined,
            seatNumber: variables.seatNumber ?? null,
            course: variables.course ?? 1,
            priority: variables.priority ?? 'normal',
            itemType: variables.itemType ?? 'food',
          }
        ).catch(() => {});
        toast.warning('Offline: Artikel wird synchronisiert wenn Internet verfügbar ist');
      } else {
        toast.error(e.message);
      }
    },
  });

  const removeItemByMenuItemId = trpc.order.removeItemByMenuItemId.useMutation();
  // ─── Favoriten-Kacheln (meistbestellte Artikel) ─────────────────────────────
  const { data: topFavorites } = trpc.restaurantAdmin.topFavorites.useQuery(
    { limit: 8, topCategoryId: selectedTopCategory ?? undefined },
    { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const mergeItem = trpc.order.updateItem.useMutation({
    onSuccess: (data) => {
      setCurrentOrder(data as OrderWithItems);
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Voice Order Mutation & Handlers ─────────────────────────────────────
  // Mutation für den fixed Send-Button (im Scope von OrderView, nicht OrderSidebar)
  const printKitchenJobMutationFixed = trpc.printer.createKitchenPrintJob.useMutation();
  const printKitchenOrderFixed = {
    mutate: (input: { orderId: number }) => {
      printKitchenJobMutationFixed.mutateAsync(input).then((data) => {
        if (data.printed === 0) return;
        if ("error" in data && data.error) {
          toast.warning("Küchenbon: Bitte starte die SimplaPOS Local Connect App im Restaurant-WLAN.");
          return;
        }
        toast.success("Küchenbon gesendet – Local Connect App druckt in wenigen Sekunden.");
      }).catch((e: any) => toast.error(`Drucker: ${e?.message}`));
    },
  };
  const sendToKitchenFixed = trpc.order.sendToKitchen.useMutation({
    onSuccess: (data, variables) => {
      toast.success(`Bon ${data.orderNumber} an Küche gesendet`);
      printKitchenOrderFixed.mutate({ orderId: variables.orderId });
      utils.order.getOrder.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const processVoiceOrder = trpc.voiceOrder.processVoiceOrder.useMutation({
    onSuccess: (data) => {
      // Normalize: ensure groups always exist
      const raw = data as any;
      const groups = raw.groups ?? [{ tableNumber: raw.tableNumber ?? null, items: raw.items ?? [] }];
      const normalized = {
        transcription: raw.transcription ?? "",
        tableNumber: raw.tableNumber ?? null,
        isMultiTable: groups.length > 1,
        items: raw.items ?? [],
        groups,
      };
      setVoiceResult(normalized as any);
      setShowVoiceDialog(true);
      setVoiceProcessing(false);
    },
    onError: (e) => {
      toast.error(e.message);
      setVoiceProcessing(false);
    },
  });

  const handleVoiceStart = useCallback(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      toast.error("Spracherkennung wird von diesem Browser nicht unterstützt. Bitte Chrome oder Safari verwenden.");
      return;
    }
    // Verhindert Doppelstart
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.abort();
      speechRecognitionRef.current = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionCtor();
    recognition.lang = "de-CH";
    recognition.interimResults = true;  // Live-Text anzeigen
    recognition.maxAlternatives = 1;
    recognition.continuous = true;  // Läuft bis manuell gestoppt (kein Auto-Stop nach Pause)

    voiceFinalTranscriptRef.current = "";
    setVoiceInterimText("");

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      if (final) voiceFinalTranscriptRef.current += final;
      setVoiceInterimText(interim);
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setVoiceRecording(false);
      setVoiceInterimText("");
      setVoiceElapsedSec(0);
      if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
      const transcript = voiceFinalTranscriptRef.current.trim();
      if (!transcript) {
        toast.error("Keine Sprache erkannt. Bitte deutlicher sprechen.");
        return;
      }
      setVoiceProcessing(true);
      processVoiceOrder.mutate({
        transcription: transcript,
        restaurantId: restaurantId ?? 0,
      });
    };

    recognition.onerror = (event: any) => {
      speechRecognitionRef.current = null;
      setVoiceRecording(false);
      setVoiceInterimText("");
      setVoiceElapsedSec(0);
      if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
      if (event.error === "no-speech") {
        toast.error("Keine Sprache erkannt. Bitte deutlicher sprechen.");
      } else if (event.error === "not-allowed") {
        toast.error("Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.");
      } else if (event.error === "aborted") {
        // Manuell gestoppt – kein Fehler
      } else {
        toast.error(`Sprachfehler: ${event.error}`);
      }
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
    setVoiceRecording(true); // Sofort setzen, nicht auf onstart warten
    // Timer starten
    setVoiceElapsedSec(0);
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceTimerRef.current = setInterval(() => setVoiceElapsedSec(s => s + 1), 1000);
  }, [processVoiceOrder, restaurantId]);

  const handleVoiceStop = useCallback(() => {
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      // Nicht auf null setzen – onend wird noch gefeuert und verarbeitet den Transcript
    }
    setVoiceRecording(false);
    setVoiceInterimText("");
    setVoiceElapsedSec(0);
  }, []);

  const handleVoiceConfirm = useCallback(async () => {
    if (!voiceResult || !currentOrder) return;
    const itemsToAdd = voiceResult.items.filter(i => i.matched && i.menuItemId !== null);
    for (const item of itemsToAdd) {
      // Prüfen ob Item bereits in der Bestellung
      const existing = currentOrder.items.find(
        i => i.productId === item.menuItemId && i.status !== "cancelled"
      );
      if (existing) {
        await mergeItem.mutateAsync({
          orderId: currentOrder.id,
          itemId: existing.id,
          quantity: existing.quantity + item.qty,
        });
      } else {
        await addItem.mutateAsync({
          orderId: currentOrder.id,
          menuItemId: item.menuItemId!,
          name: item.matchedName,
          unitPrice: item.unitPrice,
          quantity: item.qty,
        });
      }
    }
    setShowVoiceDialog(false);
    setVoiceResult(null);
    toast.success(`${itemsToAdd.length} Artikel zur Bestellung hinzugefügt`);
  }, [voiceResult, currentOrder, addItem, mergeItem]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleTableTap = useCallback((table: PlanTable) => {
    setSelectedTable(table);
    // Offline-Fallback: Tisch auch ohne Internet öffnen
    // Wenn offline und der Tisch eine bestehende Bestellung hat, direkt zur Menüansicht
    if (isOfflineNow) {
      // Bestehende Bestellung aus dem Tisch-State nehmen falls vorhanden
      const existingOrder = (table as any).currentOrder;
      if (existingOrder && !['paid', 'cancelled'].includes(existingOrder.status)) {
        setCurrentOrder(existingOrder as OrderWithItems);
      } else {
        // Neue leere Bestellung offline anlegen (wird synchronisiert wenn online)
        setCurrentOrder({
          id: -(Date.now()), // negative ID = offline/lokal
          orderNumber: `OFFLINE-${table.label ?? table.id}`,
          status: 'pending',
          tableId: table.sourceType === 'floor_plan' ? null : table.id,
          floorPlanObjectId: table.sourceType === 'floor_plan' ? table.id : null,
          guestCount: 0,
          items: [],
          payments: [],
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as OrderWithItems);
      }
      setView('menu');
      toast.warning('Offline-Modus: Artikel werden gespeichert und synchronisiert wenn Internet verfügbar ist');
      return;
    }
    if (table.sourceType === "floor_plan") {
      getOrCreateOrder.mutate({ floorPlanObjectId: table.id });
    } else {
      getOrCreateOrder.mutate({ tableId: table.id });
    }
  }, [isOnline]);

  const handleAddItem = useCallback((config: ItemConfig, menuItem?: MenuItem) => {
    if (!currentOrder) return;

    const variantLabel = config.variant ? `${config.variant.groupName}: ${config.variant.optionName}` : null;
    const modifierKey = config.modifiers.map(m => m.name).sort().join(",");
    const notesKey = config.notes?.trim() || "";
    const queueKey = `${config.name}|${variantLabel ?? ""}|${modifierKey}|${notesKey}`;

    // ── Schritt 1: Debounce-Queue aktualisieren ──────────────────────────────────
    const existing = pendingQueue.current.get(queueKey);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.totalQty += config.quantity;
    } else {
      pendingQueue.current.set(queueKey, {
        totalQty: config.quantity,
        config: { ...config },
        menuItem,
        timeout: 0 as unknown as ReturnType<typeof setTimeout>,
      });
    }

    // ── Schritt 2: Optimistisches Update ──────────────────────────────────────
    // Lese aktuellen totalQty direkt aus dem Ref (immer aktuell, kein Closure-Problem)
    const currentTotalQty = pendingQueue.current.get(queueKey)!.totalQty;

    setCurrentOrder(prev => {
      if (!prev) return prev;

      // Suche nach einem vorhandenen Item (echte DB-ID >= 0) oder temporärem Item
      const existingItem = prev.items.find(i => {
        if (i.status === "cancelled" || i.status !== "pending") return false;
        if (i.name !== config.name) return false;
        const iVariant = i.selectedVariantName ?? null;
        if (iVariant !== variantLabel) return false;
        const iModifiers = (i.selectedModifiers ?? []).map((m: { name: string }) => m.name).sort().join(",");
        if (iModifiers !== modifierKey) return false;
        const iNotesClean = (i.notes?.trim() || "").replace(/^[^|]*\|\s*/g, "").trim();
        if (iNotesClean !== notesKey) return false;
        return true;
      });

      if (existingItem) {
        // Wenn das Item bereits optimistisch angepasst wurde, nehmen wir die Basis-Menge
        const serverBaseQty = existingItem.id < 0
          ? 0  // temporäres Item, Menge wird unten gesetzt
          : (optimisticItems.current.has(queueKey) ? optimisticItems.current.get(queueKey)!.qty : existingItem.quantity);
        const newQty = serverBaseQty + currentTotalQty;
        optimisticItems.current.set(queueKey, { tempId: existingItem.id, qty: serverBaseQty });
        return {
          ...prev,
          items: prev.items.map(i =>
            i.id === existingItem.id
              ? { ...i, quantity: newQty, totalPrice: (newQty * parseFloat(i.unitPrice)).toFixed(2) }
              : i
          ),
        };
      } else {
        // Neues temporäres Item anlegen
        const tempId = -(Date.now());
        optimisticItems.current.set(queueKey, { tempId, qty: 0 });
        const newItem: OrderItem = {
          id: tempId,
          productId: menuItem?.id ?? null,
          name: config.name,
          quantity: currentTotalQty,
          unitPrice: config.unitPrice.toFixed(2),
          totalPrice: (config.unitPrice * currentTotalQty).toFixed(2),
          notes: config.notes || null,
          status: "pending",
          seatNumber: config.seatNumber,
          course: config.course,
          priority: config.priority,
          itemType: config.itemType,
          selectedVariantName: variantLabel,
          selectedModifiers: config.modifiers.map(m => ({ id: m.id, name: m.name, priceAdjustment: m.price })),
        };
        return { ...prev, items: [...prev.items, newItem] };
      }
    });

    // ── Schritt 3: Debounced Server-Request ─────────────────────────────────────────
    const entry = pendingQueue.current.get(queueKey)!;
    entry.timeout = setTimeout(() => {
      const finalEntry = pendingQueue.current.get(queueKey);
      if (!finalEntry) return;
      pendingQueue.current.delete(queueKey);
      // Server-Basis-Menge VOR dem Löschen aus optimisticItems lesen
      const savedServerBaseQty = optimisticItems.current.get(queueKey)?.qty ?? null;
      optimisticItems.current.delete(queueKey);

      const finalQty = finalEntry.totalQty;
      const finalConfig = finalEntry.config;

      // Server-State lesen um echte Item-ID zu finden
      setCurrentOrder(prev => {
        if (!prev) return prev;

        // Suche nach echtem Item (ID >= 0, kein temporäres)
        const realItem = prev.items.find(i => {
          if (i.status === "cancelled" || i.status !== "pending") return false;
          if (i.id < 0) return false; // temporäre IDs überspringen
          if (i.name !== finalConfig.name) return false;
          const iVariant = i.selectedVariantName ?? null;
          if (iVariant !== variantLabel) return false;
          const iModifiers = (i.selectedModifiers ?? []).map((m: { name: string }) => m.name).sort().join(",");
          if (iModifiers !== modifierKey) return false;
          const iNotesClean = (i.notes?.trim() || "").replace(/^[^|]*\|\s*/g, "").trim();
          if (iNotesClean !== notesKey) return false;
          return true;
        });

        // Offline-Bestellung (negative ID): direkt in IndexedDB speichern
        if (prev.id < 0) {
          const sourceType = selectedTable?.sourceType === 'floor_plan' ? 'floor_plan' : 'table';
          const tblId = sourceType === 'table' ? (selectedTable?.id ?? null) : null;
          const fpId = sourceType === 'floor_plan' ? (selectedTable?.id ?? null) : null;
          addItemToPendingOrder(
            tblId,
            fpId,
            sourceType,
            selectedTable?.label ?? `Tisch ${selectedTable?.id ?? 0}`,
            restaurantId ?? 0,
            {
              menuItemId: (menuItem?.id ?? 0) as number,
              name: finalConfig.name,
              quantity: finalQty,
              price: finalConfig.unitPrice,
              notes: finalConfig.notes ?? undefined,
              modifiers: finalConfig.modifiers ?? [],
              variantLabel: variantLabel ?? undefined,
              variantPriceAdjust: finalConfig.variant?.priceAdjust,
              seatNumber: finalConfig.seatNumber ?? null,
              course: finalConfig.course ?? 1,
              priority: finalConfig.priority ?? 'normal',
              itemType: finalConfig.itemType ?? 'food',
            }
          ).catch(() => {});
          return prev;
        }

        if (realItem) {
          // Server-Basis-Menge: gespeicherter Wert aus optimisticItems (vor dem Löschen)
          // Falls kein optimistisches Update aktiv war, ist realItem.quantity der echte Server-Wert
          const serverBase = savedServerBaseQty !== null ? savedServerBaseQty : realItem.quantity;
          mergeItem.mutate({
            orderId: prev.id,
            itemId: realItem.id,
            quantity: serverBase + finalQty,
          });
        } else {
          addItem.mutate({
            orderId: prev.id,
            menuItemId: menuItem?.id,
            name: finalConfig.name,
            unitPrice: finalConfig.unitPrice,
            quantity: finalQty,
            modifiers: finalConfig.modifiers,
            variantLabel: variantLabel ?? undefined,
            variantPriceAdjust: finalConfig.variant?.priceAdjust,
            notes: finalConfig.notes || undefined,
            seatNumber: finalConfig.seatNumber ?? undefined,
            course: finalConfig.course,
            priority: finalConfig.priority,
            itemType: finalConfig.itemType,
          });
        }
        return prev;
      });
    }, 300);
  }, [currentOrder]);

  const handleRefreshOrder = useCallback(() => {
    if (!selectedTable) return;
    // Nur Daten neu laden, keine neue Bestellung erstellen
    if (selectedTable.sourceType === "floor_plan") {
      getOrCreateOrder.mutate({ floorPlanObjectId: selectedTable.id });
    } else {
      getOrCreateOrder.mutate({ tableId: selectedTable.id });
    }
    refetchTables();
  }, [selectedTable]);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const activePlan = useMemo(() => {
    if (!planGroups || planGroups.length === 0) return null;
    if (activePlanId !== null) return planGroups.find((g: PlanGroup) => g.planId === activePlanId) ?? planGroups[0];
    return planGroups[0];
  }, [planGroups, activePlanId]);

  // Unterkategorien die zur gewählten Oberkategorie gehören
  const visibleSubCatIds = useMemo(() => {
    if (!menuData?.categories || selectedTopCategory === null) return null;
    return (menuData.categories as MenuCategory[])
      .filter(c => c.topCategoryId === selectedTopCategory)
      .map(c => c.id);
  }, [menuData, selectedTopCategory]);

  const filteredItems = useMemo(() => {
    if (!menuData?.items) return [];
    return menuData.items.filter((item: MenuItem) => {
      const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === null || item.categoryId === selectedCategory;
      // Filter by top category: item must be in a sub-category that belongs to the selected top category
      const matchesTop = visibleSubCatIds === null || (item.categoryId !== null && visibleSubCatIds.includes(item.categoryId));
      // Allergen-Filter: Produkt ausschließen wenn es ein ausgewähltes Allergen enthält
      let matchesAllergen = true;
      if (excludedAllergens.size > 0) {
        const itemAllergens: string[] = Array.isArray(item.allergens)
          ? (item.allergens as string[])
          : (typeof item.allergens === "string" ? JSON.parse(item.allergens) : []);
        matchesAllergen = !itemAllergens.some((a: string) =>
          excludedAllergens.has(a.toLowerCase())
        );
      }
      return matchesSearch && matchesCat && matchesTop && matchesAllergen;
    });
  }, [menuData, searchQuery, selectedCategory, visibleSubCatIds, excludedAllergens]);

  const pendingCount = currentOrder?.items.filter(i => i.status === "pending").length ?? 0;
  const guestCount = currentOrder?.guestCount ?? 0;

  // ─── Render: Tables View ───────────────────────────────────────────────────
  if (view === "tables") {
    const handleSharedTableClick = (table: SharedTableEntry) => {
      // Map SharedTableEntry to PlanTable shape for handleTableTap
      handleTableTap(table as unknown as PlanTable);
    };
    return (
      <div className="flex flex-col h-full bg-background p-4 relative">
        <SharedFloorPlan
          planGroups={(planGroups ?? []) as SharedPlanGroup[]}
          isLoading={tablesLoading}
          isError={false}
          onRefetch={refetchTables}
          sseStatus={sseStatus}
          sseRetryCount={sseRetryCount}
          onTableClick={handleSharedTableClick}
          pendingTableId={getOrCreateOrder.isPending ? (selectedTable?.id ?? null) : null}
          canvasHeight="calc(100dvh - 200px)"
        />
        {/* Voice Order FAB */}
        <button
          onClick={voiceRecording ? handleVoiceStop : handleVoiceStart}
          disabled={voiceProcessing}
          style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
          className={`absolute bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all select-none ${
            voiceRecording
              ? "bg-red-500 scale-110 shadow-red-300"
              : voiceProcessing
              ? "bg-yellow-500"
              : "bg-primary hover:scale-105"
          }`}
          title="Sprachbestellung (antippen zum Starten/Stoppen)"
        >
          {voiceProcessing ? (
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          ) : voiceRecording ? (
            <MicOff className="h-6 w-6 text-white" />
          ) : (
            <Mic className="h-6 w-6 text-white" />
          )}
        </button>
        {/* Live-Transkript-Anzeige */}
        {voiceRecording && (
          <div style={{
            position: "absolute", bottom: 88, right: 12, zIndex: 51,
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
            maxWidth: "85%", pointerEvents: "none",
          }}>
            {/* Timer + Stop-Hinweis */}
            <div style={{
              background: "#dc2626", color: "#fff", borderRadius: 20,
              padding: "5px 12px", fontSize: 12, fontWeight: 700,
              boxShadow: "0 2px 8px rgba(220,38,38,0.4)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block", flexShrink: 0,
                animation: "pulse 1s ease-in-out infinite",
              }} />
              {String(Math.floor(voiceElapsedSec / 60)).padStart(2, "0")}:{String(voiceElapsedSec % 60).padStart(2, "0")}
              &nbsp;· Nochmals tippen zum Stoppen
            </div>
            {/* Live-Transkript */}
            {voiceInterimText && (
              <div style={{
                background: "rgba(0,0,0,0.75)", color: "#fff", borderRadius: 14,
                padding: "5px 12px", fontSize: 13, fontWeight: 500,
                backdropFilter: "blur(4px)",
              }}>
                „{voiceInterimText}“
              </div>
            )}
          </div>
        )}
        {/* Voice Result Dialog – Multi-Tisch, Stornierung, Gänge, Kommentare */}
        {showVoiceDialog && voiceResult && (
          <VoiceOrderConfirmDialog
            open={showVoiceDialog}
            voiceResult={voiceResult as any}
            allTables={(planGroups ?? []).flatMap((g: SharedPlanGroup) => g.tables).map((t: SharedTableEntry) => ({ id: t.id, label: t.label ?? undefined }))}
            onClose={() => { setShowVoiceDialog(false); setVoiceResult(null); setManualVoiceTableId(""); setVoiceComments({}); }}
            onConfirm={async (groups) => {
              const allTables = (planGroups ?? []).flatMap((g: SharedPlanGroup) => g.tables);
              for (const group of groups) {
                if (group.addItems.length === 0 && group.removeItems.length === 0) continue;
                const targetTable = allTables.find((t: SharedTableEntry) => String(t.id) === group.targetTableId);
                if (!targetTable) { toast.error("Tisch nicht gefunden – übersprungen."); continue; }
                if (group.addItems.length > 0) {
                  pendingVoiceItemsRef.current = group.addItems;
                }
                if (group.removeItems.length > 0) {
                  (pendingVoiceItemsRef as any).removeItems = group.removeItems;
                }
                handleTableTap(targetTable as unknown as PlanTable);
                if (groups.length > 1) await new Promise(r => setTimeout(r, 600));
              }
            }}
          />
        )}
      </div>
    );
  }

  // ─── Render: Item Configurator ─────────────────────────────────────────────
  if (configuringItem) {
    return (
      <div className="flex h-full bg-background overflow-hidden">
        <div className="flex-1 flex flex-col">
          <ItemConfigSheet
            item={configuringItem}
            guestCount={guestCount}
            onAdd={(cfg) => handleAddItem(cfg, configuringItem)}
            onClose={() => setConfiguringItem(null)}
          />
        </div>
      </div>
    );
  }

  // ─── Icon-Helper für Oberkategorien ──────────────────────────────────────────
  const TOP_CAT_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
    UtensilsCrossed, GlassWater, Wine, Coffee, ShoppingBag, Star, Layers, Tag, Package, BookOpen, Utensils, Flame, Leaf,
  };
  const getTopCatIcon = (key?: string | null) => TOP_CAT_ICON_MAP[key ?? ""] ?? UtensilsCrossed;

  // ─── Render: Menu + Order View ─────────────────────────────────────────────
  const topCategories: TopCategory[] = (menuData as any)?.topCategories ?? [];
  const hasTopCats = topCategories.length > 0;

  return (
    <>
      {/* Vollbild-Overlay: fixed inset-0 damit DashboardLayout-Scroll keinen Einfluss hat */}
      <div className="fixed inset-0 z-40 flex flex-col bg-background overflow-hidden">
        {/* Offline Banner: kompakter Streifen ganz oben, blockiert keine Navigation */}
        <OfflineBanner />
        {/* Haupt-Inhalt: Sidebar + Content nebeneinander (flex-row) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Oberkategorien-Sidebar (links, sticky – scrollt nie mit) */}
      {hasTopCats && view !== "order" && (
        <aside className="w-[72px] shrink-0 flex flex-col border-r bg-white h-full overflow-y-auto">
          <div className="px-1 py-2 border-b text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Kat.</span>
          </div>
          {topCategories.map((tc) => {
            const Icon = getTopCatIcon(tc.icon);
            const isActive = selectedTopCategory === tc.id;
            return (
              <button
                key={tc.id}
                onClick={() => { setSelectedTopCategory(tc.id); setSelectedCategory(null); }}
                className={cn(
                  "w-full flex flex-col items-center gap-1 py-3 px-1 transition-colors border-b border-l-[3px]",
                  isActive ? "bg-primary/10 border-l-primary" : "hover:bg-muted/40 border-l-transparent"
                )}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: (tc.color ?? "#6366F1") + "22", color: tc.color ?? "#6366F1" }}>
                  <Icon className="w-5 h-5 [color:inherit]" />
                </div>
                <span className={cn("text-[9px] leading-tight text-center line-clamp-2 w-full px-0.5",
                  isActive ? "font-bold text-primary" : "text-muted-foreground")}>
                  {tc.name}
                </span>
              </button>
            );
                    })}
          {/* Menüs/Sets virtueller Eintrag */}
          {((menuData as any)?.menuSets?.length ?? 0) > 0 && (
            <button
              onClick={() => { setSelectedTopCategory(SETS_VIRTUAL_ID); setSelectedCategory(null); setShowSetsView(true); }}
              className={cn(
                "w-full flex flex-col items-center gap-1 py-3 px-1 transition-colors border-b border-l-[3px]",
                selectedTopCategory === SETS_VIRTUAL_ID ? "bg-primary/10 border-l-primary" : "hover:bg-muted/40 border-l-transparent"
              )}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#F59E0B22", color: "#F59E0B" }}>
                <BookOpen className="w-5 h-5" />
              </div>
              <span className={cn("text-[9px] leading-tight text-center line-clamp-2 w-full px-0.5",
                selectedTopCategory === SETS_VIRTUAL_ID ? "font-bold text-primary" : "text-muted-foreground")}>
                Menüs
              </span>
            </button>
          )}
        </aside>
      )}
      {/* Menu Panel */}
      <div className={cn("flex flex-col overflow-hidden min-h-0", view === "order" ? "hidden md:flex md:flex-1" : "flex-1")}>
        {/* ── Kompakte Kopfzeile (sticky, scrollt nie mit) ─────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-2 py-2 border-b bg-background z-10">
          {/* Zurück */}
          <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => {
            if (urlOrderId) {
              navigate("/kellner/tables");
            } else {
              setView("tables");
              setSelectedTable(null);
              setCurrentOrder(null);
            }
          }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          {/* Tischname */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate leading-tight">
              {selectedTable?.label ?? (loadOrderByIdMutation.data as any)?.tableLabel ?? "Tisch"}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{currentOrder?.orderNumber}</div>
          </div>
          {/* Suche Icon-Button */}
          <Popover open={showSearchOverlay} onOpenChange={setShowSearchOverlay}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "relative h-9 w-9 rounded-full flex items-center justify-center transition-colors shrink-0",
                  searchQuery
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                title="Artikel suchen"
              >
                <Search className="h-4 w-4" />
                {searchQuery && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end" sideOffset={6}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Artikel suchen..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 h-9"
                  style={{ fontSize: "16px" }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {/* Allergen-Filter Icon-Button */}
          {(() => {
            const ALLERGEN_LIST = [
              { key: "gluten", label: "Gluten" }, { key: "krebstiere", label: "Krebstiere" },
              { key: "eier", label: "Eier" }, { key: "fisch", label: "Fisch" },
              { key: "erdnüsse", label: "Erdnüsse" }, { key: "soja", label: "Soja" },
              { key: "milch", label: "Milch" }, { key: "schalenfrüchte", label: "Schalenfrüchte" },
              { key: "sellerie", label: "Sellerie" }, { key: "senf", label: "Senf" },
              { key: "sesam", label: "Sesam" }, { key: "schwefeldioxid", label: "SO₂" },
              { key: "lupinen", label: "Lupinen" }, { key: "weichtiere", label: "Weichtiere" },
            ];
            const activeCount = excludedAllergens.size;
            return (
              <Popover open={showAllergenFilter} onOpenChange={setShowAllergenFilter}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "relative h-9 w-9 rounded-full flex items-center justify-center transition-colors shrink-0",
                      activeCount > 0
                        ? "bg-red-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    title="Allergen-Filter"
                  >
                    <Filter className="h-4 w-4" />
                    {activeCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center border-2 border-background">
                        {activeCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="end" sideOffset={6}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-foreground">Allergen-Filter</p>
                    {activeCount > 0 && (
                      <button
                        onClick={() => setExcludedAllergens(new Set())}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Alle löschen
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">Gerichte mit diesen Allergenen ausblenden:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGEN_LIST.map(({ key, label }) => {
                      const isActive = excludedAllergens.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setExcludedAllergens(prev => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all",
                            isActive
                              ? "bg-red-500 text-white border-red-500"
                              : "bg-muted text-muted-foreground border-border hover:border-red-300 hover:text-red-600"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })()}
          {/* Mikrofon-Button */}
          <button
            onClick={voiceRecording ? handleVoiceStop : handleVoiceStart}
            disabled={voiceProcessing}
            style={{ touchAction: "manipulation" }}
            title="Sprachbestellung"
            className={cn(
              "shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-all select-none",
              voiceRecording
                ? "bg-red-500 text-white scale-110"
                : voiceProcessing
                ? "bg-yellow-500 text-white"
                : "bg-primary text-primary-foreground hover:scale-105"
            )}
          >
            {voiceProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : voiceRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          {/* Bon Button (mobile) */}
          <button
            className="md:hidden relative h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0"
            onClick={() => setView("order")}
            title="Bon anzeigen"
          >
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Category Pills – Unterkategorien (sticky, scrollt nie mit) */}
        {(() => {
          const subCats = (menuData?.categories as MenuCategory[] | undefined) ?? [];
          const visibleCats = selectedTopCategory === null
            ? subCats
            : subCats.filter(c => c.topCategoryId === selectedTopCategory);
          if (visibleCats.length === 0) return null;
          return (
            <div className="shrink-0 flex gap-2 px-3 py-2 overflow-x-auto border-b scrollbar-none bg-background">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                  selectedCategory === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                Alle
              </button>
              {visibleCats.map((cat) => {
                const isActive = selectedCategory === cat.id;
                const catColor = cat.color ?? "#6366F1";
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0",
                      isActive ? "shadow-sm scale-105" : "opacity-70 hover:opacity-100"
                    )}
                    style={isActive
                      ? { backgroundColor: catColor, color: "#fff" }
                      : { backgroundColor: catColor + "22", color: catColor, border: `1.5px solid ${catColor}55` }
                    }
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Items Grid – einziger scrollbarer Bereich, Padding-Bottom für fixed Send-Button */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{WebkitOverflowScrolling: 'touch'} as React.CSSProperties}>
          <div className="p-3 pb-48">
            {/* ★ Favoriten-Kacheln (meistbestellte Artikel der letzten 30 Tage) */}
            {topFavorites && topFavorites.length > 0 && !searchQuery && selectedCategory === null && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">★ Favoriten</span>
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {(topFavorites as Array<{productId: number; name: string; unitPrice: number; itemType: string; sales: number}>).map((fav) => {
                    const product = (menuData?.items as MenuItem[] | undefined)?.find((p) => p.id === fav.productId);
                    if (!product) return null;
                    const qty = currentOrder?.items.filter((i: any) => i.productId === fav.productId && i.status === 'pending').reduce((s: number, i: any) => s + i.quantity, 0) ?? 0;
                    return (
                      <button
                        key={fav.productId}
                        onClick={() => handleAddItem({
                          name: product.name,
                          unitPrice: parseFloat(product.price),
                          modifiers: [],
                          variant: null,
                          notes: "",
                          seatNumber: null,
                          course: 1,
                          priority: "normal",
                          itemType: (product.itemType === 'drink' ? 'drink' : product.itemType === 'other' ? 'other' : 'food') as 'food' | 'drink' | 'other',
                          quantity: 1,
                        }, product)}
                        className="shrink-0 flex flex-col items-center gap-1 rounded-xl border bg-card hover:bg-accent active:scale-95 transition-all p-2 w-20 relative"
                        style={{ minWidth: 72 }}
                      >
                        {qty > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{qty}</span>
                        )}
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <span className="text-lg">{fav.itemType === 'drink' ? '🥤' : fav.itemType === 'food' ? '🍽️' : '⭐'}</span>
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight line-clamp-2 w-full">{fav.name}</span>
                        <span className="text-[10px] text-primary font-semibold">CHF {fav.unitPrice.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showSetsView && selectedTopCategory === SETS_VIRTUAL_ID ? (
              // ─── Menüs/Sets-Ansicht ───────────────────────────────────────────
              (() => {
                const sets: MenuSet[] = (menuData as any)?.menuSets ?? [];
                if (sets.length === 0) return (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Keine Menüs konfiguriert</p>
                  </div>
                );
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {sets.map((set) => (
                      <button
                        key={set.id}
                        onClick={() => { setConfiguringSet(set); setSetCourseSelections({}); }}
                        className="rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 active:scale-95 transition-all p-3 text-left"
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                            <BookOpen className="h-4 w-4 text-amber-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-amber-900 truncate">{set.name}</div>
                            {set.description && <div className="text-xs text-amber-700 truncate mt-0.5">{set.description}</div>}
                            <div className="text-xs text-amber-600 mt-1">{set.courses.length} Gänge</div>
                          </div>
                        </div>
                        <div className="mt-2 font-bold text-amber-800 text-base">CHF {parseFloat(set.price).toFixed(2)}</div>
                      </button>
                    ))}
                  </div>
                );
              })()
            ) : (menuLoading || (!!urlOrderId && !currentOrder)) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ChefHat className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Keine Artikel gefunden</p>
              </div>
            ) : (
              <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "5px" }}>
                {filteredItems.map((item: MenuItem) => {
                  const price = parseFloat(item.price);
                  // Sichere Defaults für offline-gecachte Items (könnten undefined sein)
                  const safeVariantGroups = item.variantGroups ?? [];
                  const safeModifierGroups = item.modifierGroups ?? [];
                  const hasOptions = safeVariantGroups.length > 0 || safeModifierGroups.length > 0;
                  // Menge: Summe aller Einheiten dieses Produkts in der aktuellen Bestellung
                  const qty = currentOrder?.items
                    .filter(i => i.productId === item.id && i.status !== "cancelled")
                    .reduce((sum, i) => sum + i.quantity, 0) ?? 0;
                  // Kategorie-Farbe für den farbigen Balken oben
                  const catColor = (() => {
                    const cats = (menuData?.categories as MenuCategory[] | undefined) ?? [];
                    const cat = cats.find(c => c.id === item.categoryId);
                    return cat?.color ?? "#6366F1";
                  })();
                  // Labels aus item.labels
                  const labels = (() => {
                    try { return Array.isArray(item.labels) ? item.labels as string[] : JSON.parse(item.labels as unknown as string ?? "[]"); }
                    catch { return []; }
                  })();
                  // Long-press handlers (closure variables, recreated per render – intentional for simplicity)
                  let lpTimer_: ReturnType<typeof setTimeout> | null = null;
                  let lpVisualTimer_: ReturnType<typeof setTimeout> | null = null;
                  let lpFired_ = false;
                  const handleTilePointerDown_ = (e: React.PointerEvent<HTMLDivElement>) => {
                    if ((e.target as HTMLElement).closest('[data-badge]')) return;
                    lpFired_ = false;
                    // Stabile Referenz auf das DOM-Element sichern (e.currentTarget wird nach Handler-Rückkehr null)
                    const tileEl = e.currentTarget as HTMLDivElement;
                    // Pointer-Capture: Events bleiben auf diesem Element auch wenn Finger sich bewegt
                    try { tileEl.setPointerCapture(e.pointerId); } catch {}
                    // Visuelles Feedback nach 200 ms
                    lpVisualTimer_ = setTimeout(() => {
                      tileEl.style.backgroundColor = catColor + "26";
                    }, 200);
                    // Konfigurator nach 600 ms
                    lpTimer_ = setTimeout(() => {
                      lpFired_ = true;
                      if (lpVisualTimer_) { clearTimeout(lpVisualTimer_); lpVisualTimer_ = null; }
                      tileEl.style.backgroundColor = "";
                      try { navigator.vibrate(50); } catch {}
                      setConfiguringItem(item);
                    }, 600);
                  };
                  const handleTilePointerUp_ = (e: React.PointerEvent<HTMLDivElement>) => {
                    const tileEl2 = e.currentTarget as HTMLDivElement;
                    if (lpTimer_) { clearTimeout(lpTimer_); lpTimer_ = null; }
                    if (lpVisualTimer_) { clearTimeout(lpVisualTimer_); lpVisualTimer_ = null; }
                    tileEl2.style.backgroundColor = "";
                    if (lpFired_) return;
                    if ((e.target as HTMLElement).closest('[data-badge]')) return;
                    handleAddItem({
                      name: item.name,
                      unitPrice: price,
                      modifiers: [],
                      variant: null,
                      notes: "",
                      seatNumber: null,
                      course: 1,
                      priority: "normal",
                      itemType: item.itemType === "beverage" ? "drink" : item.itemType === "other" ? "other" : "food",
                      quantity: 1,
                    }, item);
                  };
                  const handleTilePointerLeave_ = (e: React.PointerEvent<HTMLDivElement>) => {
                    // Bei Pointer-Capture wird pointerLeave nicht gefeuert, aber pointerUp/Cancel schon
                    const tileEl3 = e.currentTarget as HTMLDivElement;
                    if (lpTimer_) { clearTimeout(lpTimer_); lpTimer_ = null; }
                    if (lpVisualTimer_) { clearTimeout(lpVisualTimer_); lpVisualTimer_ = null; }
                    if (tileEl3) tileEl3.style.backgroundColor = "";
                  };
                  return (
                    <div
                      key={item.id}
                      className="relative bg-white border border-slate-200 rounded-lg overflow-hidden select-none"
                      style={{ minHeight: 62, touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer", transition: "border-color 0.1s, box-shadow 0.1s" } as React.CSSProperties}
                      onPointerDown={handleTilePointerDown_}
                      onPointerUp={handleTilePointerUp_}
                      onPointerLeave={handleTilePointerLeave_}
                      onPointerCancel={handleTilePointerLeave_}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {/* Farbiger Balken oben */}
                      <div style={{ height: 3, background: catColor, borderRadius: "6px 6px 0 0" }} />

                      {/* Mengen-Badge oben rechts – Klick öffnet Mengen-Dialog */}
                      {qty > 0 && (
                        <span
                          data-badge="1"
                          className="absolute bottom-1 right-1 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow cursor-pointer hover:scale-110 transition-transform"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!currentOrder) return;
                            const orderItemsForProduct = currentOrder.items.filter(
                              i => i.productId === item.id && i.status !== "cancelled"
                            );
                            setBadgeDialog({ item, orderItems: orderItemsForProduct });
                          }}
                        >
                          {qty}
                        </span>
                      )}

                      {/* Inhalt */}
                      <div className="px-1.5 pb-1.5 pt-1">
                        <p className="font-semibold text-[11px] leading-tight text-slate-800" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.name}</p>
                        <p className="font-bold text-[12px] mt-0.5" style={{ color: catColor }}>CHF {price.toFixed(2)}</p>
                        {(labels.length > 0 || hasOptions) && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {labels.includes("vegetarian") && <span className="text-[9px] px-1 py-0 rounded bg-green-100 text-green-700 font-semibold">Veg</span>}
                            {labels.includes("spicy") && <span className="text-[9px] px-1 py-0 rounded bg-red-100 text-red-600 font-semibold">Scharf</span>}
                            {labels.includes("new") && <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-700 font-semibold">Neu</span>}
                            {hasOptions && <span className="text-[9px] px-1 py-0 rounded bg-slate-100 text-slate-500 font-semibold">Opt.</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            )}
                    </div>
        </div>
        {/* Fixed Send Button – immer am unteren Rand sichtbar, scrollt nie mit */}
        {pendingCount > 0 && (
          <div className="fixed left-0 right-0 z-50 px-3 pb-3 pt-2 bg-gradient-to-t from-background/95 to-transparent pointer-events-none md:hidden" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex gap-2 pointer-events-auto">
              {/* Send-Button links (flex-1) */}
              <Button
                className="flex-1 h-12 font-bold text-base bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-2xl shadow-lg transition-transform"
                onClick={() => {
                  // Haptic Feedback: sofort beim Antippen auslösen (vor dem Netzwerk-Call)
                  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([50, 30, 80]); } catch (_) {}
                  // Direkt senden ohne zur Order-View zu wechseln
                  if (currentOrder) {
                    sendToKitchenFixed.mutate({ orderId: currentOrder.id });
                  } else {
                    setView("order");
                  }
                }}
              >
                <Send className="h-5 w-5 mr-2" />
                {pendingCount} Artikel senden · CHF {currentOrder?.items
                  .filter(i => i.status === "pending")
                  .reduce((s, i) => s + parseFloat(i.totalPrice), 0)
                  .toFixed(2)}
              </Button>
              {/* Undo-Button rechts */}
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-2xl shadow-lg bg-background/90 border-border active:scale-95 transition-transform"
                onClick={() => {
                  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30); } catch (_) {}
                  if (!currentOrder) return;
                  const pendingItems = currentOrder.items.filter(i => i.status === 'pending');
                  if (pendingItems.length === 0) return;
                  // Letzten pending Artikel entfernen
                  const lastItem = pendingItems[pendingItems.length - 1];
                  if (lastItem.quantity > 1) {
                    mergeItem.mutate({ orderId: currentOrder.id, itemId: lastItem.id, quantity: lastItem.quantity - 1 });
                  } else {
                    mergeItem.mutate({ orderId: currentOrder.id, itemId: lastItem.id, quantity: 0 });
                  }
                }}
                title="Letzten Artikel rückgängig"
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Order Sidebar */}
      <div className={cn(
        "flex flex-col border-l bg-background",
        view === "order" ? "flex-1" : "hidden md:flex md:w-[280px] lg:w-[300px]"
      )}>
        {currentOrder ? (
          <OrderSidebar
            order={currentOrder}
            tableLabel={selectedTable?.label ?? "Tisch"}
            onClose={() => {
              if (urlOrderId) {
                navigate("/kellner/tables");
              } else {
                setView("tables");
                setSelectedTable(null);
                setCurrentOrder(null);
              }
            }}
            onRefresh={handleRefreshOrder}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
                </div>
        </div>{/* Ende flex-row Container */}
      </div>{/* Ende fixed-overlay */}
      {/* ─── Menü-Set-Konfigurations-Dialog ───────────────────────────────── */}
      {configuringSet && currentOrder && (
        <Dialog open onOpenChange={(open) => { if (!open) { setConfiguringSet(null); setSetCourseSelections({}); } }}>
          <DialogContent className="max-w-lg max-h-[90dvh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-600" />
                {configuringSet.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Fixpreis: <span className="font-bold text-foreground">CHF {parseFloat(configuringSet.price).toFixed(2)}</span>
                {configuringSet.description && <span className="ml-2 opacity-70">{configuringSet.description}</span>}
              </p>
            </DialogHeader>
            <ScrollArea className="flex-1 -mx-1 px-1">
              <div className="space-y-5 py-2">
                {configuringSet.courses.map((course) => (
                  <div key={course.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-sm">{course.courseNumber}. Gang: {course.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {course.minChoices === course.maxChoices
                          ? `${course.minChoices} wählen`
                          : `${course.minChoices}–${course.maxChoices} wählen`}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {course.items.map((item) => {
                        const isSelected = (setCourseSelections[course.id] ?? []).some(i => i.id === item.id);
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              const current = setCourseSelections[course.id] ?? [];
                              if (isSelected) {
                                setSetCourseSelections(prev => ({ ...prev, [course.id]: current.filter(i => i.id !== item.id) }));
                              } else if (current.length < course.maxChoices) {
                                setSetCourseSelections(prev => ({ ...prev, [course.id]: [...current, item] }));
                              } else if (course.maxChoices === 1) {
                                setSetCourseSelections(prev => ({ ...prev, [course.id]: [item] }));
                              } else {
                                toast.error(`Maximal ${course.maxChoices} Auswahl(en) für diesen Gang`);
                              }
                            }}
                            className={cn(
                              "p-3 rounded-xl border-2 text-left transition-all",
                              isSelected ? "border-amber-500 bg-amber-50 shadow-sm" : "border-border hover:border-amber-300 hover:bg-amber-50/50"
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                              <span className="font-medium text-sm">{item.name}</span>
                            </div>
                            {item.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 pt-3 border-t">
              <Button variant="outline" className="flex-1" onClick={() => { setConfiguringSet(null); setSetCourseSelections({}); }}>Abbrechen</Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  // Pflichtvalidierung
                  for (const course of configuringSet.courses) {
                    const sel = setCourseSelections[course.id] ?? [];
                    if (sel.length < course.minChoices) {
                      toast.error(`Bitte wählen Sie mindestens ${course.minChoices} Gericht(e) für: ${course.courseNumber}. Gang – ${course.name}`);
                      return;
                    }
                  }
                  // Jedes ausgewählte Gericht als eigene Position bonieren
                  const allItems = Object.values(setCourseSelections).flat();
                  if (allItems.length === 0) {
                    // Kein Gang gewählt – Menü als Pauschalposition bonieren
                    handleAddItem({ name: configuringSet.name, unitPrice: parseFloat(configuringSet.price), modifiers: [], variant: null, notes: "", seatNumber: null, course: 1, priority: "normal", itemType: "food", quantity: 1 });
                  } else {
                    allItems.forEach((item, idx) => {
                      handleAddItem({ name: `[${configuringSet.name}] ${item.name}`, unitPrice: idx === 0 ? parseFloat(configuringSet.price) : 0, modifiers: [], variant: null, notes: "", seatNumber: null, course: item.itemType === "drink" ? 1 : 1, priority: "normal", itemType: item.itemType === "beverage" ? "drink" : item.itemType === "other" ? "other" : "food", quantity: 1 });
                    });
                  }
                  setConfiguringSet(null);
                  setSetCourseSelections({});
                  toast.success(`Menü "${configuringSet.name}" boniert`);
                }}
              >
                Menü bonieren – CHF {parseFloat(configuringSet.price).toFixed(2)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Mengen-Dialog (Badge-Klick) ─────────────────────────────────────── */}
      {badgeDialog && currentOrder && (
        <Dialog open onOpenChange={(open) => { if (!open) setBadgeDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">{badgeDialog.item.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-1">
              {badgeDialog.orderItems.map((oi) => (
                <div key={oi.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    disabled={badgeUpdateQty.isPending || badgeRemoveItem.isPending}
                    onClick={() => {
                      if (oi.quantity <= 1) {
                        badgeRemoveItem.mutate({ orderId: currentOrder.id, itemId: oi.id });
                      } else {
                        badgeUpdateQty.mutate({ orderId: currentOrder.id, itemId: oi.id, quantity: oi.quantity - 1 });
                      }
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="font-bold text-sm w-6 text-center">{oi.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    disabled={badgeUpdateQty.isPending}
                    onClick={() => badgeUpdateQty.mutate({ orderId: currentOrder.id, itemId: oi.id, quantity: oi.quantity + 1 })}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="flex-1 text-xs text-muted-foreground truncate">
                    {oi.notes ?? ""}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    disabled={badgeRemoveItem.isPending}
                    onClick={() => badgeRemoveItem.mutate({ orderId: currentOrder.id, itemId: oi.id })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── Voice Order Bestätigungs-Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showVoiceDialog} onOpenChange={(o) => { if (!o) { setShowVoiceDialog(false); setVoiceResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              Sprachbestellung erkannt
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground italic">
              „{voiceResult?.transcription}“
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {voiceResult?.tableNumber && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hash className="h-4 w-4" />
                <span>Tisch <strong>{voiceResult.tableNumber}</strong> erkannt</span>
              </div>
            )}
            {voiceResult?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Keine Artikel erkannt. Bitte erneut versuchen.</p>
            ) : (
              <div className="space-y-1">
                {voiceResult?.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                      item.matched
                        ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.matched ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium">{item.matchedName}</p>
                        {!item.matched && (
                          <p className="text-xs text-muted-foreground">Erkannt: „{item.recognizedName}“ – nicht in Speisekarte</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.qty}×</span>
                      {item.matched && (
                        <span className="text-xs text-muted-foreground">CHF {item.unitPrice.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowVoiceDialog(false); setVoiceResult(null); }}>
              Abbrechen
            </Button>
            <Button
              onClick={handleVoiceConfirm}
              disabled={!voiceResult?.items.some(i => i.matched)}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {voiceResult?.items.filter(i => i.matched).length ?? 0} Artikel bonieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
