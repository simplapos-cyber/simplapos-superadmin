import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Building2, MapPin, Globe, Receipt, Percent, Plus, Trash2, Star, AlertCircle, FileText, Clock, CheckCircle2, AlertTriangle, Loader2, RefreshCw, Bell, ShieldAlert, Users, Share2, Gift, ImageIcon, X, KeyRound, Eye, EyeOff, ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// ─── Öffnungszeiten-Komponente ─────────────────────────────────────────────
const DAYS = [
  { key: "mon", label: "Montag" },
  { key: "tue", label: "Dienstag" },
  { key: "wed", label: "Mittwoch" },
  { key: "thu", label: "Donnerstag" },
  { key: "fri", label: "Freitag" },
  { key: "sat", label: "Samstag" },
  { key: "sun", label: "Sonntag" },
];

type DayHours = { open: string; close: string; closed: boolean };
type OpeningHours = Record<string, DayHours>;

function defaultHours(): OpeningHours {
  return Object.fromEntries(DAYS.map(d => [d.key, { open: "09:00", close: "22:00", closed: false }]));
}

function OpeningHoursCard({ value, onChange }: { value: OpeningHours | null; onChange: (oh: OpeningHours) => void }) {
  const [hours, setHours] = useState<OpeningHours>(() => {
    if (value && typeof value === "object") return value as OpeningHours;
    return defaultHours();
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (value && typeof value === "object") setHours(value as OpeningHours);
  }, [value]);

  const update = (key: string, field: keyof DayHours, val: string | boolean) => {
    setHours(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));
  };

  const handleSave = () => {
    setSaving(true);
    onChange(hours);
    setTimeout(() => setSaving(false), 800);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Öffnungszeiten
            </CardTitle>
            <CardDescription>Erscheinen auf der öffentlichen Geschenkkarten-Seite</CardDescription>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Speichern
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const h = hours[key] ?? { open: "09:00", close: "22:00", closed: false };
            return (
              <div key={key} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className="w-24 text-sm font-medium text-gray-700 shrink-0">{label}</div>
                <Switch
                  checked={!h.closed}
                  onCheckedChange={(v) => update(key, "closed", !v)}
                />
                {h.closed ? (
                  <span className="text-sm text-gray-400 italic">Geschlossen</span>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="time"
                      value={h.open}
                      onChange={e => update(key, "open", e.target.value)}
                      className="w-28 text-sm"
                    />
                    <span className="text-gray-400 text-sm">–</span>
                    <Input
                      type="time"
                      value={h.close}
                      onChange={e => update(key, "close", e.target.value)}
                      className="w-28 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { data: restaurant, isLoading } = trpc.restaurantAdmin.getSettings.useQuery();
  const utils = trpc.useUtils();
  const updateSettings = trpc.restaurantAdmin.updateSettings.useMutation({
    onSuccess: () => {
      utils.restaurantAdmin.getSettings.invalidate();
      utils.restaurantAdmin.overview.invalidate();
      toast.success("Einstellungen gespeichert");
    },
    onError: (err) => toast.error(err.message),
  });

  // Form state
  const [form, setForm] = useState({
    name: "",
    address: "",
    zip: "",
    city: "",
    phone: "",
    phoneReceipt: "",
    email: "",
    website: "",
    vatNumber: "",
    companyName: "",
    companyAddress: "",
    companyZip: "",
    companyCity: "",
    companyPhone: "",
    companyContact: "",
    currency: "CHF",
    businessType: "",
    // Rechnungs-Bankverbindung
    invoiceIban: "",
    invoiceCreditorName: "",
    invoiceCreditorAddress: "",
    // Debitor-Saldowarnung
    debtorBalanceWarningThreshold: "500",
    // Social Media
    instagramUrl: "",
    tiktokUrl: "",
    facebookUrl: "",
    googleMapsUrl: "",
    tripadvisorUrl: "",
    youtubeUrl: "",
    // Geschenkkarten
    giftCardBackgroundUrl: "",
    // Bon-Marketing
    receiptSlogan: "",
    receiptWifiName: "",
    receiptWifiPassword: "",
    receiptDiscountCode: "",
    receiptDiscountPercent: "",
    receiptShowSocial: true as boolean,
    receiptShowGoogleReview: false as boolean,
    receiptCustomMessage: "",
  });

  // Kellner-Berechtigungen
  const [waiterPerms, setWaiterPerms] = useState({
    canRecordPayment: true,
    canSendInvoiceEmail: true,
    canViewDunningPdf: true,
    requireSignature: false,
  });

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || "",
        address: restaurant.address || "",
        zip: restaurant.zip || "",
        city: restaurant.city || "",
        phone: restaurant.phone || "",
        phoneReceipt: restaurant.phoneReceipt || "",
        email: restaurant.email || "",
        website: restaurant.website || "",
        vatNumber: restaurant.vatNumber || "",
        companyName: restaurant.companyName || "",
        companyAddress: restaurant.companyAddress || "",
        companyZip: restaurant.companyZip || "",
        companyCity: restaurant.companyCity || "",
        companyPhone: restaurant.companyPhone || "",
        companyContact: restaurant.companyContact || "",
        currency: restaurant.currency || "CHF",
        businessType: (restaurant as any).businessType || "",
        invoiceIban: (restaurant as any).invoiceIban || "",
        invoiceCreditorName: (restaurant as any).invoiceCreditorName || "",
        invoiceCreditorAddress: (restaurant as any).invoiceCreditorAddress || "",
        debtorBalanceWarningThreshold: String((restaurant as any).debtorBalanceWarningThreshold ?? "500"),
        instagramUrl: (restaurant as any).instagramUrl || "",
        tiktokUrl: (restaurant as any).tiktokUrl || "",
        facebookUrl: (restaurant as any).facebookUrl || "",
        googleMapsUrl: (restaurant as any).googleMapsUrl || "",
        tripadvisorUrl: (restaurant as any).tripadvisorUrl || "",
        youtubeUrl: (restaurant as any).youtubeUrl || "",
        giftCardBackgroundUrl: (restaurant as any).giftCardBackgroundUrl || "",
        // Bon-Marketing
        receiptSlogan: (restaurant as any).receiptSlogan || "",
        receiptWifiName: (restaurant as any).receiptWifiName || "",
        receiptWifiPassword: (restaurant as any).receiptWifiPassword || "",
        receiptDiscountCode: (restaurant as any).receiptDiscountCode || "",
        receiptDiscountPercent: String((restaurant as any).receiptDiscountPercent ?? ""),
        receiptShowSocial: (restaurant as any).receiptShowSocial !== false,
        receiptShowGoogleReview: (restaurant as any).receiptShowGoogleReview === true,
        receiptCustomMessage: (restaurant as any).receiptCustomMessage || "",
      });
      try {
        const wp = JSON.parse((restaurant as any).waiterPermissions ?? '{}');
        setWaiterPerms({
          canRecordPayment: wp.canRecordPayment !== false,
          canSendInvoiceEmail: wp.canSendInvoiceEmail !== false,
          canViewDunningPdf: wp.canViewDunningPdf !== false,
          requireSignature: wp.requireSignature === true,
        });
      } catch {}
    }
  }, [restaurant]);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Restaurant-Name ist ein Pflichtfeld");
      return;
    }
    updateSettings.mutate({
      name: form.name,
      address: form.address || undefined,
      zip: form.zip || undefined,
      city: form.city || undefined,
      phone: form.phone || undefined,
      phoneReceipt: form.phoneReceipt || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      vatNumber: form.vatNumber || undefined,
      companyName: form.companyName || undefined,
      companyAddress: form.companyAddress || undefined,
      companyZip: form.companyZip || undefined,
      companyCity: form.companyCity || undefined,
      companyPhone: form.companyPhone || undefined,
      companyContact: form.companyContact || undefined,
      currency: form.currency || undefined,
      businessType: form.businessType ? (form.businessType as any) : undefined,
      invoiceIban: form.invoiceIban || undefined,
      invoiceCreditorName: form.invoiceCreditorName || undefined,
      invoiceCreditorAddress: form.invoiceCreditorAddress || undefined,
      debtorBalanceWarningThreshold: form.debtorBalanceWarningThreshold ? parseFloat(form.debtorBalanceWarningThreshold) : undefined,
      waiterPermissions: waiterPerms,
      instagramUrl: form.instagramUrl || undefined,
      tiktokUrl: form.tiktokUrl || undefined,
      facebookUrl: form.facebookUrl || undefined,
      googleMapsUrl: form.googleMapsUrl || undefined,
      tripadvisorUrl: form.tripadvisorUrl || undefined,
      youtubeUrl: form.youtubeUrl || undefined,
      giftCardBackgroundUrl: form.giftCardBackgroundUrl || undefined,
      receiptSlogan: form.receiptSlogan || undefined,
      receiptWifiName: form.receiptWifiName || undefined,
      receiptWifiPassword: form.receiptWifiPassword || undefined,
      receiptDiscountCode: form.receiptDiscountCode || undefined,
      receiptDiscountPercent: form.receiptDiscountPercent ? parseFloat(form.receiptDiscountPercent) : undefined,
      receiptShowSocial: form.receiptShowSocial,
      receiptShowGoogleReview: form.receiptShowGoogleReview,
      receiptCustomMessage: form.receiptCustomMessage || undefined,
    });
  };

  // ── Steuerklassen-Verwaltung ──────────────────────────────────────────────
  const { data: taxClasses = [], isLoading: taxLoading } = trpc.menu.listTaxClasses.useQuery();
  const upsertTaxClass = trpc.menu.upsertTaxClass.useMutation({
    onSuccess: () => { utils.menu.listTaxClasses.invalidate(); toast.success("Steuerklasse gespeichert"); setTaxDialog(null); },
    onError: (err) => toast.error(err.message),
  });
  const deleteTaxClass = trpc.menu.deleteTaxClass.useMutation({
    onSuccess: () => { utils.menu.listTaxClasses.invalidate(); toast.success("Steuerklasse gelöscht"); },
    onError: (err) => toast.error(err.message),
  });

  type TaxDialog = { id?: number; name: string; rate: string; isDefault: boolean } | null;
  const [taxDialog, setTaxDialog] = useState<TaxDialog>(null);

  const openNewTax = () => setTaxDialog({ name: "", rate: "8.10", isDefault: false });
  const openEditTax = (tc: any) => setTaxDialog({ id: tc.id, name: tc.name, rate: tc.rate, isDefault: tc.isDefault });
  const saveTaxClass = () => {
    if (!taxDialog) return;
    if (!taxDialog.name.trim()) return toast.error("Name erforderlich");
    const rate = parseFloat(taxDialog.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error("Ungültiger Steuersatz (0–100%)");
    upsertTaxClass.mutate({ id: taxDialog.id, name: taxDialog.name, rate: rate.toFixed(2), isDefault: taxDialog.isDefault });
  };

  // ── Import-Protokoll ─────────────────────────────────────────────────────
  // Eigene Abfrage für Import-Logs via fetch
  const [importLogsData, setImportLogsData] = useState<any[]>([]);
  const [logsLoadingState, setLogsLoadingState] = useState(false);
  const loadImportLogs = useCallback(async () => {
    setLogsLoadingState(true);
    try {
      const res = await fetch("/api/menu/import-logs", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setImportLogsData(data.logs ?? []);
      }
    } catch {}
    setLogsLoadingState(false);
  }, []);

  useEffect(() => { loadImportLogs(); }, [loadImportLogs]);

  // MwSt.-Pflichtfelder-Warnung für Bon-Druck
  const missingBonFields: string[] = [];
  if (!form.vatNumber) missingBonFields.push("MwSt-Nummer");
  if (!form.companyName && !form.name) missingBonFields.push("Firmen- oder Restaurantname");

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Einstellungen</h1>
          <p className="text-muted-foreground">Restaurant- und Firmeninformationen verwalten</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettings.isPending ? "Speichere..." : "Speichern"}
        </Button>
      </div>

      {/* MwSt.-Pflichtfelder-Warnung */}
      {missingBonFields.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Pflichtfelder für gesetzeskonformen Bon fehlen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gemäss MWSTG müssen Belege folgende Felder enthalten: {missingBonFields.join(", ")}.
              Bitte ergänzen Sie diese Angaben, bevor Sie Kundenbons drucken.
            </p>
          </div>
        </div>
      )}

      {/* Restaurant Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Restaurant-Informationen
          </CardTitle>
          <CardDescription>Grundlegende Informationen zu Ihrem Restaurant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Restaurant-Name *</Label>
              <Input value={form.name} onChange={e => handleChange("name", e.target.value)} placeholder="Mein Restaurant" />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input type="email" value={form.email} onChange={e => handleChange("email", e.target.value)} placeholder="info@restaurant.ch" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Betriebstyp</Label>
              <Select value={form.businessType || ""} onValueChange={v => handleChange("businessType", v)}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="restaurant">Restaurant</SelectItem>
                  <SelectItem value="cafe">Café</SelectItem>
                  <SelectItem value="bar">Bar / Lounge</SelectItem>
                  <SelectItem value="hotel_restaurant">Hotel / Restaurant</SelectItem>
                  <SelectItem value="food_truck">Food Truck</SelectItem>
                  <SelectItem value="catering">Catering</SelectItem>
                  <SelectItem value="bakery">Bäckerei / Konditorei</SelectItem>
                  <SelectItem value="pizzeria">Pizzeria</SelectItem>
                  <SelectItem value="sushi">Sushi / Asia</SelectItem>
                  <SelectItem value="other">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Wird für KI-Empfehlungen und Berichte genutzt</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={e => handleChange("phone", e.target.value)} placeholder="+41 44 123 45 67" />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={form.website} onChange={e => handleChange("website", e.target.value)} placeholder="https://www.restaurant.ch" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Adresse
          </CardTitle>
          <CardDescription>Standort Ihres Restaurants</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Strasse & Hausnummer</Label>
            <Input value={form.address} onChange={e => handleChange("address", e.target.value)} placeholder="Bahnhofstrasse 1" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>PLZ</Label>
              <Input value={form.zip} onChange={e => handleChange("zip", e.target.value)} placeholder="8001" />
            </div>
            <div>
              <Label>Ort</Label>
              <Input value={form.city} onChange={e => handleChange("city", e.target.value)} placeholder="Zürich" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Öffnungszeiten */}
      <OpeningHoursCard
        value={(restaurant as any)?.openingHours ?? null}
        onChange={(oh) => updateSettings.mutate({ openingHours: oh })}
      />

      {/* Social Media */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Social Media & Online-Präsenz
          </CardTitle>
          <CardDescription>Links erscheinen auf der öffentlichen Geschenkkarten-Seite für Ihre Gäste</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" style={{background:"linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",borderRadius:"4px",padding:"1px",color:"white"}}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                Instagram
              </Label>
              <Input value={form.instagramUrl} onChange={e => handleChange("instagramUrl", e.target.value)} placeholder="https://instagram.com/meinrestaurant" />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <svg className="h-4 w-4 bg-black rounded p-0.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/></svg>
                TikTok
              </Label>
              <Input value={form.tiktokUrl} onChange={e => handleChange("tiktokUrl", e.target.value)} placeholder="https://tiktok.com/@meinrestaurant" />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <svg className="h-4 w-4 rounded p-0.5 text-white" style={{background:"#1877F2"}} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </Label>
              <Input value={form.facebookUrl} onChange={e => handleChange("facebookUrl", e.target.value)} placeholder="https://facebook.com/meinrestaurant" />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <svg className="h-4 w-4 rounded p-0.5 text-white" style={{background:"#4285F4"}} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Google Maps URL
              </Label>
              <div className="flex gap-2">
                <Input value={form.googleMapsUrl} onChange={e => handleChange("googleMapsUrl", e.target.value)} placeholder="https://maps.google.com/..." className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => {
                    const parts = [form.name, form.address, form.zip, form.city, "CH"].filter(Boolean);
                    if (parts.length < 2) {
                      toast.error("Bitte zuerst Name und Adresse ausfüllen");
                      return;
                    }
                    const query = encodeURIComponent(parts.join(", "));
                    handleChange("googleMapsUrl", `https://www.google.com/maps/search/?api=1&query=${query}`);
                    toast.success("Google Maps-Link generiert");
                  }}
                >
                  Auto
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Link zu Ihrem Google Maps Eintrag – oder automatisch aus Adresse generieren</p>
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4 text-[#34E0A1]" />
                TripAdvisor
              </Label>
              <Input value={form.tripadvisorUrl} onChange={e => handleChange("tripadvisorUrl", e.target.value)} placeholder="https://tripadvisor.com/Restaurant_Review-..." />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <svg className="h-4 w-4 rounded p-0.5 text-white" style={{background:"#FF0000"}} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                YouTube
              </Label>
              <Input value={form.youtubeUrl} onChange={e => handleChange("youtubeUrl", e.target.value)} placeholder="https://youtube.com/@meinrestaurant" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Geschenkkarten-Hintergrundbild */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Geschenkkarten-Design
          </CardTitle>
          <CardDescription>Eigenes Hintergrundbild für Ihre Geschenkkarten-Druckvorlagen</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.giftCardBackgroundUrl ? (
            <div className="relative rounded-xl overflow-hidden border" style={{maxWidth:320}}>
              <img src={form.giftCardBackgroundUrl} alt="Hintergrundbild" className="w-full h-40 object-cover" />
              <button
                type="button"
                onClick={() => handleChange("giftCardBackgroundUrl", "")}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
              <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Noch kein Hintergrundbild</p>
            </div>
          )}
          <div>
            <Label>Bild hochladen (max. 5 MB, JPG/PNG)</Label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error("Bild zu gross (max. 5 MB)"); return; }
                const fd = new FormData();
                fd.append("file", file);
                try {
                  const res = await fetch("/api/menu/upload-image", { method: "POST", body: fd, credentials: "include" });
                  if (!res.ok) throw new Error("Upload fehlgeschlagen");
                  const { url } = await res.json();
                  handleChange("giftCardBackgroundUrl", url);
                  toast.success("Bild hochgeladen – jetzt speichern");
                } catch (err: any) {
                  toast.error(err.message || "Upload fehlgeschlagen");
                }
                e.target.value = "";
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">Das Bild erscheint als Hintergrund in der Geschenkkarten-Druckvorschau (Design "Eigenes Foto")</p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending} size="sm">
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Hintergrundbild speichern
          </Button>
        </CardContent>
      </Card>

      {/* Receipt / Tax Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Beleg & MwSt.
          </CardTitle>
          <CardDescription>
            Pflichtangaben für gesetzeskonforme Kundenbons gemäss MWSTG (Schweiz)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Telefon auf Beleg</Label>
              <Input value={form.phoneReceipt} onChange={e => handleChange("phoneReceipt", e.target.value)} placeholder="+41 44 123 45 67" />
              <p className="text-xs text-muted-foreground mt-1">Wird auf Kundenbons gedruckt</p>
            </div>
            <div>
              <Label className="flex items-center gap-1">
                MwSt-Nummer
                <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                value={form.vatNumber}
                onChange={e => handleChange("vatNumber", e.target.value)}
                placeholder="CHE-123.456.789 MWST"
                className={!form.vatNumber ? "border-amber-500/60" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: CHE-XXX.XXX.XXX MWST – Pflichtfeld für Bon-Druck
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Währung</Label>
              <Input value={form.currency} onChange={e => handleChange("currency", e.target.value)} placeholder="CHF" />
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong>Schweizer MwSt.-Sätze 2024:</strong> Alle Preise werden als Bruttopreise (inkl. MwSt.) erfasst.
            Die MwSt. wird rückwärts berechnet: Vor Ort (8.1%) und Take-away Speisen (2.6%).
            Alkohol ist immer 8.1% unabhängig vom Bestelltyp.
          </div>
        </CardContent>
      </Card>

      {/* Bon-Marketing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Bon-Marketing & Branding
          </CardTitle>
          <CardDescription>
            Logo, Slogan, WLAN, Rabattcode und Social-Media-Links auf dem Gastbon
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* ── Linke Spalte: Formularfelder ── */}
          <div className="space-y-5">
          {/* Slogan */}
          <div>
            <Label>Slogan / Willkommensnachricht</Label>
            <Input
              value={form.receiptSlogan}
              onChange={e => handleChange("receiptSlogan", e.target.value)}
              placeholder="Danke für Ihren Besuch! Wir freuen uns auf Ihr Wiederkommen."
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground mt-1">Erscheint gross und zentriert oben auf dem Bon (max. 80 Zeichen)</p>
          </div>

          {/* WLAN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>WLAN-Name (SSID)</Label>
              <Input
                value={form.receiptWifiName}
                onChange={e => handleChange("receiptWifiName", e.target.value)}
                placeholder="Restaurant_Gast"
              />
            </div>
            <div>
              <Label>WLAN-Passwort</Label>
              <Input
                value={form.receiptWifiPassword}
                onChange={e => handleChange("receiptWifiPassword", e.target.value)}
                placeholder="GastPasswort123"
              />
              <p className="text-xs text-muted-foreground mt-1">Wird auf dem Bon angezeigt wenn SSID gesetzt</p>
            </div>
          </div>

          {/* Rabattcode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Rabattcode für nächsten Besuch</Label>
              <Input
                value={form.receiptDiscountCode}
                onChange={e => handleChange("receiptDiscountCode", e.target.value)}
                placeholder="DANKE10"
              />
            </div>
            <div>
              <Label>Rabatt in % (optional)</Label>
              <Input
                type="number"
                min={1} max={100}
                value={form.receiptDiscountPercent}
                onChange={e => handleChange("receiptDiscountPercent", e.target.value)}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground mt-1">Wird neben dem Code angezeigt: "10% Rabatt mit Code DANKE10"</p>
            </div>
          </div>

          {/* Benutzerdefinierte Nachricht */}
          <div>
            <Label>Zusätzliche Nachricht (Fusszeile)</Label>
            <Input
              value={form.receiptCustomMessage}
              onChange={e => handleChange("receiptCustomMessage", e.target.value)}
              placeholder="Folgen Sie uns auf Instagram @meinrestaurant"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-1">Freier Text am Ende des Bons (max. 120 Zeichen)</p>
          </div>

          {/* Schalter */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Social-Media-Links auf Bon drucken</p>
                <p className="text-xs text-muted-foreground">Instagram, Facebook, TikTok etc. (aus Social Media Einstellungen)</p>
              </div>
              <Switch
                checked={form.receiptShowSocial}
                onCheckedChange={v => setForm(prev => ({ ...prev, receiptShowSocial: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Google-Bewertungslink auf Bon drucken</p>
                <p className="text-xs text-muted-foreground">Gäste direkt zur Google-Bewertung einladen</p>
              </div>
              <Switch
                checked={form.receiptShowGoogleReview}
                onCheckedChange={v => setForm(prev => ({ ...prev, receiptShowGoogleReview: v }))}
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={updateSettings.isPending} size="sm">
            {updateSettings.isPending ? <span className="animate-spin mr-2">⏳</span> : <Save className="h-4 w-4 mr-2" />}
            Bon-Marketing speichern
          </Button>
          </div>{/* end form col */}

          {/* ── Rechte Spalte: Live-Vorschau ── */}
          <div className="flex flex-col items-center">
            <p className="text-sm font-medium text-muted-foreground mb-3 self-start">Vorschau Gastbon</p>
            {/* Bon-Papier */}
            <div
              className="w-full max-w-[300px] bg-white border border-gray-200 rounded shadow-md p-4 font-mono text-[11px] leading-relaxed select-none"
              style={{ boxShadow: "2px 2px 8px rgba(0,0,0,0.12)" }}
            >
              {/* Kopfzeile */}
              <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
                <p className="font-bold text-sm">{form.name || "Mein Restaurant"}</p>
                {(form.address || form.city) && (
                  <p className="text-gray-500">{[form.address, form.zip, form.city].filter(Boolean).join(" ")}</p>
                )}
                {form.phoneReceipt && <p className="text-gray-500">Tel: {form.phoneReceipt}</p>}
                {form.website && <p className="text-gray-500">{form.website}</p>}
              </div>

              {/* Slogan */}
              {form.receiptSlogan && (
                <p className="text-center font-semibold mb-2 text-gray-700">{form.receiptSlogan}</p>
              )}

              {/* Beispiel-Bestellung */}
              <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="flex justify-between"><span>1x Wiener Schnitzel</span><span>CHF 28.00</span></div>
                <div className="flex justify-between"><span>1x Mineralwasser</span><span>CHF 5.50</span></div>
                <div className="flex justify-between"><span>2x Kaffee</span><span>CHF 9.00</span></div>
              </div>
              <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                <div className="flex justify-between text-gray-500"><span>MwSt. 8.1%</span><span>CHF 3.43</span></div>
                <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>CHF 42.50</span></div>
                <div className="flex justify-between text-gray-500"><span>Bezahlt (Karte)</span><span>CHF 42.50</span></div>
              </div>

              {/* MwSt-Nummer */}
              {form.vatNumber && (
                <p className="text-center text-gray-400 text-[10px] mb-1">{form.vatNumber}</p>
              )}

              {/* WLAN */}
              {form.receiptWifiName && (
                <div className="border border-dashed border-gray-300 rounded p-1.5 mb-2 text-center">
                  <p className="font-semibold">WLAN: {form.receiptWifiName}</p>
                  {form.receiptWifiPassword && <p className="text-gray-500">Passwort: {form.receiptWifiPassword}</p>}
                </div>
              )}

              {/* Rabattcode */}
              {form.receiptDiscountCode && (
                <div className="border border-dashed border-gray-300 rounded p-1.5 mb-2 text-center bg-gray-50">
                  <p className="font-semibold">
                    {form.receiptDiscountPercent ? `${form.receiptDiscountPercent}% Rabatt` : "Rabatt"} beim nächsten Besuch
                  </p>
                  <p className="tracking-widest font-bold text-sm">{form.receiptDiscountCode}</p>
                </div>
              )}

              {/* Social Media */}
              {form.receiptShowSocial && (form.instagramUrl || form.facebookUrl || form.tiktokUrl) && (
                <div className="text-center mb-1">
                  <p className="text-gray-400">Folgen Sie uns:</p>
                  {form.instagramUrl && <p>Instagram</p>}
                  {form.facebookUrl && <p>Facebook</p>}
                  {form.tiktokUrl && <p>TikTok</p>}
                </div>
              )}

              {/* Google Review */}
              {form.receiptShowGoogleReview && form.googleMapsUrl && (
                <p className="text-center text-gray-500 mb-1">★ Bewerten Sie uns auf Google</p>
              )}

              {/* Custom Message */}
              {form.receiptCustomMessage && (
                <p className="text-center text-gray-600 border-t border-dashed border-gray-300 pt-2 mt-1">{form.receiptCustomMessage}</p>
              )}

              {/* Danke */}
              <p className="text-center text-gray-400 mt-2">♥ Danke für Ihren Besuch!</p>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">Die Vorschau aktualisiert sich live beim Tippen</p>
          </div>{/* end preview col */}

          </div>{/* end grid */}
        </CardContent>
      </Card>

      {/* Steuerklassen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Steuerklassen (MwSt.)
          </CardTitle>
          <CardDescription>
            Steuerklassen pro Produkt zuweisbar. Standard-Sätze Schweiz: 8.1% (vor Ort) und 2.6% (Take-away Speisen).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {taxLoading ? (
            <Skeleton className="h-20" />
          ) : (
            <>
              {(taxClasses as any[]).length === 0 && (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Percent className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Noch keine Steuerklassen konfiguriert.</p>
                  <p className="text-xs mt-1">Empfehlung: Erstellen Sie "Restaurant (8.1%)" als Standard und "Take-away (2.6%)".</p>
                </div>
              )}
              <div className="space-y-2">
                {(taxClasses as any[]).map((tc) => (
                  <div key={tc.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{tc.name}</span>
                          {tc.isDefault && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              <Star className="h-3 w-3 mr-1" />Standard
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{parseFloat(tc.rate).toFixed(2)} %</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditTax(tc)}>Bearbeiten</Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Steuerklasse "${tc.name}" wirklich löschen?`)) {
                            deleteTaxClass.mutate({ id: tc.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={openNewTax}>
                <Plus className="h-4 w-4 mr-2" />
                Steuerklasse hinzufügen
              </Button>
              {(taxClasses as any[]).length === 0 && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button variant="secondary" size="sm" onClick={() => upsertTaxClass.mutate({ name: "Restaurant (8.1%)", rate: "8.10", isDefault: true })}>
                    + 8.1% Restaurant
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => upsertTaxClass.mutate({ name: "Take-away (2.6%)", rate: "2.60", isDefault: false })}>
                    + 2.6% Take-away
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Firmen-Informationen
          </CardTitle>
          <CardDescription>Juristische Angaben zur Betreiberfirma (für Verträge und Rechnungen)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1">
                Firmenname
                <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                value={form.companyName}
                onChange={e => handleChange("companyName", e.target.value)}
                placeholder="Restaurant GmbH"
                className={!form.companyName ? "border-amber-500/60" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">Pflichtfeld für gesetzeskonforme Bons</p>
            </div>
            <div>
              <Label>Ansprechpartner</Label>
              <Input value={form.companyContact} onChange={e => handleChange("companyContact", e.target.value)} placeholder="Max Muster" />
            </div>
          </div>
          <div>
            <Label>Firmenadresse</Label>
            <Input value={form.companyAddress} onChange={e => handleChange("companyAddress", e.target.value)} placeholder="Firmenstrasse 10" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Firmen-PLZ</Label>
              <Input value={form.companyZip} onChange={e => handleChange("companyZip", e.target.value)} placeholder="8001" />
            </div>
            <div>
              <Label>Firmen-Ort</Label>
              <Input value={form.companyCity} onChange={e => handleChange("companyCity", e.target.value)} placeholder="Zürich" />
            </div>
          </div>
          <div>
            <Label>Firmen-Telefon</Label>
            <Input value={form.companyPhone} onChange={e => handleChange("companyPhone", e.target.value)} placeholder="+41 44 123 45 67" />
          </div>
        </CardContent>
      </Card>

      {/* Import-Protokoll */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                KI-Import-Protokoll
              </CardTitle>
              <CardDescription>Letzte Speisekarten-Importe via KI-Analyse</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadImportLogs} disabled={logsLoadingState}>
              {logsLoadingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoadingState ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : importLogsData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Noch keine Importe durchgeführt</p>
              <p className="text-xs mt-1">Gehen Sie zu Speisekarte verwalten → KI-Import</p>
            </div>
          ) : (
            <div className="space-y-2">
              {importLogsData.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    log.status === "success" ? "bg-green-100 dark:bg-green-900/30" :
                    log.status === "partial" ? "bg-yellow-100 dark:bg-yellow-900/30" :
                    "bg-red-100 dark:bg-red-900/30"
                  }`}>
                    {log.status === "success" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                     log.status === "partial" ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> :
                     <AlertCircle className="w-4 h-4 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{log.fileName ?? "Unbekannte Datei"}</span>
                      {log.detectedLanguage && log.detectedLanguage !== "de" && (
                        <Badge variant="outline" className="text-[10px] h-4">{log.detectedLanguage.toUpperCase()} → DE</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(log.createdAt).toLocaleString("de-CH")}</span>
                      <span>{log.importedCount ?? 0} importiert</span>
                      {log.skippedCount > 0 && <span>{log.skippedCount} übersprungen</span>}
                      {log.duplicateCount > 0 && <span>{log.duplicateCount} Duplikate</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rechnungs-Bankverbindung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Rechnungs-Bankverbindung
          </CardTitle>
          <CardDescription>
            Diese Angaben erscheinen auf der Schweizer QR-Rechnung und werden beim Kauf auf Rechnung verwendet.
            Die IBAN ist Pflichtfeld für den Kauf-auf-Rechnung-Flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoiceIban">IBAN (Schweizer Konto, z.B. CH56 0483 5012 3456 7800 9)</Label>
            <Input
              id="invoiceIban"
              placeholder="CH56 0483 5012 3456 7800 9"
              value={form.invoiceIban}
              onChange={(e) => handleChange("invoiceIban", e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={34}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceCreditorName">Kontoinhaber / Firma (Kreditor)</Label>
            <Input
              id="invoiceCreditorName"
              placeholder={form.name || "Muster Restaurant GmbH"}
              value={form.invoiceCreditorName}
              onChange={(e) => handleChange("invoiceCreditorName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoiceCreditorAddress">Adresse des Kreditors (Zeile 1: Strasse, Zeile 2: PLZ Ort)</Label>
            <textarea
              id="invoiceCreditorAddress"
              rows={2}
              placeholder={"Musterstrasse 1\n8000 Zürich"}
              value={form.invoiceCreditorAddress}
              onChange={(e) => handleChange("invoiceCreditorAddress", e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Debitor-Saldowarnung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Debitor-Saldowarnung
          </CardTitle>
          <CardDescription>
            Der Owner wird automatisch benachrichtigt, wenn ein Debitor einen offenen Saldo über diesem Schwellenwert hat.
            Der Heartbeat-Job läuft täglich um 08:00 UTC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="debtorBalanceWarningThreshold">Warnschwellenwert (CHF)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="debtorBalanceWarningThreshold"
                type="number"
                min={0}
                step={50}
                placeholder="500"
                value={form.debtorBalanceWarningThreshold}
                onChange={(e) => handleChange("debtorBalanceWarningThreshold", e.target.value)}
                className="max-w-[160px]"
              />
              <span className="text-sm text-muted-foreground">CHF</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Empfehlung: CHF 500 (Standard). Auf 0 setzen, um Warnungen zu deaktivieren.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Kellner-Berechtigungen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Kellner-Berechtigungen
          </CardTitle>
          <CardDescription>
            Legen Sie fest, welche Funktionen im Rechnungsbereich für Kellner sichtbar und nutzbar sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Zahlung erfassen</p>
              <p className="text-xs text-muted-foreground">Kellner können Zahlungseingänge (Teil- und Vollzahlungen) direkt erfassen</p>
            </div>
            <Switch
              checked={waiterPerms.canRecordPayment}
              onCheckedChange={(v) => setWaiterPerms(p => ({ ...p, canRecordPayment: v }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Rechnung per E-Mail senden</p>
              <p className="text-xs text-muted-foreground">Kellner können Rechnungen direkt per E-Mail an den Kunden versenden</p>
            </div>
            <Switch
              checked={waiterPerms.canSendInvoiceEmail}
              onCheckedChange={(v) => setWaiterPerms(p => ({ ...p, canSendInvoiceEmail: v }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Mahnungs-PDF anzeigen</p>
              <p className="text-xs text-muted-foreground">Kellner können Mahnungs-PDFs öffnen und herunterladen</p>
            </div>
            <Switch
              checked={waiterPerms.canViewDunningPdf}
              onCheckedChange={(v) => setWaiterPerms(p => ({ ...p, canViewDunningPdf: v }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-3">
            <div>
              <p className="text-sm font-medium">Unterschrift obligatorisch</p>
              <p className="text-xs text-muted-foreground">Kellner müssen beim Rechnungsabschluss eine digitale Unterschrift des Gastes einholen — ohne Unterschrift kann nicht abgeschlossen werden</p>
            </div>
            <Switch
              checked={waiterPerms.requireSignature}
              onCheckedChange={(v) => setWaiterPerms(p => ({ ...p, requireSignature: v }))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Änderungen werden mit dem globalen Speichern-Button übernommen.
          </p>
        </CardContent>
      </Card>

      {/* Zentralkasse Admin-PIN */}
      <ZentralkassePinCard />

      {/* Mahnwesen-Konfiguration */}
      <DunningConfigSection />

      {/* Save Button (bottom) */}
      <div className="flex justify-end pb-8">
        <Button size="lg" onClick={handleSave} disabled={updateSettings.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettings.isPending ? "Speichere..." : "Alle Änderungen speichern"}
        </Button>
      </div>

      {/* Steuerklassen-Dialog */}
      <Dialog open={!!taxDialog} onOpenChange={open => !open && setTaxDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{taxDialog?.id ? "Steuerklasse bearbeiten" : "Neue Steuerklasse"}</DialogTitle>
          </DialogHeader>
          {taxDialog && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Name *</Label>
                <Input
                  className="mt-1"
                  value={taxDialog.name}
                  onChange={e => setTaxDialog(prev => prev ? { ...prev, name: e.target.value } : null)}
                  placeholder='z.B. "Restaurant (8.1%)"'
                />
              </div>
              <div>
                <Label>Steuersatz (%)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxDialog.rate}
                  onChange={e => setTaxDialog(prev => prev ? { ...prev, rate: e.target.value } : null)}
                  placeholder="8.10"
                />
                <p className="text-xs text-muted-foreground mt-1">Schweizer Standardsätze: 8.1% (vor Ort) / 2.6% (Take-away Speisen)</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={taxDialog.isDefault}
                  onCheckedChange={v => setTaxDialog(prev => prev ? { ...prev, isDefault: v } : null)}
                />
                <Label>Als Standard-Steuerklasse setzen</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaxDialog(null)}>Abbrechen</Button>
            <Button onClick={saveTaxClass} disabled={upsertTaxClass.isPending}>
              {upsertTaxClass.isPending ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Zentralkasse Admin-PIN + Audit-Log ──────────────────────────────────────
function ZentralkassePinCard() {
  const utils = trpc.useUtils();
  const { data: pinData } = trpc.restaurantAdmin.getAdminPin.useQuery();
  const [showAuditLog, setShowAuditLog] = useState(false);
  const { data: auditLog = [], isLoading: auditLoading } = trpc.restaurantAdmin.getAdminPinAttempts.useQuery(
    { limit: 50 },
    { enabled: showAuditLog }
  );
  const setAdminPin = trpc.restaurantAdmin.setAdminPin.useMutation({
    onSuccess: () => {
      toast.success("Admin-PIN erfolgreich geändert");
      utils.restaurantAdmin.getAdminPin.invalidate();
      setDialogOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function handleSavePin() {
    if (newPin.length < 4) return toast.error("Neuer PIN muss mindestens 4 Stellen haben");
    if (!/^\d+$/.test(newPin)) return toast.error("PIN darf nur Ziffern enthalten");
    if (newPin !== confirmPin) return toast.error("PINs stimmen nicht überein");
    setAdminPin.mutate({ currentPin, newPin });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-500" />
            Zentralkasse Admin-PIN
          </CardTitle>
          <CardDescription>
            PIN für den Admin-Zugang im Zentralkasse-Overlay. Aktuell: {pinData?.pin ? `${pinData.pin.slice(0, 2)}{"\u2022".repeat(Math.max(0, pinData.pin.length - 2))}` : "••••••"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(true)} className="gap-2">
              <KeyRound className="h-4 w-4" />
              PIN ändern
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAuditLog(v => !v)}
              className="gap-2 text-muted-foreground"
            >
              {showAuditLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Zugriffsprotokoll
            </Button>
          </div>

          {showAuditLog && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Letzte Admin-PIN-Versuche (max. 50)
              </div>
              {auditLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Lade...</div>
              ) : auditLog.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Noch keine Versuche protokolliert.</div>
              ) : (
                <div className="divide-y">
                  {auditLog.map((entry: { id: number; success: boolean; ipAddress: string | null; userAgent: string | null; createdAt: Date }) => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className={`inline-flex items-center gap-1 font-medium ${
                        entry.success ? "text-green-600" : "text-red-600"
                      }`}>
                        {entry.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {entry.success ? "Erfolg" : "Fehlversuch"}
                      </span>
                      <span className="text-muted-foreground text-xs flex-1 truncate">
                        {entry.userAgent ? entry.userAgent.slice(0, 60) + (entry.userAgent.length > 60 ? "…" : "") : "–"}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleString("de-CH")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setCurrentPin(""); setNewPin(""); setConfirmPin(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Zentralkasse Admin-PIN ändern
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Aktueller PIN</Label>
              <div className="relative mt-1">
                <Input
                  type={showCurrent ? "text" : "password"}
                  inputMode="numeric"
                  value={currentPin}
                  onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Aktuellen PIN eingeben"
                  maxLength={16}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Neuer PIN (min. 4 Stellen, nur Ziffern)</Label>
              <div className="relative mt-1">
                <Input
                  type={showNew ? "text" : "password"}
                  inputMode="numeric"
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Neuen PIN eingeben"
                  maxLength={16}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Neuen PIN bestätigen</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN wiederholen"
                maxLength={16}
                className="mt-1"
              />
            </div>
            {newPin && confirmPin && newPin !== confirmPin && (
              <p className="text-sm text-red-500">PINs stimmen nicht überein</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleSavePin}
              disabled={setAdminPin.isPending || !currentPin || !newPin || newPin !== confirmPin}
            >
              {setAdminPin.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              PIN speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DunningConfigSection() {
  const { data: restaurant } = trpc.restaurantAdmin.getSettings.useQuery();
  const restaurantId = (restaurant as any)?.id as number | undefined;

  const { data: cfg, isLoading: cfgLoading } = trpc.invoicing.getDunningConfig.useQuery(
    { restaurantId: restaurantId! },
    { enabled: !!restaurantId }
  );

  const utils = trpc.useUtils();
  const saveCfg = trpc.invoicing.saveDunningConfig.useMutation({
    onSuccess: () => {
      utils.invoicing.getDunningConfig.invalidate();
      toast.success("Mahnwesen-Konfiguration gespeichert");
    },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    graceDays: "3",
    dunning1Days: "7",
    dunning2Days: "14",
    dunning1Fee: "20.00",
    dunning2Fee: "40.00",
    interestRate: "5.00",
    currency: "CHF",
    autoEnabled: true,
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        graceDays: String(cfg.graceDays ?? 3),
        dunning1Days: String(cfg.dunning1Days ?? 7),
        dunning2Days: String(cfg.dunning2Days ?? 14),
        dunning1Fee: cfg.dunning1Fee ?? "20.00",
        dunning2Fee: cfg.dunning2Fee ?? "40.00",
        interestRate: cfg.interestRate ?? "5.00",
        currency: cfg.currency ?? "CHF",
        autoEnabled: cfg.autoEnabled ?? true,
      });
    }
  }, [cfg]);

  const handleSave = () => {
    if (!restaurantId) return;
    const graceDays = parseInt(form.graceDays);
    const dunning1Days = parseInt(form.dunning1Days);
    const dunning2Days = parseInt(form.dunning2Days);
    if (isNaN(graceDays) || isNaN(dunning1Days) || isNaN(dunning2Days)) {
      toast.error("Bitte gültige Zahlenwerte eingeben");
      return;
    }
    saveCfg.mutate({
      restaurantId,
      graceDays,
      dunning1Days,
      dunning2Days,
      dunning1Fee: form.dunning1Fee,
      dunning2Fee: form.dunning2Fee,
      interestRate: form.interestRate,
      currency: form.currency,
      autoEnabled: form.autoEnabled,
    });
  };

  if (cfgLoading || !restaurantId) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Mahnwesen-Konfiguration
            </CardTitle>
            <CardDescription>
              Fristen und Gebühren für automatische Mahnungen (täglich geprüft via Heartbeat-Job)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Automatik</span>
            <Switch
              checked={form.autoEnabled}
              onCheckedChange={v => setForm(prev => ({ ...prev, autoEnabled: v }))}
            />
            <Badge variant={form.autoEnabled ? "default" : "secondary"}>
              {form.autoEnabled ? "Aktiv" : "Pausiert"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Info-Banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <Bell className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Der Heartbeat-Job prüft täglich um 07:00 UTC alle offenen Rechnungen und setzt automatisch
            Mahnstufen. Sie erhalten eine Owner-Benachrichtigung bei jeder ausgestellten Mahnung.
          </p>
        </div>

        {/* Fristen */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Fristen (Tage nach Fälligkeit)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Kulanzfrist (Tage)</Label>
              <Input
                type="number" min="0" max="30"
                value={form.graceDays}
                onChange={e => setForm(prev => ({ ...prev, graceDays: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Tage nach Fälligkeit bevor «überfällig»</p>
            </div>
            <div>
              <Label className="text-xs">1. Mahnung nach (Tage)</Label>
              <Input
                type="number" min="1" max="90"
                value={form.dunning1Days}
                onChange={e => setForm(prev => ({ ...prev, dunning1Days: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Tage nach «überfällig» bis 1. Mahnung</p>
            </div>
            <div>
              <Label className="text-xs">2. Mahnung nach (Tage)</Label>
              <Input
                type="number" min="1" max="180"
                value={form.dunning2Days}
                onChange={e => setForm(prev => ({ ...prev, dunning2Days: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Tage nach 1. Mahnung bis 2. Mahnung</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Gebühren */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            Mahngebühren & Zinsen
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">1. Mahngebühr ({form.currency})</Label>
              <Input
                type="number" min="0" step="0.05"
                value={form.dunning1Fee}
                onChange={e => setForm(prev => ({ ...prev, dunning1Fee: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Wird zur Rechnung addiert</p>
            </div>
            <div>
              <Label className="text-xs">2. Mahngebühr ({form.currency})</Label>
              <Input
                type="number" min="0" step="0.05"
                value={form.dunning2Fee}
                onChange={e => setForm(prev => ({ ...prev, dunning2Fee: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Inkasso-Androhung</p>
            </div>
            <div>
              <Label className="text-xs">Verzugszins (%)</Label>
              <Input
                type="number" min="0" max="30" step="0.5"
                value={form.interestRate}
                onChange={e => setForm(prev => ({ ...prev, interestRate: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Gesetzlicher Standard: 5%</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saveCfg.isPending} size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveCfg.isPending ? "Speichere..." : "Konfiguration speichern"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
