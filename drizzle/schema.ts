import {
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── USERS ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: text("name"),
  role: mysqlEnum("role", ["superadmin", "admin", "manager", "kellner", "koch", "barkeeper", "buchhalter", "gast", "partner", "user"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "inactive", "suspended", "pending"]).default("pending").notNull(),
  restaurantId: int("restaurantId"),
  avatarUrl: text("avatarUrl"),
  phone: varchar("phone", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── SESSIONS ────────────────────────────────────────────────────────────────
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;

// ─── VERIFICATION CODES ─────────────────────────────────────────────────────────────────
export const verificationCodes = mysqlTable("verification_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VerificationCode = typeof verificationCodes.$inferSelect;

// ─── RESTAURANTS ─────────────────────────────────────────────────────────────
export const restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 128 }).unique(),
  logoUrl: text("logoUrl"),
  address: text("address"),
  zip: varchar("zip", { length: 10 }),
  city: varchar("city", { length: 128 }),
  country: varchar("country", { length: 64 }).default("CH"),
  phone: varchar("phone", { length: 32 }),
  phoneReceipt: varchar("phoneReceipt", { length: 32 }), // Telefon auf Beleg
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 255 }),
  vatNumber: varchar("vatNumber", { length: 32 }), // MwSt-Nr auf Beleg
  // Firmen-Informationen
  companyName: varchar("companyName", { length: 255 }),
  companyAddress: text("companyAddress"),
  companyZip: varchar("companyZip", { length: 10 }),
  companyCity: varchar("companyCity", { length: 128 }),
  companyPhone: varchar("companyPhone", { length: 32 }),
  companyContact: varchar("companyContact", { length: 255 }), // Ansprechpartner
  // Status & Verifizierung
  status: mysqlEnum("status", ["active", "inactive", "suspended", "trial", "pending_verification"]).default("pending_verification").notNull(),
  openingHours: json("openingHours"),
  currency: varchar("currency", { length: 8 }).default("CHF"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("7.70"),
  totalRevenue: decimal("totalRevenue", { precision: 12, scale: 2 }).default("0.00"),
  totalOrders: int("totalOrders").default(0),
  riskScore: int("riskScore").default(0),
  ownerId: int("ownerId"),
  // Betriebstyp (KI-Readiness Sprint 1)
  businessType: mysqlEnum("businessType", [
    "restaurant",
    "cafe",
    "bar",
    "hotel_restaurant",
    "food_truck",
    "catering",
    "bakery",
    "pizzeria",
    "sushi",
    "other",
  ]).default("restaurant"),
  notes: text("notes"),
  // Rechnungs-Bankverbindung (für Schweizer QR-Rechnung)
  invoiceIban: varchar("invoiceIban", { length: 34 }),
  invoiceCreditorName: varchar("invoiceCreditorName", { length: 255 }),
  invoiceCreditorAddress: text("invoiceCreditorAddress"),
  // Debitor-Saldowarnung
  debtorBalanceWarningThreshold: decimal("debtorBalanceWarningThreshold", { precision: 10, scale: 2 }).default("500.00"),
  // Kellner-Berechtigungen (JSON: { canRecordPayment, canSendInvoiceEmail, canViewDunningPdf })
  waiterPermissions: text("waiterPermissions").default('{"canRecordPayment":true,"canSendInvoiceEmail":true,"canViewDunningPdf":true}'),
  // Social Media
  instagramUrl: varchar("instagramUrl", { length: 255 }),
  tiktokUrl: varchar("tiktokUrl", { length: 255 }),
  facebookUrl: varchar("facebookUrl", { length: 255 }),
  googleMapsUrl: varchar("googleMapsUrl", { length: 512 }),
  tripadvisorUrl: varchar("tripadvisorUrl", { length: 255 }),
  youtubeUrl: varchar("youtubeUrl", { length: 255 }),
  giftCardBackgroundUrl: varchar("giftCardBackgroundUrl", { length: 500 }),
  // Bon-Marketing (Gastbeleg)
  receiptSlogan: varchar("receiptSlogan", { length: 255 }),         // z.B. "Danke – bis bald!"
  receiptWifiName: varchar("receiptWifiName", { length: 128 }),      // WLAN-Name auf Beleg
  receiptWifiPassword: varchar("receiptWifiPassword", { length: 128 }), // WLAN-Passwort auf Beleg
  receiptDiscountCode: varchar("receiptDiscountCode", { length: 64 }), // Rabattcode für nächsten Besuch
  receiptDiscountPercent: int("receiptDiscountPercent"),              // z.B. 10 (für 10%)
  receiptShowSocial: boolean("receiptShowSocial").default(true),     // Social-Media-Links anzeigen
  receiptShowGoogleReview: boolean("receiptShowGoogleReview").default(false), // Google-Bewertungs-Link
  receiptCustomMessage: text("receiptCustomMessage"),                // Freier Text am Ende des Bons
  // Zentralkasse Admin-PIN (6-stellig, konfigurierbar)
  zentralkasseAdminPin: varchar("zentralkasseAdminPin", { length: 64 }).default("110293"),
  // MHD-Warngrenze (Tage vor Ablauf, Standard: 3)
  mhdWarningDays: int("mhdWarningDays").default(3),
  // Print-Agent
  printAgentSecret: varchar("printAgentSecret", { length: 64 }),
  printAgentLastSeenAt: timestamp("printAgentLastSeenAt"),
  // Onboarding
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = typeof restaurants.$inferInsert;

// ─── MENU TAX CLASSES (Steuerklassen) ────────────────────────────────────────
export const menuTaxClasses = mysqlTable("menu_tax_classes", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),          // z.B. "Restaurant (8.1%)"
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(), // z.B. 8.10
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MenuTaxClass = typeof menuTaxClasses.$inferSelect;

// ─── MENU CATEGORIES (Speisekarte-Kategorien) ─────────────────────────────────
// ─── MENU TOP CATEGORIES (Oberkategorien: Essen, Drinks, Weine, ...) ─────────
export const menuTopCategories = mysqlTable("menu_top_categories", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  icon: varchar("icon", { length: 64 }),                       // Lucide-Icon-Name
  color: varchar("color", { length: 16 }),                     // Hex-Farbe
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuTopCategory = typeof menuTopCategories.$inferSelect;
export type InsertMenuTopCategory = typeof menuTopCategories.$inferInsert;

// ─── MENU CATEGORIES (Unterkategorien: Salat, Pizza, Rotwein, ...) ───────────
export const menuCategories = mysqlTable("menu_categories", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  topCategoryId: int("topCategoryId"),                        // FK → menu_top_categories
  parentId: int("parentId"),                                  // Unterkategorien (z.B. Weine → Rotwein)
  name: varchar("name", { length: 128 }).notNull(),
  nameTranslations: json("nameTranslations"),                 // {de, fr, en, it, ...}
  description: text("description"),
  imageUrl: text("imageUrl"),
  color: varchar("color", { length: 16 }),                    // Hex-Farbe für Kellner-UI
  icon: varchar("icon", { length: 64 }),                      // Icon-Name (Lucide)
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  isVisible: boolean("isVisible").default(true).notNull(),    // Sichtbar für Kellner
  // Zeitsteuerung: wann ist diese Kategorie verfügbar
  availabilityType: mysqlEnum("availabilityType", ["always", "scheduled", "manual"]).default("always").notNull(),
  availabilitySchedule: json("availabilitySchedule"),         // [{days:[1,2,3,4,5], from:"11:00", to:"14:00"}]
  // Kurs-Zuordnung (für Gänge-Steuerung)
  defaultCourseNumber: int("defaultCourseNumber").default(1), // 1=Vorspeise, 2=Hauptgang, 3=Dessert
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

// ─── MENU MODIFIER GROUPS (Modifier-Gruppen: Extras, Beilagen, Saucen) ────────
export const menuModifierGroups = mysqlTable("menu_modifier_groups", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),           // z.B. "Beilagen", "Saucen", "Extras"
  nameTranslations: json("nameTranslations"),
  selectionType: mysqlEnum("selectionType", ["single", "multiple", "quantity"]).default("multiple").notNull(),
  isRequired: boolean("isRequired").default(false).notNull(), // Pflichtauswahl?
  minSelections: int("minSelections").default(0).notNull(),   // Mindestanzahl
  maxSelections: int("maxSelections"),                        // null = unbegrenzt
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuModifierGroup = typeof menuModifierGroups.$inferSelect;
export type InsertMenuModifierGroup = typeof menuModifierGroups.$inferInsert;

// ─── MENU MODIFIERS (Einzelne Modifier-Optionen) ──────────────────────────────
export const menuModifiers = mysqlTable("menu_modifiers", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),           // z.B. "Pommes", "Salat", "ohne Zwiebeln"
  nameTranslations: json("nameTranslations"),
  priceAdjustment: decimal("priceAdjustment", { precision: 10, scale: 2 }).default("0.00").notNull(), // + oder -
  isDefault: boolean("isDefault").default(false).notNull(),   // Standardmässig ausgewählt
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  allergens: json("allergens"),                               // Allergene dieses Modifiers
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MenuModifier = typeof menuModifiers.$inferSelect;
export type InsertMenuModifier = typeof menuModifiers.$inferInsert;

// ─── MENU ITEMS (Speisekarte-Artikel) ────────────────────────────────────────
export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  categoryId: int("categoryId"),
  taxClassId: int("taxClassId"),
  name: varchar("name", { length: 255 }).notNull(),
  nameTranslations: json("nameTranslations"),                 // {de, fr, en, it}
  description: text("description"),
  descriptionTranslations: json("descriptionTranslations"),
  shortDescription: varchar("shortDescription", { length: 255 }), // Für Bon/KDS
  sku: varchar("sku", { length: 100 }),                           // Artikelnummer intern
  articleNumber: varchar("articleNumber", { length: 100 }),       // Externe Artikelnummer
  // Preise
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  priceType: mysqlEnum("priceType", ["fixed", "variable", "from"]).default("fixed").notNull(),
  // "variable" = Preis wird durch Variante bestimmt, "from" = ab-Preis
  costPrice: decimal("costPrice", { precision: 10, scale: 2 }), // Einkaufspreis (für Kalkulation)
  // Medien
  imageUrl: text("imageUrl"),
  // Typ & Klassifikation
  itemType: mysqlEnum("itemType", ["food", "beverage", "dessert", "set_menu", "other"]).default("food").notNull(),
  // Kurs-Steuerung (für Gänge)
  courseNumber: int("courseNumber").default(1),               // 1=Vorspeise, 2=Hauptgang, 3=Dessert, etc.
  // Allergene (14 EU-Pflichtallergene)
  allergens: json("allergens"),                               // ["gluten", "lactose", "nuts", ...]
  // Nährwerte (pro 100g oder pro Portion)
  nutritionPer: mysqlEnum("nutritionPer", ["100g", "portion"]).default("100g"),
  calories: decimal("calories", { precision: 8, scale: 2 }),  // kcal
  protein: decimal("protein", { precision: 8, scale: 2 }),    // g
  fat: decimal("fat", { precision: 8, scale: 2 }),            // g
  saturatedFat: decimal("saturatedFat", { precision: 8, scale: 2 }), // g
  carbs: decimal("carbs", { precision: 8, scale: 2 }),        // g
  sugar: decimal("sugar", { precision: 8, scale: 2 }),        // g
  fiber: decimal("fiber", { precision: 8, scale: 2 }),        // g
  salt: decimal("salt", { precision: 8, scale: 2 }),          // g
  // Labels & Tags
  labels: json("labels"),                                     // ["vegan", "vegetarisch", "scharf", "bio", "neu", "bestseller"]
  // Verfügbarkeit
  isActive: boolean("isActive").default(true).notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(), // Live-Toggle (ausverkauft)
  availabilityType: mysqlEnum("availabilityType", ["always", "scheduled", "manual"]).default("always").notNull(),
  availabilitySchedule: json("availabilitySchedule"),
  // Küchen-Steuerung
  preparationTime: int("preparationTime"),                    // Minuten
  kitchenStation: varchar("kitchenStation", { length: 64 }),  // z.B. "Küche", "Bar", "Grill"
  kdsNote: text("kdsNote"),                                   // Hinweis für Küche (immer)
  // Sortierung
  sortOrder: int("sortOrder").default(0).notNull(),
  // Statistik
  totalSold: int("totalSold").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

// ─── MENU ITEM VARIANT GROUPS (Variantengruppen: Grösse, Garpunkt) ────────────
export const menuItemVariantGroups = mysqlTable("menu_item_variant_groups", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),           // z.B. "Grösse", "Garpunkt"
  nameTranslations: json("nameTranslations"),
  isRequired: boolean("isRequired").default(true).notNull(),  // Pflichtauswahl
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MenuItemVariantGroup = typeof menuItemVariantGroups.$inferSelect;

// ─── MENU ITEM VARIANT OPTIONS (Einzelne Varianten-Optionen) ─────────────────
export const menuItemVariantOptions = mysqlTable("menu_item_variant_options", {
  id: int("id").autoincrement().primaryKey(),
  variantGroupId: int("variantGroupId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),           // z.B. "Klein", "Gross", "Medium-Rare"
  nameTranslations: json("nameTranslations"),
  priceAdjustment: decimal("priceAdjustment", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MenuItemVariantOption = typeof menuItemVariantOptions.$inferSelect;

// ─── MENU ITEM MODIFIER GROUP LINKS (Artikel ↔ Modifier-Gruppen) ─────────────
export const menuItemModifierGroups = mysqlTable("menu_item_modifier_groups", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  modifierGroupId: int("modifierGroupId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});

// ─── MENU SETS (Fixmenüs: 3-Gang, 5-Gang, Tagesmenü) ─────────────────────────
export const menuSets = mysqlTable("menu_sets", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  categoryId: int("categoryId"),
  name: varchar("name", { length: 255 }).notNull(),           // z.B. "3-Gang Menü", "Tagesmenü"
  nameTranslations: json("nameTranslations"),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // Fixpreis
  imageUrl: text("imageUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  availabilityType: mysqlEnum("availabilityType", ["always", "scheduled", "manual"]).default("always").notNull(),
  availabilitySchedule: json("availabilitySchedule"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MenuSet = typeof menuSets.$inferSelect;
export type InsertMenuSet = typeof menuSets.$inferInsert;

// ─── MENU SET COURSES (Gänge eines Fixmenüs) ─────────────────────────────────
export const menuSetCourses = mysqlTable("menu_set_courses", {
  id: int("id").autoincrement().primaryKey(),
  menuSetId: int("menuSetId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),           // z.B. "Vorspeise", "Hauptgang"
  nameTranslations: json("nameTranslations"),
  courseNumber: int("courseNumber").notNull(),                 // Reihenfolge
  minChoices: int("minChoices").default(1).notNull(),         // Mindestauswahl
  maxChoices: int("maxChoices").default(1).notNull(),         // Maximalauswahl
  // Welche Artikel sind in diesem Gang wählbar (JSON Array von menuItemIds)
  menuItemIds: json("menuItemIds").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MenuSetCourse = typeof menuSetCourses.$inferSelect;

// Legacy aliases (for backward compatibility with existing code)
export const categories = menuCategories;
export const products = menuItems;

// ─── TABLES ──────────────────────────────────────────────────────────────────
export const restaurantTables = mysqlTable("restaurant_tables", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  seats: int("seats").default(4),
  area: varchar("area", { length: 64 }),
  qrCode: text("qrCode"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
export const chatConversations = mysqlTable("chat_conversations", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId"),
  restaurantName: varchar("restaurantName", { length: 255 }),
  userId: int("userId").notNull(),
  subject: varchar("subject", { length: 255 }),
  status: mysqlEnum("status", ["open", "ai_handled", "escalated", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  messageType: mysqlEnum("messageType", ["normal", "stoerung", "idee"]).default("normal").notNull(),
  assignedTo: int("assignedTo"),
  lastMessageAt: timestamp("lastMessageAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId"),
  senderType: mysqlEnum("senderType", ["user", "superadmin", "ai"]).default("user").notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── ADVERTISEMENTS ──────────────────────────────────────────────────────────
export const advertisements = mysqlTable("advertisements", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  imageUrl: text("imageUrl"),
  linkUrl: text("linkUrl"),
  targetType: mysqlEnum("targetType", ["all", "specific"]).default("all").notNull(),
  restaurantIds: json("restaurantIds"),
  isActive: boolean("isActive").default(true),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── REVIEWS ─────────────────────────────────────────────────────────────────
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["platform", "restaurant"]).default("restaurant").notNull(),
  restaurantId: int("restaurantId"),
  userId: int("userId"),
  guestName: varchar("guestName", { length: 128 }),
  rating: int("rating").notNull(),
  comment: text("comment"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "hidden"]).default("pending").notNull(),
  response: text("response"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── CONTRACTS ───────────────────────────────────────────────────────────────
export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId"),
  contractType: mysqlEnum("contractType", ["standard", "referral", "dropshipping", "partner"]).default("standard").notNull(),
  partnerId: int("partnerId"),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "signed", "active", "expired", "cancelled", "pending_verification", "rejected"]).default("draft").notNull(),
  // Pricing plan
  plan: mysqlEnum("plan", ["starter", "growth", "ecosystem", "modular"]).default("modular").notNull(),
  billingCycle: mysqlEnum("billingCycle", ["monthly", "yearly"]).default("yearly").notNull(),
  // Restaurant details (filled during contract creation)
  restaurantName: varchar("restaurantName", { length: 255 }),
  restaurantAddress: text("restaurantAddress"),
  restaurantZip: varchar("restaurantZip", { length: 10 }),
  restaurantCity: varchar("restaurantCity", { length: 128 }),
  restaurantPhone: varchar("restaurantPhone", { length: 32 }),
  restaurantPhoneReceipt: varchar("restaurantPhoneReceipt", { length: 32 }),
  restaurantEmail: varchar("restaurantEmail", { length: 320 }),
  restaurantVatNumber: varchar("restaurantVatNumber", { length: 32 }),
  // Firmen-Informationen
  companyName: varchar("companyName", { length: 255 }),
  companyAddress: text("companyAddress"),
  companyZip: varchar("companyZip", { length: 10 }),
  companyCity: varchar("companyCity", { length: 128 }),
  companyPhone: varchar("companyPhone", { length: 32 }),
  companyContact: varchar("companyContact", { length: 255 }),
  // Verification
  verifiedAt: timestamp("verifiedAt"),
  verifiedByUserId: int("verifiedByUserId"),
  rejectionReason: text("rejectionReason"),
  // Configuration
  numEmployees: int("numEmployees").default(1),
  numTables: int("numTables").default(1),
  numPosTerminals: int("numPosTerminals").default(1),
  numKdsScreens: int("numKdsScreens").default(0),
  features: json("features"), // Array of selected features/add-ons
  employees: json("employees"), // Array of {name, email, role} for staff accounts
  hardwareItems: json("hardwareItems"), // Array of {productId, name, quantity, unitPrice, total}
  // Pricing (auto-calculated)
  basePriceMonthly: decimal("basePriceMonthly", { precision: 10, scale: 2 }),
  addOnsMonthly: decimal("addOnsMonthly", { precision: 10, scale: 2 }).default("0.00"),
  setupFee: decimal("setupFee", { precision: 10, scale: 2 }).default("0.00"),
  hardwareTotal: decimal("hardwareTotal", { precision: 10, scale: 2 }).default("0.00"),
  monthlyFee: decimal("monthlyFee", { precision: 10, scale: 2 }),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 2 }),
  // Dates & signing
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  documentUrl: text("documentUrl"),
  signedAt: timestamp("signedAt"),
  signedByName: varchar("signedByName", { length: 255 }),
  signedByEmail: varchar("signedByEmail", { length: 320 }),
  notes: text("notes"),
  // Creator attribution
  createdByUserId: int("createdByUserId"),
  createdByName: varchar("createdByName", { length: 255 }),
  createdByType: mysqlEnum("createdByType", ["partner", "online", "superadmin"]).default("partner").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── INVOICES ────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  contractId: int("contractId"),
  mandateId: int("mandateId"),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).unique(),
  // Status-Workflow
  status: mysqlEnum("status", ["draft", "sent", "reminded", "dunning1", "dunning2", "paid", "partial", "overdue", "cancelled", "credited"]).default("draft").notNull(),
  // Betraege
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0.00"),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("8.10"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal("paidAmount", { precision: 10, scale: 2 }).default("0.00"),
  currency: varchar("currency", { length: 8 }).default("CHF"),
  // Skonto
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0.00"),
  discountDays: int("discountDays").default(0),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).default("0.00"),
  // Mahnspesen
  dunningFee: decimal("dunningFee", { precision: 10, scale: 2 }).default("0.00"),
  dunningLevel: int("dunningLevel").default(0),
  // Fristen
  issueDate: timestamp("issueDate").defaultNow().notNull(),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  // Empfaenger
  recipientName: varchar("recipientName", { length: 255 }),
  recipientEmail: varchar("recipientEmail", { length: 255 }),
  recipientAddress: text("recipientAddress"),
  // Schweizer QR-Rechnung (SIX-Standard)
  iban: varchar("iban", { length: 34 }),
  qrReference: varchar("qrReference", { length: 27 }),
  creditorName: varchar("creditorName", { length: 255 }),
  creditorAddress: text("creditorAddress"),
  additionalInfo: varchar("additionalInfo", { length: 140 }),
  // Dokumente
  description: text("description"),
  lineItems: json("lineItems"),
  pdfUrl: text("pdfUrl"),
  pdfKey: varchar("pdfKey", { length: 512 }),
  // Digitale Unterschrift
  signatureUrl: text("signatureUrl"),
  signatureKey: varchar("signatureKey", { length: 512 }),
  signatureLat: decimal("signatureLat", { precision: 10, scale: 7 }),
  signatureLng: decimal("signatureLng", { precision: 10, scale: 7 }),
  signatureAddress: varchar("signatureAddress", { length: 512 }),
  signatureTimestamp: timestamp("signatureTimestamp"),
  // Gutschrift-Referenz
  creditNoteForId: int("creditNoteForId"),
  // E-Mail-Versand
  sentAt: timestamp("sentAt"),
  lastReminderAt: timestamp("lastReminderAt"),
  internalNotes: text("internalNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ─── INVOICE ITEMS ───────────────────────────────────────────────────────────
export const invoiceItems = mysqlTable("invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull().default("1.000"),
  unit: varchar("unit", { length: 32 }).default("Stueck"),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("8.10"),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0.00"),
  totalPrice: decimal("totalPrice", { precision: 10, scale: 2 }).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

// ─── MANDATES (Dauerauftraege) ────────────────────────────────────────────────
export const mandates = mysqlTable("mandates", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  mandateNumber: varchar("mandateNumber", { length: 64 }).unique(),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "expired"]).default("active").notNull(),
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 255 }),
  recipientAddress: text("recipientAddress"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }).default("8.10"),
  currency: varchar("currency", { length: 8 }).default("CHF"),
  interval: mysqlEnum("interval", ["weekly", "monthly", "quarterly", "yearly"]).default("monthly").notNull(),
  iban: varchar("iban", { length: 34 }),
  creditorName: varchar("creditorName", { length: 255 }),
  creditorAddress: text("creditorAddress"),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"),
  nextInvoiceDate: timestamp("nextInvoiceDate"),
  lastInvoiceDate: timestamp("lastInvoiceDate"),
  description: text("description"),
  lineItems: json("lineItems"),
  paymentDays: int("paymentDays").default(30),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0.00"),
  discountDays: int("discountDays").default(0),
  internalNotes: text("internalNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Mandate = typeof mandates.$inferSelect;
export type InsertMandate = typeof mandates.$inferInsert;

// ─── PAYMENT REMINDERS (Zahlungserinnerungen / Mahnungen) ────────────────────
export const paymentReminders = mysqlTable("payment_reminders", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  level: int("level").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  sentTo: varchar("sentTo", { length: 255 }),
  fee: decimal("fee", { precision: 10, scale: 2 }).default("0.00"),
  newDueDate: timestamp("newDueDate"),
  emailSubject: varchar("emailSubject", { length: 512 }),
  emailBody: text("emailBody"),
  pdfUrl: text("pdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PaymentReminder = typeof paymentReminders.$inferSelect;

// ─── PAYMENT CONFIRMATIONS (Zahlungsbestaetigung) ────────────────────────────
export const paymentConfirmations = mysqlTable("payment_confirmations", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  method: mysqlEnum("method", ["bank_transfer", "cash", "card", "twint", "other"]).default("bank_transfer").notNull(),
  reference: varchar("reference", { length: 255 }),
  confirmedBy: int("confirmedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PaymentConfirmation = typeof paymentConfirmations.$inferSelect;

// ─── MEDIA LIBRARY ───────────────────────────────────────────────────────────
export const mediaLibrary = mysqlTable("media_library", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: text("url").notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  category: mysqlEnum("category", ["logo", "category", "product", "advertisement", "contract", "other"]).default("other").notNull(),
  restaurantId: int("restaurantId"),
  uploadedBy: int("uploadedBy"),
  tags: json("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MediaItem = typeof mediaLibrary.$inferSelect;

// ─── RESTAURANT MODULES (gebuchte Module pro Restaurant) ────────────────────
export const restaurantModules = mysqlTable("restaurant_modules", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  contractId: int("contractId"),
  moduleId: varchar("moduleId", { length: 64 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  status: mysqlEnum("status", ["active", "inactive", "pending", "trial", "trial_expired", "blocked"]).default("active").notNull(),
  // Trial-Phase (7 Tage kostenlos testen)
  trialStartedAt: timestamp("trialStartedAt"),
  trialEndsAt: timestamp("trialEndsAt"),
  // Activation & Deactivation
  activatedAt: timestamp("activatedAt").defaultNow().notNull(),
  deactivatedAt: timestamp("deactivatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RestaurantModule = typeof restaurantModules.$inferSelect;
export type InsertRestaurantModule = typeof restaurantModules.$inferInsert;

// ─── SUBSCRIPTIONS (Stripe-basierte Abonnements) ────────────────────────────
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  contractId: int("contractId"),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  // Status management
  status: mysqlEnum("status", ["pending", "active", "past_due", "blocked", "cancelled"]).default("pending").notNull(),
  // Trial phase tracking
  trialStartedAt: timestamp("trialStartedAt"), // Set when customer first activates account
  trialPhase: mysqlEnum("trialPhase", ["full", "restricted", "blocked", "paid"]).default("full"),
  billingCycle: mysqlEnum("billingCycle", ["monthly", "yearly"]).default("monthly").notNull(),
  // Amounts (cached for quick access / reporting)
  monthlyAmount: decimal("monthlyAmount", { precision: 10, scale: 2 }).notNull(),
  // Period tracking
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  // Grace period
  gracePeriodEnd: timestamp("gracePeriodEnd"),
  // Notifications
  reminderSentAt: timestamp("reminderSentAt"),
  dueDayNotifiedAt: timestamp("dueDayNotifiedAt"),
  blockedNotifiedAt: timestamp("blockedNotifiedAt"),
  trialReminderSentAt: timestamp("trialReminderSentAt"), // Set when 3-day trial reminder is sent
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── PAYMENTS (Zahlungsverlauf) ─────────────────────────────────────────────
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscriptionId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  stripeInvoiceId: varchar("stripeInvoiceId", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("CHF"),
  status: mysqlEnum("status", ["pending", "succeeded", "failed", "refunded"]).default("pending").notNull(),
  description: text("description"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;


// ─── HARDWARE PRODUCTS ──────────────────────────────────────────────────────
export const hardwareProducts = mysqlTable("hardware_products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["tablet", "drucker", "monitor", "zubehoer"]).default("tablet").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // Einmalpreis CHF
  imageUrl: text("imageUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HardwareProduct = typeof hardwareProducts.$inferSelect;
export type InsertHardwareProduct = typeof hardwareProducts.$inferInsert;

// ─── ACTIVATION TOKENS (Erstanmeldung nach Vertragsabschluss) ──────────────
export const activationTokens = mysqlTable("activation_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  userId: int("userId"),
  contractId: int("contractId"),
  restaurantId: int("restaurantId"),
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivationToken = typeof activationTokens.$inferSelect;
export type InsertActivationToken = typeof activationTokens.$inferInsert;

// ─── ORDERS (Bestellungen im Restaurant) ────────────────────────────────────
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  tableId: int("tableId"),
  floorPlanObjectId: int("floorPlanObjectId"), // ID of the floor_plan_objects entry
  staffId: int("staffId"),
  orderNumber: varchar("orderNumber", { length: 32 }),
  status: mysqlEnum("status", ["pending", "preparing", "ready", "served", "paid", "cancelled"]).default("pending").notNull(),
  type: mysqlEnum("type", ["dine_in", "takeaway", "delivery"]).default("dine_in").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0.00"),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0.00"),
  taxBreakdown: json("taxBreakdown"),  // [{rate: "8.10", base: "xx.xx", amount: "xx.xx"}, ...]
  tipAmount: decimal("tipAmount", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).default("0.00"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "twint", "online", "invoice"]),
  paidAt: timestamp("paidAt"),
  checkedOutByStaffId: int("checked_out_by_staff_id"), // Kassierungsprinzip: Kellner der einkassiert hat
  notes: text("notes"),
  guestCount: int("guestCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// ─── ORDER ITEMS (Positionen einer Bestellung) ─────────────────────────────
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId"),
  selectedVariantId: int("selectedVariantId"),           // FK → menu_item_variant_options
  selectedVariantName: varchar("selectedVariantName", { length: 128 }), // z.B. "Gross"
  selectedVariantPrice: decimal("selectedVariantPrice", { precision: 10, scale: 2 }), // Preis der Variante
  selectedModifiers: json("selectedModifiers"),          // [{id, name, priceAdjustment}]
  taxClassId: int("taxClassId"),                         // FK → menu_tax_classes.id
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }), // z.B. 8.10 oder 2.60
  name: varchar("name", { length: 255 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  seatNumber: int("seatNumber"), // which seat/guest this item belongs to
  course: int("course").default(1), // 1=Vorspeise, 2=Hauptgang, 3=Dessert
  priority: mysqlEnum("priority", ["normal", "rush", "hold"]).default("normal").notNull(),
  itemType: mysqlEnum("itemType", ["food", "drink", "other"]).default("food").notNull(),
  status: mysqlEnum("status", ["pending", "preparing", "ready", "served", "cancelled"]).default("pending").notNull(),
  pickedUpAt: timestamp("pickedUpAt"),           // Zeitstempel wenn Kellner abgerufen hat
  pickedUpBy: varchar("pickedUpBy", { length: 128 }), // Name des Kellners der abgerufen hat
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// ─── INVENTORY (Lagerbestand) ───────────────────────────────────────────────
export const inventory = mysqlTable("inventory", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currentStock: decimal("currentStock", { precision: 10, scale: 2 }).default("0"),
  minStock: decimal("minStock", { precision: 10, scale: 2 }).default("0"),
  unit: varchar("unit", { length: 32 }).default("Stk"),
  category: varchar("category", { length: 64 }),
  costPerUnit: decimal("costPerUnit", { precision: 10, scale: 2 }).default("0.00"),
  lastRestocked: timestamp("lastRestocked"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InventoryItem = typeof inventory.$inferSelect;
export type InsertInventoryItem = typeof inventory.$inferInsert;

// ─── AI INSIGHTS CACHE ──────────────────────────────────────────────────────
export const aiInsightsCache = mysqlTable("ai_insights_cache", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  insights: json("insights").notNull(), // Cached AI analysis result
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
});

// ─── FLOOR PLANS (Tischplan-Designer) ────────────────────────────────────────
export const floorPlans = mysqlTable("floor_plans", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  areaName: varchar("areaName", { length: 255 }).notNull().default("Hauptbereich"),
  status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
  gridSize: int("gridSize").default(20).notNull(),
  canvasWidth: int("canvasWidth").default(1200).notNull(),
  canvasHeight: int("canvasHeight").default(800).notNull(),
  floorStyle: varchar("floorStyle", { length: 100 }).default("none"),
  currentVersion: int("currentVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const floorPlanObjects = mysqlTable("floor_plan_objects", {
  id: int("id").autoincrement().primaryKey(),
  floorPlanId: int("floorPlanId").notNull(),
  type: mysqlEnum("type", [
    // Tables
    "table_round", "table_square", "table_rect", "table_long", "table_high", "table_banquet", "table_custom",
    "table_oval", "table_corner", "table_booth",
    // Seating
    "chair", "barstool", "bench", "sofa", "lounge_chair", "outdoor_chair", "highchair",
    // Gastro
    "bar", "bar_corner", "kitchen", "cashier", "buffet", "salad_bar", "reception",
    "wardrobe", "wine_rack", "coffee_machine", "ice_cream", "display_case", "serving_station",
    // Building
    "wall", "wall_thick", "door", "door_double", "door_sliding",
    "window", "window_large", "stairs", "elevator", "emergency_exit",
    "column", "pillar_rect", "toilet", "toilet_disabled",
    // Outdoor
    "parasol", "awning", "planter", "fence", "heater", "fountain", "playground",
    // Decoration
    "plant", "plant_large", "divider", "divider_glass", "decoration",
    "aquarium", "fireplace", "stage", "dance_floor", "dj_booth"
  ]).notNull(),
  x: int("x").notNull().default(0),
  y: int("y").notNull().default(0),
  width: int("width").notNull().default(80),
  height: int("height").notNull().default(80),
  rotation: int("rotation").notNull().default(0),
  label: varchar("label", { length: 100 }),
  tableNumber: int("tableNumber"),
  seats: int("seats"),
  isActive: boolean("isActive").default(true).notNull(),
  qrCodeEnabled: boolean("qrCodeEnabled").default(false).notNull(),
  qrOrderEnabled: boolean("qrOrderEnabled").default(false).notNull(),
  qrPaymentEnabled: boolean("qrPaymentEnabled").default(false).notNull(),
  notes: text("notes"),
  properties: json("properties"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const floorPlanVersions = mysqlTable("floor_plan_versions", {
  id: int("id").autoincrement().primaryKey(),
  floorPlanId: int("floorPlanId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  snapshot: json("snapshot").notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});


// ─── DEVICE LAYOUTS (Geräte-spezifische Tischplan-Positionen) ────────────────
export const deviceLayouts = mysqlTable("device_layouts", {
  id: int("id").autoincrement().primaryKey(),
  floorPlanId: int("floorPlanId").notNull(),
  device: mysqlEnum("device", ["desktop", "tablet", "phone"]).notNull(),
  canvasWidth: int("canvasWidth").notNull(),
  canvasHeight: int("canvasHeight").notNull(),
  // JSON: Array of { objectId, x, y, width, height, rotation, hidden }
  objectPositions: json("objectPositions").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── NÄHRWERTE (Modul: allergene) ─────────────────────────────────────────────
export const menuItemNutrition = mysqlTable("menu_item_nutrition", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  servingSize: varchar("servingSize", { length: 64 }),        // z.B. "1 Portion (250g)"
  calories: decimal("calories", { precision: 8, scale: 2 }), // kcal
  protein: decimal("protein", { precision: 8, scale: 2 }),   // g
  carbohydrates: decimal("carbohydrates", { precision: 8, scale: 2 }), // g
  sugar: decimal("sugar", { precision: 8, scale: 2 }),       // g
  fat: decimal("fat", { precision: 8, scale: 2 }),           // g
  saturatedFat: decimal("saturatedFat", { precision: 8, scale: 2 }), // g
  fiber: decimal("fiber", { precision: 8, scale: 2 }),       // g
  salt: decimal("salt", { precision: 8, scale: 2 }),         // g
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MenuItemNutrition = typeof menuItemNutrition.$inferSelect;
export type InsertMenuItemNutrition = typeof menuItemNutrition.$inferInsert;

// ─── SPEISEKARTEN-KATEGORIE-ÜBERSETZUNGEN (Modul: multilang_menu) ────────────
export const menuCategoryTranslations = mysqlTable("menu_category_translations", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  lang: varchar("lang", { length: 8 }).notNull(),            // "de", "fr", "en", "it"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MenuCategoryTranslation = typeof menuCategoryTranslations.$inferSelect;
export type InsertMenuCategoryTranslation = typeof menuCategoryTranslations.$inferInsert;

// ─── KASSENBUCH-EINTRÄGE (Modul: kassenbuch) ──────────────────────────────────
export const cashbookEntries = mysqlTable("cashbook_entries", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  entryDate: timestamp("entryDate").notNull(),
  type: mysqlEnum("type", ["einnahme", "ausgabe", "kassensturz"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  category: varchar("category", { length: 128 }),
  taxRate: decimal("taxRate", { precision: 5, scale: 2 }),
  receiptNumber: varchar("receiptNumber", { length: 64 }),
  staffId: int("staffId"),
  closingId: int("closingId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CashbookEntry = typeof cashbookEntries.$inferSelect;
export type InsertCashbookEntry = typeof cashbookEntries.$inferInsert;

// ─── TAGESABSCHLÜSSE (Modul: kassenbuch) ─────────────────────────────────────
export const dailyClosings = mysqlTable("daily_closings", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  closingDate: timestamp("closingDate").notNull(),
  staffId: int("staffId"),
  cashStart: decimal("cashStart", { precision: 10, scale: 2 }).default("0").notNull(),
  cashEnd: decimal("cashEnd", { precision: 10, scale: 2 }).default("0").notNull(),
  cashDifference: decimal("cashDifference", { precision: 10, scale: 2 }).default("0").notNull(),
  totalRevenue: decimal("totalRevenue", { precision: 10, scale: 2 }).default("0").notNull(),
  totalCash: decimal("totalCash", { precision: 10, scale: 2 }).default("0").notNull(),
  totalCard: decimal("totalCard", { precision: 10, scale: 2 }).default("0").notNull(),
  totalTwint: decimal("totalTwint", { precision: 10, scale: 2 }).default("0").notNull(),
  totalOther: decimal("totalOther", { precision: 10, scale: 2 }).default("0").notNull(),
  totalTax: decimal("totalTax", { precision: 10, scale: 2 }).default("0").notNull(),
  vatAmount81: decimal("vatAmount81", { precision: 10, scale: 2 }).default("0").notNull(), // MwSt. 8.1% (vor Ort)
  vatBase81: decimal("vatBase81", { precision: 10, scale: 2 }).default("0").notNull(),    // Nettobasis 8.1%
  vatAmount26: decimal("vatAmount26", { precision: 10, scale: 2 }).default("0").notNull(), // MwSt. 2.6% (Take-away)
  vatBase26: decimal("vatBase26", { precision: 10, scale: 2 }).default("0").notNull(),    // Nettobasis 2.6%
  totalTips: decimal("totalTips", { precision: 10, scale: 2 }).default("0").notNull(),
  totalOrders: int("totalOrders").default(0).notNull(),
  totalGuests: int("totalGuests").default(0).notNull(),
  status: mysqlEnum("status", ["offen", "abgeschlossen", "exportiert"]).default("offen").notNull(),
  mode: mysqlEnum("mode", ["auto", "manual"]).default("manual").notNull(),
  performedBy: int("performedBy"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyClosing = typeof dailyClosings.$inferSelect;
export type InsertDailyClosing = typeof dailyClosings.$inferInsert;

// ─── EXTERNE BEWERTUNGEN (Modul: bewertungsmanagement) ───────────────────────
export const externalReviews = mysqlTable("external_reviews", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  platform: mysqlEnum("platform", ["google", "tripadvisor", "yelp", "other"]).notNull(),
  externalId: varchar("externalId", { length: 255 }),
  authorName: varchar("authorName", { length: 255 }),
  rating: decimal("rating", { precision: 3, scale: 1 }).notNull(),
  reviewText: text("reviewText"),
  reviewDate: timestamp("reviewDate").notNull(),
  responseText: text("responseText"),
  responseDate: timestamp("responseDate"),
  status: mysqlEnum("status", ["neu", "gelesen", "beantwortet", "archiviert"]).default("neu").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ExternalReview = typeof externalReviews.$inferSelect;
export type InsertExternalReview = typeof externalReviews.$inferInsert;

// ─── SPEISEKARTEN-ITEM-ÜBERSETZUNGEN (Modul: mehrsprachige_speisekarte) ───────
export const menuItemTranslations = mysqlTable("menu_item_translations", {
  id: int("id").autoincrement().primaryKey(),
  menuItemId: int("menuItemId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  lang: varchar("lang", { length: 8 }).notNull(),             // "de", "fr", "en", "it"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MenuItemTranslation = typeof menuItemTranslations.$inferSelect;
export type InsertMenuItemTranslation = typeof menuItemTranslations.$inferInsert;

// ─── RESERVIERUNGEN (Modul: reservierungen) ────────────────────────────────────────
export const reservations = mysqlTable("reservations", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  // Gast-Informationen
  guestName: varchar("guestName", { length: 255 }).notNull(),
  guestPhone: varchar("guestPhone", { length: 32 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestCount: int("guestCount").notNull().default(2),
  // Tisch-Zuweisung (optional, kann später zugewiesen werden)
  tableId: int("tableId"),
  // Zeitplanung
  reservedAt: timestamp("reservedAt").notNull(),           // Gewünschter Termin
  duration: int("duration").default(90),                   // Dauer in Minuten
  // Status-Workflow
  status: mysqlEnum("status", [
    "angefragt",      // Neu eingegangen, noch nicht bestätigt
    "bestaetigt",     // Bestätigt durch Restaurant
    "angekommen",     // Gast ist erschienen
    "abgeschlossen",  // Tisch freigegeben
    "storniert",      // Storniert (durch Gast oder Restaurant)
    "no_show",        // Gast nicht erschienen
  ]).default("angefragt").notNull(),
  // Zusatzinformationen
  notes: text("notes"),                                    // Interne Notizen
  guestNotes: text("guestNotes"),                          // Notizen des Gastes (Allergien etc.)
  source: mysqlEnum("source", ["telefon", "online", "walk_in", "app", "partner"]).default("telefon"),
  // Erinnerungen
  reminderSentAt: timestamp("reminderSentAt"),             // Wann Erinnerung gesendet
  // Metadaten
  createdBy: int("createdBy"),                             // userId der erfassenden Person
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;


// ─── LAGERWIRTSCHAFT ─────────────────────────────────────────────────────────

export const inventorySuppliers = mysqlTable("inventory_suppliers", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  website: varchar("website", { length: 500 }),
  minOrderValue: decimal("minOrderValue", { precision: 10, scale: 2 }),
  deliveryDays: int("deliveryDays").default(2),
  orderDays: varchar("orderDays", { length: 100 }),
  paymentTerms: varchar("paymentTerms", { length: 200 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  // Lieferantenbewertung (wird bei Wareneingang automatisch aktualisiert)
  totalOrders: int("totalOrders").default(0),
  totalDeliveries: int("totalDeliveries").default(0),
  deliveryAccuracy: decimal("deliveryAccuracy", { precision: 5, scale: 2 }).default("100.00"),
  avgDeliveryDaysActual: decimal("avgDeliveryDaysActual", { precision: 5, scale: 1 }),
  lastOrderAt: timestamp("lastOrderAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InventorySupplier = typeof inventorySuppliers.$inferSelect;
export type InsertInventorySupplier = typeof inventorySuppliers.$inferInsert;

export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  supplierId: int("supplierId"),
  name: varchar("name", { length: 200 }).notNull(),
  sku: varchar("sku", { length: 100 }),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  storageLocation: varchar("storageLocation", { length: 200 }),
  locationId: int("locationId"),                                    // FK → warehouse_locations
  ean: varchar("ean", { length: 50 }),                               // EAN/Barcode
  lastDeliveryDate: timestamp("lastDeliveryDate"),                   // Letztes Lieferdatum
  unit: varchar("unit", { length: 50 }).notNull(),
  unitSize: decimal("unitSize", { precision: 10, scale: 3 }),
  currentStock: decimal("currentStock", { precision: 12, scale: 3 }).default("0"),
  minStock: decimal("minStock", { precision: 12, scale: 3 }).default("0"),
  maxStock: decimal("maxStock", { precision: 12, scale: 3 }),
  reorderPoint: decimal("reorderPoint", { precision: 12, scale: 3 }).default("0"),
  reorderQty: decimal("reorderQty", { precision: 12, scale: 3 }),
  costPerUnit: decimal("costPerUnit", { precision: 10, scale: 4 }),
  lastPurchasePrice: decimal("lastPurchasePrice", { precision: 10, scale: 4 }),
  averageCost: decimal("averageCost", { precision: 10, scale: 4 }),
  shelfLifeDays: int("shelfLifeDays"),
  autoReorder: boolean("autoReorder").default(false).notNull(),
  autoReorderSupplierId: int("autoReorderSupplierId"),
  isActive: boolean("isActive").default(true).notNull(),
  imageUrl: varchar("imageUrl", { length: 1000 }),
  expiresAt: timestamp("expiresAt"),                          // Ablaufdatum für Foodwaste-Prävention
  expiryDiscountPct: decimal("expiryDiscountPct", { precision: 5, scale: 2 }), // Auto-Rabatt bei nahendem Ablauf
  chargeNr: varchar("chargeNr", { length: 100 }),                // Chargennummer (Lot/Batch)
  bestBefore: timestamp("bestBefore"),                           // MHD der aktuellen Charge
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InventoryItemRow = typeof inventoryItems.$inferSelect;
export type InsertInventoryItemRow = typeof inventoryItems.$inferInsert;

export const inventoryStockMovements = mysqlTable("inventory_stock_movements", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  itemId: int("itemId").notNull(),
  type: mysqlEnum("type", ["purchase", "sale", "waste", "correction", "transfer", "return", "production"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 4 }),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  stockAfter: decimal("stockAfter", { precision: 12, scale: 3 }),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  notes: text("notes"),
  performedBy: int("performedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InventoryStockMovement = typeof inventoryStockMovements.$inferSelect;

export const inventoryPurchaseOrders = mysqlTable("inventory_purchase_orders", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  supplierId: int("supplierId").notNull(),
  orderNumber: varchar("orderNumber", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "confirmed", "partial", "received", "cancelled"]).default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  expectedDelivery: timestamp("expectedDelivery"),
  receivedAt: timestamp("receivedAt"),
  sentAt: timestamp("sentAt"),
  notes: text("notes"),
  aiGenerated: boolean("aiGenerated").default(false),
  aiReason: text("aiReason"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InventoryPurchaseOrder = typeof inventoryPurchaseOrders.$inferSelect;

export const inventoryPurchaseOrderItems = mysqlTable("inventory_purchase_order_items", {
  id: int("id").primaryKey().autoincrement(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  itemId: int("itemId").notNull(),
  orderedQty: decimal("orderedQty", { precision: 12, scale: 3 }).notNull(),
  receivedQty: decimal("receivedQty", { precision: 12, scale: 3 }),
  unitCost: decimal("unitCost", { precision: 10, scale: 4 }).notNull(),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  notes: text("notes"),
});
export type InventoryPurchaseOrderItem = typeof inventoryPurchaseOrderItems.$inferSelect;

export const inventoryRecipes = mysqlTable("inventory_recipes", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  inventoryItemId: int("inventoryItemId").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  conversionFactor: decimal("conversionFactor", { precision: 10, scale: 6 }).default("1"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InventoryRecipe = typeof inventoryRecipes.$inferSelect;


// ─── LIEFERABWEICHUNGSPROTOKOLL ──────────────────────────────────────────────
export const inventoryDeliveryDiscrepancies = mysqlTable("inventory_delivery_discrepancies", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  supplierId: int("supplierId").notNull(),
  itemId: int("itemId").notNull(),
  orderedQty: decimal("orderedQty", { precision: 12, scale: 3 }).notNull(),
  receivedQty: decimal("receivedQty", { precision: 12, scale: 3 }).notNull(),
  discrepancyQty: decimal("discrepancyQty", { precision: 12, scale: 3 }).notNull(),
  discrepancyPct: decimal("discrepancyPct", { precision: 6, scale: 2 }).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 4 }),
  discrepancyValue: decimal("discrepancyValue", { precision: 10, scale: 2 }),
  type: mysqlEnum("type", ["short_delivery", "over_delivery", "quality_issue", "wrong_item"]).notNull().default("short_delivery"),
  notes: text("notes"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InventoryDeliveryDiscrepancy = typeof inventoryDeliveryDiscrepancies.$inferSelect;
export type InsertInventoryDeliveryDiscrepancy = typeof inventoryDeliveryDiscrepancies.$inferInsert;

// ─── TAGESABSCHLUSS-KONFIGURATION ────────────────────────────────────────────
// Pro Restaurant: ob automatisch oder manuell, und zu welcher Uhrzeit
export const dailyClosingConfig = mysqlTable("daily_closing_config", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull().unique(),
  autoEnabled: boolean("autoEnabled").default(false).notNull(),
  closingTime: varchar("closingTime", { length: 5 }).default("23:00").notNull(), // "HH:MM" in lokaler Zeit
  timezone: varchar("timezone", { length: 64 }).default("Europe/Zurich").notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DailyClosingConfig = typeof dailyClosingConfig.$inferSelect;
export type InsertDailyClosingConfig = typeof dailyClosingConfig.$inferInsert;

// ─── WAITER SHIFTS (Stempeluhr – Schichten) ──────────────────────────────────
// Gesetzliche Grundlage: CH ArG Art. 46 + L-GAV Gastronomie (minutengenaue Erfassung)
export const waiterShifts = mysqlTable("waiter_shifts", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId").notNull(),
  // Zeitstempel
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),                        // null = Schicht läuft noch
  // Berechnete Dauer (in Minuten, wird beim clockOut gesetzt)
  durationMinutes: int("durationMinutes"),
  // Pause-Gesamtdauer (in Minuten, wird beim clockOut berechnet)
  breakMinutes: int("breakMinutes").default(0).notNull(),
  // Netto-Arbeitszeit (durationMinutes - breakMinutes)
  netWorkMinutes: int("netWorkMinutes"),
  // Status
  status: mysqlEnum("status", ["active", "on_break", "completed", "auto_closed"]).default("active").notNull(),
  // Anti-Betrug: Gerät und IP beim Einstempeln
  clockInIp: varchar("clockInIp", { length: 64 }),
  clockInUserAgent: varchar("clockInUserAgent", { length: 512 }),
  clockInDeviceId: varchar("clockInDeviceId", { length: 128 }), // Browser-Fingerprint
  // Anti-Betrug: Gerät und IP beim Ausstempeln
  clockOutIp: varchar("clockOutIp", { length: 64 }),
  clockOutUserAgent: varchar("clockOutUserAgent", { length: 512 }),
  // Notizen
  notes: text("notes"),
  // Automatisch geschlossen (z.B. nach 12h ohne Ausstempeln)
  autoClosedAt: timestamp("autoClosedAt"),
  autoCloseReason: varchar("autoCloseReason", { length: 255 }),
  // ─── Bargeld-Tracking (nur für Kellner) ────────────────────────────────────
  // Startbargeld beim Check-in (CHF im Portemonnaie)
  cashStart: decimal("cashStart", { precision: 10, scale: 2 }),
  // Endbargeld beim Check-out (CHF im Portemonnaie)
  cashEnd: decimal("cashEnd", { precision: 10, scale: 2 }),
  // Berechnetes Trinkgeld (cashEnd - cashStart - Barzahlungen aus System)
  tipAmount: decimal("tipAmount", { precision: 10, scale: 2 }),
  // Gesamte Barzahlungen dieser Schicht (aus orders berechnet)
  cashRevenue: decimal("cashRevenue", { precision: 10, scale: 2 }),
  // Gesamtumsatz dieser Schicht (alle Zahlungsarten)
  totalRevenue: decimal("totalRevenue", { precision: 10, scale: 2 }),
  // Rolle beim Check-in (kellner hat Bargeld, admin/koch nicht)
  staffRole: varchar("staffRole", { length: 32 }),
  // Ob PIN-freier Check-in (für admin/koch die keinen PIN haben)
  pinless: boolean("pinless").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WaiterShift = typeof waiterShifts.$inferSelect;
export type InsertWaiterShift = typeof waiterShifts.$inferInsert;

// ─── WAITER BREAKS (Pausen innerhalb einer Schicht) ──────────────────────────
// CH ArG Art. 15: Pflichtpausen dokumentieren
export const waiterBreaks = mysqlTable("waiter_breaks", {
  id: int("id").autoincrement().primaryKey(),
  shiftId: int("shiftId").notNull(),
  staffId: int("staffId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),                        // null = Pause läuft noch
  durationMinutes: int("durationMinutes"),              // wird beim Ende gesetzt
  breakType: mysqlEnum("breakType", ["mandatory", "voluntary", "meal"]).default("voluntary").notNull(),
  // mandatory = gesetzlich vorgeschrieben (nach 5.5h), meal = Mahlzeitpause
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WaiterBreak = typeof waiterBreaks.$inferSelect;
export type InsertWaiterBreak = typeof waiterBreaks.$inferInsert;

// ─── SHIFT CLOCK AUDIT LOG (Unveränderliches Protokoll jeder Stempel-Aktion) ─
// Gesetzliche Grundlage: CH ArG Art. 46 – Aufbewahrungspflicht 5 Jahre
export const shiftAuditLog = mysqlTable("shift_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId").notNull(),
  shiftId: int("shiftId"),
  action: mysqlEnum("action", [
    "clock_in", "clock_out",
    "break_start", "break_end",
    "pin_failed", "pin_success",
    "auto_close", "admin_edit",
  ]).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  deviceId: varchar("deviceId", { length: 128 }),
  details: json("details"),                             // Zusätzliche Infos
});

export type ShiftAuditLog = typeof shiftAuditLog.$inferSelect;

// ─── STAFF CLOCK PIN (Persönlicher PIN für Stempeluhr) ───────────────────────
// Separates Feld im users-Datensatz wäre ideal, aber wir nutzen eine eigene
// Tabelle um keine Migration der users-Tabelle zu benötigen
export const staffClockPins = mysqlTable("staff_clock_pins", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull().unique(),
  restaurantId: int("restaurantId").notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),  // bcrypt-Hash des 4-stelligen PIN
  badgeToken: varchar("badgeToken", { length: 64 }),        // Zufälliger Token für QR-Badge-Scan
  nfcToken: varchar("nfcToken", { length: 64 }),             // Zufälliger Token für NFC-Badge
  failedAttempts: int("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),                   // Gesperrt nach 5 Fehlversuchen
  lastChangedAt: timestamp("lastChangedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StaffClockPin = typeof staffClockPins.$inferSelect;

// ─── STAFF ABSENCES (Ferien, Krankheit, Abwesenheiten) ───────────────────────
export const staffAbsences = mysqlTable("staff_absences", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId").notNull(),
  type: mysqlEnum("type", ["vacation", "sick", "personal", "unpaid", "other"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  startDate: varchar("startDate", { length: 10 }).notNull(),   // YYYY-MM-DD
  endDate: varchar("endDate", { length: 10 }).notNull(),       // YYYY-MM-DD
  totalDays: int("totalDays").notNull(),
  reason: text("reason"),
  adminNote: text("adminNote"),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StaffAbsence = typeof staffAbsences.$inferSelect;
export type InsertStaffAbsence = typeof staffAbsences.$inferInsert;

// ─── AI SHIFT PLANS (KI-generierte Dienstpläne) ──────────────────────────────
export const aiShiftPlans = mysqlTable("ai_shift_plans", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  weekStart: varchar("weekStart", { length: 10 }).notNull(),  // YYYY-MM-DD (Montag)
  weekEnd: varchar("weekEnd", { length: 10 }).notNull(),      // YYYY-MM-DD (Sonntag)
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  aiModel: varchar("aiModel", { length: 100 }),
  aiReasoning: text("aiReasoning"),                           // KI-Begründung
  inputData: json("inputData"),                               // Wetter, Feiertage, Reservationen etc.
  totalStaffHours: decimal("totalStaffHours", { precision: 8, scale: 2 }),
  estimatedCost: decimal("estimatedCost", { precision: 10, scale: 2 }),
  createdBy: int("createdBy").notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiShiftPlan = typeof aiShiftPlans.$inferSelect;
export type InsertAiShiftPlan = typeof aiShiftPlans.$inferInsert;

// ─── AI PLAN SHIFTS (Einzelne Schichten im KI-Dienstplan) ────────────────────
export const aiPlanShifts = mysqlTable("ai_plan_shifts", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId"),                                    // null = noch nicht zugewiesen
  staffName: varchar("staffName", { length: 255 }),           // Snapshot des Namens
  role: varchar("role", { length: 64 }).notNull(),            // kellner, koch, barkeeper etc.
  date: varchar("date", { length: 10 }).notNull(),            // YYYY-MM-DD
  startTime: varchar("startTime", { length: 5 }).notNull(),   // HH:MM
  endTime: varchar("endTime", { length: 5 }).notNull(),       // HH:MM
  breakMinutes: int("breakMinutes").default(0).notNull(),
  netHours: decimal("netHours", { precision: 4, scale: 2 }).notNull(),
  aiNote: text("aiNote"),                                     // KI-Kommentar zu dieser Schicht
  priority: mysqlEnum("priority", ["essential", "recommended", "optional"]).default("recommended").notNull(),
  confirmedByStaff: boolean("confirmedByStaff").default(false).notNull(),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AiPlanShift = typeof aiPlanShifts.$inferSelect;
export type InsertAiPlanShift = typeof aiPlanShifts.$inferInsert;

// ─── STAFF AVAILABILITY (Verfügbarkeit der Mitarbeiter) ──────────────────────
export const staffAvailability = mysqlTable("staff_availability", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId").notNull(),
  dayOfWeek: int("dayOfWeek").notNull(),                      // 0=Mo, 1=Di, ..., 6=So
  availableFrom: varchar("availableFrom", { length: 5 }),    // HH:MM
  availableTo: varchar("availableTo", { length: 5 }),        // HH:MM
  isAvailable: boolean("isAvailable").default(true).notNull(),
  maxHoursPerDay: decimal("maxHoursPerDay", { precision: 4, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StaffAvailability = typeof staffAvailability.$inferSelect;

// ─── SHIFT SWAP REQUESTS (Schicht-Tausch zwischen Kellnern) ──────────────────
export const shiftSwapRequests = mysqlTable("shift_swap_requests", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  // Wer bietet die Schicht zum Tausch an
  requesterId: int("requesterId").notNull(),
  requesterName: varchar("requesterName", { length: 255 }).notNull(),
  // Die angebotene Schicht (aus ai_plan_shifts)
  offeredShiftId: int("offeredShiftId").notNull(),
  offeredDate: varchar("offeredDate", { length: 10 }).notNull(),   // YYYY-MM-DD
  offeredStart: varchar("offeredStart", { length: 5 }).notNull(),  // HH:MM
  offeredEnd: varchar("offeredEnd", { length: 5 }).notNull(),      // HH:MM
  // Wer die Schicht übernimmt (optional – kann offen sein für alle)
  targetId: int("targetId"),
  targetName: varchar("targetName", { length: 255 }),
  // Optionale Gegenschicht (Tausch gegen eigene Schicht)
  counterShiftId: int("counterShiftId"),
  counterDate: varchar("counterDate", { length: 10 }),
  counterStart: varchar("counterStart", { length: 5 }),
  counterEnd: varchar("counterEnd", { length: 5 }),
  // Status-Flow: open → accepted → admin_approved | admin_declined | cancelled
  status: mysqlEnum("status", [
    "open",
    "accepted",
    "admin_approved",
    "admin_declined",
    "cancelled",
  ]).default("open").notNull(),
  requesterNote: text("requesterNote"),
  adminNote: text("adminNote"),
  acceptedAt: timestamp("acceptedAt"),
  adminDecidedAt: timestamp("adminDecidedAt"),
  adminDecidedBy: int("adminDecidedBy"),
  notifiedRequester: boolean("notifiedRequester").default(false).notNull(),
  notifiedTarget: boolean("notifiedTarget").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;
export type InsertShiftSwapRequest = typeof shiftSwapRequests.$inferInsert;

// ─── SHIFT RATINGS (Schicht-Bewertungen durch Kellner) ────────────────────────
export const shiftRatings = mysqlTable("shift_ratings", {
  id: int("id").autoincrement().primaryKey(),
  shiftId: int("shiftId").notNull(),
  staffId: int("staffId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  // Sterne-Bewertung 1-5
  rating: int("rating").notNull(),           // 1=sehr schlecht, 5=ausgezeichnet
  // Stimmungs-Kategorie
  mood: mysqlEnum("mood", ["great", "good", "neutral", "tired", "stressed"]).default("neutral"),
  // Optionaler Kommentar
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ShiftRating = typeof shiftRatings.$inferSelect;
export type InsertShiftRating = typeof shiftRatings.$inferInsert;


// ─── ORDER VOIDS (Storno-Protokoll) ──────────────────────────────────────────
export const orderVoids = mysqlTable("order_voids", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  orderItemId: int("orderItemId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  staffId: int("staffId").notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  totalVoided: decimal("totalVoided", { precision: 10, scale: 2 }).notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  reason: mysqlEnum("reason", ["wrong_order", "customer_change", "quality", "duplicate", "other"]).default("other").notNull(),
  reasonNote: text("reasonNote"),
  requiresApproval: boolean("requiresApproval").default(false).notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderVoid = typeof orderVoids.$inferSelect;
export type InsertOrderVoid = typeof orderVoids.$inferInsert;

// ─── ORDER PAYMENTS (Mischzahlung / Teilzahlungen) ───────────────────────────
export const orderPayments = mysqlTable("order_payments", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  method: mysqlEnum("method", ["cash", "card", "twint", "voucher", "invoice"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 255 }),
  staffId: int("staffId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrderPayment = typeof orderPayments.$inferSelect;
export type InsertOrderPayment = typeof orderPayments.$inferInsert;

// ─── BILL SPLITS (Rechnungs-Splits) ──────────────────────────────────────────
export const billSplits = mysqlTable("bill_splits", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  splitType: mysqlEnum("splitType", ["person", "product", "amount"]).notNull(),
  splitLabel: varchar("splitLabel", { length: 100 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  isPaid: boolean("isPaid").default(false).notNull(),
  paidAt: timestamp("paidAt"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "twint", "voucher", "invoice"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BillSplit = typeof billSplits.$inferSelect;
export type InsertBillSplit = typeof billSplits.$inferInsert;

// ─── BILL SPLIT ITEMS (Positionen pro Split) ─────────────────────────────────
export const billSplitItems = mysqlTable("bill_split_items", {
  id: int("id").autoincrement().primaryKey(),
  splitId: int("splitId").notNull(),
  orderItemId: int("orderItemId").notNull(),
  quantity: int("quantity").default(1).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
});
export type BillSplitItem = typeof billSplitItems.$inferSelect;
export type InsertBillSplitItem = typeof billSplitItems.$inferInsert;

// ─── TABLE MERGES (Tisch-Zusammenführung) ─────────────────────────────────────
export const tableMerges = mysqlTable("table_merges", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  masterOrderId: int("masterOrderId").notNull(),
  sourceOrderId: int("sourceOrderId").notNull(),
  masterTableLabel: varchar("masterTableLabel", { length: 100 }),
  sourceTableLabel: varchar("sourceTableLabel", { length: 100 }),
  mergedAt: timestamp("mergedAt").defaultNow().notNull(),
  splitAt: timestamp("splitAt"),
  mergedByStaffId: int("mergedByStaffId"),
  splitByStaffId: int("splitByStaffId"),
  status: mysqlEnum("status", ["merged", "split"]).default("merged").notNull(),
});
export type TableMerge = typeof tableMerges.$inferSelect;
export type InsertTableMerge = typeof tableMerges.$inferInsert;

// ─── QR TABLE SESSIONS (Gäste-QR-Bestellung) ──────────────────────────────
export const qrTableSessions = mysqlTable("qr_table_sessions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  tableId: int("tableId"),
  floorPlanObjectId: int("floorPlanObjectId"),
  tableLabel: varchar("tableLabel", { length: 100 }).notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  orderId: int("orderId"),
  status: mysqlEnum("status", ["active", "ordered", "closed"]).default("active").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QrTableSession = typeof qrTableSessions.$inferSelect;
export type InsertQrTableSession = typeof qrTableSessions.$inferInsert;

// ─── ONBOARDING SESSIONS (Öffentlicher Gastronomen-Onboarding-Wizard) ─────────
export const onboardingSessions = mysqlTable("onboarding_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  step: mysqlEnum("step", ["info", "modules", "contract", "payment", "activate"]).notNull().default("info"),
  contractId: int("contractId"),
  restaurantId: int("restaurantId"),
  subscriptionId: int("subscriptionId"),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  email: varchar("email", { length: 320 }),
  data: json("data"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type InsertOnboardingSession = typeof onboardingSessions.$inferInsert;

// ─── MENU IMPORT LOGS (KI-Speisekarten-Import-Protokoll) ─────────────────────
export const menuImportLogs = mysqlTable("menu_import_logs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSizeBytes: int("fileSizeBytes"),
  detectedLanguage: varchar("detectedLanguage", { length: 10 }),
  importedCount: int("importedCount").notNull().default(0),
  skippedCount: int("skippedCount").notNull().default(0),
  duplicateCount: int("duplicateCount").notNull().default(0),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull().default("success"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MenuImportLog = typeof menuImportLogs.$inferSelect;
export type InsertMenuImportLog = typeof menuImportLogs.$inferInsert;

// ─── VOUCHERS (GUTSCHEINE) ────────────────────────────────────────────────────
export const vouchers = mysqlTable("vouchers", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  code: varchar("code", { length: 64 }).notNull(),           // Gutschein-Code (eindeutig pro Restaurant)
  category: mysqlEnum("category", ["discount", "gift_card"]).notNull().default("discount"), // Rabatt-Gutschein oder Geschenkkarte
  type: mysqlEnum("type", ["fixed", "percent"]).notNull(),   // Betrag oder Prozent
  value: decimal("value", { precision: 10, scale: 2 }).notNull(), // Betrag in CHF oder Prozentsatz
  minOrderValue: decimal("minOrderValue", { precision: 10, scale: 2 }), // Mindestbestellwert
  maxDiscount: decimal("maxDiscount", { precision: 10, scale: 2 }),     // Max. Rabatt (bei %-Typ)
  initialBalance: decimal("initialBalance", { precision: 10, scale: 2 }).notNull(), // Ursprünglicher Wert
  remainingBalance: decimal("remainingBalance", { precision: 10, scale: 2 }).notNull(), // Verbleibender Wert
  currency: varchar("currency", { length: 3 }).notNull().default("CHF"),
  status: mysqlEnum("status", ["active", "redeemed", "partially_redeemed", "expired", "cancelled"]).notNull().default("active"),
  issuedTo: varchar("issuedTo", { length: 255 }),            // Name/E-Mail des Empfängers
  issuedBy: int("issuedBy"),                                 // FK → users.id (wer hat ausgestellt)
  note: text("note"),                                        // Interne Notiz
  validFrom: timestamp("validFrom").notNull(),
  validUntil: timestamp("validUntil"),                       // null = kein Ablaufdatum
  maxUses: int("maxUses"),                                   // null = unbegrenzt
  usedCount: int("usedCount").notNull().default(0),
  allowedRestaurantIds: text("allowedRestaurantIds"),          // JSON-Array von Restaurant-IDs (null = nur eigenes Restaurant)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = typeof vouchers.$inferInsert;

// ─── VOUCHER REDEMPTIONS (EINLÖSUNGEN) ───────────────────────────────────────
export const voucherRedemptions = mysqlTable("voucher_redemptions", {
  id: int("id").autoincrement().primaryKey(),
  voucherId: int("voucherId").notNull(),                     // FK → vouchers.id
  orderId: int("orderId"),                                   // FK → orders.id (kann null sein bei manueller Einlösung)
  restaurantId: int("restaurantId").notNull(),
  redeemedBy: int("redeemedBy"),                             // FK → users.id (Kellner)
  amountDeducted: decimal("amountDeducted", { precision: 10, scale: 2 }).notNull(), // Tatsächlich abgezogener Betrag
  balanceBefore: decimal("balanceBefore", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal("balanceAfter", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  redeemedAt: timestamp("redeemedAt").defaultNow().notNull(),
});
export type VoucherRedemption = typeof voucherRedemptions.$inferSelect;
export type InsertVoucherRedemption = typeof voucherRedemptions.$inferInsert;

// ─── GIFT CARD PURCHASES (KAUF VON GESCHENKKARTEN) ────────────────────────────
export const giftCardPurchases = mysqlTable("gift_card_purchases", {
  id: int("id").autoincrement().primaryKey(),
  voucherId: int("voucherId").notNull(),              // FK → vouchers.id
  restaurantId: int("restaurantId").notNull(),
  buyerName: varchar("buyerName", { length: 255 }),   // Name des Käufers
  buyerEmail: varchar("buyerEmail", { length: 320 }), // E-Mail des Käufers
  recipientName: varchar("recipientName", { length: 255 }), // Empfänger (Geschenk)
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  purchaseAmount: decimal("purchaseAmount", { precision: 10, scale: 2 }).notNull(), // Bezahlter Betrag
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "twint", "invoice"]).notNull().default("cash"),
  orderId: int("orderId"),                            // Falls über Kasse verkauft
  soldBy: int("soldBy"),                              // FK → users.id (Kellner)
  message: text("message"),                           // Persönliche Nachricht
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
});
export type GiftCardPurchase = typeof giftCardPurchases.$inferSelect;
export type InsertGiftCardPurchase = typeof giftCardPurchases.$inferInsert;

// ─── DUNNING CONFIG (MAHNSPESEN-KONFIGURATION PRO RESTAURANT) ─────────────────
export const dunningConfig = mysqlTable("dunning_config", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().unique(),
  graceDays: int("graceDays").default(3).notNull(),
  dunning1Days: int("dunning1Days").default(7).notNull(),
  dunning2Days: int("dunning2Days").default(14).notNull(),
  dunning1Fee: decimal("dunning1Fee", { precision: 10, scale: 2 }).default("20.00").notNull(),
  dunning2Fee: decimal("dunning2Fee", { precision: 10, scale: 2 }).default("40.00").notNull(),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).default("5.00"),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  autoEnabled: boolean("autoEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DunningConfig = typeof dunningConfig.$inferSelect;
export type InsertDunningConfig = typeof dunningConfig.$inferInsert;

// ─── RECURRING INVOICES (WIEDERKEHRENDE RECHNUNGEN / ABONNEMENTS) ─────────────
export const recurringInvoices = mysqlTable("recurring_invoices", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  mandateId: int("mandateId"),
  description: varchar("description", { length: 255 }).notNull(),
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  recipientAddress: text("recipientAddress"),
  creditorName: varchar("creditorName", { length: 255 }).notNull(),
  creditorAddress: text("creditorAddress").notNull(),
  iban: varchar("iban", { length: 26 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  interval: mysqlEnum("interval", ["daily", "weekly", "monthly", "quarterly", "yearly"]).default("monthly").notNull(),
  intervalDay: int("intervalDay").default(1),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0.00"),
  paymentTermDays: int("paymentTermDays").default(30).notNull(),
  additionalInfo: varchar("additionalInfo", { length: 140 }),
  internalNotes: text("internalNotes"),
  lineItems: json("lineItems").notNull(),
  active: boolean("active").default(true).notNull(),
  nextDueDate: varchar("nextDueDate", { length: 10 }).notNull(),
  lastCreatedAt: timestamp("lastCreatedAt"),
  lastInvoiceId: int("lastInvoiceId"),
  totalCreated: int("totalCreated").default(0).notNull(),
  startDate: varchar("startDate", { length: 10 }),
  endDate: varchar("endDate", { length: 10 }),
  maxOccurrences: int("maxOccurrences"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type InsertRecurringInvoice = typeof recurringInvoices.$inferInsert;

// ─── DEBTORS (Debitorenstammdaten) ───────────────────────────────────────────
export const debtors = mysqlTable("debtors", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  zip: varchar("zip", { length: 20 }),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 2 }).default("CH"),
  iban: varchar("iban", { length: 26 }),
  notes: text("notes"),
  paymentTermDays: int("paymentTermDays").default(30),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Debtor = typeof debtors.$inferSelect;
export type InsertDebtor = typeof debtors.$inferInsert;

// ─── INVOICE PAYMENTS (Zahlungseingänge) ─────────────────────────────────────
export const invoicePayments = mysqlTable("invoice_payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: mysqlEnum("method", ["bank", "cash", "card", "twint", "other"]).default("bank").notNull(),
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  notes: varchar("notes", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertInvoicePayment = typeof invoicePayments.$inferInsert;

// ─── LOYALTY PROGRAM (Treuepunkte-System) ─────────────────────────────────────

/** Programm-Einstellungen pro Restaurant */
export const loyaltyPrograms = mysqlTable("loyalty_programs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull().default("Treueprogramm"),
  isActive: boolean("isActive").default(true).notNull(),
  pointsPerChf: decimal("pointsPerChf", { precision: 6, scale: 2 }).default("1.00").notNull(),
  pointsPerRedemptionChf: decimal("pointsPerRedemptionChf", { precision: 8, scale: 2 }).default("100.00").notNull(),
  minRedemptionPoints: int("minRedemptionPoints").default(100).notNull(),
  maxRedemptionPercent: int("maxRedemptionPercent").default(50).notNull(),
  welcomeBonus: int("welcomeBonus").default(50).notNull(),
  birthdayBonus: int("birthdayBonus").default(100).notNull(),
  tiers: json("tiers"),
  expiryMonths: int("expiryMonths").default(24).notNull(),
  privacyText: text("privacyText"),
  primaryColor: varchar("primaryColor", { length: 7 }).default("#7c3aed"),
  logoUrl: text("logoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;
export type InsertLoyaltyProgram = typeof loyaltyPrograms.$inferInsert;

/** Kundenkonto (DSGVO-konform: minimale Daten, explizite Einwilligung) */
export const loyaltyCustomers = mysqlTable("loyalty_customers", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  birthMonth: int("birthMonth"),
  birthDay: int("birthDay"),
  totalPoints: int("totalPoints").default(0).notNull(),
  lifetimePoints: int("lifetimePoints").default(0).notNull(),
  tier: mysqlEnum("tier", ["bronze", "silver", "gold", "platinum"]).default("bronze").notNull(),
  consentGiven: boolean("consentGiven").default(false).notNull(),
  consentDate: timestamp("consentDate"),
  consentIp: varchar("consentIp", { length: 45 }),
  marketingConsent: boolean("marketingConsent").default(false).notNull(),
  applePassUpdatedAt: timestamp("applePassUpdatedAt"),
  googlePassId: varchar("googlePassId", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastActivityAt: timestamp("lastActivityAt").defaultNow(),
  birthdayBonusYear: int("birthdayBonusYear"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LoyaltyCustomer = typeof loyaltyCustomers.$inferSelect;
export type InsertLoyaltyCustomer = typeof loyaltyCustomers.$inferInsert;

/** Punkte-Transaktionen (vollständiger Verlauf) */
export const loyaltyTransactions = mysqlTable("loyalty_transactions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  type: mysqlEnum("type", [
    "earn", "redeem", "welcome_bonus", "birthday_bonus",
    "manual_add", "manual_deduct", "expire", "refund",
  ]).notNull(),
  points: int("points").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  orderId: int("orderId"),
  orderAmount: decimal("orderAmount", { precision: 10, scale: 2 }),
  description: varchar("description", { length: 255 }),
  adminNote: varchar("adminNote", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;

/** Prämien-Definitionen */
export const loyaltyRewards = mysqlTable("loyalty_rewards", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["discount_chf", "discount_percent", "free_item", "custom"]).notNull(),
  pointsCost: int("pointsCost").notNull(),
  value: decimal("value", { precision: 8, scale: 2 }),
  minTier: mysqlEnum("minTier", ["bronze", "silver", "gold", "platinum"]),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = typeof loyaltyRewards.$inferInsert;

/** Browser Push-Subscriptions für Treueprogramm-Benachrichtigungen */
export const loyaltyPushSubscriptions = mysqlTable("loyalty_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  customerId: int("customerId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LoyaltyPushSubscription = typeof loyaltyPushSubscriptions.$inferSelect;
export type InsertLoyaltyPushSubscription = typeof loyaltyPushSubscriptions.$inferInsert;

// ─── ADMIN-PIN FEHLVERSUCHE AUDIT-LOG ────────────────────────────────────────
export const adminPinAttempts = mysqlTable("admin_pin_attempts", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  success: boolean("success").notNull().default(false),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdminPinAttempt = typeof adminPinAttempts.$inferSelect;
export type InsertAdminPinAttempt = typeof adminPinAttempts.$inferInsert;

// ─── GANG-KONFIGURATION (pro Restaurant) ─────────────────────────────────────
export const restaurantCourses = mysqlTable("restaurant_courses", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  courseNumber: int("courseNumber").notNull(), // 1=Vorspeise, 2=Hauptgang, etc.
  name: varchar("name", { length: 100 }).notNull(), // z.B. "Vorspeise", "Hauptgang"
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RestaurantCourse = typeof restaurantCourses.$inferSelect;
export type InsertRestaurantCourse = typeof restaurantCourses.$inferInsert;

// ─── BONDRUCKER ───────────────────────────────────────────────────────────────
// Jedes Restaurant kann mehrere Drucker haben (Küche warm, Küche kalt, Bar, Kasse usw.)
export const printers = mysqlTable("printers", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),          // z.B. "Küche Warm", "Bar", "Kasse"
  type: mysqlEnum("type", [
    "kitchen",    // Küchenbon (geht an Köche)
    "bar",        // Barbon (geht an Barkeeper)
    "receipt",    // Gastbon / Kassenbon
    "label",      // Etikett (z.B. für Takeaway)
  ]).notNull().default("kitchen"),
  connectionType: mysqlEnum("connectionType", [
    "network",    // Netzwerkdrucker über IP (Epson, Star, etc.)
    "usb",        // USB (nur lokal, Browser-Print)
    "bluetooth",  // Bluetooth (mobil)
    "cloud",      // Cloud-Print (z.B. PrintNode)
  ]).notNull().default("network"),
  ipAddress: varchar("ipAddress", { length: 64 }),           // z.B. "192.168.1.20"
  port: int("port").default(9100),                           // Standard ESC/POS Port
  paperWidth: mysqlEnum("paperWidth", ["58mm", "80mm"]).default("80mm").notNull(),
  charsPerLine: int("charsPerLine").default(48).notNull(),   // 48 für 80mm, 32 für 58mm
  printCopies: int("printCopies").default(1).notNull(),      // Anzahl Kopien
  isActive: boolean("isActive").default(true).notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),  // Standard-Gastbondrucker
  // Kopfzeile / Fusszeile auf Bon
  headerLine1: varchar("headerLine1", { length: 128 }),      // z.B. Restaurantname
  headerLine2: varchar("headerLine2", { length: 128 }),      // z.B. Adresse
  footerLine1: varchar("footerLine1", { length: 128 }),      // z.B. "Danke für Ihren Besuch"
  footerLine2: varchar("footerLine2", { length: 128 }),      // z.B. Website
  // Optionen
  printLogo: boolean("printLogo").default(false).notNull(),
  printQrCode: boolean("printQrCode").default(false).notNull(),
  autoCut: boolean("autoCut").default(true).notNull(),       // Automatischer Papierschnitt
  openCashDrawer: boolean("openCashDrawer").default(false).notNull(), // Kassenschublade öffnen
  sortOrder: int("sortOrder").default(0).notNull(),
  // HTTP Basic Auth (optional, für Drucker mit Passwortschutz)
  authUsername: varchar("authUsername", { length: 128 }),
  authPassword: varchar("authPassword", { length: 256 }),
  // Status-Monitoring
  isOnline: boolean("isOnline"),                               // null = unbekannt, true = online, false = offline
  lastSeenAt: timestamp("lastSeenAt"),                         // Letzter erfolgreicher Ping
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = typeof printers.$inferInsert;

// ─── DRUCKER-ROUTING (Kategorie → Drucker) ───────────────────────────────────
// Definiert, welche Menü-Kategorie zu welchem Drucker geht
// Beispiel: "Warme Küche" → Drucker "Küche Warm"
//           "Desserts"    → Drucker "Küche Kalt"
//           "Cocktails"   → Drucker "Bar"
// Wenn keine Regel: geht an Standard-Küchendrucker
export const printerRoutes = mysqlTable("printer_routes", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  printerId: int("printerId").notNull(),                     // FK → printers
  // Routing-Kriterien (mindestens eines muss gesetzt sein)
  categoryId: int("categoryId"),                             // FK → menu_categories (Unterkategorie)
  topCategoryId: int("topCategoryId"),                       // FK → menu_top_categories (Oberkategorie)
  itemType: mysqlEnum("itemType", ["food", "drink", "other"]), // Alternativ nach Typ
  // Priorität: spezifischere Regel gewinnt (categoryId > topCategoryId > itemType)
  priority: int("priority").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PrinterRoute = typeof printerRoutes.$inferSelect;
export type InsertPrinterRoute = typeof printerRoutes.$inferInsert;

// ─── DRUCKAUFTRÄGE (Audit-Log) ────────────────────────────────────────────────
// Protokolliert jeden Druckauftrag für Fehleranalyse und Nachdrucken
export const printJobs = mysqlTable("print_jobs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  printerId: int("printerId").notNull(),
  jobType: mysqlEnum("jobType", [
    "kitchen_order",   // Küchenbon bei Bestellungsabsenden
    "bar_order",       // Barbon bei Bestellungsabsenden
    "receipt",         // Gastbon bei Kasse
    "reprint",         // Nachdruck
    "test",            // Testdruck
    "closing",         // Tagesabschluss-Bon
  ]).notNull(),
  orderId: int("orderId"),                                   // FK → orders (optional)
  tableId: int("tableId"),                                   // FK → tables (optional)
  status: mysqlEnum("status", [
    "pending",
    "sent",
    "printed",
    "failed",
    "cancelled",
  ]).default("pending").notNull(),
  payload: text("payload"),                                  // ESC/POS Rohdaten (Base64) oder JSON
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0).notNull(),
  printedAt: timestamp("printedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = typeof printJobs.$inferInsert;

// ─── Geräte & Hardware Monitoring ──────────────────────────────────────────
// Speichert Heartbeat-Pings von jedem Browser-Tab / Gerät
// Wird alle 30s vom Frontend aktualisiert, solange die App offen ist
export const deviceSessions = mysqlTable("device_sessions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  userId: int("userId"),                                     // FK → users (null = unbekannt)
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(), // zufälliger Token pro Tab
  deviceName: varchar("deviceName", { length: 100 }),        // z.B. "iPad Bar", "Kasse 1"
  deviceType: mysqlEnum("deviceType", [
    "tablet",
    "desktop",
    "mobile",
    "kds",
    "unknown",
  ]).default("unknown").notNull(),
  role: varchar("role", { length: 50 }),                     // Rolle des eingeloggten Users
  browserInfo: varchar("browserInfo", { length: 200 }),      // z.B. "Safari 17 / iPad OS 17"
  appVersion: varchar("appVersion", { length: 50 }),         // Frontend-Build-Version
  ipAddress: varchar("ipAddress", { length: 45 }),           // IPv4 oder IPv6
  currentPage: varchar("currentPage", { length: 200 }),      // Aktuelle URL-Pfad
  lastAction: varchar("lastAction", { length: 200 }),        // Letzte Aktion (z.B. "Bestellung gesendet")
  lastActionAt: timestamp("lastActionAt"),                   // Zeitstempel der letzten Aktion
  lastOrderId: int("lastOrderId"),                           // Letzte Bestellung
  lastTableId: int("lastTableId"),                           // Letzter Tisch
  isActive: boolean("isActive").default(true).notNull(),     // false = manuell deaktiviert
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(), // Letzter Heartbeat
  connectedAt: timestamp("connectedAt").defaultNow().notNull(), // Erste Verbindung dieser Session
});
export type DeviceSession = typeof deviceSessions.$inferSelect;
export type InsertDeviceSession = typeof deviceSessions.$inferInsert;

// ─── SumUp Terminal Integration ──────────────────────────────────────────────

export const sumupConfigs = mysqlTable("sumup_configs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().unique(),
  apiKey: varchar("apiKey", { length: 512 }).notNull(),
  merchantCode: varchar("merchantCode", { length: 64 }).notNull(),
  defaultReaderId: varchar("defaultReaderId", { length: 64 }),
  defaultReaderName: varchar("defaultReaderName", { length: 255 }),
  tipEnabled: boolean("tipEnabled").default(false).notNull(),
  tipRates: json("tipRates"),
  tipTimeout: int("tipTimeout").default(30),
  webhookUrl: varchar("webhookUrl", { length: 512 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SumupConfig = typeof sumupConfigs.$inferSelect;
export type InsertSumupConfig = typeof sumupConfigs.$inferInsert;

export const sumupTransactions = mysqlTable("sumup_transactions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  orderId: int("orderId"),
  clientTransactionId: varchar("clientTransactionId", { length: 128 }),
  checkoutReference: varchar("checkoutReference", { length: 128 }),
  readerId: varchar("readerId", { length: 64 }).notNull(),
  readerName: varchar("readerName", { length: 255 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "failed", "cancelled", "expired", "refunded"])
    .default("pending").notNull(),
  sumupTransactionCode: varchar("sumupTransactionCode", { length: 64 }),
  sumupTransactionId: varchar("sumupTransactionId", { length: 128 }),
  paymentType: varchar("paymentType", { length: 32 }),
  entryMode: varchar("entryMode", { length: 64 }),
  authCode: varchar("authCode", { length: 32 }),
  tipAmount: decimal("tipAmount", { precision: 10, scale: 2 }).default("0.00"),
  initiatedAt: timestamp("initiatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  initiatedByUserId: int("initiatedByUserId"),
  initiatedByName: varchar("initiatedByName", { length: 255 }),
  rawResponse: json("rawResponse"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SumupTransaction = typeof sumupTransactions.$inferSelect;
export type InsertSumupTransaction = typeof sumupTransactions.$inferInsert;

// ─── PayTec (KIT REST) Configuration & Transactions ───────────────────────
export const paytecConfigs = mysqlTable("paytec_configs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().unique(),
  kitRestUrl: varchar("kitRestUrl", { length: 512 }).default("https://kitrest.paytec.ch").notNull(),
  terminalId: varchar("terminalId", { length: 64 }).notNull(),
  apiKey: varchar("apiKey", { length: 512 }),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  tipEnabled: boolean("tipEnabled").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PaytecConfig = typeof paytecConfigs.$inferSelect;
export type InsertPaytecConfig = typeof paytecConfigs.$inferInsert;

export const paytecTransactions = mysqlTable("paytec_transactions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  orderId: int("orderId"),
  transactionRef: varchar("transactionRef", { length: 128 }).notNull(),
  terminalId: varchar("terminalId", { length: 64 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  status: mysqlEnum("paytec_tx_status", ["pending", "approved", "declined", "cancelled", "error"]).default("pending").notNull(),
  authCode: varchar("authCode", { length: 32 }),
  cardType: varchar("cardType", { length: 32 }),
  maskedPan: varchar("maskedPan", { length: 32 }),
  tipAmount: decimal("tipAmount", { precision: 10, scale: 2 }).default("0.00"),
  receiptData: json("receiptData"),
  rawResponse: json("rawResponse"),
  errorMessage: text("errorMessage"),
  initiatedAt: timestamp("initiatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  initiatedByUserId: int("initiatedByUserId"),
  initiatedByName: varchar("initiatedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PaytecTransaction = typeof paytecTransactions.$inferSelect;
export type InsertPaytecTransaction = typeof paytecTransactions.$inferInsert;

// ─── Nexi (LAN/IP) Configuration & Transactions ───────────────────────────
export const nexiConfigs = mysqlTable("nexi_configs", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().unique(),
  terminalIp: varchar("terminalIp", { length: 64 }).notNull(),
  terminalPort: int("terminalPort").default(20007).notNull(),
  merchantId: varchar("merchantId", { length: 64 }),
  apiKey: varchar("apiKey", { length: 512 }),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  protocol: mysqlEnum("nexi_protocol", ["zvt_lan", "opi", "rest"]).default("zvt_lan").notNull(),
  tipEnabled: boolean("tipEnabled").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NexiConfig = typeof nexiConfigs.$inferSelect;
export type InsertNexiConfig = typeof nexiConfigs.$inferInsert;

export const nexiTransactions = mysqlTable("nexi_transactions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  orderId: int("orderId"),
  transactionRef: varchar("transactionRef", { length: 128 }).notNull(),
  terminalIp: varchar("terminalIp", { length: 64 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("CHF").notNull(),
  status: mysqlEnum("nexi_tx_status", ["pending", "approved", "declined", "cancelled", "error"]).default("pending").notNull(),
  authCode: varchar("authCode", { length: 32 }),
  cardType: varchar("cardType", { length: 32 }),
  maskedPan: varchar("maskedPan", { length: 32 }),
  tipAmount: decimal("tipAmount", { precision: 10, scale: 2 }).default("0.00"),
  receiptData: json("receiptData"),
  rawResponse: json("rawResponse"),
  errorMessage: text("errorMessage"),
  initiatedAt: timestamp("initiatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  initiatedByUserId: int("initiatedByUserId"),
  initiatedByName: varchar("initiatedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NexiTransaction = typeof nexiTransactions.$inferSelect;
export type InsertNexiTransaction = typeof nexiTransactions.$inferInsert;

// ─── Kiosk-Scan Feature ────────────────────────────────────────────────────────
export const kioskStations = mysqlTable("kiosk_stations", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  qrToken: varchar("qrToken", { length: 64 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  // Session-Lock: exklusiver Zugang pro Gast
  lockToken: varchar("lockToken", { length: 64 }),
  lockedAt: bigint("lockedAt", { mode: "number" }),
  lockExpiresAt: bigint("lockExpiresAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KioskStation = typeof kioskStations.$inferSelect;
export type InsertKioskStation = typeof kioskStations.$inferInsert;

export const kioskProductImages = mysqlTable("kiosk_product_images", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 1024 }).notNull(),
  side: varchar("side", { length: 32 }).default("front").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskProductImage = typeof kioskProductImages.$inferSelect;
export type InsertKioskProductImage = typeof kioskProductImages.$inferInsert;

// ─── KIOSK AGE VERIFICATIONS ─────────────────────────────────────────────────
export const kioskAgeVerifications = mysqlTable("kiosk_age_verifications", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  stationId: int("stationId").notNull(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(), // random token linking guest session
  products: json("products").notNull(), // snapshot of scanned products
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvedBy: int("approvedBy"),   // userId of staff member who approved
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy"),
  rejectedAt: timestamp("rejectedAt"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(), // auto-expire after 10 minutes
});
export type KioskAgeVerification = typeof kioskAgeVerifications.$inferSelect;
export type InsertKioskAgeVerification = typeof kioskAgeVerifications.$inferInsert;

// ─── KIOSK SESSIONS ──────────────────────────────────────────────────────────
export const kioskSessions = mysqlTable("kiosk_sessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(), // random UUID
  stationId: int("stationId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  status: mysqlEnum("status", ["active", "completed", "aborted", "service_called", "age_check", "spot_check"]).default("active").notNull(),
  scanCount: int("scanCount").default(0).notNull(),       // how many times guest scanned
  abortCount: int("abortCount").default(0).notNull(),     // payment aborts
  serviceCallCount: int("serviceCallCount").default(0).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
  paymentStatus: mysqlEnum("paymentStatus", ["none", "pending", "paid", "failed"]).default("none").notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  waitStartedAt: bigint("waitStartedAt", { mode: "number" }),  // Unix ms – wann Gast auf freie Kasse wartete
  waitEndedAt: bigint("waitEndedAt", { mode: "number" }),    // Unix ms – wann Lock erworben wurde
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskSession = typeof kioskSessions.$inferSelect;
export type InsertKioskSession = typeof kioskSessions.$inferInsert;

// ─── KIOSK EVENTS ────────────────────────────────────────────────────────────
export const kioskEvents = mysqlTable("kiosk_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  stationId: int("stationId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  eventType: mysqlEnum("eventType", [
    "session_started",
    "scan_started",
    "scan_completed",
    "scan_repeated",
    "payment_started",
    "payment_completed",
    "payment_aborted",
    "service_called",
    "age_verification_requested",
    "age_verification_approved",
    "age_verification_rejected",
    "spot_check_triggered",
    "spot_check_passed",
    "session_ended",
    "manual_order_created",
  ]).notNull(),
  payload: json("payload"),  // additional event data (products, amounts, etc.)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskEvent = typeof kioskEvents.$inferSelect;
export type InsertKioskEvent = typeof kioskEvents.$inferInsert;

// ─── KIOSK SPOT CHECKS ───────────────────────────────────────────────────────
export const kioskSpotChecks = mysqlTable("kiosk_spot_checks", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  stationId: int("stationId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  triggeredAt: timestamp("triggeredAt").defaultNow().notNull(),
  triggerReason: varchar("triggerReason", { length: 255 }).notNull(), // e.g. "3+ scans", "payment_aborted", ">5min"
  status: mysqlEnum("status", ["pending", "passed", "failed", "expired"]).default("pending").notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),  // userId of staff
  note: text("note"),
});
export type KioskSpotCheck = typeof kioskSpotChecks.$inferSelect;
export type InsertKioskSpotCheck = typeof kioskSpotChecks.$inferInsert;

// ─── KIOSK MANUAL ORDERS ─────────────────────────────────────────────────────
export const kioskManualOrders = mysqlTable("kiosk_manual_orders", {
  id: int("id").autoincrement().primaryKey(),
  stationId: int("stationId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  createdBy: int("createdBy").notNull(),  // userId of waiter/admin
  inputText: text("inputText"),           // original text/voice transcript
  products: json("products").notNull(),   // parsed products [{id, name, price, quantity}]
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }),
  qrPayUrl: text("qrPayUrl"),             // URL for guest to scan and pay
  status: mysqlEnum("status", ["pending", "paid", "expired", "cancelled"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskManualOrder = typeof kioskManualOrders.$inferSelect;
export type InsertKioskManualOrder = typeof kioskManualOrders.$inferInsert;

// ─── KIOSK PUSH SUBSCRIPTIONS (Kellner-Geräte) ───────────────────────────────
export const kioskPushSubscriptions = mysqlTable("kiosk_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  userId: int("userId").notNull(),            // Kellner/Admin-User-ID
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskPushSubscription = typeof kioskPushSubscriptions.$inferSelect;
export type InsertKioskPushSubscription = typeof kioskPushSubscriptions.$inferInsert;

// ─── KIOSK TRAINING IMAGES ───────────────────────────────────────────────────
// Speichert anonymisierte Gästefotos (ohne Personen) für KI-Training
export const kioskTrainingImages = mysqlTable("kiosk_training_images", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  stationId: int("stationId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),       // S3-Pfad zum Bild
  s3Url: text("s3Url").notNull(),                            // Öffentliche URL
  label: text("label"),                                       // JSON: erkannte Produkte (von KI)
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),                             // userId des Admins
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: varchar("rejectionReason", { length: 64 }), // z.B. "auto_person_detected"
  avgConfidence: varchar("avgConfidence", { length: 16 }),     // "high" | "medium" | "low"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskTrainingImage = typeof kioskTrainingImages.$inferSelect;
export type InsertKioskTrainingImage = typeof kioskTrainingImages.$inferInsert;

// ─── KIOSK UPSELLING RULES ───────────────────────────────────────────────────
// Admin-definierte Produkt-Paarungen und Kombi-Angebote
export const kioskUpsellingRules = mysqlTable("kiosk_upselling_rules", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  triggerType: mysqlEnum("triggerType", ["product", "category", "any", "expiry"]).default("product").notNull(),
  triggerProductId: int("triggerProductId"),         // Kiosk-Artikel oder Menü-Item das den Trigger auslöst
  triggerCategory: varchar("triggerCategory", { length: 64 }), // z.B. "Getränke"
  suggestedProductId: int("suggestedProductId"),     // Empfohlener Kiosk-Artikel
  suggestedMenuItemId: int("suggestedMenuItemId"),   // Empfohlenes Essen (menu_items)
  suggestedLabel: varchar("suggestedLabel", { length: 128 }), // Anzeigename
  comboPrice: decimal("comboPrice", { precision: 10, scale: 2 }), // Kombi-Preis (null = kein Rabatt)
  discountPct: decimal("discountPct", { precision: 5, scale: 2 }), // Rabatt in % (alternativ zu comboPrice)
  priority: int("priority").default(0).notNull(),    // Höhere Zahl = höhere Priorität
  activeFrom: timestamp("activeFrom"),               // Zeitfenster Start (null = immer)
  activeTo: timestamp("activeTo"),                   // Zeitfenster Ende (null = immer)
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskUpsellingRule = typeof kioskUpsellingRules.$inferSelect;
export type InsertKioskUpsellingRule = typeof kioskUpsellingRules.$inferInsert;

// ─── KIOSK PICKUP NUMBERS ────────────────────────────────────────────────────
// Abholnummern für Essensbestellungen im Kiosk-Flow
export const kioskPickupNumbers = mysqlTable("kiosk_pickup_numbers", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  orderId: int("orderId"),                           // Verknüpfung zur Küchenbestellung
  number: int("number").notNull(),                   // Abholnummer (z.B. 42)
  status: mysqlEnum("status", ["waiting", "ready", "collected"]).default("waiting").notNull(),
  readyAt: timestamp("readyAt"),                     // Wann Küche fertig gemeldet hat
  collectedAt: timestamp("collectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskPickupNumber = typeof kioskPickupNumbers.$inferSelect;
export type InsertKioskPickupNumber = typeof kioskPickupNumbers.$inferInsert;

// ─── KIOSK IMAGE FETCH ERRORS ─────────────────────────────────────────────────
// Protokolliert fehlgeschlagene S3-Lernbild-Fetches beim Scan
// Ermöglicht Admin-Warnung und gezieltes Neu-Hochladen defekter Bilder
export const kioskImageFetchErrors = mysqlTable("kiosk_image_fetch_errors", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull(),
  stationId: int("stationId"),
  menuItemId: int("menuItemId"),
  imageKey: varchar("imageKey", { length: 512 }),
  errorType: mysqlEnum("errorType", [
    "presign_failed",
    "s3_fetch_failed",
    "invalid_content_type",
    "too_large",
    "unknown",
  ]).default("unknown").notNull(),
  errorMessage: varchar("errorMessage", { length: 512 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type KioskImageFetchError = typeof kioskImageFetchErrors.$inferSelect;
export type InsertKioskImageFetchError = typeof kioskImageFetchErrors.$inferInsert;

// ─── KIOSK MARKETING CONFIG ──────────────────────────────────────────────────
// Konfiguration für den Marketing-Screen nach erfolgreicher Zahlung
export const kioskMarketingConfig = mysqlTable("kiosk_marketing_config", {
  id: int("id").autoincrement().primaryKey(),
  restaurantId: int("restaurantId").notNull().unique(), // 1:1 pro Restaurant
  // Treuepunkte
  loyaltyEnabled: boolean("loyaltyEnabled").default(false).notNull(),
  loyaltyTitle: varchar("loyaltyTitle", { length: 100 }).default("Treuepunkte sammeln").notNull(),
  loyaltyText: varchar("loyaltyText", { length: 300 }).default("Sammeln Sie Punkte bei jedem Einkauf und profitieren Sie von exklusiven Rabatten.").notNull(),
  loyaltyUrl: varchar("loyaltyUrl", { length: 500 }),
  // Social Media
  instagramUrl: varchar("instagramUrl", { length: 500 }),
  facebookUrl: varchar("facebookUrl", { length: 500 }),
  tiktokUrl: varchar("tiktokUrl", { length: 500 }),
  // Empfehlung / Custom CTA
  customCtaEnabled: boolean("customCtaEnabled").default(false).notNull(),
  customCtaTitle: varchar("customCtaTitle", { length: 100 }),
  customCtaText: varchar("customCtaText", { length: 300 }),
  customCtaButtonLabel: varchar("customCtaButtonLabel", { length: 60 }),
  customCtaUrl: varchar("customCtaUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KioskMarketingConfig = typeof kioskMarketingConfig.$inferSelect;
export type InsertKioskMarketingConfig = typeof kioskMarketingConfig.$inferInsert;

// ─── LAGERRÄUME (WAREHOUSE ZONES) ────────────────────────────────────────────
// Jedes Restaurant kann mehrere Lagerräume haben (Kühlraum, Tiefkühl, Trocken, etc.)
export const warehouseZones = mysqlTable("warehouse_zones", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),                          // z.B. "Kühlraum 1 – Getränke"
  type: mysqlEnum("type", ["kuehl", "tiefkuehl", "trocken", "keg", "leergut", "sonstige"]).default("trocken").notNull(),
  tempCelsius: decimal("tempCelsius", { precision: 5, scale: 1 }),           // Solltemperatur in °C
  sizeM2: decimal("sizeM2", { precision: 6, scale: 1 }),                     // Grösse in m²
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WarehouseZone = typeof warehouseZones.$inferSelect;
export type InsertWarehouseZone = typeof warehouseZones.$inferInsert;

// ─── LAGERORTE (WAREHOUSE LOCATIONS) ─────────────────────────────────────────
// Einzelne Stellplätze innerhalb eines Lagerraums (Regal A / Fach 1, Palette B, etc.)
// Jeder Lagerort hat einen eindeutigen QR-Code-Slug für den Scan-Workflow
export const warehouseLocations = mysqlTable("warehouse_locations", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  zoneId: int("zoneId").notNull(),                                           // FK → warehouse_zones
  name: varchar("name", { length: 200 }).notNull(),                          // z.B. "Regal A – Fach 1"
  shelf: varchar("shelf", { length: 50 }),                                   // Regal-Bezeichnung
  compartment: varchar("compartment", { length: 50 }),                       // Fach-Bezeichnung
  qrSlug: varchar("qrSlug", { length: 64 }).notNull().unique(),              // eindeutiger QR-Code-Wert
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WarehouseLocation = typeof warehouseLocations.$inferSelect;
export type InsertWarehouseLocation = typeof warehouseLocations.$inferInsert;

// ─── LIEFERFOTOS (DELIVERY PHOTOS) ───────────────────────────────────────────
// Fotos von Lieferscheinen oder beschädigter Ware bei Wareneingang/-ausgang
export const inventoryDeliveryPhotos = mysqlTable("inventory_delivery_photos", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  movementId: int("movementId").notNull(),                                   // FK → inventory_stock_movements
  imageUrl: varchar("imageUrl", { length: 1000 }).notNull(),
  imageKey: varchar("imageKey", { length: 500 }),                            // S3-Key
  photoType: mysqlEnum("photoType", ["delivery_note", "damage", "quality", "other"]).default("delivery_note").notNull(),
  notes: text("notes"),
  uploadedBy: int("uploadedBy"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type InventoryDeliveryPhoto = typeof inventoryDeliveryPhotos.$inferSelect;
export type InsertInventoryDeliveryPhoto = typeof inventoryDeliveryPhotos.$inferInsert;

// ─── KI-IMPORT-SESSIONS ───────────────────────────────────────────────────────
// Speichert den Status und das Ergebnis eines KI-gestützten Speisekarten-Imports
export const aiImportSessions = mysqlTable("ai_import_sessions", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  createdBy: int("createdBy").notNull(),
  status: mysqlEnum("status", ["pending", "analyzing", "ready", "confirmed", "failed"]).default("pending").notNull(),
  fileUrl: varchar("fileUrl", { length: 1000 }),
  fileKey: varchar("fileKey", { length: 500 }),
  fileName: varchar("fileName", { length: 255 }),
  resultJson: text("resultJson"),
  errorMessage: text("errorMessage"),
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AiImportSession = typeof aiImportSessions.$inferSelect;
export type InsertAiImportSession = typeof aiImportSessions.$inferInsert;

// ─── Onboarding Progress ─────────────────────────────────────────────────────
export const onboardingProgress = mysqlTable("onboarding_progress", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  restaurantId: bigint("restaurantId", { mode: "number" }).notNull(),
  stepKey: varchar("stepKey", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["pending", "done", "skipped"]).notNull().default("pending"),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = typeof onboardingProgress.$inferInsert;

// ─── Tuya Smart-Building ─────────────────────────────────────────────────────
// Tuya API-Zugangsdaten pro Restaurant
export const tuyaCredentials = mysqlTable("tuya_credentials", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull().unique(),
  clientId: varchar("clientId", { length: 255 }).notNull(),
  clientSecret: varchar("clientSecret", { length: 255 }).notNull(),
  region: mysqlEnum("region", ["eu", "us", "cn", "in"]).default("eu").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TuyaCredentials = typeof tuyaCredentials.$inferSelect;
export type InsertTuyaCredentials = typeof tuyaCredentials.$inferInsert;

// Registrierte Tuya-Geräte pro Restaurant
export const tuyaDevices = mysqlTable("tuya_devices", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  deviceId: varchar("deviceId", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  location: varchar("location", { length: 255 }),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  alertEnabled: boolean("alertEnabled").default(true).notNull(),
  alertMinValue: varchar("alertMinValue", { length: 32 }),
  alertMaxValue: varchar("alertMaxValue", { length: 32 }),
  metaJson: text("metaJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TuyaDevice = typeof tuyaDevices.$inferSelect;
export type InsertTuyaDevice = typeof tuyaDevices.$inferInsert;

// Messwerte / Sensorlogs
export const tuyaReadings = mysqlTable("tuya_readings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  deviceId: int("deviceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  status: mysqlEnum("status", ["ok", "warning", "alarm"]).default("ok").notNull(),
  recordedAt: bigint("recordedAt", { mode: "number" }).notNull(),
});
export type TuyaReading = typeof tuyaReadings.$inferSelect;
export type InsertTuyaReading = typeof tuyaReadings.$inferInsert;

// Alarm-Ereignisse
export const tuyaAlerts = mysqlTable("tuya_alerts", {
  id: int("id").primaryKey().autoincrement(),
  deviceId: int("deviceId").notNull(),
  restaurantId: int("restaurantId").notNull(),
  alertType: varchar("alertType", { length: 64 }).notNull(),
  message: text("message").notNull(),
  value: varchar("value", { length: 255 }),
  isResolved: boolean("isResolved").default(false).notNull(),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TuyaAlert = typeof tuyaAlerts.$inferSelect;
export type InsertTuyaAlert = typeof tuyaAlerts.$inferInsert;

// Tuya Polling-Konfiguration pro Restaurant
export const tuyaPollingConfig = mysqlTable("tuya_polling_config", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull().unique(),
  intervalMinutes: int("intervalMinutes").default(10).notNull(), // 5, 10, 15, 30
  isEnabled: boolean("isEnabled").default(false).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastPolledAt: bigint("lastPolledAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TuyaPollingConfig = typeof tuyaPollingConfig.$inferSelect;
export type InsertTuyaPollingConfig = typeof tuyaPollingConfig.$inferInsert;

// Admin Push-Subscriptions (für kritische Tuya-Alarme)
export const adminPushSubscriptions = mysqlTable("admin_push_subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  userId: int("userId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: varchar("p256dh", { length: 512 }).notNull(),
  auth: varchar("auth", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdminPushSubscription = typeof adminPushSubscriptions.$inferSelect;
export type InsertAdminPushSubscription = typeof adminPushSubscriptions.$inferInsert;

// ─── MARKETING MODULE ────────────────────────────────────────────────────────

// Marketing Posts (KI-generierte Social-Media-Posts)
export const marketingPosts = mysqlTable("marketing_posts", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  imageUrl: text("imageUrl"),
  imageKey: varchar("imageKey", { length: 512 }),
  videoUrl: text("videoUrl"),
  videoKey: varchar("videoKey", { length: 512 }),
  mediaType: mysqlEnum("mediaType", ["image", "video"]).default("image").notNull(),
  aiAnalysis: text("aiAnalysis"),           // KI-Analyse des Gerichts
  captionInstagram: text("captionInstagram"),
  captionFacebook: text("captionFacebook"),
  captionGoogle: text("captionGoogle"),
  captionTiktok: text("captionTiktok"),
  hashtags: text("hashtags"),               // JSON-Array als String
  platforms: text("platforms"),             // JSON-Array: ["instagram","facebook","google","tiktok"]
  postType: mysqlEnum("postType", ["post", "story", "reel", "post_and_story", "post_and_reel", "story_and_reel", "all"]).default("post").notNull(),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "scheduled", "published", "rejected", "failed"]).default("draft").notNull(),
  sourceType: mysqlEnum("sourceType", ["manual", "waiter_flow", "auto"]).default("manual").notNull(),
  productId: int("productId"),
  productName: varchar("productName", { length: 255 }),
  scheduledAt: timestamp("scheduledAt"),
  publishedAt: timestamp("publishedAt"),
  publishResults: text("publishResults"),   // JSON: { instagram: ok, facebook: error, ... }
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketingPost = typeof marketingPosts.$inferSelect;
export type InsertMarketingPost = typeof marketingPosts.$inferInsert;

// Marketing Platform Connections (OAuth-Tokens pro Restaurant)
export const marketingPlatforms = mysqlTable("marketing_platforms", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  platform: mysqlEnum("platform", ["instagram", "facebook", "google", "tiktok"]).notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  pageId: varchar("pageId", { length: 128 }),
  accountId: varchar("accountId", { length: 128 }),
  accountName: varchar("accountName", { length: 255 }),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  isActive: boolean("isActive").default(true).notNull(),
  connectedAt: timestamp("connectedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketingPlatform = typeof marketingPlatforms.$inferSelect;
export type InsertMarketingPlatform = typeof marketingPlatforms.$inferInsert;

// Marketing Settings pro Restaurant
export const marketingSettings = mysqlTable("marketing_settings", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull().unique(),
  waiterCameraEnabled: boolean("waiterCameraEnabled").default(false).notNull(),
  waiterCameraForced: boolean("waiterCameraForced").default(false).notNull(), // Kellner kann nicht überspringen
  autoApprove: boolean("autoApprove").default(false).notNull(),
  weeklyPostTarget: int("weeklyPostTarget").default(5).notNull(),
  reviewBoosterEnabled: boolean("reviewBoosterEnabled").default(false).notNull(),
  reviewBoosterDelayMinutes: int("reviewBoosterDelayMinutes").default(5).notNull(),
  reviewBoosterMinRating: int("reviewBoosterMinRating").default(4).notNull(), // Nur ab X Sterne direkt zu Google
  googleReviewUrl: text("googleReviewUrl"),
  twilioAccountSid: varchar("twilioAccountSid", { length: 64 }),
  twilioAuthToken: varchar("twilioAuthToken", { length: 64 }),
  twilioFromNumber: varchar("twilioFromNumber", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MarketingSettings = typeof marketingSettings.$inferSelect;
export type InsertMarketingSettings = typeof marketingSettings.$inferInsert;

// Kellner-Foto-Anfragen (KI entscheidet ob Foto nötig)
export const marketingPhotoRequests = mysqlTable("marketing_photo_requests", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  orderId: int("orderId"),
  productId: int("productId"),
  productName: varchar("productName", { length: 255 }).notNull(),
  reason: text("reason"),                   // KI-Begründung warum Foto sinnvoll
  aiScore: int("aiScore").default(0),       // Relevanz-Score 0-100
  aiContext: text("aiContext"),             // JSON: { daysSinceLastPost, stock, weather, ... }
  status: mysqlEnum("status", ["pending", "completed", "skipped", "expired"]).default("pending").notNull(),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  imageUrl: text("imageUrl"),
  postId: int("postId"),                    // Verknüpfter Marketing-Post
});
export type MarketingPhotoRequest = typeof marketingPhotoRequests.$inferSelect;
export type InsertMarketingPhotoRequest = typeof marketingPhotoRequests.$inferInsert;

// Bewertungs-Booster Log
export const reviewBoostLog = mysqlTable("review_boost_log", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  orderId: int("orderId"),
  guestPhone: varchar("guestPhone", { length: 32 }),
  guestName: varchar("guestName", { length: 255 }),
  channel: mysqlEnum("channel", ["sms", "whatsapp", "email"]).default("sms").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  clicked: boolean("clicked").default(false).notNull(),
  clickedAt: timestamp("clickedAt"),
});
export type ReviewBoostLog = typeof reviewBoostLog.$inferSelect;
export type InsertReviewBoostLog = typeof reviewBoostLog.$inferInsert;

// Stammkunden-Kampagnen
export const customerCampaigns = mysqlTable("customer_campaigns", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  type: mysqlEnum("type", ["reactivation", "birthday", "slow_day", "favorite_back", "custom"]).notNull(),
  guestPhone: varchar("guestPhone", { length: 32 }),
  guestName: varchar("guestName", { length: 255 }),
  message: text("message"),
  channel: mysqlEnum("channel", ["sms", "whatsapp", "push", "email"]).default("sms").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["sent", "delivered", "failed"]).default("sent").notNull(),
  metadata: text("metadata"),               // JSON: { lastVisit, favoriteItem, ... }
});
export type CustomerCampaign = typeof customerCampaigns.$inferSelect;
export type InsertCustomerCampaign = typeof customerCampaigns.$inferInsert;

// Bewertungs-Booster Anfragen (mit Feedback-Token für Negativbewertungs-Abfang)
export const marketingReviewRequests = mysqlTable("marketing_review_requests", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  guestPhone: varchar("guestPhone", { length: 32 }).notNull(),
  guestName: varchar("guestName", { length: 255 }),
  tableNumber: varchar("tableNumber", { length: 32 }),
  orderId: int("orderId"),
  feedbackToken: varchar("feedbackToken", { length: 64 }).notNull().unique(),
  googleReviewUrl: text("googleReviewUrl").notNull(),
  smsSent: boolean("smsSent").default(false).notNull(),
  smsMessageId: varchar("smsMessageId", { length: 128 }),
  smsChannel: mysqlEnum("smsChannel", ["sms", "whatsapp"]).default("sms").notNull(),
  smsError: text("smsError"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  clickedAt: timestamp("clickedAt"),
  guestRating: int("guestRating"),              // 1-5 Sterne (intern erfasst)
  redirectedToGoogle: boolean("redirectedToGoogle").default(false).notNull(),
});
export type MarketingReviewRequest = typeof marketingReviewRequests.$inferSelect;
export type InsertMarketingReviewRequest = typeof marketingReviewRequests.$inferInsert;

// OAuth State Tokens (CSRF-Schutz für Social-Media-OAuth-Flows)
export const marketingOauthStates = mysqlTable("marketing_oauth_states", {
  id: int("id").primaryKey().autoincrement(),
  state: varchar("state", { length: 128 }).notNull().unique(),
  restaurantId: int("restaurantId").notNull(),
  platform: mysqlEnum("platform", ["instagram", "facebook", "google", "tiktok"]).notNull(),
  redirectUri: varchar("redirectUri", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type MarketingOauthState = typeof marketingOauthStates.$inferSelect;

// ─── SINGLE-SESSION-ENFORCEMENT ─────────────────────────────────────────────
// Pro User-Account darf nur ein Gerät gleichzeitig eingeloggt sein.
// Bei Login auf einem zweiten Gerät wird die alte Session überschrieben.
export const activeSessions = mysqlTable("active_sessions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull().unique(), // UNIQUE: nur eine aktive Session pro User
  deviceId: varchar("deviceId", { length: 128 }).notNull(),   // UUID, generiert im Browser
  sessionToken: varchar("sessionToken", { length: 256 }).notNull(), // JWT-Token-Hash (SHA-256)
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ActiveSession = typeof activeSessions.$inferSelect;
export type InsertActiveSession = typeof activeSessions.$inferInsert;

// ─── SIMPLAPOS LOCAL CONNECT ─────────────────────────────────────────────────
// Registrierte Local Connect Geräte pro Restaurant
export const localConnectDevices = mysqlTable("local_connect_devices", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  deviceId: varchar("deviceId", { length: 128 }).notNull().unique(),
  deviceToken: varchar("deviceToken", { length: 256 }).notNull().unique(),
  deviceName: varchar("deviceName", { length: 128 }).notNull().default("Local Connect"),
  platform: mysqlEnum("platform", ["android", "ios", "unknown"]).default("unknown").notNull(),
  appVersion: varchar("appVersion", { length: 32 }),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
  localIp: varchar("localIp", { length: 45 }), // IPv4 oder IPv6 des Geräts im lokalen Netzwerk
  localPort: int("localPort").default(8765), // HTTP-Server-Port von Local Connect
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LocalConnectDevice = typeof localConnectDevices.$inferSelect;
export type InsertLocalConnectDevice = typeof localConnectDevices.$inferInsert;

// Aufträge die an Local Connect gesendet werden
export const localConnectJobs = mysqlTable("local_connect_jobs", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  deviceId: varchar("deviceId", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["print", "print_test", "drawer_open", "scanner_config", "sync_menu", "sync_tables", "heartbeat"]).notNull(),
  payload: text("payload").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "confirmed", "failed", "timeout"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["high", "normal", "low"]).default("normal").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  confirmedAt: timestamp("confirmedAt"),
});
export type LocalConnectJob = typeof localConnectJobs.$inferSelect;
export type InsertLocalConnectJob = typeof localConnectJobs.$inferInsert;

// Onboarding-Tokens (einmalig, ablaufend, für QR-Code-Scan)
export const localConnectOnboardingTokens = mysqlTable("local_connect_onboarding_tokens", {
  id: int("id").primaryKey().autoincrement(),
  restaurantId: int("restaurantId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  used: boolean("used").default(false).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LocalConnectOnboardingToken = typeof localConnectOnboardingTokens.$inferSelect;

// ─── DATENBANK-BACKUPS (DSGVO/nDSG-konform, OR Art. 958f – 10 Jahre) ─────────
export const databaseBackups = mysqlTable("database_backups", {
  id: int("id").primaryKey().autoincrement(),
  filename: varchar("filename", { length: 255 }).notNull(),
  sizeBytes: bigint("sizeBytes", { mode: "number" }).notNull().default(0),
  status: mysqlEnum("status", ["running", "success", "failed"]).default("running").notNull(),
  type: mysqlEnum("type", ["scheduled", "manual", "pre_migration"]).default("scheduled").notNull(),
  encryptionAlgorithm: varchar("encryptionAlgorithm", { length: 32 }).default("AES-256-CBC").notNull(),
  storageLocation: varchar("storageLocation", { length: 512 }),
  checksum: varchar("checksum", { length: 128 }),
  errorMessage: text("errorMessage"),
  retentionUntil: timestamp("retentionUntil").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  triggeredBy: varchar("triggeredBy", { length: 128 }).default("system").notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
});
export type DatabaseBackup = typeof databaseBackups.$inferSelect;
export type InsertDatabaseBackup = typeof databaseBackups.$inferInsert;

// ─── COUNTRY CONFIGS (Multi-Country-Architektur) ──────────────────────────────
// Zentrale Länder-Konfiguration: Steuern, Währung, Preise, Compliance pro Land.
// Neue Länder können jederzeit hinzugefügt werden ohne Code-Änderungen.
export const countryConfigs = mysqlTable("country_configs", {
  id: int("id").autoincrement().primaryKey(),
  countryCode: varchar("countryCode", { length: 2 }).notNull().unique(), // ISO 3166-1 alpha-2
  name: varchar("name", { length: 128 }).notNull(),           // "Schweiz"
  nameEn: varchar("nameEn", { length: 128 }).notNull(),        // "Switzerland"
  flag: varchar("flag", { length: 8 }),                        // "🇨🇭"
  currency: varchar("currency", { length: 3 }).notNull(),      // "CHF"
  currencySymbol: varchar("currencySymbol", { length: 8 }).notNull(), // "CHF"
  locale: varchar("locale", { length: 8 }).notNull(),          // "de-CH"
  defaultLanguage: varchar("defaultLanguage", { length: 8 }).notNull(), // "de"
  // Steuer-Konfiguration (JSON)
  // Format: [{ name: "Standard", rate: 8.1, code: "standard" }, ...]
  taxRates: json("taxRates").notNull(),
  // Compliance-Flags (JSON)
  // Format: { fiscalRequired: false, fiscalSystem: null, gobdRequired: false, atkRequired: false }
  complianceFlags: json("complianceFlags").notNull(),
  // Preispläne (JSON) – länderspezifische Preise für Landing Page + Onboarding
  // Format: { starter: { monthly: 89, currency: "CHF" }, growth: {...}, ... }
  pricingPlans: json("pricingPlans").notNull(),
  // Modul-Preise (JSON) – länderspezifische Modulpreise
  modulePricing: json("modulePricing"),
  // Zahlungsmethoden (JSON) – verfügbare Zahlungsmethoden im POS
  availablePaymentMethods: json("availablePaymentMethods"),
  // Onboarding-Texte (JSON)
  onboardingContent: json("onboardingContent"),
  // Landing Page Inhalte (JSON)
  landingContent: json("landingContent"),
  // Kontakt & Support
  supportEmail: varchar("supportEmail", { length: 255 }),
  supportPhone: varchar("supportPhone", { length: 32 }),
  supportUrl: varchar("supportUrl", { length: 255 }),
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  isLaunched: boolean("isLaunched").default(false).notNull(), // öffentlich sichtbar
  sortOrder: int("sortOrder").default(99),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CountryConfig = typeof countryConfigs.$inferSelect;
export type InsertCountryConfig = typeof countryConfigs.$inferInsert;
