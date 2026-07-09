/**
 * OnboardingWizard.tsx – Gastronomen-Onboarding in 5 Schritten
 *
 * Schritt 1: Betriebsdaten (info)
 * Schritt 2: Module auswählen (modules)
 * Schritt 3: Vertrag unterzeichnen (contract)
 * Schritt 4: Zahlung via Stripe (payment)
 * Schritt 5: Admin-Account aktivieren (activate)
 *
 * Session-Token wird in localStorage gespeichert.
 */

import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle2, ChevronRight, ArrowLeft, Utensils, Zap, ShieldCheck,
  CreditCard, Lock, Plus, Minus, AlertCircle, Loader2, Star,
  Building2, Phone, Mail, MapPin, User, Eye, EyeOff
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────

type WizardStep = "info" | "modules" | "contract" | "payment" | "activate" | "done";

interface SelectedModule {
  moduleId: string;
  quantity: number;
}

interface InfoData {
  restaurantName: string;
  restaurantEmail: string;
  restaurantPhone: string;
  restaurantAddress: string;
  restaurantZip: string;
  restaurantCity: string;
  restaurantVatNumber: string;
  companyName: string;
  companyContact: string;
}

// ─── Konstanten ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<WizardStep, string> = {
  info: "Betriebsdaten",
  modules: "Module",
  contract: "Vertrag",
  payment: "Zahlung",
  activate: "Aktivierung",
  done: "Fertig",
};

const STEP_ORDER: WizardStep[] = ["info", "modules", "contract", "payment", "activate"];

const SESSION_KEY = "simplapos_onboarding_token";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatCHF(amount: number) {
  return `CHF ${amount.toFixed(2).replace(".", ".")}`;
}

// ─── Schritt-Indikator ───────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1 sm:gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 ${
              done ? "bg-green-500 text-white" :
              active ? "bg-blue-600 text-white ring-4 ring-blue-100" :
              "bg-gray-100 text-gray-400"
            }`}>
              {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`hidden sm:block text-xs font-medium transition-colors ${
              active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"
            }`}>
              {STEP_LABELS[step]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 transition-colors ${done ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Schritt 1: Betriebsdaten ─────────────────────────────────────────────────

function StepInfo({
  onNext,
}: {
  onNext: (token: string, data: InfoData) => void;
}) {
  const [form, setForm] = useState<InfoData>({
    restaurantName: "",
    restaurantEmail: "",
    restaurantPhone: "",
    restaurantAddress: "",
    restaurantZip: "",
    restaurantCity: "",
    restaurantVatNumber: "",
    companyName: "",
    companyContact: "",
  });

  const startSession = trpc.onboarding.startSession.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(SESSION_KEY, data.sessionToken);
      onNext(data.sessionToken, form);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.restaurantName.trim()) return toast.error("Restaurantname erforderlich");
    if (!form.restaurantEmail.trim()) return toast.error("E-Mail erforderlich");
    startSession.mutate(form);
  };

  const set = (field: keyof InfoData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Betriebsdaten eingeben</h2>
        <p className="text-gray-500 text-sm">Diese Angaben erscheinen auf Ihrem Vertrag und Kassenbon.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label htmlFor="restaurantName" className="flex items-center gap-1.5 mb-1.5">
            <Utensils className="w-3.5 h-3.5 text-blue-500" />
            Restaurantname <span className="text-red-500">*</span>
          </Label>
          <Input id="restaurantName" value={form.restaurantName} onChange={set("restaurantName")}
            placeholder="z.B. Ristorante da Marco" required className="text-base" style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="restaurantEmail" className="flex items-center gap-1.5 mb-1.5">
            <Mail className="w-3.5 h-3.5 text-blue-500" />
            E-Mail <span className="text-red-500">*</span>
          </Label>
          <Input id="restaurantEmail" type="email" value={form.restaurantEmail} onChange={set("restaurantEmail")}
            placeholder="info@restaurant.ch" required style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="restaurantPhone" className="flex items-center gap-1.5 mb-1.5">
            <Phone className="w-3.5 h-3.5 text-blue-500" />
            Telefon
          </Label>
          <Input id="restaurantPhone" value={form.restaurantPhone} onChange={set("restaurantPhone")}
            placeholder="+41 44 000 00 00" style={{ fontSize: "16px" }} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="restaurantAddress" className="flex items-center gap-1.5 mb-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            Strasse & Hausnummer
          </Label>
          <Input id="restaurantAddress" value={form.restaurantAddress} onChange={set("restaurantAddress")}
            placeholder="Bahnhofstrasse 1" style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="restaurantZip" className="mb-1.5 block">PLZ</Label>
          <Input id="restaurantZip" value={form.restaurantZip} onChange={set("restaurantZip")}
            placeholder="8001" style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="restaurantCity" className="mb-1.5 block">Ort</Label>
          <Input id="restaurantCity" value={form.restaurantCity} onChange={set("restaurantCity")}
            placeholder="Zürich" style={{ fontSize: "16px" }} />
        </div>
      </div>

      <Separator />

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label className="text-sm font-semibold text-gray-700 mb-3 block flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
            Firmeninformationen (optional)
          </Label>
        </div>
        <div>
          <Label htmlFor="companyName" className="mb-1.5 block">Firmenname</Label>
          <Input id="companyName" value={form.companyName} onChange={set("companyName")}
            placeholder="Marco GmbH" style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="companyContact" className="mb-1.5 block">Ansprechperson</Label>
          <Input id="companyContact" value={form.companyContact} onChange={set("companyContact")}
            placeholder="Marco Ferretti" style={{ fontSize: "16px" }} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="restaurantVatNumber" className="mb-1.5 block">MwSt.-Nummer (CHE-Format)</Label>
          <Input id="restaurantVatNumber" value={form.restaurantVatNumber} onChange={set("restaurantVatNumber")}
            placeholder="CHE-123.456.789 MWST" style={{ fontSize: "16px" }} />
          <p className="text-xs text-gray-400 mt-1">Format: CHE-XXX.XXX.XXX MWST – erscheint auf dem Kassenbon</p>
        </div>
      </div>

      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-semibold"
        disabled={startSession.isPending}>
        {startSession.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Weiter: Module auswählen
        <ChevronRight className="ml-2 w-4 h-4" />
      </Button>
    </form>
  );
}

// ─── Schritt 2: Module auswählen ──────────────────────────────────────────────

function StepModules({
  sessionToken,
  onNext,
  onBack,
}: {
  sessionToken: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<SelectedModule[]>([{ moduleId: "cloud_pos_basis", quantity: 1 }]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");

  const { data: modules } = trpc.onboarding.getModules.useQuery();
  const { data: pricing } = trpc.onboarding.calculatePrice.useQuery(
    { selectedModules: selected, billingCycle },
    { enabled: selected.length > 0 }
  );

  const saveModules = trpc.onboarding.saveModules.useMutation({
    onSuccess: () => onNext(),
    onError: (e) => toast.error(e.message),
  });

  const toggleModule = (moduleId: string) => {
    if (moduleId === "cloud_pos_basis") return; // Pflichtmodul
    setSelected(prev => {
      const exists = prev.find(m => m.moduleId === moduleId);
      if (exists) return prev.filter(m => m.moduleId !== moduleId);
      return [...prev, { moduleId, quantity: 1 }];
    });
  };

  const setQuantity = (moduleId: string, qty: number) => {
    setSelected(prev => prev.map(m => m.moduleId === moduleId ? { ...m, quantity: Math.max(1, qty) } : m));
  };

  const isSelected = (moduleId: string) => selected.some(m => m.moduleId === moduleId);
  const getQty = (moduleId: string) => selected.find(m => m.moduleId === moduleId)?.quantity ?? 1;

  const categories = useMemo(() => {
    if (!modules) return [];
    const cats: Record<string, typeof modules> = {};
    for (const m of modules) {
      if (!cats[m.category]) cats[m.category] = [];
      cats[m.category].push(m);
    }
    return Object.entries(cats);
  }, [modules]);

  const CATEGORY_LABELS: Record<string, string> = {
    basis: "Basis (Pflicht)",
    hardware: "Hardware & Stationen",
    betrieb: "Betrieb & Verwaltung",
    bestellung: "Bestellung & Lieferung",
    kundenbindung: "Kundenbindung",
    marketing: "Marketing",
    enterprise: "Enterprise",
    support: "Support",
    einmalig: "Einmalig",
    compliance: "Compliance",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Module auswählen</h2>
        <p className="text-gray-500 text-sm">Wählen Sie nur, was Sie brauchen. Jederzeit erweiterbar.</p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === "monthly" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          Monatlich
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${billingCycle === "yearly" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          Jährlich
          <Badge className="bg-green-100 text-green-700 border-0 text-xs">2 Monate gratis</Badge>
        </button>
      </div>

      {/* Module Liste */}
      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {categories.map(([cat, mods]) => (
          <div key={cat}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {CATEGORY_LABELS[cat] ?? cat}
            </div>
            <div className="space-y-2">
              {mods.map(mod => {
                const sel = isSelected(mod.id);
                const required = mod.isRequired;
                return (
                  <div
                    key={mod.id}
                    onClick={() => !required && toggleModule(mod.id)}
                    className={`rounded-xl border p-3 transition-all cursor-pointer ${
                      sel ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                    } ${required ? "cursor-default" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                        sel ? "bg-blue-600" : "border-2 border-gray-300"
                      }`}>
                        {sel && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{mod.name}</span>
                          {required && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Pflicht</Badge>}
                          {mod.priceOneTime > 0 && <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Einmalig</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{mod.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {mod.priceMonthly > 0 && (
                          <div className="text-sm font-bold text-gray-900">
                            CHF {mod.priceMonthly}
                            <span className="text-xs text-gray-400 font-normal">/Mo</span>
                          </div>
                        )}
                        {mod.priceOneTime > 0 && (
                          <div className="text-sm font-bold text-gray-900">
                            CHF {mod.priceOneTime}
                            <span className="text-xs text-gray-400 font-normal"> einm.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Mengensteuerung für Per-Unit-Module */}
                    {sel && mod.isPerUnit && (
                      <div className="flex items-center gap-2 mt-2 ml-8" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-gray-500">Anzahl {mod.unitLabel ?? "Einheiten"}:</span>
                        <button
                          onClick={() => setQuantity(mod.id, getQty(mod.id) - 1)}
                          className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold">{getQty(mod.id)}</span>
                        <button
                          onClick={() => setQuantity(mod.id, getQty(mod.id) + 1)}
                          className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Preiszusammenfassung */}
      {pricing && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">Monatlich ({billingCycle === "yearly" ? "bei Jahresabo" : "monatlich"})</span>
            <span className="text-xl font-black text-blue-700">{formatCHF(pricing.effectiveMonthly)}</span>
          </div>
          {pricing.oneTimeTotal > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Einmalige Gebühren</span>
              <span className="font-semibold">{formatCHF(pricing.oneTimeTotal)}</span>
            </div>
          )}
          {billingCycle === "yearly" && pricing.yearlySavings > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-green-700 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sie sparen {formatCHF(pricing.yearlySavings)} pro Jahr
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>
        <Button
          className="flex-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold flex-1"
          onClick={() => saveModules.mutate({ sessionToken, selectedModules: selected, billingCycle })}
          disabled={saveModules.isPending}
        >
          {saveModules.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Weiter: Vertrag
          <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Schritt 3: Vertrag unterzeichnen ─────────────────────────────────────────

function StepContract({
  sessionToken,
  sessionData,
  onNext,
  onBack,
}: {
  sessionToken: string;
  sessionData: any;
  onNext: (contractId: number, restaurantId: number) => void;
  onBack: () => void;
}) {
  const [signedByName, setSignedByName] = useState(sessionData?.companyContact || sessionData?.restaurantName || "");
  const [signedByEmail, setSignedByEmail] = useState(sessionData?.restaurantEmail || "");
  const [accepted, setAccepted] = useState(false);
  const [showContract, setShowContract] = useState(false);

  const pricing = sessionData?.pricing;

  const signContract = trpc.onboarding.signContract.useMutation({
    onSuccess: (data) => onNext(data.contractId, data.restaurantId),
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return toast.error("Bitte akzeptieren Sie die AGB und den Vertrag");
    signContract.mutate({
      sessionToken,
      signedByName,
      signedByEmail,
      acceptedTerms: true,
      origin: window.location.origin,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Vertrag unterzeichnen</h2>
        <p className="text-gray-500 text-sm">Lesen Sie den Vertrag und unterzeichnen Sie digital.</p>
      </div>

      {/* Vertragsvorschau */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => setShowContract(!showContract)}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm text-gray-800">Vertragsinhalt anzeigen</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showContract ? "rotate-90" : ""}`} />
        </div>
        {showContract && (
          <div className="p-4 text-xs text-gray-600 space-y-3 max-h-60 overflow-y-auto bg-white">
            <div className="font-bold text-gray-800">DIENSTLEISTUNGSVERTRAG – SimplaPOS AG</div>
            <p><strong>Vertragspartner:</strong> SimplaPOS AG, Schweiz</p>
            <p><strong>Kunde:</strong> {sessionData?.restaurantName || "—"}, {sessionData?.restaurantAddress || ""}, {sessionData?.restaurantZip || ""} {sessionData?.restaurantCity || ""}</p>
            {pricing && (
              <p><strong>Monatliche Gebühr:</strong> CHF {pricing.effectiveMonthly?.toFixed(2)} (inkl. MwSt. 8.1%)</p>
            )}
            <p><strong>Vertragslaufzeit:</strong> Monatlich kündbar (Kündigungsfrist: 30 Tage zum Monatsende)</p>
            <p><strong>Testphase:</strong> 7 Tage voller Zugriff auf alle Funktionen – danach 7 Tage nur die Module, die Sie hier ausgewählt haben. Kostenlos, keine Kreditkarte nötig.</p>
            <p><strong>Zahlungsbedingungen:</strong> Monatlich im Voraus per Kreditkarte oder TWINT</p>
            <p><strong>Datenschutz:</strong> Alle Daten werden auf Schweizer Servern gespeichert. Keine Weitergabe an Dritte.</p>
            <p><strong>Support:</strong> E-Mail-Support inklusive. Telefonischer Support je nach Paket.</p>
            <p><strong>MwSt.:</strong> Alle Preise verstehen sich exkl. MwSt. (8.1%). Die MwSt. wird auf der Rechnung separat ausgewiesen.</p>
            <Separator className="my-2" />
            <p className="text-gray-400">Vollständige AGB unter: simplapos.ch/agb</p>
          </div>
        )}
      </div>

      {/* Zusammenfassung */}
      {pricing && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="font-semibold text-sm text-gray-700 mb-2">Ihre Bestellung</div>
          {sessionData?.selectedModules?.map((m: any) => (
            <div key={m.moduleId} className="flex justify-between text-sm text-gray-600">
              <span>{m.moduleId.replace(/_/g, " ")} {m.quantity > 1 ? `(×${m.quantity})` : ""}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-bold text-gray-900">
            <span>Monatlich</span>
            <span>CHF {pricing.effectiveMonthly?.toFixed(2)}</span>
          </div>
          {pricing.oneTimeTotal > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Einmalig</span>
              <span>CHF {pricing.oneTimeTotal?.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Unterzeichnung */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="signedByName" className="flex items-center gap-1.5 mb-1.5">
            <User className="w-3.5 h-3.5 text-blue-500" />
            Vor- und Nachname <span className="text-red-500">*</span>
          </Label>
          <Input id="signedByName" value={signedByName} onChange={e => setSignedByName(e.target.value)}
            placeholder="Marco Ferretti" required style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="signedByEmail" className="flex items-center gap-1.5 mb-1.5">
            <Mail className="w-3.5 h-3.5 text-blue-500" />
            E-Mail <span className="text-red-500">*</span>
          </Label>
          <Input id="signedByEmail" type="email" value={signedByEmail} onChange={e => setSignedByEmail(e.target.value)}
            placeholder="marco@restaurant.ch" required style={{ fontSize: "16px" }} />
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 border border-blue-100">
        <Checkbox
          id="acceptTerms"
          checked={accepted}
          onCheckedChange={(v) => setAccepted(!!v)}
          className="mt-0.5"
        />
        <label htmlFor="acceptTerms" className="text-sm text-gray-700 cursor-pointer leading-relaxed">
          Ich habe den Vertrag gelesen und akzeptiere die{" "}
          <span className="text-blue-600 underline cursor-pointer">Allgemeinen Geschäftsbedingungen</span>{" "}
          sowie die{" "}
          <span className="text-blue-600 underline cursor-pointer">Datenschutzerklärung</span>{" "}
          der SimplaPOS AG. Mit meiner digitalen Unterschrift bestätige ich die Verbindlichkeit dieses Vertrags.
        </label>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          disabled={signContract.isPending || !accepted}>
          {signContract.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
          Vertrag unterzeichnen
          <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </form>
  );
}

// ─── Schritt 4: Zahlung ───────────────────────────────────────────────────────

function StepPayment({
  sessionToken,
  onNext,
  onBack,
}: {
  sessionToken: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [, navigate] = useLocation();
  const { data: status } = trpc.onboarding.checkPayment.useQuery(
    { sessionToken },
    { refetchInterval: 3000 }
  );

  const createCheckout = trpc.onboarding.createCheckout.useMutation({
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-advance wenn bereits bezahlt
  useEffect(() => {
    if (status?.paid) onNext();
  }, [status?.paid]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Zahlung abschliessen</h2>
        <p className="text-gray-500 text-sm">Sicher bezahlen mit Kreditkarte, TWINT oder Apple Pay.</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-green-800 text-sm">Vertrag erfolgreich unterzeichnet!</div>
          <div className="text-green-700 text-xs mt-0.5">
            Sie erhalten eine Bestätigungs-E-Mail mit Ihrer Vertragsübersicht.
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-blue-500" />
          Zahlungsmethoden
        </div>
        {[
          { icon: "💳", label: "Kreditkarte (Visa, Mastercard, Amex)" },
          { icon: "📱", label: "TWINT" },
          { icon: "", label: "Apple Pay / Google Pay" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-3 text-sm text-gray-700">
            <span className="text-lg">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-start gap-2 text-sm text-blue-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
          <div>
            <strong>7 Tage vollen Zugriff testen, danach 7 Tage nur Ihre gewählten Module.</strong> Ihre Karte wird erst nach Ablauf der Testphase belastet.
            Sie können jederzeit kündigen.
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Zurück
        </Button>
        <Button
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          onClick={() => createCheckout.mutate({ sessionToken, origin: window.location.origin })}
          disabled={createCheckout.isPending}
        >
          {createCheckout.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
          Zur sicheren Zahlung
          <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>

      <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3" />
        Sichere Zahlung via Stripe – SSL-verschlüsselt
      </p>
    </div>
  );
}

// ─── Schritt 5: Admin aktivieren ──────────────────────────────────────────────

function StepActivate({
  sessionToken,
  sessionEmail,
  onDone,
}: {
  sessionToken: string;
  sessionEmail: string;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(sessionEmail || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);

  const activateAdmin = trpc.onboarding.activateAdmin.useMutation({
    onSuccess: () => onDone(),
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwörter stimmen nicht überein");
    if (password.length < 8) return toast.error("Passwort mindestens 8 Zeichen");
    activateAdmin.mutate({ sessionToken, name, email, password });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Admin-Zugang aktivieren</h2>
        <p className="text-gray-500 text-sm">Setzen Sie Ihr Passwort und starten Sie sofort.</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-green-800 text-sm">Zahlung erfolgreich!</div>
          <div className="text-green-700 text-xs mt-0.5">
            Ihr Konto ist bereit. Setzen Sie jetzt Ihr Passwort.
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="activateName" className="flex items-center gap-1.5 mb-1.5">
            <User className="w-3.5 h-3.5 text-blue-500" />
            Ihr Name <span className="text-red-500">*</span>
          </Label>
          <Input id="activateName" value={name} onChange={e => setName(e.target.value)}
            placeholder="Marco Ferretti" required style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="activateEmail" className="flex items-center gap-1.5 mb-1.5">
            <Mail className="w-3.5 h-3.5 text-blue-500" />
            E-Mail (Login) <span className="text-red-500">*</span>
          </Label>
          <Input id="activateEmail" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="marco@restaurant.ch" required style={{ fontSize: "16px" }} />
        </div>
        <div>
          <Label htmlFor="activatePw" className="flex items-center gap-1.5 mb-1.5">
            <Lock className="w-3.5 h-3.5 text-blue-500" />
            Passwort <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input id="activatePw" type={showPw ? "text" : "password"} value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Mindestens 8 Zeichen"
              required minLength={8} style={{ fontSize: "16px" }} className="pr-10" />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-1 mt-1.5">
            {[8, 12, 16].map(len => (
              <div key={len} className={`h-1 flex-1 rounded-full transition-colors ${
                password.length >= len ? "bg-green-400" : "bg-gray-200"
              }`} />
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="activateConfirm" className="mb-1.5 block">
            Passwort bestätigen <span className="text-red-500">*</span>
          </Label>
          <Input id="activateConfirm" type={showPw ? "text" : "password"} value={confirm}
            onChange={e => setConfirm(e.target.value)} placeholder="Passwort wiederholen"
            required style={{ fontSize: "16px" }} />
          {confirm && password !== confirm && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Passwörter stimmen nicht überein
            </p>
          )}
        </div>
      </div>

      <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-base font-semibold"
        disabled={activateAdmin.isPending || password !== confirm}>
        {activateAdmin.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
        Konto aktivieren & einloggen
      </Button>
    </form>
  );
}

// ─── Fertig-Screen ────────────────────────────────────────────────────────────

function StepDone() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const t = setTimeout(() => navigate("/dashboard"), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Willkommen bei SimplaPOS!</h2>
        <p className="text-gray-500">Ihr Konto ist aktiviert. Sie werden in wenigen Sekunden weitergeleitet...</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {["7 Tage voller Zugriff aktiv", "Alle Module freigeschaltet", "Support verfügbar"].map(t => (
          <div key={t} className="flex items-center gap-1.5 text-sm text-green-700 bg-green-50 rounded-full px-3 py-1.5">
            <Star className="w-3.5 h-3.5 fill-green-500 text-green-500" />
            {t}
          </div>
        ))}
      </div>
      <Button onClick={() => navigate("/dashboard")} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
        Zum Dashboard
        <ChevronRight className="ml-2 w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Haupt-Wizard ─────────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const search = useSearch();
  const urlCountry = new URLSearchParams(search).get("country") ?? localStorage.getItem("simplapos_country") ?? "CH";
  const [countryCode, setCountryCode] = useState<string>(urlCountry);
  const [step, setStep] = useState<WizardStep>("info");
  const [sessionToken, setSessionToken] = useState<string>(() => localStorage.getItem(SESSION_KEY) || "");
  const [sessionData, setSessionData] = useState<any>(null);
  const [contractId, setContractId] = useState<number | null>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);

  // Country-Config laden
  const { data: countryConfig } = trpc.countryConfig.getByCode.useQuery(
    { countryCode },
    { staleTime: 5 * 60 * 1000 }
  );
  const { data: allCountries = [] } = trpc.countryConfig.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // Session-Status beim Laden prüfen
  const { data: existingSession } = trpc.onboarding.getSessionStatus.useQuery(
    { sessionToken },
    { enabled: !!sessionToken, retry: false }
  );

  useEffect(() => {
    if (existingSession && !existingSession.completed) {
      setStep(existingSession.step as WizardStep);
      setSessionData(existingSession.data);
      if (existingSession.contractId) setContractId(existingSession.contractId);
      if (existingSession.restaurantId) setRestaurantId(existingSession.restaurantId);
    }
  }, [existingSession]);

  const handleInfoNext = (token: string, data: any) => {
    setSessionToken(token);
    setSessionData(data);
    setStep("modules");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Utensils className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900">SimplaPOS</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {allCountries.length > 1 && (
            <select
              value={countryCode}
              onChange={e => { setCountryCode(e.target.value); localStorage.setItem("simplapos_country", e.target.value); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {allCountries.map((c: any) => (
                <option key={c.countryCode} value={c.countryCode}>{c.flag} {c.name}</option>
              ))}
            </select>
          )}
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Sichere Verbindung
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {step !== "done" && <StepIndicator current={step} />}

          <Card className="shadow-lg border border-gray-100">
            <CardContent className="p-6 sm:p-8">
              {step === "info" && (
                <StepInfo onNext={handleInfoNext} />
              )}
              {step === "modules" && sessionToken && (
                <StepModules
                  sessionToken={sessionToken}
                  onNext={() => setStep("contract")}
                  onBack={() => setStep("info")}
                />
              )}
              {step === "contract" && sessionToken && (
                <StepContract
                  sessionToken={sessionToken}
                  sessionData={sessionData}
                  onNext={(cId, rId) => {
                    setContractId(cId);
                    setRestaurantId(rId);
                    setStep("payment");
                  }}
                  onBack={() => setStep("modules")}
                />
              )}
              {step === "payment" && sessionToken && (
                <StepPayment
                  sessionToken={sessionToken}
                  onNext={() => setStep("activate")}
                  onBack={() => setStep("contract")}
                />
              )}
              {step === "activate" && sessionToken && (
                <StepActivate
                  sessionToken={sessionToken}
                  sessionEmail={sessionData?.restaurantEmail || sessionData?.signedByEmail || ""}
                  onDone={() => {
                    localStorage.removeItem(SESSION_KEY);
                    setStep("done");
                  }}
                />
              )}
              {step === "done" && <StepDone />}
            </CardContent>
          </Card>

          {step !== "done" && (
            <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-green-400" />
              Ihre Daten sind sicher · DSGVO-konform · Schweizer Server
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
