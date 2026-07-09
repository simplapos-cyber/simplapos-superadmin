/**
 * menuImportRoute.ts – KI-Speisekarten-Import
 *
 * POST /api/menu/import-analyze  → Datei hochladen + LLM analysieren → Vorschau zurückgeben
 * POST /api/menu/import-confirm  → Bestätigte Produkte in DB importieren
 * GET  /api/menu/import-logs     → Import-Protokoll abrufen
 *
 * Strategie für PDFs:
 * 1. Versuche Text-Extraktion via pdf-parse (schnell, für Text-PDFs)
 * 2. Falls Text < 50 Zeichen (bildbasiertes/gescanntes PDF):
 *    → Konvertiere jede Seite mit pdftoppm zu PNG (kein npm-Paket nötig, poppler-utils ist vorinstalliert)
 *    → Lade alle Seiten-PNGs zu S3 hoch
 *    → Sende alle Bilder als Vision-Request an LLM
 */

import { Router } from "express";
import multer from "multer";
import * as path from "path";
import * as crypto from "crypto";
// Statischer Top-Level-Import von pdf-parse@2.x (ESM-Export)
// Wichtig: Statischer Import wird von esbuild korrekt aufgelöst,
// dynamischer import() kann im Deployment-Bundle anders verhalten.
import { PDFParse } from "pdf-parse";

/**
 * Extrahiert Text aus einem PDF-Buffer via pdf-parse@2.x.
 * Gibt leeren String zurück wenn die Extraktion fehlschlägt.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    console.log("[MenuImport] Starte PDF-Text-Extraktion, Buffer-Größe:", buffer.length);
    const uint8 = new Uint8Array(buffer);
    // PDFParse@2.x: getText() lädt das Dokument intern und gibt TextResult zurück
    // load() ist eine private Methode und darf nicht direkt aufgerufen werden
    const parser = new PDFParse(uint8);
    const result = await parser.getText();
    await parser.destroy().catch(() => {});
    const text = result?.text?.trim() ?? "";
    console.log("[MenuImport] PDF-Text-Extraktion erfolgreich, Länge:", text.length);
    return text;
  } catch (e: any) {
    console.error("[MenuImport] pdf-parse Fehler:", e.message, e.stack?.slice(0, 300));
    return "";
  }
}
import { storagePut, storageGetSignedUrl } from "./storage";
import { sdk } from "./_core/sdk";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { getDb } from "./db";
import { menuCategories, menuItems, menuImportLogs, menuTopCategories } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface ImportedMenuItem {
  name: string;
  description?: string;
  price: string;
  topCategory: string;   // Oberkategorie (z.B. "GETRÄNKE", "ESSEN", "DESSERTS") – GROSSBUCHSTABEN
  category: string;      // Unterkategorie (z.B. "Flaschengetränke", "Warme Getränke")
  itemType: "food" | "beverage" | "dessert" | "set_menu" | "other";
  allergens?: string[];  // Kurzschlüssel: "gluten", "milch", "eier", etc.
  labels?: string[];     // "vegan", "vegetarisch", "scharf", "bio", "alkohol", etc.
  kitchenStation?: string; // "Küche", "Bar", "Grill", etc.
  taxClassId?: number | null;
  duplicateAction?: "skip" | "overwrite" | "new";
  // Nährwerte (optional, KI-extrahiert)
  calories?: number | null;     // kcal
  protein?: number | null;      // g
  carbs?: number | null;        // g
  fat?: number | null;          // g
  saturatedFat?: number | null; // g
  sugar?: number | null;        // g
  fiber?: number | null;        // g
  salt?: number | null;         // g
  // Extras/Varianten (optional, KI-extrahiert)
  extras?: Array<{
    groupName: string;       // z.B. "Beilagen", "Saucen", "Grösse"
    selectionType: "single" | "multiple"; // single=Pflichtauswahl, multiple=Mehrfach
    isRequired: boolean;
    options: Array<{
      name: string;
      priceAdjustment: string; // z.B. "0.00", "2.50", "-1.00"
    }>;
  }>;
}

export interface ImportAnalysisResult {
  items: ImportedMenuItem[];
  rawText?: string;
  warning?: string;
  detectedLanguage?: string;
}

// ─── Multer-Konfiguration ────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Nur PDF oder Bilder (JPEG, PNG, WEBP) erlaubt"));
    }
  },
});

// ─── Auth-Middleware ─────────────────────────────────────────────────────────

async function requireAdmin(req: any, res: any, next: any) {
  try {
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) return res.status(401).json({ error: "Nicht angemeldet" });
    if (user.role !== "admin" && user.role !== "superadmin") {
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Nicht angemeldet" });
  }
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Bereinigt einen Dateinamen zu einem ASCII-sicheren S3-Key.
 * Ersetzt Umlaute, Sonderzeichen und Leerzeichen.
 */
function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")                          // Umlaute in Basis + Kombinator zerlegen
    .replace(/[\u0300-\u036f]/g, "")           // Kombinatoren entfernen (ä→a, ö→o, ü→u)
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-zA-Z0-9._-]/g, "_")         // Alles andere → Unterstrich
    .replace(/_+/g, "_")                       // Mehrfache Unterstriche zusammenfassen
    .replace(/^_|_$/g, "")                     // Führende/abschliessende Unterstriche
    .toLowerCase()
    .slice(0, 80);                             // Max. 80 Zeichen
}

/**
 * Lädt ein PDF zu S3 hoch und gibt eine signierte URL zurück,
 * die direkt als file_url an das LLM gesendet werden kann.
 * Kein System-Binary (pdftoppm) nötig – funktioniert im Cloud-Run-Deployment.
 */
async function uploadPdfForLLM(
  pdfBuffer: Buffer,
  restaurantId: number,
  uniqueId: string,
  safeBase: string
): Promise<string> {
  const key = `menu-imports/${restaurantId}/${uniqueId}-${safeBase}.pdf`;
  const { key: storedKey } = await storagePut(key, pdfBuffer, "application/pdf");
  // Signierte URL generieren (damit das LLM direkt auf die Datei zugreifen kann)
  const signedUrl = await storageGetSignedUrl(storedKey);
  return signedUrl;
}

// ─── LLM-Analyse ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist ein Experte für die strukturierte Analyse von Restaurantspeisekarten.
Deine Aufgabe: Extrahiere ALLE Produkte und gib sie als JSON zurück.

═══════════════════════════════════════════════════════
 HIERARCHIE-REGELN (SEHR WICHTIG)
═══════════════════════════════════════════════════════

Eine Speisekarte hat DREI Ebenen:

  EBENE 1 – topCategory (Oberkategorie)
  ─────────────────────────────────────
  Das ist die HAUPTGRUPPE der Karte, immer in GROSSBUCHSTABEN.
  Beispiele: "GETRÄNKE", "ESSEN", "SPEISEN", "WEINE", "BIER",
             "DESSERTS", "COCKTAILS", "SPIRITUOSEN", "SNACKS"
  
  Erkennungsmerkmal: Grosser, fetter Titel ganz oben auf einer Seite
  oder Abschnitt. Meist nur 1–5 Oberkategorien pro Speisekarte.

  EBENE 2 – category (Unterkategorie)
  ─────────────────────────────────────
  Das sind die UNTERGRUPPEN innerhalb einer Oberkategorie.
  Beispiele unter "GETRÄNKE": "Flaschengetränke", "Warme Getränke",
                               "Säfte", "Bier vom Fass"
  Beispiele unter "ESSEN":    "Vorspeisen", "Hauptspeisen",
                               "Salate", "Pasta", "Fleischgerichte"
  
  Erkennungsmerkmal: Mittelgrosser, fetter Titel UNTER der Oberkategorie.
  Falls keine Unterkategorie erkennbar: category = topCategory

  EBENE 3 – name (Produkt)
  ─────────────────────────────────────
  Das sind die einzelnen Speisen/Getränke mit Preis.

═══════════════════════════════════════════════════════
 AUTOMATISCHE OBERKATEGORIE-ABLEITUNG (SEHR WICHTIG)
═══════════════════════════════════════════════════════

Wenn auf der Karte KEINE explizite Oberkategorie steht, leite sie aus dem Inhalt ab:

  Kategorie-Titel auf der Karte          → topCategory (abgeleitet)
  ─────────────────────────────────────────────────────────────────
  GIN, RUM, WHISKY, VODKA, TEQUILA,
  COGNAC, GRAPPA, SCHNAPS, KAFFEE SCHNAPS,
  APERITIF, DIGESTIF, LIKÖR              → "SPIRITUOSEN"

  WEIN, ROTWEIN, WEISSWEIN, ROSÉ,
  PROSECCO, CHAMPAGNER, SEKT            → "WEINE"

  BIER, BIER VOM FASS, FLASCHENBIER     → "BIER"

  COCKTAILS, LONGDRINKS, MOCKTAILS      → "COCKTAILS"

  KAFFEE, ESPRESSO, TEE, HEISSGETRÄNKE  → "WARME GETRÄNKE"

  SÄFTE, SOFTDRINKS, MINERALWASSER      → "GETRÄNKE"

  VORSPEISEN, HAUPTSPEISEN, SALATE,
  PASTA, PIZZA, FLEISCH, FISCH          → "SPEISEN"

  DESSERTS, KUCHEN, GLACE               → "DESSERTS"

Regel: topCategory und category dürfen NICHT identisch sein.
Wenn der Titel auf der Karte z.B. "GIN" ist:
  → topCategory = "SPIRITUOSEN", category = "Gin"
Wenn der Titel "RUM / Cognac" ist:
  → topCategory = "SPIRITUOSEN", category = "Rum / Cognac"
Wenn der Titel "KAFFEE SCHNAPS" ist:
  → topCategory = "SPIRITUOSEN", category = "Kaffee Schnaps"

═══════════════════════════════════════════════════════
 KONKRETES BEISPIEL
═══════════════════════════════════════════════════════

Speisekarte:
  GETRÄNKE                          ← topCategory = "GETRÄNKE"
    FLASCHENGETRÄNKE                ← category = "Flaschengetränke"
      Mineral mit/ohne Gas  6.00   ← Produkt
      Coca Cola / Zero      5.90   ← Produkt
    WARME GETRÄNKE                  ← category = "Warme Getränke"
      Espresso              4.90   ← Produkt
      Cappuccino            5.80   ← Produkt
  ESSEN                             ← topCategory = "ESSEN"
    HAUPTSPEISEN                    ← category = "Hauptspeisen"
      Züri-Geschnetzeltes  28.50   ← Produkt

Spiritosen-Karte (OHNE explizite Oberkategorie):
  GIN                               ← topCategory = "SPIRITUOSEN", category = "Gin"
    Bombay Saphire  9.50           ← Produkt
    Hendricks       12.00          ← Produkt
  RUM / Cognac                      ← topCategory = "SPIRITUOSEN", category = "Rum / Cognac"
    Bacardi         8.50           ← Produkt
  KAFFEE SCHNAPS                    ← topCategory = "SPIRITUOSEN", category = "Kaffee Schnaps"
    Coretto Grappa  6.50           ← Produkt

═══════════════════════════════════════════════════════
 FELDER-REGELN
═══════════════════════════════════════════════════════

- name: Produktname auf DEUTSCH
- description: Beschreibung falls vorhanden, sonst null
- price: Nur Zahl ohne Währung ("6.00", "28.50"). Bei mehreren Preisen (z.B. "3dl 4.80 / 5dl 6.50"): kleinsten nehmen. Kein Preis → "0.00"
- topCategory: OBERKATEGORIE in GROSSBUCHSTABEN ("GETRÄNKE", "ESSEN", "DESSERTS", etc.)
- category: Unterkategorie in normaler Schreibweise ("Flaschengetränke", "Hauptspeisen", etc.)
- itemType: "beverage" für Getränke, "food" für Speisen, "dessert" für Desserts, "other" für sonstiges
- allergens: Array mit KURZSCHLÜSSELN (Kleinbuchstaben!) aus dieser Liste:
    "gluten", "krebstiere", "eier", "fisch", "erdnuesse", "soja",
    "milch", "nuesse", "sellerie", "senf", "sesam",
    "schwefeldioxid", "lupinen", "weichtiere"
  Falls keine Allergene erkennbar: []
- labels: Array mit Kurzschlüsseln falls erkennbar:
    "vegan", "vegetarisch", "scharf", "bio", "alkohol", "glutenfrei", "laktosefrei"
  Falls keine Labels erkennbar: []
- kitchenStation: "Bar" für Getränke, "Küche" für Speisen, "Patisserie" für Desserts
- calories, protein, carbs, fat: Nur wenn auf der Karte angegeben, sonst null
- extras: Nur wenn auf der Karte explizit Extras/Beilagen/Optionen aufgeführt sind, sonst []

═══════════════════════════════════════════════════════
 MEHRSPRACHIGKEIT
═══════════════════════════════════════════════════════

- Erkenne die Sprache der Speisekarte
- Übersetze ALLE Namen, Beschreibungen und Kategorien auf DEUTSCH
- Gib im Feld "detectedLanguage" den ISO-639-1-Code an ("de", "fr", "it", "en")

═══════════════════════════════════════════════════════
 AUSGABE-FORMAT (NUR JSON, KEIN MARKDOWN)
═══════════════════════════════════════════════════════

{
  "detectedLanguage": "de",
  "items": [
    {
      "name": "Mineral mit/ohne Gas",
      "description": null,
      "price": "6.00",
      "topCategory": "GETRÄNKE",
      "category": "Flaschengetränke",
      "itemType": "beverage",
      "allergens": [],
      "labels": [],
      "kitchenStation": "Bar",
      "calories": null,
      "protein": null,
      "carbs": null,
      "fat": null,
      "extras": []
    },
    {
      "name": "Espresso",
      "description": null,
      "price": "4.90",
      "topCategory": "GETRÄNKE",
      "category": "Warme Getränke",
      "itemType": "beverage",
      "allergens": ["milch"],
      "labels": [],
      "kitchenStation": "Bar",
      "calories": null,
      "protein": null,
      "carbs": null,
      "fat": null,
      "extras": []
    },
    {
      "name": "Züri-Geschnetzeltes",
      "description": "Mit Rösti und Rahmsauce",
      "price": "28.50",
      "topCategory": "ESSEN",
      "category": "Hauptspeisen",
      "itemType": "food",
      "allergens": ["gluten", "milch"],
      "labels": [],
      "kitchenStation": "Küche",
      "calories": null,
      "protein": null,
      "carbs": null,
      "fat": null,
      "extras": [
        {
          "groupName": "Beilage",
          "selectionType": "single",
          "isRequired": true,
          "options": [
            { "name": "Rösti", "priceAdjustment": "0.00" },
            { "name": "Pommes", "priceAdjustment": "0.00" }
          ]
        }
      ]
    }
  ]
}

Gib NUR das JSON-Objekt zurück. Kein Markdown, kein Text davor oder danach.`

async function analyzeMenuWithLLM(
  input: { type: "text"; text: string } | { type: "images"; urls: string[] } | { type: "pdf"; url: string }
): Promise<{ items: ImportedMenuItem[]; detectedLanguage?: string }> {
  let userContent: any;

  if (input.type === "text") {
    userContent = input.text;
  } else if (input.type === "images") {
    // Mehrere Bilder als Vision-Content
    userContent = input.urls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }));
    // Texthinweis voranstellen
    userContent = [
      { type: "text" as const, text: "Analysiere dieses Foto einer Speisekarte sorgfältig. Erkenne die Hierarchie: Grosser fetter Titel = topCategory (GROSSBUCHSTABEN), mittlerer fetter Titel = category (normale Schreibweise), einzelne Zeilen mit Preis = Produkte. Extrahiere ALLE Produkte mit korrekter topCategory und category:" },
      ...userContent,
    ];
  } else {
    // PDF direkt als file_url senden
    userContent = [
      { type: "text" as const, text: "Analysiere diese Speisekarte (PDF) und extrahiere alle Produkte:" },
      {
        type: "file_url" as const,
        file_url: { url: input.url, mime_type: "application/pdf" as const },
      },
    ];
  }

  // JSON-Parsing-Hilfsfunktion
  const tryParseJson = (raw: unknown): any => {
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    // 1. Markdown-Codeblock extrahieren
    const codeBlock = rawStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) return JSON.parse(codeBlock[1].trim());
    // 2. Erstes vollständiges JSON-Objekt extrahieren
    const objMatch = rawStr.match(/(\{[\s\S]*\})/);
    if (objMatch) return JSON.parse(objMatch[1].trim());
    // 3. Direkt parsen
    return JSON.parse(rawStr.trim());
  };

  // Hilfsfunktion: Einzelnen LLM-Aufruf mit großem Token-Budget
  const callLLM = async (content: any) => {
    const resp = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      max_tokens: 12000, // Großes Budget für umfangreiche Speisekarten
    });
    const finishReason = resp?.choices?.[0]?.finish_reason;
    const raw = resp?.choices?.[0]?.message?.content ?? "";
    // Warnung wenn abgeschnitten
    if (finishReason === "length") {
      console.warn("[MenuImport] LLM-Antwort wurde abgeschnitten (finish_reason=length)");
    }
    return raw;
  };

  // Erster Versuch
  let raw = await callLLM(userContent);
  let parsed: any;

  try {
    parsed = tryParseJson(raw);
  } catch {
    // Zweiter Versuch: Expliziter JSON-Hinweis
    try {
      const retryContent = Array.isArray(userContent)
        ? [...userContent, { type: "text" as const, text: "Antworte NUR mit dem JSON-Objekt. Kein Markdown, kein Text davor oder danach." }]
        : userContent + "\n\nAntworte NUR mit validem JSON. Kein Markdown, kein Text davor oder danach.";
      const retryResp = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nWICHTIG: Antworte AUSSCHLIESSLICH mit validem JSON. Kein Markdown, kein Text davor oder danach." },
          { role: "user", content: retryContent },
        ],
        max_tokens: 12000,
        response_format: input.type === "text" ? { type: "json_object" as const } : undefined,
      });
      const retryRaw = retryResp?.choices?.[0]?.message?.content ?? "";
      parsed = tryParseJson(retryRaw);
    } catch {
      throw new Error("LLM hat kein gültiges JSON zurückgegeben");
    }
  }

  const VALID_ALLERGEN_KEYS = new Set(["gluten","krebstiere","eier","fisch","erdnuesse","soja","milch","nuesse","sellerie","senf","sesam","schwefeldioxid","lupinen","weichtiere"]);
  const VALID_LABEL_KEYS = new Set(["vegan","vegetarisch","scharf","bio","alkohol","glutenfrei","laktosefrei","neu","bestseller"]);
  const VALID_ITEM_TYPES = new Set(["food","beverage","dessert","set_menu","other"]);

  const items: ImportedMenuItem[] = (parsed.items ?? [])
    .map((item: any) => ({
      name: String(item.name ?? "").trim(),
      description: item.description ? String(item.description).trim() : undefined,
      price:
        String(item.price ?? "0.00")
          .replace(/[^0-9.,]/g, "")
          .replace(",", ".") || "0.00",
      topCategory: String(item.topCategory ?? item.category ?? "SONSTIGES").trim().toUpperCase(),
      category: String(item.category ?? item.topCategory ?? "Allgemein").trim(),
      itemType: (VALID_ITEM_TYPES.has(item.itemType) ? item.itemType : "food") as ImportedMenuItem["itemType"],
      // Allergene: nur gültige Kurzschlüssel durchlassen
      allergens: Array.isArray(item.allergens)
        ? item.allergens.map(String).filter((a: string) => VALID_ALLERGEN_KEYS.has(a.toLowerCase())).map((a: string) => a.toLowerCase())
        : [],
      // Labels: nur gültige Kurzschlüssel durchlassen
      labels: Array.isArray(item.labels)
        ? item.labels.map(String).filter((l: string) => VALID_LABEL_KEYS.has(l.toLowerCase())).map((l: string) => l.toLowerCase())
        : [],
      kitchenStation: item.kitchenStation ? String(item.kitchenStation).trim() : undefined,
      // Nährwerte: nur wenn als Zahl vorhanden
      calories: (typeof item.calories === "number" && !isNaN(item.calories)) ? item.calories : null,
      protein: (typeof item.protein === "number" && !isNaN(item.protein)) ? item.protein : null,
      carbs: (typeof item.carbs === "number" && !isNaN(item.carbs)) ? item.carbs : null,
      fat: (typeof item.fat === "number" && !isNaN(item.fat)) ? item.fat : null,
      saturatedFat: (typeof item.saturatedFat === "number" && !isNaN(item.saturatedFat)) ? item.saturatedFat : null,
      sugar: (typeof item.sugar === "number" && !isNaN(item.sugar)) ? item.sugar : null,
      fiber: (typeof item.fiber === "number" && !isNaN(item.fiber)) ? item.fiber : null,
      salt: (typeof item.salt === "number" && !isNaN(item.salt)) ? item.salt : null,
      // Extras: nur wenn gültig strukturiert
      extras: Array.isArray(item.extras)
        ? item.extras
            .filter((e: any) => e && typeof e.groupName === "string" && Array.isArray(e.options))
            .map((e: any) => ({
              groupName: String(e.groupName).trim(),
              selectionType: e.selectionType === "single" ? "single" : "multiple",
              isRequired: Boolean(e.isRequired),
              options: e.options
                .filter((o: any) => o && typeof o.name === "string")
                .map((o: any) => ({
                  name: String(o.name).trim(),
                  priceAdjustment: String(o.priceAdjustment ?? "0.00").replace(/[^0-9.,-]/g, "") || "0.00",
                })),
            }))
        : [],
    }))
    .filter((item: ImportedMenuItem) => item.name.length > 0);

  const detectedLanguage =
    typeof parsed.detectedLanguage === "string"
      ? parsed.detectedLanguage.toLowerCase().slice(0, 5)
      : undefined;

  return { items, detectedLanguage };
}

// ─── KI-Produktbild generieren (non-blocking, best-effort) ───────────────────

async function generateProductImageSafe(
  restaurantId: number,
  itemId: number,
  itemName: string,
  description: string | undefined
): Promise<void> {
  try {
    const prompt = description
      ? `Professionelles Restaurantfoto von "${itemName}": ${description}. Appetitlich, weißer Teller, Draufsicht, heller Hintergrund, keine Menschen.`
      : `Professionelles Restaurantfoto von "${itemName}". Appetitlich, weißer Teller, Draufsicht, heller Hintergrund, keine Menschen.`;

    const { url: imageUrl } = await generateImage({ prompt });

    // Bild zu S3 hochladen
    const imgResp = await fetch(imageUrl as string);
    const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
    const key = `menu-items/${restaurantId}/${itemId}-ai.jpg`;
    const { url: storedUrl } = await storagePut(key, imgBuffer, "image/jpeg");

    // In DB speichern
    const db = await getDb();
    await db
      .update(menuItems)
      .set({ imageUrl: storedUrl })
      .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, restaurantId)));
  } catch (err: any) {
    // Fehler beim Bildgenerieren soll den Import nicht blockieren
    console.warn(`[MenuImport] Produktbild für "${itemName}" fehlgeschlagen:`, err.message);
  }
}

// ─── Route-Registrierung ─────────────────────────────────────────────────────

export function registerMenuImportRoute(app: ReturnType<typeof Router>) {
  /**
   * POST /api/menu/import-analyze
   * Lädt PDF oder Bild hoch, analysiert mit LLM, gibt Vorschau zurück.
   * Erkennt auch Duplikate (Produkte mit gleichem Namen, die bereits existieren).
   * Body: multipart/form-data mit Feld "file"
   */
  (app as any).post(
    "/api/menu/import-analyze",
    requireAdmin,
    upload.single("file"),
    async (req: any, res: any) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Keine Datei hochgeladen" });
        }

        const { mimetype, buffer, originalname } = req.file;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return res.status(400).json({ error: "Kein Restaurant zugewiesen" });
        }

        // ASCII-sicherer S3-Key
        const safeBase = sanitizeFilename(
          path.basename(originalname, path.extname(originalname))
        );
        const uniqueId = crypto.randomBytes(6).toString("hex");

        let items: ImportedMenuItem[] = [];
        let rawText: string | undefined;
        let warning: string | undefined;
        let detectedLanguage: string | undefined;

        if (mimetype === "application/pdf") {
          // ── Schritt 1: Text-Extraktion versuchen ──────────────────────────
          let textExtracted = false;
          try {
            rawText = await extractPdfText(buffer);
            if ((rawText ?? "").length >= 50) {
              textExtracted = true;
              const result = await analyzeMenuWithLLM({ type: "text", text: rawText ?? "" });
              items = result.items;
              detectedLanguage = result.detectedLanguage;
            }
          } catch {
            // Text-Extraktion fehlgeschlagen → weiter zu PDF-Vision-Analyse
          }

          // ── Schritt 2: Fallback für bildbasierte PDFs ──────────────────────
          // Falls Text-Extraktion fehlschlägt (gescanntes/bildbasiertes PDF),
          // wird eine klare Fehlermeldung mit Hinweis auf Foto-Upload angezeigt.
          // Hinweis: file_url mit application/pdf wird vom Forge-Proxy nicht unterstützt,
          // und pdfjs-dist/canvas sind keine direkten Abhängigkeiten.
          if (!textExtracted || items.length === 0) {
            const hasText = (rawText ?? "").length >= 50;
            if (!hasText) {
              return res.status(422).json({
                error:
                  "Dieses PDF enthält keinen lesbaren Text (gescanntes Dokument). " +
                  "Bitte machen Sie ein Foto der Speisekarte und laden Sie es als JPG oder PNG hoch.",
              });
            }
            // Text vorhanden, aber LLM hat keine Produkte erkannt
            return res.status(422).json({
              error:
                "Keine Produkte erkannt. Bitte prüfen Sie, ob die Datei eine lesbare Speisekarte enthält.",
            });
          }
        } else {
          // ── Bild direkt hochladen und analysieren ─────────────────────────
          const ext = mimetype.split("/")[1] ?? "jpg";
          const key = `menu-imports/${restaurantId}/${uniqueId}-${safeBase}.${ext}`;
          const imgStorage = await storagePut(key, buffer, mimetype);
          const imgUrl: string = imgStorage.url;
          const absoluteUrl = imgUrl.startsWith("http")
            ? imgUrl
            : `https://simplapos.com${imgUrl}`;

          const result = await analyzeMenuWithLLM({ type: "images", urls: [absoluteUrl] });
          items = result.items;
          detectedLanguage = result.detectedLanguage;
        }

        if (items.length === 0) {
          return res.status(422).json({
            error:
              "Keine Produkte erkannt. Bitte prüfen Sie, ob die Datei eine lesbare Speisekarte enthält.",
          });
        }

        // ── Duplikat-Erkennung: bestehende Produktnamen laden ────────────────
        const db = await getDb();
        const existingItems = await db
          .select({ name: menuItems.name })
          .from(menuItems)
          .where(eq(menuItems.restaurantId, restaurantId));
        const existingNames = new Set(existingItems.map((i: { name: string }) => i.name.toLowerCase().trim()));

        // Duplikate markieren
        const itemsWithDuplicates = items.map((item) => ({
          ...item,
          isDuplicate: existingNames.has(item.name.toLowerCase().trim()),
          duplicateAction: existingNames.has(item.name.toLowerCase().trim())
            ? ("skip" as const)
            : undefined,
        }));

        const result: ImportAnalysisResult & { items: typeof itemsWithDuplicates } = {
          items: itemsWithDuplicates,
          rawText,
          warning,
          detectedLanguage,
          fileName: originalname,
          fileType: mimetype,
          fileSizeBytes: buffer.length,
        } as any;
        return res.json(result);
      } catch (err: any) {
        console.error("[MenuImport] Analyse-Fehler:", err.message);
        return res.status(500).json({ error: err.message || "Analyse fehlgeschlagen" });
      }
    }
  );

  /**
   * POST /api/menu/import-confirm
   * Importiert bestätigte Produkte in die DB.
   * Unterstützt duplicateAction: "skip" | "overwrite" | "new"
   * Generiert nach dem Import asynchron KI-Bilder für Speisen.
   * Body: JSON { items: ImportedMenuItem[], fileName, fileType, fileSizeBytes, detectedLanguage, generateImages }
   */
  (app as any).post(
    "/api/menu/import-confirm",
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return res.status(400).json({ error: "Kein Restaurant zugewiesen" });
        }

        const {
          items,
          fileName = "Unbekannt",
          fileType = "application/pdf",
          fileSizeBytes,
          detectedLanguage,
          generateImages = false,
        } = req.body ?? {};

        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Keine Produkte zum Importieren" });
        }

        const db = await getDb();

        // ── Schritt 1: Oberkategorien (menu_top_categories) anlegen ─────────────
        const topCategoryMap = new Map<string, number>(); // name.lower → id
        const existingTopCats = await db
          .select()
          .from(menuTopCategories)
          .where(eq(menuTopCategories.restaurantId, restaurantId));
        for (const tc of existingTopCats) {
          topCategoryMap.set(tc.name.toLowerCase(), tc.id);
        }

        // Eindeutige Oberkategorien aus den importierten Items sammeln
        const uniqueTopCategories = Array.from(
          new Set((items as ImportedMenuItem[]).map((i) => (i.topCategory || i.category).toUpperCase()))
        );
        // Icon-Mapping für bekannte Oberkategorien
        const topCatIconMap: Record<string, string> = {
          "GETRÄNKE": "coffee",
          "ESSEN": "utensils",
          "SPEISEN": "utensils",
          "DESSERTS": "cake",
          "DESSERT": "cake",
          "WEINE": "wine",
          "WEIN": "wine",
          "BIER": "beer",
          "COCKTAILS": "glass-water",
          "SPIRITUOSEN": "flask-conical",
          "SNACKS": "sandwich",
        };
        for (let idx = 0; idx < uniqueTopCategories.length; idx++) {
          const tcName = uniqueTopCategories[idx];
          const key = tcName.toLowerCase();
          if (!topCategoryMap.has(key)) {
            const icon = topCatIconMap[tcName] ?? "tag";
            const [tcResult] = await db.insert(menuTopCategories).values({
              restaurantId,
              name: tcName,
              icon,
              sortOrder: existingTopCats.length + idx,
              isActive: true,
            });
            topCategoryMap.set(key, (tcResult as any).insertId);
          }
        }

        // ── Schritt 2: Unterkategorien (menu_categories) anlegen ────────────────
        const categoryMap = new Map<string, number>(); // name.lower → id
        const existingCats = await db
          .select()
          .from(menuCategories)
          .where(eq(menuCategories.restaurantId, restaurantId));
        for (const cat of existingCats) {
          categoryMap.set(cat.name.toLowerCase(), cat.id);
        }

        // Bestehende Produkte für Duplikat-Handling laden
        const existingMenuItems = await db
          .select({ id: menuItems.id, name: menuItems.name })
          .from(menuItems)
          .where(eq(menuItems.restaurantId, restaurantId));
        const existingByName = new Map<string, number>(
          existingMenuItems.map((i: { id: number; name: string }) => [i.name.toLowerCase().trim(), i.id])
        );

        // Neue Unterkategorien anlegen (mit topCategoryId-Verknüpfung)
        const uniqueCategories = Array.from(new Set((items as ImportedMenuItem[]).map((i) => i.category)));
        for (const catName of uniqueCategories) {
          const key = catName.toLowerCase();
          if (!categoryMap.has(key)) {
            // Passende Oberkategorie für diese Unterkategorie finden
            const parentItem = (items as ImportedMenuItem[]).find(
              (i) => i.category.toLowerCase() === key
            );
            const tcName = (parentItem?.topCategory || catName).toUpperCase();
            const topCatId = topCategoryMap.get(tcName.toLowerCase()) ?? null;

            const [catResult] = await db.insert(menuCategories).values({
              restaurantId,
              topCategoryId: topCatId,
              name: catName,
              description: null,
              imageUrl: null,
              isActive: true,
              sortOrder: existingCats.length + uniqueCategories.indexOf(catName),
            });
            categoryMap.set(key, (catResult as any).insertId);
          }
        }

        // Produkte importieren
        let importedCount = 0;
        let skippedCount = 0;
        let duplicateCount = 0;
        const importedItemIds: { id: number; name: string; description?: string; itemType: string }[] = [];

        for (const item of items as ImportedMenuItem[]) {
          const categoryId = categoryMap.get(item.category.toLowerCase()) ?? null;
          const nameLower = item.name.toLowerCase().trim();
          const existingId = existingByName.get(nameLower);

          if (existingId) {
            duplicateCount++;
            const action = item.duplicateAction ?? "skip";

            if (action === "skip") {
              skippedCount++;
              continue;
            } else             if (action === "overwrite") {
              // Bestehendes Produkt aktualisieren
              await db
                .update(menuItems)
                .set({
                  description: item.description ?? null,
                  price: item.price,
                  categoryId,
                  itemType: item.itemType,
                  allergens: item.allergens?.length ? JSON.stringify(item.allergens) : null,
                  labels: item.labels?.length ? JSON.stringify(item.labels) : null,
                  kitchenStation: item.kitchenStation ?? null,
                  taxClassId: item.taxClassId ?? null,
                  // Nährwerte
                  calories: item.calories != null ? String(item.calories) : null,
                  protein: item.protein != null ? String(item.protein) : null,
                  carbs: item.carbs != null ? String(item.carbs) : null,
                  fat: item.fat != null ? String(item.fat) : null,
                  saturatedFat: item.saturatedFat != null ? String(item.saturatedFat) : null,
                  sugar: item.sugar != null ? String(item.sugar) : null,
                  fiber: item.fiber != null ? String(item.fiber) : null,
                  salt: item.salt != null ? String(item.salt) : null,
                })
                .where(eq(menuItems.id, existingId as number));
              importedCount++;
              if (generateImages && item.itemType !== "beverage") {
                importedItemIds.push({ id: existingId as number, name: item.name, description: item.description, itemType: item.itemType });
              }
              continue;
            }
            // action === "new": als neues Produkt anlegen (Name bleibt gleich, doppelt)
          }

          // Neues Produkt anlegen
          const [itemResult] = await db.insert(menuItems).values({
            restaurantId,
            categoryId,
            name: item.name,
            description: item.description ?? null,
            price: item.price,
            priceType: "fixed",
            itemType: item.itemType,
            allergens: item.allergens?.length ? JSON.stringify(item.allergens) : null,
            labels: item.labels?.length ? JSON.stringify(item.labels) : null,
            kitchenStation: item.kitchenStation ?? null,
            taxClassId: item.taxClassId ?? null,
            isActive: true,
            isAvailable: true,
            availabilityType: "always",
            sortOrder: 0,
            courseNumber: item.itemType === "dessert" ? 3 : item.itemType === "food" ? 2 : 1,
            // Nährwerte
            calories: item.calories != null ? String(item.calories) : null,
            protein: item.protein != null ? String(item.protein) : null,
            carbs: item.carbs != null ? String(item.carbs) : null,
            fat: item.fat != null ? String(item.fat) : null,
            saturatedFat: item.saturatedFat != null ? String(item.saturatedFat) : null,
            sugar: item.sugar != null ? String(item.sugar) : null,
            fiber: item.fiber != null ? String(item.fiber) : null,
            salt: item.salt != null ? String(item.salt) : null,
          });
          const newId = (itemResult as any).insertId ?? 0;
          importedCount++;

          if (generateImages && item.itemType !== "beverage" && newId) {
            importedItemIds.push({ id: newId, name: item.name, description: item.description, itemType: item.itemType });
          }
        }

        // Import-Protokoll speichern
        try {
          await db.insert(menuImportLogs).values({
            restaurantId,
            fileName: String(fileName).slice(0, 255),
            fileType: String(fileType).slice(0, 50),
            fileSizeBytes: fileSizeBytes ? Number(fileSizeBytes) : null,
            detectedLanguage: detectedLanguage ? String(detectedLanguage).slice(0, 10) : null,
            importedCount,
            skippedCount,
            duplicateCount,
            status: importedCount > 0 ? "success" : "partial",
          });
        } catch (logErr: any) {
          console.warn("[MenuImport] Protokoll-Speicherung fehlgeschlagen:", logErr.message);
        }

        // Antwort sofort senden, Bilder asynchron generieren
        res.json({
          success: true,
          importedCount,
          skippedCount,
          duplicateCount,
          generatingImages: generateImages && importedItemIds.length > 0,
          message: `${importedCount} Produkte importiert${skippedCount > 0 ? `, ${skippedCount} übersprungen` : ""}${duplicateCount > 0 ? ` (${duplicateCount} Duplikate)` : ""}`,
        });

        // KI-Bilder asynchron generieren (non-blocking)
        if (generateImages && importedItemIds.length > 0) {
          // Maximal 10 Bilder generieren um Credits zu schonen
          const toGenerate = importedItemIds.slice(0, 10);
          for (const item of toGenerate) {
            await generateProductImageSafe(restaurantId, item.id, item.name, item.description);
          }
        }
      } catch (err: any) {
        console.error("[MenuImport] Import-Fehler:", err.message);
        return res.status(500).json({ error: err.message || "Import fehlgeschlagen" });
      }
    }
  );

  /**
   * GET /api/menu/import-logs
   * Gibt die letzten Import-Protokolle für das Restaurant zurück.
   */
  (app as any).get(
    "/api/menu/import-logs",
    requireAdmin,
    async (req: any, res: any) => {
      try {
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return res.status(400).json({ error: "Kein Restaurant zugewiesen" });
        }

        const db = await getDb();
        const logs = await db
          .select()
          .from(menuImportLogs)
          .where(eq(menuImportLogs.restaurantId, restaurantId))
          .orderBy(desc(menuImportLogs.createdAt))
          .limit(50);

        // Neueste zuerst
        return res.json({ logs: logs.reverse() });
      } catch (err: any) {
        console.error("[MenuImport] Protokoll-Fehler:", err.message);
        return res.status(500).json({ error: err.message || "Fehler beim Laden" });
      }
    }
  );
}
