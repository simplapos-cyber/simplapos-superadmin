// ─── DUMMY DATA: Realistic Swiss Restaurant Scenarios ────────────────────────
// This data simulates a busy restaurant "Ristorante Bella Vista" in Zürich

export const RESTAURANT_NAME = "Ristorante Bella Vista";

// ─── SEKTION 1: LIVE STATUS ─────────────────────────────────────────────────
export const liveStatus = {
  revenue: {
    today: 4_285.50,
    yesterday: 3_920.00,
    trend: "up" as const, // +9.3%
    changePercent: 9.3,
  },
  openOrders: {
    count: 7,
    avgWaitMinutes: 12,
  },
  tables: {
    total: 24,
    occupied: 14,
    free: 8,
    reserved: 2,
  },
  staff: {
    clockedIn: 6,
    planned: 8,
  },
  systemStatus: {
    internet: "ok" as const,
    printer: "ok" as const,
    kitchenDisplay: "ok" as const,
    paymentTerminal: "warning" as const,
  },
};

// ─── SEKTION 2: UMSATZANALYSE ───────────────────────────────────────────────
export const revenueByHour = [
  { hour: "08:00", revenue: 120 },
  { hour: "09:00", revenue: 245 },
  { hour: "10:00", revenue: 180 },
  { hour: "11:00", revenue: 420 },
  { hour: "12:00", revenue: 890 },
  { hour: "13:00", revenue: 720 },
  { hour: "14:00", revenue: 310 },
  { hour: "15:00", revenue: 180 },
  { hour: "16:00", revenue: 150 },
  { hour: "17:00", revenue: 220 },
  { hour: "18:00", revenue: 480 },
  { hour: "19:00", revenue: 650 },
  { hour: "20:00", revenue: 520 },
  { hour: "21:00", revenue: 200 },
];

export const revenueSummary = {
  gross: 4_285.50,
  net: 3_972.69,
  vat: 312.81,
  tips: 186.40,
  avgTicket: 52.30,
  salesCount: 82,
};

export const paymentMethods = [
  { name: "Bar", value: 1_285, color: "#10b981" },
  { name: "Karte", value: 1_820, color: "#3b82f6" },
  { name: "TWINT", value: 780, color: "#8b5cf6" },
  { name: "Online", value: 250, color: "#f59e0b" },
  { name: "Rechnung", value: 150, color: "#6b7280" },
];

// ─── SEKTION 3: LIVE RESTAURANT BETRIEB ─────────────────────────────────────
export const activeOrders = {
  kitchen: 4,
  bar: 2,
  delivery: 1,
  takeaway: 0,
};

export const productionTime = {
  kitchen: 14, // minutes
  bar: 4,
};

export const delayedOrders = [
  { table: "T12", waitMinutes: 28, staff: "Marco R." },
  { table: "T05", waitMinutes: 22, staff: "Lisa M." },
  { table: "T18", waitMinutes: 19, staff: "Nico B." },
];

export const reservations = {
  count: 12,
  guests: 38,
  noShows: 1,
};

// ─── SEKTION 4: MITARBEITER PERFORMANCE ─────────────────────────────────────
export const staffPerformance = [
  { name: "Marco R.", revenue: 1_420, sales: 28, hours: 7.5, avgTicket: 50.71, tips: 62 },
  { name: "Lisa M.", revenue: 1_180, sales: 22, hours: 8.0, avgTicket: 53.64, tips: 48 },
  { name: "Nico B.", revenue: 890, sales: 18, hours: 6.0, avgTicket: 49.44, tips: 35 },
  { name: "Sara K.", revenue: 520, sales: 10, hours: 4.5, avgTicket: 52.00, tips: 22 },
  { name: "Tom W.", revenue: 275, sales: 4, hours: 3.0, avgTicket: 68.75, tips: 19 },
];

export const staffKPIs = {
  laborCost: 1_840,
  revenuePerHour: 147.78,
  laborCostRatio: 42.9,
};

// ─── SEKTION 5: PRODUKT ANALYSE ─────────────────────────────────────────────
export const topProducts = [
  { name: "Pizza Margherita", sales: 18, revenue: 378 },
  { name: "Pasta Carbonara", sales: 14, revenue: 336 },
  { name: "Tiramisu", sales: 12, revenue: 144 },
  { name: "Risotto Funghi", sales: 11, revenue: 275 },
  { name: "Bruschetta", sales: 10, revenue: 120 },
];

export const revenueByCategory = [
  { name: "Getränke", value: 1_420, color: "#3b82f6" },
  { name: "Essen", value: 2_180, color: "#10b981" },
  { name: "Dessert", value: 385, color: "#f59e0b" },
  { name: "Takeaway", value: 180, color: "#8b5cf6" },
  { name: "Sonstiges", value: 120, color: "#6b7280" },
];

export const bestMarginProducts = [
  { name: "Espresso", margin: 82 },
  { name: "Mineralwasser", margin: 78 },
  { name: "Tiramisu", margin: 72 },
  { name: "Bruschetta", margin: 68 },
];

export const worstMarginProducts = [
  { name: "Wagyu Steak", margin: 18 },
  { name: "Sushi Platte", margin: 22 },
  { name: "Lobster Risotto", margin: 25 },
  { name: "Trüffel Pasta", margin: 28 },
];

export const cancelledProducts = [
  { name: "Caesar Salad", cancellations: 4, reason: "Zutaten ausgegangen" },
  { name: "Tagessuppe", cancellations: 3, reason: "Qualität" },
  { name: "Fisch des Tages", cancellations: 2, reason: "Wartezeit" },
];

// ─── SEKTION 6: LAGER UND WARENWIRTSCHAFT ───────────────────────────────────
export const criticalStock = [
  { product: "Mozzarella", stock: 2, minStock: 5, unit: "kg" },
  { product: "Basilikum", stock: 1, minStock: 3, unit: "Bund" },
  { product: "Prosecco", stock: 3, minStock: 6, unit: "Fl." },
];

export const soonOutOfStock = [
  { product: "Parmesan", stock: 4, minStock: 5, unit: "kg" },
  { product: "Olivenöl", stock: 3, minStock: 4, unit: "L" },
  { product: "Espresso Bohnen", stock: 5, minStock: 8, unit: "kg" },
];

export const costOfGoods = {
  today: 680,
  week: 4_250,
  month: 18_400,
};

export const margins = {
  average: 62,
  best: 82,
  worst: 18,
};

// ─── SEKTION 7: KUNDEN ANALYSE ──────────────────────────────────────────────
export const customerStats = {
  newToday: 8,
  returningToday: 34,
  avgVisitFrequency: 2.4, // per month
};

export const topCustomers = [
  { name: "Familie Müller", visits: 42, totalSpent: 3_840 },
  { name: "Hr. Schneider", visits: 38, totalSpent: 2_920 },
  { name: "Fr. Weber", visits: 35, totalSpent: 2_680 },
  { name: "Hr. Fischer", visits: 31, totalSpent: 2_450 },
  { name: "Familie Brunner", visits: 28, totalSpent: 3_120 },
];

export const customerGrowth = [
  { month: "Jan", customers: 180 },
  { month: "Feb", customers: 195 },
  { month: "Mär", customers: 210 },
  { month: "Apr", customers: 235 },
  { month: "Mai", customers: 260 },
  { month: "Jun", customers: 285 },
];

// ─── SEKTION 8: KI ASSISTENT ────────────────────────────────────────────────
export const aiInsights = {
  opportunities: [
    "Zwischen 14:00 und 17:00 Uhr sind heute deutlich weniger Gäste als üblich. Eine Happy Hour könnte den Umsatz um ca. CHF 320 steigern.",
    "Die Nachfrage nach vegetarischen Gerichten ist diese Woche um 23% gestiegen. Ein erweitertes Veggie-Menü könnte zusätzliche Gäste anziehen.",
  ],
  risks: [
    "Mozzarella-Bestand reicht voraussichtlich nur noch bis heute Abend. 4 Hauptgerichte sind betroffen.",
    "Terminal 2 zeigt seit 30 Minuten Verbindungsprobleme. Bei Ausfall können Kartenzahlungen nur an Terminal 1 verarbeitet werden.",
  ],
  forecast: {
    expectedRevenue: 5_200,
    confidence: 78,
    basedOn: "Vergleichbare Dienstage der letzten 8 Wochen",
  },
  recommendations: [
    "Eine zusätzliche Servicekraft zwischen 12:00 und 14:00 Uhr wird empfohlen – die Wartezeiten lagen gestern 40% über dem Zielwert.",
    "Das Tagesgericht 'Pasta Primavera' hatte gestern die höchste Stornoquote. Qualitätskontrolle empfohlen.",
    "Reservierungslücke um 19:30 Uhr – ein gezielter Social-Media-Post könnte 2-3 zusätzliche Tische füllen.",
  ],
};

// ─── SEKTION 9: WARNUNGEN UND AUFGABEN ──────────────────────────────────────
export const alerts = [
  { id: 1, message: "Zahlungsterminal 2 – Verbindung instabil", priority: "critical" as const, time: "vor 12 Min." },
  { id: 2, message: "Mozzarella-Bestand kritisch (2 kg)", priority: "critical" as const, time: "vor 45 Min." },
  { id: 3, message: "Mitarbeiter Tom W. – Schicht endet in 30 Min., kein Ersatz geplant", priority: "important" as const, time: "vor 5 Min." },
  { id: 4, message: "Tagesabschluss gestern noch nicht abgeschlossen", priority: "important" as const, time: "seit 14 Std." },
  { id: 5, message: "Offene Rechnung Tisch 8 – Gast hat Restaurant verlassen", priority: "important" as const, time: "vor 20 Min." },
  { id: 6, message: "Drucker Küche – Wartung erfolgreich abgeschlossen", priority: "done" as const, time: "vor 2 Std." },
  { id: 7, message: "Lagerbestellung #4521 eingegangen", priority: "done" as const, time: "vor 3 Std." },
];

// ─── SEKTION 10: MULTI-STANDORT ─────────────────────────────────────────────
export const locations = [
  { name: "Bella Vista Zürich", revenue: 4_285, staff: 6, registers: 2, status: "ok" as const },
  { name: "Bella Vista Bern", revenue: 3_120, staff: 4, registers: 2, status: "ok" as const },
  { name: "Bella Vista Basel", revenue: 2_890, staff: 5, registers: 1, status: "warning" as const },
];
