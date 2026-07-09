import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB module ─────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAllUsers: vi.fn().mockResolvedValue([
    { id: 1, name: "Admin User", email: "admin@test.ch", role: "admin", status: "active", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), openId: "abc" },
  ]),
  updateUser: vi.fn().mockResolvedValue({ id: 1, role: "superadmin", status: "active" }),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue({ id: 1, email: "admin@test.ch", name: "Admin", role: "superadmin", status: "active", passwordHash: "$2a$12$test" }),
  createUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  createVerificationCode: vi.fn().mockResolvedValue(undefined),
  getVerificationCode: vi.fn().mockResolvedValue(undefined),
  deleteVerificationCodes: vi.fn().mockResolvedValue(undefined),
  activateUser: vi.fn().mockResolvedValue(undefined),
  getAllRestaurants: vi.fn().mockResolvedValue([
    { id: 1, name: "Test Restaurant", status: "active", city: "Zürich", totalRevenue: "5000.00", totalOrders: 100 },
  ]),
  getRestaurantById: vi.fn().mockResolvedValue({
    id: 1, name: "Test Restaurant", status: "active", city: "Zürich",
  }),
  createRestaurant: vi.fn().mockResolvedValue({ id: 2, name: "Neu", status: "trial" }),
  updateRestaurant: vi.fn().mockResolvedValue({ id: 1, name: "Updated" }),
  deleteRestaurant: vi.fn().mockResolvedValue(true),
  getCategoriesByRestaurant: vi.fn().mockResolvedValue([
    { id: 1, restaurantId: 1, name: "Vorspeisen", isActive: true },
  ]),
  createCategory: vi.fn().mockResolvedValue({ id: 2, name: "Desserts" }),
  updateCategory: vi.fn().mockResolvedValue({ id: 1, name: "Updated Cat" }),
  deleteCategory: vi.fn().mockResolvedValue(true),
  getProductsByRestaurant: vi.fn().mockResolvedValue([
    { id: 1, restaurantId: 1, name: "Salat", price: "12.50", isActive: true },
  ]),
  createProduct: vi.fn().mockResolvedValue({ id: 2, name: "Pizza", price: "18.00" }),
  updateProduct: vi.fn().mockResolvedValue({ id: 1, name: "Updated Product" }),
  deleteProduct: vi.fn().mockResolvedValue(true),
  getTablesByRestaurant: vi.fn().mockResolvedValue([
    { id: 1, restaurantId: 1, name: "Tisch 1", seats: 4 },
  ]),
  createTable: vi.fn().mockResolvedValue({ id: 2, name: "Tisch 2" }),
  updateTable: vi.fn().mockResolvedValue({ id: 1, name: "Updated Table" }),
  deleteTable: vi.fn().mockResolvedValue(true),
  getChatConversations: vi.fn().mockResolvedValue([
    { id: 1, subject: "Hilfe", status: "open", priority: "medium", lastMessageAt: new Date() },
  ]),
  getChatMessages: vi.fn().mockResolvedValue([
    { id: 1, conversationId: 1, content: "Hallo", senderType: "user", createdAt: new Date() },
  ]),
  createChatConversation: vi.fn().mockResolvedValue({ id: 2, subject: "Neue Anfrage", status: "open" }),
  createChatMessage: vi.fn().mockResolvedValue({ id: 2, content: "Antwort", senderType: "superadmin" }),
  updateConversationStatus: vi.fn().mockResolvedValue(true),
  getAllAdvertisements: vi.fn().mockResolvedValue([
    { id: 1, title: "Sommer-Aktion", isActive: true, impressions: 100, clicks: 10 },
  ]),
  createAdvertisement: vi.fn().mockResolvedValue({ id: 2, title: "Neue Werbung" }),
  updateAdvertisement: vi.fn().mockResolvedValue({ id: 1, isActive: false }),
  deleteAdvertisement: vi.fn().mockResolvedValue(true),
  getAllReviews: vi.fn().mockResolvedValue([
    { id: 1, type: "restaurant", rating: 5, status: "pending", guestName: "Max", comment: "Super!", createdAt: new Date(), updatedAt: new Date() },
  ]),
  updateReview: vi.fn().mockResolvedValue({ id: 1, status: "approved" }),
  getAllContracts: vi.fn().mockResolvedValue([
    { id: 1, title: "Jahresvertrag", contractType: "standard", status: "active", restaurantId: 1, createdAt: new Date(), updatedAt: new Date() },
  ]),
  createContract: vi.fn().mockResolvedValue({ id: 2, title: "Neuer Vertrag", status: "draft" }),
  updateContract: vi.fn().mockResolvedValue({ id: 1, status: "signed" }),
  deleteContract: vi.fn().mockResolvedValue(true),
  getAllInvoices: vi.fn().mockResolvedValue([
    { id: 1, restaurantId: 1, amount: "100.00", taxAmount: "7.70", totalAmount: "107.70", status: "sent", currency: "CHF", createdAt: new Date(), updatedAt: new Date() },
  ]),
  createInvoice: vi.fn().mockResolvedValue({ id: 2, totalAmount: "107.70", status: "draft" }),
  updateInvoice: vi.fn().mockResolvedValue({ id: 1, status: "paid" }),
  getAllMedia: vi.fn().mockResolvedValue([
    { id: 1, name: "logo.png", url: "/manus-storage/logo.png", mimeType: "image/png", category: "logo", fileSize: 1024, fileKey: "logo.png", createdAt: new Date() },
  ]),
  createMediaItem: vi.fn().mockResolvedValue({ id: 2, name: "image.jpg", url: "/manus-storage/image.jpg" }),
  deleteMediaItem: vi.fn().mockResolvedValue(true),
  getDashboardStats: vi.fn().mockResolvedValue({
    restaurantCount: 5, userCount: 20, openChats: 3, escalatedChats: 1,
    pendingReviews: 7, activeContracts: 4, overdueInvoices: 2,
    totalRevenue: 125000, invoiceRevenue: 8500, highRiskRestaurants: 1,
  }),
  createRestaurantModules: vi.fn().mockResolvedValue(undefined),
  getActiveRestaurantModules: vi.fn().mockResolvedValue([
    { id: 1, restaurantId: 1, contractId: 1, moduleId: "pos_base", quantity: 1, status: "active", activatedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
    { id: 2, restaurantId: 1, contractId: 1, moduleId: "kds", quantity: 2, status: "active", activatedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  ]),
  createSubscription: vi.fn().mockResolvedValue({ id: 1, restaurantId: 1, contractId: 1, billingCycle: "monthly", monthlyAmount: "89.00", status: "pending", createdAt: new Date() }),
  getSubscriptionByRestaurant: vi.fn().mockResolvedValue({ id: 1, restaurantId: 1, contractId: 1, billingCycle: "monthly", monthlyAmount: "89.00", status: "pending", createdAt: new Date() }),
  updateSubscription: vi.fn().mockResolvedValue(undefined),
  getAllSubscriptions: vi.fn().mockResolvedValue([]),
  getPaymentsByRestaurant: vi.fn().mockResolvedValue([]),
  getAllPayments: vi.fn().mockResolvedValue([]),
  createActivationToken: vi.fn().mockResolvedValue(undefined),
  getActivationToken: vi.fn().mockResolvedValue({
    id: 1, token: "test-token-abc123", email: "owner@restaurant.ch",
    userId: null, contractId: 1, restaurantId: 1,
    usedAt: null, expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), createdAt: new Date(),
  }),
  markActivationTokenUsed: vi.fn().mockResolvedValue(undefined),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "KI-Antwort auf Ihre Frage." } }],
  }),
}));

// Mock Stripe
vi.mock("./stripe", () => ({
  createCheckoutSession: vi.fn().mockResolvedValue("https://checkout.stripe.com/test"),
  createRenewalCheckoutSession: vi.fn().mockResolvedValue("https://checkout.stripe.com/renewal"),
  stripe: { webhooks: { constructEvent: vi.fn() } },
}));

// Mock contractEmail
vi.mock("./contractEmail", () => ({
  sendContractConfirmationEmail: vi.fn().mockResolvedValue({ success: true, activationToken: "test-token", pdfUrl: "/manus-storage/test.pdf" }),
}));

// ─── Context helpers ─────────────────────────────────────────────────────────
function createCtx(role: string = "superadmin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "admin@simplapos.ch",
      name: "Test Admin",
      loginMethod: "manus",
      role: role as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("dashboard.stats", () => {
  it("returns aggregated stats for authenticated user", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.dashboard.stats();
    expect(result.restaurantCount).toBe(5);
    expect(result.openChats).toBe(3);
    expect(result.highRiskRestaurants).toBe(1);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createUnauthCtx());
    await expect(caller.dashboard.stats()).rejects.toThrow(TRPCError);
  });
});

describe("restaurants router", () => {
  it("list returns restaurants", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.list();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Restaurant");
  });

  it("list with search passes search param", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.list({ search: "Test" });
    expect(result).toHaveLength(1);
  });

  it("get returns single restaurant", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.get({ id: 1 });
    expect(result?.id).toBe(1);
  });

  it("create returns new restaurant", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.create({ name: "Neu", status: "trial" });
    expect(result.id).toBe(2);
  });

  it("create throws BAD_REQUEST for empty name", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.restaurants.create({ name: "" })).rejects.toThrow();
  });

  it("update returns updated restaurant", async () => {
    const caller = appRouter.createCaller(createCtx());
    // update calls updateRestaurant then getRestaurantById (mocked to return id:1)
    const result = await caller.restaurants.update({ id: 1, name: "Updated" });
    expect(result).toBeDefined();
    expect(result?.id).toBe(1);
  });

  it("delete returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("categories returns list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.categories({ restaurantId: 1 });
    expect(result).toHaveLength(1);
  });

  it("products returns list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.products({ restaurantId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe("12.50");
  });

  it("tables returns list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.tables({ restaurantId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].seats).toBe(4);
  });

  it("list throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createUnauthCtx());
    await expect(caller.restaurants.list()).rejects.toThrow(TRPCError);
  });
});

describe("users router", () => {
  it("list returns users", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.users.list();
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("admin");
  });

  it("update changes user role", async () => {
    const caller = appRouter.createCaller(createCtx());
    // router returns { success: true }
    const result = await caller.users.update({ id: 1, role: "superadmin" });
    expect(result).toEqual({ success: true });
  });

  it("list throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createUnauthCtx());
    await expect(caller.users.list()).rejects.toThrow(TRPCError);
  });
});

describe("chat router", () => {
  it("conversations returns list", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.chat.conversations();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("open");
  });

  it("messages returns list for conversation", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.chat.messages({ conversationId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].senderType).toBe("user");
  });

  it("sendMessage creates new message", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.chat.sendMessage({ conversationId: 1, content: "Test", senderType: "superadmin" });
    expect(result.content).toBe("Antwort");
  });

  it("updateStatus changes conversation status", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.chat.updateStatus({ id: 1, status: "resolved" });
    expect(result).toEqual({ success: true });
  });

  it("aiReply calls LLM and saves message", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.chat.aiReply({ conversationId: 1, userMessage: "Wie kann ich helfen?" });
    expect(result.content).toBeDefined();
  });
});

describe("advertisements router", () => {
  it("list returns ads", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.advertisements.list();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Sommer-Aktion");
  });

  it("create returns new ad", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.advertisements.create({ title: "Neue Werbung" });
    expect(result.id).toBe(2);
  });

  it("update toggles isActive", async () => {
    const caller = appRouter.createCaller(createCtx());
    // router returns { success: true }
    const result = await caller.advertisements.update({ id: 1, isActive: false });
    expect(result).toEqual({ success: true });
  });

  it("delete returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.advertisements.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("reviews router", () => {
  it("list returns reviews", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.reviews.list({});
    expect(result).toHaveLength(1);
    expect(result[0].rating).toBe(5);
  });

  it("update approves review", async () => {
    const caller = appRouter.createCaller(createCtx());
    // router returns { success: true }
    const result = await caller.reviews.update({ id: 1, status: "approved" });
    expect(result).toEqual({ success: true });
  });
});

describe("restaurants.modules", () => {
  it("returns active modules for a restaurant", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.restaurants.modules({ restaurantId: 1 });
    expect(result).toHaveLength(2);
    expect(result[0].moduleId).toBe("pos_base");
    expect(result[1].moduleId).toBe("kds");
    expect(result[1].quantity).toBe(2);
  });

  it("throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createUnauthCtx());
    await expect(caller.restaurants.modules({ restaurantId: 1 })).rejects.toThrow(TRPCError);
  });
});

describe("contracts.createWithRestaurant (auto-provisioning)", () => {
  it("creates restaurant, contract, and modules with pending_verification status", async () => {
    const { createRestaurantModules, createRestaurant, createContract } = await import("./db");
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contracts.createWithRestaurant({
      billingCycle: "monthly",
      restaurantName: "Test Auto",
      restaurantEmail: "test@auto.ch",
      numEmployees: 2,
      selectedModules: [
        { moduleId: "pos_base", quantity: 1 },
        { moduleId: "kds", quantity: 2 },
        { moduleId: "online_order", quantity: 1 },
      ],
    });
    expect(result.restaurant).toBeDefined();
    expect(result.contract).toBeDefined();
    expect(result.pricing).toBeDefined();
    // Verify restaurant was created with pending_verification status
    expect(createRestaurant).toHaveBeenCalledWith(expect.objectContaining({
      name: "Test Auto",
      status: "pending_verification",
    }));
    // Verify contract was created with pending_verification status
    expect(createContract).toHaveBeenCalledWith(expect.objectContaining({
      status: "pending_verification",
    }));
    // Verify modules were provisioned
    expect(createRestaurantModules).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ moduleId: "pos_base", quantity: 1, status: "active" }),
        expect.objectContaining({ moduleId: "kds", quantity: 2, status: "active" }),
        expect.objectContaining({ moduleId: "online_order", quantity: 1, status: "active" }),
      ])
    );
    // Verify email was sent (restaurantEmail provided)
    const { sendContractConfirmationEmail } = await import("./contractEmail");
    expect(sendContractConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantName: "Test Auto",
        recipientEmail: "test@auto.ch",
      })
    );
  });
});

describe("contracts router", () => {
  it("list returns contracts", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contracts.list();
    expect(result).toHaveLength(1);
    expect(result[0].contractType).toBe("standard");
  });

  it("create returns new contract", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contracts.create({
      restaurantId: 1,
      title: "Neuer Vertrag",
      contractType: "standard",
    });
    expect(result.id).toBe(2);
  });

  it("update changes status", async () => {
    const caller = appRouter.createCaller(createCtx());
    // router returns { success: true }
    const result = await caller.contracts.update({ id: 1, status: "signed" });
    expect(result).toEqual({ success: true });
  });

  it("delete returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contracts.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });
});

describe("invoices router", () => {
  it("list returns invoices", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.invoices.list();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("sent");
  });

  it("create returns new invoice", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.invoices.create({
      restaurantId: 1,
      amount: "100.00",
      taxAmount: "7.70",
      totalAmount: "107.70",
    });
    expect(result.totalAmount).toBe("107.70");
  });

  it("update marks invoice as paid", async () => {
    const caller = appRouter.createCaller(createCtx());
    // router returns { success: true }
    const result = await caller.invoices.update({ id: 1, status: "paid" });
    expect(result).toEqual({ success: true });
  });
});

describe("media router", () => {
  it("list returns media items", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.media.list();
    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/png");
  });

  it("upload stores file and returns item", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.media.upload({
      name: "test.jpg",
      base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      mimeType: "image/jpeg",
      category: "other",
    });
    expect(result.url).toBeDefined();
  });

  it("delete returns success", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.media.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("list throws UNAUTHORIZED for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createUnauthCtx());
    await expect(caller.media.list()).rejects.toThrow(TRPCError);
  });
});

// ─── Contract Verification Tests ─────────────────────────────────────────────

describe("contracts.approve", () => {
  it("approves a pending_verification contract (superadmin)", async () => {
    const { getAllContracts, updateContract, updateRestaurant } = await import("./db");
    (getAllContracts as any).mockResolvedValueOnce([
      { id: 5, title: "Pending Vertrag", status: "pending_verification", restaurantId: 10, createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    const result = await caller.contracts.approve({ contractId: 5 });
    expect(result.success).toBe(true);
    expect(updateContract).toHaveBeenCalledWith(5, expect.objectContaining({ status: "active" }));
    expect(updateRestaurant).toHaveBeenCalledWith(10, expect.objectContaining({ status: "active" }));
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(createCtx("kellner"));
    await expect(caller.contracts.approve({ contractId: 5 })).rejects.toThrow(TRPCError);
  });

  it("throws NOT_FOUND for non-existent contract", async () => {
    const { getAllContracts } = await import("./db");
    (getAllContracts as any).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    await expect(caller.contracts.approve({ contractId: 999 })).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST for already active contract", async () => {
    const { getAllContracts } = await import("./db");
    (getAllContracts as any).mockResolvedValueOnce([
      { id: 5, title: "Active Vertrag", status: "active", restaurantId: 10, createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    await expect(caller.contracts.approve({ contractId: 5 })).rejects.toThrow(TRPCError);
  });
});

describe("contracts.reject", () => {
  it("rejects a pending_verification contract with reason", async () => {
    const { getAllContracts, updateContract, updateRestaurant } = await import("./db");
    (getAllContracts as any).mockResolvedValueOnce([
      { id: 6, title: "Pending Vertrag 2", status: "pending_verification", restaurantId: 11, createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    const result = await caller.contracts.reject({ contractId: 6, reason: "Fehlende Unterlagen" });
    expect(result.success).toBe(true);
    expect(updateContract).toHaveBeenCalledWith(6, expect.objectContaining({
      status: "rejected",
      rejectionReason: "Fehlende Unterlagen",
    }));
    expect(updateRestaurant).toHaveBeenCalledWith(11, expect.objectContaining({ status: "inactive" }));
  });

  it("rejects without reason (uses default)", async () => {
    const { getAllContracts, updateContract } = await import("./db");
    (getAllContracts as any).mockResolvedValueOnce([
      { id: 7, title: "Pending Vertrag 3", status: "pending_verification", restaurantId: 12, createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    const result = await caller.contracts.reject({ contractId: 7 });
    expect(result.success).toBe(true);
    expect(updateContract).toHaveBeenCalledWith(7, expect.objectContaining({
      status: "rejected",
      rejectionReason: "Keine Angabe",
    }));
  });

  it("throws FORBIDDEN for non-admin user", async () => {
    const caller = appRouter.createCaller(createCtx("kellner"));
    await expect(caller.contracts.reject({ contractId: 6, reason: "test" })).rejects.toThrow(TRPCError);
  });
});


// ─── ACTIVATION TOKEN TESTS ──────────────────────────────────────────────────
describe("auth.validateActivationToken", () => {
  it("returns email and IDs for valid token", async () => {
    const caller = appRouter.createCaller(createCtx("superadmin"));
    const result = await caller.auth.validateActivationToken({ token: "test-token-abc123" });
    expect(result.email).toBe("owner@restaurant.ch");
    expect(result.restaurantId).toBe(1);
    expect(result.contractId).toBe(1);
  });

  it("throws NOT_FOUND for invalid token", async () => {
    const { getActivationToken } = await import("./db");
    (getActivationToken as any).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    await expect(caller.auth.validateActivationToken({ token: "invalid" })).rejects.toThrow(TRPCError);
  });

  it("throws BAD_REQUEST for already used token", async () => {
    const { getActivationToken } = await import("./db");
    (getActivationToken as any).mockResolvedValueOnce({
      id: 1, token: "used-token", email: "test@test.ch",
      userId: null, contractId: 1, restaurantId: 1,
      usedAt: new Date(), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), createdAt: new Date(),
    });
    const caller = appRouter.createCaller(createCtx("superadmin"));
    await expect(caller.auth.validateActivationToken({ token: "used-token" })).rejects.toThrow(TRPCError);
  });
});

describe("auth.activateAccount", () => {
  it("activates account and returns user for valid token", async () => {
    const { getUserByEmail } = await import("./db");
    (getUserByEmail as any).mockResolvedValueOnce({
      id: 5, email: "owner@restaurant.ch", name: "Test Owner",
      role: "admin", status: "pending", passwordHash: "old-hash",
    });
    const caller = appRouter.createCaller(createCtx("superadmin"));
    const result = await caller.auth.activateAccount({
      token: "test-token-abc123",
      password: "SecurePass123!",
      name: "Restaurant Owner",
    });
    expect(result.success).toBe(true);
    expect(result.user.email).toBe("owner@restaurant.ch");
  });

  it("throws NOT_FOUND for invalid token", async () => {
    const { getActivationToken } = await import("./db");
    (getActivationToken as any).mockResolvedValueOnce(undefined);
    const caller = appRouter.createCaller(createCtx("superadmin"));
    await expect(caller.auth.activateAccount({
      token: "invalid",
      password: "SecurePass123!",
    })).rejects.toThrow(TRPCError);
  });
});
