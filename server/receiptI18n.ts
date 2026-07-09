/**
 * receiptI18n.ts
 * Mehrsprachige Beleg-Texte für SimplaPOS
 *
 * Unterstützte Sprachen:
 *   de  → Deutsch (Standard: Schweiz, Deutschland, Österreich)
 *   sq  → Albanisch / Shqip (Kosovo, Albanien)
 *   en  → Englisch (Fallback)
 *
 * Verwendung:
 *   const t = getReceiptTranslations(restaurant.country);
 *   text(t.table + ': ' + tableNumber);
 */

export type ReceiptLang = "de" | "sq" | "en";

export interface ReceiptTranslations {
  // Header
  vatNumber: string;
  // Bon-Info
  table: string;
  receiptNo: string;
  date: string;
  waiter: string;
  // Positionen
  quantity: string;
  // Summen
  subtotal: string;
  discount: string;
  tip: string;
  total: string;
  // MwSt
  vatIncluded: string;
  vat: string;
  totalVat: string;
  // Zahlung
  paymentMethod: string;
  paid: string;
  change: string;
  // Zahlungsarten
  cash: string;
  card: string;
  // Abschluss
  thankYou: string;
  goodbye: string;
  // Z-Abschluss
  dailyClosing: string;
  shift: string;
  orders: string;
  revenue: string;
  // Küchen-Bon
  kitchen: string;
  bar: string;
  urgent: string;
  note: string;
  // Storno
  cancellation: string;
  cancelledBy: string;
  // Datum-Locale
  dateLocale: string;
}

const translations: Record<ReceiptLang, ReceiptTranslations> = {
  // ─── DEUTSCH ──────────────────────────────────────────────────────────────
  de: {
    vatNumber: "MwSt-Nr",
    table: "Tisch",
    receiptNo: "Bon-Nr.",
    date: "Datum",
    waiter: "Kellner",
    quantity: "Anz.",
    subtotal: "Zwischensumme",
    discount: "Rabatt",
    tip: "Trinkgeld",
    total: "TOTAL",
    vatIncluded: "Inkl. MwSt:",
    vat: "MwSt",
    totalVat: "Total MwSt",
    paymentMethod: "Zahlungsart",
    paid: "Bezahlt",
    change: "Rückgeld",
    cash: "Bargeld",
    card: "Karte",
    thankYou: "Danke für Ihren Besuch!",
    goodbye: "Auf Wiedersehen!",
    dailyClosing: "Tagesabschluss",
    shift: "Schicht",
    orders: "Bestellungen",
    revenue: "Umsatz",
    kitchen: "KÜCHE",
    bar: "BAR",
    urgent: "!! DRINGEND !!",
    note: "Hinweis",
    cancellation: "STORNO",
    cancelledBy: "Storniert von",
    dateLocale: "de-CH",
  },

  // ─── ALBANISCH / SHQIP ────────────────────────────────────────────────────
  sq: {
    vatNumber: "Nr. TVSH",
    table: "Tavolina",
    receiptNo: "Nr. Faturës",
    date: "Data",
    waiter: "Kamarieri",
    quantity: "Sasi",
    subtotal: "Nëntotali",
    discount: "Zbritje",
    tip: "Bakshish",
    total: "TOTALI",
    vatIncluded: "Përfsh. TVSH:",
    vat: "TVSH",
    totalVat: "Total TVSH",
    paymentMethod: "Mënyra e pagesës",
    paid: "Paguar",
    change: "Kusuri",
    cash: "Para në dorë",
    card: "Kartë",
    thankYou: "Faleminderit për vizitën tuaj!",
    goodbye: "Mirupafshim!",
    dailyClosing: "Mbyllja ditore",
    shift: "Turni",
    orders: "Porositë",
    revenue: "Xhiroja",
    kitchen: "KUZHINA",
    bar: "BAR",
    urgent: "!! URGJENT !!",
    note: "Shënim",
    cancellation: "ANULIM",
    cancelledBy: "Anuluar nga",
    dateLocale: "sq-XK",
  },

  // ─── ENGLISCH (Fallback) ──────────────────────────────────────────────────
  en: {
    vatNumber: "VAT No.",
    table: "Table",
    receiptNo: "Receipt No.",
    date: "Date",
    waiter: "Waiter",
    quantity: "Qty",
    subtotal: "Subtotal",
    discount: "Discount",
    tip: "Tip",
    total: "TOTAL",
    vatIncluded: "Incl. VAT:",
    vat: "VAT",
    totalVat: "Total VAT",
    paymentMethod: "Payment",
    paid: "Paid",
    change: "Change",
    cash: "Cash",
    card: "Card",
    thankYou: "Thank you for your visit!",
    goodbye: "Goodbye!",
    dailyClosing: "Daily Closing",
    shift: "Shift",
    orders: "Orders",
    revenue: "Revenue",
    kitchen: "KITCHEN",
    bar: "BAR",
    urgent: "!! URGENT !!",
    note: "Note",
    cancellation: "CANCELLATION",
    cancelledBy: "Cancelled by",
    dateLocale: "en-GB",
  },
};

/**
 * Gibt die Übersetzungen für ein Land zurück.
 * Mapping: country_code → Sprache
 *   CH, DE, AT, LI → de
 *   XK, AL         → sq
 *   alle anderen   → en (Fallback)
 */
export function getReceiptTranslations(countryCode?: string | null): ReceiptTranslations {
  const code = (countryCode ?? "CH").toUpperCase();
  const langMap: Record<string, ReceiptLang> = {
    CH: "de", DE: "de", AT: "de", LI: "de",
    XK: "sq", AL: "sq",
  };
  const lang: ReceiptLang = langMap[code] ?? "en";
  return translations[lang];
}

/**
 * Formatiert einen Geldbetrag mit der richtigen Währung pro Land.
 */
export function formatCurrency(amount: number, countryCode?: string | null): string {
  const code = (countryCode ?? "CH").toUpperCase();
  const currencyMap: Record<string, string> = {
    CH: "CHF", LI: "CHF",
    DE: "EUR", AT: "EUR", XK: "EUR", AL: "EUR",
  };
  const currency = currencyMap[code] ?? "CHF";
  if (currency === "CHF") return `CHF ${amount.toFixed(2)}`;
  return `€ ${amount.toFixed(2)}`;
}

/**
 * Gibt den MwSt-Label für ein Land zurück.
 * XK: TVSH, DE: MwSt, CH: MwSt, AT: USt
 */
export function getVatLabel(countryCode?: string | null): string {
  const code = (countryCode ?? "CH").toUpperCase();
  const vatLabels: Record<string, string> = {
    CH: "MwSt", DE: "MwSt", LI: "MwSt",
    AT: "USt",
    XK: "TVSH", AL: "TVSH",
  };
  return vatLabels[code] ?? "VAT";
}
