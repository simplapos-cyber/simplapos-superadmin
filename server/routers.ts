import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import bcrypt from "bcryptjs";
import { getUserByEmail, getUserById, createUser, deleteUser, createVerificationCode, getVerificationCode, deleteVerificationCodes, activateUser, upsertActiveSession, getActiveSession, deleteActiveSession } from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import {
  getAllUsers, updateUser,
  getAllRestaurants, getRestaurantById, createRestaurant, updateRestaurant, deleteRestaurant,
  getCategoriesByRestaurant, createCategory, updateCategory, deleteCategory,
  getProductsByRestaurant, createProduct, updateProduct, deleteProduct,
  getTablesByRestaurant, createTable, updateTable, deleteTable,
  getChatConversations, getChatMessages, getChatConversationById, createChatConversation, createChatMessage, updateConversationStatus,
  getAllAdvertisements, createAdvertisement, updateAdvertisement, deleteAdvertisement,
  getAllReviews, updateReview,
  getAllContracts, createContract, updateContract, deleteContract,
  getAllInvoices, createInvoice, updateInvoice,
  getAllMedia, createMediaItem, getMediaById, deleteMediaItem,
  getDashboardStats,
  createRestaurantModules, getActiveRestaurantModules,
  createSubscription, getSubscriptionByRestaurant, updateSubscription, getAllSubscriptions,
  getAccessPhase,
  getPaymentsByRestaurant, getAllPayments,
  getHardwareProducts, getHardwareProductById, createHardwareProduct, updateHardwareProduct, deleteHardwareProduct,
  createActivationToken, getActivationToken, markActivationTokenUsed,
  getContractById, getActivationTokenByContractId,
} from "./db";
import { createCheckoutSession, createRenewalCheckoutSession } from "./stripe";
import { sendContractConfirmationEmail } from "./contractEmail";
import { generateContractPdf } from "./contractPdf";
import { restaurantAdminRouter } from "./restaurantAdminRouter";
import { kassenbuchRouter, steuerexportRouter, nutritionRouter, multilangMenuRouter, bewertungsRouter } from "./newModulesRouter";
import { floorPlanRouter } from "./floorPlanRouter";
import { menuRouter } from "./menuRouter";
import { orderRouter } from "./orderRouter";
import { reservationsRouter } from "./reservationsRouter";
import { inventoryRouter } from "./inventoryRouter";
import { warehouseRouter } from "./warehouseRouter";
import { closingsRouter } from "./closingsRouter";
import { closingReportRouter } from "./closingReport";
import { shiftsRouter } from "./shiftsRouter";
import { adminShiftsRouter } from "./adminShiftsRouter";
import { absencesRouter } from "./absencesRouter";
import { aiPlanningRouter } from "./aiPlanningRouter";
import { shiftSwapRouter } from "./shiftSwapRouter";
import { qrOrderRouter } from "./routers/qrOrderRouter";
import { onboardingRouter } from "./onboardingRouter";
import { chatbotRouter } from "./chatbotRouter";
import { voucherRouter } from "./voucherRouter";
import { loyaltyRouter } from "./loyaltyRouter";
import { printerRouter } from "./printerRouter";
import { localConnectRouter } from "./localConnectRouter";
import { deviceRouter } from "./deviceRouter";
import { sumupRouter } from "./sumupRouter";
import { paytecRouter, nexiRouter } from "./paytecNexiRouter";
import { statisticsRouter } from "./statisticsRouter";
import { voiceOrderRouter } from "./voiceOrderRouter";
import { courseRouter } from "./courseRouter";
import { kioskRouter, trainingRouter, upsellingRouter, pickupRouter } from "./routers/kioskRouter";
import { invoicingRouter } from "./invoicingRouter";
import { recurringInvoiceRouter } from "./recurringInvoiceRouter";
import { debtorRouter } from "./debtorRouter";
import { aiImportRouter } from "./aiImportRouter";
import { adminSetupRouter } from "./adminSetupRouter";
import { tuyaRouter } from "./routers/tuya";
import { marketingRouter } from "./routers/marketing";
import { backupRouter } from "./backupRouter";
import { systemMonitorRouter } from "./routers/systemMonitor";
import { qrorpaRouter } from "./qrorpaRouter";
import { reportRouter } from "./reportRouter";
import { countryConfigRouter } from "./countryConfigRouter";
import crypto from "crypto";

// M3: In-Memory E-Mail-Rate-Limiting (kein DB-Change, kein externer Store)
// Wird bei Serverstart initialisiert, leert sich bei Neustart (akzeptabel)
const loginEmailAttempts = new Map<string, { count: number; windowStart: number }>();

// Helper: Resend Activation Notification
async function sendResendNotification(contract: any, recipientEmail: string, activationLink: string) {
  const { ENV } = await import("./_core/env");
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const endpoint = new URL("webdevtoken.v1.WebDevService/SendNotification", baseUrl).toString();

  const content = `Aktivierungslink für ${contract.restaurantName || contract.title}\n\nVertrag #${contract.id}\nE-Mail: ${recipientEmail}\n\nAktivierungslink (72h gültig):\n→ ${activationLink}\n\nDer Restaurantbetreiber kann über diesen Link sein Passwort setzen und sich erstmals anmelden.`;

  await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
      "content-type": "application/json",
      "connect-protocol-version": "1",
    },
    body: JSON.stringify({
      title: `Aktivierungslink erneut gesendet – ${contract.restaurantName || contract.title} (${recipientEmail})`,
      content,
    }),
  });
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async () => {
    return await getDashboardStats();
  }),
});

// ─── RESTAURANTS ──────────────────────────────────────────────────────────────
const restaurantsRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => getAllRestaurants(input?.search)),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getRestaurantById(input.id)),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      status: z.enum(["active", "inactive", "suspended", "trial"]).optional(),
      currency: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => createRestaurant(input)),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      slug: z.string().optional(),
      logoUrl: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().optional(),
      status: z.enum(["active", "inactive", "suspended", "trial"]).optional(),
      openingHours: z.any().optional(),
      currency: z.string().optional(),
      taxRate: z.string().optional(),
      notes: z.string().optional(),
      riskScore: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateRestaurant(id, data);
      return getRestaurantById(id);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteRestaurant(input.id); return { success: true }; }),

  // Categories
  categories: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => getCategoriesByRestaurant(input.restaurantId)),

  createCategory: protectedProcedure
    .input(z.object({ restaurantId: z.number(), name: z.string(), imageUrl: z.string().optional(), sortOrder: z.number().optional() }))
    .mutation(async ({ input }) => createCategory(input)),

  updateCategory: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), imageUrl: z.string().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateCategory(id, data); return { success: true }; }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteCategory(input.id); return { success: true }; }),

  // Products
  products: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => getProductsByRestaurant(input.restaurantId)),

  createProduct: protectedProcedure
    .input(z.object({
      restaurantId: z.number(), categoryId: z.number().optional(),
      name: z.string(), description: z.string().optional(),
      price: z.string(), imageUrl: z.string().optional(),
      isActive: z.boolean().optional(), sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => createProduct(input)),

  updateProduct: protectedProcedure
    .input(z.object({
      id: z.number(), name: z.string().optional(), description: z.string().optional(),
      price: z.string().optional(), imageUrl: z.string().optional(),
      isActive: z.boolean().optional(), categoryId: z.number().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateProduct(id, data); return { success: true }; }),

  deleteProduct: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteProduct(input.id); return { success: true }; }),

  // Tables
  tables: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => getTablesByRestaurant(input.restaurantId)),

  createTable: protectedProcedure
    .input(z.object({ restaurantId: z.number(), name: z.string(), seats: z.number().optional(), area: z.string().optional() }))
    .mutation(async ({ input }) => createTable(input)),

  updateTable: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().optional(), seats: z.number().optional(), area: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateTable(id, data); return { success: true }; }),

  deleteTable: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteTable(input.id); return { success: true }; }),

  // Restaurant Modules (active modules for a restaurant)
  modules: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => getActiveRestaurantModules(input.restaurantId)),
});

// ─── USERS ────────────────────────────────────────────────────────────────────
const usersRouter = router({
  list: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => getAllUsers(input?.search)),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      role: z.enum(["superadmin", "admin", "kellner", "koch", "buchhalter", "gast", "partner", "user"]).optional(),
      status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
      restaurantId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateUser(id, data as any); return { success: true }; }),
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────
const chatRouter = router({
  conversations: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      // M2: Multi-Tenant-Isolation – Admins/Superadmins sehen alle, andere nur eigene
      const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'superadmin';
      const allConversations = await getChatConversations(input?.status);
      if (isAdmin) return allConversations;
      // Nicht-Admins sehen nur Konversationen ihres Restaurants
      const userRestaurantId = ctx.user?.restaurantId;
      if (!userRestaurantId) return [];
      return allConversations.filter((c: { restaurantId: number | null }) => c.restaurantId === userRestaurantId);
    }),

  messages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input, ctx }) => {
      // M2: Multi-Tenant-Isolation – Eigentümercheck vor dem Lesen der Nachrichten
      const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'superadmin';
      if (!isAdmin) {
        const conversation = await getChatConversationById(input.conversationId);
        if (!conversation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Konversation nicht gefunden' });
        if (conversation.restaurantId !== ctx.user?.restaurantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Kein Zugriff auf diese Konversation' });
        }
      }
      return getChatMessages(input.conversationId);
    }),

  createConversation: protectedProcedure
    .input(z.object({ userId: z.number(), restaurantId: z.number().optional(), subject: z.string().optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional() }))
    .mutation(async ({ input }) => createChatConversation(input)),

  sendMessage: protectedProcedure
    .input(z.object({ conversationId: z.number(), content: z.string(), senderType: z.enum(["user", "superadmin", "ai"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      const msg = await createChatMessage({
        conversationId: input.conversationId,
        senderId: ctx.user?.id,
        senderType: input.senderType ?? "superadmin",
        content: input.content,
      });
      return msg;
    }),

  aiReply: protectedProcedure
    .input(z.object({ conversationId: z.number(), userMessage: z.string() }))
    .mutation(async ({ input }) => {
      const aiResponse = await invokeLLM({
        messages: [
          { role: "system", content: "Du bist der Simplapos Support-Assistent. Beantworte Fragen zu dem Kassensystem Simplapos professionell und hilfreich auf Deutsch. Wenn du eine Frage nicht beantworten kannst, eskaliere an den menschlichen Support." },
          { role: "user", content: input.userMessage },
        ],
      });
      const rawContent = aiResponse.choices[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : "Ich konnte keine Antwort generieren.";
      const msg = await createChatMessage({
        conversationId: input.conversationId,
        senderType: "ai",
        content,
      });
      return msg;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["open", "ai_handled", "escalated", "resolved", "closed"]) }))
    .mutation(async ({ input }) => { await updateConversationStatus(input.id, input.status); return { success: true }; }),
});

// ─── ADVERTISEMENTS ───────────────────────────────────────────────────────────
const advertisementsRouter = router({
  list: adminProcedure.query(async () => getAllAdvertisements()),

  create: adminProcedure
    .input(z.object({
      title: z.string(),
      imageUrl: z.string().optional(),
      linkUrl: z.string().optional(),
      targetType: z.enum(["all", "specific"]).optional(),
      restaurantIds: z.any().optional(),
      isActive: z.boolean().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .mutation(async ({ input }) => createAdvertisement(input)),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      imageUrl: z.string().optional(),
      linkUrl: z.string().optional(),
      targetType: z.enum(["all", "specific"]).optional(),
      restaurantIds: z.any().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateAdvertisement(id, data); return { success: true }; }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteAdvertisement(input.id); return { success: true }; }),
});

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
const reviewsRouter = router({
  list: protectedProcedure
    .input(z.object({ type: z.string().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => getAllReviews(input?.type, input?.status)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "approved", "rejected", "hidden"]).optional(),
      response: z.string().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateReview(id, data); return { success: true }; }),
});

// ─── CONTRACTS ────────────────────────────────────────────────────────────────
const contractsRouter = router({
  list: adminProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => getAllContracts(input?.search)),

  // Full contract wizard: creates contract + restaurant + staff accounts
  createWithRestaurant: protectedProcedure
    .input(z.object({
      // Billing
      billingCycle: z.enum(["monthly", "yearly"]),
      contractType: z.enum(["standard", "referral", "dropshipping", "partner"]).optional(),
      partnerId: z.number().optional(),
      // Restaurant info
      restaurantName: z.string().min(1),
      restaurantAddress: z.string().optional(),
      restaurantZip: z.string().optional(),
      restaurantCity: z.string().optional(),
      restaurantPhone: z.string().optional(),
      restaurantPhoneReceipt: z.string().optional(),
      restaurantEmail: z.string().email().optional(),
      restaurantVatNumber: z.string().optional(),
      // Company info (optional)
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      companyZip: z.string().optional(),
      companyCity: z.string().optional(),
      companyPhone: z.string().optional(),
      companyContact: z.string().optional(),
      // Configuration
      numEmployees: z.number().min(1).default(1),
      // Modular modules selection
      selectedModules: z.array(z.object({
        moduleId: z.string(),
        quantity: z.number().min(1).default(1),
      })),

      // Hardware selection (optional)
      hardwareItems: z.array(z.object({
        productId: z.number(),
        name: z.string(),
        quantity: z.number().min(1),
        unitPrice: z.number(),
      })).optional(),
      // Signing
      signedByName: z.string().optional(),
      signedByEmail: z.string().email().optional(),
      notes: z.string().optional(),
      // Frontend origin for activation link
      origin: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { calculateModularPricing, calculateAnnualPrice } = await import("../shared/pricing");
      const pricing = calculateModularPricing(input.selectedModules);
      const effectiveMonthly = input.billingCycle === "yearly"
        ? calculateAnnualPrice(pricing.monthlyTotal)
        : pricing.monthlyTotal;

      // Determine creator attribution
      const createdByUserId = ctx.user?.id ?? null;
      const createdByName = ctx.user?.name ?? "Unbekannt";
      let createdByType: "partner" | "online" | "superadmin" = "online";
      if (ctx.user?.role === "partner") createdByType = "partner";
      else if (ctx.user?.role === "superadmin" || ctx.user?.role === "admin") createdByType = "superadmin";

      // 1. Create restaurant with pending_verification status
      const restaurant = await createRestaurant({
        name: input.restaurantName,
        address: input.restaurantAddress,
        zip: input.restaurantZip,
        city: input.restaurantCity,
        phone: input.restaurantPhone,
        phoneReceipt: input.restaurantPhoneReceipt,
        email: input.restaurantEmail,
        vatNumber: input.restaurantVatNumber,
        companyName: input.companyName,
        companyAddress: input.companyAddress,
        companyZip: input.companyZip,
        companyCity: input.companyCity,
        companyPhone: input.companyPhone,
        companyContact: input.companyContact,
        status: "pending_verification",
      });


      // Derive legacy fields from selectedModules
      const numPosTerminals = input.selectedModules.find(m => m.moduleId === 'extra_pos')?.quantity ?? 1;
      const numKdsScreens = input.selectedModules.find(m => m.moduleId === 'kds')?.quantity ?? 0;
      const featureIds = input.selectedModules.map(m => m.moduleId);

      // Calculate hardware total
      const hardwareTotal = (input.hardwareItems || []).reduce(
        (sum, item) => sum + item.unitPrice * item.quantity, 0
      );

      // 3. Create contract with pending_verification status
      const contract = await createContract({
        restaurantId: restaurant.id,
        contractType: input.contractType || "standard",
        partnerId: input.partnerId ?? (ctx.user?.role === "partner" ? ctx.user.id : undefined),
        title: `Vertrag - ${input.restaurantName} (MODULAR)`,
        status: "pending_verification",
        plan: "modular",
        billingCycle: input.billingCycle,
        restaurantName: input.restaurantName,
        restaurantAddress: input.restaurantAddress,
        restaurantCity: input.restaurantCity,
        restaurantPhone: input.restaurantPhone,
        restaurantEmail: input.restaurantEmail,
        restaurantZip: input.restaurantZip,
        restaurantPhoneReceipt: input.restaurantPhoneReceipt,
        restaurantVatNumber: input.restaurantVatNumber,
        companyName: input.companyName,
        companyAddress: input.companyAddress,
        companyZip: input.companyZip,
        companyCity: input.companyCity,
        companyPhone: input.companyPhone,
        companyContact: input.companyContact,
        numEmployees: input.numEmployees,
        numPosTerminals: numPosTerminals,
        numKdsScreens: numKdsScreens,
        features: featureIds,
        employees: [],
        hardwareItems: input.hardwareItems || [],
        hardwareTotal: hardwareTotal.toFixed(2),
        basePriceMonthly: "89.00",
        addOnsMonthly: (pricing.monthlyTotal - 89).toFixed(2),
        setupFee: pricing.oneTimeTotal.toFixed(2),
        monthlyFee: effectiveMonthly.toFixed(2),
        signedAt: new Date(),
        signedByName: input.signedByName,
        signedByEmail: input.signedByEmail,
        startDate: new Date(),
        notes: input.notes,
        createdByUserId,
        createdByName,
        createdByType,
      });

      // 4. Auto-provision modules in restaurant_modules (status pending until verified)
      const moduleRecords = input.selectedModules.map(m => ({
        restaurantId: restaurant.id,
        contractId: contract.id,
        moduleId: m.moduleId,
        quantity: m.quantity || 1,
        status: "active" as const,
        activatedAt: new Date(),
      }));
      if (moduleRecords.length > 0) {
        await createRestaurantModules(moduleRecords);
      }

      // 5. Create subscription (pending until first payment)
      const subscription = await createSubscription({
        restaurantId: restaurant.id,
        contractId: contract.id,
        billingCycle: input.billingCycle || "monthly",
        monthlyAmount: effectiveMonthly.toFixed(2),
        status: "pending",
      });

      // 6. Notify owner about new contract pending verification
      try {
        await notifyOwner({
          title: "Neuer Vertrag zur Prüfung",
          content: `Ein neuer Vertrag wurde eingereicht:\n\nRestaurant: ${input.restaurantName}\nVertragsart: ${input.contractType || "standard"}\nMonatlich: CHF ${effectiveMonthly}\nErstellt von: ${createdByName} (${createdByType})\n\nBitte im Superadmin-Panel prüfen und freigeben.`,
        });
      } catch (e) {
        // Non-fatal: notification failure shouldn't block contract creation
      }

      // 7. Send contract confirmation email with PDF and activation link
      const recipientEmail = input.signedByEmail || input.restaurantEmail;
      if (recipientEmail) {
        try {
          const origin = input.origin || ctx.req?.headers?.origin || "https://simplapos.com";
          await sendContractConfirmationEmail({
            contractId: contract.id,
            restaurantName: input.restaurantName,
            restaurantAddress: input.restaurantAddress,
            restaurantZip: input.restaurantZip,
            restaurantCity: input.restaurantCity,
            restaurantPhone: input.restaurantPhone,
            restaurantPhoneReceipt: input.restaurantPhoneReceipt,
            restaurantEmail: input.restaurantEmail,
            restaurantVatNumber: input.restaurantVatNumber,
            companyName: input.companyName,
            companyAddress: input.companyAddress,
            companyZip: input.companyZip,
            companyCity: input.companyCity,
            companyPhone: input.companyPhone,
            companyContact: input.companyContact,
            contractType: input.contractType || "standard",
            billingCycle: input.billingCycle,
            selectedModules: input.selectedModules,
            hardwareItems: input.hardwareItems,
            numEmployees: input.numEmployees,
            monthlyFee: effectiveMonthly.toFixed(2),
            signedByName: input.signedByName,
            signedByEmail: input.signedByEmail,
            signedAt: new Date(),
            recipientEmail,
            userId: undefined, // User created during staff provisioning
            restaurantId: restaurant.id,
            origin,
          });
        } catch (e) {
          console.warn("[Contract] Email sending failed:", e);
          // Non-fatal
        }
      }

      return { contract, restaurant, pricing, subscription };
    }),

  // Approve a pending contract (superadmin/admin only)
  approve: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Admins können Verträge freigeben" });
      }
      const allContracts = await getAllContracts();
      const contract = allContracts.find((c: any) => c.id === input.contractId);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Vertrag nicht gefunden" });
      if ((contract as any).status !== "pending_verification") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vertrag ist nicht im Status 'Ausstehend'" });
      }

      // Activate contract
      await updateContract(input.contractId, {
        status: "active",
        verifiedAt: new Date(),
        verifiedByUserId: ctx.user.id,
      } as any);

      // Activate restaurant
      const restaurantId = (contract as any).restaurantId;
      if (restaurantId) {
        await updateRestaurant(restaurantId, { status: "active" } as any);
      }

      return { success: true };
    }),

  // Reject a pending contract (superadmin/admin only)
  reject: protectedProcedure
    .input(z.object({ contractId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Admins können Verträge ablehnen" });
      }
      const allContracts = await getAllContracts();
      const contract = allContracts.find((c: any) => c.id === input.contractId);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Vertrag nicht gefunden" });
      if ((contract as any).status !== "pending_verification") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vertrag ist nicht im Status 'Ausstehend'" });
      }

      // Reject contract
      await updateContract(input.contractId, {
        status: "rejected",
        rejectionReason: input.reason || "Keine Angabe",
        verifiedAt: new Date(),
        verifiedByUserId: ctx.user.id,
      } as any);

      // Set restaurant to inactive
      const restaurantId = (contract as any).restaurantId;
      if (restaurantId) {
        await updateRestaurant(restaurantId, { status: "inactive" } as any);
      }

      return { success: true };
    }),

  // Simple create (for superadmin manual creation)
  create: protectedProcedure
    .input(z.object({
      restaurantId: z.number().optional(),
      contractType: z.enum(["standard", "referral", "dropshipping", "partner"]).optional(),
      partnerId: z.number().optional(),
      title: z.string(),
      plan: z.enum(["starter", "growth", "ecosystem"]).optional(),
      billingCycle: z.enum(["monthly", "yearly"]).optional(),
      status: z.enum(["draft", "sent", "signed", "active", "expired", "cancelled"]).optional(),
      monthlyFee: z.string().optional(),
      commissionRate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => createContract(input as any)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      status: z.enum(["draft", "sent", "signed", "active", "expired", "cancelled"]).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      monthlyFee: z.string().optional(),
      commissionRate: z.string().optional(),
      documentUrl: z.string().optional(),
      signedAt: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateContract(id, data); return { success: true }; }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => { await deleteContract(input.id); return { success: true }; }),

  // Get pricing preview without creating anything
  calculatePrice: publicProcedure
    .input(z.object({
      selectedModules: z.array(z.object({
        moduleId: z.string(),
        quantity: z.number().min(1).default(1),
      })),
      billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
    }))
    .query(async ({ input }) => {
      const { calculateModularPricing, calculateAnnualPrice, MODULES, MODULE_CATEGORIES } = await import("../shared/pricing");
      const pricing = calculateModularPricing(input.selectedModules);
      const effectiveMonthly = input.billingCycle === "yearly"
        ? calculateAnnualPrice(pricing.monthlyTotal)
        : pricing.monthlyTotal;
      return { ...pricing, effectiveMonthly, modules: MODULES, categories: MODULE_CATEGORIES };
    }),

  // Download contract PDF
  downloadPdf: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Vertrag nicht gefunden" });

      const selectedModules = (contract.features as any[])?.map((f: any) => ({
        moduleId: f.moduleId || f.id,
        quantity: f.quantity || 1,
      })) || [];

      const pdfBuffer = await generateContractPdf({
        contractId: contract.id,
        restaurantName: contract.restaurantName || contract.title,
        restaurantAddress: contract.restaurantAddress || undefined,
        restaurantZip: contract.restaurantZip || undefined,
        restaurantCity: contract.restaurantCity || undefined,
        restaurantPhone: contract.restaurantPhone || undefined,
        restaurantPhoneReceipt: contract.restaurantPhoneReceipt || undefined,
        restaurantEmail: contract.restaurantEmail || undefined,
        restaurantVatNumber: contract.restaurantVatNumber || undefined,
        companyName: contract.companyName || undefined,
        companyAddress: contract.companyAddress || undefined,
        companyZip: contract.companyZip || undefined,
        companyCity: contract.companyCity || undefined,
        companyPhone: contract.companyPhone || undefined,
        companyContact: contract.companyContact || undefined,
        contractType: contract.contractType,
        billingCycle: contract.billingCycle,
        selectedModules,
        hardwareItems: (contract.hardwareItems as any[]) || undefined,
        numEmployees: contract.numEmployees || 1,
        monthlyFee: contract.monthlyFee || "0",
        signedByName: contract.signedByName || undefined,
        signedByEmail: contract.signedByEmail || undefined,
        signedAt: contract.signedAt || contract.createdAt,
      });

      // Upload to S3 and return URL
      const pdfKey = `contracts/vertrag-${contract.id}-${Date.now()}.pdf`;
      const result = await storagePut(pdfKey, pdfBuffer, "application/pdf");
      return { url: result.url, filename: `Vertrag-${contract.id}-${contract.restaurantName || contract.title}.pdf` };
    }),

  // Resend activation link
  resendActivation: adminProcedure
    .input(z.object({ id: z.number(), origin: z.string() }))
    .mutation(async ({ input }) => {
      const contract = await getContractById(input.id);
      if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Vertrag nicht gefunden" });

      const recipientEmail = contract.signedByEmail || contract.restaurantEmail;
      if (!recipientEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Keine E-Mail-Adresse im Vertrag hinterlegt" });
      }

      // Check if there's already an unused, non-expired token
      const existingToken = await getActivationTokenByContractId(contract.id);
      if (existingToken && !existingToken.usedAt && existingToken.expiresAt > new Date()) {
        // Token still valid - just resend notification with existing link
        const activationLink = `${input.origin}/activate?token=${existingToken.token}`;
        await sendResendNotification(contract, recipientEmail, activationLink);
        return { success: true, message: "Aktivierungslink erneut gesendet (bestehender Token noch g\u00fcltig)" };
      }

      // Generate new token
      const token = crypto.randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await createActivationToken({
        token,
        email: recipientEmail,
        contractId: contract.id,
        restaurantId: contract.restaurantId || undefined,
        expiresAt,
      });

      const activationLink = `${input.origin}/activate?token=${token}`;
      await sendResendNotification(contract, recipientEmail, activationLink);
      return { success: true, message: "Neuer Aktivierungslink gesendet (72h g\u00fcltig)" };
    }),
});

// ─── PARTNER PORTAL ─────────────────────────────────────────────────────────────────
const partnerRouter = router({
  // Partner's own contracts
  myContracts: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role !== "partner" && ctx.user.role !== "superadmin" && ctx.user.role !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Partner und Admins haben Zugriff" });
      const allContracts = await getAllContracts();
      return allContracts.filter((c: any) => c.createdByUserId === ctx.user!.id || c.partnerId === ctx.user!.id);
    }),

  // Partner dashboard stats
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ctx.user.role !== "partner" && ctx.user.role !== "superadmin" && ctx.user.role !== "admin")
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Partner und Admins haben Zugriff" });
      const allContracts = await getAllContracts();
      const myContracts = allContracts.filter((c: any) => c.createdByUserId === ctx.user!.id || c.partnerId === ctx.user!.id);

      // Stats by city
      const cityStats: Record<string, { count: number; revenue: number }> = {};
      let totalRevenue = 0;
      let activeContracts = 0;

      for (const c of myContracts as any[]) {
        const city = c.restaurantCity || "Unbekannt";
        const monthly = parseFloat(c.monthlyFee || "0");
        if (!cityStats[city]) cityStats[city] = { count: 0, revenue: 0 };
        cityStats[city].count++;
        cityStats[city].revenue += monthly;
        totalRevenue += monthly;
        if (c.status === "active" || c.status === "signed") activeContracts++;
      }

      return {
        totalContracts: myContracts.length,
        activeContracts,
        totalMonthlyRevenue: totalRevenue,
        cityStats,
        recentContracts: myContracts.slice(0, 5),
      };
    }),
});

// ─── INVOICES ───────────────────────────────────────────────────────────────────────
const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({ restaurantId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      // M2: Multi-Tenant-Isolation – Admins/Superadmins können beliebige restaurantId übergeben
      // Nicht-Admins sehen nur Rechnungen ihres eigenen Restaurants
      const isAdmin = ctx.user?.role === 'admin' || ctx.user?.role === 'superadmin';
      if (isAdmin) {
        return getAllInvoices(input?.restaurantId);
      }
      // Nicht-Admin: immer eigene restaurantId verwenden, übergebene ignorieren
      const userRestaurantId = ctx.user?.restaurantId;
      if (!userRestaurantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Kein Restaurant zugewiesen' });
      return getAllInvoices(userRestaurantId);
    }),

  create: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      contractId: z.number().optional(),
      invoiceNumber: z.string().optional(),
      amount: z.string(),
      taxAmount: z.string().optional(),
      totalAmount: z.string(),
      currency: z.string().optional(),
      dueDate: z.date().optional(),
      description: z.string().optional(),
      lineItems: z.any().optional(),
    }))
    .mutation(async ({ input }) => createInvoice(input)),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
      paidAt: z.date().optional(),
      pdfUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => { const { id, ...data } = input; await updateInvoice(id, data); return { success: true }; }),
});

// ─── MEDIA ────────────────────────────────────────────────────────────────────
const mediaRouter = router({
  list: protectedProcedure
    .input(z.object({ category: z.string().optional(), restaurantId: z.number().optional() }).optional())
    .query(async ({ input }) => getAllMedia(input?.category, input?.restaurantId)),

  upload: protectedProcedure
    .input(z.object({
      name: z.string(),
      base64: z.string(),
      mimeType: z.string(),
      category: z.enum(["logo", "category", "product", "advertisement", "contract", "other"]).optional(),
      restaurantId: z.number().optional(),
      tags: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "png";
      const key = `media/${Date.now()}-${input.name.replace(/\s+/g, "_")}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return createMediaItem({
        name: input.name,
        fileKey: key,
        url,
        mimeType: input.mimeType,
        fileSize: buffer.length,
        category: input.category ?? "other",
        restaurantId: input.restaurantId,
        uploadedBy: ctx.user?.id,
        tags: input.tags,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // M2: Multi-Tenant-Isolation – Superadmin darf alles löschen, Admin nur eigenes Restaurant
      const isSuperadmin = ctx.user?.role === 'superadmin';
      if (!isSuperadmin) {
        const mediaItem = await getMediaById(input.id);
        if (!mediaItem) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mediendatei nicht gefunden' });
        // Admin kann nur Dateien seines Restaurants oder Dateien ohne Restaurant löschen
        if (mediaItem.restaurantId !== null && mediaItem.restaurantId !== ctx.user?.restaurantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Kein Zugriff auf diese Mediendatei' });
        }
      }
      await deleteMediaItem(input.id);
      return { success: true };
    }),
});

// ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
const subscriptionsRouter = router({
  // Get subscription status for a restaurant
  getByRestaurant: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input }) => {
      return await getSubscriptionByRestaurant(input.restaurantId);
    }),

  // Get my subscription (for restaurant admin)
  mine: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user?.restaurantId) return null;
      return await getSubscriptionByRestaurant(ctx.user.restaurantId);
    }),

  // Get current access phase for the logged-in restaurant admin
  myAccessPhase: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user?.restaurantId) return { phase: 'none' as const, daysRemaining: 0, trialStartedAt: null, subscription: null };
      return await getAccessPhase(ctx.user.restaurantId);
    }),

  // Get access phase for a specific restaurant (superadmin)
  accessPhaseByRestaurant: protectedProcedure
    .input(z.object({ restaurantId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'superadmin') throw new TRPCError({ code: 'FORBIDDEN' });
      return await getAccessPhase(input.restaurantId);
    }),

  // List all subscriptions (superadmin)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      return await getAllSubscriptions();
    }),

  // Create initial checkout session for first payment
  createCheckout: protectedProcedure
    .input(z.object({
      restaurantId: z.number(),
      origin: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const subscription = await getSubscriptionByRestaurant(input.restaurantId);
      if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Abonnement gefunden" });
      if (subscription.status === "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Abonnement ist bereits aktiv" });

      // Get restaurant info
      const restaurant = await getRestaurantById(input.restaurantId);
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

      // Calculate pro-rata for first month
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const remainingDays = daysInMonth - now.getDate() + 1;
      const monthlyAmount = parseFloat(String(subscription.monthlyAmount));
      const proRataAmount = Math.round((monthlyAmount / daysInMonth) * remainingDays * 100) / 100;

      const checkoutUrl = await createCheckoutSession({
        restaurantId: input.restaurantId,
        restaurantName: restaurant.name,
        contractId: subscription.contractId || 0,
        billingCycle: subscription.billingCycle as "monthly" | "yearly",
        monthlyAmount,
        oneTimeAmount: 0, // One-time fees handled separately at contract creation
        customerEmail: ctx.user.email,
        customerName: ctx.user.name || ctx.user.email,
        userId: ctx.user.id,
        origin: input.origin,
        isProRata: subscription.billingCycle === "monthly" && remainingDays < daysInMonth,
        proRataAmount: subscription.billingCycle === "monthly" ? proRataAmount : undefined,
      });

      return { checkoutUrl };
    }),

  // Create renewal checkout (for monthly renewals)
  createRenewalCheckout: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx }) => {
      if (!ctx.user?.restaurantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugeordnet" });
      const subscription = await getSubscriptionByRestaurant(ctx.user.restaurantId);
      if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Abonnement gefunden" });

      const restaurant = await getRestaurantById(ctx.user.restaurantId);
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND" });

      const checkoutUrl = await createRenewalCheckoutSession({
        restaurantId: ctx.user.restaurantId,
        restaurantName: restaurant.name,
        subscriptionId: subscription.id,
        monthlyAmount: parseFloat(String(subscription.monthlyAmount)),
        customerEmail: ctx.user.email,
        userId: ctx.user.id,
        origin: ctx.req.headers.origin || "",
      });

      return { checkoutUrl };
    }),

  // Get payment history for a restaurant
  payments: protectedProcedure
    .input(z.object({ restaurantId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const restaurantId = input?.restaurantId || ctx.user?.restaurantId;
      if (!restaurantId) return [];
      return await getPaymentsByRestaurant(restaurantId);
    }),

  // All payments (superadmin)
  allPayments: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      return await getAllPayments();
    }),

  // Manually activate subscription (superadmin override)
  activate: protectedProcedure
    .input(z.object({ subscriptionId: z.number(), months: z.number().min(1).max(12).default(1) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const now = new Date();
      const periodEnd = new Date(now.getTime() + input.months * 30 * 24 * 60 * 60 * 1000);
      await updateSubscription(input.subscriptionId, {
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        gracePeriodEnd: null,
        reminderSentAt: null,
        dueDayNotifiedAt: null,
        blockedNotifiedAt: null,
      });
      return { success: true };
    }),

  // Manually block subscription (superadmin)
  block: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateSubscription(input.subscriptionId, { status: "blocked" });
      return { success: true };
    }),

  // Confirm payment after Stripe checkout success (called from success page)
  // Verifies the Stripe session and activates the subscription
  confirmPayment: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.restaurantId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const sub = await getSubscriptionByRestaurant(ctx.user.restaurantId);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Abonnement gefunden" });

      // Verify session with Stripe
      const stripe = await import("stripe").then(m => new m.default(process.env.STRIPE_SECRET_KEY!));
      const session = await stripe.checkout.sessions.retrieve(input.sessionId);

      if (session.payment_status !== "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Zahlung noch nicht abgeschlossen" });
      }

      // Activate subscription for 1 month
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await updateSubscription(sub.id, {
        status: "active",
        trialPhase: "paid",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        gracePeriodEnd: null,
        reminderSentAt: null,
        dueDayNotifiedAt: null,
        blockedNotifiedAt: null,
        stripeCustomerId: session.customer as string || sub.stripeCustomerId,
      });

      return { success: true };
    }),
});

// ─── APP ROUTER ───────────────────────────────────────────────────────────────
// ─── HARDWARE PRODUCTS ─────────────────────────────────────────────────────
const hardwareRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      return await getHardwareProducts(input?.activeOnly ?? false);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await getHardwareProductById(input.id);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["tablet", "drucker", "monitor", "zubehoer"]),
      price: z.number().min(0),
      imageUrl: z.string().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const priceStr = input.price.toFixed(2);
      const id = await createHardwareProduct({ ...input, price: priceStr });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.enum(["tablet", "drucker", "monitor", "zubehoer"]).optional(),
      price: z.number().min(0).optional(),
      imageUrl: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      const { id, price, ...rest } = input;
      const data: any = { ...rest };
      if (price !== undefined) data.price = price.toFixed(2);
      await updateHardwareProduct(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
      await deleteHardwareProduct(input.id);
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _ph, ...safeUser } = opts.ctx.user;
      // SSE: sessionConflict mitsenden damit Frontend reagieren kann
      return { ...safeUser, sessionConflict: opts.ctx.sessionConflict };
    }),

    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1), deviceId: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        // M3: E-Mail-basiertes Rate-Limiting (In-Memory, kein DB-Change)
        // Max. 10 Versuche pro E-Mail in 15 Minuten
        const emailKey = input.email.toLowerCase();
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 Minuten
        const maxAttempts = 10;
        const entry = loginEmailAttempts.get(emailKey);
        if (entry) {
          // Fenster zurücksetzen wenn abgelaufen
          if (now - entry.windowStart > windowMs) {
            loginEmailAttempts.set(emailKey, { count: 1, windowStart: now });
          } else {
            entry.count += 1;
            if (entry.count > maxAttempts) {
              const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
              throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `Zu viele Anmeldeversuche für diese E-Mail. Bitte in ${Math.ceil(retryAfterSec / 60)} Minuten erneut versuchen.`,
              });
            }
          }
        } else {
          loginEmailAttempts.set(emailKey, { count: 1, windowStart: now });
        }

        const user = await getUserByEmail(input.email);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültige E-Mail oder Passwort" });
        if (user.status === "pending") throw new TRPCError({ code: "FORBIDDEN", message: "E-Mail-Adresse noch nicht verifiziert. Bitte pr\u00fcfen Sie Ihre E-Mails." });
        if (user.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "Konto ist deaktiviert" });
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Ungültige E-Mail oder Passwort" });
        // Erfolgreicher Login: Zähler zurücksetzen
        loginEmailAttempts.delete(emailKey);
        const token = await sdk.createSessionToken(user.id, user.email, user.role);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        await import("./db").then(db => db.updateUser(user.id, { lastSignedIn: new Date() }));
        // SSE: Aktive Session speichern (überschreibt alte Session auf anderem Gerät)
        const deviceId = input.deviceId ?? crypto.randomUUID();
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        await upsertActiveSession({
          userId: user.id,
          deviceId,
          sessionToken: tokenHash,
          userAgent: ctx.req.headers["user-agent"] ?? null,
          ipAddress: (ctx.req.headers["x-forwarded-for"] as string ?? ctx.req.socket?.remoteAddress ?? null),
          lastSeen: new Date(),
        });
        const { passwordHash: _ph, ...safeUser } = user;
        // Token auch im Response-Body zurückgeben für React Native App (Bearer Token Auth)
        return { user: safeUser, token };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      // SSE: Aktive Session aus DB löschen
      if (ctx.user?.id) {
        await deleteActiveSession(ctx.user.id).catch(() => {});
      }
      return { success: true } as const;
    }),

    // Öffentliche Selbstregistrierung für Gäste/Kunden
    signup: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const existing = await getUserByEmail(input.email);
        if (existing && existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Diese E-Mail-Adresse ist bereits registriert" });
        }
        if (existing && existing.status === "pending") {
          // Resend verification code
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
          await createVerificationCode(input.email, code, expiresAt);
          await notifyOwner({ title: `Verifizierungscode f\u00fcr ${input.email}`, content: `Code: ${code}` });
          return { success: true, email: input.email.toLowerCase() };
        }
        const passwordHash = await bcrypt.hash(input.password, 12);
        await createUser({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          role: "gast",
          status: "pending",
          restaurantId: null,
          lastSignedIn: new Date(),
        });
        // Generate 6-digit verification code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
        await createVerificationCode(input.email, code, expiresAt);
        // Send code via notification (in production: send via email)
        await notifyOwner({ title: `Verifizierungscode f\u00fcr ${input.email}`, content: `Code: ${code}` });
        return { success: true, email: input.email.toLowerCase() };
      }),

    // E-Mail-Verifizierung mit 6-stelligem Code
    verifyEmail: publicProcedure
      .input(z.object({
        email: z.string().email(),
        code: z.string().length(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const record = await getVerificationCode(input.email, input.code);
        if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Ung\u00fcltiger oder abgelaufener Code" });
        // Activate user
        await activateUser(input.email);
        await deleteVerificationCodes(input.email);
        // Auto-login after verification
        const user = await getUserByEmail(input.email.toLowerCase());
        if (user) {
          const token = await sdk.createSessionToken(user.id, user.email, user.role);
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        }
        return { success: true };
      }),

    // Code erneut senden
    resendCode: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user || user.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Kein ausstehender Account gefunden" });
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await createVerificationCode(input.email, code, expiresAt);
        await notifyOwner({ title: `Verifizierungscode f\u00fcr ${input.email}`, content: `Code: ${code}` });
        return { success: true };
      }),

    // Superadmin kann Benutzer mit beliebiger Rolle anlegen
    register: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().optional(),
        role: z.enum(["superadmin", "admin", "kellner", "koch", "buchhalter", "gast", "partner", "user"]).optional(),
        restaurantId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "Nur Superadmins können Benutzer anlegen" });
        const existing = await getUserByEmail(input.email);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "E-Mail bereits vergeben" });
        const passwordHash = await bcrypt.hash(input.password, 12);
        await createUser({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name ?? null,
          role: input.role ?? "user",
          restaurantId: input.restaurantId ?? null,
          lastSignedIn: new Date(),
        });
        return { success: true };
      }),

    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Aktuelles Passwort falsch" });
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await import("./db").then(db => db.updateUser(ctx.user.id, { passwordHash }));
        return { success: true };
      }),

    // Profil aktualisieren (Name)
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await import("./db").then(db => db.updateUser(ctx.user.id, { name: input.name }));
        return { success: true };
      }),

    // Passwort-Reset anfordern (öffentlich)
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        // Immer success zurückgeben um E-Mail-Enumeration zu verhindern
        if (!user || user.status !== "active") return { success: true };
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
        await createVerificationCode(input.email.toLowerCase(), code, expiresAt);
        await notifyOwner({ title: `Passwort-Reset f\u00fcr ${input.email}`, content: `Code: ${code}` });
        return { success: true };
      }),

    // Passwort mit Reset-Code setzen (öffentlich)
    resetPassword: publicProcedure
      .input(z.object({
        email: z.string().email(),
        code: z.string().length(6),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const record = await getVerificationCode(input.email, input.code);
        if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "Ung\u00fcltiger oder abgelaufener Code" });
        const user = await getUserByEmail(input.email);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Benutzer nicht gefunden" });
        const passwordHash = await bcrypt.hash(input.newPassword, 12);
        await import("./db").then(db => db.updateUser(user.id, { passwordHash }));
        await deleteVerificationCodes(input.email);
        return { success: true };
      }),

    // Activation token validieren (für Erstanmeldung nach Vertrag)
    validateActivationToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const record = await getActivationToken(input.token);
        if (!record) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ung\u00fcltiger oder abgelaufener Aktivierungslink" });
        }
        if (record.usedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dieser Aktivierungslink wurde bereits verwendet" });
        }
        return { email: record.email, restaurantId: record.restaurantId, contractId: record.contractId };
      }),

    // Konto aktivieren: Passwort setzen und einloggen
    activateAccount: publicProcedure
      .input(z.object({
        token: z.string(),
        password: z.string().min(8),
        name: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const record = await getActivationToken(input.token);
        if (!record) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ung\u00fcltiger oder abgelaufener Aktivierungslink" });
        }
        if (record.usedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dieser Aktivierungslink wurde bereits verwendet" });
        }

        // Check if user already exists
        let user = await getUserByEmail(record.email);
        const passwordHash = await bcrypt.hash(input.password, 12);

        if (user) {
          // Update existing user's password and activate
          await import("./db").then(db => db.updateUser(user!.id, {
            passwordHash,
            status: "active",
            name: input.name || user!.name,
          }));
        } else {
          // Create new user
          await createUser({
            email: record.email.toLowerCase(),
            passwordHash,
            name: input.name || record.email.split("@")[0],
            role: "admin",
            status: "active",
            restaurantId: record.restaurantId,
          });
          user = await getUserByEmail(record.email);
        }

        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Mark token as used
        await markActivationTokenUsed(input.token);

        // Start trial: set trialStartedAt on the subscription if not already set
        if (record.restaurantId) {
          const sub = await getSubscriptionByRestaurant(record.restaurantId);
          if (sub && !sub.trialStartedAt) {
            await updateSubscription(sub.id, {
              trialStartedAt: new Date(),
              trialPhase: 'full',
            });
          }
        }

        // Auto-login: create session
        const sessionToken = await sdk.createSessionToken(user.id, user.email, user.role);
        ctx.res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(ctx.req));

        return {
          success: true,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        };
      }),
  }),
  dashboard: dashboardRouter,
  restaurants: restaurantsRouter,
  users: usersRouter,
  chat: chatRouter,
  advertisements: advertisementsRouter,
  reviews: reviewsRouter,
  contracts: contractsRouter,
  invoices: invoicesRouter,
  invoicing: invoicingRouter,
  recurringInvoices: recurringInvoiceRouter,
  debtors: debtorRouter,
  media: mediaRouter,
  partner: partnerRouter,
  subscriptions: subscriptionsRouter,
  hardware: hardwareRouter,
  restaurantAdmin: restaurantAdminRouter,
  floorPlan: floorPlanRouter,
  menu: menuRouter,
  order: orderRouter,
  kassenbuch: kassenbuchRouter,
  steuerexport: steuerexportRouter,
  nutrition: nutritionRouter,
  multilangMenu: multilangMenuRouter,
  bewertungen: bewertungsRouter,
    reservations: reservationsRouter,
  inventory: inventoryRouter,
  warehouse: warehouseRouter,
  closings: closingsRouter,
  closingReport: closingReportRouter,
  shifts: shiftsRouter,
  adminShifts: adminShiftsRouter,
  absences: absencesRouter,
  aiPlanning: aiPlanningRouter,
  shiftSwap: shiftSwapRouter,
  qrOrder: qrOrderRouter,
  onboarding: onboardingRouter,
  chatbot: chatbotRouter,
  voucher: voucherRouter,
  loyalty: loyaltyRouter,
  voiceOrder: voiceOrderRouter,
  course: courseRouter,
  printer: printerRouter,
  localConnect: localConnectRouter,
  device: deviceRouter,
  sumup: sumupRouter,
  paytec: paytecRouter,
  nexi: nexiRouter,
  statistics: statisticsRouter,
  kiosk: kioskRouter,
  training: trainingRouter,
  upselling: upsellingRouter,
  pickup: pickupRouter,
  aiImport: aiImportRouter,
  adminSetup: adminSetupRouter,
  tuya: tuyaRouter,
  marketing: marketingRouter,
  backup: backupRouter,
  systemMonitor: systemMonitorRouter,
  qrorpa: qrorpaRouter,
  reports: reportRouter,
  countryConfig: countryConfigRouter,
});
export type AppRouter = typeof appRouter;
