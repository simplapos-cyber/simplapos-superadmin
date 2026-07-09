// ─── SIMPLAPOS RBAC BERECHTIGUNGSSYSTEM ──────────────────────────────────────
// Zentrale Definition aller Rollen, Berechtigungen und Zuordnungen.
// Keine Hardcodierungen in Komponenten – alle Rechte werden hier verwaltet.

// ─── ROLLEN ──────────────────────────────────────────────────────────────────

export type AppRole =
  | "superadmin"
  | "partner"
  | "admin"
  | "manager"
  | "kellner"
  | "koch"
  | "bar"
  | "buchhalter"  // Treuhand
  | "gast"
  | "user";

// ─── ALLE BERECHTIGUNGEN ─────────────────────────────────────────────────────

export const PERMISSIONS = {
  // ── Restaurants ──
  "restaurant.view":        "Restaurants anzeigen",
  "restaurant.create":      "Restaurant erstellen",
  "restaurant.edit":        "Restaurant bearbeiten",
  "restaurant.delete":      "Restaurant löschen",
  "restaurant.suspend":     "Restaurant sperren/entsperren",

  // ── Benutzer ──
  "users.view":             "Benutzer anzeigen",
  "users.create":           "Benutzer erstellen",
  "users.edit":             "Benutzer bearbeiten",
  "users.delete":           "Benutzer löschen",
  "users.suspend":          "Benutzer sperren",
  "users.roles":            "Rollen & Rechte verwalten",

  // ── Mitarbeiter (Restaurant-Ebene) ──
  "staff.view":             "Mitarbeiter anzeigen",
  "staff.create":           "Mitarbeiter erstellen",
  "staff.edit":             "Mitarbeiter bearbeiten",
  "staff.delete":           "Mitarbeiter löschen",

  // ── Speisekarte ──
  "menu.view":              "Speisekarte anzeigen",
  "menu.create":            "Speisekarte erstellen",
  "menu.edit":              "Speisekarte bearbeiten",
  "menu.delete":            "Speisekarte löschen",
  "menu.availability":      "Verfügbarkeit umschalten",

  // ── Bestellungen ──
  "orders.view":            "Bestellungen anzeigen",
  "orders.create":          "Bestellung aufnehmen",
  "orders.edit":            "Bestellung bearbeiten",
  "orders.cancel":          "Bestellung stornieren",
  "orders.pay":             "Bestellung kassieren",
  "orders.split":           "Rechnung aufteilen",

  // ── Tischplan ──
  "tables.view":            "Tischplan anzeigen",
  "tables.manage":          "Tischplan verwalten",
  "tables.design":          "Tischplan gestalten",

  // ── Reservierungen ──
  "reservations.view":      "Reservierungen anzeigen",
  "reservations.create":    "Reservierung erstellen",
  "reservations.edit":      "Reservierung bearbeiten",
  "reservations.cancel":    "Reservierung stornieren",

  // ── Küche / KDS ──
  "kitchen.view":           "Küchen-Panel anzeigen",
  "kitchen.update":         "Bestellstatus aktualisieren",

  // ── Bar ──
  "bar.view":               "Bar-Panel anzeigen",
  "bar.update":             "Getränkestatus aktualisieren",

  // ── Rechnungen (Restaurant) ──
  "invoices.view":          "Rechnungen anzeigen",
  "invoices.create":        "Rechnung erstellen",
  "invoices.export":        "Rechnungen exportieren",

  // ── Abschlüsse / Treuhand ──
  "closings.view":          "Tagesabschlüsse anzeigen",
  "closings.create":        "Tagesabschluss erstellen",
  "vat.view":               "MwSt-Auswertung anzeigen",
  "payments.view":          "Zahlungsarten anzeigen",
  "storno.view":            "Storno-Protokoll anzeigen",

  // ── Statistiken ──
  "statistics.view":        "Statistiken anzeigen",
  "statistics.export":      "Statistiken exportieren",
  "revenue.view":           "Umsätze anzeigen",
  "revenue.live":           "Live-Umsätze anzeigen",

  // ── Gutscheine & Treuepunkte ──
  "vouchers.view":          "Gutscheine anzeigen",
  "vouchers.create":        "Gutschein erstellen",
  "vouchers.edit":          "Gutschein bearbeiten",
  "loyalty.view":           "Treuepunkte anzeigen",
  "loyalty.manage":         "Treuepunkte verwalten",

  // ── Lager / Inventar ──
  "inventory.view":         "Lager anzeigen",
  "inventory.edit":         "Lager bearbeiten",

  // ── Geräte / Drucker ──
  "devices.view":           "Geräte anzeigen",
  "devices.manage":         "Geräte verwalten",
  "printers.view":          "Drucker anzeigen",
  "printers.manage":        "Drucker verwalten",

  // ── Zahlungsarten ──
  "payment_methods.view":   "Zahlungsarten anzeigen",
  "payment_methods.manage": "Zahlungsarten verwalten",

  // ── Takeaway / Lieferung ──
  "takeaway.view":          "Takeaway anzeigen",
  "takeaway.manage":        "Takeaway verwalten",
  "delivery.view":          "Lieferung anzeigen",
  "delivery.manage":        "Lieferung verwalten",

  // ── Module ──
  "modules.view":           "Module anzeigen",
  "modules.manage":         "Module verwalten",

  // ── Restaurant-Einstellungen ──
  "settings.view":          "Einstellungen anzeigen",
  "settings.edit":          "Einstellungen bearbeiten",

  // ── Marketing ──
  "marketing.view":         "Marketing anzeigen",
  "marketing.manage":       "Marketing verwalten",

  // ── Schichten ──
  "shifts.view":            "Schichten anzeigen",
  "shifts.own":             "Eigene Schicht anzeigen",
  "shifts.manage":          "Schichten verwalten",

  // ── Verträge (Superadmin/Partner) ──
  "contracts.view":         "Verträge anzeigen",
  "contracts.create":       "Vertrag erstellen",
  "contracts.edit":         "Vertrag bearbeiten",
  "contracts.approve":      "Vertrag genehmigen",
  "contracts.delete":       "Vertrag löschen",

  // ── Abonnements ──
  "subscriptions.view":     "Abonnements anzeigen",
  "subscriptions.manage":   "Abonnements verwalten",

  // ── Rechnungen (Superadmin) ──
  "billing.view":           "Rechnungen (System) anzeigen",
  "billing.manage":         "Rechnungen (System) verwalten",

  // ── Werbung ──
  "ads.view":               "Werbung anzeigen",
  "ads.manage":             "Werbung verwalten",

  // ── Bewertungen ──
  "reviews.view":           "Bewertungen anzeigen",
  "reviews.manage":         "Bewertungen verwalten",

  // ── Medien ──
  "media.view":             "Bildbibliothek anzeigen",
  "media.upload":           "Medien hochladen",
  "media.delete":           "Medien löschen",

  // ── Hardware ──
  "hardware.view":          "Hardware-Katalog anzeigen",
  "hardware.manage":        "Hardware verwalten",

  // ── Chat / Support ──
  "chat.view":              "Chat anzeigen",
  "chat.send":              "Nachrichten senden",
  "chat.manage":            "Chat verwalten",

  // ── Systemeinstellungen (Superadmin) ──
  "system.view":            "Systemüberwachung anzeigen",
  "system.settings":        "Systemeinstellungen verwalten",
  "system.audit":           "Audit-Logs anzeigen",
  "system.logs":            "Aktivitätsprotokolle anzeigen",

  // ── Partner-spezifisch ──
  "partner.customers":      "Meine Kunden anzeigen",
  "partner.commissions":    "Provisionen anzeigen",
  "partner.leads":          "Leads verwalten",
  "partner.stats":          "Partner-Statistiken anzeigen",

  // ── Gast-spezifisch ──
  "guest.loyalty":          "Treuepunkte anzeigen",
  "guest.giftcards":        "Geschenkkarten anzeigen",
  "guest.invoices":         "Eigene Rechnungen anzeigen",
  "guest.qr_orders":        "QR-Bestellungen aufgeben",
  "guest.order_status":     "Bestellstatus verfolgen",
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ─── ROLLEN-BERECHTIGUNGEN ────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  superadmin: [
    // Superadmin hat alle Rechte
    "restaurant.view", "restaurant.create", "restaurant.edit", "restaurant.delete", "restaurant.suspend",
    "users.view", "users.create", "users.edit", "users.delete", "users.suspend", "users.roles",
    "contracts.view", "contracts.create", "contracts.edit", "contracts.approve", "contracts.delete",
    "subscriptions.view", "subscriptions.manage",
    "billing.view", "billing.manage",
    "ads.view", "ads.manage",
    "reviews.view", "reviews.manage",
    "media.view", "media.upload", "media.delete",
    "hardware.view", "hardware.manage",
    "chat.view", "chat.send", "chat.manage",
    "system.view", "system.settings", "system.audit", "system.logs",
    "statistics.view", "statistics.export",
    "modules.view", "modules.manage",
  ],

  partner: [
    "contracts.view", "contracts.create", "contracts.edit",
    "partner.customers", "partner.commissions", "partner.leads", "partner.stats",
    "chat.view", "chat.send",
    "statistics.view",
  ],

  admin: [
    // Restaurant-Admin: voller Zugriff auf sein Restaurant
    "staff.view", "staff.create", "staff.edit", "staff.delete",
    "menu.view", "menu.create", "menu.edit", "menu.delete", "menu.availability",
    "orders.view", "orders.create", "orders.edit", "orders.cancel", "orders.pay", "orders.split",
    "tables.view", "tables.manage", "tables.design",
    "reservations.view", "reservations.create", "reservations.edit", "reservations.cancel",
    "invoices.view", "invoices.create", "invoices.export",
    "closings.view", "closings.create",
    "vat.view", "payments.view", "storno.view",
    "statistics.view", "statistics.export", "revenue.view", "revenue.live",
    "vouchers.view", "vouchers.create", "vouchers.edit",
    "loyalty.view", "loyalty.manage",
    "inventory.view", "inventory.edit",
    "devices.view", "devices.manage",
    "printers.view", "printers.manage",
    "payment_methods.view", "payment_methods.manage",
    "takeaway.view", "takeaway.manage",
    "delivery.view", "delivery.manage",
    "modules.view", "modules.manage",
    "settings.view", "settings.edit",
    "marketing.view", "marketing.manage",
    "shifts.view", "shifts.manage",
    "chat.view", "chat.send",
  ],

  manager: [
    // Manager: Betriebsleitung ohne Systemeinstellungen
    "orders.view", "orders.create", "orders.edit", "orders.cancel", "orders.pay", "orders.split",
    "tables.view", "tables.manage",
    "reservations.view", "reservations.create", "reservations.edit", "reservations.cancel",
    "staff.view",
    "kitchen.view", "kitchen.update",
    "bar.view", "bar.update",
    "revenue.view", "revenue.live",
    "statistics.view",
    "shifts.view", "shifts.manage",
    "takeaway.view", "takeaway.manage",
    "delivery.view", "delivery.manage",
    "menu.availability",
    "chat.view", "chat.send",
  ],

  kellner: [
    // Kellner: Bestellungen aufnehmen und kassieren
    "orders.view", "orders.create", "orders.edit", "orders.cancel", "orders.pay", "orders.split",
    "tables.view",
    "menu.view", "menu.availability",
    "reservations.view",
    "shifts.own",
    "revenue.view",  // Nur eigene Umsätze
    "chat.view", "chat.send",
  ],

  koch: [
    // Küche: Nur Küchenmonitor
    "kitchen.view", "kitchen.update",
    "orders.view",
    "chat.view", "chat.send",
  ],

  bar: [
    // Bar: Nur Bar-Panel
    "bar.view", "bar.update",
    "orders.view",
    "chat.view", "chat.send",
  ],

  buchhalter: [
    // Treuhand: Nur Lesezugriff auf Finanzdaten
    "invoices.view", "invoices.export",
    "closings.view",
    "vat.view",
    "payments.view",
    "storno.view",
    "statistics.view", "statistics.export",
    "revenue.view",
  ],

  gast: [
    "guest.loyalty",
    "guest.giftcards",
    "guest.invoices",
    "guest.qr_orders",
    "guest.order_status",
    "chat.view", "chat.send",
  ],

  user: [
    "chat.view", "chat.send",
  ],
};

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────────

/**
 * Prüft ob eine Rolle eine bestimmte Berechtigung hat.
 */
export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Gibt alle Berechtigungen einer Rolle zurück.
 */
export function getPermissionsForRole(role: AppRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Prüft ob eine Rolle mindestens eine der angegebenen Berechtigungen hat.
 */
export function hasAnyPermission(role: AppRole, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

/**
 * Prüft ob eine Rolle alle angegebenen Berechtigungen hat.
 */
export function hasAllPermissions(role: AppRole, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

// ─── PANEL-ZUORDNUNG ─────────────────────────────────────────────────────────

export type PanelType =
  | "superadmin"
  | "partner"
  | "restaurant_admin"
  | "manager"
  | "waiter"
  | "kitchen"
  | "bar"
  | "accounting"
  | "guest";

export function getPanelForRole(role: AppRole, hasRestaurant?: boolean): PanelType {
  switch (role) {
    case "superadmin": return "superadmin";
    case "partner":    return "partner";
    case "admin":      return hasRestaurant ? "restaurant_admin" : "superadmin";
    case "manager":    return "manager";
    case "kellner":    return "waiter";
    case "koch":       return "kitchen";
    case "bar":        return "bar";
    case "buchhalter": return "accounting";
    case "gast":
    case "user":
    default:           return "guest";
  }
}
