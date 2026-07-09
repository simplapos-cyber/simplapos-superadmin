/**
 * onboardingRouter.ts – Öffentlicher Gastronomen-Onboarding-Wizard
 *
 * Ablauf (5 Schritte):
 * 1. info       – Betriebsdaten + E-Mail eingeben → Session erstellen
 * 2. modules    – Module auswählen + Preisberechnung
 * 3. contract   – Vertrag anzeigen + digital unterzeichnen → Contract + Restaurant erstellen
 * 4. payment    – Stripe Checkout Session erstellen → Zahlung
 * 5. activate   – Passwort setzen → Admin-Account aktivieren
 *
 * Alle Procedures sind publicProcedure (kein Login nötig).
 * Die Session wird über ein sessionToken (UUID) im Frontend-LocalStorage verwaltet.
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { onboardingSessions } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { MODULES, calculateModularPricing, calculateAnnualPrice } from "../shared/pricing";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

async function getSession(token: string) {
  const db = await getDb();
  const [session] = await db.select().from(onboardingSessions)
    .where(eq(onboardingSessions.sessionToken, token)).limit(1);
  return session ?? null;
}

async function updateSession(token: string, data: Partial<typeof onboardingSessions.$inferInsert>) {
  const db = await getDb();
  await db.update(onboardingSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(onboardingSessions.sessionToken, token));
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const onboardingRouter = router({

  // ── Schritt 0: Verfügbare Module abrufen ──────────────────────────────────
  getModules: publicProcedure.query(() => {
    return MODULES;
  }),

  // ── Schritt 0: Preisberechnung ────────────────────────────────────────────
  calculatePrice: publicProcedure
    .input(z.object({
      selectedModules: z.array(z.object({
        moduleId: z.string(),
        quantity: z.number().min(1).default(1),
      })),
      billingCycle: z.enum(["monthly", "yearly"]).default("monthly"),
    }))
    .query(({ input }) => {
      const pricing = calculateModularPricing(input.selectedModules);
      const effectiveMonthly = input.billingCycle === "yearly"
        ? calculateAnnualPrice(pricing.monthlyTotal)
        : pricing.monthlyTotal;
      const yearlyTotal = effectiveMonthly * 12;
      const yearlySavings = pricing.monthlyTotal * 12 - yearlyTotal;
      return {
        monthlyTotal: pricing.monthlyTotal,
        oneTimeTotal: pricing.oneTimeTotal,
        effectiveMonthly,
        yearlyTotal,
        yearlySavings: Math.round(yearlySavings * 100) / 100,
        breakdown: pricing.breakdown,
      };
    }),

  // ── Schritt 1: Session starten (Betriebsdaten) ────────────────────────────
  startSession: publicProcedure
    .input(z.object({
      restaurantName: z.string().min(2, "Restaurantname erforderlich"),
      restaurantEmail: z.string().email("Gültige E-Mail erforderlich"),
      restaurantPhone: z.string().optional(),
      restaurantAddress: z.string().optional(),
      restaurantZip: z.string().optional(),
      restaurantCity: z.string().optional(),
      restaurantVatNumber: z.string().optional(),
      companyName: z.string().optional(),
      companyAddress: z.string().optional(),
      companyZip: z.string().optional(),
      companyCity: z.string().optional(),
      companyPhone: z.string().optional(),
      companyContact: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const sessionToken = crypto.randomUUID();
      await db.insert(onboardingSessions).values({
        sessionToken,
        step: "modules",
        email: input.restaurantEmail,
        data: input as any,
      });
      return { sessionToken, step: "modules" };
    }),

  // ── Schritt 2: Module speichern ───────────────────────────────────────────
  saveModules: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      selectedModules: z.array(z.object({
        moduleId: z.string(),
        quantity: z.number().min(1).default(1),
      })).min(1, "Mindestens ein Modul erforderlich"),
      billingCycle: z.enum(["monthly", "yearly"]),
    }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });

      const pricing = calculateModularPricing(input.selectedModules);
      const effectiveMonthly = input.billingCycle === "yearly"
        ? calculateAnnualPrice(pricing.monthlyTotal)
        : pricing.monthlyTotal;

      const updatedData = {
        ...(session.data as any || {}),
        selectedModules: input.selectedModules,
        billingCycle: input.billingCycle,
        pricing: { ...pricing, effectiveMonthly },
      };

      await updateSession(input.sessionToken, {
        step: "contract",
        data: updatedData,
      });

      return { step: "contract", pricing: { ...pricing, effectiveMonthly } };
    }),

  // ── Schritt 3: Vertrag unterzeichnen + Restaurant/Contract erstellen ───────
  signContract: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      signedByName: z.string().min(2, "Name erforderlich"),
      signedByEmail: z.string().email("Gültige E-Mail erforderlich"),
      acceptedTerms: z.boolean().refine(v => v === true, "AGB müssen akzeptiert werden"),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getSession(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });
      if (session.contractId) {
        // Already signed – return existing IDs
        return { contractId: session.contractId, restaurantId: session.restaurantId!, step: "payment" };
      }

      const data = session.data as any;
      if (!data?.selectedModules?.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Keine Module ausgewählt" });
      }

      // Dynamically import to avoid circular deps
      const {
        createRestaurant, createContract, createRestaurantModules, createSubscription,
      } = await import("./db");
      const { notifyOwner } = await import("./_core/notification");
      const { sendContractConfirmationEmail } = await import("./contractEmail");

      const pricing = calculateModularPricing(data.selectedModules);
      const effectiveMonthly = data.billingCycle === "yearly"
        ? calculateAnnualPrice(pricing.monthlyTotal)
        : pricing.monthlyTotal;

      // 1. Restaurant erstellen
      const restaurant = await createRestaurant({
        name: data.restaurantName,
        address: data.restaurantAddress,
        zip: data.restaurantZip,
        city: data.restaurantCity,
        phone: data.restaurantPhone,
        phoneReceipt: data.restaurantPhone,
        email: data.restaurantEmail,
        vatNumber: data.restaurantVatNumber,
        companyName: data.companyName,
        companyAddress: data.companyAddress,
        companyZip: data.companyZip,
        companyCity: data.companyCity,
        companyPhone: data.companyPhone,
        companyContact: data.companyContact,
        status: "pending_verification",
      });

      // 2. Vertrag erstellen
      const numPosTerminals = data.selectedModules.find((m: any) => m.moduleId === "extra_pos")?.quantity ?? 1;
      const numKdsScreens = data.selectedModules.find((m: any) => m.moduleId === "kds")?.quantity ?? 0;
      const contract = await createContract({
        restaurantId: restaurant.id,
        contractType: "standard",
        title: `Vertrag – ${data.restaurantName} (Online-Registrierung)`,
        status: "pending_verification",
        plan: "modular",
        billingCycle: data.billingCycle,
        restaurantName: data.restaurantName,
        restaurantAddress: data.restaurantAddress,
        restaurantCity: data.restaurantCity,
        restaurantPhone: data.restaurantPhone,
        restaurantEmail: data.restaurantEmail,
        restaurantZip: data.restaurantZip,
        restaurantVatNumber: data.restaurantVatNumber,
        companyName: data.companyName,
        companyAddress: data.companyAddress,
        companyZip: data.companyZip,
        companyCity: data.companyCity,
        companyPhone: data.companyPhone,
        companyContact: data.companyContact,
        numEmployees: 1,
        numPosTerminals,
        numKdsScreens,
        features: data.selectedModules.map((m: any) => m.moduleId),
        employees: [],
        hardwareItems: [],
        hardwareTotal: "0.00",
        basePriceMonthly: "89.00",
        addOnsMonthly: (pricing.monthlyTotal - 89).toFixed(2),
        setupFee: pricing.oneTimeTotal.toFixed(2),
        monthlyFee: effectiveMonthly.toFixed(2),
        signedAt: new Date(),
        signedByName: input.signedByName,
        signedByEmail: input.signedByEmail,
        startDate: new Date(),
        createdByUserId: null,
        createdByName: input.signedByName,
        createdByType: "online",
      });

      // 3. Module provisionieren
      const moduleRecords = data.selectedModules.map((m: any) => ({
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

      // 4. Subscription erstellen
      const subscription = await createSubscription({
        restaurantId: restaurant.id,
        contractId: contract.id,
        billingCycle: data.billingCycle || "monthly",
        monthlyAmount: effectiveMonthly.toFixed(2),
        status: "pending",
      });

      // 5. Session aktualisieren
      await updateSession(input.sessionToken, {
        step: "payment",
        contractId: contract.id,
        restaurantId: restaurant.id,
        subscriptionId: subscription.id,
        email: input.signedByEmail,
        data: { ...data, signedByName: input.signedByName, signedByEmail: input.signedByEmail },
      });

      // 6. Owner benachrichtigen
      try {
        await notifyOwner({
          title: "Neue Online-Registrierung",
          content: `Restaurant: ${data.restaurantName}\nKontakt: ${input.signedByName} <${input.signedByEmail}>\nMonatlich: CHF ${effectiveMonthly}\nModule: ${data.selectedModules.map((m: any) => m.moduleId).join(", ")}`,
        });
      } catch (_) { /* non-fatal */ }

      // 7. Bestätigungs-E-Mail
      const origin = input.origin || "https://simplapos.com";
      try {
        await sendContractConfirmationEmail({
          contractId: contract.id,
          restaurantName: data.restaurantName,
          restaurantAddress: data.restaurantAddress,
          restaurantZip: data.restaurantZip,
          restaurantCity: data.restaurantCity,
          restaurantPhone: data.restaurantPhone,
          restaurantPhoneReceipt: data.restaurantPhone,
          restaurantEmail: data.restaurantEmail,
          restaurantVatNumber: data.restaurantVatNumber,
          companyName: data.companyName,
          companyAddress: data.companyAddress,
          companyZip: data.companyZip,
          companyCity: data.companyCity,
          companyPhone: data.companyPhone,
          companyContact: data.companyContact,
          contractType: "standard",
          billingCycle: data.billingCycle,
          selectedModules: data.selectedModules,
          hardwareItems: [],
          numEmployees: 1,
          monthlyFee: effectiveMonthly.toFixed(2),
          signedByName: input.signedByName,
          signedByEmail: input.signedByEmail,
          signedAt: new Date(),
          recipientEmail: input.signedByEmail,
          userId: undefined,
          restaurantId: restaurant.id,
          origin,
        });
      } catch (e) {
        console.warn("[Onboarding] E-Mail-Versand fehlgeschlagen:", e);
      }

      return { contractId: contract.id, restaurantId: restaurant.id, subscriptionId: subscription.id, step: "payment" };
    }),

  // ── Schritt 4: Stripe Checkout Session erstellen ──────────────────────────
  createCheckout: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      origin: z.string(),
    }))
    .mutation(async ({ input }) => {
      const session = await getSession(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });
      if (!session.contractId || !session.restaurantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vertrag noch nicht unterzeichnet" });
      }

      const { getSubscriptionByRestaurant, getRestaurantById } = await import("./db");
      const { createCheckoutSession } = await import("./stripe");

      const subscription = await getSubscriptionByRestaurant(session.restaurantId);
      if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "Kein Abonnement gefunden" });

      const restaurant = await getRestaurantById(session.restaurantId);
      if (!restaurant) throw new TRPCError({ code: "NOT_FOUND", message: "Restaurant nicht gefunden" });

      const data = session.data as any;
      const monthlyAmount = parseFloat(String(subscription.monthlyAmount));

      // Für Onboarding: kein User-ID nötig – wir nutzen 0 als Platzhalter
      // Die Aktivierung erfolgt nach der Zahlung via activateAccount
      const checkoutUrl = await createCheckoutSession({
        restaurantId: session.restaurantId,
        restaurantName: restaurant.name,
        contractId: session.contractId,
        billingCycle: subscription.billingCycle as "monthly" | "yearly",
        monthlyAmount,
        oneTimeAmount: parseFloat(String((data?.pricing?.oneTimeTotal) ?? 0)),
        customerEmail: session.email || data?.restaurantEmail || "",
        customerName: data?.signedByName || data?.companyContact || restaurant.name,
        userId: 0, // Placeholder – user created during activation
        origin: input.origin,
      });

      // Stripe Session ID aus URL extrahieren und speichern
      const stripeSessionId = checkoutUrl.split("session_id=")[1]?.split("&")[0] || null;
      await updateSession(input.sessionToken, {
        step: "activate",
        stripeSessionId: stripeSessionId || undefined,
      });

      return { checkoutUrl };
    }),

  // ── Schritt 4b: Zahlungsstatus prüfen ────────────────────────────────────
  checkPayment: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      stripeSessionId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const session = await getSession(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });

      if (!session.restaurantId) return { paid: false, step: session.step };

      const { getSubscriptionByRestaurant } = await import("./db");
      const subscription = await getSubscriptionByRestaurant(session.restaurantId);

      const paid = subscription?.status === "active";
      return {
        paid,
        step: session.step,
        contractId: session.contractId,
        restaurantId: session.restaurantId,
        email: session.email,
      };
    }),

  // ── Schritt 5: Admin-Account aktivieren ──────────────────────────────────
  activateAdmin: publicProcedure
    .input(z.object({
      sessionToken: z.string(),
      name: z.string().min(2, "Name erforderlich"),
      email: z.string().email("Gültige E-Mail erforderlich"),
      password: z.string().min(8, "Passwort mindestens 8 Zeichen"),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getSession(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session nicht gefunden" });
      if (!session.restaurantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Restaurant zugeordnet" });
      }
      if (session.completedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Account wurde bereits aktiviert" });
      }

      const { getUserByEmail, createUser, updateUser, getSubscriptionByRestaurant, updateSubscription } = await import("./db");
      const { ENV } = await import("./_core/env");
      const bcrypt = await import("bcryptjs");
      const { sdk } = await import("./_core/sdk");
      const { COOKIE_NAME } = await import("@shared/const");
      const { getSessionCookieOptions } = await import("./_core/cookies");

      const passwordHash = await bcrypt.default.hash(input.password, 12);

      // Prüfen ob User bereits existiert
      let user = await getUserByEmail(input.email);
      if (user) {
        // Update existing user
        await updateUser(user.id, {
          passwordHash,
          status: "active",
          name: input.name,
          restaurantId: session.restaurantId,
          role: "admin",
        });
        user = await getUserByEmail(input.email);
      } else {
        // Neuen Admin-User erstellen
        await createUser({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          role: "admin",
          status: "active",
          restaurantId: session.restaurantId,
        });
        user = await getUserByEmail(input.email);
      }

      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "User-Erstellung fehlgeschlagen" });

      // Trial starten
      const sub = await getSubscriptionByRestaurant(session.restaurantId);
      if (sub && !sub.trialStartedAt) {
        await updateSubscription(sub.id, {
          trialStartedAt: new Date(),
          trialPhase: "full",
        });
      }

      // Session als abgeschlossen markieren
      await updateSession(input.sessionToken, {
        completedAt: new Date(),
        step: "activate",
      });

      // Auto-Login
      const sessionToken = await sdk.createSessionToken(user.id, user.email, user.role);
      ctx.res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(ctx.req));

      return {
        success: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        restaurantId: session.restaurantId,
      };
    }),

  // ── Session-Status abrufen ────────────────────────────────────────────────
  getSessionStatus: publicProcedure
    .input(z.object({ sessionToken: z.string() }))
    .query(async ({ input }) => {
      const session = await getSession(input.sessionToken);
      if (!session) return null;
      return {
        step: session.step,
        contractId: session.contractId,
        restaurantId: session.restaurantId,
        email: session.email,
        completed: !!session.completedAt,
        data: session.data,
      };
    }),
});
