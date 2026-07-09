/**
 * QRorpa Statistik-Router
 * Liefert Tages-/Wochen-/Monats-/Jahresberichte aus den importierten QRorpa-Bestelldaten
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

export const qrorpaRouter = router({
  // ─── Überblick: Alle Monate ────────────────────────────────────────────────
  getMonthlyOverview: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT 
        monat, jahr, monat_name,
        COUNT(*) as anzahl,
        SUM(betrag_chf) as umsatz,
        AVG(betrag_chf) as durchschnitt,
        SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN 1 ELSE 0 END) as karte,
        SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN 1 ELSE 0 END) as bar,
        SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as umsatz_karte,
        SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as umsatz_bar
      FROM qrorpa_orders
      GROUP BY jahr, monat, monat_name
      ORDER BY jahr ASC, monat ASC
    `);
    return (rows as any[])[0] as any[];
  }),

  // ─── Tagesbericht ─────────────────────────────────────────────────────────
  getDailyReport: protectedProcedure
    .input(z.object({ datum: z.string() })) // Format: YYYY-MM-DD
    .query(async ({ input }) => {
      const db = await getDb();
      const [overview] = await db.execute(sql`
        SELECT 
          COUNT(*) as anzahl,
          SUM(betrag_chf) as umsatz,
          AVG(betrag_chf) as durchschnitt,
          MIN(betrag_chf) as min_betrag,
          MAX(betrag_chf) as max_betrag,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN 1 ELSE 0 END) as karte_anzahl,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN 1 ELSE 0 END) as bar_anzahl,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as karte_umsatz,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as bar_umsatz
        FROM qrorpa_orders
        WHERE DATE(iso_datum) = ${input.datum}
      `) as any;

      const byMitarbeiter = await db.execute(sql`
        SELECT mitarbeiter, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE DATE(iso_datum) = ${input.datum}
        GROUP BY mitarbeiter ORDER BY umsatz DESC
      `) as any;

      const byStunde = await db.execute(sql`
        SELECT HOUR(iso_datum) as stunde, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE DATE(iso_datum) = ${input.datum}
        GROUP BY stunde ORDER BY stunde ASC
      `) as any;

      const bestellungen = await db.execute(sql`
        SELECT id, datum, uhrzeit, tisch, mitarbeiter, betrag_chf, zahlungsmethode, produkte
        FROM qrorpa_orders
        WHERE DATE(iso_datum) = ${input.datum}
        ORDER BY iso_datum ASC
      `) as any;

      return {
        overview: (overview as any[])[0] || {},
        byMitarbeiter: (byMitarbeiter as any[])[0] || [],
        byStunde: (byStunde as any[])[0] || [],
        bestellungen: (bestellungen as any[])[0] || [],
      };
    }),

  // ─── Wochenbericht ────────────────────────────────────────────────────────
  getWeeklyReport: protectedProcedure
    .input(z.object({ jahr: z.number(), woche: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [overview] = await db.execute(sql`
        SELECT 
          COUNT(*) as anzahl,
          SUM(betrag_chf) as umsatz,
          AVG(betrag_chf) as durchschnitt,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as karte_umsatz,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as bar_umsatz
        FROM qrorpa_orders
        WHERE YEAR(iso_datum) = ${input.jahr} AND WEEK(iso_datum, 1) = ${input.woche}
      `) as any;

      const byTag = await db.execute(sql`
        SELECT wochentag, DATE(iso_datum) as datum, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE YEAR(iso_datum) = ${input.jahr} AND WEEK(iso_datum, 1) = ${input.woche}
        GROUP BY datum, wochentag ORDER BY datum ASC
      `) as any;

      const byMitarbeiter = await db.execute(sql`
        SELECT mitarbeiter, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE YEAR(iso_datum) = ${input.jahr} AND WEEK(iso_datum, 1) = ${input.woche}
        GROUP BY mitarbeiter ORDER BY umsatz DESC
      `) as any;

      return {
        overview: (overview as any[])[0] || {},
        byTag: (byTag as any[])[0] || [],
        byMitarbeiter: (byMitarbeiter as any[])[0] || [],
      };
    }),

  // ─── Monatsbericht ────────────────────────────────────────────────────────
  getMonthlyReport: protectedProcedure
    .input(z.object({ monat: z.number(), jahr: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [overview] = await db.execute(sql`
        SELECT 
          COUNT(*) as anzahl,
          SUM(betrag_chf) as umsatz,
          AVG(betrag_chf) as durchschnitt,
          MIN(betrag_chf) as min_betrag,
          MAX(betrag_chf) as max_betrag,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN 1 ELSE 0 END) as karte_anzahl,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN 1 ELSE 0 END) as bar_anzahl,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as karte_umsatz,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as bar_umsatz
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
      `) as any;

      const byTag = await db.execute(sql`
        SELECT DATE(iso_datum) as datum, wochentag, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
        GROUP BY datum, wochentag ORDER BY datum ASC
      `) as any;

      const byMitarbeiter = await db.execute(sql`
        SELECT mitarbeiter, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz,
               AVG(betrag_chf) as durchschnitt
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
        GROUP BY mitarbeiter ORDER BY umsatz DESC
      `) as any;

      const byZahlung = await db.execute(sql`
        SELECT zahlungsmethode, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
        GROUP BY zahlungsmethode ORDER BY umsatz DESC
      `) as any;

      const byWochentag = await db.execute(sql`
        SELECT wochentag, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz, AVG(betrag_chf) as durchschnitt
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
        GROUP BY wochentag
        ORDER BY FIELD(wochentag, 'Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag')
      `) as any;

      const byStunde = await db.execute(sql`
        SELECT HOUR(iso_datum) as stunde, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE monat = ${input.monat} AND jahr = ${input.jahr}
        GROUP BY stunde ORDER BY stunde ASC
      `) as any;

      return {
        overview: (overview as any[])[0] || {},
        byTag: (byTag as any[])[0] || [],
        byMitarbeiter: (byMitarbeiter as any[])[0] || [],
        byZahlung: (byZahlung as any[])[0] || [],
        byWochentag: (byWochentag as any[])[0] || [],
        byStunde: (byStunde as any[])[0] || [],
      };
    }),

  // ─── Jahresbericht ────────────────────────────────────────────────────────
  getYearlyReport: protectedProcedure
    .input(z.object({ jahr: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [overview] = await db.execute(sql`
        SELECT 
          COUNT(*) as anzahl,
          SUM(betrag_chf) as umsatz,
          AVG(betrag_chf) as durchschnitt,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as karte_umsatz,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as bar_umsatz
        FROM qrorpa_orders
        WHERE jahr = ${input.jahr}
      `) as any;

      const byMonat = await db.execute(sql`
        SELECT monat, monat_name, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE jahr = ${input.jahr}
        GROUP BY monat, monat_name ORDER BY monat ASC
      `) as any;

      const byMitarbeiter = await db.execute(sql`
        SELECT mitarbeiter, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE jahr = ${input.jahr}
        GROUP BY mitarbeiter ORDER BY umsatz DESC
      `) as any;

      const byQuartal = await db.execute(sql`
        SELECT quartal, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
        FROM qrorpa_orders
        WHERE jahr = ${input.jahr}
        GROUP BY quartal ORDER BY quartal ASC
      `) as any;

      return {
        overview: (overview as any[])[0] || {},
        byMonat: (byMonat as any[])[0] || [],
        byMitarbeiter: (byMitarbeiter as any[])[0] || [],
        byQuartal: (byQuartal as any[])[0] || [],
      };
    }),

  // ─── Mitarbeiter-Auswertung ────────────────────────────────────────────────
  getMitarbeiterReport: protectedProcedure
    .input(z.object({ monat: z.number().optional(), jahr: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const whereClause = input.monat && input.jahr
        ? sql`WHERE monat = ${input.monat} AND jahr = ${input.jahr}`
        : input.jahr
        ? sql`WHERE jahr = ${input.jahr}`
        : sql`WHERE 1=1`;

      const rows = await db.execute(sql`
        SELECT 
          mitarbeiter,
          COUNT(*) as anzahl,
          SUM(betrag_chf) as umsatz,
          AVG(betrag_chf) as durchschnitt,
          MIN(betrag_chf) as min_betrag,
          MAX(betrag_chf) as max_betrag,
          SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN 1 ELSE 0 END) as karte_anzahl,
          SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN 1 ELSE 0 END) as bar_anzahl
        FROM qrorpa_orders
        ${whereClause}
        GROUP BY mitarbeiter ORDER BY umsatz DESC
      `) as any;
      return (rows as any[])[0] as any[];
    }),

  // ─── Verfügbare Monate ────────────────────────────────────────────────────
  getAvailableMonths: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT DISTINCT monat, jahr, monat_name, COUNT(*) as anzahl, SUM(betrag_chf) as umsatz
      FROM qrorpa_orders
      GROUP BY monat, jahr, monat_name
      ORDER BY jahr DESC, monat DESC
    `) as any;
    return (rows as any[])[0] as any[];
  }),

  // ─── Gesamtstatistik ──────────────────────────────────────────────────────
  getGesamtstatistik: protectedProcedure.query(async () => {
    const db = await getDb();
    const [stats] = await db.execute(sql`
      SELECT 
        COUNT(*) as total_bestellungen,
        SUM(betrag_chf) as total_umsatz,
        AVG(betrag_chf) as durchschnitt,
        MIN(iso_datum) as erste_bestellung,
        MAX(iso_datum) as letzte_bestellung,
        SUM(CASE WHEN zahlungsmethode = 'Kartenzahlung' THEN betrag_chf ELSE 0 END) as karte_umsatz,
        SUM(CASE WHEN zahlungsmethode = 'Barzahlungen' THEN betrag_chf ELSE 0 END) as bar_umsatz,
        COUNT(DISTINCT DATE(iso_datum)) as aktive_tage,
        COUNT(DISTINCT mitarbeiter) as anzahl_mitarbeiter
      FROM qrorpa_orders
    `) as any;
    return (stats as any[])[0] || {};
  }),
});
