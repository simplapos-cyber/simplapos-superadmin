import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import bcrypt from "bcryptjs";
import {
  getUsersByRestaurant, countUsersByRestaurant,
  getRestaurantById, updateRestaurant,
  getRestaurantModules, updateRestaurantModule, startModuleTrial, getRestaurantModuleByModuleId,
  getTablesByRestaurant, createTable, updateTable, deleteTable,
  createUser, getUserByEmail,
  getContractByRestaurant,
  getRestaurantDashboardStats, getRevenueByHour, getRevenueSummary,
  getPaymentMethodBreakdown, getStaffPerformance, getTopProducts, getTopProductsWithId,
  getOrdersByRestaurant, getCriticalInventory, getInventoryByRestaurant,
  getCachedAiInsights, saveCachedAiInsights,
  getAccessPhase, getSubscriptionByRestaurant,
  getGiftCardStats,
} from "./db";
import { getDb } from "./db";
import { adminPinAttempts } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { MODULES } from "@shared/pricing";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";

// ─── Restaurant Admin Procedure (requires admin role + restaurantId) ─────────
const restaurantAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Allow admin, kellner, koch, buchhalter roles with a restaurantId
  if (!user.restaurantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  }
  // Only admin role can access admin panel (staff roles will have limited access later)
  if (user.role !== "admin" && user.role !== "superadmin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nur Administratoren haben Zugang zum Admin Panel" });
  }

  // Superadmin bypass: always allow
  if (user.role === "superadmin") {
    return next({ ctx: { ...ctx, restaurantId: user.restaurantId } });
  }

  // Check trial/subscription phase
  const accessInfo = await getAccessPhase(user.restaurantId);
  if (accessInfo.phase === "blocked") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "SUBSCRIPTION_BLOCKED",
    });
  }

  return next({ ctx: { ...ctx, restaurantId: user.restaurantId, accessPhase: accessInfo.phase } });
});

// ─── RESTAURANT ADMIN ROUTER ─────────────────────────────────────────────────
export const restaurantAdminRouter = router({
  // ─── Dashboard Overview ──────────────────────────────────────────────────────
  overview: restaurantAdminProcedure.query(async ({ ctx }) => {
    const [restaurant, modules, staff, contract] = await Promise.all([
      getRestaurantById(ctx.restaurantId),
      getRestaurantModules(ctx.restaurantId),
      getUsersByRestaurant(ctx.restaurantId),
      getContractByRestaurant(ctx.restaurantId),
    ]);
    
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

    // Calculate license info
    const extraPosModule = modules.find((m: { moduleId: string; quantity?: number }) => m.moduleId === "extra_pos");
    const totalLicenses = 1 + (extraPosModule?.quantity ?? 0);
    const usedLicenses = staff.length;

    // Module status summary
    const activeModules = modules.filter((m: { status: string }) => m.status === "active" || m.status === "trial");
    const trialModules = modules.filter((m: { status: string }) => m.status === "trial");
    const expiredTrials = modules.filter((m: { status: string }) => m.status === "trial_expired");

    return {
      restaurant,
      contract,
      stats: {
        totalLicenses,
        usedLicenses,
        activeModulesCount: activeModules.length,
        trialModulesCount: trialModules.length,
        expiredTrialsCount: expiredTrials.length,
      },
      modules: modules.map((m: { moduleId: string }) => ({
        ...m,
        meta: MODULES.find(mod => mod.id === m.moduleId),
      })),
    };
  }),

  // ─── Restaurant Settings ─────────────────────────────────────────────────────
  getSettings: restaurantAdminProcedure.query(async ({ ctx }) => {
    const restaurant = await getRestaurantById(ctx.restaurantId);
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
    return restaurant;
  }),

  updateSettings: restaurantAdminProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      address: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
      phone: z.string().optional(),
      phoneReceipt: z.string().optional(),
      email: z.string().email().optional(),
      website: z.string().optional(),
      vatNumber: z.string().optional(),
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      companyZip: z.string().optional(),
      companyCity: z.string().optional(),
      companyPhone: z.string().optional(),
      companyContact: z.string().optional(),
      currency: z.string().optional(),
      taxRate: z.string().optional(),
      openingHours: z.any().optional(),
      businessType: z.enum(["restaurant", "cafe", "bar", "hotel_restaurant", "food_truck", "catering", "bakery", "pizzeria", "sushi", "other"]).optional(),
      // Rechnungs-Bankverbindung
      invoiceIban: z.string().max(34).optional(),
      invoiceCreditorName: z.string().max(255).optional(),
      invoiceCreditorAddress: z.string().optional(),
      // Debitor-Saldowarnung
      debtorBalanceWarningThreshold: z.number().min(0).optional(),
      // Kellner-Berechtigungen
      waiterPermissions: z.object({
        canRecordPayment: z.boolean(),
        canSendInvoiceEmail: z.boolean(),
        canViewDunningPdf: z.boolean(),
      }).optional(),
      // Social Media
      instagramUrl: z.string().optional(),
      tiktokUrl: z.string().optional(),
      facebookUrl: z.string().optional(),
      googleMapsUrl: z.string().optional(),
      tripadvisorUrl: z.string().optional(),
      youtubeUrl: z.string().optional(),
      // Geschenkkarten
      giftCardBackgroundUrl: z.string().max(500).optional(),
      // Bon-Marketing
      receiptSlogan: z.string().max(255).optional(),
      receiptWifiName: z.string().max(128).optional(),
      receiptWifiPassword: z.string().max(128).optional(),
      receiptDiscountCode: z.string().max(64).optional(),
      receiptDiscountPercent: z.number().int().min(0).max(100).optional(),
      receiptShowSocial: z.boolean().optional(),
      receiptShowGoogleReview: z.boolean().optional(),
      receiptCustomMessage: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { debtorBalanceWarningThreshold, waiterPermissions, ...rest } = input;
      await updateRestaurant(ctx.restaurantId, {
        ...rest,
        ...(debtorBalanceWarningThreshold !== undefined
          ? { debtorBalanceWarningThreshold: String(debtorBalanceWarningThreshold) }
          : {}),
        ...(waiterPermissions !== undefined
          ? { waiterPermissions: JSON.stringify(waiterPermissions) }
          : {}),
      });
      return { success: true };
    }),

  // ─── Zentralkasse Admin-PIN ────────────────────────────────────────────────
  getAdminPin: restaurantAdminProcedure.query(async ({ ctx }) => {
    const restaurant = await getRestaurantById(ctx.restaurantId);
    if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
    return { pin: restaurant.zentralkasseAdminPin ?? "110293" };
  }),

  setAdminPin: restaurantAdminProcedure
    .input(z.object({
      currentPin: z.string().min(4).max(64),
      newPin: z.string().min(4).max(64).regex(/^\d+$/, "PIN darf nur Ziffern enthalten"),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurant = await getRestaurantById(ctx.restaurantId);
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });
      const storedPin = restaurant.zentralkasseAdminPin ?? "110293";
      if (input.currentPin !== storedPin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Aktueller PIN ist falsch" });
      }
      await updateRestaurant(ctx.restaurantId, { zentralkasseAdminPin: input.newPin });
      return { success: true };
    }),

  // Fehlversuch/Erfolg-Versuch loggen (wird vom Frontend aufgerufen)
  logAdminPinAttempt: restaurantAdminProcedure
    .input(z.object({
      success: z.boolean(),
      ipAddress: z.string().max(64).optional(),
      userAgent: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db.insert(adminPinAttempts).values({
        restaurantId: ctx.restaurantId,
        success: input.success,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      });
      return { success: true };
    }),

  // Letzte Admin-PIN-Versuche abrufen (nur Admin)
  getAdminPinAttempts: restaurantAdminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const attempts = await db
        .select()
        .from(adminPinAttempts)
        .where(eq(adminPinAttempts.restaurantId, ctx.restaurantId))
        .orderBy(desc(adminPinAttempts.createdAt))
        .limit(input.limit);
      return attempts;
    }),

  // ─── Staff / Mitarbeiter ─────────────────────────────────────────────────────
  listStaff: restaurantAdminProcedure.query(async ({ ctx }) => {
    const staff = await getUsersByRestaurant(ctx.restaurantId);
    return staff.map((s: { passwordHash?: string; [key: string]: unknown }) => {
      const { passwordHash: _ph, ...safe } = s;
      return safe;
    });
  }),

  createStaff: restaurantAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["admin", "kellner", "koch", "buchhalter"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check license limit
      const modules = await getRestaurantModules(ctx.restaurantId);
      const extraPosModule = modules.find((m: { moduleId: string; status: string; quantity?: number }) => m.moduleId === "extra_pos" && (m.status === "active" || m.status === "trial"));
      const totalLicenses = 1 + (extraPosModule?.quantity ?? 0);
      const currentStaff = await countUsersByRestaurant(ctx.restaurantId);
      
      if (currentStaff >= totalLicenses) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Maximale Anzahl Lizenzen erreicht (${totalLicenses}). Bitte upgraden Sie Ihren Vertrag für weitere Kassen/Mitarbeiter.`,
        });
      }

      // Check if email already exists
      const existing = await getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Diese E-Mail-Adresse ist bereits registriert" });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      await createUser({
        email: input.email.toLowerCase(),
        passwordHash,
        name: input.name,
        role: input.role,
        status: "active",
        restaurantId: ctx.restaurantId,
      });

      return { success: true };
    }),

  updateStaff: restaurantAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      role: z.enum(["admin", "kellner", "koch", "buchhalter"]).optional(),
      status: z.enum(["active", "inactive", "suspended"]).optional(),
      password: z.string().min(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the user belongs to this restaurant
      const staff = await getUsersByRestaurant(ctx.restaurantId);
      const target = staff.find((s: { id: number }) => s.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Mitarbeiter nicht gefunden" });

      const updateData: any = {};
      if (input.name) updateData.name = input.name;
      if (input.role) updateData.role = input.role;
      if (input.status) updateData.status = input.status;
      if (input.password) updateData.passwordHash = await bcrypt.hash(input.password, 10);

      const { updateUser } = await import("./db");
      await updateUser(input.id, updateData);
      return { success: true };
    }),

  deleteStaff: restaurantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await getUsersByRestaurant(ctx.restaurantId);
      const target = staff.find((s: { id: number }) => s.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      // Cannot delete yourself
      if (target.id === ctx.user!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sie können sich nicht selbst löschen" });
      }
      const { deleteUser } = await import("./db");
      await deleteUser(input.id);
      return { success: true };
    }),

  // ─── Modules ─────────────────────────────────────────────────────────────────
  listModules: restaurantAdminProcedure.query(async ({ ctx }) => {
    const modules = await getRestaurantModules(ctx.restaurantId);
    
    // Get all available modules and mark which are active/trial/available
    const allModules = MODULES.map(mod => {
      const existing = modules.find((m: { moduleId: string }) => m.moduleId === mod.id);
      return {
        ...mod,
        dbRecord: existing || null,
        status: existing?.status || "not_subscribed" as string,
        quantity: existing?.quantity || 0,
        trialEndsAt: existing?.trialEndsAt || null,
        trialStartedAt: existing?.trialStartedAt || null,
      };
    });

    return allModules;
  }),

  startTrial: restaurantAdminProcedure
    .input(z.object({ moduleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if module already exists
      const existing = await getRestaurantModuleByModuleId(ctx.restaurantId, input.moduleId);
      if (existing) {
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Dieses Modul ist bereits aktiv" });
        }
        if (existing.status === "trial") {
          throw new TRPCError({ code: "CONFLICT", message: "Testphase läuft bereits" });
        }
        if (existing.status === "trial_expired") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Testphase bereits abgelaufen. Bitte Modul kaufen." });
        }
      }

      await startModuleTrial(ctx.restaurantId, input.moduleId);
      return { success: true, message: "7-Tage Testphase gestartet" };
    }),

  // ─── Tables / Tischplan ──────────────────────────────────────────────────────
  listTables: restaurantAdminProcedure.query(async ({ ctx }) => {
    return getTablesByRestaurant(ctx.restaurantId);
  }),

  createTable: restaurantAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      seats: z.number().min(1).default(4),
      area: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await createTable({
        restaurantId: ctx.restaurantId,
        name: input.name,
        seats: input.seats,
        area: input.area || null,
        isActive: true,
      });
      return result;
    }),

  updateTable: restaurantAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      seats: z.number().min(1).optional(),
      area: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify table belongs to restaurant
      const tables = await getTablesByRestaurant(ctx.restaurantId);
      const target = tables.find((t: { id: number }) => t.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      await updateTable(id, data);
      return { success: true };
    }),

  deleteTable: restaurantAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tables = await getTablesByRestaurant(ctx.restaurantId);
      const target = tables.find((t: any) => t.id === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteTable(input.id);
      return { success: true };
    }),

  // ─── LIVE DASHBOARD DATA ──────────────────────────────────────────────────
  dashboardStats: restaurantAdminProcedure
    .query(async ({ ctx }) => {
      const stats = await getRestaurantDashboardStats(ctx.restaurantId);
      return stats || {
        todayOrderCount: 0,
        todayRevenue: 0,
        openOrderCount: 0,
        totalTables: 0,
        occupiedTables: 0,
        staffCount: 0,
      };
    }),

  revenueByHour: restaurantAdminProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const date = input?.date ? new Date(input.date) : undefined;
      return getRevenueByHour(ctx.restaurantId, date);
    }),

  revenueSummary: restaurantAdminProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const date = input?.date ? new Date(input.date) : undefined;
      const summary = await getRevenueSummary(ctx.restaurantId, date);
      return summary || { gross: 0, net: 0, vat: 0, tips: 0, avgTicket: 0, salesCount: 0 };
    }),

  paymentMethods: restaurantAdminProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const date = input?.date ? new Date(input.date) : undefined;
      const methods = await getPaymentMethodBreakdown(ctx.restaurantId, date);
      const colorMap: Record<string, string> = {
        cash: "#10b981", card: "#3b82f6", twint: "#8b5cf6",
        online: "#f59e0b", invoice: "#6b7280",
      };
      const nameMap: Record<string, string> = {
        cash: "Bar", card: "Karte", twint: "TWINT",
        online: "Online", invoice: "Rechnung",
      };
      return methods.map((m: any) => ({
        name: nameMap[m.method] || m.method || "Unbekannt",
        value: parseFloat(m.total),
        color: colorMap[m.method] || "#6b7280",
      }));
    }),

  staffPerformance: restaurantAdminProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const date = input?.date ? new Date(input.date) : undefined;
      const perf = await getStaffPerformance(ctx.restaurantId, date);
      // Enrich with staff names
      const staff = await getUsersByRestaurant(ctx.restaurantId);
      return perf.map((p: any) => {
        const user = staff.find((s: any) => s.id === p.staffId);
        return {
          name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : `Mitarbeiter #${p.staffId}`,
          revenue: parseFloat(p.revenue),
          sales: p.sales,
          tips: parseFloat(p.tips),
        };
      });
    }),

  topProducts: restaurantAdminProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const products = await getTopProducts(ctx.restaurantId, input?.limit || 5);
      return products.map((p: any) => ({
        name: p.name,
        sales: Number(p.sales),
        revenue: parseFloat(p.revenue),
      }));
    }),

  topFavorites: restaurantAdminProcedure
    .input(z.object({ limit: z.number().optional(), topCategoryId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const items = await getTopProductsWithId(ctx.restaurantId, input?.limit || 8, input?.topCategoryId);
      return items.map((p: any) => ({
        productId: p.productId as number,
        name: p.name as string,
        unitPrice: parseFloat(p.unitPrice),
        itemType: p.itemType as string,
        sales: Number(p.sales),
      }));
    }),
    activeOrders: restaurantAdminProcedure
    .query(async ({ ctx }) => {
      const pending = await getOrdersByRestaurant(ctx.restaurantId, { status: "pending" });
      const preparing = await getOrdersByRestaurant(ctx.restaurantId, { status: "preparing" });
      return {
        pending: pending.length,
        preparing: preparing.length,
        total: pending.length + preparing.length,
        orders: [...pending, ...preparing].slice(0, 20).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          type: o.type,
          totalAmount: o.totalAmount,
          createdAt: o.createdAt,
          tableId: o.tableId,
        })),
      };
    }),

  inventory: restaurantAdminProcedure
    .query(async ({ ctx }) => {
      const critical = await getCriticalInventory(ctx.restaurantId);
      const all = await getInventoryByRestaurant(ctx.restaurantId);
      return {
        critical: critical.map((i: any) => ({
          product: i.name,
          stock: parseFloat(i.currentStock),
          minStock: parseFloat(i.minStock),
          unit: i.unit,
        })),
        total: all.length,
        totalValue: all.reduce((sum: number, i: any) => sum + parseFloat(i.currentStock) * parseFloat(i.costPerUnit), 0),
      };
    }),

  // ─── KI BUSINESS ASSISTENT ────────────────────────────────────────────────
  aiInsights: restaurantAdminProcedure
    .input(z.object({ forceRefresh: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Check cache first (valid for 30 minutes)
      if (!input?.forceRefresh) {
        const cached = await getCachedAiInsights(ctx.restaurantId);
        if (cached && (Date.now() - new Date(cached.generatedAt).getTime()) < 30 * 60 * 1000) {
          return cached.insights as any;
        }
      }

      // Gather current restaurant data for context
      const [stats, revenue, topProds, criticalInv, staff] = await Promise.all([
        getRestaurantDashboardStats(ctx.restaurantId),
        getRevenueSummary(ctx.restaurantId),
        getTopProducts(ctx.restaurantId, 10),
        getCriticalInventory(ctx.restaurantId),
        getUsersByRestaurant(ctx.restaurantId),
      ]);

      const restaurant = await getRestaurantById(ctx.restaurantId);

      const contextData = {
        restaurantName: restaurant?.name || "Restaurant",
        stats,
        revenue,
        topProducts: topProds,
        criticalInventory: criticalInv,
        staffCount: staff.length,
        currentTime: new Date().toISOString(),
        dayOfWeek: new Date().toLocaleDateString("de-CH", { weekday: "long" }),
      };

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `Du bist ein KI-Business-Assistent für Schweizer Restaurants. Analysiere die aktuellen Betriebsdaten und gib konkrete, umsetzbare Empfehlungen auf Deutsch. Antworte ausschliesslich im folgenden JSON-Format ohne zusätzlichen Text:\n{\n  "opportunities": ["...", "..."],\n  "risks": ["...", "..."],\n  "forecast": { "expectedRevenue": number, "confidence": number, "basedOn": "..." },\n  "recommendations": ["...", "...", "..."]\n}\nHalte jede Empfehlung unter 150 Zeichen. Gib 2-3 Chancen, 1-3 Risiken und 2-4 Empfehlungen.`,
            },
            {
              role: "user",
              content: `Hier sind die aktuellen Betriebsdaten von "${contextData.restaurantName}" (${contextData.dayOfWeek}, ${contextData.currentTime}):\n\n${JSON.stringify(contextData, null, 2)}\n\nBitte analysiere die Daten und gib deine Einschätzung.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ai_insights",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  opportunities: { type: "array", items: { type: "string" } },
                  risks: { type: "array", items: { type: "string" } },
                  forecast: {
                    type: "object",
                    properties: {
                      expectedRevenue: { type: "number" },
                      confidence: { type: "number" },
                      basedOn: { type: "string" },
                    },
                    required: ["expectedRevenue", "confidence", "basedOn"],
                    additionalProperties: false,
                  },
                  recommendations: { type: "array", items: { type: "string" } },
                },
                required: ["opportunities", "risks", "forecast", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        let insights;
        if (typeof content === "string") {
          insights = JSON.parse(content);
        } else {
          insights = JSON.parse((content as any)?.[0]?.text || "{}");
        }

        // Cache the result
        await saveCachedAiInsights(ctx.restaurantId, insights);
        return insights;
      } catch (error: any) {
        console.error("[AI Insights] Error:", error.message);
        // Return cached if available, otherwise fallback
        const cached = await getCachedAiInsights(ctx.restaurantId);
        if (cached) return cached.insights;
        return {
          opportunities: ["KI-Analyse momentan nicht verfügbar. Bitte später erneut versuchen."],
          risks: ["Keine Daten verfügbar."],
          forecast: { expectedRevenue: 0, confidence: 0, basedOn: "Keine Daten" },
          recommendations: ["Bitte versuchen Sie es in einigen Minuten erneut."],
        };
      }
    }),

  // ─── PUSH-BENACHRICHTIGUNGEN BEI KRITISCHEN WARNUNGEN ─────────────────────
  checkAndNotifyCritical: restaurantAdminProcedure
    .mutation(async ({ ctx }) => {
      const restaurant = await getRestaurantById(ctx.restaurantId);
      const restaurantName = restaurant?.name || `Restaurant #${ctx.restaurantId}`;
      const notifications: string[] = [];

      // Check critical inventory
      const criticalItems = await getCriticalInventory(ctx.restaurantId);
      if (criticalItems.length > 0) {
        const itemList = criticalItems.map((i: any) => `${i.name}: ${i.currentStock}/${i.minStock} ${i.unit}`).join(", ");
        notifications.push(`Kritischer Lagerbestand: ${itemList}`);
      }

      // Check delayed orders (orders pending > 20 min)
      const pendingOrders = await getOrdersByRestaurant(ctx.restaurantId, { status: "pending" });
      const delayedOrders = pendingOrders.filter((o: any) => {
        const waitMs = Date.now() - new Date(o.createdAt).getTime();
        return waitMs > 20 * 60 * 1000; // > 20 minutes
      });
      if (delayedOrders.length > 0) {
        notifications.push(`${delayedOrders.length} Bestellung(en) warten seit über 20 Minuten!`);
      }

      // Send notification if there are critical issues
      if (notifications.length > 0) {
        await notifyOwner({
          title: `⚠️ Kritische Warnung: ${restaurantName}`,
          content: notifications.join("\n\n"),
        });
      }

      return { sent: notifications.length > 0, notifications };
    }),

  // ─── GESCHENKKARTEN-STATISTIKEN (steuergerecht) ───────────────────────────
  giftCardStats: restaurantAdminProcedure
    .query(async ({ ctx }) => {
      return getGiftCardStats(ctx.restaurantId);
    }),
});
