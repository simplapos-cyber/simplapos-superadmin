import type { Express } from "express";

// OAuth routes are no longer used – authentication is handled via
// email/password login in the tRPC auth router.
// This file is kept as a no-op to avoid import errors.
export function registerOAuthRoutes(_app: Express) {
  // No-op: Manus OAuth replaced by own email/password auth
}
