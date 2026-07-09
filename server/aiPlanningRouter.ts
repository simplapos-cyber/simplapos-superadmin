/**
 * aiPlanningRouter.ts – KI-gestützte Personalplanung
 *
 * Der Router sammelt alle relevanten Daten und lässt das LLM einen
 * optimalen Dienstplan für eine Woche erstellen.
 *
 * Datenquellen für die KI:
 * 1. Wetter-Prognose (Open-Meteo API, kostenlos, keine Key nötig)
 * 2. Schweizer Feiertage (Kanton-abhängig, statische Tabelle)
 * 3. Reservationen aus der DB
 * 4. Historische Umsätze (letzte 4 gleiche Wochentage)
 * 5. Mitarbeiter-Verfügbarkeit
 * 6. Genehmigte Abwesenheiten
 * 7. Aktuelle Schicht-Statistiken
 *
 * Endpoints:
 * - generatePlan: KI-Dienstplan generieren (Draft)
 * - savePlan: Plan speichern
 * - getPlans: Alle Pläne abrufen
 * - getPlanDetail: Einzelnen Plan mit Schichten abrufen
 * - publishPlan: Plan veröffentlichen (Mitarbeiter sehen ihn)
 * - deletePlan: Plan löschen
 * - confirmShift: Mitarbeiter bestätigt seine Schicht
 * - getMyPlannedShifts: Kellner sieht seine geplanten Schichten
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  aiShiftPlans, aiPlanShifts, staffAbsences, staffAvailability,
  reservations, users, waiterShifts, orders,
} from "../drizzle/schema";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getRestaurantId(ctx: { user: { restaurantId: number | null } }): number {
  if (!ctx.user.restaurantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Kein Restaurant zugewiesen" });
  }
  return ctx.user.restaurantId;
}

function requireAdminOrManager(ctx: { user: { role: string } }) {
  const allowed = ["admin", "manager", "superadmin"];
  if (!allowed.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nur Admins und Manager haben Zugriff" });
  }
}

/** Wetter-Prognose von Open-Meteo (kostenlos, kein API-Key) */
async function fetchWeatherForecast(lat: number, lon: number, startDate: string, endDate: string) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&start_date=${startDate}&end_date=${endDate}&timezone=Europe%2FZurich`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      daily?: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_sum: number[];
        weathercode: number[];
      };
    };
    if (!data.daily) return null;
    return data.daily.time.map((date: string, i: number) => ({
      date,
      tempMax: data.daily!.temperature_2m_max[i],
      tempMin: data.daily!.temperature_2m_min[i],
      precipitation: data.daily!.precipitation_sum[i],
      weatherCode: data.daily!.weathercode[i],
      description: describeWeather(data.daily!.weathercode[i]),
      isGoodWeather: data.daily!.weathercode[i] < 50 && data.daily!.temperature_2m_max[i] > 15,
    }));
  } catch {
    return null;
  }
}

function describeWeather(code: number): string {
  if (code === 0) return "Klarer Himmel";
  if (code <= 3) return "Teilweise bewölkt";
  if (code <= 19) return "Nebel/Dunst";
  if (code <= 29) return "Leichter Niederschlag";
  if (code <= 39) return "Nieselregen";
  if (code <= 49) return "Gefrierender Regen";
  if (code <= 59) return "Regen";
  if (code <= 69) return "Schneeregen";
  if (code <= 79) return "Schneefall";
  if (code <= 84) return "Regenschauer";
  if (code <= 94) return "Gewitter";
  return "Starkes Gewitter";
}

/** Schweizer Feiertage (national + Kanton ZH als Standard) */
function getSwissHolidays(year: number): Array<{ date: string; name: string; isNational: boolean }> {
  return [
    { date: `${year}-01-01`, name: "Neujahr", isNational: true },
    { date: `${year}-01-02`, name: "Berchtoldstag", isNational: false },
    { date: `${year}-05-01`, name: "Tag der Arbeit", isNational: false },
    { date: `${year}-08-01`, name: "Nationalfeiertag", isNational: true },
    { date: `${year}-12-25`, name: "Weihnachten", isNational: true },
    { date: `${year}-12-26`, name: "Stephanstag", isNational: false },
    // Bewegliche Feiertage (vereinfacht für 2025/2026)
    ...(year === 2025 ? [
      { date: "2025-04-18", name: "Karfreitag", isNational: false },
      { date: "2025-04-20", name: "Ostersonntag", isNational: true },
      { date: "2025-04-21", name: "Ostermontag", isNational: false },
      { date: "2025-05-29", name: "Auffahrt", isNational: false },
      { date: "2025-06-08", name: "Pfingstsonntag", isNational: true },
      { date: "2025-06-09", name: "Pfingstmontag", isNational: false },
    ] : []),
    ...(year === 2026 ? [
      { date: "2026-04-03", name: "Karfreitag", isNational: false },
      { date: "2026-04-05", name: "Ostersonntag", isNational: true },
      { date: "2026-04-06", name: "Ostermontag", isNational: false },
      { date: "2026-05-14", name: "Auffahrt", isNational: false },
      { date: "2026-05-24", name: "Pfingstsonntag", isNational: true },
      { date: "2026-05-25", name: "Pfingstmontag", isNational: false },
    ] : []),
  ];
}

/** Wochentag-Name auf Deutsch */
function getDayName(dateStr: string): string {
  const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return days[new Date(dateStr).getDay()];
}

/** Alle Daten einer Woche (Mo–So) */
function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const start = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const aiPlanningRouter = router({

  // ── 1. KI-Dienstplan generieren ────────────────────────────────────────────
  generatePlan: protectedProcedure
    .input(z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD (Montag)"),
      restaurantLat: z.number().optional().default(47.3769),   // Zürich als Standard
      restaurantLon: z.number().optional().default(8.5417),
      openingHour: z.number().int().min(0).max(23).default(11),
      closingHour: z.number().int().min(0).max(23).default(23),
      minStaffPerShift: z.number().int().min(1).max(20).default(2),
      hourlyWage: z.number().min(0).max(200).default(25),      // CHF/Std für Kostenschätzung
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      // Woche berechnen
      const weekDates = getWeekDates(input.weekStart);
      const weekEnd = weekDates[6];

      // ── Daten sammeln ─────────────────────────────────────────────────────

      // 1. Mitarbeiterliste
      const staffList = await db.select({
        id: users.id, name: users.name, role: users.role, status: users.status,
      }).from(users).where(and(
        eq(users.restaurantId, restaurantId),
        sql`${users.role} IN ('kellner','manager','barkeeper','koch')`,
        eq(users.status, "active"),
      ));

      // 2. Verfügbarkeiten
      const availabilities = await db.select().from(staffAvailability)
        .where(eq(staffAvailability.restaurantId, restaurantId));

      // 3. Genehmigte Abwesenheiten in dieser Woche
      const absencesInWeek = await db.select().from(staffAbsences)
        .where(and(
          eq(staffAbsences.restaurantId, restaurantId),
          eq(staffAbsences.status, "approved"),
          sql`NOT (${staffAbsences.endDate} < ${input.weekStart} OR ${staffAbsences.startDate} > ${weekEnd})`,
        ));

      // 4. Reservationen dieser Woche
      let reservationsData: Array<{ date: string; count: number; guests: number }> = [];
      try {
        const weekStartTs = new Date(input.weekStart);
        const weekEndTs = new Date(weekEnd);
        weekEndTs.setHours(23, 59, 59, 999);
        const resRows = await db.select().from(reservations)
          .where(and(
            eq(reservations.restaurantId, restaurantId),
            gte(reservations.reservedAt, weekStartTs),
            lte(reservations.reservedAt, weekEndTs),
            sql`${reservations.status} IN ('bestaetigt','angefragt')`,
          ));
        // Gruppieren nach Datum
        const grouped: Record<string, { count: number; guests: number }> = {};
        for (const r of resRows) {
          const dateKey = new Date(r.reservedAt).toISOString().split("T")[0];
          if (!grouped[dateKey]) grouped[dateKey] = { count: 0, guests: 0 };
          grouped[dateKey].count++;
          grouped[dateKey].guests += (r.guestCount as number | null) ?? 2;
        }
        reservationsData = Object.entries(grouped).map(([date, v]) => ({ date, ...v }));
      } catch {
        reservationsData = [];
      }

      // 5. Historische Umsätze (letzte 4 Wochen, gleiche Wochentage)
      const historicalRevenue: Record<string, number> = {};
      for (const dateStr of weekDates) {
        const dayOfWeek = new Date(dateStr).getDay();
        let totalRev = 0;
        let count = 0;
        for (let weeksBack = 1; weeksBack <= 4; weeksBack++) {
          const pastDate = new Date(dateStr);
          pastDate.setDate(pastDate.getDate() - weeksBack * 7);
          const pastDateStr = pastDate.toISOString().split("T")[0];
          try {
            const [rev] = await db.select({
              total: sql<number>`COALESCE(SUM(total_amount), 0)`,
            }).from(orders).where(and(
              eq(orders.restaurantId, restaurantId),
              sql`DATE(${orders.createdAt}) = ${pastDateStr}`,
              sql`${orders.status} = 'closed'`,
            ));
            if (rev?.total) { totalRev += Number(rev.total); count++; }
          } catch { /* ignorieren */ }
        }
        historicalRevenue[dateStr] = count > 0 ? Math.round(totalRev / count) : 0;
        void dayOfWeek; // suppress unused warning
      }

      // 6. Wetter-Prognose
      const weather = await fetchWeatherForecast(
        input.restaurantLat, input.restaurantLon, input.weekStart, weekEnd,
      );

      // 7. Schweizer Feiertage
      const year = new Date(input.weekStart).getFullYear();
      const holidays = getSwissHolidays(year).filter(h =>
        weekDates.includes(h.date),
      );

      // ── Kontext für KI aufbauen ───────────────────────────────────────────

      type AvailRow = typeof availabilities[0];
      type AbsenceRow = typeof absencesInWeek[0];
      const staffContext = staffList.map((s: typeof staffList[0]) => {
        const avail = availabilities.filter((a: AvailRow) => a.staffId === s.id);
        const absences = absencesInWeek.filter((a: AbsenceRow) => a.staffId === s.id);
        const availDays = avail.filter((a: AvailRow) => a.isAvailable).map((a: AvailRow) => {
          const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
          return `${days[a.dayOfWeek]} ${a.availableFrom ?? ""}\u2013${a.availableTo ?? ""}`;
        });
        return {
          id: s.id,
          name: s.name,
          role: s.role,
          availableDays: availDays.length > 0 ? availDays : ["Keine Einschr\u00e4nkungen"],
          absences: absences.map((a: AbsenceRow) => `${a.startDate} bis ${a.endDate} (${a.type})`),
        };
      });

      const dayContext = weekDates.map(date => {
        const w = weather?.find(w => w.date === date);
        const h = holidays.find(h => h.date === date);
        const res = reservationsData.find(r => r.date === date);
        const histRev = historicalRevenue[date] ?? 0;
        return {
          date,
          dayName: getDayName(date),
          weather: w ? `${w.description}, ${w.tempMax}°C, Niederschlag: ${w.precipitation}mm` : "Unbekannt",
          isGoodWeather: w?.isGoodWeather ?? false,
          holiday: h ? `Feiertag: ${h.name}` : null,
          reservations: res ? `${res.count} Reservationen, ${res.guests} Gäste` : "Keine Reservationen",
          historicalRevenue: histRev > 0 ? `Ø CHF ${histRev} (letzte 4 Wochen)` : "Keine Daten",
        };
      });

      // ── LLM-Prompt ────────────────────────────────────────────────────────

      const systemPrompt = `Du bist ein erfahrener Restaurantmanager und Personalplaner in der Schweiz.
Du erstellst professionelle Dienstpläne basierend auf Daten wie Wetter, Feiertage, Reservationen und historischen Umsätzen.

WICHTIGE REGELN (Schweizer Arbeitsrecht - ArG):
1. Maximale Arbeitszeit: 9 Stunden pro Tag, 45 Stunden pro Woche
2. Pflichtpausen: 15 Min ab 5.5h, 30 Min ab 7h, 60 Min ab 9h
3. Mindestruhezeit zwischen Schichten: 11 Stunden
4. Mindestens 1 freier Tag pro Woche
5. Nachtarbeit (23:00–06:00) braucht Sondergenehmigung

PLANUNGSREGELN:
- Wochenende (Fr/Sa) braucht mehr Personal (ca. 30-50% mehr)
- Schönes Wetter → mehr Gäste (Terrasse), mehr Personal einplanen
- Feiertage → Sonderregelung, evtl. Zuschläge
- Reservationen → direkte Planungsgrundlage
- Hoher historischer Umsatz → mehr Personal
- Jeder Mitarbeiter braucht mindestens 2 Ruhetage pro Woche
- Pausen müssen im Dienstplan eingetragen sein

AUSGABE: Antworte NUR mit einem validen JSON-Objekt. Kein Text davor oder danach.`;

      const userPrompt = `Erstelle einen Dienstplan für die Woche ${input.weekStart} bis ${weekEnd}.

Restaurant-Einstellungen:
- Öffnungszeiten: ${input.openingHour}:00 – ${input.closingHour}:00 Uhr
- Mindest-Personal pro Schicht: ${input.minStaffPerShift}
- Stundenlohn: CHF ${input.hourlyWage}

Verfügbare Mitarbeiter:
${JSON.stringify(staffContext, null, 2)}

Tages-Informationen:
${JSON.stringify(dayContext, null, 2)}

Erstelle einen detaillierten Dienstplan als JSON mit dieser Struktur:
{
  "reasoning": "Kurze Begründung der Planungsentscheidungen (max 300 Wörter)",
  "weekSummary": {
    "totalStaffHours": 0,
    "estimatedCost": 0,
    "peakDays": ["Freitag", "Samstag"],
    "warnings": ["Warnung 1", "Warnung 2"]
  },
  "shifts": [
    {
      "staffId": 1,
      "staffName": "Max Muster",
      "role": "kellner",
      "date": "2026-06-15",
      "startTime": "11:00",
      "endTime": "19:00",
      "breakMinutes": 30,
      "netHours": 7.5,
      "priority": "essential",
      "aiNote": "Frühschicht wegen hoher Reservationslast"
    }
  ]
}`;

      let planData: {
        reasoning: string;
        weekSummary: {
          totalStaffHours: number;
          estimatedCost: number;
          peakDays: string[];
          warnings: string[];
        };
        shifts: Array<{
          staffId: number;
          staffName: string;
          role: string;
          date: string;
          startTime: string;
          endTime: string;
          breakMinutes: number;
          netHours: number;
          priority: string;
          aiNote: string;
        }>;
      };

      try {
        const llmResponse = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        });

        const rawContent = llmResponse.choices?.[0]?.message?.content ?? "{}";
        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        planData = JSON.parse(content);
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "KI-Planung fehlgeschlagen. Bitte erneut versuchen.",
        });
      }

      // ── Plan in DB speichern (als Draft) ──────────────────────────────────

      const inputData = {
        weather: weather ?? [],
        holidays,
        reservations: reservationsData,
        historicalRevenue,
        staffCount: staffList.length,
        absenceCount: absencesInWeek.length,
      };

      const [planResult] = await db.insert(aiShiftPlans).values({
        restaurantId,
        weekStart: input.weekStart,
        weekEnd,
        status: "draft",
        aiModel: "llm",
        aiReasoning: planData.reasoning ?? "",
        inputData,
        totalStaffHours: String(planData.weekSummary?.totalStaffHours ?? 0),
        estimatedCost: String(planData.weekSummary?.estimatedCost ?? 0),
        createdBy: ctx.user.id,
      });

      const planId = (planResult as any).insertId as number;

      // Schichten speichern
      if (planData.shifts?.length > 0) {
        for (const shift of planData.shifts) {
          const priority = ["essential", "recommended", "optional"].includes(shift.priority)
            ? (shift.priority as "essential" | "recommended" | "optional")
            : "recommended";
          await db.insert(aiPlanShifts).values({
            planId,
            restaurantId,
            staffId: shift.staffId ?? null,
            staffName: shift.staffName ?? null,
            role: shift.role ?? "kellner",
            date: shift.date,
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakMinutes: shift.breakMinutes ?? 0,
            netHours: String(shift.netHours ?? 0),
            aiNote: shift.aiNote ?? null,
            priority,
          });
        }
      }

      return {
        planId,
        reasoning: planData.reasoning,
        weekSummary: planData.weekSummary,
        shifts: planData.shifts,
        inputSummary: {
          staffCount: staffList.length,
          absenceCount: absencesInWeek.length,
          reservationDays: reservationsData.length,
          weatherAvailable: !!weather,
          holidayCount: holidays.length,
        },
      };
    }),

  // ── 2. Alle Pläne abrufen ─────────────────────────────────────────────────
  getPlans: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(52).default(12),
    }))
    .query(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const plans = await db.select().from(aiShiftPlans)
        .where(eq(aiShiftPlans.restaurantId, restaurantId))
        .orderBy(desc(aiShiftPlans.weekStart))
        .limit(input.limit);

      return plans;
    }),

  // ── 3. Plan-Detail mit Schichten ──────────────────────────────────────────
  getPlanDetail: protectedProcedure
    .input(z.object({ planId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [plan] = await db.select().from(aiShiftPlans)
        .where(and(
          eq(aiShiftPlans.id, input.planId),
          eq(aiShiftPlans.restaurantId, restaurantId),
        ));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan nicht gefunden" });

      const shifts = await db.select().from(aiPlanShifts)
        .where(and(
          eq(aiPlanShifts.planId, input.planId),
          eq(aiPlanShifts.restaurantId, restaurantId),
        ))
        .orderBy(aiPlanShifts.date, aiPlanShifts.startTime);

      return { plan, shifts };
    }),

  // ── 4. Plan veröffentlichen ───────────────────────────────────────────────
  publishPlan: protectedProcedure
    .input(z.object({ planId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [plan] = await db.select().from(aiShiftPlans)
        .where(and(
          eq(aiShiftPlans.id, input.planId),
          eq(aiShiftPlans.restaurantId, restaurantId),
        ));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan nicht gefunden" });

      // Plan als veröffentlicht markieren
      await db.update(aiShiftPlans)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(aiShiftPlans.id, input.planId));

      // Alle Schichten dieses Plans laden
      const planShifts = await db.select().from(aiPlanShifts)
        .where(and(
          eq(aiPlanShifts.planId, input.planId),
          eq(aiPlanShifts.restaurantId, restaurantId),
        ));

      // Betroffene Mitarbeiter ermitteln
      const staffIdSetPub = new Set<number>(planShifts.map((s: typeof planShifts[0]) => s.staffId));
      const staffIdsPub = Array.from(staffIdSetPub);

      if (staffIdsPub.length > 0) {
        type StaffNotify = { id: number; name: string | null };
        const staffListPub: StaffNotify[] = (await db.select({ id: users.id, name: users.name })
          .from(users).where(sql`${users.id} IN (${staffIdsPub.join(",")})`)) as StaffNotify[];
        const staffMapPub = new Map<number, StaffNotify>(staffListPub.map(s => [s.id, s]));

        // Pro Mitarbeiter: Schichten zusammenfassen und Benachrichtigung senden
        for (const staffId of staffIdsPub) {
          const myShifts = planShifts.filter((s: typeof planShifts[0]) => s.staffId === staffId);
          const staff = staffMapPub.get(staffId);
          const shiftSummary = myShifts
            .sort((a: typeof planShifts[0], b: typeof planShifts[0]) => a.date.localeCompare(b.date))
            .map((s: typeof planShifts[0]) => `  • ${s.date}: ${s.startTime}–${s.endTime} (${s.role ?? "Kellner"})`)
            .join("\n");

          const notifyContent = [
            `Hallo ${staff?.name ?? "Mitarbeiter"},`,
            ``,
            `Dein Dienstplan für die Woche ${plan.weekStart} bis ${plan.weekEnd} wurde veröffentlicht.`,
            ``,
            `Deine Schichten:`,
            shiftSummary,
            ``,
            `Bitte bestätige deine Schichten im System unter "Eigene Schicht".`,
          ].join("\n");

          await notifyOwner({
            title: `📅 Dienstplan veröffentlicht: ${staff?.name ?? `MA-${staffId}`}`,
            content: notifyContent,
          }).catch(() => null);
        }

        // Admin-Zusammenfassung
        await notifyOwner({
          title: `✅ Dienstplan ${plan.weekStart}–${plan.weekEnd} veröffentlicht`,
          content: `${staffIdsPub.length} Mitarbeiter wurden benachrichtigt. ${planShifts.length} Schichten wurden zugewiesen.`,
        }).catch(() => null);
      }

      return {
        success: true,
        notifiedStaff: staffIdsPub.length,
        totalShifts: planShifts.length,
      };
    }),

  // ── 5. Plan löschen ───────────────────────────────────────────────────────
  deletePlan: protectedProcedure
    .input(z.object({ planId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdminOrManager(ctx);
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      await db.delete(aiPlanShifts).where(and(
        eq(aiPlanShifts.planId, input.planId),
        eq(aiPlanShifts.restaurantId, restaurantId),
      ));
      await db.delete(aiShiftPlans).where(and(
        eq(aiShiftPlans.id, input.planId),
        eq(aiShiftPlans.restaurantId, restaurantId),
      ));

      return { success: true };
    }),

  // ── 6. Schicht bestätigen (Mitarbeiter) ───────────────────────────────────
  confirmShift: protectedProcedure
    .input(z.object({ shiftId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const [shift] = await db.select().from(aiPlanShifts)
        .where(and(
          eq(aiPlanShifts.id, input.shiftId),
          eq(aiPlanShifts.restaurantId, restaurantId),
          eq(aiPlanShifts.staffId, ctx.effectiveUserId!),
        ));
      if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Schicht nicht gefunden" });

      await db.update(aiPlanShifts)
        .set({ confirmedByStaff: true, confirmedAt: new Date() })
        .where(eq(aiPlanShifts.id, input.shiftId));

      return { success: true };
    }),

  // ── 7. Eigene geplante Schichten (Kellner) ────────────────────────────────
  getMyPlannedShifts: protectedProcedure
    .input(z.object({
      weeksAhead: z.number().int().min(1).max(8).default(2),
    }))
    .query(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const today = new Date().toISOString().split("T")[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + input.weeksAhead * 7);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      // Nur veröffentlichte Pläne
      const publishedPlans = await db.select({ id: aiShiftPlans.id })
        .from(aiShiftPlans)
        .where(and(
          eq(aiShiftPlans.restaurantId, restaurantId),
          eq(aiShiftPlans.status, "published"),
          gte(aiShiftPlans.weekEnd, today),
          lte(aiShiftPlans.weekStart, futureDateStr),
        ));

      if (publishedPlans.length === 0) return { shifts: [], nextShift: null };

      const planIds = publishedPlans.map((p: typeof publishedPlans[0]) => p.id);
      const shifts = await db.select().from(aiPlanShifts)
        .where(and(
          eq(aiPlanShifts.staffId, ctx.effectiveUserId!),
          eq(aiPlanShifts.restaurantId, restaurantId),
          sql`${aiPlanShifts.planId} IN (${planIds.join(",")})`,
          gte(aiPlanShifts.date, today),
        ))
        .orderBy(aiPlanShifts.date, aiPlanShifts.startTime);

      const nextShift = shifts[0] ?? null;

      return { shifts, nextShift };
    }),

  // ── 8. Verfügbarkeit setzen (Kellner für sich selbst) ────────────────────
  setMyAvailability: protectedProcedure
    .input(z.object({
      availability: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        isAvailable: z.boolean(),
        availableFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        availableTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        maxHoursPerDay: z.number().min(0).max(12).optional(),
        notes: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      for (const avail of input.availability) {
        const existing = await db.select().from(staffAvailability)
          .where(and(
            eq(staffAvailability.staffId, ctx.effectiveUserId!),
            eq(staffAvailability.restaurantId, restaurantId),
            eq(staffAvailability.dayOfWeek, avail.dayOfWeek),
          )).limit(1);

        if (existing.length > 0) {
          await db.update(staffAvailability)
            .set({
              isAvailable: avail.isAvailable,
              availableFrom: avail.availableFrom ?? null,
              availableTo: avail.availableTo ?? null,
              maxHoursPerDay: avail.maxHoursPerDay?.toString() ?? null,
              notes: avail.notes ?? null,
            })
            .where(and(
              eq(staffAvailability.staffId, ctx.effectiveUserId!),
              eq(staffAvailability.restaurantId, restaurantId),
              eq(staffAvailability.dayOfWeek, avail.dayOfWeek),
            ));
        } else {
          await db.insert(staffAvailability).values({
            restaurantId,
            staffId: ctx.effectiveUserId!,
            dayOfWeek: avail.dayOfWeek,
            isAvailable: avail.isAvailable,
            availableFrom: avail.availableFrom ?? null,
            availableTo: avail.availableTo ?? null,
            maxHoursPerDay: avail.maxHoursPerDay?.toString() ?? null,
            notes: avail.notes ?? null,
          });
        }
      }

      return { success: true };
    }),

  // ── 9. Eigene Verfügbarkeit abrufen (Kellner) ─────────────────────────────
  getMyAvailability: protectedProcedure
    .query(async ({ ctx }) => {
      const restaurantId = getRestaurantId(ctx);
      const db = await getDb();

      const avail = await db.select().from(staffAvailability)
        .where(and(
          eq(staffAvailability.staffId, ctx.effectiveUserId!),
          eq(staffAvailability.restaurantId, restaurantId),
        ))
        .orderBy(staffAvailability.dayOfWeek);

      return avail;
    }),
});
