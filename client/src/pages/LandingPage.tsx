/**
 * LandingPage.tsx – Multi-Country Landing Page für SimplaPOS
 * IP-basierte Länder-Erkennung + manueller Länder-Switcher
 * Alle Preise, Texte, Compliance-Badges aus DB-Konfiguration
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, ShieldCheck, BarChart3, Smartphone, Utensils,
  CreditCard, Users, Star, ArrowRight, Globe,
  Printer, QrCode, TrendingUp, Lock, ChevronDown, X, Zap
} from "lucide-react";

interface TaxRate { name: string; rate: number; code: string; }
interface ComplianceFlags {
  fiscalRequired: boolean; fiscalSystem: string | null; gobdRequired: boolean;
  atkRequired: boolean; qrBillRequired: boolean; vatRegistrationThreshold: number;
  notes: string; fiscalNote?: string;
}
interface PricingPlan { monthly: number; currency: string; label: string; }
interface ModulePrice { monthly: number; currency: string; }

const FEATURES = [
  { icon: Utensils, titleDe: "Digitale Speisekarte", titleSq: "Menu Dixhital", descDe: "QR-Code-Menü, Mehrsprachigkeit, Allergene & Nährwerte – immer aktuell.", descSq: "Meny me kod QR, shumëgjuhësh, alergjene & vlera ushqyese – gjithmonë aktuale.", color: "text-orange-500", bg: "bg-orange-50" },
  { icon: Smartphone, titleDe: "Cloud-Kassensystem", titleSq: "Sistem Arke Cloud", descDe: "Tablet-basierte POS-Lösung. Bestellungen, Tischverwaltung und Abrechnung.", descSq: "Zgjidhje POS bazuar në tablet. Porosi, menaxhim tavolinash dhe faturim.", color: "text-blue-600", bg: "bg-blue-50" },
  { icon: BarChart3, titleDe: "Echtzeit-Dashboard", titleSq: "Panel në Kohë Reale", descDe: "Tagesumsatz, Bestseller, Tischauslastung – live auf dem Smartphone.", descSq: "Xhiroja ditore, bestsellers, zënia e tavolinave – live në smartphone.", color: "text-green-600", bg: "bg-green-50" },
  { icon: Printer, titleDe: "Küchenmonitor (KDS)", titleSq: "Monitor Kuzhine (KDS)", descDe: "Bestellungen erscheinen sofort auf dem Küchenbildschirm.", descSq: "Porositë shfaqen menjëherë në ekranin e kuzhinës.", color: "text-purple-600", bg: "bg-purple-50" },
  { icon: QrCode, titleDe: "Self-Order Kiosk", titleSq: "Kiosk Vetë-Porosie", descDe: "Gäste bestellen selbst am Terminal. Weniger Wartezeit, mehr Umsatz.", descSq: "Mysafirët porosisin vetë. Më pak pritje, më shumë xhiro.", color: "text-pink-600", bg: "bg-pink-50" },
  { icon: CreditCard, titleDe: "Integrierte Zahlung", titleSq: "Pagesë e Integruar", descDe: "Karte, TWINT, Apple Pay – alles direkt im System.", descSq: "Kartë, pagesë elektronike – gjithçka drejtpërdrejt në sistem.", color: "text-teal-600", bg: "bg-teal-50" },
  { icon: Users, titleDe: "Personalplanung", titleSq: "Planifikimi i Stafit", descDe: "Schichtplanung, Abwesenheiten, KI-gestützte Einsatzplanung.", descSq: "Planifikimi i turneve, mungesat, planifikimi me AI.", color: "text-indigo-600", bg: "bg-indigo-50" },
  { icon: ShieldCheck, titleDe: "Steuerkonform", titleSq: "Konform Tatimor", descDe: "Konforme Abrechnung nach lokalen Steuergesetzen.", descSq: "Faturim konform me ligjet tatimore lokale.", color: "text-red-600", bg: "bg-red-50" },
  { icon: TrendingUp, titleDe: "Kundenbindung", titleSq: "Besnikëria e Klientëve", descDe: "Treueprogramm, Bewertungsmanagement, Newsletter.", descSq: "Program besnikërie, menaxhim vlerësimesh, newsletter.", color: "text-yellow-600", bg: "bg-yellow-50" },
];

const MODULE_LABELS: Record<string, { de: string; sq: string }> = {
  extra_terminal: { de: "Zusätzliche Kasse", sq: "Arkë Shtesë" },
  kds: { de: "Küchenmonitor (KDS)", sq: "Monitor Kuzhine" },
  kiosk: { de: "Self-Order Kiosk", sq: "Kiosk Vetë-Porosie" },
  staff_planning: { de: "Personalplanung", sq: "Planifikim Stafi" },
  loyalty: { de: "Kundenbindung", sq: "Besnikëri Klientësh" },
  reservations: { de: "Reservierungen", sq: "Rezervime" },
  takeaway: { de: "Take-away / Lieferung", sq: "Marrje / Dërgim" },
  marketing: { de: "Marketing & Newsletter", sq: "Marketing & Newsletter" },
};

function CountrySwitcher({ currentCode, countries, onChange }: {
  currentCode: string;
  countries: Array<{ countryCode: string; name: string; flag: string | null }>;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = countries.find(c => c.countryCode === currentCode);
  if (countries.length <= 1) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50 border border-gray-200">
        <Globe className="w-3.5 h-3.5" />
        <span>{current?.flag} {current?.name}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-50 min-w-[160px] overflow-hidden">
          {countries.map(c => (
            <button key={c.countryCode} onClick={() => { onChange(c.countryCode); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors text-left ${c.countryCode === currentCode ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}>
              <span className="text-base">{c.flag}</span>
              <span>{c.name}</span>
              {c.countryCode === currentCode && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComplianceBanner({ flags, lang }: { flags: ComplianceFlags; lang: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (!flags.fiscalRequired || dismissed) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span>{lang === "sq" ? `Fiskalizimi ${flags.fiscalSystem} është i detyrueshëm ligjërisht. ${flags.fiscalNote ?? ""}` : `${flags.fiscalSystem}-Fiskalisierung gesetzlich vorgeschrieben. ${flags.fiscalNote ?? ""}`}</span>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700 flex-shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}

export default function LandingPage() {
  const [countryCode, setCountryCode] = useState<string>("CH");
  const [detectionDone, setDetectionDone] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("simplapos_country");
    if (saved) { setCountryCode(saved); setDetectionDone(true); }
  }, []);

  const { data: detected } = trpc.countryConfig.detectByIp.useQuery({}, { enabled: !detectionDone, staleTime: Infinity });
  useEffect(() => {
    if (detected && !detectionDone) { setCountryCode(detected.countryCode); setDetectionDone(true); }
  }, [detected, detectionDone]);

  const { data: allCountries = [] } = trpc.countryConfig.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: config, isLoading } = trpc.countryConfig.getByCode.useQuery({ countryCode }, { staleTime: 5 * 60 * 1000, enabled: !!countryCode });

  const handleCountryChange = useCallback((code: string) => {
    setCountryCode(code); localStorage.setItem("simplapos_country", code);
  }, []);

  const lang = config?.defaultLanguage === "sq" ? "sq" : "de";
  const basePrice = (config?.pricingPlans as Record<string, PricingPlan> | null)?.modular?.monthly ?? (config?.pricingPlans as Record<string, PricingPlan> | null)?.starter?.monthly ?? 89;
  const currency = config?.currencySymbol ?? "CHF";
  const modules = (config?.modulePricing as Record<string, ModulePrice> | null) ?? {};
  const compliance = config?.complianceFlags as ComplianceFlags | undefined;
  const lc = config?.landingContent as Record<string, any> | null | undefined;

  const heroSubtitle = lang === "sq" ? (lc?.heroSubtitle ?? "") : (lc?.heroSubtitleDe ?? lc?.heroSubtitle ?? "Cloud-POS, digitale Speisekarte, Küchenmonitor, Personalplanung und steuerkonformer Abrechnung – alles in einem System.");
  const heroCtaText = lang === "sq" ? (lc?.heroCtaText ?? "Filloni falas") : "14 Tage gratis testen";
  const statsBar: Array<{ value: string; label: string }> = lc?.statsBar ?? [];
  const pricingTitle = lang === "sq" ? (lc?.pricingTitle ?? "Çmime transparente") : (lc?.pricingTitleDe ?? "Nur zahlen, was Sie nutzen");
  const pricingSubtitle = lang === "sq" ? (lc?.pricingSubtitle ?? "") : (lc?.pricingSubtitleDe ?? "Modulares Preismodell – kein verstecktes Kleingedrucktes.");

  const complianceBadges: string[] = [];
  if (compliance?.qrBillRequired) complianceBadges.push("🇨🇭 QR-Rechnung");
  if (compliance?.atkRequired) complianceBadges.push("ATK Konform");
  if (compliance?.gobdRequired) complianceBadges.push("GoBD");
  if (config?.countryCode === "CH") complianceBadges.push("MWSTG-konform");
  if ((config?.availablePaymentMethods as string[] | null)?.includes("twint")) complianceBadges.push("TWINT Ready");

  const switcherCountries = allCountries.map((c: { countryCode: string; name: string; flag: string | null }) => ({ countryCode: c.countryCode, name: c.name, flag: c.flag }));
  const hasBanner = compliance?.fiscalRequired;

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      {compliance && <ComplianceBanner flags={compliance} lang={lang} />}

      {/* Navigation */}
      <nav className={`fixed left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm ${hasBanner ? "top-10" : "top-0"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Utensils className="w-4 h-4 text-white" /></div>
            <span className="font-bold text-xl text-gray-900">SimplaPOS</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">{lang === "sq" ? "Funksionet" : "Funktionen"}</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">{lang === "sq" ? "Çmimet" : "Preise"}</a>
            <a href="#testimonials" className="hover:text-blue-600 transition-colors">{lang === "sq" ? "Referenca" : "Referenzen"}</a>
          </div>
          <div className="flex items-center gap-2">
            <CountrySwitcher currentCode={countryCode} countries={switcherCountries} onChange={handleCountryChange} />
            <Link href="/login"><Button variant="ghost" size="sm" className="text-gray-600 hover:text-blue-600 hidden sm:flex">{lang === "sq" ? "Hyrje" : "Anmelden"}</Button></Link>
            <Link href={`/onboarding?country=${countryCode}`}><Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">{lang === "sq" ? "Fillo falas" : "Kostenlos starten"}</Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={`pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-indigo-50 ${hasBanner ? "pt-36" : "pt-28"}`}>
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {complianceBadges.map(b => <Badge key={b} className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">{b}</Badge>)}
                {config && <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100 border-0">{config.flag} {config.name}</Badge>}
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
                {isLoading ? <span className="text-blue-600">SimplaPOS</span> : (
                  lang === "sq"
                    ? <><span>Sistemi modern i </span><span className="text-blue-600">arkës</span><span> për Kosovën</span></>
                    : <><span>Das modernste </span><span className="text-blue-600">Kassensystem</span><span> für Gastronomen</span></>
                )}
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">{heroSubtitle}</p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href={`/onboarding?country=${countryCode}`}>
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.97] w-full sm:w-auto">
                    {heroCtaText}<ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="px-8 py-4 text-lg border-gray-300 w-full sm:w-auto">
                  {lang === "sq" ? "Demo shiko" : "Demo ansehen"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                {[lang === "sq" ? "Pa kartë krediti" : "Keine Kreditkarte", lang === "sq" ? "14 ditë falas" : "14 Tage gratis", lang === "sq" ? "Anulim mujor" : "Monatlich kündbar"].map(t => (
                  <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" />{t}</span>
                ))}
              </div>
            </div>
            {/* Stats Panel */}
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-gray-900">{lang === "sq" ? "Panel Live" : "Live Dashboard"}</span>
                <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />Live
                </span>
              </div>
              {[
                { label: lang === "sq" ? "Xhiroja sot" : "Umsatz heute", value: `${currency} ${lang === "sq" ? "1'240" : "2'847"}` },
                { label: lang === "sq" ? "Porosi aktive" : "Aktive Bestellungen", value: "12" },
                { label: lang === "sq" ? "Ø Vlera Porosie" : "Ø Bon-Wert", value: `${currency} ${lang === "sq" ? "38.50" : "62.50"}` },
                { label: lang === "sq" ? "Tavolina aktive" : "Belegte Tische", value: "8 / 24" },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">{s.label}</span>
                  <span className="font-bold text-gray-900">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-10 px-4 bg-blue-600">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {(statsBar.length > 0 ? statsBar : [
            { value: lang === "sq" ? "50+" : "500+", label: lang === "sq" ? "Restorante" : "Restaurants" },
            { value: lang === "sq" ? "€1M+" : "CHF 50M+", label: lang === "sq" ? "Xhiro e procesuar" : "Umsatz verarbeitet" },
            { value: "99.9%", label: lang === "sq" ? "Disponueshmëri" : "Verfügbarkeit" },
            { value: "4.9/5", label: lang === "sq" ? "Vlerësim" : "Bewertung" },
          ]).map((s, i) => (
            <div key={i}><div className="text-3xl font-black text-white">{s.value}</div><div className="text-blue-200 text-sm mt-1">{s.label}</div></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-blue-50 text-blue-700 border-0">{lang === "sq" ? "Funksionet" : "Funktionen"}</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">{lang === "sq" ? "Gjithçka që nevojitet restoranti juaj" : "Alles was Ihr Restaurant braucht"}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="p-5 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all">
                <div className={`w-10 h-10 ${f.bg} rounded-xl flex items-center justify-center mb-3`}><f.icon className={`w-5 h-5 ${f.color}`} /></div>
                <h3 className="font-bold text-gray-900 mb-1.5">{lang === "sq" ? f.titleSq : f.titleDe}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{lang === "sq" ? f.descSq : f.descDe}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steuer-Info */}
      {config && (
        <section className="py-12 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-green-600" /></div>
                <div>
                  <h3 className="font-bold text-gray-900">{lang === "sq" ? "Konformitet Tatimor" : "Steuerkonformität"} – {config.flag} {config.name}</h3>
                  <p className="text-sm text-gray-500">{lang === "sq" ? "Normat tatimore dhe kërkesat ligjore" : "Steuersätze und gesetzliche Anforderungen"}</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{lang === "sq" ? "Normat e TVSH-së" : "MwSt.-Sätze"}</div>
                  <div className="space-y-2">
                    {(config.taxRates as TaxRate[]).map(t => (
                      <div key={t.code} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{t.name}</span>
                        <Badge className="bg-blue-50 text-blue-700 border-0">{t.rate}%</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{lang === "sq" ? "Metodat e Pagesës" : "Zahlungsmethoden"}</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {((config.availablePaymentMethods as string[] | null) ?? ["cash", "card"]).map(m => (
                      <Badge key={m} className="bg-gray-100 text-gray-700 border-0 capitalize">{m}</Badge>
                    ))}
                  </div>
                  {compliance?.notes && <p className="text-xs text-gray-400 leading-relaxed">{compliance.notes}</p>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Preise */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-green-50 text-green-700 border-0">{lang === "sq" ? "Çmimet" : "Preise"}</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">{pricingTitle}</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">{pricingSubtitle}</p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
              <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-white font-bold text-lg">{lang === "sq" ? "Arka Cloud Bazë" : "Cloud POS Basis"}</div>
                  <div className="text-blue-100 text-sm">{lang === "sq" ? "Modul i detyrueshëm – gjithçka e përfshirë" : "Pflichtmodul – alles inklusive"}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-white">{currency} {basePrice}</div>
                  <div className="text-blue-200 text-sm">{lang === "sq" ? "/ muaj" : "/ Monat"}</div>
                </div>
              </div>
              <div className="p-6">
                <div className="grid sm:grid-cols-2 gap-3 mb-6">
                  {(lang === "sq" ? ["1 arkë POS e përfshirë", "Menu dixhital", "Panel xhiroje", "Faturë dixhitale", "Funksion bakshishi", "Faturim konform tatimor", "Mbështetje me email", "7 ditë akses i plotë + 7 ditë modulet tuaja"] : ["1 POS-Kasse inklusive", "Digitale Speisekarte", "Umsatz-Dashboard", "Digitale Quittung", "Trinkgeld-Funktion", "Steuerkonformer Abrechnung", "E-Mail-Support", "7 Tage voller Zugriff + 7 Tage Ihre Module"]).map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-gray-700"><CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />{f}</div>
                  ))}
                </div>
                {Object.keys(modules).length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <div className="text-sm font-semibold text-gray-600 mb-3">{lang === "sq" ? "Zgjerime opsionale:" : "Optionale Erweiterungen:"}</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {Object.entries(modules).map(([key, val]) => {
                        const label = MODULE_LABELS[key]?.[lang === "sq" ? "sq" : "de"] ?? key.replace(/_/g, " ");
                        return (
                          <div key={key} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                            <span className="text-gray-700">{label}</span>
                            <span className="font-semibold text-gray-900">{currency} {(val as ModulePrice).monthly}<span className="text-gray-400 font-normal">{lang === "sq" ? "/mj" : "/Mo"}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="text-center mt-8">
              <Link href={`/onboarding?country=${countryCode}`}>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.97]">
                  {lang === "sq" ? "Zgjidh modulet & fillo" : "Module auswählen & starten"}<ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <p className="text-sm text-gray-400 mt-3">{lang === "sq" ? "Pa tarifë instalimi · Anulim mujor · Çdo vit 2 muaj falas" : "Keine Einrichtungsgebühr · Monatlich kündbar · Jährlich 2 Monate gratis"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <Badge className="mb-3 bg-yellow-50 text-yellow-700 border-0">{lang === "sq" ? "Referenca" : "Kundenstimmen"}</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">{lang === "sq" ? "Çfarë thonë klientët tanë" : "Was unsere Kunden sagen"}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(lang === "sq" ? [
              { name: "Arben Krasniqi", role: "Pronari, Restoranti Iliria, Prishtinë", text: "SimplaPOS na ndihmoi të dixhitalizojmë restorantin tonë. Sistemi është i thjeshtë dhe i besueshëm.", stars: 5 },
              { name: "Vjosa Berisha", role: "Menaxhere, Kafja Besa, Prizren", text: "Menaxhimi i tavolinave dhe porositë janë shumë më të lehta tani. Stafi u adaptua shpejt.", stars: 5 },
              { name: "Driton Hoxha", role: "Pronari, Pizzeria Kosova, Gjakovë", text: "Çmimet janë shumë të arsyeshme dhe mbështetja teknike është e shkëlqyer.", stars: 5 },
            ] : [
              { name: "Marco Rossi", role: "Inhaber, Ristorante da Marco, Zürich", text: "SimplaPOS hat unser Restaurant komplett digitalisiert. Das System ist intuitiv und zuverlässig.", stars: 5 },
              { name: "Sabine Müller", role: "Betreiberin, Café Sonnenschein, Bern", text: "Die TWINT-Integration und die MwSt.-konforme Abrechnung haben uns viel Zeit gespart.", stars: 5 },
              { name: "Ahmed Yilmaz", role: "Betreiber, Kebab Palace, Basel", text: "Endlich ein System, das Take-away und Vor-Ort-Bestellungen mit dem richtigen MwSt.-Satz abrechnet.", stars: 5 },
            ]).map((t, i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                <div className="flex gap-0.5 mb-3">{Array.from({ length: t.stars }).map((_, j) => <Star key={j} className="w-4 h-4 text-yellow-400 fill-yellow-400" />)}</div>
                <p className="text-gray-700 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div><div className="font-semibold text-gray-900 text-sm">{t.name}</div><div className="text-gray-400 text-xs">{t.role}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-blue-600">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">{lang === "sq" ? "Gati për të filluar?" : "Bereit loszulegen?"}</h2>
          <p className="text-blue-100 text-lg mb-8">{lang === "sq" ? "Bashkohuni me mbi 50+ restorante që tashmë përdorin SimplaPOS." : "Bereits über 500+ Gastronomiebetriebe vertrauen SimplaPOS."}</p>
          <Link href={`/onboarding?country=${countryCode}`}>
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-10 py-4 text-lg font-bold shadow-lg active:scale-[0.97]">
              {lang === "sq" ? "Fillo falas tani" : "Jetzt kostenlos starten"}<ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center"><Utensils className="w-3.5 h-3.5 text-white" /></div>
                <span className="font-bold text-white">SimplaPOS</span>
              </div>
              <p className="text-sm leading-relaxed">{lang === "sq" ? "Sistemi modern i arkës cloud për gastronomin kosovar." : "Das modulare Cloud-Kassensystem für Gastronomiebetriebe. Skalierbar, zuverlässig, weltweit."}</p>
              <div className="mt-4">
                <div className="text-xs text-gray-500 mb-2">{lang === "sq" ? "Ndërroni vendin:" : "Land wechseln:"}</div>
                <div className="flex flex-wrap gap-2">
                  {switcherCountries.map((c: { countryCode: string; name: string; flag: string | null }) => (
                    <button key={c.countryCode} onClick={() => handleCountryChange(c.countryCode)} className={`text-xs px-2 py-1 rounded-md transition-colors ${c.countryCode === countryCode ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                      {c.flag} {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="font-semibold text-white mb-3 text-sm">{lang === "sq" ? "Produkti" : "Produkt"}</div>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">{lang === "sq" ? "Funksionet" : "Funktionen"}</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">{lang === "sq" ? "Çmimet" : "Preise"}</a></li>
                <li><Link href={`/onboarding?country=${countryCode}`} className="hover:text-white transition-colors">{lang === "sq" ? "Regjistrohu" : "Registrieren"}</Link></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3 text-sm">{lang === "sq" ? "Ligjore" : "Rechtliches"}</div>
              <ul className="space-y-2 text-sm">
                <li><span>{lang === "sq" ? "Privatësia" : "Datenschutz"}</span></li>
                <li><span>{lang === "sq" ? "Kushtet" : "AGB"}</span></li>
                <li><span>Impressum</span></li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-white mb-3 text-sm">Support</div>
              <ul className="space-y-2 text-sm">
                <li><a href={`mailto:${config?.supportEmail ?? "support@simplapos.com"}`} className="hover:text-white transition-colors">{config?.supportEmail ?? "support@simplapos.com"}</a></li>
                {config?.supportPhone && <li><span>{config.supportPhone}</span></li>}
                <li><span>{lang === "sq" ? "Hën–Pre 08:00–18:00" : "Mo–Fr 08:00–18:00"}</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <span>© {new Date().getFullYear()} SimplaPOS. {lang === "sq" ? "Të gjitha të drejtat e rezervuara." : "Alle Rechte vorbehalten."}</span>
            <div className="flex items-center gap-4">
              {complianceBadges.slice(0, 2).map(b => <span key={b} className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-green-400" /> {b}</span>)}
              <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-blue-400" /> DSGVO</span>
              {config && <span className="flex items-center gap-1"><Globe className="w-3 h-3 text-gray-400" /> {config.flag} {config.name}</span>}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
