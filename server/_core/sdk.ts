import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// ─── Session Payload ──────────────────────────────────────────────────────────
export type SessionPayload = {
  userId: number;
  email: string;
  role: string;
};

export type AuthenticatedUser = User;

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
class AuthService {
  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  private parseCookies(cookieHeader: string | undefined): Map<string, string> {
    if (!cookieHeader) return new Map();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async createSessionToken(
    userId: number,
    email: string,
    role: string,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({ userId, email, role })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { userId, email, role } = payload as Record<string, unknown>;

      if (typeof userId !== "number" || typeof email !== "string" || typeof role !== "string") {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return { userId, email, role };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // Bearer Token Support für React Native App (Local Connect)
    const authHeader = req.headers.authorization;
    let sessionToken: string | undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7);
    } else {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionToken = cookies.get(COOKIE_NAME);
    }
    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserById(session.userId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    if (user.status !== "active") {
      throw ForbiddenError("Account is not active");
    }

    return user;
  }
}

export const sdk = new AuthService();
