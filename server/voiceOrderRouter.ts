/**
 * Voice Order Router – Erweiterte Version
 * Unterstützt:
 *  - Multi-Tisch-Bestellungen ("2 Bier für Tisch 1 und 3 Rösti für Tisch 2")
 *  - Stornierungen ("Storniere 1 Bier von Tisch 4")
 *  - Gang-Zuweisung ("1 Salat als Vorspeise, 2 Rösti als Hauptgang")
 *  - Kommentare ("2 Schnitzel ohne Sauce")
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { menuItems } from "../drizzle/schema";

// ─── Zahlwort-Konvertierung ───────────────────────────────────────────────────
const ZAHLWOERTER: Record<string, number> = {
  null: 0, ein: 1, eine: 1, einen: 1, einem: 1, eins: 1,
  zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14,
  fünfzehn: 15, fuenfzehn: 15, sechzehn: 16, siebzehn: 17,
  achtzehn: 18, neunzehn: 19, zwanzig: 20,
  einundzwanzig: 21, zweiundzwanzig: 22, dreiundzwanzig: 23,
  vierundzwanzig: 24, fünfundzwanzig: 25, fuenfundzwanzig: 25,
  // Schweizerdeutsch / Dialekt
  zwoi: 2, drü: 3, dri: 3, vieri: 4, füfi: 5, sächsi: 6,
  sibni: 7, sibe: 7, achti: 8, nüni: 9, zäni: 10,
  elfi: 11, zwölfi: 12, zwelfi: 12,
};

function zahlwoerterZuZiffern(text: string): string {
  let result = text;
  const sorted = Object.entries(ZAHLWOERTER).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sorted) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, String(num));
  }
  return result;
}

// ─── Fuzzy-Matching ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const tokensA = new Set(na.split(" ").filter(t => t.length > 2));
  const tokensB = new Set(nb.split(" ").filter(t => t.length > 2));
  const intersection = Array.from(tokensA).filter(t => tokensB.has(t));
  if (intersection.length > 0) {
    const tokenScore = (2 * intersection.length) / (tokensA.size + tokensB.size);
    if (tokenScore >= 0.5) return Math.max(tokenScore, 0.75);
  }
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

type CatalogItem = { id: number; name: string; price: string; itemType: string };

function findBestMatch(recognizedName: string, catalog: CatalogItem[]): (CatalogItem & { score: number }) | null {
  const normalized = zahlwoerterZuZiffern(recognizedName);
  let best: (CatalogItem & { score: number }) | null = null;
  for (const item of catalog) {
    const score = Math.max(similarity(recognizedName, item.name), similarity(normalized, item.name));
    if (!best || score > best.score) best = { ...item, score };
  }
  return best && best.score >= 0.40 ? best : null;
}

// ─── LLM-Extraktion Typen ─────────────────────────────────────────────────────
type LLMItem = {
  name: string;
  qty: number;
  comment?: string | null;
  course?: string | null;  // "vorspeise" | "hauptgang" | "dessert" | "getraenk" | null
  action?: "add" | "remove"; // Standard: "add"
};

type LLMTableGroup = {
  tableNumber: number | null;
  items: LLMItem[];
};

type LLMResult = {
  groups: LLMTableGroup[];
};

// ─── Matched Item Typ ─────────────────────────────────────────────────────────
type MatchedItem = {
  recognizedName: string;
  qty: number;
  comment: string | null;
  course: string | null;
  action: "add" | "remove";
  menuItemId: number | null;
  matchedName: string;
  unitPrice: number;
  itemType: string;
  confidence: number;
  matched: boolean;
};

// ─── Router ──────────────────────────────────────────────────────────────────
export const voiceOrderRouter = router({
  processVoiceOrder: protectedProcedure
    .input(z.object({
      transcription: z.string().min(1),
      restaurantId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const rawTranscription = input.transcription.trim();
      const transcription = zahlwoerterZuZiffern(rawTranscription);

      // Speisekarte laden
      const db = await getDb();
      const catalog = await db
        .select({ id: menuItems.id, name: menuItems.name, price: menuItems.price, itemType: menuItems.itemType })
        .from(menuItems)
        .where(and(eq(menuItems.restaurantId, input.restaurantId), eq(menuItems.isActive, true), eq(menuItems.isAvailable, true)));

      if (catalog.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Keine aktiven Menüartikel gefunden." });
      }

      const catalogList = catalog.map((i: CatalogItem) => `- ${i.name}`).join("\n");

      const llmPrompt = `Du bist ein Restaurantkassier-Assistent in der Schweiz. Analysiere die folgende Sprachbestellung und extrahiere strukturierte Daten.

SPEISEKARTE (verfügbare Artikel):
${catalogList}

SPRACHBESTELLUNG: "${transcription}"
(Original: "${rawTranscription}")

AUFGABE:
Extrahiere alle Bestellungen und gruppiere sie nach Tisch. Erkenne auch Stornierungen und Gang-Zuweisungen.

REGELN:
- MULTI-TISCH: Wenn mehrere Tische genannt werden, erstelle für jeden Tisch eine separate Gruppe
  Beispiel: "2 Bier für Tisch 1 und 3 Rösti für Tisch 2" → 2 Gruppen
- TISCHNUMMER: Suche nach "Tisch [Zahl]", "für Tisch [Zahl]", "von Tisch [Zahl]"
- MENGEN: Zahlen vor einem Produkt sind Mengen. Ohne Mengenangabe: qty = 1
- STORNIERUNG: Wenn "storniere", "entferne", "lösche", "cancel", "weg" vorkommt → action = "remove"
  Beispiel: "Storniere 1 Bier von Tisch 4" → action: "remove"
- GÄNGE: Erkenne Gang-Zuweisungen:
  "Vorspeise" / "als Starter" / "zum Anfang" → course: "vorspeise"
  "Hauptgang" / "Hauptspeise" / "als Haupt" → course: "hauptgang"
  "Dessert" / "Nachspeise" / "zum Abschluss" → course: "dessert"
  "Getränk" / "zu trinken" → course: "getraenk"
  Ohne Gang-Angabe: course = null
- KOMMENTARE: Zusätze/Wünsche nach einem Produkt (z.B. "ohne Sauce", "extra scharf", "gut durchgebraten")
- Dialekt akzeptieren: "Kafi" = Kaffee, "Bier" kann "Helles Bier" sein
- Wenn kein Tisch erkannt: tableNumber = null

Antworte NUR mit gültigem JSON (kein Markdown):
{
  "groups": [
    {
      "tableNumber": <Zahl oder null>,
      "items": [
        {
          "name": "<erkannter Begriff>",
          "qty": <positive ganze Zahl>,
          "comment": "<Kommentar oder null>",
          "course": "<vorspeise|hauptgang|dessert|getraenk oder null>",
          "action": "<add|remove>"
        }
      ]
    }
  ]
}`;

      let extracted: LLMResult;
      try {
        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: "Du bist ein präziser JSON-Extraktor für Restaurantbestellungen. Antworte AUSSCHLIESSLICH mit reinem JSON ohne Markdown-Codeblöcke." },
            { role: "user", content: llmPrompt },
          ],
          model: "claude-haiku-4-5-20251001",
        });

        const rawContent = llmResponse?.choices?.[0]?.message?.content;
        if (!rawContent) throw new Error("Keine LLM-Antwort");
        const raw: string = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);

        // Kompatibilität: falls altes Format (tableNumber + items direkt) → in groups umwandeln
        if (Array.isArray(parsed.groups)) {
          extracted = { groups: parsed.groups };
        } else if (Array.isArray(parsed.items)) {
          extracted = { groups: [{ tableNumber: parsed.tableNumber ?? null, items: parsed.items }] };
        } else {
          extracted = { groups: [] };
        }
      } catch (err) {
        console.error("[voiceOrder] LLM error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "KI-Analyse fehlgeschlagen. Bitte erneut versuchen." });
      }

      // Fuzzy-Matching für alle Gruppen
      const catalogNormalized: CatalogItem[] = catalog.map((c: { id: number; name: string; price: unknown; itemType: string }) => ({
        id: c.id, name: c.name, price: String(c.price), itemType: c.itemType,
      }));

      const matchedGroups = extracted.groups.map((group: LLMTableGroup) => ({
        tableNumber: typeof group.tableNumber === "number" ? Math.round(group.tableNumber) : null,
        items: (group.items ?? []).map((item: LLMItem): MatchedItem => {
          const match = findBestMatch(item.name, catalogNormalized);
          const action: "add" | "remove" = item.action === "remove" ? "remove" : "add";
          const course = item.course?.trim() || null;
          const comment = item.comment?.trim() || null;
          return {
            recognizedName: item.name,
            qty: Math.max(1, Math.round(item.qty ?? 1)),
            comment,
            course,
            action,
            menuItemId: match?.id ?? null,
            matchedName: match?.name ?? item.name,
            unitPrice: match ? parseFloat(match.price) : 0,
            itemType: match?.itemType ?? "food",
            confidence: match?.score ?? 0,
            matched: match !== null,
          };
        }),
      }));

      // Wenn nur eine Gruppe und kein Tisch → Rückwärtskompatibilität mit altem Format
      const singleGroup = matchedGroups.length === 1 ? matchedGroups[0] : null;

      return {
        transcription: rawTranscription,
        // Legacy-Felder für Rückwärtskompatibilität (single-table flow)
        tableNumber: singleGroup?.tableNumber ?? null,
        items: singleGroup?.items ?? [],
        // Neues Multi-Tisch-Format
        groups: matchedGroups,
        isMultiTable: matchedGroups.length > 1,
      };
    }),
});
