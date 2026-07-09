# SimplaPOS Web-App

**Version:** Aktuell (Checkpoint 2b50b67a)  
**Deployed:** https://simplapos.com  
**Stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL/TiDB

---

## Übersicht

SimplaPOS ist ein vollständiges Restaurant-POS-System (Point of Sale) für die Gastronomie. Die Web-App enthält:

| Modul | Beschreibung |
|---|---|
| **POS / Kasse** | Bestellaufnahme, Tischplan, Zahlungsabwicklung |
| **Küche (KDS)** | Küchenbildschirm mit Echtzeit-Updates |
| **Drucker** | Bon- und Küchendrucker via Local Connect |
| **Local Connect** | Hardware-Gateway für Android-App |
| **Admin** | Restaurantverwaltung, Benutzer, Einstellungen |
| **Superadmin** | Mandantenverwaltung, Verträge, Rechnungen |

---

## Architektur

```
Browser (React 19 + Vite)
    │
    │  tRPC (HTTPS)
    ▼
Express 4 Server (Node.js)
    │
    ├── Drizzle ORM → MySQL/TiDB (Datenbank)
    ├── localConnectRouter → Job-Queue für Drucker
    └── printerRouter → Drucker-Konfiguration

SimplaPOS Local Connect (Android App)
    │  pollt alle 2 Sek.
    └── Drucker (Epson ePOS-Print, LAN)
```

---

## Lokale Entwicklung

```bash
# Repository klonen
git clone https://github.com/simplapos-cyber/simplapos-webapp.git
cd simplapos-webapp

# Abhängigkeiten installieren
pnpm install

# Entwicklungsserver starten
pnpm dev
```

**Voraussetzungen:**
- Node.js 22+
- pnpm 9+
- MySQL/TiDB-Datenbank (Connection String als `DATABASE_URL`)

---

## Deployment

Die App läuft auf der Manus-Hosting-Plattform und wird automatisch deployed.

**Produktions-URL:** https://simplapos.com  
**Staging-URL:** https://simplasuper-jsuigv5j.manus.space

---

## Projektstruktur

```
simplapos-webapp/
├── client/                          # React 19 Frontend (Vite)
│   └── src/
│       ├── pages/                   # Seiten (POS, Küche, Admin, etc.)
│       ├── components/              # Wiederverwendbare UI-Komponenten
│       └── App.tsx                  # Routing
├── server/                          # Express 4 Backend
│   ├── routers.ts                   # tRPC Router-Registrierung
│   ├── localConnectRouter.ts        # Local Connect Job-Queue (publicProcedure!)
│   ├── printerRouter.ts             # Drucker-Verwaltung
│   ├── db.ts                        # Drizzle Query-Helpers
│   └── _core/                       # Framework-Infrastruktur
├── drizzle/
│   └── schema.ts                    # Datenbankschema
└── shared/                          # Geteilte Typen und Konstanten
```

---

## Local Connect Integration

### Kritischer Fix (Checkpoint 2b50b67a)

`localConnectRouter.ts` – Die Prozeduren `getPendingJobs`, `confirmJob` und `registerDevice` sind als **`publicProcedure`** definiert (nicht `protectedProcedure`).

**Warum:** Die Android-App sendet keine Browser-Session-Cookies. Authentifizierung erfolgt über `deviceToken`-Hash-Validierung im Request-Body.

### Datenbankschema (Local Connect)

```sql
-- Registrierte Geräte
local_connect_devices (id, restaurantId, deviceId, deviceToken, name, localIp, appVersion, lastSeen)

-- Job-Queue für Druckaufträge
local_connect_jobs (id, restaurantId, deviceId, type, payload, status, createdAt, completedAt)

-- Einmal-Tokens für Geräte-Onboarding
local_connect_onboarding_tokens (id, restaurantId, token, used, expiresAt)
```

### Job-Typen

| Typ | Payload | Beschreibung |
|---|---|---|
| `print_receipt` | `{ printerIp, xml, authUsername, authPassword }` | Bon drucken |
| `print_kitchen` | `{ printerIp, xml, authUsername, authPassword }` | Küchenbon drucken |
| `open_drawer` | `{ printerIp, authUsername, authPassword }` | Kassenschublade öffnen |

---

## Drucker-Konfiguration

Drucker werden in der Admin-Oberfläche konfiguriert:

| Feld | Beschreibung |
|---|---|
| `name` | Anzeigename (z.B. "Thekenbon") |
| `ip` | Drucker-IP im LAN (z.B. `192.168.178.89`) |
| `type` | `receipt` oder `kitchen` |
| `authUsername` | HTTP Basic Auth Benutzername (Standard: `epson`) |
| `authPassword` | HTTP Basic Auth Passwort |

**Unterstützte Drucker:** Epson TM-Serie mit ePOS-Print (HTTP)

---

## Umgebungsvariablen

| Variable | Beschreibung |
|---|---|
| `DATABASE_URL` | MySQL/TiDB Connection String |
| `JWT_SECRET` | Session-Cookie Signing Secret |
| `VITE_APP_ID` | OAuth Application ID |
| `OAUTH_SERVER_URL` | OAuth Backend URL |
| `STRIPE_SECRET_KEY` | Stripe API Key (Zahlungen) |

---

## Technologie-Stack

| Technologie | Version | Zweck |
|---|---|---|
| React | 19 | Frontend Framework |
| Tailwind CSS | 4 | Styling |
| Vite | 6 | Build-Tool |
| Express | 4 | HTTP Server |
| tRPC | 11 | Type-safe API |
| Drizzle ORM | 0.x | Datenbankzugriff |
| MySQL/TiDB | – | Datenbank |
| TypeScript | 5.x | Typsicherheit |

---

## Lizenz

Proprietär – SimplaPOS © 2024. Alle Rechte vorbehalten.
