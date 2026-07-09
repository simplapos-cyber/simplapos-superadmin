import { z } from "zod";
import { router } from "./_core/trpc";
import { adminProcedure, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { floorPlans, floorPlanObjects, floorPlanVersions, deviceLayouts } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

export const floorPlanRouter = router({
  // ─── List all floor plans for the restaurant (Kellner read-only) ──────────────────────
  listForWaiter: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const plans = await db
      .select()
      .from(floorPlans)
      .where(eq(floorPlans.restaurantId, ctx.user.restaurantId!))
      .orderBy(desc(floorPlans.updatedAt));
    return plans;
  }),

  // ─── Get single floor plan with all objects (Kellner read-only) ─────────────────────
  getForWaiter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [plan] = await db
        .select()
        .from(floorPlans)
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      if (!plan) throw new Error("Floor plan not found");

      const objects = await db
        .select()
        .from(floorPlanObjects)
        .where(eq(floorPlanObjects.floorPlanId, input.id));

      return { ...plan, objects };
    }),

  // ─── List all floor plans for the restaurant ─────────────────────────────────────────
  list: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const plans = await db
      .select()
      .from(floorPlans)
      .where(eq(floorPlans.restaurantId, ctx.user.restaurantId!))
      .orderBy(desc(floorPlans.updatedAt));
    return plans;
  }),

  // ─── Get single floor plan with all objects ──────────────────────────────
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [plan] = await db
        .select()
        .from(floorPlans)
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      if (!plan) throw new Error("Floor plan not found");

      const objects = await db
        .select()
        .from(floorPlanObjects)
        .where(eq(floorPlanObjects.floorPlanId, input.id));

      return { ...plan, objects };
    }),

  // ─── Create new floor plan ───────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      areaName: z.string().default("Hauptbereich"),
      gridSize: z.number().default(20),
      canvasWidth: z.number().default(1200),
      canvasHeight: z.number().default(800),
      floorStyle: z.string().default("none"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [result] = await db.insert(floorPlans).values({
        restaurantId: ctx.user.restaurantId!,
        name: input.name,
        areaName: input.areaName,
        gridSize: input.gridSize,
        canvasWidth: input.canvasWidth,
        canvasHeight: input.canvasHeight,
        floorStyle: input.floorStyle,
      });
      return { id: result.insertId };
    }),

  // ─── Update floor plan metadata ─────────────────────────────────────────
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      areaName: z.string().optional(),
      gridSize: z.number().optional(),
      canvasWidth: z.number().optional(),
      canvasHeight: z.number().optional(),
      floorStyle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const { id, ...updates } = input;
      await db
        .update(floorPlans)
        .set(updates)
        .where(and(eq(floorPlans.id, id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      return { success: true };
    }),

  // ─── Delete floor plan ───────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db.delete(floorPlanObjects).where(eq(floorPlanObjects.floorPlanId, input.id));
      await db.delete(floorPlanVersions).where(eq(floorPlanVersions.floorPlanId, input.id));
      await db
        .delete(floorPlans)
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      return { success: true };
    }),

  // ─── Duplicate floor plan ────────────────────────────────────────────────
  duplicate: adminProcedure
    .input(z.object({ id: z.number(), newName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [plan] = await db
        .select()
        .from(floorPlans)
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      if (!plan) throw new Error("Floor plan not found");

      const [newPlan] = await db.insert(floorPlans).values({
        restaurantId: ctx.user.restaurantId!,
        name: input.newName,
        areaName: plan.areaName,
        gridSize: plan.gridSize,
        canvasWidth: plan.canvasWidth,
        canvasHeight: plan.canvasHeight,
        floorStyle: plan.floorStyle,
      });

      const objects = await db
        .select()
        .from(floorPlanObjects)
        .where(eq(floorPlanObjects.floorPlanId, input.id));

      if (objects.length > 0) {
        await db.insert(floorPlanObjects).values(
          objects.map((obj: any) => ({
            floorPlanId: newPlan.insertId,
            type: obj.type,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            rotation: obj.rotation,
            label: obj.label,
            tableNumber: obj.tableNumber,
            seats: obj.seats,
            isActive: obj.isActive,
            qrCodeEnabled: obj.qrCodeEnabled,
            qrOrderEnabled: obj.qrOrderEnabled,
            qrPaymentEnabled: obj.qrPaymentEnabled,
            notes: obj.notes,
            properties: obj.properties,
            sortOrder: obj.sortOrder,
          }))
        );
      }

      return { id: newPlan.insertId };
    }),

  // ─── Publish floor plan ──────────────────────────────────────────────────
  publish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(floorPlans)
        .set({ status: "published" })
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      return { success: true };
    }),

  // ─── Unpublish (set to draft) ────────────────────────────────────────────
  unpublish: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(floorPlans)
        .set({ status: "draft" })
        .where(and(eq(floorPlans.id, input.id), eq(floorPlans.restaurantId, ctx.user.restaurantId!)));
      return { success: true };
    }),

  // ─── Object CRUD ─────────────────────────────────────────────────────────
  addObject: adminProcedure
    .input(z.object({
      floorPlanId: z.number(),
      type: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number().default(80),
      height: z.number().default(80),
      rotation: z.number().default(0),
      label: z.string().optional(),
      tableNumber: z.number().optional(),
      seats: z.number().optional(),
      properties: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [result] = await db.insert(floorPlanObjects).values({
        floorPlanId: input.floorPlanId,
        type: input.type as any,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        rotation: input.rotation,
        label: input.label || null,
        tableNumber: input.tableNumber || null,
        seats: input.seats || null,
        properties: input.properties || null,
      });
      return { id: result.insertId };
    }),

  updateObject: adminProcedure
    .input(z.object({
      id: z.number(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      rotation: z.number().optional(),
      label: z.string().optional(),
      tableNumber: z.number().optional(),
      seats: z.number().optional(),
      isActive: z.boolean().optional(),
      qrCodeEnabled: z.boolean().optional(),
      qrOrderEnabled: z.boolean().optional(),
      qrPaymentEnabled: z.boolean().optional(),
      notes: z.string().optional(),
      properties: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...updates } = input;
      const cleanUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) cleanUpdates[key] = value;
      }
      await db.update(floorPlanObjects).set(cleanUpdates).where(eq(floorPlanObjects.id, id));
      return { success: true };
    }),

  removeObject: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(floorPlanObjects).where(eq(floorPlanObjects.id, input.id));
      return { success: true };
    }),

  bulkUpdateObjects: adminProcedure
    .input(z.object({
      floorPlanId: z.number(),
      objects: z.array(z.object({
        id: z.number().optional(),
        type: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        rotation: z.number().default(0),
        label: z.string().optional(),
        tableNumber: z.number().optional(),
        seats: z.number().optional(),
        isActive: z.boolean().default(true),
        qrCodeEnabled: z.boolean().default(false),
        qrOrderEnabled: z.boolean().default(false),
        qrPaymentEnabled: z.boolean().default(false),
        notes: z.string().optional(),
        properties: z.any().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Delete all existing objects and re-insert
      await db.delete(floorPlanObjects).where(eq(floorPlanObjects.floorPlanId, input.floorPlanId));
      if (input.objects.length > 0) {
        await db.insert(floorPlanObjects).values(
          input.objects.map((obj, idx) => ({
            floorPlanId: input.floorPlanId,
            type: obj.type as any,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            rotation: obj.rotation,
            label: obj.label || null,
            tableNumber: obj.tableNumber || null,
            seats: obj.seats || null,
            isActive: obj.isActive,
            qrCodeEnabled: obj.qrCodeEnabled,
            qrOrderEnabled: obj.qrOrderEnabled,
            qrPaymentEnabled: obj.qrPaymentEnabled,
            notes: obj.notes || null,
            properties: obj.properties || null,
            sortOrder: idx,
          }))
        );
      }
      return { success: true };
    }),

  // ─── Versioning ──────────────────────────────────────────────────────────
  saveVersion: adminProcedure
    .input(z.object({
      floorPlanId: z.number(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const objects = await db
        .select()
        .from(floorPlanObjects)
        .where(eq(floorPlanObjects.floorPlanId, input.floorPlanId));

      const [plan] = await db
        .select()
        .from(floorPlans)
        .where(eq(floorPlans.id, input.floorPlanId));

      const nextVersion = (plan?.currentVersion || 0) + 1;

      await db.insert(floorPlanVersions).values({
        floorPlanId: input.floorPlanId,
        versionNumber: nextVersion,
        snapshot: JSON.stringify(objects),
        description: input.description || `Version ${nextVersion}`,
      });

      await db
        .update(floorPlans)
        .set({ currentVersion: nextVersion })
        .where(eq(floorPlans.id, input.floorPlanId));

      return { versionNumber: nextVersion };
    }),

  listVersions: adminProcedure
    .input(z.object({ floorPlanId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const versions = await db
        .select()
        .from(floorPlanVersions)
        .where(eq(floorPlanVersions.floorPlanId, input.floorPlanId))
        .orderBy(desc(floorPlanVersions.versionNumber));
      return versions;
    }),

  restoreVersion: adminProcedure
    .input(z.object({ floorPlanId: z.number(), versionNumber: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [version] = await db
        .select()
        .from(floorPlanVersions)
        .where(
          and(
            eq(floorPlanVersions.floorPlanId, input.floorPlanId),
            eq(floorPlanVersions.versionNumber, input.versionNumber)
          )
        );
      if (!version) throw new Error("Version not found");

      const objects = JSON.parse(version.snapshot as string);
      await db.delete(floorPlanObjects).where(eq(floorPlanObjects.floorPlanId, input.floorPlanId));

      if (objects.length > 0) {
        await db.insert(floorPlanObjects).values(
          objects.map((obj: any) => ({
            floorPlanId: input.floorPlanId,
            type: obj.type,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            rotation: obj.rotation,
            label: obj.label,
            tableNumber: obj.tableNumber,
            seats: obj.seats,
            isActive: obj.isActive,
            qrCodeEnabled: obj.qrCodeEnabled,
            qrOrderEnabled: obj.qrOrderEnabled,
            qrPaymentEnabled: obj.qrPaymentEnabled,
            notes: obj.notes,
            properties: obj.properties,
            sortOrder: obj.sortOrder || 0,
          }))
        );
      }

      return { success: true };
    }),

  // ─── AI Plan Recognition ─────────────────────────────────────────────────
  analyzeImage: adminProcedure
    .input(z.object({
      imageUrl: z.string(),
      base64Data: z.string().optional(),
      imageWidth: z.number().optional(),
      imageHeight: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // imageUrl can be a data: URL (base64) or a remote https:// URL.
      // data: URLs are handled natively by the LLM core (converted to base64 image blocks).
      // For /manus-storage/ paths we generate a signed URL so the LLM can fetch the image.
      let resolvedImageUrl = input.imageUrl;
      if (input.base64Data) {
        resolvedImageUrl = input.base64Data; // Already a data:image/...;base64,... URL
      } else if (input.imageUrl.startsWith("/manus-storage/")) {
        const key = input.imageUrl.replace("/manus-storage/", "");
        const { storageGetSignedUrl } = await import("./storage");
        resolvedImageUrl = await storageGetSignedUrl(key);
      }
      // data: URLs are passed through as-is – the LLM core handles them correctly.

      // Use provided image dimensions or fall back to 1200x800 assumption
      const srcW = input.imageWidth ?? 1200;
      const srcH = input.imageHeight ?? 800;

      console.log("[analyzeImage] Starting LLM call, imageUrl type:", input.base64Data ? "base64" : "url", "imgDims:", srcW, "x", srcH);

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Du bist ein Grundriss-Digitalisierer für Gastronomie-Software. Analysiere das Bild und gib ALLE Elemente mit PROZENTUALEN Koordinaten zurück (0.0 bis 100.0).

KOORDINATEN-SYSTEM (PROZENT):
- x_pct: Abstand der linken Kante des Elements vom linken Bildrand in Prozent (0 = ganz links, 100 = ganz rechts)
- y_pct: Abstand der oberen Kante des Elements vom oberen Bildrand in Prozent (0 = ganz oben, 100 = ganz unten)
- width_pct: Breite des Elements als Prozent der Bildbreite
- height_pct: Höhe des Elements als Prozent der Bildhöhe

BEISPIEL: Ein Tisch der im Bild bei 30% von links, 25% von oben steht und 8% der Bildbreite und 15% der Bildhöhe einnimmt:
  x_pct: 30.0, y_pct: 25.0, width_pct: 8.0, height_pct: 15.0

PRÄZISIONS-REGELN:
1. JEDES sichtbare Element erfassen - kein Element auslassen
2. Tische: Erkenne Form und Tischnummer. Typische Tische nehmen 5-12% der Bildbreite und 10-20% der Bildhöhe ein
3. Türen/Eingänge: type="door", label=Beschriftungstext (z.B. "Eingang Restaurant")
4. Trennlinien/Wände: type="wall" oder type="divider"
5. Abstände zwischen Tischen proportional erhalten

TYPEN:
- Hochkanter Tisch (höher als breit): table_rect
- Quadratischer Tisch: table_square
- Runder Tisch: table_round
- Hoher Stehtisch: table_high
- Tür/Eingang: door
- Wand/Trennlinie: wall
- Raumteiler: divider
- Dekoration: decoration

FELDER:
- x_pct, y_pct: Position der oberen linken Ecke in Prozent (0-100)
- width_pct, height_pct: Grösse in Prozent (0-100)
- label: Tischnummer als Text ODER Beschriftung für Nicht-Tische (z.B. "Eingang Terrasse")
- tableNumber: Nur für Tische die Zahl (50, 51...), sonst null
- seats: Geschätzte Sitzplätze (2-8), für Nicht-Tische null`
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Analysiere diesen Restaurant-Grundriss und gib alle Elemente mit PROZENTUALEN Koordinaten zurück.

Vorgehen:
1. Schau dir das gesamte Bild an und identifiziere alle Tische, Türen, Trennlinien
2. Für jeden Tisch: Wie weit ist er von links (x_pct) und oben (y_pct)? Wie gross ist er (width_pct, height_pct)?
3. Behalte die Gruppen-Struktur bei (z.B. Tische 50-56 oben, Tische 60-65 unten)
4. Türen und Eingänge mit ihrer Beschriftung erfassen

Alle Werte als Prozent (0.0 bis 100.0) der Bildgrösse.` },
              { type: "image_url", image_url: { url: resolvedImageUrl } }
            ]
          }
        ],
        max_tokens: 12000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "floor_plan_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                objects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      x_pct: { type: "number" },
                      y_pct: { type: "number" },
                      width_pct: { type: "number" },
                      height_pct: { type: "number" },
                      rotation: { type: "number" },
                      label: { type: ["string", "null"] },
                      tableNumber: { type: ["number", "null"] },
                      seats: { type: ["number", "null"] },
                      confidence: { type: "string" }
                    },
                    required: ["type", "x_pct", "y_pct", "width_pct", "height_pct", "rotation", "label", "tableNumber", "seats", "confidence"],
                    additionalProperties: false
                  }
                },
                areas: { type: "array", items: { type: "string" } },
                summary: { type: "string" }
              },
              required: ["objects", "areas", "summary"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices?.[0]?.message?.content;
      const finishReason = response.choices?.[0]?.finish_reason;
      console.log("[analyzeImage] LLM response finish_reason:", finishReason, "content length:", content?.length);

      if (!content || typeof content !== 'string') {
        console.error("[analyzeImage] No content in LLM response");
        throw new Error("KI-Analyse fehlgeschlagen: Keine Antwort erhalten");
      }

      // Strip markdown code blocks if Claude wraps the JSON in ```json ... ```
      let cleanedContent = content.trim();
      const codeBlockMatch = cleanedContent.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (codeBlockMatch) {
        cleanedContent = codeBlockMatch[1].trim();
        console.log("[analyzeImage] Stripped markdown code block from response");
      }

      try {
        return JSON.parse(cleanedContent);
      } catch (parseErr) {
        console.error("[analyzeImage] JSON parse failed, content tail:", cleanedContent.substring(cleanedContent.length - 100));
        // Try to salvage partial JSON by finding the last complete object
        const lastBracket = cleanedContent.lastIndexOf("}");
        if (lastBracket > 0) {
          try {
            // Attempt to close the JSON properly
            const truncated = cleanedContent.substring(0, lastBracket + 1);
            // Try to find a valid closing point
            const fixedJson = truncated.replace(/,\s*$/, "") + ']}' ;
            return JSON.parse(fixedJson);
          } catch {
            // ignore
          }
        }
        throw new Error("KI-Analyse fehlgeschlagen: Antwort konnte nicht verarbeitet werden");
      }
    }),

  // ─── Device Layouts (Geräte-spezifische Positionen) ──────────────────────
  getDeviceLayout: adminProcedure
    .input(z.object({ floorPlanId: z.number(), device: z.enum(["desktop", "tablet", "phone"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [layout] = await db
        .select()
        .from(deviceLayouts)
        .where(and(eq(deviceLayouts.floorPlanId, input.floorPlanId), eq(deviceLayouts.device, input.device)));
      return layout || null;
    }),

  saveDeviceLayout: adminProcedure
    .input(z.object({
      floorPlanId: z.number(),
      device: z.enum(["desktop", "tablet", "phone"]),
      canvasWidth: z.number(),
      canvasHeight: z.number(),
      objectPositions: z.array(z.object({
        objectId: z.number(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        rotation: z.number().default(0),
        hidden: z.boolean().default(false),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Check if layout exists
      const [existing] = await db
        .select()
        .from(deviceLayouts)
        .where(and(eq(deviceLayouts.floorPlanId, input.floorPlanId), eq(deviceLayouts.device, input.device)));

      if (existing) {
        await db.update(deviceLayouts)
          .set({
            canvasWidth: input.canvasWidth,
            canvasHeight: input.canvasHeight,
            objectPositions: JSON.stringify(input.objectPositions),
          })
          .where(eq(deviceLayouts.id, existing.id));
      } else {
        await db.insert(deviceLayouts).values({
          floorPlanId: input.floorPlanId,
          device: input.device,
          canvasWidth: input.canvasWidth,
          canvasHeight: input.canvasHeight,
          objectPositions: JSON.stringify(input.objectPositions),
        });
      }
      return { success: true };
    }),

  deleteDeviceLayout: adminProcedure
    .input(z.object({ floorPlanId: z.number(), device: z.enum(["desktop", "tablet", "phone"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(deviceLayouts)
        .where(and(eq(deviceLayouts.floorPlanId, input.floorPlanId), eq(deviceLayouts.device, input.device)));
      return { success: true };
    }),

  // ─── Quick Setup Wizard ──────────────────────────────────────────────────
  quickSetup: adminProcedure
    .input(z.object({
      floorPlanId: z.number(),
      rooms: z.number().min(1).max(10),
      tablesPerRoom: z.number().min(1).max(100),
      tableShape: z.enum(["round", "square", "rect", "mixed"]),
      seatsPerTable: z.number().min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Get the plan's canvas dimensions for clamping
      const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.id, input.floorPlanId));
      const canvasW = plan?.canvasWidth || 1200;
      const canvasH = plan?.canvasHeight || 800;

      const objects: any[] = [];
      // Calculate spacing to fit all tables within canvas bounds
      const cols = Math.ceil(Math.sqrt(input.tablesPerRoom));
      const rows = Math.ceil(input.tablesPerRoom / cols);
      const totalRooms = input.rooms;
      const totalRows = rows * totalRooms + (totalRooms - 1); // extra gap between rooms
      // Adaptive spacing: ensure tables fit within canvas
      const maxObjW = 120; // widest table
      const maxObjH = 80;
      const spacingX = Math.min(120, Math.max(60, Math.floor((canvasW - 60) / (cols + 1))));
      const spacingY = Math.min(120, Math.max(60, Math.floor((canvasH - 60) / (totalRows + 1))));

      for (let room = 0; room < input.rooms; room++) {
        for (let i = 0; i < input.tablesPerRoom; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const shapes = ["table_round", "table_square", "table_rect"];
          let type: string;
          if (input.tableShape === "mixed") {
            type = shapes[i % 3];
          } else {
            type = `table_${input.tableShape}`;
          }

          const w = type === "table_rect" ? 120 : 80;
          const h = 80;
          const rawX = 40 + col * spacingX;
          const rawY = 40 + row * spacingY + room * ((rows) * spacingY + 60);
          // Clamp within canvas
          const x = Math.max(0, Math.min(canvasW - w, rawX));
          const y = Math.max(0, Math.min(canvasH - h, rawY));

          objects.push({
            floorPlanId: input.floorPlanId,
            type,
            x,
            y,
            width: w,
            height: h,
            rotation: 0,
            label: `Tisch ${room * input.tablesPerRoom + i + 1}`,
            tableNumber: room * input.tablesPerRoom + i + 1,
            seats: input.seatsPerTable,
            isActive: true,
            qrCodeEnabled: false,
            qrOrderEnabled: false,
            qrPaymentEnabled: false,
            notes: null,
            properties: null,
            sortOrder: room * input.tablesPerRoom + i,
          });
        }
      }

      // Clear existing and insert new
      await db.delete(floorPlanObjects).where(eq(floorPlanObjects.floorPlanId, input.floorPlanId));
      if (objects.length > 0) {
        await db.insert(floorPlanObjects).values(objects);
      }

      return { count: objects.length };
    }),
});
