// ─── SIMPLAPOS MODULARE PREISSTRUKTUR ─────────────────────────────────────────

export type ModuleCategory =
  | "basis"
  | "hardware"
  | "betrieb"
  | "bestellung"
  | "kundenbindung"
  | "marketing"
  | "enterprise"
  | "support"
  | "einmalig"
  | "compliance";

export interface PricingModule {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  priceMonthly: number; // CHF pro Monat (0 = einmalig)
  priceOneTime: number; // CHF einmalig (0 = monatlich)
  isRequired: boolean; // Pflichtmodul (Basis)
  isPerUnit: boolean; // Pro Einheit (z.B. pro Kasse, pro KDS)
  unitLabel?: string; // z.B. "Kasse", "Bildschirm"
  maxUnits?: number; // Maximale Anzahl
}

// ─── ALLE MODULE ──────────────────────────────────────────────────────────────

export const MODULES: PricingModule[] = [
  // ── BASIS (Pflicht) ──
  {
    id: "cloud_pos_basis",
    name: "Cloud POS Basis",
    description: "1 Kasse, digitale Speisekarte, Umsatz-Dashboard, digitale Quittung, Trinkgeld-Funktion, E-Mail-Support",
    category: "basis",
    priceMonthly: 89,
    priceOneTime: 0,
    isRequired: true,
    isPerUnit: false,
  },

  // ── HARDWARE & STATIONEN ──
  {
    id: "extra_pos",
    name: "Zusätzliche POS-Kasse",
    description: "Für weitere Kassenstationen",
    category: "hardware",
    priceMonthly: 39,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: true,
    unitLabel: "Kasse",
    maxUnits: 20,
  },
  {
    id: "kds",
    name: "Küchenmonitor (KDS)",
    description: "Bestellungen in Echtzeit für die Küche",
    category: "hardware",
    priceMonthly: 29,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: true,
    unitLabel: "Bildschirm",
    maxUnits: 10,
  },
  {
    id: "self_order_kiosk",
    name: "Self-Order Kiosk",
    description: "Gäste bestellen selbst am Terminal",
    category: "hardware",
    priceMonthly: 95,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: true,
    unitLabel: "Kiosk",
    maxUnits: 10,
  },
  {
    id: "pickup_screen",
    name: "Abholstation (Pickup Screen)",
    description: "Bildschirm für Abholungsbenachrichtigungen",
    category: "hardware",
    priceMonthly: 19,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: true,
    unitLabel: "Bildschirm",
    maxUnits: 5,
  },

  // ── BETRIEB & PERSONAL ──
  {
    id: "personal",
    name: "Personalverwaltung",
    description: "Zeiterfassung, Schichtplan, Rollen",
    category: "betrieb",
    priceMonthly: 25,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: true,
    unitLabel: "Mitarbeiter",
    maxUnits: 50,
  },
  {
    id: "tischreservierung",
    name: "Tischreservierung",
    description: "Online-Buchung, Tischplan, Warteliste",
    category: "betrieb",
    priceMonthly: 49,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "inventar",
    name: "Inventarverwaltung",
    description: "Lagerbestand, Einkaufslisten, Warnungen bei Mindestbestand, Automatische Nachbestellung",
    category: "betrieb",
    priceMonthly: 149,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── BESTELLUNG & LIEFERUNG ──
  {
    id: "qr_bestellung",
    name: "QR-Code Bestellung & Bezahlung",
    description: "Gäste bestellen & bezahlen direkt am Tisch per QR-Code",
    category: "bestellung",
    priceMonthly: 79,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "online_zahlungen",
    name: "Online-Zahlungen Integration",
    description: "Integration für Online-Zahlungen (Twint, Kreditkarte, etc.). Transaktionsgebühren gemäss separatem Vertrag mit Zahlungsanbieter.",
    category: "bestellung",
    priceMonthly: 0,
    priceOneTime: 495,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "lieferung",
    name: "Liefermodul",
    description: "Eigener Lieferservice, Fahrer-Tracking, Lieferzonen",
    category: "bestellung",
    priceMonthly: 59,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "qr_rechnung",
    name: "Kauf auf Rechnung (QR-Rechnung)",
    description: "Schweizer QR-Rechnung für B2B-Kunden. Per E-Mail, inkl. automatische Erinnerungen",
    category: "bestellung",
    priceMonthly: 29,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── KUNDENBINDUNG ──
  {
    id: "gutscheine",
    name: "Gutschein-System",
    description: "Rabattcodes, Aktionen, zeitlich begrenzte Angebote. E-Mail und WhatsApp Marketing",
    category: "kundenbindung",
    priceMonthly: 29,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "loyalty",
    name: "Geschenkkarten & Treuepunkte",
    description: "Digitale Geschenkkarten, Punkte sammeln & einlösen. Digitale Stempelkarte. Auf Wunsch: PVC Kreditkarten-Geschenkkarten, Pro Karte und Verpackung CHF 5.-",
    category: "kundenbindung",
    priceMonthly: 39,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── MARKETING & WACHSTUM ──
  {
    id: "ai_marketing",
    name: "AI Marketing Agent",
    description: "Foto oder Video machen → KI analysiert den Inhalt, erstellt optimierte Texte & postet automatisch auf Instagram, Facebook, Google & TikTok. Inkl. 30 Posts/Monat. KI kennt dein Restaurant und erwähnt es in jedem Post.",
    category: "marketing",
    priceMonthly: 149,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "ai_marketing_pro",
    name: "AI Marketing Agent Pro",
    description: "Alles aus AI Marketing Agent + Story-Erstellung, Video-Analyse, Wettbewerbs-Analyse, Posting-Kalender, unbegrenzte Posts, A/B-Testing, Prioritäts-Support",
    category: "marketing",
    priceMonthly: 249,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "branded_app",
    name: "Eigene Branded App",
    description: "Eigene App im App Store & Play Store mit eurem Logo. Push-Benachrichtigungen, Treueprogramm, Geschenkkarten-System, Onlineshop, Tischreservierung, Marketingstrategien",
    category: "marketing",
    priceMonthly: 199,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  {
    id: "bewertungsmanagement",
    name: "Bewertungsmanagement",
    description: "Google & TripAdvisor Bewertungen im Dashboard verwalten, auf Bewertungen antworten, Bewertungs-QR-Code für Tische",
    category: "marketing",
    priceMonthly: 14,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── ENTERPRISE & MULTI-LOCATION ──
  {
    id: "multi_location",
    name: "Multi-Location Management",
    description: "Zentrale Verwaltung aller Standorte, übergreifende Statistiken, einheitliche Speisekarte",
    category: "enterprise",
    priceMonthly: 129,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "api_access",
    name: "API-Zugang & Integrationen",
    description: "REST API, Webhooks, Anbindung an Buchhaltung (Bexio, Abacus), PMS-Systeme",
    category: "enterprise",
    priceMonthly: 79,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "food_rescue",
    name: "Food Rescue (Surplus)",
    description: "Überschüssige Portionen zu reduziertem Preis anbieten. Abholstation",
    category: "enterprise",
    priceMonthly: 29,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── COMPLIANCE & BUCHHALTUNG ──
  {
    id: "kassenbuch",
    name: "Kassenbuch & Tagesabschluss",
    description: "Digitales Kassenbuch, gesetzeskonforme Tagesabschlüsse (CH/DE/AT), Kassensturz, Z-Bon",
    category: "compliance",
    priceMonthly: 19,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "steuerexport",
    name: "Steuerberater-Export",
    description: "CSV/DATEV-Export aller Umsätze, MwSt-Auswertung, direkt für Buchhaltung und Steuerberater",
    category: "compliance",
    priceMonthly: 9,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "allergene",
    name: "Allergene & Nährwerte",
    description: "EU-konforme Allergen-Deklaration (14 Pflichtallergene), Nährwertangaben, Diät-Filter (vegan, vegetarisch, glutenfrei)",
    category: "compliance",
    priceMonthly: 9,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "multilang_menu",
    name: "Mehrsprachige Speisekarte",
    description: "Speisekarte in DE/FR/EN/IT – Gäste wählen ihre Sprache beim QR-Scan. Wichtig für Tourismus-Regionen.",
    category: "compliance",
    priceMonthly: 19,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── SMART BUILDING & IoT ──
  {
    id: "smart_building",
    name: "Smart Building & IoT",
    description: "Tuya-Integration: Temperatursensoren, Bewegungsmelder, Schalter, Lichter, Wasserleck, Feuer/Rauch, CO2, Energie – HACCP-konforme Protokolle, Echtzeit-Alarme",
    category: "compliance",
    priceMonthly: 29,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── MARKETING AUTOMATISIERUNG ──
  {
    id: "marketing_auto",
    name: "Marketing-Automatisierung",
    description: "KI-Bildanalyse & automatisches Posting auf Instagram, Facebook, Google Business, TikTok. Bewertungs-Booster (SMS/WhatsApp nach Zahlung), Stammkunden-Reaktivierung, Geburtstags-Kampagnen, Slow-Day-Aktionen, wöchentlicher Marketing-Report. Intelligenter Kellner-Kamera-Flow.",
    category: "marketing",
    priceMonthly: 49,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── SUPPORT ──
  {
    id: "support_priority",
    name: "Priority Support",
    description: "Chat & E-Mail, Antwort innerhalb 4h, Telefon Mo–Fr",
    category: "support",
    priceMonthly: 39,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "support_premium",
    name: "Premium 24/7 Support",
    description: "24/7 Telefon, dedizierter Ansprechpartner, SLA 1h",
    category: "support",
    priceMonthly: 99,
    priceOneTime: 0,
    isRequired: false,
    isPerUnit: false,
  },

  // ── EINMALIGE GEBÜHREN ──
  {
    id: "setup_standard",
    name: "Setup-Service Standard",
    description: "Installation, Konfiguration, 2h Schulung vor Ort",
    category: "einmalig",
    priceMonthly: 0,
    priceOneTime: 499,
    isRequired: false,
    isPerUnit: false,
  },
  {
    id: "setup_premium",
    name: "Setup-Service Premium",
    description: "Alles aus Standard + 2 Wochen Begleitung, 2h pro Tag",
    category: "einmalig",
    priceMonthly: 0,
    priceOneTime: 999,
    isRequired: false,
    isPerUnit: false,
  },
];

// ─── KATEGORIEN (für UI-Gruppierung) ─────────────────────────────────────────

export const MODULE_CATEGORIES: { id: ModuleCategory; label: string }[] = [
  { id: "basis", label: "Basis-Lizenz" },
  { id: "hardware", label: "Hardware & Stationen" },
  { id: "betrieb", label: "Betrieb & Personal" },
  { id: "bestellung", label: "Bestellung & Lieferung" },
  { id: "kundenbindung", label: "Kundenbindung" },
  { id: "marketing", label: "Marketing & Wachstum" },
  { id: "enterprise", label: "Enterprise & Multi-Location" },
  { id: "support", label: "Support" },
  { id: "einmalig", label: "Einmalige Gebühren" },
  { id: "compliance", label: "Compliance & Buchhaltung" },
];

// ─── PREISBERECHNUNG ──────────────────────────────────────────────────────────

export interface SelectedModule {
  moduleId: string;
  quantity: number; // 1 für nicht-per-unit, Anzahl für per-unit
}

export interface PricingResult {
  monthlyTotal: number;
  oneTimeTotal: number;
  breakdown: {
    moduleId: string;
    moduleName: string;
    quantity: number;
    monthlySubtotal: number;
    oneTimeSubtotal: number;
  }[];
}

export function calculateModularPricing(selectedModules: SelectedModule[]): PricingResult {
  const breakdown: PricingResult["breakdown"] = [];
  let monthlyTotal = 0;
  let oneTimeTotal = 0;

  // Always include basis
  const basisModule = MODULES.find((m) => m.id === "cloud_pos_basis")!;
  const hasBasis = selectedModules.some((s) => s.moduleId === "cloud_pos_basis");
  if (!hasBasis) {
    breakdown.push({
      moduleId: basisModule.id,
      moduleName: basisModule.name,
      quantity: 1,
      monthlySubtotal: basisModule.priceMonthly,
      oneTimeSubtotal: 0,
    });
    monthlyTotal += basisModule.priceMonthly;
  }

  for (const selected of selectedModules) {
    const mod = MODULES.find((m) => m.id === selected.moduleId);
    if (!mod) continue;

    const qty = mod.isPerUnit ? Math.max(selected.quantity, 0) : 1;
    if (qty === 0 && !mod.isRequired) continue;

    const monthlySub = mod.priceMonthly * qty;
    const oneTimeSub = mod.priceOneTime * qty;

    breakdown.push({
      moduleId: mod.id,
      moduleName: mod.name,
      quantity: qty,
      monthlySubtotal: monthlySub,
      oneTimeSubtotal: oneTimeSub,
    });

    monthlyTotal += monthlySub;
    oneTimeTotal += oneTimeSub;
  }

  return { monthlyTotal, oneTimeTotal, breakdown };
}

// ─── JAHRESRABATT ─────────────────────────────────────────────────────────────

export const ANNUAL_DISCOUNT_PERCENT = 15; // 15% Rabatt bei jährlicher Zahlung

export function calculateAnnualPrice(monthlyTotal: number): number {
  const annualWithDiscount = monthlyTotal * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100);
  return Math.round(annualWithDiscount / 12); // Monatlicher Preis bei jährlicher Zahlung
}

// ─── LEGACY COMPAT (für bestehende Verträge) ─────────────────────────────────

export type PlanId = "starter" | "growth" | "ecosystem";
export const PLANS = {
  starter: { name: "Starter", monthlyPrice: 109, yearlyPrice: 89 },
  growth: { name: "Growth", monthlyPrice: 249, yearlyPrice: 199 },
  ecosystem: { name: "Ecosystem", monthlyPrice: 429, yearlyPrice: 349 },
} as const;
