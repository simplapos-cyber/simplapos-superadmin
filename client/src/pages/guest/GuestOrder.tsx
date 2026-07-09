/**
 * GuestOrder – Öffentliche Gast-Bestellseite
 *
 * Aufruf via: /guest/order/:token
 *
 * Ablauf:
 * 1. Token aus URL lesen
 * 2. Session-Info laden (Tischname, Restaurant)
 * 3. Speisekarte anzeigen (mit Allergen-Filter + Nährwerte)
 * 4. Warenkorb verwalten
 * 5. Bestellung abschicken → SSE-Event an Küche/Bar
 */
import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle, AlertCircle,
  UtensilsCrossed, ChevronDown, ChevronUp, AlertTriangle, Flame, Gift, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CartItem = {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string;
  itemType: "food" | "drink" | "other";
};

// ─── Konstanten ───────────────────────────────────────────────────────────────

const ALLERGEN_LIST = [
  { key: "gluten", label: "Gluten" },
  { key: "krebstiere", label: "Krebstiere" },
  { key: "eier", label: "Eier" },
  { key: "fisch", label: "Fisch" },
  { key: "erdnüsse", label: "Erdnüsse" },
  { key: "soja", label: "Soja" },
  { key: "milch", label: "Milch" },
  { key: "schalenfrüchte", label: "Schalenfrüchte" },
  { key: "sellerie", label: "Sellerie" },
  { key: "senf", label: "Senf" },
  { key: "sesam", label: "Sesam" },
  { key: "schwefeldioxid", label: "SO₂" },
  { key: "lupinen", label: "Lupinen" },
  { key: "weichtiere", label: "Weichtiere" },
];

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function parseAllergens(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GuestOrder() {
  const [, params] = useRoute("/guest/order/:token");
  const token = params?.token ?? "";

  const [cart, setCart] = useState<CartItem[]>([]);
  const [guestNotes, setGuestNotes] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  // Allergen-Filter
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(new Set());
  const [showAllergenFilter, setShowAllergenFilter] = useState(false);

  // Nährwert-Aufklapp-State (pro Produkt-ID)
  const [expandedNutrition, setExpandedNutrition] = useState<Set<number>>(new Set());

  // Gift-Card-Kauf-Dialog
  const [showGiftCardDialog, setShowGiftCardDialog] = useState(false);
  const [gcAmount, setGcAmount] = useState<number>(50);
  const [gcCustomAmount, setGcCustomAmount] = useState("");
  const [gcRecipientName, setGcRecipientName] = useState("");
  const [gcBuyerEmail, setGcBuyerEmail] = useState("");
  const [gcMessage, setGcMessage] = useState("");

  // ─── Queries ───────────────────────────────────────────────────────────────

  const sessionQuery = trpc.qrOrder.getSessionByToken.useQuery(
    { token },
    { enabled: token.length === 64, retry: false }
  );

  const menuQuery = trpc.qrOrder.guestGetMenu.useQuery(
    { token },
    { enabled: token.length === 64 && !sessionQuery.isError, retry: false }
  );

  const submitOrder = trpc.qrOrder.guestSubmitOrder.useMutation({
    onSuccess: () => {
      setOrderSuccess(true);
      setCart([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const purchaseGiftCard = trpc.voucher.createGiftCardPurchaseSession.useMutation({
    onSuccess: ({ checkoutUrl }) => {
      window.location.href = checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });


  // ─── Cart helpers ──────────────────────────────────────────────────────────

  const cartTotal = useMemo(() => cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);

  function addToCart(item: { id: number; name: string; price: string; itemType: string }) {
    const itemType = (["food", "drink", "other"].includes(item.itemType) ? item.itemType : "food") as "food" | "drink" | "other";
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.id);
      if (existing) {
        return prev.map((c) => c.productId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        productId: item.id,
        name: item.name,
        quantity: 1,
        unitPrice: parseFloat(item.price),
        notes: "",
        itemType,
      }];
    });
    toast.success(`${item.name} hinzugefügt`);
  }

  function updateQuantity(productId: number, delta: number) {
    setCart((prev) => {
      const updated = prev.map((c) =>
        c.productId === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c
      );
      return updated.filter((c) => c.quantity > 0);
    });
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }

  function toggleAllergen(key: string) {
    setExcludedAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleNutrition(id: number) {
    setExpandedNutrition((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    if (cart.length === 0) return;
    submitOrder.mutate({
      token,
      items: cart.map((c) => ({
        productId: c.productId,
        name: c.name,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        notes: c.notes || undefined,
        itemType: c.itemType,
      })),
      guestNotes: guestNotes || undefined,
    });
  }

  // ─── Render states ─────────────────────────────────────────────────────────

  if (token.length !== 64) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">Ungültiger QR-Code</h1>
          <p className="text-muted-foreground">Bitte scannen Sie den QR-Code am Tisch erneut.</p>
        </div>
      </div>
    );
  }

  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-screen p-4 space-y-4 max-w-lg mx-auto">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-3/4" />
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">QR-Code ungültig</h1>
          <p className="text-muted-foreground text-sm">{sessionQuery.error.message}</p>
        </div>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold">Bestellung aufgegeben!</h1>
          <p className="text-muted-foreground">
            Ihre Bestellung wurde an die Küche weitergeleitet. Wir bereiten alles für Sie vor.
          </p>
          <p className="text-sm font-medium">Tisch: {sessionQuery.data?.tableLabel}</p>
          <Button onClick={() => setOrderSuccess(false)} variant="outline" className="w-full">
            Weitere Bestellung aufgeben
          </Button>
        </div>
      </div>
    );
  }

  const session = sessionQuery.data!;
  const categories = menuQuery.data?.categories ?? [];
  const allItems = menuQuery.data?.items ?? [];

  type MenuCat = typeof categories[number];
  type MenuItm = typeof allItems[number];

  const filteredCategories = categories.filter((cat: MenuCat) =>
    allItems.some((item: MenuItm) => item.categoryId === cat.id)
  );

  const displayCategory = activeCategory ?? filteredCategories[0]?.id ?? null;

  // Allergen-Filter anwenden
  const displayItems = allItems.filter((item: MenuItm) => {
    if (displayCategory && item.categoryId !== displayCategory) return false;
    if (excludedAllergens.size > 0) {
      const itemAllergens = parseAllergens((item as any).allergens);
      if (itemAllergens.some((a: string) => excludedAllergens.has(a.toLowerCase()))) return false;
    }
    return true;
  });

  const allergenActiveCount = excludedAllergens.size;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{session.restaurantName}</p>
            <h1 className="font-bold text-lg leading-tight">Tisch {session.tableLabel}</h1>
          </div>
          {/* Cart button */}
          <Button
            variant={cartCount > 0 ? "default" : "outline"}
            size="sm"
            className="relative"
            onClick={() => setShowCart(!showCart)}
          >
            <ShoppingCart className="h-4 w-4 mr-1.5" />
            {cartCount > 0 ? (
              <span>{cartCount} · {session.currency} {cartTotal.toFixed(2)}</span>
            ) : (
              <span>Warenkorb</span>
            )}
          </Button>
        </div>

        {/* Category tabs */}
        {filteredCategories.length > 0 && !showCart && (
          <div className="flex gap-2 overflow-x-auto pb-1 mt-2 scrollbar-none">
            {filteredCategories.map((cat: MenuCat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  displayCategory === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart view */}
      {showCart ? (
        <div className="flex-1 p-4 space-y-4">
          <h2 className="font-bold text-lg">Ihre Bestellung</h2>

          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>Ihr Warenkorb ist leer</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowCart(false)}>
                Zur Speisekarte
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{session.currency} {item.unitPrice.toFixed(2)} / Stk.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(item.productId, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(item.productId, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removeFromCart(item.productId)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Anmerkungen (optional)</label>
                <Textarea
                  placeholder="z.B. Allergien, Wünsche…"
                  value={guestNotes}
                  onChange={(e) => setGuestNotes(e.target.value)}
                  rows={2}
                  className="text-base"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between font-bold text-lg">
                <span>Gesamt</span>
                <span>{session.currency} {cartTotal.toFixed(2)}</span>
              </div>

              <Button
                className="w-full h-12 text-base"
                onClick={handleSubmit}
                disabled={submitOrder.isPending}
              >
                {submitOrder.isPending ? "Wird gesendet…" : "Jetzt bestellen"}
              </Button>
            </>
          )}
        </div>
      ) : (
        /* Menu view */
        <div className="flex-1 flex flex-col">
          {/* ── Allergen-Filter ────────────────────────────────────────────── */}
          <div className="border-b">
            <button
              onClick={() => setShowAllergenFilter((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 w-full text-left text-sm font-medium transition-colors",
                allergenActiveCount > 0
                  ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Allergen-Filter
                {allergenActiveCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                    {allergenActiveCount}
                  </span>
                )}
              </span>
              <span className="ml-auto opacity-50">
                {showAllergenFilter ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {showAllergenFilter && (
              <div className="px-4 pb-3 pt-1 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">
                  Gerichte mit diesen Allergenen ausblenden:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ALLERGEN_LIST.map(({ key, label }) => {
                    const isActive = excludedAllergens.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => toggleAllergen(key)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          isActive
                            ? "bg-red-500 text-white border-red-500"
                            : "bg-background text-muted-foreground border-border hover:border-red-300 hover:text-red-600"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {allergenActiveCount > 0 && (
                    <button
                      onClick={() => setExcludedAllergens(new Set())}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground transition-all"
                    >
                      Alle löschen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Artikel-Liste ──────────────────────────────────────────────── */}
          <div className="flex-1 p-4 space-y-3">
            {menuQuery.isLoading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            )}

            {!menuQuery.isLoading && displayItems.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <UtensilsCrossed className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>
                  {allergenActiveCount > 0
                    ? "Keine Artikel ohne die gewählten Allergene gefunden"
                    : "Keine Artikel verfügbar"}
                </p>
                {allergenActiveCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setExcludedAllergens(new Set())}
                  >
                    Filter zurücksetzen
                  </Button>
                )}
              </div>
            )}

            {displayItems.map((item: MenuItm) => {
              const inCart = cart.find((c) => c.productId === item.id);
              const itemAllergens = parseAllergens((item as any).allergens);
              const cal = (item as any).calories;
              const prot = (item as any).protein;
              const carbs = (item as any).carbs;
              const fat = (item as any).fat;
              const hasNutrition = cal != null || prot != null || carbs != null || fat != null;
              const isNutritionExpanded = expandedNutrition.has(item.id);

              return (
                <div
                  key={item.id}
                  className="border rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3 p-3">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-16 w-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-bold text-sm">{session.currency} {parseFloat(item.price).toFixed(2)}</span>
                        {item.labels && Array.isArray(item.labels) && (item.labels as string[]).map((label) => (
                          <Badge key={label} variant="outline" className="text-[10px] py-0 h-4">{label}</Badge>
                        ))}
                      </div>

                      {/* Allergen-Badges */}
                      {itemAllergens.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {itemAllergens.map((a: string) => (
                            <span
                              key={a}
                              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Nährwert-Toggle */}
                      {hasNutrition && (
                        <button
                          onClick={() => toggleNutrition(item.id)}
                          className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Flame className="h-3 w-3 text-orange-400" />
                          {cal != null ? `${cal} kcal` : "Nährwerte"}
                          {isNutritionExpanded
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />}
                        </button>
                      )}

                      {/* Nährwert-Details (aufgeklappt) */}
                      {hasNutrition && isNutritionExpanded && (
                        <div className="flex gap-2 mt-1.5 flex-wrap">
                          {cal != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-medium">
                              🔥 {cal} kcal
                            </span>
                          )}
                          {prot != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-medium">
                              Eiweiß {prot}g
                            </span>
                          )}
                          {carbs != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                              Kohlenhydrate {carbs}g
                            </span>
                          )}
                          {fat != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-950/30 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-medium">
                              Fett {fat}g
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Warenkorb-Steuerung */}
                    <div className="flex-shrink-0">
                      {inCart ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                            onClick={() => updateQuantity(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-5 text-center text-sm font-bold">{inCart.quantity}</span>
                          <Button size="sm" className="h-8 w-8 p-0"
                            onClick={() => updateQuantity(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" className="h-8 w-8 p-0"
                          onClick={() => addToCart({ id: item.id, name: item.name, price: item.price, itemType: item.itemType })}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Geschenkkarten-Banner */}
      {!showCart && (
        <div className="mx-4 mb-4 mt-2">
          <button
            onClick={() => setShowGiftCardDialog(true)}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-[0.98] text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Geschenkkarte kaufen</p>
              <p className="text-white/70 text-xs mt-0.5">Perfektes Geschenk für jeden Anlass</p>
            </div>
            <span className="text-white/60 text-lg">›</span>
          </button>
        </div>
      )}

      {/* Geschenkkarten-Kauf-Dialog */}
      <Dialog open={showGiftCardDialog} onOpenChange={setShowGiftCardDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-purple-600" />
              Geschenkkarte kaufen
            </DialogTitle>
            <DialogDescription>
              Kaufe eine Geschenkkarte für {session?.restaurantName ?? "das Restaurant"} und schenke Freude.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Betrag-Auswahl */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Betrag (CHF)</Label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[20, 50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => { setGcAmount(amt); setGcCustomAmount(""); }}
                    className={cn(
                      "py-2 rounded-lg text-sm font-semibold border-2 transition-all",
                      gcAmount === amt && !gcCustomAmount
                        ? "border-purple-600 bg-purple-50 text-purple-700"
                        : "border-border bg-background text-foreground hover:border-purple-300"
                    )}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Anderer Betrag (5–500)"
                value={gcCustomAmount}
                onChange={(e) => {
                  setGcCustomAmount(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setGcAmount(v);
                }}
                min={5}
                max={500}
                className="text-sm"
              />
            </div>

            {/* Empfänger */}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Für wen? <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="Name des Empfängers"
                value={gcRecipientName}
                onChange={(e) => setGcRecipientName(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Persönliche Nachricht */}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Nachricht <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="z.B. Herzlichen Glückwunsch!"
                value={gcMessage}
                onChange={(e) => setGcMessage(e.target.value)}
                maxLength={100}
                className="text-sm"
              />
            </div>

            {/* Käufer-E-Mail */}
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Deine E-Mail <span className="text-muted-foreground font-normal">(für Bestätigung)</span></Label>
              <Input
                type="email"
                placeholder="deine@email.ch"
                value={gcBuyerEmail}
                onChange={(e) => setGcBuyerEmail(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Kaufen-Button */}
            <Button
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
              disabled={purchaseGiftCard.isPending || gcAmount < 5 || gcAmount > 500}
              onClick={() => {
                const restaurantId = session?.restaurantId;
                if (!restaurantId) return;
                purchaseGiftCard.mutate({
                  restaurantId,
                  amount: gcAmount,
                  origin: window.location.origin,
                  recipientName: gcRecipientName || undefined,
                  buyerEmail: gcBuyerEmail || undefined,
                  message: gcMessage || undefined,
                });
              }}
            >
              {purchaseGiftCard.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Weiterleitung...</>
              ) : (
                <><Gift className="h-4 w-4 mr-2" /> CHF {gcAmount.toFixed(2)} – Jetzt kaufen</>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Sichere Zahlung via Stripe · 3 Jahre gültig
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticky cart bar */}
      {cartCount > 0 && !showCart && (
        <div className="sticky bottom-0 p-4 bg-background border-t">
          <Button className="w-full h-12 text-base" onClick={() => setShowCart(true)}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            {cartCount} Artikel · {session.currency} {cartTotal.toFixed(2)} – Warenkorb ansehen
          </Button>
        </div>
      )}
    </div>
  );
}
