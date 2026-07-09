import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Gift,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Pencil,
  Ban,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Percent,
  Banknote,
  Tag,
  Printer,
  Wallet,
} from "lucide-react";
import { VoucherPrintView } from "@/components/VoucherPrintView";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ExternalLink, QrCode, Download, Link2 } from "lucide-react";
import { ModuleGate } from "@/components/ModuleGate";

// ─── Types ────────────────────────────────────────────────────────────────────

type VoucherStatus = "active" | "redeemed" | "partially_redeemed" | "expired" | "cancelled";

const STATUS_CONFIG: Record<VoucherStatus, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: "Aktiv", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  redeemed: { label: "Eingelöst", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle },
  partially_redeemed: { label: "Teilweise", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Clock },
  expired: { label: "Abgelaufen", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
  cancelled: { label: "Storniert", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new Date(d), "dd.MM.yyyy", { locale: de });
}

function fmtCHF(v: string | number | null | undefined) {
  if (v == null) return "—";
  return `CHF ${parseFloat(String(v)).toFixed(2)}`;
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateVoucherDialog({ open, onClose, onCreated, defaultCategory = "discount" }: { open: boolean; onClose: () => void; onCreated: () => void; defaultCategory?: "discount" | "gift_card" }) {
  const [category, setCategory] = useState<"discount" | "gift_card">(defaultCategory);
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<"cash" | "card" | "twint">("cash");
  const [form, setForm] = useState({
    type: "fixed" as "fixed" | "percent",
    value: "",
    minOrderValue: "",
    maxDiscount: "",
    issuedTo: "",
    note: "",
    validFrom: format(new Date(), "yyyy-MM-dd"),
    validUntil: "",
    maxUses: "",
    customCode: "",
    codePrefix: "",
    quantity: "1",
  });

  const createMutation = trpc.voucher.create.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.created.length} Gutschein${data.created.length > 1 ? "e" : ""} erstellt`);
      if (data.created.length === 1) {
        toast.info(`Code: ${data.created[0]?.code}`, { duration: 8000 });
      }
      onCreated();
      onClose();
      setForm({
        type: "fixed", value: "", minOrderValue: "", maxDiscount: "",
        issuedTo: "", note: "", validFrom: format(new Date(), "yyyy-MM-dd"),
        validUntil: "", maxUses: "", customCode: "", codePrefix: "", quantity: "1",
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const qty = parseInt(form.quantity) || 1;

  function handleSubmit() {
    if (!form.value || parseFloat(form.value) <= 0) {
      toast.error("Bitte einen gültigen Wert eingeben");
      return;
    }
    createMutation.mutate({
      category,
      type: category === "gift_card" ? "fixed" : form.type,
      value: parseFloat(form.value),
      minOrderValue: form.minOrderValue ? parseFloat(form.minOrderValue) : undefined,
      maxDiscount: form.maxDiscount ? parseFloat(form.maxDiscount) : undefined,
      issuedTo: form.issuedTo || undefined,
      note: form.note || undefined,
      validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : new Date().toISOString(),
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : undefined,
      maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
      customCode: qty === 1 && form.customCode ? form.customCode : undefined,
      codePrefix: form.codePrefix || undefined,
      quantity: qty,
      purchasePaymentMethod: category === "gift_card" ? purchasePaymentMethod : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-600" />
            Neuer Gutschein
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Kategorie */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCategory("gift_card")}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all ${category === "gift_card" ? "border-purple-500 bg-purple-50" : "border-border hover:border-purple-300"}`}
            >
              <Gift className={`h-5 w-5 ${category === "gift_card" ? "text-purple-600" : "text-muted-foreground"}`} />
              <span className="text-sm font-semibold">Geschenkkarte</span>
              <span className="text-xs text-muted-foreground">Kunden kaufen als Geschenk</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory("discount")}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all ${category === "discount" ? "border-purple-500 bg-purple-50" : "border-border hover:border-purple-300"}`}
            >
              <Tag className={`h-5 w-5 ${category === "discount" ? "text-purple-600" : "text-muted-foreground"}`} />
              <span className="text-sm font-semibold">Rabatt-Gutschein</span>
              <span className="text-xs text-muted-foreground">Marketing, Aktionen</span>
            </button>
          </div>

          {/* Typ (nur für Rabatt) */}
          {category === "discount" && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: "fixed" }))}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${form.type === "fixed" ? "border-purple-500 bg-purple-50" : "border-border hover:border-purple-300"}`}
            >
              <Banknote className={`h-6 w-6 ${form.type === "fixed" ? "text-purple-600" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">Betrag (CHF)</span>
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: "percent" }))}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${form.type === "percent" ? "border-purple-500 bg-purple-50" : "border-border hover:border-purple-300"}`}
            >
              <Percent className={`h-6 w-6 ${form.type === "percent" ? "text-purple-600" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">Prozent (%)</span>
            </button>
          </div>
          )}

          {/* Wert */}
          <div>
            <Label>Wert {form.type === "fixed" ? "(CHF)" : "(%)"} *</Label>
            <Input
              type="number"
              min="0.01"
              step={form.type === "fixed" ? "0.01" : "1"}
              max={form.type === "percent" ? "100" : undefined}
              placeholder={form.type === "fixed" ? "25.00" : "10"}
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              className="mt-1"
            />
          </div>

          {/* Bedingungen (nur für Rabatt) */}
          {category === "discount" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mindestbestellwert (CHF)</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={form.minOrderValue}
                onChange={e => setForm(f => ({ ...f, minOrderValue: e.target.value }))}
                className="mt-1"
              />
            </div>
            {form.type === "percent" && (
              <div>
                <Label className="text-xs">Max. Rabatt (CHF)</Label>
                <Input
                  type="number" min="0" step="0.01" placeholder="Unbegrenzt"
                  value={form.maxDiscount}
                  onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                  className="mt-1"
                />
              </div>
            )}
          </div>
          )}

          {/* Zahlungsart beim Kauf (nur Geschenkkarte) */}
          {category === "gift_card" && (
            <div>
              <Label className="text-sm font-medium">Zahlungsart beim Kauf *</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {(["cash", "card", "twint"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPurchasePaymentMethod(method)}
                    className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 transition-all text-sm font-medium ${
                      purchasePaymentMethod === method
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-border hover:border-purple-300 text-muted-foreground"
                    }`}
                  >
                    <span className="text-lg">{method === "cash" ? "💵" : method === "card" ? "💳" : "📱"}</span>
                    <span>{method === "cash" ? "Bar" : method === "card" ? "Karte" : "Twint"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empfänger */}
          <div>
            <Label>{category === "gift_card" ? "Empfänger (Name / E-Mail)" : "Ausgestellt für (Name / E-Mail)"}</Label>
            <Input
              placeholder="Max Mustermann"
              value={form.issuedTo}
              onChange={e => setForm(f => ({ ...f, issuedTo: e.target.value }))}
              className="mt-1"
            />
          </div>

          {/* Gültigkeit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Gültig ab *</Label>
              <Input
                type="date"
                value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Gültig bis (leer = unbegrenzt)</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          {/* Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Eigener Code (optional)</Label>
              <Input
                placeholder="SOMMER25"
                value={form.customCode}
                onChange={e => setForm(f => ({ ...f, customCode: e.target.value.toUpperCase() }))}
                className="mt-1 font-mono"
                disabled={qty > 1}
              />
            </div>
            <div>
              <Label className="text-xs">Code-Präfix (optional)</Label>
              <Input
                placeholder="VIP"
                value={form.codePrefix}
                onChange={e => setForm(f => ({ ...f, codePrefix: e.target.value.toUpperCase() }))}
                className="mt-1 font-mono"
              />
            </div>
          </div>

          {/* Bulk + Max-Uses */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Anzahl Gutscheine</Label>
              <Input
                type="number" min="1" max="100"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max. Einlösungen (leer = unbegrenzt)</Label>
              <Input
                type="number" min="1"
                value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>

          {/* Notiz */}
          <div>
            <Label className="text-xs">Interne Notiz</Label>
            <Textarea
              placeholder="Notiz für interne Zwecke..."
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="mt-1 resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {createMutation.isPending ? "Erstelle..." : qty > 1 ? `${qty} ${category === "gift_card" ? "Geschenkkarten" : "Gutscheine"} erstellen` : category === "gift_card" ? "Geschenkkarte erstellen" : "Gutschein erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function VoucherDetailDialog({ voucherId, onClose, onUpdated }: { voucherId: number; onClose: () => void; onUpdated: () => void }) {
  const { data, isLoading, refetch } = trpc.voucher.get.useQuery({ id: voucherId });
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ issuedTo: "", note: "", validUntil: "", maxUses: "" });
  const [editAllowedRestaurantIds, setEditAllowedRestaurantIds] = useState<number[]>([]);
  const [showPrint, setShowPrint] = useState(false);
  const [, navigate] = useLocation();
  const { data: qrData } = trpc.voucher.getQrCode.useQuery({ id: voucherId });
  const { data: allRestaurants } = trpc.restaurants.list.useQuery({});

  const updateMutation = trpc.voucher.update.useMutation({
    onSuccess: () => { toast.success("Gutschein aktualisiert"); setEditing(false); refetch(); onUpdated(); },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.voucher.update.useMutation({
    onSuccess: () => { toast.success("Gutschein storniert"); refetch(); onUpdated(); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data) return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent><div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div></DialogContent>
    </Dialog>
  );

  const { voucher, redemptions } = data;
  const statusCfg = STATUS_CONFIG[voucher.status as VoucherStatus] ?? STATUS_CONFIG.active;

  function startEdit() {
    setEditForm({
      issuedTo: voucher.issuedTo ?? "",
      note: voucher.note ?? "",
      validUntil: voucher.validUntil ? format(new Date(voucher.validUntil), "yyyy-MM-dd") : "",
      maxUses: voucher.maxUses != null ? String(voucher.maxUses) : "",
    });
    try {
      const ids = voucher.allowedRestaurantIds ? JSON.parse(voucher.allowedRestaurantIds) : [];
      setEditAllowedRestaurantIds(Array.isArray(ids) ? ids : []);
    } catch { setEditAllowedRestaurantIds([]); }
    setEditing(true);
  }

  return (
    <>
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-600" />
            Gutschein Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Code + Status */}
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Code</p>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg tracking-widest">{voucher.code}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(voucher.code); toast.success("Code kopiert"); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Badge className={`${statusCfg.color} border`}>{statusCfg.label}</Badge>
          </div>

          {/* Wert */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Typ</p>
              <p className="font-semibold mt-0.5">{voucher.type === "fixed" ? "Betrag (CHF)" : "Prozent (%)"}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Wert</p>
              <p className="font-semibold mt-0.5">
                {voucher.type === "fixed" ? fmtCHF(voucher.value) : `${parseFloat(voucher.value)}%`}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Restguthaben</p>
              <p className="font-semibold mt-0.5 text-green-700">
                {voucher.type === "fixed" ? fmtCHF(voucher.remainingBalance) : `${parseFloat(voucher.value)}%`}
              </p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Einlösungen</p>
              <p className="font-semibold mt-0.5">{voucher.usedCount}{voucher.maxUses ? ` / ${voucher.maxUses}` : ""}</p>
            </div>
          </div>

          {/* Gültigkeit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Gültig ab</p>
              <p className="font-medium mt-0.5">{fmtDate(voucher.validFrom)}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Gültig bis</p>
              <p className="font-medium mt-0.5">{fmtDate(voucher.validUntil)}</p>
            </div>
          </div>

          {/* Ausgestellt für */}
          {!editing ? (
            <div className="space-y-2">
              {voucher.issuedTo && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Ausgestellt für</p>
                  <p className="font-medium mt-0.5">{voucher.issuedTo}</p>
                </div>
              )}
              {voucher.note && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Notiz</p>
                  <p className="text-sm mt-0.5">{voucher.note}</p>
                </div>
              )}
              {voucher.minOrderValue && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Mindestbestellwert</p>
                  <p className="font-medium mt-0.5">{fmtCHF(voucher.minOrderValue)}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-3 border rounded-xl">
              <p className="text-sm font-medium">Bearbeiten</p>
              <div>
                <Label className="text-xs">Ausgestellt für</Label>
                <Input value={editForm.issuedTo} onChange={e => setEditForm(f => ({ ...f, issuedTo: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Gültig bis</Label>
                <Input type="date" value={editForm.validUntil} onChange={e => setEditForm(f => ({ ...f, validUntil: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Max. Einlösungen</Label>
                <Input type="number" min="1" value={editForm.maxUses} onChange={e => setEditForm(f => ({ ...f, maxUses: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Notiz</Label>
                <Textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} className="mt-1 resize-none" rows={2} />
              </div>
              {/* Multi-Restaurant-Auswahl */}
              {allRestaurants && allRestaurants.restaurants && allRestaurants.restaurants.length > 1 && (
                <div>
                  <Label className="text-xs font-medium">Einlösbar in weiteren Restaurants</Label>
                  <p className="text-xs text-muted-foreground mb-2">Wähle alle Restaurants, in denen diese Karte einlösbar sein soll (leer = nur dieses Restaurant)</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {allRestaurants.restaurants.map((r: any) => (
                      <label key={r.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editAllowedRestaurantIds.includes(r.id)}
                          onChange={(e) => {
                            setEditAllowedRestaurantIds(prev =>
                              e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id)
                            );
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{r.name}</span>
                        {r.city && <span className="text-xs text-muted-foreground">· {r.city}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>
                <Button size="sm" onClick={() => updateMutation.mutate({
                  id: voucherId,
                  issuedTo: editForm.issuedTo || undefined,
                  note: editForm.note || undefined,
                  validUntil: editForm.validUntil ? new Date(editForm.validUntil).toISOString() : null,
                  maxUses: editForm.maxUses ? parseInt(editForm.maxUses) : null,
                  allowedRestaurantIds: editAllowedRestaurantIds.length > 0 ? editAllowedRestaurantIds : null,
                })} disabled={updateMutation.isPending}>
                  Speichern
                </Button>
              </div>
            </div>
          )}

          {/* Einlösungs-Historie */}
          {redemptions.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                Einlösungs-Historie ({redemptions.length})
              </p>
              <div className="space-y-2">
                {(redemptions as any[]).map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg text-sm">
                    <div>
                      <p className="font-medium text-red-700">- {fmtCHF(r.amountDeducted)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(r.redeemedAt)}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Vorher: {fmtCHF(r.balanceBefore)}</p>
                      <p>Nachher: {fmtCHF(r.balanceAfter)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* QR-Code Vorschau */}
        {qrData && (
          <div className="mt-4 p-4 bg-gradient-to-br from-slate-900 to-slate-700 rounded-xl flex flex-col items-center gap-3">
            <p className="text-xs text-white/60 uppercase tracking-widest font-medium">QR-Code</p>
            <div className="bg-white rounded-xl p-3 shadow-lg">
              <img src={qrData.qrDataUrl} alt="QR" className="w-32 h-32" />
            </div>
            <p className="font-mono text-white font-bold tracking-widest text-sm">{data.voucher.code}</p>
            <Button
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 gap-1.5 w-full"
              onClick={() => navigate(`/admin/vouchers/${voucherId}/print`)}
            >
              <Printer className="h-3.5 w-3.5" /> Gutschein drucken / herunterladen
            </Button>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {voucher.status !== "cancelled" && voucher.status !== "redeemed" && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Bearbeiten
              </Button>
              <Button
                variant="outline" size="sm"
                className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Gutschein wirklich stornieren?"))
                    cancelMutation.mutate({ id: voucherId, status: "cancelled" });
                }}
                disabled={cancelMutation.isPending}
              >
                <Ban className="h-3.5 w-3.5" /> Stornieren
              </Button>
            </>
          )}
          <Button onClick={onClose}>Schliessen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Print-Overlay */}
    {showPrint && qrData && (
      <VoucherPrintView
        data={{
          code: data.voucher.code,
          qrDataUrl: qrData.qrDataUrl,
          type: data.voucher.type as "fixed" | "percent",
          value: data.voucher.value,
          remainingBalance: data.voucher.remainingBalance,
          issuedTo: data.voucher.issuedTo,
          validFrom: data.voucher.validFrom ? String(data.voucher.validFrom) : null,
          validUntil: data.voucher.validUntil ? String(data.voucher.validUntil) : null,
          note: data.voucher.note,
          restaurantName: data.restaurantName,
        }}
        onClose={() => setShowPrint(false)}
      />
    )}
  </>);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Voucher List Panel ───────────────────────────────────────────────────────

function VoucherListPanel({ category, onCreated }: { category: "discount" | "gift_card"; onCreated: () => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VoucherStatus>("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const PAGE_SIZE = 20;

  const { data, isLoading, refetch } = trpc.voucher.list.useQuery({
    search: search || undefined,
    status: statusFilter,
    category,
    page,
    pageSize: PAGE_SIZE,
  });

  function invalidate() { refetch(); onCreated(); }
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={category === "gift_card" ? "Code oder Empfänger suchen..." : "Code oder Name suchen..."}
            className="pl-9"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Alle Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="partially_redeemed">Teilweise eingelöst</SelectItem>
            <SelectItem value="redeemed">Eingelöst</SelectItem>
            <SelectItem value="expired">Abgelaufen</SelectItem>
            <SelectItem value="cancelled">Storniert</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />{category === "gift_card" ? "Neue Geschenkkarte" : "Neuer Gutschein"}
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="px-0 pb-0 pt-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.vouchers.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Gift className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Keine Gutscheine gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">Erstelle deinen ersten Gutschein</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-2.5 px-4">Code</th>
                      <th className="text-left py-2.5 px-4">Wert</th>
                      <th className="text-left py-2.5 px-4">Restguthaben</th>
                      <th className="text-left py-2.5 px-4">Ausgestellt für</th>
                      <th className="text-left py-2.5 px-4">Gültig bis</th>
                      <th className="text-left py-2.5 px-4">Status</th>
                      <th className="text-left py-2.5 px-4">Einlösungen</th>
                      <th className="py-2.5 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.vouchers as any[]).map((v) => {
                      const cfg = STATUS_CONFIG[v.status as VoucherStatus] ?? STATUS_CONFIG.active;
                      const StatusIcon = cfg.icon;
                      return (
                        <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold">{v.code}</span>
                              <button onClick={() => { navigator.clipboard.writeText(v.code); toast.success("Code kopiert"); }}>
                                <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-medium">
                            {v.type === "fixed" ? fmtCHF(v.value) : `${parseFloat(v.value)}%`}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${parseFloat(v.remainingBalance) > 0 ? "text-green-700" : "text-muted-foreground"}`}>
                              {v.type === "fixed" ? fmtCHF(v.remainingBalance) : "—"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{v.issuedTo ?? "—"}</td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">{fmtDate(v.validUntil)}</td>
                          <td className="py-3 px-4">
                            <Badge className={`${cfg.color} border gap-1 text-xs`}>
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground text-xs">
                            {v.usedCount}{v.maxUses ? ` / ${v.maxUses}` : ""}
                          </td>
                          <td className="py-3 px-4">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailId(v.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden divide-y">
                {(data.vouchers as any[]).map((v) => {
                  const cfg = STATUS_CONFIG[v.status as VoucherStatus] ?? STATUS_CONFIG.active;
                  return (
                    <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3" onClick={() => setDetailId(v.id)}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-sm">{v.code}</span>
                          <Badge className={`${cfg.color} border text-xs py-0`}>{cfg.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {v.type === "fixed" ? fmtCHF(v.value) : `${parseFloat(v.value)}%`}
                          {v.issuedTo ? ` · ${v.issuedTo}` : ""}
                          {v.validUntil ? ` · bis ${fmtDate(v.validUntil)}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {v.type === "fixed" && (
                          <p className="text-sm font-semibold text-green-700">{fmtCHF(v.remainingBalance)}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{v.usedCount}x eingelöst</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} von {data.total}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CreateVoucherDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={invalidate} defaultCategory={category} />
      {detailId !== null && (
        <VoucherDetailDialog voucherId={detailId} onClose={() => setDetailId(null)} onUpdated={invalidate} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function AdminVouchersInner() {
  const utils = trpc.useUtils();
  const { data: stats, refetch: refetchStats } = trpc.voucher.stats.useQuery();
  const { data: restaurantData } = trpc.restaurantAdmin.getSettings.useQuery();
  const restaurantId = (restaurantData as any)?.id as number | undefined;
  const [showLandingQr, setShowLandingQr] = useState(false);
  const origin = "https://simplapos.com";

  const { data: landingQrData } = trpc.voucher.getLandingPageQrCode.useQuery(
    { restaurantId: restaurantId!, origin },
    { enabled: !!restaurantId && !!origin && showLandingQr }
  );

  function invalidateStats() { refetchStats(); }

  function handleCopyLink() {
    if (!restaurantId) return;
    const url = `${origin}/gift/buy/${restaurantId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link kopiert!"));
  }

  function handleDownloadQr() {
    if (!landingQrData?.qrDataUrl) return;
    const a = document.createElement("a");
    a.href = landingQrData.qrDataUrl;
    a.download = `geschenkkarte-qr-${restaurantId}.png`;
    a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6 text-purple-600" /> Gutscheine &amp; Geschenkkarten
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Rabatt-Gutscheine für Marketing und Geschenkkarten für den Verkauf</p>
        </div>
        {restaurantId && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopyLink}>
              <Link2 className="h-3.5 w-3.5" /> Kauf-Link kopieren
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowLandingQr(true)}>
              <QrCode className="h-3.5 w-3.5" /> QR-Code Landingpage
            </Button>
          </div>
        )}
      </div>

      {/* Landingpage QR-Code Modal */}
      {showLandingQr && (
        <Dialog open onOpenChange={() => setShowLandingQr(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-purple-600" /> QR-Code Geschenkkarten-Kauf
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              {landingQrData ? (
                <>
                  <div className="bg-white rounded-xl p-4 shadow-md border">
                    <img src={landingQrData.qrDataUrl} alt="QR-Code" className="w-48 h-48" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center break-all">{landingQrData.landingUrl}</p>
                  <div className="flex gap-2 w-full">
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { navigator.clipboard.writeText(landingQrData.landingUrl); toast.success("Link kopiert!"); }}>
                      <Copy className="h-3.5 w-3.5" /> Link kopieren
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5" onClick={handleDownloadQr}>
                      <Download className="h-3.5 w-3.5" /> QR herunterladen
                    </Button>
                  </div>
                  <a href={landingQrData.landingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Landingpage öffnen
                  </a>
                </>
              ) : (
                <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowLandingQr(false)}>Schliessen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Gift, label: "Gesamt", value: stats?.total ?? "—", color: "text-purple-600", bg: "bg-purple-50" },
          { icon: CheckCircle, label: "Aktiv", value: stats?.active ?? "—", color: "text-green-600", bg: "bg-green-50" },
          { icon: Wallet, label: "Ausgegebener Wert", value: stats ? `CHF ${(stats.totalIssuedValue ?? 0).toFixed(2)}` : "—", color: "text-blue-600", bg: "bg-blue-50" },
          { icon: TrendingDown, label: "Eingelöst (CHF)", value: stats ? `CHF ${stats.totalRedeemedAmount.toFixed(2)}` : "—", color: "text-orange-600", bg: "bg-orange-50" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-3">
              <div className={`inline-flex p-1.5 rounded-lg ${s.bg} mb-2`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold mt-0.5">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="gift_card">
        <TabsList className="w-full">
          <TabsTrigger value="gift_card" className="flex-1 gap-2">
            <Gift className="h-4 w-4" />Geschenkkarten
          </TabsTrigger>
          <TabsTrigger value="discount" className="flex-1 gap-2">
            <Tag className="h-4 w-4" />Rabatt-Gutscheine
          </TabsTrigger>
        </TabsList>
        <TabsContent value="gift_card" className="mt-4">
          <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
            <strong>Geschenkkarten</strong> werden von Kunden im Restaurant gekauft und als Geschenk weitergegeben. Das Guthaben wird beim Bezahlen abgezogen.
          </div>
          <VoucherListPanel category="gift_card" onCreated={invalidateStats} />
        </TabsContent>
        <TabsContent value="discount" className="mt-4">
          <div className="mb-3 p-3 bg-purple-50 rounded-xl border border-purple-100 text-sm text-purple-700">
            <strong>Rabatt-Gutscheine</strong> werden gratis ausgegeben für Aktionen, Geburtstage oder Stammkunden. Als Betrag (CHF) oder Prozent (%).
          </div>
          <VoucherListPanel category="discount" onCreated={invalidateStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminVouchers() {
  return (
    <ModuleGate moduleId="gutscheine">
      <AdminVouchersInner />
    </ModuleGate>
  );
}
