/**
 * adminSetupRouter – Onboarding-Wizard mit persistentem Schritt-Fortschritt
 *
 * Jeder Schritt wird in onboarding_progress gespeichert.
 * Der Wizard öffnet sich beim Login automatisch wenn nicht alle Pflichtschritte abgeschlossen sind.
 * Der Admin kann den Wizard jederzeit schliessen und dort weitermachen, wo er aufgehört hat.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  restaurants,
  restaurantModules,
  menuCategories,
  menuItems,
  inventoryItems,
  onboardingProgress,
} from "../drizzle/schema";
import { eq, and, count } from "drizzle-orm";

// ─── Schritt-Definitionen ────────────────────────────────────────────────────

const ALL_STEPS = [
  {
    key: "welcome",
    title: "Willkommen bei Simplapos",
    description: "Dein Restaurant-System ist bereit. Lass uns gemeinsam alles einrichten.",
    icon: "Sparkles",
    optional: false,
    requiredModule: null,
    actionPath: null,
    inlineAction: null,
  },
  {
    key: "logo",
    title: "Restaurant-Logo hochladen",
    description: "Lade dein Logo hoch – es erscheint auf Rechnungen, Bons und der digitalen Speisekarte.",
    icon: "Image",
    optional: true,
    requiredModule: null,
    actionPath: null,
    inlineAction: "logo_upload",
  },
  {
    key: "tableplan",
    title: "Tischplan einrichten",
    description: "Definiere deine Tische und Räume damit Kellner Bestellungen den richtigen Tischen zuweisen können.",
    icon: "LayoutGrid",
    optional: false,
    requiredModule: null,
    actionPath: "/admin/floor-plan",
    inlineAction: null,
  },
  {
    key: "menu",
    title: "Speisekarte erstellen",
    description: "Lade deine Speisekarte hoch – die KI erkennt automatisch alle Kategorien, Artikel und Preise.",
    icon: "UtensilsCrossed",
    optional: false,
    requiredModule: null,
    actionPath: "/admin/menu/ki-import",
    inlineAction: null,
  },
  {
    key: "warehouse",
    title: "Lager & Warenwirtschaft einrichten",
    description: "Richte dein Lager ein: Zonen, Lagerorte und Artikel für automatischen Lagerabzug beim Verkauf.",
    icon: "Package",
    optional: false,
    requiredModule: "inventar",
    actionPath: "/admin/warehouse/zones",
    inlineAction: null,
  },
  {
    key: "staff",
    title: "Mitarbeiter registrieren",
    description: "Füge deine Mitarbeiter hinzu und weise ihnen Rollen zu (Kellner, Koch, Bar, Manager).",
    icon: "Users",
    optional: true,
    requiredModule: "staff",
    actionPath: "/admin/staff",
    inlineAction: null,
  },
  {
    key: "done",
    title: "Einrichtung abgeschlossen",
    description: "Alles ist bereit! Du kannst jederzeit weitere Einstellungen im Admin-Panel vornehmen.",
    icon: "CheckCircle2",
    optional: false,
    requiredModule: null,
    actionPath: null,
    inlineAction: null,
  },
] as const;

// ─── Router ──────────────────────────────────────────────────────────────────

export const adminSetupRouter = router({

  /**
   * Gibt alle relevanten Schritte mit ihrem aktuellen Status zurück.
   * Schritte mit requiredModule werden nur zurückgegeben wenn das Modul gebucht ist.
   */
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
    const db = await getDb();

    // Restaurant laden
    const [restaurant] = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        logoUrl: restaurants.logoUrl,
        onboardingCompletedAt: restaurants.onboardingCompletedAt,
      })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

    // Aktive Module laden
    const modules = await db
      .select({ moduleId: restaurantModules.moduleId })
      .from(restaurantModules)
      .where(
        and(
          eq(restaurantModules.restaurantId, restaurantId),
          eq(restaurantModules.status, "active")
        )
      );
    const activeModuleIds = modules.map((m: { moduleId: string }) => m.moduleId);

    // Relevante Schritte filtern (nur wenn Modul vorhanden oder kein Modul benötigt)
    const relevantSteps = ALL_STEPS.filter(
      (s) => !s.requiredModule || activeModuleIds.includes(s.requiredModule)
    );

    // Gespeicherten Fortschritt laden
    type ProgressEntry = { stepKey: string; status: "pending" | "done" | "skipped"; completedAt: number | null };
    const savedProgress: ProgressEntry[] = await db
      .select({
        stepKey: onboardingProgress.stepKey,
        status: onboardingProgress.status,
        completedAt: onboardingProgress.completedAt,
      })
      .from(onboardingProgress)
      .where(eq(onboardingProgress.restaurantId, restaurantId));

    const progressMap = new Map(savedProgress.map((p: ProgressEntry) => [p.stepKey, p]));

    // Schritte mit Status zusammenbauen
    const steps = relevantSteps.map((step) => {
      const saved = progressMap.get(step.key) as ProgressEntry | undefined;
      return {
        key: step.key as string,
        title: step.title,
        description: step.description,
        icon: step.icon,
        optional: step.optional,
        actionPath: step.actionPath as string | null,
        inlineAction: step.inlineAction as string | null,
        status: (saved?.status ?? "pending") as "pending" | "done" | "skipped",
        completedAt: saved?.completedAt ?? null,
      };
    });

    // Ersten offenen Pflichtschritt finden (welcome überspringen wenn bereits gesehen)
    const welcomeDone = progressMap.has("welcome");
    const firstPendingIndex = steps.findIndex(
      (s, idx) => s.status === "pending" && (s.key !== "welcome" || !welcomeDone || idx === 0)
    );
    const currentStepIndex = firstPendingIndex >= 0 ? firstPendingIndex : steps.length - 1;

    // Fortschritt berechnen (ohne "welcome" und "done")
    const countableSteps = steps.filter((s) => s.key !== "welcome" && s.key !== "done");
    const completedCount = countableSteps.filter((s) => s.status === "done" || s.status === "skipped").length;
    const totalCount = countableSteps.length;

    // Ist der Wizard abgeschlossen?
    const allRequiredDone = steps
      .filter((s) => !s.optional && s.key !== "welcome" && s.key !== "done")
      .every((s) => s.status === "done" || s.status === "skipped");

    return {
      restaurantName: restaurant.name,
      logoUrl: restaurant.logoUrl ?? null,
      isCompleted: allRequiredDone || !!restaurant.onboardingCompletedAt,
      onboardingCompletedAt: restaurant.onboardingCompletedAt ?? null,
      steps,
      currentStepIndex,
      progress: { completed: completedCount, total: totalCount },
      activeModuleIds,
    };
  }),

  /**
   * Markiert einen einzelnen Schritt als done oder skipped.
   */
  updateStep: protectedProcedure
    .input(z.object({
      stepKey: z.string(),
      status: z.enum(["done", "skipped"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const restaurantId = ctx.user.restaurantId;
      if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
      const db = await getDb();
      const now = Date.now();

      // Upsert: existierenden Eintrag aktualisieren oder neu anlegen
      const existing = await db
        .select({ id: onboardingProgress.id })
        .from(onboardingProgress)
        .where(
          and(
            eq(onboardingProgress.restaurantId, restaurantId),
            eq(onboardingProgress.stepKey, input.stepKey)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(onboardingProgress)
          .set({
            status: input.status,
            completedAt: input.status === "done" ? now : null,
            updatedAt: now,
          })
          .where(
            and(
              eq(onboardingProgress.restaurantId, restaurantId),
              eq(onboardingProgress.stepKey, input.stepKey)
            )
          );
      } else {
        await db.insert(onboardingProgress).values({
          restaurantId,
          stepKey: input.stepKey,
          status: input.status,
          completedAt: input.status === "done" ? now : null,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { success: true };
    }),

  /**
   * Markiert das gesamte Onboarding als abgeschlossen.
   */
  markCompleted: protectedProcedure.mutation(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
    const db = await getDb();
    await db
      .update(restaurants)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(restaurants.id, restaurantId));
    return { success: true };
  }),

  /**
   * Setzt den gesamten Fortschritt zurück (für Tests).
   */
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
    const db = await getDb();
    await db
      .update(restaurants)
      .set({ onboardingCompletedAt: null })
      .where(eq(restaurants.id, restaurantId));
    await db
      .delete(onboardingProgress)
      .where(eq(onboardingProgress.restaurantId, restaurantId));
    return { success: true };
  }),

  /** Rückwärtskompatibilität */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const restaurantId = ctx.user.restaurantId;
    if (!restaurantId) throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
    const db = await getDb();
    const [restaurant] = await db
      .select({ id: restaurants.id, name: restaurants.name, onboardingCompletedAt: restaurants.onboardingCompletedAt })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });
    const modules = await db
      .select({ moduleId: restaurantModules.moduleId })
      .from(restaurantModules)
      .where(and(eq(restaurantModules.restaurantId, restaurantId), eq(restaurantModules.status, "active")));
    const activeModuleIds = modules.map((m: { moduleId: string }) => m.moduleId);
    const [menuCatCount] = await db.select({ count: count() }).from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId));
    const [menuItemCount] = await db.select({ count: count() }).from(menuItems).where(eq(menuItems.restaurantId, restaurantId));
    const [inventoryCount] = await db.select({ count: count() }).from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId));
    return {
      isCompleted: !!restaurant.onboardingCompletedAt,
      onboardingCompletedAt: restaurant.onboardingCompletedAt,
      restaurantName: restaurant.name,
      hasWarehouse: activeModuleIds.includes("inventar"),
      activeModuleIds,
      stats: {
        menuCategories: menuCatCount?.count ?? 0,
        menuItems: menuItemCount?.count ?? 0,
        inventoryItems: inventoryCount?.count ?? 0,
      },
    };
  }),
});
