import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";
import type { Request, Response } from "express";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => {
  const mockUser: User = {
    id: 1,
    email: "admin@simplapos.com",
    passwordHash: "$2a$12$mockhashvalue.mockhashvalue.mockhashvalue.mockhash",
    name: "Test Admin",
    role: "superadmin",
    status: "active",
    restaurantId: null,
    avatarUrl: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    getUserByEmail: vi.fn().mockResolvedValue(mockUser),
    getUserById: vi.fn().mockResolvedValue(mockUser),
    createUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    getAllUsers: vi.fn().mockResolvedValue([mockUser]),
    getAllRestaurants: vi.fn().mockResolvedValue([]),
    getRestaurantById: vi.fn().mockResolvedValue(undefined),
    createRestaurant: vi.fn().mockResolvedValue({ id: 1, name: "Test" }),
    updateRestaurant: vi.fn().mockResolvedValue(undefined),
    deleteRestaurant: vi.fn().mockResolvedValue(undefined),
    getCategoriesByRestaurant: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: 1, name: "Cat" }),
    updateCategory: vi.fn().mockResolvedValue(undefined),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    getProductsByRestaurant: vi.fn().mockResolvedValue([]),
    createProduct: vi.fn().mockResolvedValue({ id: 1, name: "Prod" }),
    updateProduct: vi.fn().mockResolvedValue(undefined),
    deleteProduct: vi.fn().mockResolvedValue(undefined),
    getTablesByRestaurant: vi.fn().mockResolvedValue([]),
    createTable: vi.fn().mockResolvedValue({ id: 1, name: "T1" }),
    updateTable: vi.fn().mockResolvedValue(undefined),
    deleteTable: vi.fn().mockResolvedValue(undefined),
    getChatConversations: vi.fn().mockResolvedValue([]),
    getChatMessages: vi.fn().mockResolvedValue([]),
    createChatConversation: vi.fn().mockResolvedValue({ id: 1 }),
    createChatMessage: vi.fn().mockResolvedValue({ id: 1, content: "hi" }),
    updateConversationStatus: vi.fn().mockResolvedValue(undefined),
    getAllAdvertisements: vi.fn().mockResolvedValue([]),
    createAdvertisement: vi.fn().mockResolvedValue({ id: 1 }),
    updateAdvertisement: vi.fn().mockResolvedValue(undefined),
    deleteAdvertisement: vi.fn().mockResolvedValue(undefined),
    getAllReviews: vi.fn().mockResolvedValue([]),
    updateReview: vi.fn().mockResolvedValue(undefined),
    getAllContracts: vi.fn().mockResolvedValue([]),
    createContract: vi.fn().mockResolvedValue({ id: 1 }),
    updateContract: vi.fn().mockResolvedValue(undefined),
    deleteContract: vi.fn().mockResolvedValue(undefined),
    getAllInvoices: vi.fn().mockResolvedValue([]),
    createInvoice: vi.fn().mockResolvedValue({ id: 1 }),
    updateInvoice: vi.fn().mockResolvedValue(undefined),
    getAllMedia: vi.fn().mockResolvedValue([]),
    createMediaItem: vi.fn().mockResolvedValue({ id: 1 }),
    deleteMediaItem: vi.fn().mockResolvedValue(undefined),
    getDashboardStats: vi.fn().mockResolvedValue({
      restaurants: 5,
      users: 12,
      contracts: 8,
      openChats: 3,
      contractsToday: 1,
    }),
    // SSE: Single-Session-Enforcement Mocks
    upsertActiveSession: vi.fn().mockResolvedValue(undefined),
    getActiveSession: vi.fn().mockResolvedValue(undefined),
    deleteActiveSession: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Mock bcrypt ──────────────────────────────────────────────────────────────
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue("$2a$12$newhash"),
  },
}));

// ─── Mock storage ─────────────────────────────────────────────────────────────
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test.png" }),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "KI-Antwort" } }],
  }),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
const mockUser: User = {
  id: 1,
  email: "admin@simplapos.com",
  passwordHash: "$2a$12$mockhash",
  name: "Test Admin",
  role: "superadmin",
  status: "active",
  restaurantId: null,
  avatarUrl: null,
  phone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createAuthContext(user: User = mockUser) {
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  const req = {
    headers: { cookie: "session=mock-token" },
    protocol: "https",
    get: vi.fn().mockReturnValue("localhost"),
  } as unknown as Request;
  return { req, res, user };
}

function createPublicContext() {
  const res = {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
  const req = {
    headers: {},
    protocol: "https",
    get: vi.fn().mockReturnValue("localhost"),
  } as unknown as Request;
  return { req, res, user: null };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user without passwordHash when authenticated", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("passwordHash");
    expect(result?.email).toBe("admin@simplapos.com");
  });
});

describe("auth.login", () => {
  it("sets cookie and returns user on valid credentials", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.login({
      email: "admin@simplapos.com",
      password: "Simplapos2024!",
    });
    expect(result.user.email).toBe("admin@simplapos.com");
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(ctx.res.cookie).toHaveBeenCalled();
  });
});

describe("auth.logout", () => {
  it("clears cookie and returns success", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(ctx.res.clearCookie).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxAge: -1 })
    );
  });
});

describe("dashboard.stats", () => {
  it("returns stats for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.dashboard.stats();
    expect(result).not.toBeNull();
    expect(typeof (result as any).restaurants).toBe("number");
  });
});

describe("restaurants", () => {
  it("lists restaurants", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.restaurants.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a restaurant", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.restaurants.create({ name: "Test Restaurant" });
    expect(result).toBeDefined();
  });
});

describe("users", () => {
  it("lists users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("updates user role", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.users.update({ id: 1, role: "admin" });
    expect(result.success).toBe(true);
  });
});

describe("auth.register", () => {
  it("allows superadmin to register new users", async () => {
    const { getUserByEmail } = await import("./db");
    (getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.auth.register({
      email: "new@simplapos.com",
      password: "Passwort123!",
      name: "Neuer Kellner",
      role: "kellner",
    });
    expect(result.success).toBe(true);
  });

  it("rejects registration from non-superadmin", async () => {
    const nonAdmin: User = { ...mockUser, role: "admin" };
    const caller = appRouter.createCaller(createAuthContext(nonAdmin));
    await expect(
      caller.auth.register({ email: "x@y.com", password: "Passwort123!" })
    ).rejects.toThrow();
  });
});
