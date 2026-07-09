/**
 * aiImportRouter.ts
 * KI-gestützter Speisekarten-Import:
 *   1. analyzeMenu  – Datei-URL empfangen, KI analysiert → Menü + Rohwaren + Rezepte als JSON
 *   2. getSession   – Status und Ergebnis einer Import-Session abrufen
 *   3. listSessions – Alle Sessions des Restaurants
 *   4. confirmImport – KI-Vorschläge in menu_categories, menu_items, inventory_items, inventory_recipes speichern
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storageGetSignedUrl } from "./storage";
import { getDb } from "./db";
import {
  aiImportSessions,
  menuCategories,
  menuItems,
  inventoryItems,
  inventoryRecipes,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Zod-Schemas für das KI-Ergebnis ─────────────────────────────────────────

const RawMaterialSchema = z.object({
  name: z.string(),
  unit: z.string(),
  estimatedMinStock: z.number().optional(),
  category: z.string().optional(),
  einkaufspreis: z.number().optional(),
});

const RecipeIngredientSchema = z.object({
  rawMaterialName: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

const MenuItemSchema = z.object({
  name: z.string(),
  price: z.number(),
  description: z.string().optional(),
  itemType: z.enum(["food", "beverage", "dessert", "set_menu", "other"]).optional(),
  allergens: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  kitchenStation: z.string().optional(),
  ingredients: z.array(RecipeIngredientSchema).optional(),
  isDirectStock: z.boolean().optional(),
});

const MenuCategorySchema = z.object({
  name: z.string(),
  topCategory: z.string().optional(),
  items: z.array(MenuItemSchema),
});

export const AiImportResultSchema = z.object({
  categories: z.array(MenuCategorySchema),
  rawMaterials: z.array(RawMaterialSchema),
  summary: z.object({
    totalCategories: z.number(),
    totalItems: z.number(),
    totalRawMaterials: z.number(),
    totalRecipes: z.number(),
  }),
});

export type AiImportResult = z.infer<typeof AiImportResultSchema>;

// ─── KI-Prompt ────────────────────────────────────────────────────────────────

function buildAnalysisPrompt(): string {
  return `Du bist ein Experte für Gastronomie-Warenwirtschaft und Speisekarten-Analyse.

Analysiere die hochgeladene Speisekarte (Bild/PDF) und erstelle eine vollständige strukturierte JSON-Ausgabe.

Erstelle ein JSON-Objekt mit folgender Struktur:

{
  "categories": [
    {
      "name": "Vorspeisen",
      "topCategory": "Essen",
      "items": [
        {
          "name": "Bruschetta",
          "price": 8.50,
          "description": "Geröstetes Brot mit Tomaten und Basilikum",
          "itemType": "food",
          "allergens": ["gluten"],
          "labels": ["vegetarisch"],
          "kitchenStation": "Küche",
          "isDirectStock": false,
          "ingredients": [
            { "rawMaterialName": "Weissbrot", "quantity": 100, "unit": "g" },
            { "rawMaterialName": "Tomaten", "quantity": 80, "unit": "g" },
            { "rawMaterialName": "Basilikum", "quantity": 5, "unit": "g" },
            { "rawMaterialName": "Olivenöl", "quantity": 10, "unit": "ml" }
          ]
        }
      ]
    },
    {
      "name": "Bier",
      "topCategory": "Getränke",
      "items": [
        {
          "name": "Heineken 0.33L",
          "price": 4.50,
          "itemType": "beverage",
          "kitchenStation": "Bar",
          "isDirectStock": true,
          "ingredients": [
            { "rawMaterialName": "Heineken Flasche 0.33L", "quantity": 1, "unit": "Flasche" }
          ]
        }
      ]
    }
  ],
  "rawMaterials": [
    {
      "name": "Weissbrot",
      "unit": "g",
      "estimatedMinStock": 2000,
      "category": "Backwaren",
      "einkaufspreis": 0.003
    },
    {
      "name": "Heineken Flasche 0.33L",
      "unit": "Flasche",
      "estimatedMinStock": 24,
      "category": "Bier",
      "einkaufspreis": 0.90
    }
  ],
  "summary": {
    "totalCategories": 2,
    "totalItems": 2,
    "totalRawMaterials": 5,
    "totalRecipes": 2
  }
}

Wichtige Regeln:
- Für Fertigprodukte (Flaschengetränke, Dosen, abgepackte Waren): isDirectStock = true, ingredients enthält genau 1 Eintrag
- Für zubereitete Speisen: isDirectStock = false, ingredients enthält alle Zutaten mit realistischen Mengen
- Alle Preise in CHF als Dezimalzahl
- kitchenStation: "Küche" für Speisen, "Bar" für Getränke, "Grill" für Grillgerichte
- Allergene: gluten, krebstiere, eier, fisch, erdnüsse, soja, milch, schalenfrüchte, sellerie, senf, sesam, schwefeldioxid, lupinen, weichtiere
- Labels: vegetarisch, vegan, scharf, bio, neu, bestseller, glutenfrei, laktosefrei
- Schätze realistische Einkaufspreise und Mindestbestände (Schweizer Marktpreise)
- Antworte NUR mit dem JSON-Objekt, ohne weitere Erklärungen`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const aiImportRouter = router({

  // Schritt 1: KI-Analyse starten
  analyzeMenu: protectedProcedure
    .input(z.object({
      fileUrl: z.string().url(),
      fileKey: z.string().optional(),
      fileName: z.string().optional(),
      mimeType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
      const db = await getDb();

      // Session anlegen
      const [insResult] = await db.insert(aiImportSessions).values({
        restaurantId,
        createdBy: ctx.user.id,
        status: "analyzing",
        fileUrl: input.fileUrl,
        fileKey: input.fileKey ?? null,
        fileName: input.fileName ?? null,
      });
      const sessionId = (insResult as any).insertId as number;

      try {
        // PDF als file_url senden, Bilder als image_url
        const isPdf =
          (input.mimeType ?? "").includes("pdf") ||
          (input.fileName ?? "").toLowerCase().endsWith(".pdf");

        // Signierte CloudFront-URL holen (LLM kann /manus-storage/ nicht direkt aufrufen)
        let llmFileUrl = input.fileUrl;
        if (input.fileKey) {
          try {
            llmFileUrl = await storageGetSignedUrl(input.fileKey);
          } catch (e) {
            console.error("[AiImport] Signed URL Fehler:", e);
            // Fallback auf übergebene URL
          }
        }

        const fileContent = isPdf
          ? {
              type: "file_url" as const,
              file_url: {
                url: llmFileUrl,
                mime_type: "application/pdf" as const,
              },
            }
          : {
              type: "image_url" as const,
              image_url: { url: llmFileUrl, detail: "high" as const },
            };

        const llmResponse = await invokeLLM({
          model: "claude-sonnet-4-5-20250929",
          messages: [
            {
              role: "system",
              content: "You are a menu analysis expert. You MUST respond with ONLY valid JSON, no text before or after. No explanations, no markdown, just the JSON object.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: buildAnalysisPrompt() },
                fileContent,
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 8000,
        });

        const rawContent = llmResponse?.choices?.[0]?.message?.content ?? "{}";
        // KI gibt manchmal Markdown-Codeblöcke zurück (```json ... ```) – diese vor dem Parsen entfernen
        // Auch Text vor dem ersten { und nach dem letzten } entfernen
        const cleanContent = typeof rawContent === "string"
          ? (() => {
              let s = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
              // Finde das erste { und das letzte }
              const firstBrace = s.indexOf("{");
              const lastBrace = s.lastIndexOf("}");
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                s = s.slice(firstBrace, lastBrace + 1);
              }
              return s;
            })()
          : rawContent;
        const parsed = typeof cleanContent === "string" ? JSON.parse(cleanContent) : cleanContent;
        const validated = AiImportResultSchema.parse(parsed);

        await db.update(aiImportSessions)
          .set({ status: "ready", resultJson: JSON.stringify(validated), updatedAt: new Date() })
          .where(eq(aiImportSessions.id, sessionId));

        return { sessionId, result: validated };

      } catch (err: any) {
        await db.update(aiImportSessions)
          .set({ status: "failed", errorMessage: String(err?.message ?? err), updatedAt: new Date() })
          .where(eq(aiImportSessions.id, sessionId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `KI-Analyse fehlgeschlagen: ${err?.message ?? "Unbekannter Fehler"}`,
        });
      }
    }),

  // Session-Status abrufen
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
      const db = await getDb();

      const rows = await db.select().from(aiImportSessions)
        .where(and(eq(aiImportSessions.id, input.sessionId), eq(aiImportSessions.restaurantId, restaurantId)));
      const session = rows[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });

      return {
        ...session,
        result: session.resultJson ? JSON.parse(session.resultJson) as AiImportResult : null,
      };
    }),

  // Letzte Sessions des Restaurants
  listSessions: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
      const db = await getDb();

      return db.select({
        id: aiImportSessions.id,
        status: aiImportSessions.status,
        fileName: aiImportSessions.fileName,
        createdAt: aiImportSessions.createdAt,
        confirmedAt: aiImportSessions.confirmedAt,
      }).from(aiImportSessions)
        .where(eq(aiImportSessions.restaurantId, restaurantId))
        .orderBy(aiImportSessions.createdAt);
    }),

  // Schritt 2: Bestätigter Import → alles in DB speichern
  confirmImport: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      result: AiImportResultSchema,
      importMenu: z.boolean().default(true),
      importInventory: z.boolean().default(true),
      importRecipes: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
      const db = await getDb();

      // Session prüfen
      const rows = await db.select().from(aiImportSessions)
        .where(and(eq(aiImportSessions.id, input.sessionId), eq(aiImportSessions.restaurantId, restaurantId)));
      const session = rows[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });
      if (session.status === "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Session wurde bereits bestätigt" });

      const { result } = input;
      const stats = { categories: 0, items: 0, rawMaterials: 0, recipes: 0 };

      // ── 1. Rohwaren (inventory_items) ────────────────────────────────────
      const rawMaterialIdMap = new Map<string, number>();

      if (input.importInventory && result.rawMaterials.length > 0) {
        for (const rm of result.rawMaterials) {
          const [ins] = await db.insert(inventoryItems).values({
            restaurantId,
            name: rm.name,
            unit: rm.unit,
            minStock: rm.estimatedMinStock ?? 0,
            currentStock: 0,
            costPrice: rm.einkaufspreis != null ? String(rm.einkaufspreis) : "0.00",
            category: rm.category ?? "Sonstiges",
            isActive: true,
          });
          rawMaterialIdMap.set(rm.name, (ins as any).insertId as number);
          stats.rawMaterials++;
        }
      }

      // ── 2. Menükategorien + Artikel ───────────────────────────────────────
      if (input.importMenu) {
        for (const cat of result.categories) {
          const [catIns] = await db.insert(menuCategories).values({
            restaurantId,
            name: cat.name,
            isActive: true,
            isVisible: true,
            sortOrder: stats.categories,
          });
          const catId = (catIns as any).insertId as number;
          stats.categories++;

          for (const item of cat.items) {
            const [itemIns] = await db.insert(menuItems).values({
              restaurantId,
              categoryId: catId,
              name: item.name,
              price: String(item.price),
              description: item.description ?? null,
              itemType: item.itemType ?? "food",
              allergens: item.allergens ? JSON.stringify(item.allergens) : null,
              labels: item.labels ? JSON.stringify(item.labels) : null,
              kitchenStation: item.kitchenStation ?? null,
              isActive: true,
              isAvailable: true,
              sortOrder: stats.items,
            });
            const menuItemId = (itemIns as any).insertId as number;
            stats.items++;

            // ── 3. Rezepte ──────────────────────────────────────────────────
            if (input.importRecipes && item.ingredients && item.ingredients.length > 0) {
              for (const ing of item.ingredients) {
                const inventoryItemId = rawMaterialIdMap.get(ing.rawMaterialName);
                if (!inventoryItemId) continue;

                await db.insert(inventoryRecipes).values({
                  restaurantId,
                  menuItemId,
                  inventoryItemId,
                  quantity: String(ing.quantity),
                  unit: ing.unit,
                });
                stats.recipes++;
              }
            }
          }
        }
      }

      // Session als bestätigt markieren
      await db.update(aiImportSessions)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(aiImportSessions.id, input.sessionId));

      return { success: true, stats };
    }),
});
