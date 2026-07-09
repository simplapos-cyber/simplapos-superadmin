# Project TODO

- [x] iOS Safari crash fix: remove modulepreload links via Vite plugin
- [x] TypeScript errors in Subscriptions.tsx and Users.tsx (29 TS7006 errors)
- [x] Deployment fix: add stripe, pdfkit, bcryptjs to production dependencies
- [x] Tischplan in Bestellansicht identisch zum Designer rendern (feste Pixelgrössen, scrollbar, Raum-Name, Tischnummern)
- [x] iOS Safari weisse Seite debuggen (warten auf Mac-Konsolen-Output vom User - on hold)
- [x] Dreistufiges Zugangsmodell: 7 Tage Vollzugang → 7 Tage eingeschränkt (nur gebuchte Module) → Sperre bis Stripe-Zahlung
  - [x] DB: trialStartedAt + trialPhase Spalten in subscriptions (done via SQL)
  - [x] Backend: getAccessPhase() Hilfsfunktion in db.ts
  - [x] Backend: trialPhase endpoint in subscriptions router (myAccessPhase + accessPhaseByRestaurant)
  - [x] Backend: activateAccount setzt trialStartedAt beim ersten Login
  - [x] Frontend: SubscriptionGate Wrapper-Komponente (Vollzugang / Eingeschränkt / Gesperrt)
  - [x] Frontend: TrialPhaseBanner im DashboardLayout (Countdown-Anzeige)
  - [x] Frontend: Upselling-Hinweise bei nicht gebuchten Modulen in Phase 2 (AdminModules)
  - [x] Frontend: Sperr-Screen mit Stripe-Checkout-Button in Phase 3 (BlockedScreen)
  - [x] Frontend: Route /subscription/success mit Stripe-Bestätigung
  - [x] Backend: confirmPayment Mutation (Stripe Session verifizieren → Subscription aktivieren)
- [x] Vollständiges RBAC-Berechtigungssystem (shared/permissions.ts + usePermissions Hook)
- [x] Rollenbasierte Sidebar-Navigation (dynamisch, permission-basiert) für alle 9 Rollen
- [x] Superadmin Panel Seiten: Rollen & Rechte, Audit Logs, Aktivitätsprotokolle, System-Monitor, Systemeinstellungen
- [x] Partner Panel Seiten: Kunden, Provisionen, Leads, Statistiken
- [x] Admin Panel neue Seiten: Reservierungen, Takeaway, Gutscheine, Treuepunkte, Tagesabschlüsse, Lager, Geräte, Zahlungsarten
- [x] Manager Panel: Dashboard, Statistiken, Schichten
- [x] Kellner Panel: Mobile-First Dashboard mit Tischübersicht und Bestellstatus
- [x] Küche Panel: KDS Mobile-First mit Bestellkarten und Priorisierung
- [x] Bar Panel: Mobile-First Getränkebestellungen
- [x] Treuhand Panel: Buchhalter-Dashboard mit Umsatz, MwSt, Rechnungen
- [x] Gast Panel: Nur-Lese-Übersicht
- [x] DB: manager + barkeeper Rollen zum Enum hinzugefügt (Schema + Migration)
- [x] Alle neuen Routen in App.tsx registriert mit rollenbasierten Guards

## Priorität-1-Sicherheitsmassnahmen (freigegeben)

- [x] P1-Prüfung: Alle 15 Datenbereiche auf Multi-Tenant-Lücken analysiert
- [x] P1-M1: Fehlende Rollenprüfungen (11 Endpoints) umgesetzt + 23 Vitest-Tests (Checkpoint b28fa2c0)
- [x] P1-M2: Multi-Tenant-Isolation für Chat, Invoices, Media umgesetzt + 16 Tests (Checkpoint af0ac59b)
- [x] P1-M3: Rate-Limiting (IP + E-Mail) auf Login umgesetzt + 8 Tests (Checkpoint ca0c1968)
- [x] P1-M4: Helmet/CSP umgesetzt + 14 Tests (Checkpoint 25758124)
- [x] P1-Bericht: Vollständiger Änderungsbericht mit Rollback-Anleitung erstellt

## Neue Module (qrorpa.com Erweiterung)

- [x] M-NEW-1: Kassenbuch & Tagesabschluss – Modul in pricing.ts, DB-Felder, Router, Frontend-Seite, navConfig
- [x] M-NEW-2: Steuerberater-Export (CSV/DATEV) – Modul in pricing.ts, Router (Export-Endpoint), Frontend-Button in AdminClosings
- [x] M-NEW-3: Allergene & Nährwerte – Modul in pricing.ts, DB-Felder, Router, Frontend-Seite, navConfig
- [x] M-NEW-4: Mehrsprachige Speisekarte (DE/FR/EN/IT) – Modul in pricing.ts, DB-Tabelle menu_item_translations, Router, Frontend-Seite, navConfig
- [x] M-NEW-5: Bewertungsmanagement (Google/TripAdvisor) – Modul in pricing.ts, Router, Frontend-Seite, navConfig

## KI-Readiness-Architektur (9 Phasen)

- [x] Phase 1: Modul-Analyse (alle 21 Module dokumentiert)
- [x] Phase 2: AI Action Registry erstellt (10 Gruppen, 50+ Aktionen)
- [x] Phase 3: KI-Onboarding-Konzept entwickelt (12-Fragen-Wizard)
- [x] Phase 4: Speisekarten-Import-Architektur (7 Formate, LLM-Pipeline)
- [x] Phase 5: KI-Tischplan-Architektur (Bild-Erkennung + Kapazitäts-Generierung)
- [x] Phase 6: Kontext-bewusste KI-Architektur (AIContext-Interface)
- [x] Phase 7: KI-Support-Architektur (Wissensbase + Routing-Matrix)
- [x] Phase 8: KI-Verkaufsassistent-Konzept (7 Upselling-Trigger)
- [x] Phase 9: CTO-Bericht erstellt (PDF: ki_readiness_simplapos.pdf)

## Sprint 1: businessType + Reservierungen

- [x] S1-1: businessType-Enum und Feld in restaurants-Tabelle (Schema + Migration via SQL)
- [x] S1-2: reservations-Tabelle erstellt (Schema + Migration via SQL)
- [x] S1-3: DB-Helpers für Reservierungen (getReservations, getById, create, update, updateStatus, delete, stats)
- [x] S1-4: tRPC reservationsRouter (list, getById, create, update, updateStatus, delete, stats)
- [x] S1-5: AdminReservations.tsx vollständig an Backend angebunden (echte Daten, CRUD-Dialoge, Status-Inline-Änderung, Filter)
- [x] S1-6: businessType in AdminSettings eingebaut (Select-Dropdown mit 10 Betriebstypen, Backend-Enum korrigiert)
- [x] AdminReservations: Error-States für reservations.list und stats hinzugefügt (UI + Retry-Button)
- [x] S1-7: 18 Vitest-Tests für reservationsRouter (314/314 Tests grün)

## Sprint 2: Operative Panels (Kellner / Küche / Bar)

- [x] S2-1: Kellner-Panel – Tischübersicht mit echtem Tischplan + Bestellstatus (trpc.order.getTableStatus)
- [x] S2-2: Kellner-Panel – Neue Bestellung aufnehmen (Menü laden via getMenuForOrder, Artikel hinzufügen via addItem, sendToKitchen)
- [x] S2-3: Küchen-Panel (KDS) – Offene Bestellungen aus DB (getKitchenOrders), Status-Updates (updateItemStatus), Auto-Refresh 10s
- [x] S2-4: Bar-Panel – Getränkebestellungen aus DB (getKitchenOrders itemType=drink), Status-Updates, Auto-Refresh 10s
- [x] S2-5: 20 Vitest-Tests für operative Endpoints (334/334 Tests grün)

## Sprint 3: Vollständiges Lagerwirtschaftssystem

- [x] S3-1: DB-Schema: inventory_items, inventory_suppliers, inventory_stock_movements, inventory_purchase_orders, inventory_purchase_order_items, inventory_recipes
- [x] S3-2: DB-Migration via webdev_execute_sql
- [x] S3-3: inventoryRouter mit 20 Endpoints (CRUD + KI + Bestellwesen): listItems, createItem, updateItem, deleteItem, adjustStock, getMovements, getDashboardStats, getLowStockItems, getCategories, listSuppliers, createSupplier, updateSupplier, createPurchaseOrder, listPurchaseOrders, sendPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, getAiOrderSuggestions, getAiForecast, getMenuItemsForRecipe
- [x] S3-4: AdminInventory.tsx mit Tabs: Übersicht (Ampelsystem), Artikel (CRUD), Lieferanten (CRUD), Bewegungen (Protokoll)
- [x] S3-5: AdminInventoryPlanning.tsx mit KI-Bestellvorschlägen, Einkaufsplanung (Bestellungen erstellen/empfangen), Prognose-Dashboard
- [x] S3-6: Navigation für Einkaufsplanung in navConfig.ts eingetragen
- [x] S3-7: 35 Vitest-Tests für inventoryRouter (369/369 Tests grün)

## Sprint 4: Rezepturverwaltung + Automatische Nachbestellung

- [x] S4-1: inventoryRouter – Rezeptur-Endpoints: updateRecipeIngredient + deductStockFromOrder hinzugefügt
- [x] S4-2: AdminInventoryRecipes.tsx – vollständige Rezepturverwaltung (Menüartikel → Zutaten + Mengen, Lagerabzug-Vorschau)
- [x] S4-3: Navigation für Rezepturverwaltung in navConfig.ts eingetragen
- [x] S4-4: Heartbeat-Architektur gelesen (periodic-updates.md)
- [x] S4-5: Automatische Nachbestellung – autoReorderCron.ts Handler (täglich 06:00 UTC, autoReorder-Prüfung, Bestellung erstellen, Owner-Benachrichtigung)
- [x] S4-6: 19 Vitest-Tests für Rezepturverwaltung + Auto-Reorder (388/388 Tests grün)

## Sprint 5: Lagerabzug beim Verkauf + Wareneingangsprüfung

- [x] S5-1: closeOrder – deductStockFromOrder automatisch aufrufen (Multi-Tenant-Check, Fehlerbehandlung, kein Bestellabbruch bei fehlendem Rezept)
- [x] S5-2: receivePurchaseOrder – Abweichungsprotokoll (bestellt vs. geliefert), Differenz-Warnung, Lieferantenbewertung
- [x] S5-3: DB: inventoryDeliveryDiscrepancies-Tabelle + Lieferantenbewertungsfelder in inventory_suppliers
- [x] S5-4: Statistik-Dashboard: Lagerverbrauch pro Restaurant (Statistik-Tab + Abweichungs-Tab in AdminInventory)
- [x] S5-5: Vitest-Tests für alle neuen Endpoints (400/400 Tests grün, Multi-Tenant-Isolation explizit getestet)

## Sprint 8: Tagesabschluss-Automatisierung

- [x] S8-1: DB-Schema: daily_closing_config (autoEnabled, closingTime, timezone, scheduleCronTaskUid) + daily_closings (Tabelle erweitern: performedBy, mode: auto|manual)
- [x] S8-2: DB-Migration via webdev_execute_sql
- [x] S8-3: tRPC closingsRouter – Endpoints: getClosingConfig, saveClosingConfig (erstellt/aktualisiert Heartbeat-Job), triggerManualClosing (Kellner-Button), getClosings (Liste)
- [x] S8-4: Heartbeat-Handler /api/scheduled/dailyClosing (auth, lookup by taskUid, Abschluss-Logik: Umsatz/MwSt/Lagerabzüge/Kassendifferenz)
- [x] S8-5: Handler in server/_core/index.ts registrieren
- [x] S8-6: AdminClosings.tsx – Konfigurationsbereich (Toggle auto/manuell, Uhrzeit-Picker, Speichern) + Abschluss-Historie
- [x] S8-7: KellnerDashboard.tsx – "Tagesabschluss"-Button (nur sichtbar wenn Modus=manuell)
- [x] S8-8: Vitest-Tests (getClosingConfig, saveClosingConfig, triggerManualClosing, Multi-Tenant-Isolation) – 412/412 Tests grün

## Sprint 8 – Offene Punkte (Backlog)

- [x] S8-B1: Doppelte Tagesabschlüsse pro Restaurant/Tag verhindern (Unique-Check in performClosing)
- [x] S8-B2: Heartbeat-Zeitplanung DST-sicher machen (Intl.DateTimeFormat statt fixer UTC-Offsets)
- [x] S8-B3: Lagerabzüge im Tagesabschluss-Report integriert (totalStockConsumedValue + totalStockMovements)

## 404-Fehler beheben (alle fehlenden Routen)

- [x] /admin/statistics → AdminStatistics.tsx erstellt
- [x] /admin/marketing → AdminMarketing.tsx erstellt
- [x] /admin/printers → AdminPrinters.tsx erstellt
- [x] /admin/orders → AdminOrders.tsx erstellt
- [x] /admin/invoices → AdminInvoices.tsx erstellt
- [x] /admin/menu/* → MenuCategories/Items/Subcategories/Variants (Redirects zu /admin/menu)
- [x] /admin/delivery → AdminDelivery.tsx erstellt
- [x] /admin/shifts → AdminShifts.tsx erstellt + Route in App.tsx
- [x] /buchhalter/* → 7 Buchhalter-Unterseiten erstellt (revenue, closings, vat, invoices, payment-methods, cancellations, export)
- [x] /kellner/* → 8 Kellner-Unterseiten erstellt (Redirects zu /kellner)
- [x] /kueche/* → 4 Küche-Unterseiten erstellt (Redirects zu /kueche)
- [x] /bar/* → 4 Bar-Unterseiten erstellt (Redirects zu /bar)
- [x] /manager/* → 10 Manager-Unterseiten erstellt (Redirects zu /manager)
- [x] /gast/* → 5 Gast-Unterseiten erstellt (loyalty, giftcards, invoices, qr-orders, order-status)
- [x] adjustStock Validierung: quantity muss positiv sein (Test-Fix)
- [x] 412/412 Tests grün

## Admin "Betrieb"-Bereich

- [x] B1: AdminBetrieb – Tischplan-Ansicht live aus DB (Tische mit Status: frei/besetzt/reserviert)
- [x] B2: Tisch-Klick → Bestellmaske (Speisekarte, Menge, Notizen, Artikel hinzufügen/entfernen)
- [x] B3: Bestellung in Küche senden (sendToKitchen)
- [x] B4: Bestellung abrufen (bestehende offene Bestellung eines Tisches laden)
- [x] B5: Bestellung löschen/stornieren
- [x] B6: Bestellung teilen (Split-Bill: Artikel auf mehrere Rechnungen aufteilen)
- [x] B7: Bezahlen (Bar/Karte/Twint, Trinkgeld, Rechnung drucken)
- [x] B8: navConfig: "Betrieb" unter Admin-Navigation hinzugefügt (/admin/betrieb)
- [x] B9: App.tsx: /admin/betrieb Route registriert (zeigt auf OrderView)
- [x] B10: 412/412 Tests grün, TypeScript: 0 Fehler

## Kellner-Dashboard (rollenspezifisch)

- [x] KD-1: Backend getWaiterStats Endpoint (persönliche Umsätze heute/Woche/Monat, offene Bestellungen, Ø Bestelldauer, Zahlungsmethoden)
- [x] KD-2: KellnerDashboard.tsx komplett neu gebaut – kein Gast-Dashboard mehr
- [x] KD-3: Widgets: Begrüssung mit Name, Schnell-Aktionen (Tischplan/Kassieren/Bestellungen/Verlauf)
- [x] KD-4: Widgets: Tisch-Übersicht (besetzt/bereit/meine offenen)
- [x] KD-5: Widgets: Umsatz-Karten (heute/Woche/Monat mit Trinkgeld)
- [x] KD-6: Widgets: Schicht-Info (Dauer, Fortschrittsbalken, Gäste/Bestellungen)
- [x] KD-7: Widgets: Performance-Score (Ø Bestelldauer, Kreisdiagramm, Zahlungsmethoden)
- [x] KD-8: Widgets: Offene Bestellungen des Kellners (klickbar → Bestellmaske)
- [x] KD-9: Widgets: Letzte Abschlüsse (Aktivitätsliste mit Umsatz + Trinkgeld)
- [x] KD-10: Widgets: Ferien & Abwesenheiten (Platzhalter mit Anfrage-Button)
- [x] KD-11: Widgets: Netzwerk & System (Internet-Qualität, Latenz, Download, Sparkline)
- [x] KD-12: Widgets: Monatsübersicht (Gesamtumsatz, Trinkgeld, Bestellungen, Gäste, Ø-Werte)
- [x] KD-13: 412/412 Tests grün, TypeScript: 0 Fehler

## Stempeluhr-System (Kellner-Panel)

- [x] ST-1: DB-Schema: waiter_shifts, waiter_breaks, waiter_pins Tabellen erstellt + Migration
- [x] ST-2: shiftsRouter: clockIn, clockOut, startBreak, endBreak, setPin, hasPinSet, getCurrentShift, getMyShifts, getMonthStats, getActivityCorrelation
- [x] ST-3: Waiter_shift.tsx: Live-Timer (Sekunden-genau), PIN-Dialog, Pausen-Compliance, Verlauf (30 Schichten), Monatsstatistiken
- [x] ST-4: Anti-Betrug: PIN-Lockout nach 5 Fehlversuchen (15 Min. Sperre), Audit-Log (IP, UserAgent)
- [x] ST-5: CH ArG Art. 15 Pflichtpausen-Warnung und Compliance-Tracking (15/30/60 Min.)
- [x] ST-6: 439/439 Tests grün, TypeScript: 0 Fehler

## KI-Personalplanungssystem + Admin-Schicht + Ferien

- [x] AP-1: DB-Schema: staff_absences (Ferien/Krankheit), shift_templates, ai_shift_plans, ai_plan_shifts
- [x] AP-2: DB-Migration via webdev_execute_sql
- [x] AP-3: adminShiftsRouter: getAllShifts, getShiftStats, exportShiftsCsv, resetStaffPin, setStaffPin
- [x] AP-4: absencesRouter: requestAbsence (Kellner), listAbsences, approveAbsence, rejectAbsence, getMyAbsences
- [x] AP-5: aiPlanningRouter: generatePlan (LLM, Wetter, Feiertage, Reservationen, historische Daten), savePlan, getPlans, applyPlan
- [x] AP-6: Frontend: AdminShifts.tsx – Schichtübersicht (alle Mitarbeiter, Kalender, Filter), CSV-Export, PIN-Reset
- [x] AP-7: Frontend: WaiterAbsences.tsx – Abwesenheitsantrag stellen, eigene Anträge sehen
- [x] AP-8: Frontend: AdminAbsences.tsx – Alle Anträge verwalten, genehmigen/ablehnen
- [x] AP-9: Frontend: AiPlanning.tsx – KI-Dienstplan (Woche wählen, KI analysiert, Schichtplan anzeigen, bestätigen)
- [x] AP-10: WaiterPlannedShifts.tsx – Kellner sieht geplante Schichten, kann bestätigen, Verfügbarkeit setzen
- [x] AP-11: Tests + TypeScript-Check + Checkpoint (439/439 Tests grün, 0 TS-Fehler)

## Push-Benachrichtigungen + Schicht-Tausch

- [x] PN-1: absencesRouter – notifyOwner bei Genehmigung/Ablehnung + In-App-Notification an Kellner
- [x] PN-2: DB-Schema: shift_swap_requests Tabelle (requester, target, shiftId, status, adminNote)
- [x] PN-3: DB-Migration via webdev_execute_sql
- [x] PN-4: shiftSwapRouter: offerSwap, acceptSwap, declineSwap, adminApproveSwap, adminDeclineSwap, getMySwapRequests, getPendingSwaps (Admin)
- [x] PN-5: Benachrichtigungen bei allen Tausch-Events (Anfrage, Annahme, Ablehnung, Admin-Entscheid)
- [x] PN-6: Frontend: WaiterPlannedShifts.tsx – Tausch-Angebot-Button + eingehende Anfragen anzeigen
- [x] PN-7: Frontend: Benachrichtigungs-Badge in Sidebar (ungelesene Notifications)
- [x] PN-8: Tests + TypeScript-Check + Checkpoint

## Sprint: DATEV/PDF-Export + Schicht-Tausch-Badge + Auto-Zuweisung
- [x] F1: adminShiftsRouter – exportDatev (DATEV-Format) + exportPdfMonthly (PDF-Monatsbericht pro Mitarbeiter)
- [x] F2: aiPlanningRouter – applyPlan verbessern: automatische Schicht-Zuweisung in ai_plan_shifts + Benachrichtigung an alle betroffenen Kellner
- [x] F3: KellnerDashboard.tsx – Schicht-Tausch-Badge/Widget (offene Anfragen, Anzahl-Badge)
- [x] F4: AdminShifts.tsx – DATEV-Export-Button + PDF-Monatsbericht-Button
- [x] F5: Tests + TypeScript-Check + Checkpoint

## Schicht-Kalender (Kellner)
- [x] CAL-1: Backend: getMyCalendar Endpoint (Schichten + Ferien + Verfügbarkeit für einen Monat)
- [x] CAL-2: Frontend: WaiterCalendar.tsx – Monatskalender mit farbigen Einträgen, Tagesdetails, Navigation
- [x] CAL-3: Route registrieren, Sidebar-Eintrag, Tests, Checkpoint

## Schicht-Kommentar-Funktion
- [x] NK-1: Backend: updateShiftNotes Endpoint in shiftsRouter (shiftId + notes, nur eigene Schichten)
- [x] NK-2: Frontend: Inline-Kommentar-Editor im Tages-Detail-Panel (Bearbeiten-Button, Textarea, Speichern)
- [x] NK-3: TypeScript-Check, Tests, Checkpoint

## Sprint: Admin-Notizen + Pflicht-Notiz + Schicht-Bewertung
- [x] SB-1: DB-Schema: shift_ratings Tabelle (shiftId, staffId, restaurantId, rating 1-5, mood, comment, createdAt)
- [x] SB-2: DB-Migration via webdev_execute_sql
- [x] SB-3: adminShiftsRouter: getShiftDetails (mit notes + rating), getShiftRatingsOverview
- [x] SB-4: shiftsRouter: rateShift Endpoint (Kellner bewertet eigene Schicht), getRating
- [x] SB-5: clockOut: Pflicht-Notiz wenn Schicht > 10h (requiresNote Flag in Response)
- [x] SB-6: Frontend: AdminShifts.tsx – Notizen-Spalte + Detail-Modal mit Notiz und Bewertung
- [x] SB-7: Frontend: Waiter_shift.tsx – Pflicht-Notiz-Dialog nach Ausstempeln wenn > 10h
- [x] SB-8: Frontend: WaiterCalendar.tsx – Sterne-Bewertung im Tages-Detail-Panel
- [x] SB-9: Tests + TypeScript-Check + Checkpoint

## Phase 1: Operativer Restaurantbetrieb
- [x] P1-1: DB-Schema: order_voids (Storno-Protokoll: itemId, orderId, reason, qty, staffId, ts)
- [x] P1-2: DB-Schema: order_payments (Mischzahlung: orderId, method, amount, ts)
- [x] P1-3: DB-Migration via webdev_execute_sql
- [x] P1-4: Backend orderRouter: voidItem (Einzelposition stornieren, Kommentar, Berechtigungsprüfung)
- [x] P1-5: Backend orderRouter: getVoidLog (Storno-Protokoll für Admin)
- [x] P1-6: Backend orderRouter: addPayment (Teilzahlung hinzufügen, Restbetrag berechnen)
- [x] P1-7: Backend orderRouter: splitBill (Split nach Person/Produkt/Betrag, Sub-Rechnungen)
- [x] P1-8: Backend orderRouter: sendCourse (bestimmten Gang senden: nur Vorspeise, nur Hauptgang etc.)
- [x] P1-9: Frontend: Waiter_cart.tsx – Storno-Dialog (Position wählen, Grund eingeben, Bestätigung)
- [x] P1-10: Frontend: Waiter_cart.tsx – Gang-Auswahl beim Bonieren (Vorspeise/Hauptgang/Dessert/Individuell)
- [x] P1-11: Frontend: Waiter_cart.tsx – Gang separat senden (nur Gang 1 senden, Gang 2 warten)
- [x] P1-12: Frontend: Waiter_split.tsx – vollständiges Split-System (nach Person/Produkt/Betrag)
- [x] P1-13: Frontend: Waiter_checkout.tsx – Mischzahlung (mehrere Zahlungsmethoden, Restbetrag)
- [x] P1-14: Tests + TypeScript-Check + Checkpoint

## Phase 2: Tisch-Management
- [x] P2-1: DB-Schema: table_merges Tabelle (masterOrderId, mergedOrderIds, mergedAt, splitAt)
- [x] P2-2: DB-Migration via webdev_execute_sql
- [x] P2-3: Backend orderRouter: moveItems (Artikel von Tisch A zu Tisch B verschieben)
- [x] P2-4: Backend orderRouter: mergeTables (zwei Tische zusammenführen, eine Rechnung)
- [x] P2-5: Backend orderRouter: splitMergedTable (zusammengeführte Tische wieder trennen)
- [x] P2-6: Frontend: Artikel-Verschieben-Dialog in OrderView (Ziel-Tisch wählen, Artikel auswählen)
- [x] P2-7: Frontend: Tisch-Zusammenführen in Tischplan (Tisch wählen, Merge bestätigen)
- [x] P2-8: Frontend: Merged-Badge auf Tischen im Tischplan
- [x] P2-9: Tests + TypeScript-Check + Checkpoint

## Phase 3 – Echtzeit (SSE)
- [x] P3-1: SSE Event-Bus (server/_core/eventBus.ts) – In-Memory pub/sub pro Restaurant
- [x] P3-2: SSE HTTP-Endpoint (GET /api/sse/:restaurantId) mit Auth, Heartbeat, Cleanup
- [x] P3-3: SSE-Events in orderRouter emittieren (sendToKitchen, closeOrder, addItem, voidItem)
- [x] P3-4: useSSE React Hook (client/src/hooks/useSSE.ts) mit Auto-Reconnect (exponentieller Backoff)
- [x] P3-5: Küche-Panel: Polling durch SSE ersetzt (channel: kitchen)
- [x] P3-6: Bar-Panel: Polling durch SSE ersetzt (channel: bar)
- [x] P3-7: Kellner-Tischplan: SSE für Tischstatus-Updates (channel: floor)
- [x] P3-8: OrderView: SSE für Live-Updates (channels: floor + order)
- [x] P3-9: Tests + TypeScript-Check + Checkpoint (495/495 Tests grün, 0 TS-Fehler)

## Feature: SSE-Verbindungsstatus-Indikator
- [x] VS-1: useSSE Hook – Verbindungsstatus (connected/reconnecting/disconnected) als Rückgabewert
- [x] VS-2: SSEStatusBadge Komponente (grün/gelb/rot mit Tooltip)
- [x] VS-3: KuecheDashboard, BarDashboard, Waiter_tables – SSEStatusBadge einbauen

## Feature: Küchen-/Bar-Soundalarm
- [x] SA-1: useSoundAlert Hook (Web Audio API, konfigurierbar: an/aus, Lautstärke, localStorage)
- [x] SA-2: KuecheDashboard – Ton bei neuem SSE-Event (channel: kitchen)
- [x] SA-3: BarDashboard – Ton bei neuem SSE-Event (channel: bar)
- [x] SA-4: SoundAlertToggle Komponente (Lautsprecher-Icon + Lautstärkeregler) in Küche und Bar

## Feature: Gäste-QR-Bestellung
- [x] QR-1: DB-Schema: qr_table_sessions (token, tableId/floorPlanObjectId, restaurantId, status, expiresAt)
- [x] QR-2: DB-Migration via webdev_execute_sql
- [x] QR-3: Backend qrOrderRouter: generateQrToken, getSessionByToken, guestGetMenu, guestSubmitOrder, listSessions, closeSession
- [x] QR-4: Admin-Seite QrManagement.tsx: QR-Code generieren, anzeigen, drucken, herunterladen, Sessions verwalten
- [x] QR-5: Gast-Seite /guest/order/:token – Speisekarte mit Kategorien, Warenkorb, Bestellen
- [x] QR-6: SSE-Events bei Gast-Bestellung (kitchen + bar + floor channels)
- [x] QR-7: Route /guest/order/:token öffentlich (kein Auth), /admin/qr-management für Admins, navConfig-Eintrag
- [x] QR-8: 495/495 Tests grün, TypeScript: 0 Fehler, Checkpoint erstellt

## Bugfix: Kellner-Dashboard und Sidebar
- [x] BUG-K1: Kellner-Login zeigte GuestDashboard statt KellnerDashboard – Root-Redirect und /dashboard Route für alle Staff-Rollen korrigiert
- [x] BUG-K2: Kellner-Sidebar fehlten Stempeluhr/Dienstplan/Abwesenheiten/Schicht-Tausch/Kalender – buildNav.ts korrigiert: Staff-Rollen erhalten immer accessPhase=full (kein Modul-Gating für Nicht-Admins)
- [x] 495/495 Tests grün, TypeScript: 0 Fehler

## Bugfix: Tischplan-Designer
- [x] FP-BUG-1: Admin kann keinen Tischplan erstellen – behoben (Cookie SameSite=None → Lax, Safari/iOS blockierte das Cookie)

## Bugfix: Cookie SameSite (Safari/iOS)
- [x] COOKIE-BUG: SameSite=None → SameSite=Lax geändert – Safari/iOS blockierte das Cookie, auth.me gab null zurück, Tischplan-Erstellen schlug fehl

## Bugfix: Tischplan-Objekte DB-Schema-Abgleich
- [x] FPO-1: floor_plan_objects.type Enum in DB mit Code-Schema abgleichen – 57 Typen (alle Kategorien: Tische, Sitze, Gastro, Gebäude, Outdoor, Deko) in DB und Schema synchronisiert
- [x] FPO-2: Alle fehlenden Spalten in floor_plan_objects geprüft – alle Spalten vorhanden (id, floorPlanId, type, x, y, width, height, rotation, label, tableNumber, seats, isActive, qrCodeEnabled, qrOrderEnabled, qrPaymentEnabled, notes, properties, sortOrder, createdAt, updatedAt)
- [x] FPO-3: Vollständiger Schema-Abgleich: floor_plan_objects Enum-Erweiterung via ALTER TABLE ausgeführt, schema.ts aktualisiert

## Speisekartenverwaltung (Menu Management)
- [x] NAV-1: navConfig.ts – 4 separate Speisekarte-Einträge (Kategorien, Unterkategorien, Produkte, Varianten & Extras) durch einen einzigen Eintrag "Speisekarte verwalten" → /admin/menu ersetzt
- [x] MENU-1: DB-Schema: 10 Speisekarten-Tabellen erstellt (menu_categories, menu_items, menu_modifier_groups, menu_modifiers, menu_item_variant_groups, menu_item_variant_options, menu_item_modifier_groups, menu_sets, menu_set_courses, menu_tax_classes)
- [x] MENU-2: menuRouter.ts Backend: CRUD-Endpoints (listCategories, upsertCategory, deleteCategory, listItems, getItem, upsertItem, duplicateItem, importCsv, deleteItem, listModifierGroups, upsertModifierGroup, upsertModifier, deleteModifierGroup, linkModifierGroup, unlinkModifierGroup, listSets, upsertSet, deleteSet, upsertSetCourse, getFullMenu, listTaxClasses)
- [x] MENU-3: menuRouter in routers.ts registriert
- [x] MENU-4: MenuManagement.tsx Frontend: Kategorien, Artikel, Modifier-Gruppen, Menü-Sets, CSV-Import
- [x] MENU-5: TypeScript-Fehler behoben (itemType-Cast, modifiers/courses aus upsert entfernt, importCsv errors-Feld, preparationTime null→undefined, auth.logout.test.ts sameSite-Fix)
- [x] MENU-6: 495/495 Tests grün, TypeScript: 0 Fehler

## Speisekarte – Erweiterungen (Auftrag 2025-06-12)
- [x] MOD-LINK-1: Backend upsertItem – modifierGroupIds in menu_item_modifier_groups persistieren (DELETE + INSERT beim Speichern)
- [x] MOD-LINK-2: Backend getItem – modifierLinks (modifierGroupId) werden zurückgegeben; Frontend liest daraus die selektierten IDs
- [x] NUTR-1: DB-Schema: 9 Nährwert-Spalten (nutritionPer, calories, protein, fat, saturatedFat, carbs, sugar, fiber, salt) via ALTER TABLE hinzugefügt
- [x] NUTR-2: Backend upsertItem / getItem – alle Nährwert-Felder eingeschlossen
- [x] NUTR-3: Frontend – Nährwerte-Tab im Artikel-Formular (8 Felder + Bezugsgröße 100g/Portion)
- [x] IMG-1: Backend – /api/menu/upload-image Endpoint mit multer (5 MB Limit, nur Bilder, Auth-Check)
- [x] IMG-2: Frontend – Bild-Tab im Artikel-Formular mit Drag&Drop, Vorschau, URL-Eingabe
- [x] IMG-3: Frontend – Artikel-Übersicht zeigt 48x48px Thumbnail in der Listenzeile

## Neue Speisekarten-Struktur (MenuBuilder – Auftrag 2025-06-12 #2)
- [x] MB-1: DB-Schema: menu_top_categories (Oberkategorien: name, icon, color, sortOrder) erstellt via SQL
- [x] MB-2: DB-Schema: menu_categories.topCategoryId FK auf menu_top_categories hinzugefügt
- [x] MB-3: Backend: topCategories CRUD (listTopCategories, upsertTopCategory, deleteTopCategory) in menuRouter.ts
- [x] MB-4: Admin MenuBuilder-Seite (/admin/menu-builder): leere visuelle Struktur, Oberkategorien als klickbare Felder links, Unterkategorien als Chips, Produkte als Karten
- [x] MB-5: Admin MenuBuilder: Inline-Bearbeitung (Klick → Dialog öffnet sich direkt für Oberkategorien, Unterkategorien, Produkte)
- [x] MB-6: Kellner-Bestellansicht: Oberkategorien links als Icon-Spalte, Unterkategorien oben als Chips, Artikel als 2-Spalten-Karten – spiegelt Admin-Struktur exakt
- [x] MB-7: Sidebar-Navigation: "Speisekarte verwalten" → /admin/menu-builder

## Speisekarte 3-Zonen-Layout (Neuaufbau 2025-06-12 #3)
- [x] MBv2-1: MenuBuilder komplett neu – 3 Zonen: Links Oberkategorien, Oben Unterkategorien, Mitte Artikel
- [x] MBv2-2: Leerer Startzustand – kein Inhalt, überall „+“ zum Hinzufügen
- [x] MBv2-3: Kellner-Bestellansicht auf exakt dasselbe 3-Zonen-Layout umstellen

## MenuBuilder Verbesserungen (2026-06-12 #4)
- [x] DND-1: dnd-kit installieren (@dnd-kit/core 6.3.1, @dnd-kit/sortable 10.0.0, @dnd-kit/utilities 3.2.2)
- [x] DND-2: Drag & Drop für Oberkategorien (linke Spalte, vertikal sortierbar mit GripVertical-Handle)
- [x] DND-3: Drag & Drop für Unterkategorien (Chips oben, horizontal sortierbar mit GripHorizontal-Handle)
- [x] DND-4: Drag & Drop für Artikel (Grid, sortierbar mit GripVertical-Handle)
- [x] DND-5: sortOrder nach Drag & Drop persistiert: reorderTopCategories, reorderCategories, reorderItems
- [x] ICON-1: Icon-Picker im Oberkategorie-Dialog: 13 Icons als 4-Spalten-Grid mit Kacheln, Farb-Vorschau, aktiver Hervorhebung
- [x] CHIP-1: Unterkategorie-Chips in Kellner-Ansicht farbig: inaktiv = transparenter Hintergrund mit Farb-Border, aktiv = volle Farbe

## MenuBuilder Produkt-Dialog Fix (2026-06-12 #3)
- [x] PROD-FIX-1: nameTranslations/descriptionTranslations NOT-NULL-Fehler behoben (null als Default im Backend)
- [x] PROD-FIX-2: Vollständiger Produkt-Dialog mit 6 Tabs: Basis (Name, Preis, Typ, Gang, Verfügbarkeit), Bild (Upload+URL), Küche/Allergene (Station, KDS, 14 Allergene, 9 Labels), Extras/Modifier (Modifier-Gruppen auswählen), Nährwerte (8 Felder), Lager (Rezeptur-Zutaten)
- [x] PROD-FIX-3: Modifier-Gruppen im Extras-Tab auswählbar (aus bestehenden Gruppen, mit Check-Indikator)
- [x] PROD-FIX-4: Lager-Tab zeigt Rezeptur-Zutaten (read-only, Bearbeitung in Lager → Rezepturen)

## Bugfix: Produkt-Speichern schlägt fehl (2026-06-12)
- [x] BUG-PROD-1: allergens und labels wurden mit JSON.stringify() doppelt serialisiert → Drizzle json()-Spalten erwarten native Arrays, kein JSON.stringify() nötig – Fix: rohe Arrays senden
- [x] BUG-PROD-2: shortDescription-Spalte fehlte in der DB (INSERT schlug mit unknown column fehl) → ALTER TABLE menu_items ADD COLUMN shortDescription VARCHAR(255) NULL ausgeührt
- [x] BUG-PROD-3: sku und articleNumber fehlten im Drizzle-Schema (DB hatte sie bereits) → schema.ts aktualisiert
- [x] BUG-UI-1: Kellner-Sidebar war immer sichtbar (Icon-Only-Modus auf Desktop/Tablet) → Kellner-Rolle nutzt jetzt Drawer-Modus: Sidebar standardmäßig geschlossen, per Hamburger-Button oben links öffnen

## Bugfix: Kellner-Tischplan (2026-06-12)
- [x] BUG-TABLE-1: Kellner-Tischplan zeigt einfache Karten-Liste statt echtem FloorPlan-Canvas → FloorPlan-Canvas (read-only) mit Zoom/Pan, Tischstatus-Farben und echten Objekten eingebaut
- [x] BUG-TABLE-2: Klick auf Tisch navigierte zu /admin/order (404 für Kellner) → Route /kellner/order und /waiter/order für Kellner hinzugefügt, Navigation umgestellt
- [x] BUG-TABLE-3: floorPlan.list/get war adminProcedure → listForWaiter/getForWaiter als protectedProcedure hinzugefügt
- [x] BUG-TABLE-4: Zweiter grauer Canvas-Bereich unter dem Tischplan → height:100% entfernt, Canvas-Container auf calc(100dvh - 240px) gesetzt
- [x] BUG-TABLE-5: Klick auf Tisch/Bestellung in Kellner-Seiten navigierte zu /admin/order (Admin-Tischplan) → alle 4 Kellner-Dateien auf /kellner/order korrigiert
- [x] BUG-TABLE-6: Canvas leer oben (Tische nur unten sichtbar) → Auto-Fit mit ResizeObserver implementiert: wird ausgeführt sobald Container korrekte Höhe hat und Daten geladen sind
- [x] BUG-TABLE-7: Alle /admin/order Referenzen in Kellner-Seiten (KellnerDashboard, Waiter_cart, Waiter_history, Waiter_orders) auf /kellner/order korrigiert

## Bugfix: Kellner-Order und Produkte-Layout (2026-06-13)
- [x] BUG-ORDER-1: Kellner-Bestellansicht zeigt zweiten Tischplan → Tischplan aus OrderView entfernen
- [x] BUG-ORDER-2: Produkte-Layout in Kellner-Bestellansicht wurde verändert → auf ursprünglichen Zustand zurücksetzen

## Gemeinsamer Tischplan (Admin + Kellner)

- [x] SHARED-FLOOR-1: SharedFloorPlan-Komponente erstellen (Canvas, Zoom/Pan, alle Objekte, Legende, Echtzeit-Badge, Besetzt/Frei-Zähler)
- [x] SHARED-FLOOR-2: Admin (OrderView.tsx) auf SharedFloorPlan umstellen
- [x] SHARED-FLOOR-3: Kellner (Waiter_tables.tsx) auf SharedFloorPlan umstellen
- [x] SHARED-FLOOR-4: Echtzeit-Sync via SSE sicherstellen – alle Nutzer einer Restaurant-ID sehen denselben Stand

## Echtzeit-Bestellsync (Menükarte)

- [x] REALTIME-ORDER-1: Backend sendet SSE-Event mit orderId bei addItem/removeItem/updateItem
- [x] REALTIME-ORDER-2: Frontend (OrderView) hört auf SSE order_update Events und lädt Bestellung neu

## Mengen-Badge + Tisch-Frei-Automatik (2026-06-13)

- [x] BADGE-1: OrderItem-Typ in OrderView.tsx um `productId?: number | null` ergänzt
- [x] BADGE-2: Mengen-Badge auf Produktkarten implementiert (qty > 0 → Badge oben rechts, primäre Farbe, Summe aller nicht-stornierten Einheiten)
- [x] BADGE-3: Echtzeit-Update via SSE order_update – Badge aktualisiert sich sofort wenn Artikel hinzugefügt/entfernt werden
- [x] AUTO-FREE-1: Tisch wird nach Bestellabschluss automatisch auf "Frei" gesetzt (closeOrder setzt status="paid", getTableStatus filtert nur pending/preparing/ready/served, SSE floor_update triggert sofortigen Refresh auf allen Clients) – bereits implementiert, keine Code-Änderung nötig
- [x] 495/495 Tests grün, TypeScript: 0 Fehler

## KI-Tischplan-Generierung verbessert (2026-06-13)

- [x] KI-PROMPT-1: System-Prompt mit präzisen Koordinaten-Regeln, Skalierungsanweisung und Typen-Mapping
- [x] KI-PROMPT-2: User-Prompt mit exakten Skalierungsfaktoren (x * imgW/1200, y * imgH/800)
- [x] KI-PROMPT-3: Frontend misst Bild-Dimensionen und übergibt sie ans Backend
- [x] KI-PROMPT-4: Input-Schema um imageWidth/imageHeight erweitert
- [x] KI-PROMPT-5: Typ-Validierung im Frontend verhindert ungültige Typen
- [x] KI-PROMPT-6: max_tokens auf 12000 erhöht für vollständige Antworten

## Punkt 2: Badge-Klick-Dialog + Punkt 3: KDS-Zusammenfassung (2026-06-13)

- [x] P2-BADGE-1: OrderView.tsx – Klick auf Mengen-Badge öffnet Inline-Dialog (Produktname, aktuelle Menge, +/- Buttons, Entfernen-Button)
- [x] P2-BADGE-2: Dialog nutzt bestehende updateItemQty/removeItem Mutations (kein neuer Backend-Code)
- [x] P2-BADGE-3: Dialog schliesst sich automatisch nach Aktion, Badge aktualisiert sich via SSE
- [x] P3-KDS-1: KuecheDashboard.tsx – gleiche Artikel (selber Name) einer Bestellung zusammenfassen (Summe qty, alle item-IDs merken)
- [x] P3-KDS-2: Zusammengefasste Darstellung: "3x Schnitzel" statt 3 separate Zeilen
- [x] P3-KDS-3: Status-Update auf zusammengefassten Artikel aktualisiert alle zugehörigen item-IDs

## Code-Audit & Bereinigung (2026-06-13)

- [x] AUDIT-1: server/routers/menuRouter.ts (verwaiste Datei, nie importiert) gelöscht
- [x] AUDIT-2: client/src/pages/ComponentShowcase.tsx (1437 Zeilen, nie in App.tsx) gelöscht
- [x] AUDIT-3: 12 ungenutzte Funktionen aus server/db.ts entfernt (89 Zeilen weniger)
- [x] AUDIT-4: 3 Debug-console.log aus server/orderRouter.ts entfernt
- [x] AUDIT-5: TypeScript: 0 Fehler, 495/495 Tests grün nach Bereinigung

## Menüverwaltungssystem: Modifier, Varianten, Menüs/Sets (2026-06-13)

- [x] MENU-1: AdminMenuModifiers.tsx – Modifier-Gruppen verwalten (Name, Pflichtfeld, Min/Max, Aufpreis pro Modifier)
- [x] MENU-2: AdminMenuSets.tsx – Menüs/Sets verwalten (Fixpreis, Gänge, Wahlmöglichkeiten, zeitliche Begrenzung)
- [x] MENU-3: MenuBuilder.tsx – Varianten-Tab im Produkt-Dialog vollständig (Variantengruppen + Optionen mit eigenem Preis) – bereits vorhanden
- [x] MENU-4: NavConfig + App.tsx – neue Routen für Modifier und Menüs/Sets
- [x] MENU-5: OrderView.tsx – Bestell-Modal beim Bonieren (Varianten Pflichtauswahl, Modifier optional/Pflicht) – bereits vorhanden
- [x] MENU-6: menuRouter.ts – getMenuForOrder Endpoint mit Varianten und Modifiern pro Produkt – bereits vorhanden
- [x] MENU-7: orderRouter.ts – OrderItem speichert gewählte Variante und Modifier (JSON) – DB-Migration + Schema-Update

## Menü-Integration in Bestellmaske (2026-06-13)

- [x] ORDER-MOD-1: getMenuForOrder Backend – Modifier-Gruppen und Varianten pro Produkt zurückgeben
- [x] ORDER-MOD-2: ItemConfigSheet – Modifier-Popup mit echten Daten aus getMenuForOrder verbinden
- [x] ORDER-MOD-3: Pflicht-Modifier blockieren Bonieren bis Auswahl getroffen
- [x] ORDER-SET-1: getMenuForOrder – aktive Menüs/Sets zurückgeben (inkl. Gänge und Wahlmöglichkeiten)
- [x] ORDER-SET-2: OrderView – Menüs/Sets als eigene Kategorie in der linken Spalte anzeigen
- [x] ORDER-SET-3: Set-Bonieren-Modal – Gänge auswählen und als Positionen bonieren

## MwSt.-Gesetzeskonformität Schweiz (MWSTG / ESTV) – PFLICHT

- [x] MWST-1: Restaurant-Einstellungen – MwSt.-Nummer (CHE-Format), Firmenname, Adresse als Pflichtfelder für Bon-Druck
- [x] MWST-2: Steuerklassen – Standard-Sätze 8.1% (vor Ort) und 2.6% (Take-away) vorkonfiguriert, pro Produkt wählbar
- [x] MWST-3: Speisekarte – Bruttpreis-Hinweis "Preis inkl. MwSt." bei Preiseingabe anzeigen
- [x] MWST-4: Bon – MwSt.-Rückwärtsberechnung (Brutto / 1.081 × 0.081), Ausweis nach Satz am Bon-Ende
- [x] MWST-5: Bon – Pflichtfelder: Firmenname, MwSt.-Nr., Datum/Uhrzeit, Artikel, Total inkl. MwSt., MwSt.-Betrag je Satz
- [x] MWST-6: Tagesabschluss – MwSt.-Umsatz nach Satz aufgeteilt (8.1% / 2.6%) für ESTV-Abrechnung
- [x] MWST-7: Unterscheidung vor Ort / Take-away pro Bestellung für korrekten MwSt.-Satz

## Öffentliche Gastronomen-Onboarding-Webseite

- [x] ONBOARD-1: Öffentliche Landing Page (/landing) – Marketing, Features, Preise, Testimonials, CTA
- [x] ONBOARD-2: Onboarding-Wizard (/onboarding) Schritt 1: Betriebsdaten eingeben (Session-Start via onboardingRouter)
- [x] ONBOARD-3: Onboarding-Wizard Schritt 2: Module auswählen (Preisberechnung, Billing-Cycle monatlich/jährlich)
- [x] ONBOARD-4: Onboarding-Wizard Schritt 3: Vertrag digital unterzeichnen (AGB-Checkbox, Signatur-Felder)
- [x] ONBOARD-5: Onboarding-Wizard Schritt 4: Stripe-Zahlung (Checkout-Session, 14 Tage Trial)
- [x] ONBOARD-6: Onboarding-Wizard Schritt 5: Admin-Account aktivieren (Passwort setzen, Auto-Login, Trial-Start)
- [x] ONBOARD-7: Backend onboardingRouter mit allen Procedures: startSession, saveModules, signContract, createCheckout, checkPayment, activateAdmin, getSessionStatus, getModules, calculatePrice
- [x] ONBOARD-8: Session-Persistenz via localStorage (Wizard-Zustand bei Reload erhalten, getSessionStatus-Query)
- [x] ONBOARD-9: Routen /landing und /onboarding als öffentliche Routen in App.tsx registriert

## Trial-Anpassung + Onboarding-Verbesserungen (2026-06-13)

- [x] TRIAL-1: Trial-Dauer auf 14 Tage erhöhen (7 Tage voll + 7 Tage eingeschränkt) – getAccessPhase() in db.ts + Banner-Text in DashboardLayout
- [x] TRIAL-2: Onboarding-Wizard und Landing Page zeigen 14 Tage Trial-Hinweis
- [x] EMAIL-1: E-Mail-Bestätigung nach Vertragsunterzeichnung (signContract in onboardingRouter via notifyOwner + Bestätigungs-Mail an Gastronom)
- [x] STRIPE-WH-1: Stripe Webhook Handler /api/webhooks/stripe für checkout.session.completed → Subscription aktivieren
- [x] ROUTE-1: Root-Route / leitet nicht-eingeloggte Besucher zur Landing Page um

## KI-Speisekarten-Import
- [x] MENU-AI-1: Backend menuImportRouter: PDF/Bild-Upload via Multipart, S3-Speicherung, LLM-Analyse (Kategorien + Produkte extrahieren)
- [x] MENU-AI-2: Backend: Extrahierte Produkte in DB importieren (Kategorien anlegen, menuItems erstellen)
- [x] MENU-AI-3: Frontend: KI-Import-Dialog in MenuBuilder (Upload-Bereich, Analyse-Fortschritt, Vorschau-Liste, Bestätigung)
- [x] MENU-AI-4: Frontend: Importierte Produkte einzeln aktivieren/deaktivieren vor dem Speichern

## KI-Import Verbesserungen (Runde 2)
- [x] KI-IMP2-1: Inline-Preisbearbeitung in der Vorschauliste (Preis direkt im Dialog ändern)
- [x] KI-IMP2-2: Steuerklassen-Selektor pro Produkt in der Vorschauliste + globaler Standard-Selektor
- [x] KI-IMP2-3: Backend: Sprache der Speisekarte erkennen + automatisch auf Deutsch übersetzen

## Drei neue KI-Import-Features

- [x] NW-1: LLM-Prompt in menuImportRoute.ts um Nährwerte erweitern (calories, protein, carbs, fat)
- [x] NW-2: ImportedMenuItem-Typ um nutritionalValues erweitern (server + client)
- [x] NW-3: Nährwerte in Import-Vorschau anzeigen (kompakt: kcal, P, K, F)
- [x] NW-4: Nährwerte beim import-confirm in menu_items speichern
- [x] AF-1: MenuItem-Typ in OrderView.tsx um allergens-Feld erweitern
- [x] AF-2: Allergen-Filter-State (selectedAllergens Set) in OrderView.tsx hinzufügen
- [x] AF-3: Allergen-Filter-UI (Chips/Toggles) unter Suchfeld in OrderView.tsx
- [x] AF-4: filteredItems-useMemo um Allergen-Ausschluss-Logik erweitern
- [x] PG-1: Produktbild-Galerie im MenuBuilder bereits implementiert (imageUrl → img-Tag auf Karten) – verifiziert

## Gast-QR-Menü + MenuBuilder Erweiterungen

- [x] MB-NW-1: MenuBuilder Nährwert-Tab bereits vollständig implementiert – verifiziert
- [x] GQ-NW-1: Nährwerte (kcal, P, K, F) pro Artikel im Gast-QR-Menü anzeigen
- [x] GQ-NW-2: Nährwert-Anzeige aufklappbar (Details on demand) für sauberes Mobile-Layout
- [x] GQ-AF-1: Allergen-Filter-State im Gast-QR-Menü (excludedAllergens Set)
- [x] GQ-AF-2: Allergen-Filter-UI im Gast-QR-Menü (einklappbar, 14 Allergene)
- [x] GQ-AF-3: filteredItems-Logik im Gast-QR-Menü um Allergen-Ausschluss erweitern
- [x] GQ-AF-4: Allergen-Badges pro Artikel im Gast-QR-Menü anzeigen

## Bug-Fix: PDF-Upload

- [x] BF-PDF-1: pdftoppm (System-Binary) durch Node.js-kompatible Lösung ersetzen (PDF via S3 + signierte URL direkt an LLM)
- [x] BF-PDF-2: Nicht mehr benötigte Imports (execSync, fs, os) entfernen

## KI-Import: Oberkategorien-Fix

- [x] IMP-TC-1: LLM-Prompt um topCategory-Feld erweitern (Oberkategorie in GROSSBUCHSTABEN)
- [x] IMP-TC-2: ImportedMenuItem-Typ um topCategory erweitern (server + client)
- [x] IMP-TC-3: import-confirm um Oberkategorie-Erstellung (menuTopCategories) erweitern
- [x] IMP-TC-4: Unterkategorien mit topCategoryId-Verknüpfung anlegen
- [x] IMP-TC-5: Import-Vorschau nach Ober- und Unterkategorien gruppieren

## Import-Vorschau: Inline-Bearbeitung

- [x] IB-1: Klick auf Produktname öffnet Inline-Input (name editierbar)
- [x] IB-2: Klick auf Preis öffnet Inline-Input (price editierbar)
- [x] IB-3: Klick auf Oberkategorie öffnet Dropdown (topCategory editierbar)
- [x] IB-4: Klick auf Unterkategorie öffnet Dropdown (category editierbar)
- [x] IB-5: Änderungen werden im lokalen State gespeichert
- [x] IB-6: Geänderte Felder werden visuell hervorgehoben (gelber Rand)
- [x] IB-7: "Änderungen zurücksetzen"-Button pro Produkt

## KI-Chatbot (Admin & Kellner Panel)
- [x] CB-1: Backend chatbotRouter mit KI-Kontext (Speisekarte, Bestellungen, Tische, Umsatz)
- [x] CB-2: Frontend: schwebendes Chat-Widget (FAB) für Admin-Panel
- [x] CB-3: Frontend: schwebendes Chat-Widget (FAB) für Kellner-Panel
- [x] CB-4: Chatbot-Kontext: Speisekarte-Daten (Produkte, Kategorien, Preise, Allergene)
- [x] CB-5: Chatbot-Kontext: Aktuelle Bestellungen und Tischstatus
- [x] CB-6: Chatbot-Kontext: Tagesstatistiken (Umsatz, Top-Produkte)
- [x] CB-7: Chat-Verlauf pro Session im LocalStorage
- [x] CB-8: Schnell-Fragen-Buttons (Vorschläge) für häufige Anfragen

## KI-Tischplan-Generator Fixes

- [x] FP-1: Upload-Fehler behoben – Bild wird jetzt als Data-URL direkt an LLM übergeben (kein Umweg über Storage/Signed-URL)
- [x] FP-2: Ladeindikator hinzugefügt – Overlay mit Spinner und Text "KI analysiert Tischplan..." während der Analyse
- [x] FP-3: KI-Erkennung-Karte zeigt Spinner und "KI analysiert..." während der Verarbeitung
- [x] FP-4: MIME-Type-Erkennung aus Magic Bytes (JPEG/PNG/GIF/WebP) – verhindert Anthropic-Fehler bei Bildern mit falscher Dateiendung (z.B. JPEG als .PNG)
- [x] FP-5: Overlay in Editor-Ansicht verschoben – erscheint jetzt auch nach Plan-Erstellung während KI-Analyse (handleCreatePlan wechselt sofort zur Editor-Ansicht)
- [x] FP-6: Markdown-Code-Block-Stripping – Claude antwortet manchmal mit ```json...``` statt reinem JSON, JSON.parse schlug fehl. Fix: Regex entfernt Code-Block vor dem Parsen.
- [x] FP-7: Gut sichtbarer "+ Objekte"-Button in der Desktop-Toolbar (blau, mit Text) zum Öffnen der Objekt-Bibliothek
- [x] FP-8: Blauer "+ Objekte"-Button in der mobilen Toolbar (direkt neben Select/Pan-Buttons)
- [x] FP-9: Chatbot-FAB im Tischplan-Editor ausgeblendet (stört die Arbeitsfläche auf Mobile)
- [x] FP-10: Chatbot im Tischplan-Editor als ausklappbarer Seitenstreifen (links, kleiner Pfeil-Tab) statt FAB

## Tagesabschluss-Bericht (Professionell)

- [x] TAB-1: Backend: getClosingReport Endpoint – alle 9 Sektionen (Kopfzeile, Umsatz, MWST, Zahlungsarten, Kassendifferenz, Statistiken, Top-Produkte, Lagerabzüge, Audit)
- [x] TAB-2: Backend: generateClosingPdf Endpoint (Browser-Print statt pdfkit) – PDF-Generierung mit pdfkit (MWST-konform, Schweizer Standard)
- [x] TAB-3: Frontend: Bericht-Dialog in AdminClosings.tsx – alle 9 Sektionen visuell aufbereitet
- [x] TAB-4: Frontend: PDF-Download-Button im Bericht-Dialog
- [x] TAB-5: Frontend: Kassendifferenz-Eingabe (Ist-Betrag eingeben, Differenz wird berechnet)
- [x] TAB-6: Frontend: Abschluss-Liste zeigt Bericht-Button pro Eintrag
- [x] TAB-7: Tests für getClosingReport (527/527 Tests grün)

## Tagesabschluss: Kartenabgleich-Hinweis

- [x] TAB-8: Hinweistext im Tagesabschluss-Dialog – korrekte Vorgehensweise beim Kartenabgleich (ESTV-konform)

## Check-in/Check-out System (Stempeluhr mit Bargeld-Tracking)

- [x] CI-1: DB-Schema: cashStart, cashEnd, tipAmount, cashRevenue, staffRole zu waiter_shifts hinzugefügt (Migration 0019_checkin_cash.sql ausgeführt)
- [x] CI-2: Backend shiftsRouter.ts: clockIn um cashStart + staffRole erweitert, clockOut um cashEnd + Trinkgeld-Berechnung (cashEnd - cashStart - cashRevenue)
- [x] CI-3: Kellner-Stempeluhr (Waiter_shift.tsx): Nach PIN-Eingabe öffnet Bargeld-Start-Dialog (CHF-Eingabe, überspringbar)
- [x] CI-4: Kellner-Stempeluhr (Waiter_shift.tsx): Beim Ausstempeln öffnet Bargeld-End-Dialog (CHF-Eingabe, überspringbar)
- [x] CI-5: Kellner-Stempeluhr: Startbargeld-Anzeige in der Schicht-Details-Karte (grüne Karte mit CHF-Betrag)
- [x] CI-6: Kellner-Stempeluhr: Trinkgeld-Toast nach Ausstempeln (CHF-Betrag anzeigen)
- [x] CI-7: Koch-Check-in-Seite (KuecheCheckIn.tsx): Einstempeln ohne PIN, ohne Bargeld, mit Pausen-Compliance
- [x] CI-8: navConfig.ts: Koch-Rolle bekommt Stempeluhr-Navigationseintrag (/kueche/checkin, Gruppe "Persönlich")
- [x] CI-9: App.tsx: Route /kueche/checkin registriert (isKoch-Guard)
- [x] CI-10: 527/527 Tests grün, TypeScript: 0 Fehler

## Trial-Icon Verbesserungen (3 Punkte)

- [x] TI-1: Desktop-Sidebar: Trial-Icon im Footer für Admin-Rolle ergänzen (auch wenn Sidebar ausgeklappt/eingeklappt)
- [x] TI-2: Tageszahl-Badge direkt am Icon anzeigen (z.B. "6d" als kleiner Badge)
- [x] TI-3: Backend: Heartbeat-Job – automatische Owner-Benachrichtigung 3 Tage vor Ablauf der Testphase

## Tischverwaltung, Bestellsystem & KDS (Perfektionierung)

- [x] Waiter_checkout.tsx: Vollständige Zahlungsabwicklung mit Wechselgeld (CHF-Rundung), Schnellbeträgen, Trinkgeld, Zahlungsmethoden-Icons und Erfolgs-Screen
- [x] Waiter_split.tsx: Platzhalter durch echten 3-Schritt Split-Bill-Flow ersetzt (Personen anlegen → Artikel zuweisen → Einzeln bezahlen)
- [x] OrderView.tsx: Wechselgeld-Berechnung und Schnellbetrag-Buttons bei Barzahlung hinzugefügt
- [x] KuecheDashboard.tsx: Vollständig geprüft (SSE, Soundalarm, Gruppen-Zusammenfassung, Status-Buttons, Elapsed-Timer)
- [x] BarDashboard.tsx: Vollständig geprüft (SSE, Soundalarm, Status-Buttons, Elapsed-Timer)

## Bon-Druck, Tischplan-Wartezeit & Split-Bill-Direktzugriff

- [x] BON-1: Bon-Druck nach Zahlung (Browser-Print, Bon-Layout mit Tisch, Artikel, Summe, Zahlungsmethode, Trinkgeld, Datum)
- [x] BON-2: Bon-Druck in Waiter_checkout.tsx Erfolgs-Screen einbinden
- [x] BON-3: Bon-Druck in OrderView.tsx (Admin) nach Zahlung einbinden
- [x] TP-1: Tischplan-Karte: Wartezeit-Farbe (grün < 15 Min., orange 15-30 Min., rot > 30 Min.)
- [x] TP-2: Wartezeit-Badge auf Tischkarte anzeigen
- [x] SB-1: Tischplan-Karte: Direkter "Teilen"-Button öffnet Split-Bill ohne Umweg

## Rechnungs- und Debitorenmanagement (Schweizer QR-Rechnung)

- [x] INV-1: DB-Schema: invoices, invoice_items, mandates, payment_reminders, payment_confirmations
- [x] INV-2: Backend: tRPC-Router für Rechnungen CRUD, Mandatsverwaltung, E-Mail-Versand
- [x] INV-3: Schweizer QR-Rechnung PDF generieren (Swiss QR-Code, IBAN, Referenznummer)
- [x] INV-4: Admin-UI: Rechnungsübersicht mit Status-Filter, Rechnungserstellung, Mandatsverwaltung
- [x] INV-5: Automatische Zahlungserinnerungen (3 Stufen: Erinnerung, 1. Mahnung, 2. Mahnung)
- [x] INV-6: Zahlungsbestätigung manuell und automatisch, Debitorenstatistiken
- [x] INV-7: Zusatzfunktionen: Gutschriften, Teilzahlungen, Skonto, Mahnspesen, Archiv

## E-Mail, Mahnwesen & Gutschriften (Rechnungssystem Erweiterung)

- [x] EMAIL-1: SMTP-Secrets (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM) als Env-Variablen konfigurieren (Ethereal-Fallback im Dev-Modus)
- [x] EMAIL-2: nodemailer-Transport in invoicingRouter.ts mit echten SMTP-Credentials verdrahten
- [x] EMAIL-3: E-Mail-Template für QR-Rechnung (HTML mit QR-SVG-Anhang, CHF-Betrag, Fälligkeitsdatum)
- [x] EMAIL-4: E-Mail-Template für Zahlungserinnerung (1. Erinnerung, freundlich)
- [x] EMAIL-5: E-Mail-Template für Mahnung 1 (dunning1, mit Mahngebühr CHF 20)
- [x] EMAIL-6: E-Mail-Template für Mahnung 2 (dunning2, mit Mahngebühr CHF 40, Inkasso-Androhung)
- [x] DUNNING-1: dunningCron.ts Handler erstellen (täglich via Heartbeat)
- [x] DUNNING-2: Überfällige Rechnungen automatisch auf dunning1/dunning2 setzen (nach Fälligkeit +7/+21 Tage)
- [x] DUNNING-3: Mahngebühren automatisch zu invoice.dunningFee addieren
- [x] DUNNING-4: Mahnungs-E-Mail automatisch versenden
- [x] DUNNING-5: Heartbeat-Job für Mahnwesen registrieren (server/_core/index.ts, task_uid: Nfjf3Epqfs6WKZGGsUCSTc)
- [x] CREDIT-1: Gutschriften-Dialog in AdminInvoicing.tsx (createCreditNote-Button bei bezahlten/stornierten Rechnungen)
- [x] CREDIT-2: Gutschriften in Rechnungsliste anzeigen (Badge "Gutschrift", Link zur Original-Rechnung)
- [x] CREDIT-3: Gutschriften-PDF generieren (negativer Betrag, Referenz auf Original-Rechnungsnummer)

## Mahnspesen-Konfiguration & Aging-Report

- [x] DCFG-1: DB: dunning_config Tabelle (restaurantId, dunning1Fee, dunning2Fee, dunning1Days, dunning2Days, graceDays, currency)
- [x] DCFG-2: DB-Migration via webdev_execute_sql
- [x] DCFG-3: Backend: invoicingRouter – getDunningConfig + saveDunningConfig Endpoints
- [x] DCFG-4: dunningCron.ts – Mahngebühren aus dunning_config pro Restaurant laden (Fallback: CHF 20/40)
- [x] DCFG-5: Frontend: AdminSettings.tsx – Mahnspesen-Sektion (dunning1Fee, dunning2Fee, Fristen in Tagen)
- [x] AGING-1: Backend: invoicingRouter – getAgingReport Endpoint (Buckets: 0-30, 31-60, 61-90, >90 Tage)
- [x] AGING-2: Frontend: AdminInvoicing.tsx – neuer Tab "Aging-Report" mit Fälligkeitsstruktur-Tabelle
- [x] AGING-3: Frontend: Aging-Report – Summen pro Bucket, Gesamtübersicht, Export-Button (CSV)
- [x] AGING-4: Tests für getDunningConfig, saveDunningConfig, getAgingReport

## Kauf-auf-Rechnung-Flow (Waiter-Checkout)

- [x] INVFLOW-1: DB-Schema: invoiceIban, invoiceCreditorName, invoiceCreditorAddress im restaurants-Table ergänzen
- [x] INVFLOW-2: Migration für neue Felder ausführen
- [x] INVFLOW-3: getSettings-Endpoint: neue IBAN-Felder zurückgeben
- [x] INVFLOW-4: updateSettings-Endpoint: neue IBAN-Felder speichern
- [x] INVFLOW-5: AdminSettings.tsx: IBAN/Kreditor-Felder in Rechnungseinstellungen-Sektion
- [x] INVFLOW-6: Backend: createInvoiceFromOrder-Endpoint (orderId → automatische Rechnung aus Bestellpositionen)
- [x] INVFLOW-7: Waiter_checkout.tsx: Gastdaten-Dialog bei Auswahl 'Rechnung' (Name, E-Mail, Adresse, Fälligkeitsdatum)
- [x] INVFLOW-8: Waiter_checkout.tsx: Nach Bestellabschluss mit 'Rechnung' → createInvoiceFromOrder aufrufen
- [x] INVFLOW-9: Success-Screen: Rechnungsnummer und QR-Hinweis anzeigen

## IBAN-Vorausfüllung, E-Mail-Checkout & Waiter-Rechnungsübersicht

- [x] IBAN-1: Waiter_checkout.tsx: Wenn IBAN fehlt, Warn-Banner mit Link zu Einstellungen anzeigen
- [x] IBAN-2: Waiter_checkout.tsx: getSettings-Query laden und IBAN-Status prüfen
- [x] EMAIL-C1: Waiter_checkout.tsx: Success-Screen bei Rechnung – 'Per E-Mail senden'-Button
- [x] EMAIL-C2: Backend: sendInvoiceEmail-Endpoint (oder bestehenden nutzen) für direkten Versand nach Checkout
- [x] EMAIL-C3: Waiter_checkout.tsx: E-Mail-Versand-Mutation mit Lade- und Erfolgszustand
- [x] WI-1: WaiterInvoices.tsx: neue Seite mit offenen Rechnungen (sent, dunning1, dunning2)
- [x] WI-2: WaiterInvoices.tsx: Statusbadges, Fälligkeitsdatum, Debitorname, Betrag
- [x] WI-3: WaiterInvoices.tsx: Route /waiter/invoices in App.tsx registrieren
- [x] WI-4: navConfig.ts: Eintrag 'Offene Rechnungen' in Waiter-Navigation

## Push-Benachrichtigung & PDF-Vorschau

- [x] PUSH-1: Backend: createInvoiceFromOrder – notifyOwner nach erfolgreicher Rechnungserstellung
- [x] PUSH-2: Backend: createInvoice (manuell) – notifyOwner nach erfolgreicher Rechnungserstellung
- [x] PUSH-3: Frontend: Waiter_checkout.tsx – Browser-Notification-Permission-Request beim ersten Rechnungs-Checkout
- [x] PUSH-4: Frontend: Waiter_checkout.tsx – Browser-Notification anzeigen wenn Rechnung erstellt wurde
- [x] PDF-1: Backend: invoicingRouter – getInvoicePdf-Endpoint (gibt PDF-URL zurück, on-demand generiert)
- [x] PDF-2: Frontend: Waiter_checkout.tsx – «PDF anzeigen»-Button im Success-Screen (öffnet PDF-URL in neuem Tab)
- [x] PDF-3: Frontend: WaiterInvoices.tsx – «PDF anzeigen»-Button pro Rechnung in der Detailansicht (via generateAndSendInvoice, sendEmail: false)
- [x] PDF-4: Frontend: AdminInvoicing.tsx – «PDF anzeigen»-Button in der Rechnungsliste (bereits vorhanden via Eye-Icon)

## Zahlungsbestätigung (Kellner) & Wiederkehrende Rechnungen

- [x] PAY-1: Backend: markAsPaid-Endpoint für Kellner (invoicingRouter, protectedProcedure, Betrag + Zahlungsmethode)
- [x] PAY-2: Frontend: WaiterInvoices.tsx – «Als bezahlt markieren»-Button mit Betrag-Dialog (Bar/Karte/TWINT)
- [x] PAY-3: Frontend: WaiterInvoices.tsx – Optimistic Update nach Zahlungsbestätigung (invalidate + toast)
- [x] REC-1: DB-Schema: recurring_invoices Tabelle (restaurantId, mandateId, recipientName, iban, items, interval, nextDueDate, active)
- [x] REC-2: DB-Migration für recurring_invoices ausführen
- [x] REC-3: Backend: recurringInvoiceRouter – list, create, update, toggleActive, delete, getStats
- [x] REC-4: Backend: recurringInvoiceRouter in routers.ts registriert
- [x] REC-5: Backend: Heartbeat-Route /api/scheduled/recurring-check in index.ts registriert
- [x] REC-6: Heartbeat-Job täglich 06:00 UTC registriert
- [x] REC-7: Frontend: AdminRecurringInvoices.tsx – Abonnement-Übersicht mit Erstellen/Bearbeiten/Pausieren/Löschen
- [x] REC-8: Frontend: Route /admin/recurring-invoices in App.tsx, Navigationseintrag in navConfig.ts

## Suchfunktion, Abonnement-Vorschau & Debitorenstammdaten

- [x] SEARCH-1: Backend: invoicingRouter – listInvoices um searchQuery-Parameter erweitern (Debitorname, Rechnungsnummer, Betrag)
- [x] SEARCH-2: Frontend: AdminInvoicing.tsx – Suchfeld über Rechnungsliste mit Debounce (300ms)
- [x] SEARCH-3: Frontend: AdminInvoicing.tsx – Suchfeld filtert live nach Debitorname, Rechnungsnummer, E-Mail
- [x] PREVIEW-1: Backend: recurringInvoiceRouter – previewNextInvoice-Endpoint (berechnet nächste Rechnung ohne zu speichern)
- [x] PREVIEW-2: Frontend: AdminRecurringInvoices.tsx – «Vorschau»-Button pro Abonnement öffnet Vorschau-Dialog
- [x] PREVIEW-3: Frontend: Vorschau-Dialog zeigt Positionen, Gesamtbetrag, Fälligkeitsdatum, Empfänger, QR-Referenz
- [x] DEBTOR-1: DB-Schema: debtors Tabelle (restaurantId, name, company, email, phone, address, zip, city, country, iban, notes, createdAt)
- [x] DEBTOR-2: DB-Migration für debtors ausführen
- [x] DEBTOR-3: Backend: debtorRouter – list, create, update, delete, getById, getInvoiceHistory, getOpenBalance
- [x] DEBTOR-4: Backend: debtorRouter in routers.ts registrieren
- [x] DEBTOR-5: Frontend: AdminDebtors.tsx – Debitorenliste mit Statistik-Karten (Anzahl, offene Posten, überfällig)
- [x] DEBTOR-6: Frontend: AdminDebtors.tsx – CRUD-Dialog (Erstellen/Bearbeiten/Löschen)
- [x] DEBTOR-7: Frontend: AdminDebtors.tsx – Detailansicht: Zahlungshistorie + offene Rechnungen pro Debitor
- [x] DEBTOR-8: Frontend: AdminDebtors.tsx – «Rechnung erstellen»-Button direkt aus Debitorenstamm
- [x] DEBTOR-9: Frontend: Route /admin/debtors in App.tsx, Navigationseintrag in navConfig.ts
- [x] DEBTOR-10: Frontend: AdminRecurringInvoices.tsx – Debitor-Auswahl aus Stammdaten im Formular (via debtorId-Feld)

## Debitor-Checkout, CSV-Export & Saldowarnung

- [x] DCO-1: Backend: debtorRouter – listForSelect-Endpoint (id, name, company, email, iban, address, paymentTermDays)
- [x] DCO-2: Frontend: Waiter_checkout.tsx – Debitor-Auswahl-Dropdown im Gastdaten-Dialog (Suche + Auswahl aus Stamm)
- [x] DCO-3: Frontend: Waiter_checkout.tsx – Felder automatisch aus Debitorstamm befüllen bei Auswahl
- [x] DCO-4: Frontend: Waiter_checkout.tsx – Manuell überschreiben bleibt möglich
- [x] CSV-1: Backend: debtorRouter – exportCsv-Endpoint (alle Debitoren + offene Posten als CSV)
- [x] CSV-2: Frontend: AdminDebtors.tsx – «CSV exportieren»-Button (Download via Blob-URL)
- [x] CSV-3: Frontend: AdminDebtors.tsx – «Excel exportieren»-Button (XLSX via xlsx-Bibliothek)
- [x] WARN-1: Backend: debtorRouter – checkBalanceThresholds (prüft alle Debitoren auf Saldo > Schwellenwert)
- [x] WARN-2: Backend: Heartbeat-Route /api/scheduled/debtor-balance-check in index.ts registrieren
- [x] WARN-3: Backend: Heartbeat-Job täglich 08:00 UTC registrieren
- [x] WARN-4: Backend: notifyOwner bei Überschreitung mit Debitorname + Betrag
- [x] WARN-5: Frontend: AdminSettings.tsx – Saldowarnung-Schwellenwert konfigurieren (debtorBalanceWarningThreshold, Standard CHF 500)
- [x] WARN-6: DB-Schema: debtorBalanceWarningThreshold Feld in restaurants-Tabelle ergänzen
- [x] WARN-7: DB-Migration für neues Feld ausführen

## Mahnungs-PDF mit QR-Code

- [x] DPDF-1: Backend: generateDunningPdf() Hilfsfunktion in dunningCron.ts (HTML-Template mit QR-Code, Mahngebühren-Aufstellung, professionellem Layout)
- [x] DPDF-2: Backend: dunningCron.ts – PDF bei dunning1 und dunning2 generieren und als Anhang per E-Mail senden
- [x] DPDF-3: Backend: dunningCron.ts – PDF-URL in payment_reminders speichern (pdfUrl-Feld)
- [x] DPDF-4: Backend: invoicingRouter.ts – getDunningPdf-Endpoint (PDF für bestehende Mahnung abrufen/generieren)
- [x] DPDF-5: Frontend: WaiterInvoices.tsx – PDF-Button für Mahnschreiben (bei dunning1/dunning2 Status)
- [x] DPDF-6: Frontend: AdminInvoicing.tsx – PDF-Button für Mahnschreiben in Rechnungsdetails

## Debitor-Kontoauszug als PDF

- [x] STMT-1: Backend: debtorRouter – getStatement-Endpoint (alle offenen Posten eines Debitors als strukturiertes Objekt)
- [x] STMT-2: Backend: debtorRouter – generateStatementPdf() Hilfsfunktion (HTML-Template mit Briefkopf, Positionstabelle, Schweizer QR-Einzahlungsschein für Gesamtbetrag)
- [x] STMT-3: Frontend: AdminDebtors.tsx – «Kontoauszug PDF»-Button im DebtorHistoryDialog (neben «Schliessen»)
- [x] STMT-4: Frontend: AdminDebtors.tsx – PDF in neuem Tab öffnen via pdfUrl aus getStatement

- [x] IBAN-Pflichtfeld beim Erstellen/Bearbeiten von Debitoren (Frontend-Validierung, roter Rand, Hinweistext, Button deaktiviert wenn leer)

## Debitor-Features (Runde 3)

- [x] IBAN-1: IBAN-Format-Validierung (CH/DE/AT/FR/IT/LI, Frontend + Backend Zod-Regex)
- [x] IBAN-2: Visuelles Feedback im Formular (grüner Haken wenn gültig, roter Rand wenn ungültig)
- [x] DCO-NEW-1: Debitor-Direkterfassung im Checkout – «Als neuen Debitor speichern»-Checkbox im Gastdaten-Dialog
- [x] DCO-NEW-2: Bei aktivierter Checkbox: Debitor wird beim Rechnungsabschluss automatisch erstellt
- [x] PAY-1: DB-Schema: invoice_payments Tabelle (invoiceId, amount, method, paidAt, notes)
- [x] PAY-2: DB-Migration für invoice_payments
- [x] PAY-3: invoicingRouter: recordPayment Endpoint (Teilzahlung/Vollzahlung buchen, Status auf paid setzen wenn vollständig)
- [x] PAY-4: invoicingRouter: getPayments Endpoint (Zahlungen einer Rechnung abrufen)
- [x] PAY-5: AdminInvoicing.tsx: «Zahlung erfassen»-Button in Rechnungsdetails
- [x] PAY-6: AdminDebtors.tsx: Zahlungen in Rechnungshistorie anzeigen

## Debitor-Features (Runde 4)

- [x] PAY-6: AdminDebtors.tsx: Zahlungen in Rechnungshistorie anzeigen (getPayments Query, Zahlungsliste pro Rechnung im DebtorHistoryDialog)
- [x] PART-1: invoicingRouter: recordPayment – Status auf "partial" setzen bei Teilzahlung (nicht nur "paid" bei Vollzahlung)
- [x] PART-2: AdminInvoicing.tsx: Restbetrag anzeigen bei Status "partial" (offener Betrag = total - bezahlt)
- [x] PART-3: WaiterInvoices.tsx: Restbetrag anzeigen bei Status "partial"
- [x] WPERM-1: DB-Schema: waiter_permissions Tabelle (restaurantId, canRecordPayment, canViewInvoicePdf, canViewDunningPdf, canViewStatement)
- [x] WPERM-2: DB-Migration für waiter_permissions
- [x] WPERM-3: Backend: waiterPermissionsRouter – get, save Endpoints
- [x] WPERM-4: Frontend: AdminSettings.tsx – Kellner-Berechtigungen Abschnitt (Checkboxen pro Funktion)
- [x] WPERM-5: Frontend: WaiterInvoices.tsx – «Zahlung erfassen»-Button nur wenn canRecordPayment=true
- [x] WPERM-6: Frontend: WaiterInvoices.tsx – PDF-Buttons nur wenn entsprechende Berechtigung gesetzt

## Debitor-Features (Runde 5)

- [x] PAYMAIL-1: invoicingRouter: recordPayment – nach Vollzahlung E-Mail-Bestätigung an Debitor senden (via sendEmail Hilfsfunktion)
- [x] PAYMAIL-2: E-Mail-Template: Zahlungsbestätigung mit Rechnungsnummer, Betrag, Datum, Zahlungsart
- [x] PARTDUN-1: dunningCron.ts – partial-Rechnungen nach Fälligkeit in Mahnungslauf aufnehmen
- [x] PARTDUN-2: Mahnschreiben für partial-Rechnungen: offener Restbetrag statt Gesamtbetrag ausweisen
- [x] PAYSTAT-1: invoicingRouter – getPaymentStats Endpoint (Zahlungseingänge nach Methode + Zeitraum)
- [x] PAYSTAT-2: AdminStatistics.tsx – neuer Tab/Abschnitt «Zahlungseingänge» mit Balkendiagramm nach Methode
- [x] PAYSTAT-3: AdminStatistics.tsx – Zeitraum-Filter (heute/Woche/Monat/Jahr) für Zahlungsarten-Auswertung

## Digitale Unterschrift im Checkout

- [x] SIG-1: signature_pad npm-Paket installieren
- [x] SIG-2: DB: invoices-Tabelle um signatureUrl Feld erweitern, Migration ausführen
- [x] SIG-3: Frontend: SignaturePad.tsx Komponente (Canvas, Löschen, Bestätigen)
- [x] SIG-4: Frontend: Waiter_checkout.tsx – Unterschrifts-Schritt nach Debitor-Auswahl im Dialog
- [x] SIG-5: Frontend: Unterschrift als PNG hochladen (storagePut via tRPC), URL zurückgeben
- [x] SIG-6: Backend: invoicingRouter – signatureUrl beim Erstellen der Rechnung speichern
- [x] SIG-7: Backend: PDF-Generierung – Unterschrift als Bild im PDF einbetten (mit Datum/Uhrzeit)

## Digitale Unterschrift – Erweiterungen

- [x] SIG-EXT-1: AdminInvoicing.tsx – Unterschrift-Vorschaubild in Rechnungsdetails anzeigen (kleines Bild + «Unterschrift vorhanden»-Badge)
- [x] SIG-EXT-2: AdminSettings.tsx – «Unterschrift obligatorisch» Toggle in Kellner-Berechtigungen
- [x] SIG-EXT-3: DB: waiterPermissions JSON um requireSignature Feld erweitern
- [x] SIG-EXT-4: Waiter_checkout.tsx – Unterschrift-Pflichtfeld-Validierung (Abschliessen blockiert wenn leer und requireSignature=true)
- [x] SIG-EXT-5: dunningCron.ts – generateDunningPdf: signatureUrl aus Rechnung laden und im Mahnungs-PDF einbetten

## GPS-Zeitstempel für digitale Unterschrift

- [x] GPS-1: DB: invoices-Tabelle um signatureLat, signatureLng, signatureAddress Felder erweitern, Migration ausführen
- [x] GPS-2: Frontend: SignaturePad.tsx – GPS-Koordinaten via navigator.geolocation erfassen (mit Fallback)
- [x] GPS-3: Frontend: Waiter_checkout.tsx – GPS-Daten an createInvoiceFromOrder übergeben
- [x] GPS-4: Backend: invoicingRouter.ts – signatureLat/Lng/Address in createInvoiceFromOrder speichern
- [x] GPS-5: Backend: generateSwissQrPdf – GPS-Koordinaten im Unterschrifts-Block anzeigen
- [x] GPS-6: Backend: dunningCron.ts – GPS-Koordinaten im Mahnungs-PDF anzeigen
- [x] GPS-7: Frontend: AdminInvoicing.tsx – GPS-Koordinaten in Unterschrift-Vorschau anzeigen

## Personen-Split: Rechnung mit Debitor-Auswahl

- [x] SPLIT-INV-1: OrderView.tsx – Personen-Split Schritt 3: Bei payMethod=invoice Debitor-Dialog öffnen statt direkt paySplit aufrufen
- [x] SPLIT-INV-2: paySplit-Backend prüft invoice-Zahlungen korrekt (paySplit markiert Split als bezahlt, createInvoiceFromOrder erstellt Rechnung)
- [x] SPLIT-INV-3: Debitor-Dialog State für Split-Personen (splitInvoiceContext, Formular-Reset zwischen Personen)

## Split-Rechnung Verbesserungen

- [x] SPLIT-MAIL-1: E-Mail nach Split-Rechnung versenden (Bestätigungs-E-Mail an Debitor nach createInvoiceFromOrder im Split-Kontext)
- [x] SPLIT-ITEMS-1: Backend: billSplitItems Import in invoicingRouter
- [x] SPLIT-ITEMS-2: Backend: createInvoiceFromOrder — wenn splitId übergeben, Artikelliste des Splits statt gesamter Bestellung verwenden
- [x] SPLIT-ITEMS-3: PDF: Split-Rechnung zeigt nur die dem Split zugewiesenen Artikel (Mengen aus Split-Zuweisung)
- [x] SPLIT-DEBTOR-1: Debitor-Auswahl über Sheet (von unten) mit allen Debitoren als Liste, öffnet sich über + Button
- [x] SPLIT-DEBTOR-2: Suchfeld im Debitor-Sheet zum Filtern der Liste

## Waiter-Checkout Verbesserungen (Punkt 1+2)
- [x] WC-DEBTOR-1: Waiter_checkout.tsx — Debitor-Suchfeld durch + Button ersetzen, Overlay mit allen Debitoren (analog OrderView)
- [x] WC-DEBTOR-2: Waiter_checkout.tsx — Fokus-Lock-Konflikt vermeiden (Dialog kurz schliessen vor Overlay, danach wieder öffnen)
- [x] WC-DUE-1: Waiter_checkout.tsx — Zahlungsfrist-Schnellauswahl +10/+30/+60 Tage Buttons
- [x] OV-DUE-1: OrderView.tsx — Zahlungsfrist-Schnellauswahl +10/+30/+60 Tage Buttons

## Geschenkkarten-Erweiterung
- [x] GK-BACKEND-1: voucherRouter.ts — getGiftCardPublic Endpoint (kein Login, gibt Guthaben + Transaktionshistorie zurück)
- [x] GK-BACKEND-2: voucherRouter.ts — QR-Code URL zeigt auf /gift/:code (öffentliche Seite)
- [x] GK-BACKEND-3: voucherRouter.ts — createGiftCardTopupSession (Stripe Checkout für Online-Aufladung)
- [x] GK-BACKEND-4: stripeWebhook.ts — gift_card_topup Webhook: Guthaben nach Zahlung erhöhen
- [x] GK-FRONTEND-1: VoucherPrintView.tsx — 10 vorgefertigte Designs (Design-Auswahl, Vorschau, PDF/PNG-Download)
- [x] GK-FRONTEND-2: AdminVouchers.tsx — QR-Code Download (PNG) + Design-Auswahl Button
- [x] GK-FRONTEND-3: Neue Seite /gift/:code — öffentliche Guthaben-Seite (Guthaben, Erstelldatum, Transaktionshistorie, Auflade-Button)
- [x] GK-FRONTEND-4: App.tsx — öffentliche Route /gift/:code registrieren

## Geschenkkarten-Seite Erweiterung (Restaurant-Info + Maps + Marketing)
- [x] GK-EXT-1: Backend getGiftCardPublic – Restaurant-Daten erweitern (Adresse, Koordinaten, Logo, Öffnungszeiten, Website, Telefon)
- [x] GK-EXT-2: DB: vouchers-Tabelle – allowedRestaurants JSON-Feld für Multi-Restaurant-Support
- [x] GK-EXT-3: Frontend GiftCardBalance – Restaurant-Sektion mit Google Maps Navigation
- [x] GK-EXT-4: Frontend GiftCardBalance – Marketing-Bereich (Tisch reservieren, Speisekarte, Social Media, Angebote)
- [x] GK-EXT-5: Frontend GiftCardBalance – Multi-Restaurant-Anzeige (wenn Karte für mehrere Restaurants gilt)
- [x] GK-EXT-6: Admin AdminVouchers – Karte für mehrere eigene Restaurants freigeben

## QR-Code auf Gast-Seite + Social-Media-Links
- [x] GK-QR-1: Backend getGiftCardPublic – QR-Code-DataURL direkt zurückgeben
- [x] GK-QR-2: Frontend GiftCardBalance – QR-Code prominent anzeigen (scannbar, downloadbar)
- [x] GK-SM-1: DB Schema – Social-Media-Felder (instagram, tiktok, facebook, googleMaps, tripadvisor) zur restaurants-Tabelle hinzufügen
- [x] GK-SM-2: Backend getGiftCardPublic – Social-Media-Felder in Response aufnehmen
- [x] GK-SM-3: Frontend GiftCardBalance – Social-Media-Icons mit Links anzeigen
- [x] GK-SM-4: Admin Restaurant-Einstellungen – Social-Media-Felder pflegbar machen

## Google Maps Auto-Link + Öffnungszeiten-Formular
- [x] MAPS-1: AdminSettings – Google Maps-URL automatisch aus Adresse generieren (Button "Automatisch generieren")
- [x] OZ-1: AdminSettings – Strukturiertes Öffnungszeiten-Formular Mo–So (Öffnen/Schliessen/Geschlossen)
- [x] OZ-2: Backend restaurantAdminRouter – openingHours im updateSettings-Input akzeptieren

## Vollbild-Vorschau + Öffnungszeiten Gast-Seite + GK-Button Menükarte
- [x] PRINT-1: VoucherPrintView – Vollbild-Modus für Kartenvorschau (Tap auf Karte = Vollbild)
- [x] OZ-GUEST-1: GiftCardBalance – Öffnungszeiten anzeigen (Heute geöffnet/geschlossen + aufklappbarer Wochenplan)
- [x] MENU-GK-1: Menükarte (QR-Bestellseite) – Geschenkkarten-Button der zum /admin/vouchers weiterleitet

## Geschenkkarten-Verkauf Kasse + E-Mail + QR-Scanner
- [x] GK-SELL-1: Backend voucherRouter – sellGiftCard Prozedur (erstellt GK + Rechnung-Eintrag)
- [x] GK-SELL-2: Waiter-Panel – Geschenkkarten-Verkauf Dialog (Betrag, Empfänger, Zahlungsart)
- [x] GK-SCAN-1: Waiter-Panel – QR-Code-Scanner für Geschenkkarten-Einlösung (Kamera-API)
- [x] GK-EMAIL-1: Backend voucherRouter – E-Mail-Bestätigung nach Stripe-Aufladung (Webhook)

## Logo, Hintergrundbild, Statistik (16.06.2026)
- [x] LOGO-1: VoucherPrintPage – Restaurant-Logo auf allen 10 Kartendesigns anzeigen
- [x] BG-1: AdminSettings – Hintergrundbild-Upload für Geschenkkarten (S3-Upload)
- [x] BG-2: VoucherPrintPage – Hintergrundbild als Option in den Designs nutzbar
- [x] STATS-1: Backend – getGiftCardStats Prozedur (Anzahl, Gesamtwert, Einlösungsrate)
- [x] STATS-2: AdminDashboard – Geschenkkarten-Statistik-Widget

## Druckbeleg + Ablauf-Erinnerung + GK-Kauf Gast-Seite (16.06.2026)
- [x] PRINT-AFTER-SELL-1: Waiter_checkout.tsx – nach GK-Verkauf automatisch zur Druckvorschau navigieren
- [x] EXPIRY-REMINDER-1: Heartbeat-Job – täglich prüfen welche GK in 14 Tagen ablaufen, E-Mail senden
- [x] GUEST-BUY-1: GuestOrder.tsx – GK-Kauf-Dialog (Betrag, Empfänger, Stripe-Zahlung)
- [x] GUEST-BUY-2: Backend voucherRouter – createGiftCardPurchaseSession (Stripe Checkout für Gast-Kauf)
- [x] GUEST-BUY-3: Stripe-Webhook – nach Zahlung neue Geschenkkarte erstellen und E-Mail senden

## GK-System Verbesserungen (16.06.2026 – Runde 2)
- [x] PRINT-CHECK-1: Waiter_checkout.tsx – GK-Drucknavigation nach Verkauf geprüft; Route für Kellner (isKellner) freigeschaltet
- [x] EMAIL-QR-1: stripeWebhook.ts – E-Mail-Templates gift_card_topup + gift_card_purchase mit Restaurant-Logo und QR-Code-Bild (Data-URL) verfeinert
- [x] GIFT-LANDING-1: Backend voucherRouter – getRestaurantForGiftCard Endpoint hinzugefügt
- [x] GIFT-LANDING-2: Frontend GiftCardBuyPage.tsx – eigenständige Landingpage /gift/buy/:restaurantId erstellt
- [x] GIFT-LANDING-3: App.tsx – Route /gift/buy/:restaurantId registriert

## GK-System Verbesserungen (16.06.2026 – Runde 3)
- [x] QR-LANDING-1: Backend voucherRouter – getLandingPageQrCode Endpoint (generiert QR-Code für /gift/buy/:restaurantId)
- [x] QR-LANDING-2: AdminVouchers – QR-Code-Download-Button für Landingpage (Modal mit QR-Bild + Download-PNG)
- [x] RECIPIENT-EMAIL-1: stripeWebhook gift_card_purchase – separate E-Mail an Empfänger senden (ohne Preis, nur Code + Nachricht)
- [x] LANDING-LINK-1: AdminVouchers – kopierbaren Landingpage-Link anzeigen (mit Copy-Button + Toast)

## Treuepunkte-System (16.06.2026)

### Phase 1 – Datenbankschema
- [x] LOYALTY-DB-1: loyaltyPrograms Tabelle (Programm-Einstellungen pro Restaurant)
- [x] LOYALTY-DB-2: loyaltyCustomers Tabelle (Kundenkonto mit DSGVO-Feldern)
- [x] LOYALTY-DB-3: loyaltyTransactions Tabelle (Punkte-Verlauf)
- [x] LOYALTY-DB-4: loyaltyRewards Tabelle (Prämien/Einlösungsregeln)
- [x] LOYALTY-DB-5: Migration ausführen

### Phase 2 – Backend
- [x] LOYALTY-BE-1: loyaltyRouter.ts – Programm-CRUD (Admin)
- [x] LOYALTY-BE-2: loyaltyRouter.ts – Kunden-Registrierung (Opt-in mit Einwilligung)
- [x] LOYALTY-BE-3: loyaltyRouter.ts – Punkte sammeln (beim Bezahlen)
- [x] LOYALTY-BE-4: loyaltyRouter.ts – Punkte einlösen (beim Bezahlen)
- [x] LOYALTY-BE-5: loyaltyRouter.ts – Kunden-Portal (Punktestand, Verlauf)
- [x] LOYALTY-BE-6: loyaltyRouter.ts – DSGVO-Löschung (Konto + Daten)

### Phase 3 – Admin-Panel
- [x] LOYALTY-ADMIN-1: AdminLoyalty.tsx – Programm-Einstellungen (Punkte/CHF, Stufen, Prämien)
- [x] LOYALTY-ADMIN-2: AdminLoyalty.tsx – Kunden-Übersicht (Tabelle, Suche, Punkte manuell anpassen)
- [x] LOYALTY-ADMIN-3: DashboardLayout – Navigation Eintrag "Treueprogramm"

### Phase 4 – Waiter-Integration
- [x] LOYALTY-WAITER-1: Waiter_checkout.tsx – Kunden-Lookup beim Bezahlen (Telefon/E-Mail)
- [x] LOYALTY-WAITER-2: Waiter_checkout.tsx – Punkte sammeln nach Zahlung
- [x] LOYALTY-WAITER-3: Waiter_checkout.tsx – Punkte einlösen (Rabatt auf Rechnung)

### Phase 5 – Gast-Portal
- [x] LOYALTY-GUEST-1: LoyaltyCard.tsx – Öffentliche Treuekarte-Seite (/loyalty/:token)
- [x] LOYALTY-GUEST-2: LoyaltyCard.tsx – Punktestand, Verlauf, Stufe, Prämien
- [x] LOYALTY-GUEST-3: LoyaltyCard.tsx – Registrierungsformular (Opt-in)

### Phase 6 – Wallet-Integration
- [x] LOYALTY-WALLET-1: Backend – generateAppleWalletPass Endpoint (PKPass)
- [x] LOYALTY-WALLET-2: Backend – generateGoogleWalletPass Endpoint (JWT)
- [x] LOYALTY-WALLET-3: Frontend – "Zu Apple Wallet" und "Zu Google Wallet" Buttons

### Phase 7 – Heartbeat-Jobs
- [x] LOYALTY-CRON-1: Geburtstags-Bonus (monatlich, Punkte gutschreiben + E-Mail)
- [x] LOYALTY-CRON-2: Inaktivitäts-Erinnerung (nach 60 Tagen, E-Mail)
- [x] LOYALTY-CRON-3: Punkte-Ablauf (nach 24 Monaten Inaktivität)

## Treuepunkte-Erweiterungen (16.06.2026)

- [x] LOYALTY-STATS-1: Backend loyaltyRouter – getStats Endpoint (aktive Mitglieder, ausgegebene Punkte, Einlösungsrate, Umsatz-Einfluss, Top-Kunden)
- [x] LOYALTY-STATS-2: AdminLoyalty.tsx – Statistik-Tab mit Chart-Widgets (Mitglieder-Trend, Punkte-Verlauf, Einlösungsrate, Umsatz-Einfluss)
- [x] LOYALTY-QR-1: loyaltyRouter – getRegistrationQr Endpoint (QR-Code für /loyalty/register/:restaurantId)
- [x] LOYALTY-QR-2: Waiter_checkout.tsx – QR-Code-Button nach Zahlung (Kunden zur Registrierung einladen)
- [x] LOYALTY-QR-3: AdminLoyalty.tsx – QR-Code-Download für Tischaufsteller
- [x] LOYALTY-REWARDS-1: GuestLoyalty.tsx – Prämien-Katalog Tab (alle Prämien mit Punktekosten, Einlösen-Button)
- [x] LOYALTY-REWARDS-2: loyaltyRouter – redeemReward Endpoint (Prämie einlösen, Bestätigungs-E-Mail)

## Browser Push-Benachrichtigungen + QR-Code auf Treuekarte (16.06.2026)
- [x] PUSH-1: VAPID-Keys generieren und als Secrets speichern
- [x] PUSH-2: DB-Tabelle loyalty_push_subscriptions (token, endpoint, keys, restaurantId, customerId)
- [x] PUSH-3: Backend: subscribe/unsubscribe/sendPush Endpoints in loyaltyRouter
- [x] PUSH-4: Service Worker (public/sw.js) mit push + notificationclick Event-Handler
- [x] PUSH-5: Frontend GuestLoyalty – Opt-in-Button (Benachrichtigungen aktivieren/deaktivieren)
- [x] PUSH-6: Admin AdminLoyalty – Push-Nachricht senden (Titel + Text an alle Kunden)
- [x] QR-CARD-1: GuestLoyalty – persönlicher QR-Code (token-basiert) auf der Karte anzeigen
- [x] QR-CARD-2: QR-Code-Bibliothek (qrcode) installieren und einbinden

## QR-Scanner + Auto-Push bei Punkte-Gutschrift (16.06.2026)
- [x] QR-SCAN-1: Waiter_checkout.tsx – QR-Code-Scanner-Dialog mit @zxing/browser (Kamera-Scan)
- [x] QR-SCAN-2: Waiter_checkout.tsx – Scan-Ergebnis als Token in Kunden-Lookup verwenden
- [x] AUTO-PUSH-1: loyaltyRouter – collectPoints: Push-Benachrichtigung nach Punkte-Gutschrift
- [x] AUTO-PUSH-2: loyaltyRouter – adjustPoints (Admin): optionale Push bei manueller Anpassung

## Push-Verbesserungen + Geburtstag-Tag + Scan-Feedback (16.06.2026)
- [x] PUSH-REDEEM-1: loyaltyRouter – redeemReward: Push-Benachrichtigung nach Prämien-Einlösung
- [x] BDAY-1: DB-Schema – birthDay (INT 1-31) Spalte zu loyalty_customers hinzufügen
- [x] BDAY-2: loyaltyRouter – register: birthDay-Feld akzeptieren
- [x] BDAY-3: GuestLoyalty.tsx – Registrierungsformular: Tag+Monat-Picker statt nur Monat
- [x] BDAY-4: Heartbeat-Job – Geburtstags-Push mit genauem Datum (Tag+Monat)
- [x] SCAN-FB-1: VoucherScanner / Waiter_checkout – Vibration + grüner Toast nach QR-Scan

## Admin-Kunden-Detail birthDay + Kellner-Prämien-Einlösung (16.06.2026)
- [x] ADMIN-BDAY-1: AdminLoyalty Kunden-Detail – birthDay anzeigen und editierbar machen
- [x] ADMIN-BDAY-2: loyaltyRouter – updateCustomer-Endpoint birthDay-Feld akzeptieren
- [x] WAITER-REDEEM-1: Waiter_checkout – Prämien-Dropdown nach Kunden-Lookup anzeigen
- [x] WAITER-REDEEM-2: loyaltyRouter – redeemReward via Kellner-Token aufrufen

## Kellner-PIN-System (Zentralkasse)
- [x] PIN-1: DB: pinHash-Feld zu employees-Tabelle hinzufügen (staff_clock_pins existiert)
- [x] PIN-2: Backend: waiterPin.login (PIN prüfen, Kellner-Daten zurückgeben)
- [x] PIN-3: Backend: waiterPin.setPin (Admin setzt PIN für Kellner)
- [x] PIN-4: Backend: waiterPin.listWaiters (alle Kellner mit PIN-Status)
- [x] PIN-5: Admin-UI: PIN-Verwaltung in Mitarbeiter-Verwaltung (setzen/zurücksetzen)
- [x] PIN-6: Frontend: WaiterPinContext (aktiver Kellner, Auto-Logout)
- [x] PIN-7: Frontend: PinLoginOverlay-Komponente (Ziffernblock + Kellner-Liste)
- [x] PIN-8: Waiter-Panel: PIN-Overlay vor allen Aktionen anzeigen
- [x] PIN-9: Orders: activeWaiterId in Bonierung und Abrechnung mitführen (orders.staffId vorhanden)
- [x] PIN-10: Kellner-Bericht: Umsatz/Bestellungen pro Kellner im Admin

## UserSwitcher / Kellner-Wechsel-System
- [x] SWITCH-1: WaiterPinContext – activeWaiter-Konzept auf "aktiver Nutzer" (Admin oder Kellner) erweitern
- [x] SWITCH-2: UserSwitcherOverlay – zeigt Admin-Konto + Kellner-Liste, PIN-Eingabe pro Nutzer
- [x] SWITCH-3: Admin-Panel DashboardLayout – "Als Kellner einloggen"-Button im Header/Sidebar
- [x] SWITCH-4: Kellner-Panel – Ausloggen öffnet UserSwitcherOverlay statt OAuth-Logout
- [x] SWITCH-5: Routing – nach Kellner-PIN-Login → /kellner, nach Admin-PIN-Login → /admin

## NFC-Badge-Login (17.06.2026)
- [x] NFC-1: DB: nfcToken-Spalte (VARCHAR 64) zu staff_clock_pins hinzugefügt (ALTER TABLE)
- [x] NFC-2: drizzle/schema.ts – nfcToken-Feld in staffClockPins ergänzt
- [x] NFC-3: Backend: generateNfcToken-Endpoint (Admin generiert 64-Hex-Token, speichert in DB)
- [x] NFC-4: Backend: nfcBadgeScan-Endpoint (Token-Lookup, gibt Kellner-Daten zurück)
- [x] NFC-5: Admin-UI: NFC-Button in AdminShifts.tsx (neben Badge-QR-Button, nur wenn PIN gesetzt)
- [x] NFC-6: Admin-UI: NFC-Dialog – Android: NDEFWriter zum direkten Tag-Beschreiben; iOS: URL anzeigen + Anleitung NFC Tools App
- [x] NFC-7: UserSwitcherOverlay – NFC-Modus-Button + Android NDEFReader (Scan → nfcBadgeScan → Kellner einloggen)
- [x] NFC-8: UserSwitcherOverlay – iOS-Hinweis (NFC-Tag öffnet URL automatisch in Safari)
- [x] NFC-9: NfcLogin.tsx – Neue öffentliche Seite /nfc-login?token=... für iOS Deep-Link
- [x] NFC-10: App.tsx – Route /nfc-login registriert (public, kein Auth erforderlich)
- [x] NFC-11: 546/546 Tests grün, TypeScript: 0 Fehler

## Kellner-Session-Isolation (17.06.2026)
- [x] ISO-1: UserSwitcherOverlay – wenn activeWaiter gesetzt: nur Abmelden-Screen, keine Kellner-Liste, kein Admin-Zugang
- [x] ISO-2: WaiterPinOverlay – wenn activeWaiter gesetzt: nur Abmelden-Button, keine Kellner-Auswahl, kein Badge-Scan
- [x] ISO-3: KellnerDashboard – "Wechseln"-Button durch "Abmelden"-Button ersetzt; UserSwitcherOverlay entfernt
- [x] ISO-4: DashboardLayout – "Als Kellner einloggen" im Admin-Dropdown ausgeblendet wenn activeWaiter gesetzt
- [x] ISO-5: 546/546 Tests grün, TypeScript: 0 Fehler

## Kellner-Isolation Fix (17.06.2026)
- [x] FIX-1: Kellner-Route aus DashboardLayout herauslösen – eigenes KellnerLayout ohne Sidebar/Hamburger
- [x] FIX-2: WaiterPinOverlay als echter Fullscreen-Block (kein DashboardLayout dahinter sichtbar)
- [x] FIX-3: App.tsx – /kellner mit KellnerLayout wrappen statt DashboardLayout
- [x] FIX-4: Alle Kellner-Subrouten (/kellner/*) ebenfalls mit KellnerLayout wrappen

## KellnerLayout-Fix: Volles Dashboard für beide Login-Wege (17.06.2026)
- [x] KellnerLayout: OAuth-Kellner und PIN-Kellner bekommen beide das vollständige DashboardLayout
- [x] useNav: effectiveRole berücksichtigt activeWaiter (PIN-Kellner bekommt Kellner-Navigation)
- [x] DashboardLayout: isKellnerRole = user.role==="kellner" || !!activeWaiter
- [x] Rollback auf 9f33e09b (vor fehlerhaften OAuth-Kellner-Änderungen)

## Footer-Bug: Kellner-Name bei PIN-Login (17.06.2026)
- [x] BUG: DashboardLayout-Footer zeigt Admin-Name statt Kellner-Name wenn activeWaiter gesetzt
- [x] BUG: Initials/Avatar im Footer sollen Kellner-Initialen zeigen bei PIN-Login
- [x] BUG: Rolle im Footer soll "Kellner" zeigen statt "Admin" bei PIN-Login

## Kellner-Umsatz-Datendiskrepanz (17.06.2026)
- [x] BUG: PIN-Kellner und OAuth-Kellner sehen unterschiedliche Umsätze
- [x] Backend: Prozeduren müssen activeWaiterId aus Header/Input akzeptieren
- [x] Frontend: activeWaiter.id an alle Kellner-Umsatz-Abfragen übergeben
- [x] tRPC-Context: effectiveUserId = activeWaiterId ?? ctx.user.id

## Admin-PIN im Zentralkasse-Overlay (17.06.2026)
- [x] WaiterPinOverlay: Admin-Eintrag in der Kellner-Liste hinzufügen
- [x] Admin-PIN-Pad: Code 110293 führt zum Admin-Dashboard
- [x] Back-Button-Schutz: Nach PIN-Logout history.replaceState sperren

## Admin-PIN konfigurierbar + Brute-Force-Schutz (17.06.2026)
- [x] Backend: admin_pin Feld in restaurant_settings (DB-Migration)
- [x] Backend: getAdminPin + setAdminPin Endpoints (protectedProcedure)
- [x] Frontend: WaiterPinOverlay lädt Admin-PIN aus DB statt Hardcode
- [x] Frontend: Brute-Force-Schutz im Admin-PIN-Pad (3 Fehlversuche → 60s Sperre, localStorage)
- [x] Frontend: AdminSettings – PIN-Änderungs-Dialog (aktueller PIN + neuer PIN + Bestätigung)

## Admin-PIN Fehlversuche Audit-Log (17.06.2026)
- [x] Backend: Audit-Log-Tabelle prüfen / erstellen (admin_pin_attempts)
- [x] Backend: logAdminPinAttempt Endpoint (IP, Zeitstempel, Ergebnis)
- [x] Frontend: Fehlversuch-Meldung an Backend senden
- [x] Frontend: Audit-Log-Ansicht im Admin-Panel (letzte Versuche)

## Kassierungsprinzip (17.06.2026)
- [x] DB: checked_out_by_staff_id-Spalte zur orders-Tabelle hinzufügen
- [x] Backend: closeOrder mit checkedOutByStaffId befüllen (effectiveUserId beim Kassieren)
- [x] Backend: splitPay und partialPay ebenfalls mit checkedOutByStaffId befüllen
- [x] Backend: getWaiterStats auf checkedOutByStaffId umstellen (Umsatz beim Kassierer)

## Bestellperformance (17.06.2026)
- [x] Optimistische Updates für addItem/removeItem/updateQuantity einbauen (sofortige UI-Reaktion)
- [x] Debounce/Batching für schnelle Mehrfachklicks auf dasselbe Produkt (Menge zusammenführen)

## KI-Sprachbestellung (17.06.2026)
- [x] Backend: voiceOrder tRPC-Endpoint (upload audio → Whisper → LLM-Extraktion → Fuzzy-Matching)
- [x] Backend: LLM extrahiert strukturiert Tisch + Produkte + Mengen aus Transkription
- [x] Backend: Fuzzy-Matching der erkannten Produktnamen gegen echte Speisekarte des Restaurants
- [x] Frontend: Mikrofon-Button im Bestellbildschirm (OrderView) – gedrückt halten = aufnehmen
- [x] Frontend: Aufnahme-Indikator (roter Puls-Ring) + Verarbeitungs-Spinner
- [x] Frontend: Bestätigungs-Dialog mit erkannten Items + Korrekturmöglichkeit vor dem Bonieren

## Web Speech API Migration (17.06.2026)
- [x] Backend: voiceOrderRouter akzeptiert nur noch transcription-Text (kein audioUrl mehr)
- [x] Frontend: Waiter_tables.tsx auf Web Speech API umstellen (SpeechRecognition)
- [x] Frontend: Admin-Tischplan Mikrofon-Button einbauen

## Erweiterte Sprachbestellung (17.06.2026)
- [x] Backend: Multi-Tisch-Sprachbestellung (LLM gibt Array von Tisch-Gruppen zurück)
- [x] Backend: Stornierung per Sprache ("Storniere 1 Bier von Tisch 4")
- [x] Backend: Gang-Zuweisung per Sprache ("1 Salat als Vorspeise, 2 Rösti als Hauptgang")
- [x] Frontend: Bestätigungs-Dialog zeigt mehrere Tisch-Gruppen getrennt
- [x] Frontend: Stornierung-Bestätigung im Dialog (rot markiert, mit Warnung)
- [x] Frontend: Gang-Anzeige pro Artikel im Dialog (editierbar)

## Küchenmonitor perfektioniert (18.06.2026)
- [x] Backend: getKitchenOrders gibt Tischlabel (floorPlanObject.label / restaurantTable.name) zurück
- [x] Backend: markAllReady-Endpoint (alle Positionen einer Bestellung auf bereit setzen)
- [x] Backend: setOrderPriority-Endpoint (Rush / Hold / Normal für gesamte Bestellung)
- [x] Frontend: Dunkles KDS-Layout (professionell, hochkontrastig)
- [x] Frontend: Tischname prominent auf jeder Bestellkarte
- [x] Frontend: Live-Elapsed-Timer mit Farbwechsel (grün → gelb → rot nach 10/20 Min.)
- [x] Frontend: Prioritäts-Ampel (Rush pulsierend rot, Hold blau)
- [x] Frontend: Gang-Sektionen innerhalb einer Bestellung (Vorspeise/Hauptgang/Dessert/Getränk)
- [x] Frontend: "Alle bereit"-Button pro Bestellung (1 Klick)
- [x] Frontend: Rush/Hold-Toggle-Buttons pro Bestellung
- [x] Frontend: Filter-Tabs (Alle / Neu / In Zubereitung / Bereit)
- [x] Frontend: Statistik-Kopfzeile (Aktiv, Bereit, Rush, Ø Wartezeit)
- [x] Frontend: Kompakt-Ansicht (Umschaltbar, alle Bestellungen als Zeilen)
- [x] Frontend: Rush-Bestellungen werden zuerst angezeigt (Sortierung)

## Neue Features (18.06.2026 – Batch 2)

### Punkt 1: Gang-Freigabe durch Küchenchef
- [x] KDS: Toggle "Gang-Freigabe aktiv" pro Bestellung
- [x] KDS: Hauptgang-Artikel erst sichtbar wenn alle Vorspeisen "bereit" sind
- [x] KDS: Visueller Hinweis "Warte auf Gang 1" wenn Freigabe noch nicht erfolgt

### Punkt 2: Bar-Dashboard auf professionelles KDS-Layout upgraden
- [x] BarDashboard.tsx: Dunkles KDS-Layout (identisch mit Küche)
- [x] BarDashboard.tsx: Tischlabel, Live-Timer, Prioritäts-Ampel
- [x] BarDashboard.tsx: "Alle bereit"-Button, Filter-Tabs, Statistik-Kopfzeile
- [x] BarDashboard.tsx: Kompakt-Ansicht

### Punkt 3: Tisch-Notizen im Kellner-Panel
- [x] OrderView.tsx / Waiter: Freitext-Notizen-Feld für Tisch-Bestellnotizen
- [x] Backend: Notizen in orders.notes speichern
- [x] KDS: Tisch-Notizen prominent (gelb hervorgehoben) auf Bestellkarte anzeigen

## Neue Features (18.06.2026 – Batch 3)

### Punkt 1: Notizfeld im manuellen Bestellformular
- [x] OrderView.tsx: Tisch-Notizfeld (Freitext) anzeigen und speichern
- [x] OrderView.tsx: Bestehende Notiz laden und editierbar machen
- [x] OrderView.tsx: Notiz-Badge in der Bestellübersicht anzeigen

### Punkt 2: Push-Benachrichtigung bei Rush-Bestellung
- [x] Backend: notifyOwner oder SSE-Event bei Rush-Markierung auslösen
- [x] KDS: Rush-Markierung sendet SSE-Broadcast an alle KDS-Clients
- [x] KDS: Toast-Benachrichtigung bei eingehender Rush-Bestellung

### Punkt 3: Gang-Konfiguration im Admin-Panel
- [x] DB: Tabelle restaurant_courses (id, restaurantId, name, sortOrder)
- [x] Backend: CRUD-Endpoints für Gang-Konfiguration
- [x] Admin: Seite zur Gang-Verwaltung (hinzufügen, umbenennen, sortieren)
- [x] KDS + Waiter: Dynamische Gang-Namen aus DB statt Hardcode

## Neue Features (18.06.2026 – Batch 3)

### Punkt 1: Dynamische Gang-Namen aus DB
- [x] KuecheDashboard: Gang-Namen aus courseRouter.list laden statt Hardcode
- [x] Waiter_tables.tsx: COURSE_OPTIONS aus courseRouter.list laden
- [x] Fallback auf Standardnamen wenn keine Konfiguration vorhanden

### Punkt 2: Gang-Freigabe mit konfigurierten Gängen
- [x] KuecheDashboard: Gang-Freigabe-Logik nutzt konfigurierte sortOrder statt feste Nummern
- [x] Gesperrte Gänge zeigen konfigurierten Namen im Hinweis

### Punkt 3: SSE-Benachrichtigung an Kellner bei bereit
- [x] Backend: updateItemStatus sendet SSE-Event order_ready an floor-Channel wenn alle Items bereit
- [x] Backend: markAllReady sendet SSE-Event order_ready an floor-Channel
- [x] Waiter_tables.tsx: SSE-Handler erkennt order_ready und zeigt Toast mit Tischlabel

### Punkt 4: Abruf-Funktion mit Zeitstempel
- [x] DB: pickedUpAt (timestamp) + pickedUpBy (varchar) Felder in order_items
- [x] DB: Migration via webdev_execute_sql
- [x] Backend: markItemPickedUp Endpoint (setzt pickedUpAt + pickedUpBy)
- [x] Backend: markCoursePickedUp Endpoint (alle Items eines Gangs als abgerufen markieren)
- [x] Backend: getKitchenOrders gibt pickedUpAt + pickedUpBy zurück
- [x] KDS: „Abrufen“-Button pro Item und pro Gang (Kellner bestätigt Abholung)
- [x] KDS: Abgerufene Items zeigen Zeitstempel + Kellner-Name (grün/ausgegraut)
- [x] KDS: Abruf-Zeitstempel im Bestellverlauf sichtbar

## Neue Features (18.06.2026 – Batch 4)

### Punkt 1: „Ganzen Gang abrufen“-Button im KDS
- [x] KDS: Pro Gang-Sektion einen „Ganzen Gang abrufen“-Button (nur wenn alle Items bereit)
- [x] KDS: markCoursePickedUp-Mutation für den Button verwenden
- [x] KDS: Visuelles Feedback nach Gang-Abruf (alle Items grün/ausgegraut)

### Punkt 2: Abruf-Verlauf im Admin
- [x] Backend: getPickupHistory-Endpoint (gefiltert nach Datum, Kellner, Tisch)
- [x] Admin-Seite: AbrufVerlauf.tsx mit Tabelle (Zeitstempel, Kellner, Tisch, Artikel, Gang)
- [x] Admin-Navigation: Link unter Berichte/Auswertungen

### Punkt 3: Kellner-Bereit-Übersicht
- [x] Backend: getReadyOrders-Endpoint (alle Bestellungen mit bereit-Items, noch nicht abgerufen)
- [x] Neue Seite: WaiterReady.tsx mit Live-Liste (Tisch, Artikel, Wartezeit, Abgeholt-Button)
- [x] Navigation: Badge mit Anzahl wartender Tische in Kellner-Sidebar
- [x] SSE: Live-Update wenn neue Bestellung bereit wird

## OrderView Redesign (Kompakt-Kachel-Layout)
- [x] Produktgrid: von grid-cols-3 mit Bildern auf auto-fill minmax(90px,1fr) ohne Bilder umstellen
- [x] Kacheln: weisser Hintergrund, farbiger Balken oben (Kategorie-Farbe), Name + Preis kompakt
- [x] Oberkategorie-Sidebar: weisser Hintergrund statt bg-muted/10
- [x] Unterkategorie-Chips: fixe Höhe, kein Scrollen der gesamten Seite
- [x] Warenkorb-Panel: Breite auf 280px reduzieren (war 320/384px)
- [x] Alle bestehenden Funktionen unverändert lassen (Mengen-Badge, Bleistift-Button, onPointerDown, Allergen-Filter, Sprachbestellung)

## Eingefrierte Bereiche (NICHT VERÄNDERN)
- [x] Produktkachel-Grid in OrderView.tsx: Layout (auto-fill minmax 90px), Long-Press (600ms, setPointerCapture, pan-y), visuelles Feedback (200ms Tint), Haptic, Tooltip – FINAL, keine weiteren Änderungen

## Bondrucker-System (ESC/POS)

- [x] BP-1: DB-Schema: printers, printer_routes, print_jobs Tabellen + Migration
- [x] BP-2: printerRouter.ts: ESC/POS-Hilfsfunktionen, Drucker-CRUD, Routing-Konfiguration, Küchenbon, Gastbon, Testdruck, Job-Protokoll
- [x] BP-3: printerRouter in appRouter registriert
- [x] BP-4: AdminPrinters.tsx: Drucker verwalten (Name, IP, Port, Typ), Routing (Kategorie → Drucker), Testdruck, Job-Protokoll
- [x] BP-5: OrderView.tsx: printKitchenOrder nach sendToKitchen, printReceiptMutation nach closeOrder
- [x] BP-6: TypeScript: 0 Fehler

## Geräte & Hardware Monitoring (Priorität 1+2+3)
- [x] device_sessions Tabelle in DB (Heartbeat, Gerätename, IP, Typ, Kellner-ID, letzter Kontakt)
- [x] Heartbeat-Endpoint (tRPC: ping, alle 30s vom Browser)
- [x] Kellner-Aktivitäts-Abfrage (wer ist gerade online, letzte Aktion)
- [x] AdminDevices: echte Druckerdaten aus DB
- [x] AdminDevices: Tablet/Kellner-Sessions mit Online/Offline-Status
- [x] AdminDevices: Kellner-Aktivitätsübersicht (letzte Bestellung, letzter Tisch)
- [x] AdminDevices: Software-Version / Browser-Info anzeigen
- [x] AdminDevices: Benachrichtigung bei Geräteausfall
- [x] Heartbeat-Hook im Frontend (useDeviceHeartbeat)

## Kartenterminal-Integration: PayTec + Nexi + Tagesabschluss

- [x] PT-1: DB-Schema: paytec_configs + paytec_transactions Tabellen (Schema + Migration via SQL)
- [x] PT-2: DB-Schema: nexi_configs + nexi_transactions Tabellen (Schema + Migration via SQL)
- [x] PT-3: paytecNexiRouter.ts – paytecRouter (getConfig, saveConfig, testConnection, createCheckout, getTransactionStatus, listTransactions) + nexiRouter (getConfig, saveConfig, confirmPayment, declinePayment, listTransactions)
- [x] PT-4: Router in routers.ts registriert (paytec: paytecRouter, nexi: nexiRouter)
- [x] PT-5: AdminPaytec.tsx – Konfigurationsseite (KIT REST URL, Terminal-ID, API-Key, Trinkgeld) + Zahlungshistorie
- [x] PT-6: AdminNexi.tsx – Konfigurationsseite (IP, Port, Protokoll, Merchant-ID) + Ausstehende Zahlungen (manuelle Bestätigung) + Zahlungshistorie
- [x] PT-7: navConfig.ts – SumUp Terminal, PayTec Terminal, Nexi Terminal unter Infrastruktur eingetragen
- [x] PT-8: App.tsx – Routen /admin/paytec und /admin/nexi registriert
- [x] PT-9: closingReport.ts – Sektion 10: Kartenzahlungs-Aufschlüsselung nach Anbieter (SumUp/PayTec/Nexi) in buildClosingReport integriert
- [x] PT-10: AdminClosings.tsx – Sektion 4b im UI + Druckbericht (Abschnitt 10) mit Anbieter-Aufschlüsselung
- [x] TypeScript: 0 Fehler nach allen Änderungen

## Statistik-Modul (Detaillierte Abschlüsse + Produkt-Analyse + KI-Daten)

### Backend: statisticsRouter.ts
- [x] STAT-1: Perioden-Abschlüsse: getClosingsByPeriod (Tag/Woche/Monat/Quartal/Jahr) – aggregierte Umsätze, MwSt, Zahlungsarten, Vergleich Vorperiode
- [x] STAT-2: MwSt-Abschluss: getVatReport (Zeitraum wählbar) – ESTV-konforme Aufschlüsselung 8.1%/2.6%/0%, Netto/Brutto/MwSt pro Satz
- [x] STAT-3: Produkt-Zeitraum-Analyse: getProductStats (Produkt, Von-Bis-Datum, Uhrzeit-Filter) – Verkäufe, Umsatz, Ø-Preis, Tageszeit-Verteilung
- [x] STAT-4: Uhrzeit-Heatmap: getHourlyHeatmap (Wochentag × Stunde) – Umsatz + Bestellanzahl pro Slot
- [x] STAT-5: Top/Flop-Produkte: getTopProducts (Zeitraum, Limit, Sortierung nach Menge/Umsatz/Marge)
- [x] STAT-6: Tisch-Statistiken: getTableStats (Zeitraum) – Umsatz/Tisch, Ø Verweildauer, Umschlagshäufigkeit
- [x] STAT-7: Kellner-Performance: getWaiterStats (Zeitraum) – Umsatz, Trinkgeld, Bestellungen, Ø Bon-Wert pro Kellner
- [x] STAT-8: Zahlungsarten-Trend: getPaymentTrend (Zeitraum, Granularität) – Bar/Karte/Twint/SumUp/PayTec/Nexi über Zeit
- [x] STAT-9: KI-Datenpunkte: getAiInsights – Saisonalität, Wochentag-Muster, Uhrzeit-Peaks, Wetterkorrelation-Vorbereitung
- [x] STAT-10: Einkaufsempfehlung-Basis: getPurchaseForecast – Top-Artikel + Verbrauch letzte 4 Wochen + Trend

### Frontend: AdminStatisticsV2.tsx (neue Seite, ersetzt Platzhalter)
- [x] STAT-UI-1: Dashboard-Header mit Perioden-Tabs (Tag/Woche/Monat/Quartal/Jahr/Benutzerdefiniert)
- [x] STAT-UI-2: Umsatz-Übersicht-Karten (Brutto, Netto, MwSt, Trinkgeld, Vergleich Vorperiode mit %)
- [x] STAT-UI-3: Umsatz-Zeitreihen-Chart (Linie/Balken, umschaltbar, Vorperiode als Vergleichslinie)
- [x] STAT-UI-4: Zahlungsarten-Donut + Trend-Balken (Bar/Karte/Twint/Terminal nach Anbieter)
- [x] STAT-UI-5: Uhrzeit-Heatmap (7×24 Grid, Farbintensität = Umsatz, hover = Details)
- [x] STAT-UI-6: Top-Produkte-Tabelle (Filter: Zeitraum, Uhrzeit Von-Bis, Wochentag, Sortierung)
- [x] STAT-UI-7: Produkt-Einzelanalyse (Produkt wählen → Umsatz/Verkäufe/Ø-Preis, Uhrzeit-Verteilung, Wochentag-Verteilung)
- [x] STAT-UI-8: MwSt-Abschluss-Tab (ESTV-konform, exportierbar)
- [x] STAT-UI-9: Kellner-Performance-Tabelle (Rang, Umsatz, Trinkgeld, Bestellungen, Ø Bon)
- [x] STAT-UI-10: Tisch-Auslastungs-Übersicht (Heatmap oder Balken pro Tisch)
- [x] STAT-UI-11: KI-Insights-Panel (Muster-Erkennung, Empfehlungen, Prognose nächste Woche)
- [x] STAT-UI-12: Export-Button (CSV/PDF für alle Ansichten)

## Statistik-Export (CSV + PDF)

- [x] EXP-1: Backend statisticsRouter – exportCsv Endpunkt (alle Tabs: closings, products, vat, waiters, tables, heatmap)
- [x] EXP-2: Backend statisticsRouter – exportPdf Endpunkt (alle Tabs, professionelles Layout mit Logo/Datum/Filter)
- [x] EXP-3: Frontend AdminStatistics.tsx – Export-Buttons (CSV + PDF) in allen 7 Tabs
- [x] EXP-4: TypeScript 0 Fehler, Checkpoint

## Neue Features: Push-Alarm, Verbindungsstatus, Benachrichtigungston

- [x] ALARM-1: Backend deviceRouter – checkOfflineDevices Mutation: prüft alle Geräte auf >5 Min. Inaktivität und sendet Owner-Benachrichtigung
- [x] ALARM-2: Backend – Heartbeat-Cron-Handler (alle 5 Min.) für automatischen Geräteausfall-Check
- [x] STATUS-1: Frontend useSSEStatus-Hook – SSE-Verbindungsstatus (connected/reconnecting/offline) exportieren aus useSSE
- [x] STATUS-2: Frontend DashboardLayout – Verbindungsstatus-Badge in Sidebar/Header (grün/gelb/rot)
- [x] STATUS-3: Frontend KellnerDashboard – Verbindungsstatus-Banner (sichtbar bei Verbindungsproblemen)
- [x] SOUND-1: Frontend useSoundNotification-Hook – Web Audio API Töne (neue Bestellung, Bereit-Status, Alarm)
- [x] SOUND-2: Frontend KuecheDashboard – Ton bei neuer Bestellung und Bereit-Markierung
- [x] SOUND-3: Frontend KellnerDashboard – Ton wenn Gericht bereit (ready-Status via SSE)
- [x] SOUND-4: TypeScript 0 Fehler, Checkpoint

## PWA (Progressive Web App) – App-Installation ohne App Store

- [x] PWA-1: manifest.json mit Name, Icons, display:standalone, theme_color, start_url
- [x] PWA-2: Service Worker für Offline-Caching und Installation (sw.js aktualisiert)
- [x] PWA-3: iOS-spezifische Meta-Tags (apple-mobile-web-app-capable, apple-touch-icon, splash screens)
- [x] PWA-4: App-Icons in allen Grössen (72, 96, 128, 144, 152, 192, 384, 512 + maskable) generiert und hochgeladen
- [x] PWA-5: Installationsseite /install mit iOS + Android Schritt-für-Schritt-Anleitung
- [x] PWA-6: Install-Banner / In-App-Prompt für Chrome/Android (beforeinstallprompt) in InstallApp.tsx
- [x] PWA-7: QR-Code auf Installationsseite für einfachen Zugang vom Desktop

## UX-Verbesserungen Bestellmaske (Runde 3)
- [x] UX3-1: Haptic Feedback (navigator.vibrate) beim "Artikel senden"-Button
- [x] UX3-2: Swipe-to-Delete Gesture für Artikel in der Bestellliste (SwipeableItem-Komponente)
- [x] UX3-3: Favoriten-Kacheln (Top 8 meistbestellte Artikel, letzte 30 Tage) oben in der Bestellmaske

## UX-Verbesserungen Bestellmaske (Kellner)

- [x] UX-1: Haptic Feedback beim 'Artikel senden'-Button (navigator.vibrate)
- [x] UX-2: Swipe-to-Delete Gesture für Artikel in der Bestellliste (SwipeableItem-Komponente)
- [x] UX-3: Favoriten-Kacheln (meistbestellte Artikel, letzte 30 Tage) oben in der Bestellmaske

## Bugfixes & UX (Runde 4 - 19.06.2026)

- [x] B4-1: PWA manifest.json start_url und scope auf simplapos.com setzen (kein manus.space anzeigen)
- [x] B4-2: Warenkorb (OrderSidebar) kann nicht gescrollt werden - ScrollArea min-h-0 hinzugefügt
- [x] B4-3: Sende-Button-Position verbessert (bottom: calc(64px + safe-area-inset-bottom))
- [x] B4-4: Vibration beim Senden bestätigt (navigator.vibrate([50, 30, 80]) im onClick)
- [x] B4-5: Kleiner runder Rückgängig-Button (RotateCcw) neben dem Sende-Button hinzugefügt
- [x] B4-6: Favoriten nach aktiver Überkategorie filtern - db.ts+router+frontend aktualisiert

## Kiosk-Scan Feature (Foto-Erkennung mit KI)

- [x] K1: DB-Schema: kiosk_stations Tabelle (id, restaurantId, name, qrToken, createdAt)
- [x] K2: DB-Schema: kiosk_product_images Tabelle (id, menuItemId, imageKey, imageUrl, side, createdAt)
- [x] K3: tRPC: kioskStation.create, getAll, delete, getByToken Prozeduren
- [x] K4: tRPC: kioskStation.generateQR (QR-Code als PNG zurückgeben)
- [x] K5: tRPC: kioskProductImage.upload / list / delete (Bild hochladen, S3 speichern, mit Produkt verknüpfen)
- [x] K6: tRPC: kioskScan.analyze (Bild + restaurantId → Claude API mit Produktliste → Ergebnis zurückgeben, Bild sofort löschen)
- [x] K7: Admin-Seite /admin/kiosk: Stationen verwalten, QR-Code generieren und drucken
- [x] K8: Admin-Seite: Produkte einlernen (pro Produkt 3-8 Fotos hochladen, Seite wählen: Vorderseite/Rückseite/Links/Rechts/Oben)
- [x] K9: Gast-Seite /kiosk/[token]: Datenschutz-Hinweis + Bestätigung (kein Login nötig, public route)
- [x] K10: Gast-Seite: Kamera öffnen, lokale Gesichtserkennung (face-api.js), Rahmen-Validierung
- [x] K11: Gast-Seite: Foto senden → KI-Erkennung → Produktliste mit Preisen anzeigen
- [x] K12: Gast-Seite: Bestätigen / Nochmals fotografieren / Service rufen Buttons (keine manuelle Bearbeitung)
- [x] K13: Gast-Seite: Bezahlung (Zahlungsart wählen nach Bestätigung)
- [x] K14: Kellner-Benachrichtigung bei "Service rufen" (notifyOwner + Echtzeit)
- [x] K15: Foto nach Erkennung sofort aus Speicher löschen (Datenschutz)

## Kiosk-Scan Feature

- [x] Datenbank: kiosk_stations und kiosk_product_images Tabellen erstellt
- [x] Backend: kioskRouter mit allen Prozeduren (listStations, createStation, deleteStation, toggleStation, listProductImages, uploadProductImage, deleteProductImage, getStationByToken, scanProducts, listMenuItems, callService)
- [x] Admin-Seite: KioskAdmin.tsx mit Stationsverwaltung, QR-Code-Generierung, Produkt-Einlernen
- [x] Gast-Seite: KioskGuestPage.tsx mit Datenschutz-Hinweis, Kamera, KI-Scan, Rahmen-Validierung, Gesichtserkennung, Bestätigung, Service-Button, Bezahlung
- [x] Navigation: Kiosk-Scan in navConfig.ts und App.tsx eingetragen

## Kiosk-Scan: Online-Zahlung & POS-Integration

- [x] KP-1: kioskRouter – createCheckout Prozedur: Stripe-Session erstellen (line_items aus erkannten Produkten, success_url + cancel_url auf Kiosk-Seite)
- [x] KP-2: kioskRouter – confirmPayment Prozedur: Stripe-Session verifizieren → Bestellung automatisch im POS anlegen (orders + orderItems)
- [x] KP-3: KioskGuestPage – Bezahl-Screen: Bargeld entfernen, nur "Online bezahlen" Button (→ Stripe Checkout)
- [x] KP-4: KioskGuestPage – Success-Screen nach Zahlung: Bestellnummer anzeigen, "Danke"-Meldung
- [x] KP-5: KioskGuestPage – Cancel-Screen: Zurück zur Produktliste wenn Zahlung abgebrochen

## Kiosk-Schutzmechanismen

- [x] SM-1: KI-Prompt: Rahmen-Pflicht – KI prüft ob alle Produkte vollständig im Rahmen sind, gibt frame_violation zurück wenn Produkte ausserhalb
- [x] SM-2: KI-Prompt: Bildschirm-Erkennung – ENTFERNT (False-Positives bei gedrucktem Text auf Verpackungen)
- [x] SM-3: KI-Prompt: Alkohol/Tabak-Flag – KI markiert altersbeschränkte Produkte (Alkohol + Tabak) mit requiresAgeVerification: true
- [x] SM-4: Frontend: Live-Rahmen-Erkennung – alle 2s Vorschaubild aus Video-Stream → KI prüft ob physischer weisser Rahmen sichtbar → Overlay grün/rot
- [x] SM-5: Frontend: Foto-Button gesperrt bis physischer weisser Rahmen live erkannt (checkFrame tRPC-Prozedur)
- [x] SM-6: Frontend: Session-Timeout 3 Minuten – automatischer Reset bei Inaktivität
- [x] SM-7: Frontend: Mengenplausibilität – max. 10 Produkte pro Scan, Warnung bei Überschreitung
- [x] SM-8: Frontend: Preis-Schwellenwert – ab CHF 50 Servicemitarbeiter-Bestätigung erforderlich
- [x] SM-9: Altersverifikation: Wenn Alkohol/Tabak erkannt → Zahlung blockiert, Servicemitarbeiter-Benachrichtigung
- [x] SM-10: Altersverifikation: requestAgeVerification + approveAgeVerification tRPC-Prozeduren + kiosk_age_verifications DB-Tabelle

## Kiosk-Echtzeit-Überwachungssystem (Admin + Kellner)

- [x] KO-1: DB: kiosk_sessions Tabelle (sessionId, stationId, restaurantId, startedAt, endedAt, status, scanCount, abortCount, serviceCallCount, totalAmount, paymentStatus)
- [x] KO-2: DB: kiosk_events Tabelle (id, sessionId, stationId, restaurantId, eventType, payload, createdAt) – eventTypes: scan_started, scan_repeated, payment_started, payment_aborted, service_called, age_verification_requested, session_ended
- [x] KO-3: DB: kiosk_spot_checks Tabelle (id, sessionId, stationId, restaurantId, triggeredAt, triggeredBy, status, resolvedAt, resolvedBy)
- [x] KO-4: Backend: startSession / endSession / logEvent tRPC-Prozeduren (public, token-basiert)
- [x] KO-5: Backend: getLiveStations – alle Stationen mit aktiver Session, Status, Dauer, Events
- [x] KO-6: Backend: getSpotChecks / resolveSpotCheck / triggerSpotCheck tRPC-Prozeduren
- [x] KO-7: Backend: Stichproben-Logik – automatisch auslösen bei: 3+ Scans, Abbruch nach Scan, 2+ Service-Rufe, Sitzung >5 Min.
- [x] KO-8: Backend: createManualOrder – Kellner gibt Bestellung für Kasse ein (Text/Sprache → KI → Produkte → Stripe-Session → QR)
- [x] KO-9: Gast-Seite: Session starten beim QR-Scan, Events senden (scan_repeated, payment_aborted, etc.)
- [x] KO-10: Gast-Seite: Service-Ruf-Dialog korrigieren – "Service ist auf dem Weg" statt Bezahlung-Erfolg, KI-Chat-Option
- [x] KO-11: Admin/Kellner: KassenübersichtPage – Live-Icons (grau=frei, orange=aktiv, rot=Alarm, lila=Stichprobe)
- [x] KO-12: Admin/Kellner: Session-Detail-Panel – Timeline der Events, Dauer, Scan-Anzahl
- [x] KO-13: Admin/Kellner: Stichproben-Panel – offene Stichproben, Bestätigen-Button
- [x] KO-14: Kellner: Manuelle Bestellung per Text + Spracheingabe für Kasse, QR-Code-Anzeige für Gast
- [x] KO-15: Echtzeit-Polling alle 5s für Live-Kassenübersicht

## Kiosk-Erweiterungen (3 Punkte)

- [x] KE-1: Kiosk-Statistik-Dashboard – Backend: getKioskStats (Tages/Wochen-Scans, Erfolgsquote, Ø Sitzungsdauer, Top-Produkte, Stichproben-Ergebnisse pro Station)
- [x] KE-2: Kiosk-Statistik-Dashboard – Frontend: KioskStats.tsx Seite mit Charts (Balken, Linie, Kreis), Datumsfilter, Station-Filter
- [x] KE-3: Kiosk-Statistik-Dashboard – Navigation in Admin und Kellner eingetragen
- [x] KE-4: Push-Benachrichtigungen – Service Worker + VAPID bereits vorhanden, Kellner-Geräte abonnieren Kiosk-Alerts
- [x] KE-5: Push-Benachrichtigungen – callService und requestAgeVerification senden Push an alle Kellner des Restaurants
- [x] KE-6: Push-Benachrichtigungen – KioskMonitor zeigt Badge-Zähler für unbestätigte Alerts
- [x] KE-7: Mengen-Korrektur – +/- Buttons in KioskGuestPage Bestätigungsliste (Menge erhöhen/senken, min. 1)
- [x] KE-8: Mengen-Korrektur – Gesamtpreis aktualisiert sich live bei Mengenänderung

## Kiosk-Erweiterungen Runde 2

- [x] SW-1: Service Worker (public/sw.js) für Push-Benachrichtigungen – bereits vorhanden und vollständig
- [x] SW-2: Service Worker in KioskMonitor registrieren und VAPID-Push-Subscription darüber abwickeln – bereits korrekt implementiert
- [x] EX-1: Backend: exportKioskStats-Prozedur – CSV-Generierung (Sessions, Produkte, Stationen)
- [x] EX-2: Frontend: Download-Button in KioskStats.tsx für CSV-Export
- [x] AV-1: Backend: getAgeVerificationRequests-Prozedur (offene Anfragen für Kellner)
- [x] AV-2: Frontend: AgeVerificationPanel.tsx – dedizierte Seite für Kellner mit offenen Anfragen + Genehmigen/Ablehnen
- [x] AV-3: Navigation: Altersverifikation-Link in Kellner-navConfig

## Kiosk-Erweiterungen Runde 3

- [x] SN-1: Backend: updateStationName-Prozedur in kioskRouter (protectedProcedure, input: stationId + name, Multi-Tenant-Check)
- [x] SN-2: Frontend: Kiosk-Admin-Seite – Stationsname inline bearbeitbar (Klick auf Name → Input-Feld → Speichern)
- [x] AT-1: Web Audio API – Hilfsfunktion playAlertTone() (synthetischer Ton via AudioContext, kein externes Asset)
- [x] AT-2: KioskMonitor – Ton abspielen wenn neue service_called oder age_check Station erscheint (Vergleich mit vorherigem Poll)
- [x] AT-3: AgeVerificationPanel – Ton abspielen wenn neue offene Anfrage erscheint (Vergleich mit vorherigem Poll)
- [x] AT-4: Ton-Toggle-Button in KioskMonitor und AgeVerificationPanel (Benutzer kann Ton deaktivieren)

## Stichproben-Produktliste auf Erfolgsscreen

- [x] SP-1: Zahlungs-Erfolgsscreen – Produktanzahl gross anzeigen (z.B. "7 Produkte") + vollständige Produktliste mit Name, Menge und Einzelpreis für schnelle Stichproben-Kontrolle

## Kiosk Session-Lock (Exklusiver Zugang pro Gast)

- [x] SL-1: DB: kiosk_stations um lockToken (varchar 64), lockedAt (bigint), lockExpiresAt (bigint) erweitern
- [x] SL-2: Backend: acquireLock – atomares Setzen des Locks (nur wenn frei), gibt lockToken zurück oder "busy"
- [x] SL-3: Backend: releaseLock – Lock freigeben nach Zahlung oder Timeout
- [x] SL-4: Backend: checkLock – prüfen ob Kasse frei oder belegt (für Polling)
- [x] SL-5: Backend: Lock-Timeout 10 Minuten – automatische Freigabe bei Inaktivität
- [x] SL-6: Frontend: acquireLock beim Laden der Kiosk-Seite, bei Fehler "Kasse belegt"-Screen
- [x] SL-7: Frontend: lockToken in allen Mutations mitsenden (Sicherheitsprüfung)
- [x] SL-8: Frontend: releaseLock nach erfolgreicher Zahlung + nach Session-Reset
- [x] SL-9: Frontend: Kasse-belegt-Screen mit Countdown und automatischem Retry alle 3s

## Kiosk Lock-Erweiterungen

- [x] LL-1: Backend: getLockStatus-Prozedur (alle Stationen mit Lock-Status für KioskMonitor)
- [x] LL-2: Backend: forceReleaseLock für Admin (Lock manuell aufheben)
- [x] LL-3: Backend: Wartezeit-Tracking in kiosk_sessions (waitStartedAt, waitEndedAt Felder)
- [x] LL-4: Backend: getWaitStats-Prozedur (Ø Wartezeit, Häufigkeit, Peak-Zeiten)
- [x] LL-5: KioskMonitor: Live-Lock-Status-Badge auf Kassen-Icons (gesperrt seit X Sekunden)
- [x] LL-6: KioskMonitor: "Lock aufheben"-Button für Admin bei gesperrten Kassen
- [x] LL-7: KioskStats: Wartezeit-Analyse-Widget (Ø Wartezeit, Häufigkeit, Peak-Zeiten-Chart)
- [x] LL-8: Frontend: Wartezeit-Tracking beim Busy-Screen (Zeitstempel senden)

## KI-Trainingsdaten-Infrastruktur (Kiosk-Produktfotos)

- [x] TD-1: DB-Schema: kiosk_training_images Tabelle (sessionId, stationId, restaurantId, s3Key, label, status: pending/approved/rejected, createdAt)
- [x] TD-2: DB-Migration via webdev_execute_sql
- [x] TD-3: Backend: saveTrainingImage Hilfsfunktion (asynchron, non-blocking) – Base64 → S3 Upload + DB-Eintrag
- [x] TD-4: Backend: scanProducts erweitern – nach KI-Antwort Foto asynchron speichern (fire-and-forget, kein await im Gast-Flow)
- [x] TD-5: Backend: trainingRouter – listImages (Admin, paginiert), approveImage, rejectImage, getStats, exportApproved
- [x] TD-6: Backend: exportTrainingData – JSON-Manifest aller approved Bilder mit Labels (für externes Fine-Tuning)
- [x] TD-7: Frontend: GuestTrainingReview-Komponente in KioskAdmin – Stats-Bar, Info-Banner, Filter, Bild-Grid mit Approve/Reject, Pagination, Export-Button
- [x] TD-8: Navigation: "Gästefotos"-Tab in KioskAdmin eingetragen
- [x] TD-9: Vitest-Tests für trainingRouter (Stats-Aggregation, Label-Parsing, Multi-Tenant-Isolation, Export-Format)

## KI-Trainingsdaten – Erweiterung 2

- [x] TD2-1: Backend: bulkApprove-Prozedur (alle pending Bilder eines Restaurants auf approved setzen)
- [x] TD2-2: Backend: checkPersonInImage-Prozedur (Claude Vision prüft ob Person erkennbar ist, gibt hasPersons + confidence zurück)
- [x] TD2-3: Backend: saveTrainingImageAsync erweitern – nach S3-Upload automatisch Personenerkennung ausführen, bei Personen status="rejected" + rejectionReason="auto_person_detected" setzen
- [x] TD2-4: DB-Schema: rejectionReason + avgConfidence Felder in kiosk_training_images hinzugefügt
- [x] TD2-5: Frontend: "Alle genehmigen"-Button in GuestTrainingReview mit Confirm-Dialog (nur wenn pending > 0)
- [x] TD2-6: Frontend: Qualitätsindikator-Banner (Confidence-Balken, Auto-Reject-Zähler, highConfidencePct)
- [x] TD2-7: Frontend: Auto-rejected Badge auf Bildern mit rejectionReason="auto_person_detected" + Confidence-Dot
- [x] TD2-8: Vitest-Tests für bulkApprove, checkPersonInImage-Logik und Confidence-Berechnung (15 Tests grün)

## Sprint: KI-Upselling + Essen-im-Kiosk-Flow + Foodwaste-Prävention

- [x] KU-1: DB-Schema: expiresAt + expiryDiscountPct Felder in inventory_items (Ablaufdatum + automatischer Rabatt)
- [x] KU-2: DB-Schema: kiosk_upselling_rules Tabelle (triggerProductId, suggestedProductId, comboPrice, priority, activeFrom, activeTo)
- [x] KU-3: DB-Schema: kiosk_pickup_numbers Tabelle (restaurantId, sessionId, number, status: waiting/ready/collected, createdAt)
- [x] KU-4: DB-Migration via webdev_execute_sql
- [x] KU-5: Backend: getSuggestions Prozedur (Kontext: gescannte Produkte + Lager + Ablaufdaten → KI-Empfehlungen + Regelempfehlungen + Ablauf-Deals)
- [x] KU-6: Backend: Ablaufende Artikel in getSuggestions integriert (expiresAt ≤7 Tage, auto-Rabatt)
- [x] KU-7: Backend: getKioskMenu Prozedur (vereinfachte Speisekarte für Gäste-Flow, Kategorien + Artikel)
- [x] KU-8: Backend: kioskCheckout erweitern – gemischter Warenkorb (Kiosk-Artikel + Essen), Abholnummer generieren, KDS-Bestellung erstellen
- [x] KU-9: Backend: getPickupStatus Prozedur (Gast pollt Abholnummer-Status)
- [x] KU-10: Backend: updatePickupStatus Prozedur (Küche markiert Bestellung als fertig)
- [x] KU-11: Frontend KioskGuestPage: Essen-Tab nach Kiosk-Scan (Speisekarte mit Kategorien, +/- Buttons)
- [x] KU-12: Frontend KioskGuestPage: Upselling-Widget (3 Sektionen: Ablauf-Deals / Regelbasiert / KI-Empfehlung)
- [x] KU-13: Frontend KioskGuestPage: Gemischter Warenkorb (Kiosk + Essen, einmal bezahlen, foodTotal in Gesamtbetrag)
- [x] KU-14: Frontend KioskGuestPage: Abholnummer-Banner auf Success-Screen (grosse Nummer, Abholhinweis)
- [x] KU-15: Frontend Admin: Upselling-Regeleditor (Produkt-Paare definieren, Kombi-Preise, Zeitfenster) – neuer Tab in KioskAdmin
- [x] KU-16: Frontend Admin: Ablaufdatum-Verwaltung (expiresAt setzen, Rabatt konfigurieren, Ampel-Anzeige rot/amber) im Upselling-Tab
- [x] KU-17: Frontend Küche (KDS): Abholnummer auf Bestellkarte angezeigt, "Fertig"-Button vorhanden
- [x] KU-18: Vitest-Tests: 16 Tests grün (Ablaufdatum-Filter, Rabattberechnung, Regel-Matching, Abholnummer-Generierung, Multi-Tenant-Isolation)

## Sprint: Scan-Flow-Verbesserungen (SFX)

- [x] SFX-1: DB-Schema: kiosk_image_fetch_errors Tabelle (stationId, restaurantId, imageKey, errorType, errorMessage, createdAt)
- [x] SFX-2: DB-Migration via webdev_execute_sql
- [x] SFX-3: Backend: Fehler-Logging in scanProducts – fehlgeschlagene Lernbild-Fetches in kiosk_image_fetch_errors speichern
- [x] SFX-4: Backend: checkImageReachability-Prozedur (Admin prüft ob ein S3-Bild erreichbar ist)
- [x] SFX-5: Backend: listImageFetchErrors-Prozedur (Admin sieht welche Bilder nicht erreichbar sind)
- [x] SFX-6: Frontend: ImageFetchErrorWarning-Komponente in GuestTrainingReview (orange Banner, Liste fehlerhafter Bilder, "Behoben"-Button)
- [x] SFX-7: Frontend: Scan-Timeout-Indikator in ScanningScreen (nach 8s: amber Banner "KI braucht länger")
- [x] SFX-8: Frontend: Admin-Warnung wenn Bilder mit Fetch-Fehlern vorhanden sind (ImageFetchErrorWarning im Gästefotos-Tab)

## Bugfix: Scan-Timeout-Crash (ERR-MQNREESY-8OQY)

- [x] STF-1: Analyse: scanProducts-Prozedur Gesamtdauer messen (Lernbild-Fetch + KI-API + S3-Upload)
- [~] STF-2: Fix: scanProducts auf SSE-Streaming umstellen (Backlog – STF-3 löst Kernproblem) (keepalive Chunks alle 5s senden, verhindert 180s Cloud-Run-Timeout)
- [x] STF-3: Fix: Lernbild-Fetch parallelisieren (Promise.all statt sequenziell) um Gesamtdauer zu reduzieren
- [x] STF-4: Fix: KI-Anfrage mit explizitem 120s Timeout absichern (AbortSignal)
- [~] STF-5: Frontend: ScanningScreen auf SSE-Response umstellen (Backlog – abhängig von STF-2) (fetch + ReadableStream statt tRPC-Mutation)
- [x] STF-6: Frontend: Fehlerbehandlung verbessern – bei Timeout Toast statt Seiten-Crash

## Sprint: Re-Upload + Scan-Retry + Fehler-Benachrichtigung

- [x] RU-1: Backend: reuploadProductImage-Prozedur (nimmt imageKey, re-fetcht von S3, speichert neu, updated DB-Eintrag)
- [x] RU-2: Backend: checkAndNotifyFetchErrors – prüft ob >3 Fehler in letzter Stunde, sendet Owner-Benachrichtigung (fire-and-forget nach scanProducts)
- [x] RU-3: Frontend: "Erneut hochladen"-Button in ImageFetchErrorWarning (Admin-Tab Gästefotos) mit Lade-Spinner
- [x] RU-4: Frontend: Scan-Retry-Button in ScanningScreen nach 20s ohne Ergebnis
- [x] RU-5: Vitest-Tests für reuploadProductImage + checkAndNotifyFetchErrors (580/580 grün)

## Sprint: Confirm-Screen Crash Fix

- [x] BF-1: Frontend expiringDeals-Rendering an Backend-Format anpassen (inventoryItemId, discountPct, daysLeft)
- [x] BF-2: Frontend ruleBasedSuggestions-Rendering an Backend-Format anpassen (ruleId, label, menuItemPrice, comboPrice)
- [x] BF-3: Frontend throwOnError=false für alle Kiosk-Queries (verhindert Error Boundary bei UNAUTHORIZED)
- [x] BF-4: TypeScript-Check (0 Fehler) + Tests (580/580 grün) + Checkpoint

## Sprint: Produkt-Matching-Fix (PMF)

- [x] PMF-1: Matching-Algorithmus analysieren – Ursache: split(" ")[0]-Heuristik + KI-Prompt zu schwach
- [x] PMF-2: Backend-Fuzzy-Matching verschärft: split(" ")[0] entfernt, Konfidenz-Schwelle (low=id:-1), min. 4 Zeichen
- [x] PMF-3: Modus A + B Prompts verschärft: "NIEMALS RATEN", Beispiel Natron→Marlboro Gold verboten, id:-1 bevorzugt
- [x] PMF-4: TypeScript-Check (0 Fehler) + Tests (580/580 grün) + Checkpoint

## Sprint: Kiosk Post-Checkout Fixes + Marketing-Screen (PCF)

- [x] PCF-1: Fix: Kasse-Freigabe nach Zahlung – lockToken + products in sessionStorage gespeichert, releaseLock nach Redirect
- [x] PCF-2: Fix: Success-Screen Produktliste – products aus sessionStorage nach Stripe-Redirect wiederhergestellt
- [x] PCF-3: Feature: Marketing-Screen nach Quittung (Treuepunkte-CTA, Social Media Links, Custom CTA)
- [x] PCF-4: Feature: Admin-Tab "Marketing" in KioskAdmin mit MarketingConfigEditor (Treuepunkte, SM-Links, Custom CTA)
- [x] PCF-5: TypeScript-Check (0 Fehler) + Tests (580/580 grün) + Checkpoint

## Sprint: KI-Erkennungs-Fix (KIF)

- [x] KIF-1: Modell von claude-haiku-4-5 auf claude-sonnet-4-5 upgraden (bessere Bildanalyse)
- [x] KIF-2: Modus-A-Prompt: Explizit auf Referenzbilder hinweisen und Mengen-Zählung verbessern (Prompts bereits in PMF-Sprint verschärft)
- [x] KIF-3: Fallback-Logik: Wenn Lernbilder in DB aber alle Fetches fehlgeschlagen → klare Fehlermeldung statt Raten
- [x] KIF-4: Admin: Lernbild-Status-Anzeige (grün=OK, rot=Fetch-Fehler) damit Inhaber sieht welche Bilder fehlen
- [x] KIF-5: TypeScript-Check (0 Fehler) + Tests (580/580 grün) + Checkpoint

## Sprint: Scan-Erkennungs-Root-Cause-Fix (SRF)

- [x] SRF-0: Modell zurück auf claude-haiku-4-5 (günstiger, gleich gut)
- [x] SRF-1: FIX-1: imgIndex-Bug behoben – imgIndex wurde auch bei null-Blocks erhöht → Bild-Nummern im Prompt stimmten nicht mit echten Bildern überein
- [x] SRF-2: FIX-2: Prompt als system-Feld übergeben (Anthropic-Best-Practice) statt als letztes text-Element nach den Bildern
- [x] SRF-3: FIX-3: Einleitungstext + "=== SCAN-FOTO ===" Label damit KI weiss welches Bild das Scan-Foto ist
- [x] SRF-4: Modus-A + Modus-B Prompts schärfer formuliert (kürzere, klarere Struktur)
- [x] SRF-5: TypeScript-Check (0 Fehler) + Tests (580/580 grün) + Checkpoint

## Sprint: Erweitertes Lagerwirtschaftsmodul – Sportrestaurant Chur (ELW)

### Kontext
Anforderungen von Fabio Wellenzohn (Leiter Sport- und Eventanlagen, Stadt Chur):
- 6 Lagerräume (Kühlraum 1+2+3, Raum Kegs/Kiosk, Raum Trockenwaren, Raum Leergut)
- QR-Code am Lagerort für Wareneingang/Warenausgang
- Mindestlagermengen + automatische Bestellliste pro Lieferant
- Tablet-basierter Workflow (Personal-Code Login)
- POS-Integration (automatischer Lagerabzug beim Verkauf)

### Phase 1: Datenbankschema erweitern
- [x] ELW-DB-1: Tabelle `warehouse_zones` (id, restaurantId, name, type: kuehl1|kuehl2|tiefkuehl|trocken|keg|leergut, tempCelsius, sizeM2, description)
- [x] ELW-DB-2: Tabelle `warehouse_locations` (id, zoneId, restaurantId, name, shelf, compartment, qrSlug unique, description)
- [x] ELW-DB-3: Tabelle `inventory_suppliers` erweitern: contactEmail, contactPhone, deliveryDays (JSON), notes
- [x] ELW-DB-4: Tabelle `inventory_items` erweitern: locationId (FK warehouse_locations), ean, unitSize, unitLabel, reorderQty, lastDeliveryDate, imageUrl
- [x] ELW-DB-5: Tabelle `inventory_delivery_photos` (id, movementId, restaurantId, imageUrl, uploadedAt)
- [x] ELW-DB-6: Migration generieren und anwenden (webdev_execute_sql)

### Phase 2: Backend – Lagerstruktur + QR-Code
- [x] ELW-BE-1: warehouseRouter – CRUD Zonen (createZone, updateZone, deleteZone, listZones)
- [x] ELW-BE-2: warehouseRouter – CRUD Lagerorte (createLocation, updateLocation, deleteLocation, listLocations, getByQrSlug)
- [x] ELW-BE-3: warehouseRouter – QR-Code-Generierung (generateQrCode: gibt SVG/PNG zurück für Ausdruck)
- [x] ELW-BE-4: inventoryRouter – Wareneingangsbuchung erweitern: locationId, deliveryPhoto, lieferantAbweichung
- [x] ELW-BE-5: inventoryRouter – Warenausgangsbuchung: manuell + Verlust/Bruch/Diebstahl mit Pflichtbegründung
- [x] ELW-BE-6: purchaseOrderRouter – Bestellliste pro Lieferant (alle Artikel unter Mindestmenge, gruppiert)
- [x] ELW-BE-7: purchaseOrderRouter – PDF-Export (pdfkit, pro Lieferant eine Seite)
- [x] ELW-BE-8: purchaseOrderRouter – E-Mail-Versand (nodemailer oder SMTP, an Lieferant-E-Mail)

### Phase 3: Frontend – Lager-Dashboard
- [x] ELW-FE-1: AdminWarehouse.tsx – Hauptseite mit Tabs: Übersicht | Zonen | Artikel | Bewegungen | Bestellungen
- [x] ELW-FE-2: Übersicht-Tab: Zonen-Karten mit Ampelstatus (grün/gelb/rot), Temperatur-Badge, Artikel-Anzahl
- [x] ELW-FE-3: Artikel-Tab: Tabelle mit Filter (Zone, Lieferant, Ampel), Inline-Bestand-Anzeige
- [x] ELW-FE-4: Bewegungen-Tab: Buchungshistorie (Wer, Was, Wann, Menge, Typ, Foto-Link)
- [x] ELW-FE-5: Echtzeit-Polling (alle 30s) für Bestandsänderungen

### Phase 4: Frontend – Wareneingangskontrolle (Tablet-optimiert)
- [x] ELW-FE-6: AdminWarehouseIncoming.tsx – Wareneingang-Seite (Vollbild, Tablet-optimiert)
- [x] ELW-FE-7: QR-Code-Scanner (jsQR via Kamera) ODER manuelle Lagerort-Auswahl
- [x] ELW-FE-8: Artikel-Liste nach Lagerort gefiltert, Mengeneingabe mit +/- Buttons
- [x] ELW-FE-9: Foto-Upload für Lieferschein (optional, direkt zu S3)
- [x] ELW-FE-10: Abweichungs-Dialog (bestellt vs. geliefert, Bemerkung)

### Phase 5: Frontend – Warenausgangskontrolle
- [x] ELW-FE-11: AdminWarehouseOutgoing.tsx – Warenausgang-Seite (Tablet-optimiert)
- [x] ELW-FE-12: Buchungstyp-Auswahl: Normal-Entnahme | Verlust | Bruch | Diebstahl
- [x] ELW-FE-13: Bei Verlust/Bruch/Diebstahl: Pflicht-Begründung + optionales Foto

### Phase 6: Frontend – Bestellliste + QR-Druck
- [x] ELW-FE-14: AdminWarehouseOrders.tsx – Bestelllisten-Seite (pro Lieferant gruppiert)
- [x] ELW-FE-15: PDF-Export-Button (Download direkt im Browser)
- [x] ELW-FE-16: E-Mail-Versand-Button (an Lieferant-E-Mail, Bestätigung-Toast)
- [x] ELW-FE-17: QR-Code-Druck-Seite (alle Lagerorte einer Zone, druckoptimiert)

### Phase 7: Navigation + Tests + Checkpoint
- [x] ELW-NAV-1: navConfig.ts – Lager-Navigation erweitern (Wareneingang, Warenausgang, Bestellungen, QR-Codes)
- [x] ELW-TEST-1: TypeScript-Check (0 Fehler)
- [x] ELW-TEST-2: Vitest-Tests für alle neuen Router-Endpoints
- [x] ELW-TEST-3: Checkpoint erstellen

## Sprint: QR-Druck + POS-Abzug + MHD-Tracking (QPM)

- [x] QPM-1: DB-Schema: bestBefore (date), chargeNr (varchar) in inventory_items + Migration
- [x] QPM-2: Backend: generateZoneQrPdf (pdfkit, alle Lagerorte einer Zone als A4-Labels mit QR-Code + Name + Regal)
- [x] QPM-3: Backend: getExpiringItems (Artikel mit MHD < 3 Tage, gruppiert nach Zone)
- [x] QPM-4: Backend: POS-Abzug deductStockFromOrder mit locationId-Verknüpfung (Abzug vom richtigen Lagerort)
- [x] QPM-5: Frontend: QR-Code-Druck-Seite in AdminWarehouse (Zone auswählen → PDF generieren → Download)
- [x] QPM-6: Frontend: MHD-Warn-Banner im Lager-Dashboard (rote Karte wenn Artikel in 3 Tagen ablaufen)
- [x] QPM-7: Frontend: MHD-Felder in Artikel-Formular (bestBefore Datepicker, chargeNr Eingabe)
- [x] QPM-8: TypeScript-Check (0 Fehler) + Tests + Checkpoint

## Sprint: MHD-Konfiguration + Heartbeat-Benachrichtigung + QR-Scan-Seite (QPM-EXT)

- [x] QPM-EXT-1: DB-Schema: mhdWarningDays (int, default 3) in restaurants-Tabelle + Migration
- [x] QPM-EXT-2: Backend: warehouseRouter – getMhdSettings + saveMhdSettings Endpoints
- [x] QPM-EXT-3: Backend: getExpiringItems nutzt mhdWarningDays aus Restaurant-Settings
- [x] QPM-EXT-4: Backend: Heartbeat-Handler /api/scheduled/mhdCheck – täglich 07:00 UTC, prüft alle Restaurants, sendet Owner-Notification bei abgelaufenen/bald ablaufenden Artikeln
- [x] QPM-EXT-5: Backend: publicWarehouseRouter – getLocationBySlug (öffentlich, kein Auth) für QR-Scan-Seite
- [x] QPM-EXT-6: Frontend: MHD-Schwellenwert-Einstellung in AdminWarehouse (Einstellungs-Tab oder Konfigurationsbereich)
- [x] QPM-EXT-7: Frontend: QR-Scan-Seite /lager/:qrSlug – zeigt Lagerort-Info, Artikel-Liste mit Bestand, MHD-Status
- [x] QPM-EXT-8: TypeScript-Check (0 Fehler) + Tests + Checkpoint

## Sprint: In-App QR-Scanner für Lagerverwaltung (QR-SCAN)
- [x] QR-SCAN-1: npm-Paket html5-qrcode installieren (Kamera-QR-Erkennung im Browser)
- [x] QR-SCAN-2: WarehouseQrScanner-Komponente: Kamera-Zugriff, QR-Erkennung, Lagerort-Auflösung via tRPC (getLocationByQrSlug)
- [x] QR-SCAN-3: Scan-Tab in AdminWarehouse: Scanner-Ansicht + Lagerort-Übersicht nach Scan
- [x] QR-SCAN-4: Aktions-Buttons nach Scan: Wareneingang buchen, Verlust melden, Bestand prüfen, Inventur/Korrektur
- [x] QR-SCAN-5: Wareneingang-Dialog direkt aus Scanner (Lagerort vorausgefüllt, Artikel auswählen, Menge/Preis/Lieferant)
- [x] QR-SCAN-6: TypeScript-Check (0 Fehler) + Tests + Checkpoint

## Sprint: Such- & Filterfunktion Lager-Zonen & Standorte

- [x] SEARCH-1: Suchfeld für Zonen (nach Name filtern)
- [x] SEARCH-2: Suchfeld für Lagerorte innerhalb einer Zone (nach Name/Regal filtern)
- [x] SEARCH-3: Zonentyp-Filter (Kühlraum, Tiefkühl, Trocken, Keg, Leergut, alle)
- [x] SEARCH-4: Artikel-Suche über alle Zonen hinweg (Name, Kategorie, Lagerort)
- [x] SEARCH-5: Ergebnis-Highlighting (Suchbegriff fett markiert in Ergebnissen)
- [x] SEARCH-6: TypeScript-Check (0 Fehler) + Checkpoint

## Sprint: KI-Komplett-Onboarding (Speisekarte → Menü + Lager + Rezepte)

- [x] KAI-1: DB-Schema: ai_import_sessions Tabelle (Upload-Status, KI-Ergebnis als JSON, Bestätigungsstatus)
- [x] KAI-2: DB-Migration via webdev_execute_sql
- [x] KAI-3: Backend: aiImportRouter – analyzeMenu Endpoint (Datei-URL empfangen, KI-Prompt senden, strukturiertes JSON zurückgeben: Kategorien + Artikel + Rohwaren + Rezepte)
- [x] KAI-4: Backend: aiImportRouter – confirmImport Endpoint (KI-Vorschläge in menu_categories, menu_items, inventory_items, inventory_recipes speichern)
- [x] KAI-5: Backend: aiImportRouter – getSession Endpoint (Status und Ergebnis einer Import-Session abrufen)
- [x] KAI-6: Frontend: AdminMenuImport.tsx – Schritt 1: Datei-Upload (Foto/PDF/Excel der Speisekarte)
- [x] KAI-7: Frontend: AdminMenuImport.tsx – Schritt 2: KI-Analyse läuft (Ladeanimation + Fortschrittsanzeige)
- [x] KAI-8: Frontend: AdminMenuImport.tsx – Schritt 3: Bestätigungs-Wizard (Menükarte / Lager / Rezepte einzeln prüfbar und editierbar)
- [x] KAI-9: Frontend: AdminMenuImport.tsx – Schritt 4: Alles übernehmen → Erfolgsmeldung + Weiterleitung
- [x] KAI-10: Navigation: KI-Import-Seite in navConfig.ts unter Speisekarte einbinden
- [x] KAI-11: Route in App.tsx registrieren (/admin/menu/ki-import)
- [x] KAI-12: TypeScript-Check (0 Fehler) + Vitest-Tests + Checkpoint

## Sprint: Onboarding-Wizard + Rezept-Mengen

- [x] OB-1: Backend: onboardingRouter – getOnboardingStatus (hat Restaurant Speisekarte/Lager/Rezepte?) + markOnboardingDone
- [x] OB-2: DB: onboardingCompletedAt Feld in restaurants-Tabelle (via SQL)
- [x] OB-3: Frontend: OnboardingWizard.tsx – modulabhängiger Wizard (Lager gebucht → Lager zuerst, sonst → Speisekarte zuerst)
- [x] OB-4: Frontend: Wizard-Schritte: Willkommen → KI-Import oder Manuell → Lager einrichten (wenn gebucht) → Fertig
- [x] OB-5: Frontend: DashboardLayout – Wizard beim ersten Login automatisch anzeigen (onboardingCompletedAt = null)
- [x] OB-6: Rezept-Mengen: AdminInventoryRecipes.tsx – Inline-Bearbeitung der Mengen (Klick auf Menge → Input-Feld)
- [x] OB-7: Rezept-Mengen: Einheit-Dropdown pro Zutat (g, kg, ml, L, Stück, EL, TL)
- [x] OB-8: Rezept-Mengen: Speichern-Button + Optimistic Update
- [x] OB-9: TypeScript-Check (0 Fehler) + Checkpoint

## Sprint: Onboarding-Wizard v2 (persistenter Fortschritt + alle Module)

- [x] OBv2-1: DB-Tabelle onboarding_progress (restaurantId, stepKey, status: pending/done/skipped, completedAt)
- [x] OBv2-2: DB-Migration via webdev_execute_sql
- [x] OBv2-3: Backend adminSetupRouter: getProgress (alle Schritte mit Status laden, modulabhängig), updateStep (Schritt als done/skipped markieren)
- [x] OBv2-4: Schritte: Willkommen (immer), Restaurant-Logo (immer), Tischplan (immer), Mitarbeiter (wenn staff-Modul), Speisekarte/KI-Import (immer), Lager (wenn warehouse-Modul), Abschluss (immer)
- [x] OBv2-5: Frontend AdminSetupWizard.tsx neu: persistenter Fortschritt aus DB, Wizard öffnet sich beim Login wenn nicht abgeschlossen, bleibt beim letzten offenen Schritt stehen
- [x] OBv2-6: Jeder Schritt hat: Titel, Beschreibung, Inline-Aktion (Logo hochladen) oder Link zum Modul
- [x] OBv2-7: Wizard kann jederzeit geschlossen und wieder geöffnet werden (Button in DashboardLayout-Header)
- [x] OBv2-8: Fortschrittsbalken zeigt X von Y Schritte abgeschlossen
- [x] OBv2-9: TypeScript-Check (0 Fehler) + Checkpoint

## Sprint: Sidebar-Restrukturierung & Tuya Smart-Building-Integration

- [x] Sidebar: smart_building Modul in pricing.ts eingetragen (CHF 29/Monat, Kategorie compliance)
- [x] Sidebar: Smart-Building-Einträge bereits korrekt in navConfig.ts (Gruppe "Qualität & Hygiene", moduleId: smart_building)
- [x] Tuya-Integration: Backend-Schema (smart_devices, smart_alerts Tabellen)
- [x] Tuya-Integration: tRPC-Routen (Geräte hinzufügen, Daten abrufen, Alarme, Temperaturreadings, HACCP-Export, getAllAlerts)
- [x] Tuya-Integration: Frontend-Dashboard mit allen Gerätetypen (Temperatur, Bewegung, Licht, Schalter, Wasserleck, Feuer/Rauch, CO2, Energie, Kamera, 14 Kategorien)
- [x] Tuya-Integration: Echtzeit-Alarm-System mit Push-Benachrichtigung
- [x] Tuya-Integration: Geräteverwaltung (hinzufügen, konfigurieren, entfernen)
- [x] Tuya-Integration: SmartBuildingAlerts.tsx (Alarme & Meldungen Seite)
- [x] Tuya-Integration: SmartBuildingTemperature.tsx TypeScript-Fehler behoben (sonner, explizite Typen)
- [x] Tuya-Integration: Routen in App.tsx registriert (/admin/smart-building, /temperature, /alerts)
- [x] Tests für Tuya-Routen schreiben (16 Tests, alle grün – 596/596 Tests total)

## Sprint: Tuya-Erweiterungen (Polling, Konfiguration, Push)

- [ ] TUYA-EXT-1: periodic-updates.md lesen (Heartbeat-Architektur)
- [ ] TUYA-EXT-2: Heartbeat-Handler /api/scheduled/tuyaPolling – alle 10 Min. Gerätestatus von Tuya API abrufen, Readings speichern, Alarme auslösen
- [ ] TUYA-EXT-3: tuyaPollingCron.ts – Handler-Logik (alle Restaurants mit Tuya-Credentials, API-Aufruf, DB-Update, Alarm-Erkennung)
- [ ] TUYA-EXT-4: Handler in server/_core/index.ts registrieren
- [ ] TUYA-EXT-5: tRPC: updateDeviceConfig Prozedur (Schwellenwerte, alertEnabled, alertSeverity editieren)
- [ ] TUYA-EXT-6: Frontend: Inline-Konfiguration in SmartBuilding.tsx (Klick auf Gerät → Konfig-Dialog: Min/Max, Alarm-Toggle, Schweregrad)
- [ ] TUYA-EXT-7: Frontend: Konfig-Dialog zeigt aktuellen Wert + Speichern-Button
- [ ] TUYA-EXT-8: Push-Benachrichtigung bei kritischen Alarmen (Feuer, Wasserleck, Temperaturüberschreitung) via notifyOwner + VAPID
- [ ] TUYA-EXT-9: tRPC: getPollingConfig + savePollingConfig (Intervall konfigurierbar: 5/10/15/30 Min.)
- [ ] TUYA-EXT-10: Frontend: Polling-Konfiguration in Smart-Building-Header (Intervall-Auswahl)
- [ ] TUYA-EXT-11: TypeScript-Check (0 Fehler) + Vitest-Tests + Checkpoint

## Sprint: Automatisiertes Marketing-Modul (Vollständig)

### Phase 1: Datenbankschema
- [ ] MKT-1: marketing_posts Tabelle (id, restaurantId, imageUrl, imageKey, aiAnalysis, captionInstagram, captionFacebook, captionGoogle, captionTiktok, hashtags, status: draft/pending_approval/approved/scheduled/published/failed, scheduledAt, publishedAt, platforms JSON, productId, sourceType: manual/waiter_flow/auto)
- [ ] MKT-2: marketing_platforms Tabelle (restaurantId, platform: instagram/facebook/google/tiktok, accessToken, pageId, accountId, connectedAt, isActive)
- [ ] MKT-3: marketing_settings Tabelle (restaurantId, waiterCameraEnabled, autoApprove, weeklyPostTarget, reviewBoosterEnabled, reviewBoosterDelay, whatsappEnabled, smsEnabled)
- [ ] MKT-4: marketing_photo_requests Tabelle (id, restaurantId, orderId, productId, productName, reason, aiScore, status: pending/completed/skipped/expired, requestedAt, completedAt, imageUrl)
- [ ] MKT-5: review_boost_log Tabelle (id, restaurantId, orderId, guestPhone, sentAt, platform, clicked)
- [ ] MKT-6: customer_campaigns Tabelle (id, restaurantId, type: reactivation/birthday/slow_day/favorite_back, guestId, sentAt, channel, status)
- [ ] MKT-7: DB-Migration via webdev_execute_sql

### Phase 2: KI-Bildanalyse & Post-Engine
- [ ] MKT-8: tRPC marketingRouter erstellen (server/routers/marketing.ts)
- [ ] MKT-9: analyzeAndGeneratePost Prozedur (Bild-URL → KI analysiert Gericht, generiert 4 Plattform-Texte + Hashtags)
- [ ] MKT-10: KI-Prompt: Gericht erkennen, appetitlich beschreiben, plattformspezifische Texte (Instagram kurz+Hashtags, Facebook länger, Google sachlich, TikTok trendy)
- [ ] MKT-11: savePost Prozedur (Post in DB speichern mit Status draft)
- [ ] MKT-12: approvePost Prozedur (Status → approved, scheduledAt setzen)
- [ ] MKT-13: rejectPost Prozedur (Status → rejected)
- [ ] MKT-14: listPosts Prozedur (alle Posts mit Filter: status, Datum)
- [ ] MKT-15: getMarketingStats Prozedur (Posts diese Woche, Plattformen verbunden, Bewertungen)

### Phase 3: Kellner-Kamera-Flow
- [ ] MKT-16: checkPhotoOpportunity Prozedur (orderId → KI entscheidet: letztes Posting des Produkts, Lagerbestand, MHD, Wetter-API, Relevanz-Score 0-100)
- [ ] MKT-17: Wetter-API Integration (OpenMeteo kostenlos, kein API-Key nötig) für Wetterkontext
- [ ] MKT-18: submitWaiterPhoto Prozedur (Bild hochladen, photo_request abschliessen)
- [ ] MKT-19: skipPhotoRequest Prozedur (Kellner überspringt, nur wenn Admin erlaubt)
- [ ] MKT-20: Frontend: WaiterPhotoPrompt.tsx – Vollbild-Overlay mit Kamera-Integration (kann nicht wegklicken wenn Admin es erzwingt)
- [ ] MKT-21: Frontend: KellnerDashboard.tsx – checkPhotoOpportunity bei Bestellabholung aufrufen
- [ ] MKT-22: Admin-Einstellung: Kellner-Kamera aktivieren/deaktivieren + Zwang-Modus

### Phase 4: Admin-Freigabe-Dashboard
- [ ] MKT-23: Frontend: AdminMarketing.tsx komplett neu (ersetzt Placeholder)
- [ ] MKT-24: Tab: Übersicht (Stats: Posts diese Woche, Reichweite, Bewertungen, verbundene Plattformen)
- [ ] MKT-25: Tab: Post-Warteschlange (pending_approval Posts: Vorschau aller 4 Plattform-Texte, Bearbeiten, Genehmigen, Ablehnen, Planen)
- [ ] MKT-26: Tab: Kalender (geplante Posts pro Tag/Woche, Drag-to-reschedule)
- [ ] MKT-27: Tab: Plattformen (OAuth-Verbindung für Instagram, Facebook, Google Business, TikTok)
- [ ] MKT-28: Tab: Einstellungen (Kellner-Kamera, Auto-Approve, Posting-Frequenz, Bewertungs-Booster)

### Phase 5: Multi-Plattform-Posting
- [ ] MKT-29: Instagram Graph API – publishPost (Beitrag), publishStory, publishReel
- [ ] MKT-30: Facebook Pages API – publishPost
- [ ] MKT-31: Google Business Profile API – createPost (Angebot/Neuigkeit)
- [ ] MKT-32: TikTok Content Posting API – publishVideo (aus Bild + Musik generiert)
- [ ] MKT-33: Heartbeat-Handler /api/scheduled/marketingPublish (alle 15 Min., approved+scheduledAt<=now → veröffentlichen)
- [ ] MKT-34: Handler in server/_core/index.ts registrieren

### Phase 6: Bewertungs-Booster
- [ ] MKT-35: triggerReviewRequest Prozedur (nach Kassen-Abschluss: SMS/WhatsApp mit Google-Bewertungslink)
- [ ] MKT-36: Twilio-Integration für SMS/WhatsApp (optional, graceful degradation wenn nicht konfiguriert)
- [ ] MKT-37: Negative Bewertungen abfangen: internes Feedback-Formular statt Google (1-3 Sterne)
- [ ] MKT-38: closeOrder in routers.ts – triggerReviewRequest aufrufen wenn Booster aktiviert
- [ ] MKT-39: Frontend: Bewertungs-Booster-Einstellungen in AdminMarketing

### Phase 7: Stammkunden-Marketing
- [ ] MKT-40: Heartbeat-Handler /api/scheduled/customerMarketing (täglich, Reaktivierung + Geburtstag prüfen)
- [ ] MKT-41: Reaktivierung: Stammkunde 30 Tage weg → WhatsApp/SMS
- [ ] MKT-42: Geburtstags-Gutschein: automatisch am Geburtstag
- [ ] MKT-43: Slow-Day-Aktion: Wenn Restaurant leer (Bestellungen < Schwellenwert) → Sofort-Push
- [ ] MKT-44: Handler in server/_core/index.ts registrieren

### Phase 8: Marketing-Report & Pricing
- [ ] MKT-45: Wöchentlicher Marketing-Report (Heartbeat montags 08:00, notifyOwner mit Zusammenfassung)
- [ ] MKT-46: marketing Modul in pricing.ts (CHF 49/Monat, Kategorie marketing)
- [ ] MKT-47: navConfig.ts – Marketing-Einträge (Übersicht, Posts, Plattformen, Bewertungen)
- [ ] MKT-48: TypeScript-Check (0 Fehler) + Vitest-Tests + Checkpoint

## Sprint: OAuth-Login für Social-Media-Plattformen

- [ ] Backend: marketingOAuth.ts – OAuth-Redirect-Routen für Meta, Google, TikTok
- [ ] Backend: OAuth-Callback-Handler mit Token-Speicherung in marketingPlatformConnections
- [ ] Backend: Token-Refresh-Logik für abgelaufene Tokens
- [ ] Frontend: Plattform-Verbindungs-UI mit zwei Optionen (OAuth-Button + manuelle Eingabe als Fallback)
- [ ] Frontend: Verbindungsstatus anzeigen (verbunden/getrennt/abgelaufen)
- [ ] Tests für OAuth-Routen schreiben

## PROD-SICHERHEIT: Kritische Produktionsanforderungen

- [x] PROD-1: Reserved Hosting aktivieren (kein Cold Start, immer aktiv) → Upgrade-Anfrage (Always-On)
- [x] PROD-2: Service Worker registrieren (Offline-Erkennung, Cache-First für statische Assets) → sw.js
- [x] PROD-3: IndexedDB Offline-Queue für Bestellungen (Bestellungen lokal speichern wenn kein Internet) → offlineQueue.ts
- [x] PROD-4: Sync-Mechanismus: Offline-Queue automatisch synchronisieren wenn Internet zurückkommt → useOfflineSync.ts
- [x] PROD-5: Offline-Banner im Kellner-Panel (sichtbarer Hinweis wenn offline, trotzdem arbeitsfähig) → OfflineBanner.tsx + KellnerDashboard
- [x] PROD-6: Drucker Offline-Warteschlange (Bons in IndexedDB puffern, automatisch wiederholen) → printerRetryCron.ts + /api/scheduled/printer-retry
- [x] PROD-7: Drucker-Heartbeat (alle 30s prüfen ob Drucker erreichbar, Warnung wenn nicht) → usePrinterHeartbeat.ts
- [x] PROD-8: Race Condition Fix: isPending-Guards auf allen kritischen Buttons (sendToKitchen, closeOrder, createInvoice)
- [x] PROD-9: Fehler-Monitoring: Kritische Server-Fehler → sofort Owner-Notification → errorMonitoring.ts
- [x] PROD-10: Health-Check Endpoint /api/health (DB-Verbindung, Drucker, Speicher) → erweitert mit DB-Latenz + Memory
- [x] PROD-11: Automatischer Reconnect bei Verbindungsabbruch (Polling-Intervall mit Backoff) → useAutoReconnect.ts
- [x] PROD-12: Kellner-Panel: Bestellung kann nicht doppelt abgeschickt werden → isPending-Guards auf sendToKitchen, closeOrder, createInvoice

## Single-Session-Enforcement (1 Login pro Account)

- [x] SSE-1: DB: active_sessions Tabelle (userId, deviceId, sessionToken, lastSeen, userAgent, ip)
- [x] SSE-2: DB-Migration via webdev_execute_sql
- [x] SSE-3: Backend: Login-Prozedur speichert deviceId + sessionToken in active_sessions (alte Session wird überschrieben)
- [x] SSE-4: Backend: Middleware prüft bei jedem Request ob deviceId mit aktiver Session übereinstimmt
- [x] SSE-5: Backend: Bei Konflikt → sessionConflict:true in auth.me Response
- [x] SSE-6: Backend: logout löscht Session aus active_sessions
- [x] SSE-7: Frontend: deviceId beim App-Start generieren und in localStorage speichern (UUID, persistent) → deviceId.ts
- [x] SSE-8: Frontend: deviceId bei Login-Request mitsenden (Login.tsx)
- [x] SSE-9: Frontend: Bei sessionConflict → automatischer Logout + Meldung auf Login-Seite (useAuth.ts + Login.tsx)
- [x] SSE-10: Frontend: x-device-id Header bei jedem Request (main.tsx), 30s Polling in useAuth
- [x] SSE-11: Vitest-Tests für Session-Konflikt-Logik → singleSession.test.ts (5 Tests)
- [x] SSE-12: Checkpoint + Deployment

## Admin-Offline-Queue (Bonieren + Abrechnen im Einzelbetrieb)

- [x] AOQ-1: Admin-Betrieb-Panel (Tischplan, Bestellungen, Kasse) identifizieren → OrderView.tsx (/admin/betrieb, /admin/order, /kellner/order)
- [x] AOQ-2: useOfflineSync und OfflineBanner in Admin-Betrieb-Tischplan einbauen → OrderView.tsx
- [x] AOQ-3: useOfflineSync und OfflineBanner in Admin-Betrieb-Bestellseite einbauen → OrderView.tsx
- [x] AOQ-4: addPendingOrder bei Netzwerkfehler in addItem.onError → OrderView.tsx
- [x] AOQ-5: Checkpoint + Deployment

## Offline-Bug-Fixes (2025-06-25)

- [ ] BUG-1: NOT_FOUND bei Wiederverbindung - Offline-Bestellung (negative ID) wird beim Server-Reload nicht gefunden
- [ ] BUG-2: Offline-Banner blockiert Unterkategorien im Menü - Banner zu gross, muss kompakter werden

## Session-Konflikt-Fix

- [x] Session-Konflikt: kein Logout mehr, stattdessen Sperrbildschirm "Du bist bereits auf einem anderen Gerät angemeldet" (SessionConflictOverlay + SessionConflictGate in App.tsx)

## Offline-Fixes

- [x] Tischplan-Daten im localStorage cachen: Waiter_tables.tsx + OrderView.tsx – offline zeigt gecachten Tischplan statt "Keine Tische konfiguriert"

## Offline-Sync-Fixes (2026-06-25)

- [x] offlineQueue.ts: addItemToPendingOrder – Items zu bestehender Offline-Bestellung hinzufügen statt neue erstellen
- [x] offlineQueue.ts: floorPlanObjectId + sourceType Felder in PendingOrder hinzugefügt
- [x] useOfflineSync.ts: korrekte Sync-Logik mit floorPlanObjectId/tableId je nach sourceType
- [x] OrderView.tsx: addItemToPendingOrder statt addPendingOrder verwenden (korrekte Tisch-Identifikation)
- [x] Waiter_tables.tsx: useOfflineSync mounten damit Sync auch ohne OrderView läuft
- [x] variantGroups/modifierGroups null-safe (Crash beim Menü-Render offline behoben)

## Bon-Drucker Integration (Epson TM-m30II)

- [x] epsonPrinter.ts: WebSocket-basierter ePOS-Print Client (Port 8008, CORS-frei)
- [x] useEpsonPrint.ts: Hook für Client-seitigen Druck (Drucker-Config aus DB laden)
- [x] AdminPrinters.tsx: Testdruck Client-seitig via WebSocket (statt Server TCP)
- [x] AdminPrinters.tsx: Status-Check Client-seitig via WebSocket (statt Server TCP)
- [x] OrderView.tsx: Küchenbon beim Bonieren automatisch drucken
- [ ] Drucker-Port in DB auf 8008 als Default ändern (aktuell 9100)

## Print-Agent (Lokaler Drucker-Proxy – löst HTTPS/Mixed-Content Problem)

- [x] Server: Print-Queue API (Druckaufträge erstellen + abholen via Polling)
- [x] Print-Agent HTML-Seite (pollt Server, druckt lokal via Epson ePOS SDK über HTTP)
- [x] SimplaPOS UI: Testdruck + automatischer Druck über Print-Queue
- [x] Admin-Drucker-Seite: Link zum Print-Agent + Anleitung für Gastronomen
- [x] Print-Agent entfernt: Server druckt direkt über TCP Port 9100 (wie QRARPA) – kein separater Tab nötig
- [ ] Marketing-Autopilot: Post-Bilder werden nicht angezeigt (zeigt "?" statt echtem Bild)
- [ ] Marketing-Autopilot: Lade-Indikator beim Foto/Video-Upload fehlt
- [ ] Marketing-Autopilot: Lade-Indikator beim Freigeben eines Posts fehlt

## KI-Chatbot Erweiterung (2026-06-28)
- [ ] chatbotRouter.ts: currentPage/pageContext als Input-Parameter hinzufügen
- [ ] chatbotRouter.ts: System-Prompt mit Seiten-Kontext erweitern (welche Seite der User gerade sieht)
- [ ] chatbotRouter.ts: Read-only-Regel im System-Prompt (keine Aktionen ausführen, nur erklären wo)
- [ ] chatbotRouter.ts: Störungs-/Ideen-Erkennung mit automatischer Superadmin-Benachrichtigung
- [ ] chatbotRouter.ts: Chat-Konversation automatisch in chat_conversations/chat_messages speichern
- [ ] chatbotRouter.ts: conversationId zurückgeben damit Frontend dieselbe Konversation weiterführt
- [ ] DB: messageType-Feld in chat_conversations (normal/stoerung/idee) + Migration
- [ ] AIChatWidget.tsx: currentPage (window.location.pathname) an chat-Mutation übergeben
- [ ] AIChatWidget.tsx: conversationId verwalten (neue Konversation starten oder bestehende weiterführen)
- [ ] Chat.tsx (Superadmin): Konversationen aller Restaurants anzeigen, nach Restaurant filtern
- [ ] Chat.tsx: Störungs- und Ideen-Konversationen visuell hervorheben (Badge/Farbe)
- [ ] Chat.tsx: Superadmin kann auf Konversationen antworten

## QRorpa Verkaufsstatistiken

- [x] QR-1: Alle 12.461 Bestellungen aus QRorpa extrahiert (Okt 2025 – Jul 2026, CHF 303.370,08)
- [x] QR-2: qrorpa_orders Tabelle in DB erstellt + Daten importiert
- [x] QR-3: qrorpaRouter.ts mit 7 Endpoints (getMonthlyOverview, getDailyReport, getMonthlyReport, getYearlyReport, getMitarbeiterReport, getAvailableMonths, getGesamtstatistik)
- [x] QR-4: QrorpaStatistiken.tsx – vollständiges Dashboard mit 5 Tabs (Übersicht, Tagesbericht, Monatsbericht, Jahresbericht, Mitarbeiter)
- [x] QR-5: Sidebar-Navigation "Verkaufsstatistiken" unter Gruppe "Statistiken" hinzugefügt
- [x] QR-6: recharts installiert für Diagramme (Bar, Line, Pie)

## Multi-Country-Architektur (Global Expansion)
- [ ] MC-1: DB-Schema: country_configs Tabelle (countryCode, name, currency, locale, taxRates JSON, complianceFlags JSON, pricingPlans JSON, isActive)
- [ ] MC-2: DB-Schema: contracts + restaurants Tabelle um countryCode erweitern (falls noch nicht vorhanden)
- [ ] MC-3: DB-Migration ausführen
- [ ] MC-4: countryConfigRouter.ts erstellen (getCountryConfig, listCountries, updateCountryConfig für Superadmin)
- [ ] MC-5: Seed-Daten für CH (Schweiz) und XK (Kosovo) einfügen
- [ ] MC-6: LandingPage.tsx: Länder-Detection (IP-Geolocation + manueller Switcher), länderspezifische Preise und Inhalte
- [ ] MC-7: OnboardingWizard.tsx: Land-Auswahl als erster Schritt, automatische Vorkonfiguration (Währung, MwSt., Sprache)
- [ ] MC-8: Superadmin: CountryConfigs-Verwaltungsseite (Preise, Steuer, Compliance pro Land editieren)
- [ ] MC-9: Superadmin: Sidebar-Navigation "Länder & Preise" hinzufügen
- [ ] MC-10: Tests + Checkpoint
