import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getActiveSession } from "../db";
import crypto from "crypto";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * effectiveUserId: Wenn ein PIN-Kellner aktiv ist (x-active-waiter-id Header),
   * wird diese ID verwendet statt ctx.user.id. So sehen PIN-Kellner und OAuth-Kellner
   * dieselben personalisierten Daten (Umsätze, Schichten, etc.).
   */
  effectiveUserId: number | null;
  /**
   * sessionConflict: true wenn der eingeloggte User auf einem anderen Gerät aktiv ist.
   * Das Frontend zeigt dann eine Meldung und loggt aus.
   */
  sessionConflict: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let sessionConflict = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // SSE: Session-Conflict prüfen
  // Nur wenn User eingeloggt ist UND x-device-id Header vorhanden
  if (user) {
    const deviceId = opts.req.headers["x-device-id"] as string | undefined;
    if (deviceId) {
      try {
        const activeSession = await getActiveSession(user.id);
        if (activeSession && activeSession.deviceId !== deviceId) {
          // Anderes Gerät ist aktiv → Konflikt
          sessionConflict = true;
        }
      } catch {
        // DB-Fehler ignorieren, kein Konflikt annehmen
      }
    }
  }

  // PIN-Kellner-ID aus Header lesen (gesetzt vom Frontend wenn activeWaiter aktiv)
  let effectiveUserId: number | null = user?.id ?? null;
  const activeWaiterHeader = opts.req.headers["x-active-waiter-id"];
  if (activeWaiterHeader && typeof activeWaiterHeader === "string") {
    const parsedId = parseInt(activeWaiterHeader, 10);
    if (!isNaN(parsedId) && parsedId > 0) {
      effectiveUserId = parsedId;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    effectiveUserId,
    sessionConflict,
  };
}
