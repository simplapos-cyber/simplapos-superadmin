// ─── SIMPLAPOS NAVIGATION CONFIG ─────────────────────────────────────────────
// Single source of truth for all navigation items.
// buildNav() in client/src/lib/buildNav.ts filters this list based on:
//   - role
//   - restaurantId
//   - accessPhase
//   - bookedModules
//   - paymentStatus

export type AppRole =
  | "superadmin"
  | "partner"
  | "admin"
  | "manager"
  | "kellner"
  | "koch"
  | "bar"
  | "barkeeper"   // DB alias for "bar"
  | "buchhalter"
  | "gast";

export interface NavItem {
  id: string;
  label: string;
  icon: string;             // Lucide icon name (PascalCase)
  path: string;
  moduleId?: string;        // If set, item is hidden unless module is booked (or phase=full)
  roles: AppRole[];
  group: string;
  requiresRestaurant?: boolean; // Only show when user has a restaurantId
  alwaysVisible?: boolean;  // Never hidden by payment/phase logic (e.g. logout, payment page)
  mobileBottomTab?: boolean; // Show in bottom tab bar on mobile (max 5 items per role)
  mobileBottomOrder?: number; // Order in bottom tab bar
}

// ─── SUPERADMIN ───────────────────────────────────────────────────────────────
const superadminItems: NavItem[] = [
  // Übersicht
  { id: "sa-dashboard", label: "Dashboard", icon: "LayoutDashboard", path: "/dashboard", roles: ["superadmin"], group: "Übersicht" },
  // Verwaltung
  { id: "sa-restaurants", label: "Restaurants", icon: "Store", path: "/restaurants", roles: ["superadmin"], group: "Verwaltung" },
  { id: "sa-users", label: "Benutzer", icon: "Users", path: "/users", roles: ["superadmin"], group: "Verwaltung" },
  { id: "sa-roles", label: "Rollen & Rechte", icon: "Shield", path: "/roles", roles: ["superadmin"], group: "Verwaltung" },
  // Kommunikation
  { id: "sa-chat", label: "Chat & Support", icon: "MessageSquare", path: "/chat", roles: ["superadmin"], group: "Kommunikation" },
  { id: "sa-ads", label: "Werbung", icon: "Megaphone", path: "/advertisements", roles: ["superadmin"], group: "Kommunikation" },
  { id: "sa-reviews", label: "Bewertungen", icon: "Star", path: "/reviews", roles: ["superadmin"], group: "Kommunikation" },
  // Finanzen & Verträge
  { id: "sa-contracts", label: "Verträge", icon: "FileText", path: "/contracts", roles: ["superadmin"], group: "Finanzen & Verträge" },
  { id: "sa-subscriptions", label: "Abonnements", icon: "CreditCard", path: "/subscriptions", roles: ["superadmin"], group: "Finanzen & Verträge" },
  { id: "sa-invoices", label: "Rechnungen", icon: "Receipt", path: "/invoices", roles: ["superadmin"], group: "Finanzen & Verträge" },
  // Medien & Hardware
  { id: "sa-media", label: "Bildbibliothek", icon: "Image", path: "/media", roles: ["superadmin"], group: "Medien & Hardware" },
  { id: "sa-hardware", label: "Hardware-Katalog", icon: "Package", path: "/hardware", roles: ["superadmin"], group: "Medien & Hardware" },
  // Local Connect
  { id: "sa-local-connect", label: "Local Connect", icon: "Smartphone", path: "/local-connect", roles: ["superadmin"], group: "Medien & Hardware" },
  // System
  { id: "sa-sysettings", label: "Systemeinstellungen", icon: "Settings", path: "/system-settings", roles: ["superadmin"], group: "System" },
  { id: "sa-activity", label: "Aktivitätsprotokolle", icon: "Activity", path: "/activity-logs", roles: ["superadmin"], group: "System" },
  { id: "sa-audit", label: "Audit Logs", icon: "ScrollText", path: "/audit-logs", roles: ["superadmin"], group: "System" },
  { id: "sa-monitor", label: "Systemüberwachung", icon: "Monitor", path: "/system-monitor", roles: ["superadmin"], group: "System" },
  { id: "sa-backups", label: "Backups", icon: "Database", path: "/backups", roles: ["superadmin"], group: "System" },
  { id: "sa-qrorpa", label: "Verkaufsstatistiken", icon: "TrendingUp", path: "/qrorpa-statistiken", roles: ["superadmin"], group: "Statistiken" },
  // Plattform
  { id: "sa-country-config", label: "Länder-Konfiguration", icon: "Globe", path: "/country-config", roles: ["superadmin"], group: "Plattform" },
];

// ─── PARTNER ──────────────────────────────────────────────────────────────────
const partnerItems: NavItem[] = [
  { id: "p-dashboard", label: "Mein Dashboard", icon: "BarChart3", path: "/partner", roles: ["partner"], group: "Partner-Portal" },
  { id: "p-customers", label: "Meine Kunden", icon: "Users2", path: "/partner/customers", roles: ["partner"], group: "Partner-Portal" },
  { id: "p-contracts", label: "Verträge", icon: "FileText", path: "/partner/contracts", roles: ["partner"], group: "Partner-Portal" },
  { id: "p-new", label: "Neuer Vertrag", icon: "FileText", path: "/partner/new", roles: ["partner"], group: "Partner-Portal" },
  { id: "p-commissions", label: "Provisionen", icon: "DollarSign", path: "/partner/commissions", roles: ["partner"], group: "Finanzen" },
  { id: "p-stats", label: "Statistiken", icon: "TrendingUp", path: "/partner/statistics", roles: ["partner"], group: "Finanzen" },
  { id: "p-leads", label: "Leads", icon: "Target", path: "/partner/leads", roles: ["partner"], group: "Akquise" },
  { id: "p-support", label: "Support", icon: "MessageSquare", path: "/chat", roles: ["partner"], group: "Kommunikation", alwaysVisible: true },
];

// ─── RESTAURANT ADMIN ─────────────────────────────────────────────────────────
const adminItems: NavItem[] = [
  // ── 1. ÜBERSICHT ──────────────────────────────────────────────────────────
  { id: "a-dashboard",          label: "Dashboard",           icon: "LayoutDashboard",  path: "/admin",                         roles: ["admin"], group: "Übersicht",         requiresRestaurant: true },
  { id: "a-statistics",         label: "Statistiken",          icon: "BarChart2",        path: "/admin/statistics",              roles: ["admin"], group: "Übersicht",         requiresRestaurant: true },
  { id: "a-marketing",          label: "Marketing & KI",       icon: "TrendingUp",       path: "/admin/marketing",               roles: ["admin"], group: "Übersicht",         requiresRestaurant: true, moduleId: "ai_marketing" },

  // ── 2. VERKAUF & KASSE ────────────────────────────────────────────────────
  { id: "a-betrieb",            label: "Tischplan",            icon: "UtensilsCrossed",  path: "/admin/betrieb",                 roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, alwaysVisible: true, mobileBottomTab: true, mobileBottomOrder: 1 },
  { id: "a-orders",             label: "Bestellungen",         icon: "ClipboardList",    path: "/admin/orders",                  roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, alwaysVisible: true, mobileBottomTab: true, mobileBottomOrder: 2 },
  { id: "a-invoices",           label: "Kassieren",            icon: "Receipt",          path: "/admin/invoices",                roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, alwaysVisible: true, mobileBottomTab: true, mobileBottomOrder: 4 },
  { id: "a-floorplan",          label: "Tischplan-Designer",   icon: "PenTool",          path: "/admin/floor-plan",              roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true },
  { id: "a-reservations",       label: "Reservierungen",       icon: "CalendarDays",     path: "/admin/reservations",            roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, moduleId: "tischreservierung" },
  { id: "a-qr-management",      label: "QR-Bestellung",        icon: "QrCode",           path: "/admin/qr-management",           roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, alwaysVisible: true },
  { id: "a-abruf-verlauf",      label: "Abruf-Verlauf",        icon: "ClipboardCheck",   path: "/admin/abruf-verlauf",           roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, alwaysVisible: true },
  { id: "a-takeaway",           label: "Takeaway",             icon: "ShoppingBag",      path: "/admin/takeaway",                roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, moduleId: "lieferung" },
  { id: "a-delivery",           label: "Lieferung",            icon: "Truck",            path: "/admin/delivery",                roles: ["admin"], group: "Verkauf & Kasse",   requiresRestaurant: true, moduleId: "lieferung" },

  // ── 3. SPEISEKARTE & KIOSK ────────────────────────────────────────────────
  { id: "a-menu",               label: "Speisekarte",          icon: "UtensilsCrossed",  path: "/admin/menu-builder",            roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true },
  { id: "a-menu-modifiers",     label: "Extras & Modifier",    icon: "Tag",              path: "/admin/menu/modifiers",          roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true },
  { id: "a-menu-sets",          label: "Menüs & Sets",         icon: "BookOpen",         path: "/admin/menu/sets",               roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true },
  { id: "a-gang-konfiguration", label: "Gang-Konfiguration",   icon: "ChefHat",          path: "/admin/gang-konfiguration",      roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true },
  { id: "a-naehrwerte",         label: "Nährwerte & Allergene",icon: "Leaf",             path: "/admin/naehrwerte",              roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, moduleId: "naehrwerte_allergene" },
  { id: "a-multilang",          label: "Mehrsprachige Karte",  icon: "Globe",            path: "/admin/mehrsprachige-speisekarte", roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, moduleId: "mehrsprachige_speisekarte" },
  { id: "a-kiosk",              label: "KI-Kiosk",             icon: "ScanLine",         path: "/admin/kiosk",                   roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, alwaysVisible: true },
  { id: "a-kiosk-monitor",      label: "Kiosk-Monitor",        icon: "Activity",         path: "/admin/kiosk/monitor",           roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, alwaysVisible: true },
  { id: "a-kiosk-stats",        label: "Kiosk-Statistiken",    icon: "BarChart2",        path: "/admin/kiosk/stats",             roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, alwaysVisible: true },
  { id: "a-kiosk-age",          label: "Altersverifikation",   icon: "ShieldAlert",      path: "/admin/kiosk/age-verification",  roles: ["admin"], group: "Speisekarte & Kiosk", requiresRestaurant: true, alwaysVisible: true },

  // ── 4. LAGER & EINKAUF ────────────────────────────────────────────────────
  { id: "a-inventory",          label: "Lagerbestand",         icon: "Warehouse",        path: "/admin/inventory",               roles: ["admin"], group: "Lager & Einkauf",   requiresRestaurant: true, moduleId: "inventar" },
  { id: "a-inventory-planning", label: "Einkaufsplanung",      icon: "ShoppingCart",     path: "/admin/inventory/planning",      roles: ["admin"], group: "Lager & Einkauf",   requiresRestaurant: true, moduleId: "inventar" },
  { id: "a-inventory-recipes",  label: "Rezepturen",           icon: "BookOpen",         path: "/admin/inventory/recipes",       roles: ["admin"], group: "Lager & Einkauf",   requiresRestaurant: true, moduleId: "inventar" },

  // ── 5. QUALITÄT & HYGIENE ─────────────────────────────────────────────────
  { id: "a-smart-building",     label: "Smart Building",       icon: "Wifi",             path: "/admin/smart-building",             roles: ["admin"], group: "Qualität & Hygiene",  requiresRestaurant: true, moduleId: "smart_building" },
  { id: "a-smart-temperature",  label: "Temperaturkontrolle",  icon: "Thermometer",      path: "/admin/smart-building/temperature", roles: ["admin"], group: "Qualität & Hygiene",  requiresRestaurant: true, moduleId: "smart_building" },
  { id: "a-smart-alerts",       label: "Alarme & Meldungen",   icon: "BellRing",         path: "/admin/smart-building/alerts",      roles: ["admin"], group: "Qualität & Hygiene",  requiresRestaurant: true, moduleId: "smart_building" },

  // ── 6. KUNDENBINDUNG ──────────────────────────────────────────────────────
  { id: "a-vouchers",           label: "Gutscheine",           icon: "Tag",              path: "/admin/vouchers",                roles: ["admin"], group: "Kundenbindung",     requiresRestaurant: true, moduleId: "gutscheine" },
  { id: "a-loyalty",            label: "Treuepunkte",          icon: "Gift",             path: "/admin/loyalty",                 roles: ["admin"], group: "Kundenbindung",     requiresRestaurant: true, moduleId: "loyalty" },
  { id: "a-bewertungen",        label: "Bewertungen",          icon: "Star",             path: "/admin/bewertungen",             roles: ["admin"], group: "Kundenbindung",     requiresRestaurant: true, moduleId: "bewertungsmanagement" },

  // ── 7. FINANZEN & ABSCHLÜSSE ──────────────────────────────────────────────
  { id: "a-closings",           label: "Tagesabschlüsse",      icon: "Calculator",       path: "/admin/closings",                roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, alwaysVisible: true },
  { id: "a-reports",            label: "Berichte & PDFs",      icon: "FileText",         path: "/admin/reports",                 roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, alwaysVisible: true },
  { id: "a-kassenbuch",         label: "Kassenbuch",           icon: "BookOpen",         path: "/admin/kassenbuch",              roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, moduleId: "kassenbuch" },
  { id: "a-invoicing",          label: "QR-Rechnungen",        icon: "QrCode",           path: "/admin/invoicing",               roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, alwaysVisible: true },
  { id: "a-recurring-invoices", label: "Abonnements",          icon: "Repeat",           path: "/admin/recurring-invoices",      roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, alwaysVisible: true },
  { id: "a-debtors",            label: "Debitoren",            icon: "Users",            path: "/admin/debtors",                 roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, alwaysVisible: true },
  { id: "a-steuerexport",       label: "Steuerexport",         icon: "FileSpreadsheet",  path: "/admin/steuerexport",            roles: ["admin"], group: "Finanzen",          requiresRestaurant: true, moduleId: "steuerexport" },

  // ── 8. PERSONAL ───────────────────────────────────────────────────────────
  { id: "a-staff",              label: "Mitarbeiter",          icon: "UserPlus",         path: "/admin/staff",                   roles: ["admin"], group: "Personal",          requiresRestaurant: true, moduleId: "personal" },
  { id: "a-shifts",             label: "Schichten",            icon: "Clock",            path: "/admin/shifts",                  roles: ["admin"], group: "Personal",          requiresRestaurant: true, moduleId: "personal" },
  { id: "a-absences",           label: "Abwesenheiten",        icon: "Palmtree",         path: "/admin/absences",                roles: ["admin"], group: "Personal",          requiresRestaurant: true, moduleId: "personal" },
  { id: "a-ai-planning",        label: "KI-Dienstplanung",     icon: "Sparkles",         path: "/admin/ai-planning",             roles: ["admin"], group: "Personal",          requiresRestaurant: true, moduleId: "personal" },
  { id: "a-shift-swap",         label: "Schicht-Tausch",       icon: "ArrowLeftRight",   path: "/admin/shift-swap",              roles: ["admin"], group: "Personal",          requiresRestaurant: true, moduleId: "personal" },

  // ── 9. ZAHLUNGEN & HARDWARE ───────────────────────────────────────────────
  { id: "a-payments",           label: "Zahlungsarten",        icon: "Wallet",           path: "/admin/payment-methods",         roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true, moduleId: "online_zahlungen" },
  { id: "a-sumup",              label: "SumUp Terminal",       icon: "CreditCard",       path: "/admin/sumup",                   roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },
  { id: "a-paytec",             label: "PayTec Terminal",      icon: "CreditCard",       path: "/admin/paytec",                  roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },
  { id: "a-nexi",               label: "Nexi Terminal",        icon: "CreditCard",       path: "/admin/nexi",                    roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },
  { id: "a-devices",            label: "Geräte & Hardware",    icon: "Monitor",          path: "/admin/devices",                 roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },
  { id: "a-printers",           label: "Drucker",              icon: "Printer",          path: "/admin/printers",                roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },
  { id: "a-local-connect",      label: "Local Connect App",   icon: "Smartphone",       path: "/admin/local-connect",           roles: ["admin"], group: "Zahlungen & Hardware", requiresRestaurant: true },

  // ── 10. EINSTELLUNGEN ─────────────────────────────────────────────────────
  { id: "a-modules",            label: "Module & Pakete",      icon: "Puzzle",           path: "/admin/modules",                 roles: ["admin"], group: "Einstellungen",     requiresRestaurant: true },
  { id: "a-settings",           label: "Einstellungen",        icon: "Settings",         path: "/admin/settings",                roles: ["admin"], group: "Einstellungen",     requiresRestaurant: true },
  { id: "a-support",            label: "Support & Chat",       icon: "MessageSquare",    path: "/chat",                          roles: ["admin"], group: "Einstellungen",     alwaysVisible: true },
];

// ─── MANAGER ──────────────────────────────────────────────────────────────────
const managerItems: NavItem[] = [
  { id: "m-dashboard", label: "Dashboard", icon: "LayoutDashboard", path: "/manager", roles: ["manager"], group: "Übersicht", mobileBottomTab: true, mobileBottomOrder: 1 },
  { id: "m-revenue", label: "Live Umsätze", icon: "TrendingUp", path: "/manager/revenue", roles: ["manager"], group: "Übersicht" },
  { id: "m-orders", label: "Bestellungen", icon: "ClipboardList", path: "/manager/orders", roles: ["manager"], group: "Betrieb", alwaysVisible: true, mobileBottomTab: true, mobileBottomOrder: 2 },
  { id: "m-floorplan", label: "Tischplan", icon: "PenTool", path: "/manager/floor-plan", roles: ["manager"], group: "Betrieb", mobileBottomTab: true, mobileBottomOrder: 3 },
  { id: "m-reservations", label: "Reservierungen", icon: "CalendarDays", path: "/manager/reservations", moduleId: "tischreservierung", roles: ["manager"], group: "Betrieb" },
  { id: "m-kitchen", label: "Küche", icon: "ChefHat", path: "/manager/kitchen", moduleId: "kds", roles: ["manager"], group: "Küche & Bar" },
  { id: "m-bar", label: "Bar", icon: "GlassWater", path: "/manager/bar", roles: ["manager"], group: "Küche & Bar" },
  { id: "m-takeaway", label: "Takeaway", icon: "ShoppingBag", path: "/manager/takeaway", moduleId: "lieferung", roles: ["manager"], group: "Lieferung & Abholung" },
  { id: "m-delivery", label: "Lieferung", icon: "Truck", path: "/manager/delivery", moduleId: "lieferung", roles: ["manager"], group: "Lieferung & Abholung" },
  { id: "m-staff", label: "Mitarbeiter", icon: "UserPlus", path: "/manager/staff", moduleId: "personal", roles: ["manager"], group: "Personal" },
  { id: "m-shifts", label: "Schichtübersicht", icon: "Clock", path: "/manager/shifts", moduleId: "personal", roles: ["manager"], group: "Personal" },
  { id: "m-stats", label: "Statistiken", icon: "BarChart2", path: "/manager/statistics", roles: ["manager"], group: "Auswertung" },
  { id: "m-availability", label: "Produktverfügbarkeit", icon: "Utensils", path: "/manager/availability", roles: ["manager"], group: "Auswertung" },
];

// ─── KELLNER ──────────────────────────────────────────────────────────────────
const kellnerItems: NavItem[] = [
  { id: "k-dashboard", label: "Dashboard", icon: "LayoutDashboard", path: "/kellner", roles: ["kellner"], group: "Bestellung", mobileBottomTab: true, mobileBottomOrder: 1 },
  { id: "k-tables", label: "Tischplan", icon: "PenTool", path: "/kellner/tables", roles: ["kellner"], group: "Bestellung", mobileBottomTab: true, mobileBottomOrder: 2 },
  { id: "k-orders", label: "Bestellungen", icon: "ClipboardList", path: "/kellner/orders", roles: ["kellner"], group: "Bestellung", mobileBottomTab: true, mobileBottomOrder: 3 },
  { id: "k-ready", label: "Abholbereit", icon: "Bell", path: "/kellner/ready", roles: ["kellner"], group: "Bestellung", alwaysVisible: true },
  { id: "k-cart", label: "Warenkorb", icon: "ShoppingCart", path: "/kellner/cart", roles: ["kellner"], group: "Bestellung", mobileBottomTab: true, mobileBottomOrder: 4 },
  { id: "k-checkout", label: "Kassieren", icon: "Receipt", path: "/kellner/checkout", roles: ["kellner"], group: "Kassieren", alwaysVisible: true, mobileBottomTab: true, mobileBottomOrder: 5 },
  { id: "k-split", label: "Split Zahlung", icon: "CreditCard", path: "/kellner/split", roles: ["kellner"], group: "Kassieren" },
  { id: "k-history", label: "Bestellverlauf", icon: "ScrollText", path: "/kellner/history", roles: ["kellner"], group: "Kassieren" },
  { id: "k-invoices", label: "Offene Rechnungen", icon: "FileText", path: "/kellner/invoices", roles: ["kellner"], group: "Kassieren" },
  { id: "k-shift", label: "Stempeluhr", icon: "Clock", path: "/kellner/shift", moduleId: "personal", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-planned-shifts", label: "Dienstplan", icon: "CalendarDays", path: "/kellner/planned-shifts", moduleId: "personal", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-absences", label: "Ferien & Abwesenheiten", icon: "Palmtree", path: "/kellner/absences", moduleId: "personal", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-shift-swap", label: "Schicht-Tausch", icon: "ArrowLeftRight", path: "/kellner/shift-swap", moduleId: "personal", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-calendar", label: "Mein Kalender", icon: "CalendarDays", path: "/kellner/calendar", moduleId: "personal", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-revenue", label: "Eigene Umsätze", icon: "TrendingUp", path: "/kellner/revenue", roles: ["kellner"], group: "Mein Bereich" },
  { id: "k-kiosk-monitor", label: "Kiosk-Monitor", icon: "Activity", path: "/kellner/kiosk-monitor", roles: ["kellner"], group: "Kiosk", alwaysVisible: true },
  { id: "k-kiosk-stats", label: "Kiosk-Statistiken", icon: "BarChart2", path: "/kellner/kiosk-stats", roles: ["kellner"], group: "Kiosk", alwaysVisible: true },
  { id: "k-kiosk-age", label: "Altersverifikation", icon: "ShieldAlert", path: "/kellner/kiosk-age-verification", roles: ["kellner"], group: "Kiosk", alwaysVisible: true },
];

// ─── KÜCHE ────────────────────────────────────────────────────────────────────
const kocheItems: NavItem[] = [
  { id: "kds-new", label: "Neu", icon: "Flame", path: "/kitchen/new", roles: ["koch"], group: "Küchenmonitor", mobileBottomTab: true, mobileBottomOrder: 1 },
  { id: "kds-prep", label: "In Zubereitung", icon: "ChefHat", path: "/kitchen/preparing", roles: ["koch"], group: "Küchenmonitor", mobileBottomTab: true, mobileBottomOrder: 2 },
  { id: "kds-ready", label: "Bereit", icon: "ClipboardList", path: "/kitchen/ready", roles: ["koch"], group: "Küchenmonitor", mobileBottomTab: true, mobileBottomOrder: 3 },
  { id: "kds-done", label: "Abgeschlossen", icon: "ClipboardList", path: "/kitchen/done", roles: ["koch"], group: "Küchenmonitor", mobileBottomTab: true, mobileBottomOrder: 4 },
  { id: "k-checkin", label: "Stempeluhr", icon: "Clock", path: "/kueche/checkin", roles: ["koch"], group: "Persönlich" },
];

// ─── BAR ──────────────────────────────────────────────────────────────────────
const barItems: NavItem[] = [
  { id: "bar-new", label: "Neu", icon: "GlassWater", path: "/bar/new", roles: ["bar", "barkeeper"], group: "Bar-Monitor", mobileBottomTab: true, mobileBottomOrder: 1 },
  { id: "bar-prep", label: "In Zubereitung", icon: "GlassWater", path: "/bar/preparing", roles: ["bar", "barkeeper"], group: "Bar-Monitor", mobileBottomTab: true, mobileBottomOrder: 2 },
  { id: "bar-ready", label: "Bereit", icon: "ClipboardList", path: "/bar/ready", roles: ["bar", "barkeeper"], group: "Bar-Monitor", mobileBottomTab: true, mobileBottomOrder: 3 },
  { id: "bar-done", label: "Abgeschlossen", icon: "ClipboardList", path: "/bar/done", roles: ["bar", "barkeeper"], group: "Bar-Monitor", mobileBottomTab: true, mobileBottomOrder: 4 },
];

// ─── TREUHAND / BUCHHALTER ────────────────────────────────────────────────────
const buchhalterItems: NavItem[] = [
  { id: "bk-dashboard", label: "Dashboard", icon: "LayoutDashboard", path: "/accounting", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-revenue", label: "Umsätze", icon: "TrendingUp", path: "/accounting/revenue", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-closings", label: "Abschlüsse", icon: "Calculator", path: "/accounting/closings", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-vat", label: "MwSt", icon: "FileSpreadsheet", path: "/accounting/vat", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-invoices", label: "Rechnungen", icon: "Receipt", path: "/accounting/invoices", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-payments", label: "Zahlungsarten", icon: "Wallet", path: "/accounting/payment-methods", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-cancellations", label: "Storno Protokoll", icon: "Ban", path: "/accounting/cancellations", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
  { id: "bk-export", label: "Export", icon: "FileText", path: "/accounting/export", roles: ["buchhalter"], group: "Finanzen (Lesezugriff)" },
];

// ─── GAST ─────────────────────────────────────────────────────────────────────
const gastItems: NavItem[] = [
  { id: "g-overview", label: "Übersicht", icon: "User", path: "/guest", roles: ["gast"], group: "Mein Konto" },
  { id: "g-loyalty", label: "Treuepunkte", icon: "Gift", path: "/guest/loyalty", moduleId: "loyalty", roles: ["gast"], group: "Mein Konto" },
  { id: "g-giftcards", label: "Geschenkkarten", icon: "CreditCard", path: "/guest/giftcards", moduleId: "loyalty", roles: ["gast"], group: "Mein Konto" },
  { id: "g-invoices", label: "Meine Rechnungen", icon: "Receipt", path: "/guest/invoices", roles: ["gast"], group: "Mein Konto" },
  { id: "g-qr", label: "QR Bestellungen", icon: "QrCode", path: "/guest/qr-orders", moduleId: "qr_bestellung", roles: ["gast"], group: "Bestellung" },
  { id: "g-status", label: "Bestellstatus", icon: "Activity", path: "/guest/order-status", roles: ["gast"], group: "Bestellung" },
  { id: "g-support", label: "Support", icon: "MessageSquare", path: "/chat", roles: ["gast"], group: "Hilfe", alwaysVisible: true },
];

// ─── COMBINED EXPORT ──────────────────────────────────────────────────────────
export const ALL_NAV_ITEMS: NavItem[] = [
  ...superadminItems,
  ...partnerItems,
  ...adminItems,
  ...managerItems,
  ...kellnerItems,
  ...kocheItems,
  ...barItems,
  ...buchhalterItems,
  ...gastItems,
];

export type NavGroup = {
  group: string;
  items: NavItem[];
};
