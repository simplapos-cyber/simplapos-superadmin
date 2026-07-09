/**
 * CountryConfig.tsx – Superadmin: Länder-Konfiguration verwalten
 *
 * Ermöglicht das Anlegen, Bearbeiten und Aktivieren/Deaktivieren von
 * Länder-Konfigurationen für die weltweite SimplaPOS-Plattform.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Globe, Plus, Pencil, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, Save, RefreshCw, AlertCircle,
  DollarSign, Percent, Shield, CreditCard, FileText
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────

interface CountryFormData {
  countryCode: string;
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  locale: string;
  defaultLanguage: string;
  taxRates: { label: string; rate: number; isDefault: boolean }[];
  vatLabel: string;
  vatNumberFormat: string;
  vatNumberPlaceholder: string;
  fiscalRequired: boolean;
  fiscalSystem: string;
  atkRequired: boolean;
  tseRequired: boolean;
  gobdRequired: boolean;
  availablePaymentMethods: string[];
  stripeEnabled: boolean;
  twintEnabled: boolean;
  monthlyPriceBase: number;
  yearlyPriceBase: number;
  trialDays: number;
  currency2: string;
  supportEmail: string;
  supportPhone: string;
  termsUrl: string;
  privacyUrl: string;
  isActive: boolean;
}

const EMPTY_FORM: CountryFormData = {
  countryCode: "",
  name: "",
  flag: "🌍",
  currency: "EUR",
  currencySymbol: "€",
  locale: "de-DE",
  defaultLanguage: "de",
  taxRates: [{ label: "Standard", rate: 19, isDefault: true }],
  vatLabel: "MwSt.",
  vatNumberFormat: "",
  vatNumberPlaceholder: "",
  fiscalRequired: false,
  fiscalSystem: "",
  atkRequired: false,
  tseRequired: false,
  gobdRequired: false,
  availablePaymentMethods: ["card", "cash"],
  stripeEnabled: true,
  twintEnabled: false,
  monthlyPriceBase: 49,
  yearlyPriceBase: 490,
  trialDays: 7,
  currency2: "",
  supportEmail: "support@simplapos.com",
  supportPhone: "",
  termsUrl: "",
  privacyUrl: "",
  isActive: true,
};

const PAYMENT_METHODS = [
  { id: "card", label: "Kreditkarte" },
  { id: "cash", label: "Bargeld" },
  { id: "twint", label: "TWINT" },
  { id: "postfinance", label: "PostFinance" },
  { id: "girocard", label: "Girocard" },
  { id: "sepa", label: "SEPA" },
  { id: "paypal", label: "PayPal" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "google_pay", label: "Google Pay" },
];

// ─── Hilfskomponenten ─────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
    </div>
  );
}

// ─── Formular ─────────────────────────────────────────────────────────────────

function CountryForm({
  initial,
  onSave,
  onCancel,
  isSaving,
  isNew = false,
}: {
  initial: CountryFormData;
  onSave: (data: CountryFormData, isNew: boolean) => void;
  onCancel: () => void;
  isSaving: boolean;
  isNew?: boolean;
}) {
  const [form, setForm] = useState<CountryFormData>(initial);
  const set = (field: keyof CountryFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };
  const setNum = (field: keyof CountryFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }));

  const togglePayment = (method: string) => {
    setForm(prev => ({
      ...prev,
      availablePaymentMethods: prev.availablePaymentMethods.includes(method)
        ? prev.availablePaymentMethods.filter(m => m !== method)
        : [...prev.availablePaymentMethods, method],
    }));
  };

  const addTaxRate = () => setForm(prev => ({
    ...prev,
    taxRates: [...prev.taxRates, { label: "", rate: 0, isDefault: false }],
  }));

  const removeTaxRate = (i: number) => setForm(prev => ({
    ...prev,
    taxRates: prev.taxRates.filter((_, idx) => idx !== i),
  }));

  const setTaxRate = (i: number, field: "label" | "rate" | "isDefault", value: any) => {
    setForm(prev => ({
      ...prev,
      taxRates: prev.taxRates.map((t, idx) => {
        if (idx !== i) return field === "isDefault" && value ? { ...t, isDefault: false } : t;
        return { ...t, [field]: value };
      }),
    }));
  };

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form, isNew); }} className="space-y-6">

      {/* Basis */}
      <div>
        <SectionHeader icon={Globe} title="Basisinformationen" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Ländercode (ISO 2) *</Label>
            <Input value={form.countryCode} onChange={set("countryCode")} placeholder="CH" maxLength={2}
              className="uppercase font-mono" required />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Flagge (Emoji)</Label>
            <Input value={form.flag} onChange={set("flag")} placeholder="🇨🇭" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs mb-1 block">Ländername *</Label>
            <Input value={form.name} onChange={set("name")} placeholder="Schweiz" required />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Währung (ISO 4217)</Label>
            <Input value={form.currency} onChange={set("currency")} placeholder="CHF" maxLength={3} className="font-mono uppercase" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Währungssymbol</Label>
            <Input value={form.currencySymbol} onChange={set("currencySymbol")} placeholder="CHF" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Locale</Label>
            <Input value={form.locale} onChange={set("locale")} placeholder="de-CH" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Standardsprache</Label>
            <Input value={form.defaultLanguage} onChange={set("defaultLanguage")} placeholder="de" maxLength={5} />
          </div>
        </div>
      </div>

      <Separator />

      {/* MwSt. */}
      <div>
        <SectionHeader icon={Percent} title="Steuer & MwSt." />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <Label className="text-xs mb-1 block">MwSt.-Bezeichnung</Label>
            <Input value={form.vatLabel} onChange={set("vatLabel")} placeholder="MwSt." />
          </div>
          <div>
            <Label className="text-xs mb-1 block">MwSt.-Nr. Format</Label>
            <Input value={form.vatNumberFormat} onChange={set("vatNumberFormat")} placeholder="CHE-###.###.### MWST" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">MwSt.-Nr. Platzhalter</Label>
            <Input value={form.vatNumberPlaceholder} onChange={set("vatNumberPlaceholder")} placeholder="CHE-123.456.789 MWST" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Steuersätze</span>
            <Button type="button" variant="outline" size="sm" onClick={addTaxRate} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Satz hinzufügen
            </Button>
          </div>
          {form.taxRates.map((rate, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
              <Input value={rate.label} onChange={e => setTaxRate(i, "label", e.target.value)}
                placeholder="Bezeichnung" className="h-8 text-xs flex-1" />
              <Input type="number" value={rate.rate} onChange={e => setTaxRate(i, "rate", parseFloat(e.target.value))}
                placeholder="%" className="h-8 text-xs w-20" min={0} max={100} step={0.1} />
              <span className="text-xs text-gray-500">%</span>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={rate.isDefault} onChange={e => setTaxRate(i, "isDefault", e.target.checked)} />
                Standard
              </label>
              {form.taxRates.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeTaxRate(i)}
                  className="h-7 w-7 p-0 text-red-400 hover:text-red-600">
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Compliance */}
      <div>
        <SectionHeader icon={Shield} title="Compliance & Fiskal" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[
            { field: "fiscalRequired" as const, label: "Fiskalisierung Pflicht" },
            { field: "atkRequired" as const, label: "ATK (Kosovo)" },
            { field: "tseRequired" as const, label: "TSE (Deutschland)" },
            { field: "gobdRequired" as const, label: "GoBD (Deutschland)" },
          ].map(({ field, label }) => (
            <label key={field} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 cursor-pointer">
              <input type="checkbox" checked={form[field] as boolean}
                onChange={e => setForm(prev => ({ ...prev, [field]: e.target.checked }))} />
              <span className="text-xs text-gray-700">{label}</span>
            </label>
          ))}
        </div>
        <div>
          <Label className="text-xs mb-1 block">Fiskal-System (z.B. ATK, TSE, POS-System)</Label>
          <Input value={form.fiscalSystem} onChange={set("fiscalSystem")} placeholder="ATK Kosovo" />
        </div>
      </div>

      <Separator />

      {/* Zahlungsmethoden */}
      <div>
        <SectionHeader icon={CreditCard} title="Zahlungsmethoden" />
        <div className="flex flex-wrap gap-2 mb-3">
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => togglePayment(m.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                form.availablePaymentMethods.includes(m.id)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.stripeEnabled}
              onChange={e => setForm(prev => ({ ...prev, stripeEnabled: e.target.checked }))} />
            Stripe aktiviert
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.twintEnabled}
              onChange={e => setForm(prev => ({ ...prev, twintEnabled: e.target.checked }))} />
            TWINT aktiviert
          </label>
        </div>
      </div>

      <Separator />

      {/* Preise */}
      <div>
        <SectionHeader icon={DollarSign} title="Preisgestaltung" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Basis Monatspreis</Label>
            <Input type="number" value={form.monthlyPriceBase} onChange={setNum("monthlyPriceBase")}
              min={0} step={0.01} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Basis Jahrespreis</Label>
            <Input type="number" value={form.yearlyPriceBase} onChange={setNum("yearlyPriceBase")}
              min={0} step={0.01} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Testzeitraum (Tage)</Label>
            <Input type="number" value={form.trialDays} onChange={setNum("trialDays")} min={0} max={90} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Zweitwährung (optional)</Label>
            <Input value={form.currency2} onChange={set("currency2")} placeholder="USD" maxLength={3} className="font-mono uppercase" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Support & Links */}
      <div>
        <SectionHeader icon={FileText} title="Support & Rechtliches" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1 block">Support-E-Mail</Label>
            <Input type="email" value={form.supportEmail} onChange={set("supportEmail")} placeholder="support@simplapos.com" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Support-Telefon</Label>
            <Input value={form.supportPhone} onChange={set("supportPhone")} placeholder="+41 44 000 00 00" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">AGB-URL</Label>
            <Input value={form.termsUrl} onChange={set("termsUrl")} placeholder="https://simplapos.com/agb/ch" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Datenschutz-URL</Label>
            <Input value={form.privacyUrl} onChange={set("privacyUrl")} placeholder="https://simplapos.com/datenschutz/ch" />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={form.isActive}
            onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))} />
          Land aktiv (erscheint auf Landing Page & Onboarding)
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Abbrechen
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Speichern
        </Button>
      </div>
    </form>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function CountryConfigPage() {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const { data: countries = [], refetch, isLoading } = trpc.countryConfig.adminList.useQuery();

  const adminCreate = trpc.countryConfig.adminCreate.useMutation({
    onSuccess: () => { toast.success("Land angelegt"); setShowNewForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const adminUpdate = trpc.countryConfig.adminUpdate.useMutation({
    onSuccess: () => { toast.success("Gespeichert"); setEditingCode(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const isSaving = adminCreate.isPending || adminUpdate.isPending;

  const toggleActive = trpc.countryConfig.adminToggle.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const handleSave = (data: CountryFormData, isNew: boolean) => {
    const payload = {
      ...data,
      countryCode: data.countryCode.toUpperCase(),
      taxRates: JSON.stringify(data.taxRates),
      availablePaymentMethods: JSON.stringify(data.availablePaymentMethods),
    };
    if (isNew) {
      adminCreate.mutate({
        ...payload,
        nameEn: payload.name,
        complianceFlags: JSON.stringify({
          fiscalRequired: payload.fiscalRequired,
          atkRequired: payload.atkRequired,
          tseRequired: payload.tseRequired,
          gobdRequired: payload.gobdRequired,
          fiscalSystem: payload.fiscalSystem,
        }),
        pricingPlans: JSON.stringify({
          monthly: payload.monthlyPriceBase,
          yearly: payload.yearlyPriceBase,
          trialDays: payload.trialDays,
        }),
      });
    } else {
      adminUpdate.mutate({
        countryCode: payload.countryCode,
        name: payload.name,
        flag: payload.flag,
        currency: payload.currency,
        currencySymbol: payload.currencySymbol,
        locale: payload.locale,
        defaultLanguage: payload.defaultLanguage,
        taxRates: payload.taxRates,
        availablePaymentMethods: payload.availablePaymentMethods,
        supportEmail: payload.supportEmail || undefined,
        supportPhone: payload.supportPhone || undefined,
        isActive: payload.isActive,
        complianceFlags: JSON.stringify({
          fiscalRequired: payload.fiscalRequired,
          atkRequired: payload.atkRequired,
          tseRequired: payload.tseRequired,
          gobdRequired: payload.gobdRequired,
          fiscalSystem: payload.fiscalSystem,
        }),
        pricingPlans: JSON.stringify({
          monthly: payload.monthlyPriceBase,
          yearly: payload.yearlyPriceBase,
          trialDays: payload.trialDays,
        }),
      });
    }
  };

  const buildFormFromCountry = (c: any): CountryFormData => ({
    countryCode: c.countryCode ?? "",
    name: c.name ?? "",
    flag: c.flag ?? "🌍",
    currency: c.currency ?? "EUR",
    currencySymbol: c.currencySymbol ?? "€",
    locale: c.locale ?? "",
    defaultLanguage: c.defaultLanguage ?? "de",
    taxRates: (() => { try { return JSON.parse(c.taxRates ?? "[]"); } catch { return []; } })(),
    vatLabel: c.vatLabel ?? "MwSt.",
    vatNumberFormat: c.vatNumberFormat ?? "",
    vatNumberPlaceholder: c.vatNumberPlaceholder ?? "",
    fiscalRequired: !!c.fiscalRequired,
    fiscalSystem: c.fiscalSystem ?? "",
    atkRequired: !!c.atkRequired,
    tseRequired: !!c.tseRequired,
    gobdRequired: !!c.gobdRequired,
    availablePaymentMethods: (() => { try { return JSON.parse(c.availablePaymentMethods ?? "[]"); } catch { return []; } })(),
    stripeEnabled: !!c.stripeEnabled,
    twintEnabled: !!c.twintEnabled,
    monthlyPriceBase: c.monthlyPriceBase ?? 49,
    yearlyPriceBase: c.yearlyPriceBase ?? 490,
    trialDays: c.trialDays ?? 7,
    currency2: c.currency2 ?? "",
    supportEmail: c.supportEmail ?? "",
    supportPhone: c.supportPhone ?? "",
    termsUrl: c.termsUrl ?? "",
    privacyUrl: c.privacyUrl ?? "",
    isActive: !!c.isActive,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-600" />
            Länder-Konfiguration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verwalten Sie länderspezifische Einstellungen für Steuern, Währungen, Compliance und Preise.
          </p>
        </div>
        <Button onClick={() => { setShowNewForm(true); setEditingCode(null); }}
          className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Neues Land
        </Button>
      </div>

      {/* Neues Land Formular */}
      {showNewForm && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-blue-700 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Neues Land hinzufügen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CountryForm
              initial={EMPTY_FORM}
              onSave={handleSave}
              onCancel={() => setShowNewForm(false)}
              isSaving={isSaving}
              isNew={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Länderliste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : countries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Noch keine Länder konfiguriert.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {countries.map((c: any) => (
            <Card key={c.countryCode} className={`transition-all ${!c.isActive ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                {/* Kopfzeile */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      <Badge className="font-mono text-xs bg-gray-100 text-gray-600 border-0">{c.countryCode}</Badge>
                      <Badge className="text-xs bg-blue-50 text-blue-700 border-0">{c.currency}</Badge>
                      {c.isActive
                        ? <Badge className="text-xs bg-green-50 text-green-700 border-0 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Aktiv</Badge>
                        : <Badge className="text-xs bg-gray-100 text-gray-500 border-0 flex items-center gap-1"><XCircle className="w-3 h-3" /> Inaktiv</Badge>
                      }
                      {c.fiscalRequired && <Badge className="text-xs bg-orange-50 text-orange-700 border-0 flex items-center gap-1"><Shield className="w-3 h-3" /> Fiskal</Badge>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Monatlich: {c.currencySymbol} {c.monthlyPriceBase} · Jährlich: {c.currencySymbol} {c.yearlyPriceBase} · {c.trialDays} Tage Test
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm"                     onClick={() => toggleActive.mutate({ countryCode: c.countryCode, field: "isActive", value: !c.isActive })}
                      className="h-8 text-xs text-gray-500 hover:text-gray-700">
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      {c.isActive ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingCode(editingCode === c.countryCode ? null : c.countryCode)}
                      className="h-8 text-xs text-blue-600 hover:text-blue-700">
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Bearbeiten
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedCode(expandedCode === c.countryCode ? null : c.countryCode)}
                      className="h-8 w-8 p-0 text-gray-400">
                      {expandedCode === c.countryCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Erweiterte Details */}
                {expandedCode === c.countryCode && editingCode !== c.countryCode && (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-gray-400 mb-1">Steuersätze</div>
                      {(() => { try { return JSON.parse(c.taxRates ?? "[]"); } catch { return []; } })().map((t: any, i: number) => (
                        <div key={i} className="text-gray-700">{t.label}: {t.rate}% {t.isDefault ? "(Standard)" : ""}</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Zahlungsmethoden</div>
                      <div className="flex flex-wrap gap-1">
                        {(() => { try { return JSON.parse(c.availablePaymentMethods ?? "[]"); } catch { return []; } })().map((m: string) => (
                          <span key={m} className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{m}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Compliance</div>
                      <div className="space-y-0.5 text-gray-700">
                        {c.atkRequired && <div>✓ ATK Kosovo</div>}
                        {c.tseRequired && <div>✓ TSE Deutschland</div>}
                        {c.gobdRequired && <div>✓ GoBD</div>}
                        {!c.atkRequired && !c.tseRequired && !c.gobdRequired && <div className="text-gray-400">Keine Pflicht</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Locale</div>
                      <div className="text-gray-700">{c.locale} · {c.defaultLanguage}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 mb-1">Support</div>
                      <div className="text-gray-700">{c.supportEmail}</div>
                    </div>
                    {c.termsUrl && (
                      <div>
                        <div className="text-gray-400 mb-1">Links</div>
                        <a href={c.termsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">AGB</a>
                        {c.privacyUrl && <> · <a href={c.privacyUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Datenschutz</a></>}
                      </div>
                    )}
                  </div>
                )}

                {/* Bearbeitungsformular */}
                {editingCode === c.countryCode && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <CountryForm
                      initial={buildFormFromCountry(c)}
                      onSave={handleSave}
                      onCancel={() => setEditingCode(null)}
                      isSaving={isSaving}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info-Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700">
          <strong>Weltweite Erweiterung:</strong> Neue Länder können jederzeit hinzugefügt werden.
          Aktive Länder erscheinen automatisch auf der Landing Page und im Onboarding-Prozess.
          Inaktive Länder sind ausgeblendet, aber die Konfiguration bleibt erhalten.
        </div>
      </div>
    </div>
  );
}
