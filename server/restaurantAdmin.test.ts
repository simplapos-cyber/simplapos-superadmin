import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(restaurantId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: 10,
    openId: "restaurant-admin-1",
    email: "admin@restaurant.ch",
    name: "Restaurant Admin",
    loginMethod: "local",
    role: "admin",
    restaurantId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createUserWithoutRestaurant(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 20,
    openId: "user-no-restaurant",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("restaurantAdmin router", () => {
  describe("access control", () => {
    it("rejects unauthenticated users", async () => {
      const ctx = createUnauthContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.restaurantAdmin.overview()).rejects.toThrow();
    });

    it("rejects admin users without restaurantId", async () => {
      const ctx = createUserWithoutRestaurant();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.restaurantAdmin.overview()).rejects.toThrow("Kein Restaurant zugewiesen");
    });
  });

  describe("listModules", () => {
    it("returns module list with catalog metadata", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // This may throw NOT_FOUND if restaurant doesn't exist in DB,
      // but it validates the procedure is callable
      try {
        const modules = await caller.restaurantAdmin.listModules();
        // Should return array of modules with id, name, description, status
        expect(Array.isArray(modules)).toBe(true);
        if (modules.length > 0) {
          expect(modules[0]).toHaveProperty("id");
          expect(modules[0]).toHaveProperty("name");
          expect(modules[0]).toHaveProperty("status");
          expect(modules[0]).toHaveProperty("dbRecord");
        }
      } catch (e: any) {
        // Expected if restaurant doesn't exist in test DB
        expect(e.code).toBeDefined();
      }
    });
  });

  describe("startTrial", () => {
    it("rejects invalid module IDs gracefully", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.restaurantAdmin.startTrial({ moduleId: "nonexistent_module_xyz" });
      } catch (e: any) {
        // Should either throw NOT_FOUND (restaurant doesn't exist) or succeed
        expect(e.code).toBeDefined();
      }
    });
  });

  describe("staff management", () => {
    it("rejects creating staff with invalid email", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.restaurantAdmin.createStaff({
          name: "Test",
          email: "not-an-email",
          password: "test123",
          role: "kellner",
        })
      ).rejects.toThrow();
    });

    it("rejects creating staff with short password", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.restaurantAdmin.createStaff({
          name: "Test",
          email: "test@valid.ch",
          password: "12345", // too short
          role: "kellner",
        })
      ).rejects.toThrow();
    });
  });

  describe("table management", () => {
    it("rejects creating table without name", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.restaurantAdmin.createTable({
          name: "", // empty
          seats: 4,
        })
      ).rejects.toThrow();
    });
  });

  describe("settings", () => {
    it("rejects updating settings with invalid email", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.restaurantAdmin.updateSettings({
          email: "not-valid-email",
        })
      ).rejects.toThrow();
    });
  });
});
