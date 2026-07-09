import { eq, desc, count, sql, and, like, or, gt, lte, gte, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  InsertUser, User, users, sessions,
  restaurants, categories, products, restaurantTables,
  chatConversations, chatMessages,
  advertisements, reviews, contracts, invoices, mediaLibrary,
  verificationCodes, restaurantModules, InsertRestaurantModule,
  subscriptions, payments,
  hardwareProducts, InsertHardwareProduct,
  activationTokens, InsertActivationToken,
  orders, orderItems, inventory, aiInsightsCache,
  reservations, InsertReservation,
  vouchers, voucherRedemptions, giftCardPurchases,
  menuItems, menuCategories,
  activeSessions, InsertActiveSession, ActiveSession,
} from "../drizzle/schema";

let _db: any = null;
let _pool: mysql.Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Create a connection pool for Cloud Run (512MB, 1 vCPU).
      // Limit 8: AdminDashboard fires up to 9 parallel queries on mount;
      // 8 connections handles that burst while staying well within TiDB's limits.
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 8,
        maxIdle: 3,
        idleTimeout: 60000, // Close idle connections after 60s
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,
        connectTimeout: 10000, // 10s connection timeout
      });
      _db = drizzle(_pool);
      console.log("[Database] Connection pool initialized (limit: 8)");
    } catch (error) {
      console.error("[Database] Failed to create pool:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

// Graceful pool shutdown
export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    console.log("[Database] Connection pool closed.");
  }
}

// ─── USERS ────────────────────────────────────────────────────────────────────
export async function createUser(data: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(users).values(data);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return result[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getAllUsers(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(users).where(
      or(like(users.name, `%${search}%`), like(users.email, `%${search}%`))
    ).orderBy(desc(users.createdAt)).limit(100);
  }
  return db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, id));
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, id));
}

export async function countUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(users);
  return result[0]?.count ?? 0;
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
export async function createSession(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(sessions).values({ userId, token, expiresAt });
}

export async function getSessionByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return result[0];
}

// ─── RESTAURANTS ──────────────────────────────────────────────────────────────
export async function getAllRestaurants(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(restaurants).where(
      or(like(restaurants.name, `%${search}%`), like(restaurants.city, `%${search}%`))
    ).orderBy(desc(restaurants.createdAt)).limit(100);
  }
  return db.select().from(restaurants).orderBy(desc(restaurants.createdAt)).limit(100);
}

export async function getRestaurantById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return result[0];
}

export async function createRestaurant(data: typeof restaurants.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(restaurants).values(data);
  const result = await db.select().from(restaurants).orderBy(desc(restaurants.createdAt)).limit(1);
  return result[0];
}

export async function updateRestaurant(id: number, data: Partial<typeof restaurants.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(restaurants).set(data).where(eq(restaurants.id, id));
}

export async function deleteRestaurant(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(restaurants).where(eq(restaurants.id, id));
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export async function getCategoriesByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(categories.sortOrder);
}

export async function createCategory(data: typeof categories.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(categories).values(data);
  const result = await db.select().from(categories).orderBy(desc(categories.id)).limit(1);
  return result[0];
}

export async function updateCategory(id: number, data: Partial<typeof categories.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(categories).set(data).where(eq(categories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(categories).where(eq(categories.id, id));
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export async function getProductsByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).where(eq(products.restaurantId, restaurantId)).orderBy(products.sortOrder);
}

export async function createProduct(data: typeof products.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(products).values(data);
  const result = await db.select().from(products).orderBy(desc(products.id)).limit(1);
  return result[0];
}

export async function updateProduct(id: number, data: Partial<typeof products.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(products).where(eq(products.id, id));
}

// ─── TABLES ───────────────────────────────────────────────────────────────────
export async function getTablesByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(restaurantTables).where(eq(restaurantTables.restaurantId, restaurantId));
}

export async function createTable(data: typeof restaurantTables.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(restaurantTables).values(data);
  const result = await db.select().from(restaurantTables).orderBy(desc(restaurantTables.id)).limit(1);
  return result[0];
}

export async function updateTable(id: number, data: Partial<typeof restaurantTables.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(restaurantTables).set(data).where(eq(restaurantTables.id, id));
}

export async function deleteTable(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(restaurantTables).where(eq(restaurantTables.id, id));
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
export async function getChatConversationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(chatConversations).where(eq(chatConversations.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getChatConversations(status?: string) {
  const db = await getDb();
  if (!db) return [];
  if (status) {
    return db.select().from(chatConversations)
      .where(eq(chatConversations.status, status as any))
      .orderBy(desc(chatConversations.lastMessageAt)).limit(50);
  }
  return db.select().from(chatConversations).orderBy(desc(chatConversations.lastMessageAt)).limit(50);
}

export async function getChatMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(chatMessages.createdAt);
}

export async function createChatConversation(data: typeof chatConversations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(chatConversations).values(data);
  const result = await db.select().from(chatConversations).orderBy(desc(chatConversations.id)).limit(1);
  return result[0];
}

export async function createChatMessage(data: typeof chatMessages.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(chatMessages).values(data);
  await db.update(chatConversations).set({ lastMessageAt: new Date() }).where(eq(chatConversations.id, data.conversationId));
  const result = await db.select().from(chatMessages).orderBy(desc(chatMessages.id)).limit(1);
  return result[0];
}

export async function updateConversationStatus(id: number, status: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(chatConversations).set({ status: status as any }).where(eq(chatConversations.id, id));
}

// ─── ADVERTISEMENTS ───────────────────────────────────────────────────────────
export async function getAllAdvertisements() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(advertisements).orderBy(desc(advertisements.createdAt));
}

export async function createAdvertisement(data: typeof advertisements.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(advertisements).values(data);
  const result = await db.select().from(advertisements).orderBy(desc(advertisements.id)).limit(1);
  return result[0];
}

export async function updateAdvertisement(id: number, data: Partial<typeof advertisements.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(advertisements).set(data).where(eq(advertisements.id, id));
}

export async function deleteAdvertisement(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(advertisements).where(eq(advertisements.id, id));
}

// ─── REVIEWS ──────────────────────────────────────────────────────────────────
export async function getAllReviews(type?: string, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (type) conditions.push(eq(reviews.type, type as any));
  if (status) conditions.push(eq(reviews.status, status as any));
  if (conditions.length > 0) {
    return db.select().from(reviews).where(and(...conditions)).orderBy(desc(reviews.createdAt)).limit(100);
  }
  return db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(100);
}

export async function updateReview(id: number, data: Partial<typeof reviews.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(reviews).set(data).where(eq(reviews.id, id));
}

// ─── CONTRACTS ────────────────────────────────────────────────────────────────
export async function getAllContracts(search?: string) {
  const db = await getDb();
  if (!db) return [];
  if (search) {
    return db.select().from(contracts).where(like(contracts.title, `%${search}%`)).orderBy(desc(contracts.createdAt)).limit(100);
  }
  return db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(100);
}

export async function createContract(data: typeof contracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(contracts).values(data);
  const result = await db.select().from(contracts).orderBy(desc(contracts.id)).limit(1);
  return result[0];
}

export async function updateContract(id: number, data: Partial<typeof contracts.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

export async function deleteContract(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(contracts).where(eq(contracts.id, id));
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────
export async function getAllInvoices(restaurantId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (restaurantId) {
    return db.select().from(invoices).where(eq(invoices.restaurantId, restaurantId)).orderBy(desc(invoices.createdAt));
  }
  return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(100);
}

export async function createInvoice(data: typeof invoices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(invoices).values(data);
  const result = await db.select().from(invoices).orderBy(desc(invoices.id)).limit(1);
  return result[0];
}

export async function updateInvoice(id: number, data: Partial<typeof invoices.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

// ─── MEDIA LIBRARY ────────────────────────────────────────────────────────────
export async function getAllMedia(category?: string, restaurantId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (category) conditions.push(eq(mediaLibrary.category, category as any));
  if (restaurantId) conditions.push(eq(mediaLibrary.restaurantId, restaurantId));
  if (conditions.length > 0) {
    return db.select().from(mediaLibrary).where(and(...conditions)).orderBy(desc(mediaLibrary.createdAt));
  }
  return db.select().from(mediaLibrary).orderBy(desc(mediaLibrary.createdAt)).limit(200);
}

export async function createMediaItem(data: typeof mediaLibrary.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(mediaLibrary).values(data);
  const result = await db.select().from(mediaLibrary).orderBy(desc(mediaLibrary.id)).limit(1);
  return result[0];
}

export async function getMediaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, id)).limit(1);
  return result[0] ?? null;
}

export async function deleteMediaItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id));
}

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;
  const [rCount, uCount, cCount, openChats, todayContracts] = await Promise.all([
    db.select({ count: count() }).from(restaurants),
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(contracts),
    db.select({ count: count() }).from(chatConversations).where(eq(chatConversations.status, "open")),
    db.select({ count: count() }).from(contracts).where(
      and(eq(contracts.status, "signed"), gt(contracts.signedAt, (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })()))
    ),
  ]);
  return {
    restaurants: rCount[0]?.count ?? 0,
    users: uCount[0]?.count ?? 0,
    contracts: cCount[0]?.count ?? 0,
    openChats: openChats[0]?.count ?? 0,
    contractsToday: todayContracts[0]?.count ?? 0,
  };
}

// ─── VERIFICATION CODES ──────────────────────────────────────────────────────
export async function createVerificationCode(email: string, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete any existing codes for this email
  await db.delete(verificationCodes).where(eq(verificationCodes.email, email.toLowerCase()));
  await db.insert(verificationCodes).values({ email: email.toLowerCase(), code, expiresAt });
}

export async function getVerificationCode(email: string, code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(verificationCodes)
    .where(and(
      eq(verificationCodes.email, email.toLowerCase()),
      eq(verificationCodes.code, code),
      gt(verificationCodes.expiresAt, new Date())
    ))
    .limit(1);
  return result[0];
}

export async function deleteVerificationCodes(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(verificationCodes).where(eq(verificationCodes.email, email.toLowerCase()));
}

export async function activateUser(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ status: "active" }).where(eq(users.email, email.toLowerCase()));
}

// ─── RESTAURANT MODULES ──────────────────────────────────────────────────────
export async function createRestaurantModules(data: InsertRestaurantModule[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return;
  await db.insert(restaurantModules).values(data);
}

export async function getRestaurantModules(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(restaurantModules)
    .where(eq(restaurantModules.restaurantId, restaurantId))
    .orderBy(restaurantModules.moduleId);
}

export async function getActiveRestaurantModules(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(restaurantModules)
    .where(and(
      eq(restaurantModules.restaurantId, restaurantId),
      eq(restaurantModules.status, "active")
    ))
    .orderBy(restaurantModules.moduleId);
}

// ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
export async function createSubscription(data: typeof subscriptions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(subscriptions).values(data);
  const result = await db.select().from(subscriptions).orderBy(desc(subscriptions.id)).limit(1);
  return result[0];
}

export async function getSubscriptionByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptions)
    .where(eq(subscriptions.restaurantId, restaurantId))
    .orderBy(desc(subscriptions.id))
    .limit(1);
  return result[0];
}

export async function getSubscriptionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return result[0];
}

export async function updateSubscription(id: number, data: Partial<typeof subscriptions.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

export async function getAllSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(200);
}

// Re-export getAccessPhase from dedicated module (allows proper mocking in tests)
export { getAccessPhase } from './accessPhase';

export async function getSubscriptionsDueSoon(daysAhead: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  return db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.status, "active"),
      lte(subscriptions.currentPeriodEnd, futureDate),
      gt(subscriptions.currentPeriodEnd, now)
    ));
}

export async function getExpiredSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.status, "active"),
      lte(subscriptions.currentPeriodEnd, now)
    ));
}

export async function getGracePeriodExpiredSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.status, "past_due"),
      lte(subscriptions.gracePeriodEnd, now)
    ));
}

/**
 * Returns trial subscriptions (status != active/blocked) where the trial
 * full-access phase ends within `daysAhead` days.
 * Trial full-access = 7 days from trialStartedAt.
 * Used for the 3-day-before-expiry reminder.
 */
export async function getTrialSubscriptionsExpiringSoon(daysAhead: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  // Full trial ends at trialStartedAt + 7 days.
  // We want subscriptions where that end date is between now and now+daysAhead.
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  // trialEndDate = trialStartedAt + 7 days
  // trialStartedAt BETWEEN (windowStart - 7d) AND (windowEnd - 7d)
  const trialDays = 7;
  const searchFrom = new Date(windowStart.getTime() - trialDays * 24 * 60 * 60 * 1000);
  const searchTo = new Date(windowEnd.getTime() - trialDays * 24 * 60 * 60 * 1000);
  return db.select().from(subscriptions)
    .where(and(
      // Not yet paid or blocked
      isNotNull(subscriptions.trialStartedAt),
      // trialStartedAt is in the window that means trial ends within daysAhead
      gte(subscriptions.trialStartedAt, searchFrom),
      lte(subscriptions.trialStartedAt, searchTo),
    ));
}

// ─── PAYMENTS ───────────────────────────────────────────────────────────────
export async function createPayment(data: typeof payments.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(payments).values(data);
  const result = await db.select().from(payments).orderBy(desc(payments.id)).limit(1);
  return result[0];
}

export async function getPaymentsByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments)
    .where(eq(payments.restaurantId, restaurantId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
}

export async function getAllPayments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(200);
}


// ─── HARDWARE PRODUCTS ──────────────────────────────────────────────────────

export async function getHardwareProducts(activeOnly = false) {
  const db = (await getDb())!;
  if (activeOnly) {
    return db.select().from(hardwareProducts).where(eq(hardwareProducts.isActive, true)).orderBy(hardwareProducts.sortOrder);
  }
  return db.select().from(hardwareProducts).orderBy(hardwareProducts.sortOrder);
}

export async function getHardwareProductById(id: number) {
  const db = (await getDb())!;
  const [product] = await db.select().from(hardwareProducts).where(eq(hardwareProducts.id, id));
  return product || null;
}

export async function createHardwareProduct(data: Omit<InsertHardwareProduct, "id" | "createdAt" | "updatedAt">) {
  const db = (await getDb())!;
  const [result] = await db.insert(hardwareProducts).values(data);
  return result.insertId;
}

export async function updateHardwareProduct(id: number, data: Partial<Omit<InsertHardwareProduct, "id" | "createdAt" | "updatedAt">>) {
  const db = (await getDb())!;
  await db.update(hardwareProducts).set(data).where(eq(hardwareProducts.id, id));
}

export async function deleteHardwareProduct(id: number) {
  const db = (await getDb())!;
  await db.delete(hardwareProducts).where(eq(hardwareProducts.id, id));
}


// ─── ACTIVATION TOKENS ──────────────────────────────────────────────────────
export async function createActivationToken(data: InsertActivationToken) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(activationTokens).values(data);
}

export async function getActivationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(activationTokens)
    .where(and(
      eq(activationTokens.token, token),
      gt(activationTokens.expiresAt, new Date())
    ))
    .limit(1);
  return result[0];
}

export async function markActivationTokenUsed(token: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(activationTokens).set({ usedAt: new Date() }).where(eq(activationTokens.token, token));
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0];
}

export async function getActivationTokenByContractId(contractId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(activationTokens)
    .where(eq(activationTokens.contractId, contractId))
    .orderBy(desc(activationTokens.createdAt))
    .limit(1);
  return result[0];
}

// ─── RESTAURANT ADMIN HELPERS ────────────────────────────────────────────────

export async function getUsersByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users)
    .where(eq(users.restaurantId, restaurantId))
    .orderBy(desc(users.createdAt));
}

export async function countUsersByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: count() }).from(users)
    .where(eq(users.restaurantId, restaurantId));
  return result[0]?.count ?? 0;
}

export async function updateRestaurantModule(id: number, data: Partial<InsertRestaurantModule>) {
  const db = await getDb();
  if (!db) return;
  await db.update(restaurantModules).set(data).where(eq(restaurantModules.id, id));
}

export async function startModuleTrial(restaurantId: number, moduleId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.insert(restaurantModules).values({
    restaurantId,
    moduleId,
    quantity: 1,
    status: "trial",
    trialStartedAt: now,
    trialEndsAt: trialEnd,
    activatedAt: now,
  });
}

export async function getRestaurantModuleByModuleId(restaurantId: number, moduleId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(restaurantModules)
    .where(and(
      eq(restaurantModules.restaurantId, restaurantId),
      eq(restaurantModules.moduleId, moduleId)
    ))
    .limit(1);
  return result[0];
}

export async function getContractByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts)
    .where(eq(contracts.restaurantId, restaurantId))
    .orderBy(desc(contracts.createdAt))
    .limit(1);
  return result[0];
}


// ─── ORDERS ────────────────────────────────────────────────────────────────
// Orders, inventory, aiInsightsCache imported above

export async function getOrdersByRestaurant(restaurantId: number, options?: { status?: string; today?: boolean; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(orders.restaurantId, restaurantId)];
  if (options?.status) conditions.push(eq(orders.status, options.status as any));
  if (options?.today) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    conditions.push(gt(orders.createdAt, todayStart));
  }
  return db.select().from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(options?.limit || 200);
}

export async function createOrder(data: typeof orders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(orders).values(data);
  return result.insertId;
}

export async function updateOrder(id: number, data: Partial<typeof orders.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(orders).set(data).where(eq(orders.id, id));
}

// ─── INVENTORY ─────────────────────────────────────────────────────────────
export async function getInventoryByRestaurant(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventory).where(eq(inventory.restaurantId, restaurantId)).orderBy(inventory.name);
}

export async function getCriticalInventory(restaurantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inventory)
    .where(and(
      eq(inventory.restaurantId, restaurantId),
      sql`${inventory.currentStock} <= ${inventory.minStock}`
    ))
    .orderBy(inventory.currentStock);
}

// ─── DASHBOARD AGGREGATIONS (Restaurant-scoped) ────────────────────────────
export async function getRestaurantDashboardStats(restaurantId: number) {
  const db = await getDb();
  if (!db) return null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    todayOrders,
    todayRevenue,
    openOrders,
    tableCount,
    occupiedTables,
    staffCount,
  ] = await Promise.all([
    db.select({ count: count() }).from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gt(orders.createdAt, todayStart))),
    db.select({ total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)` }).from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gt(orders.createdAt, todayStart), eq(orders.status, "paid"))),
    db.select({ count: count() }).from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), or(eq(orders.status, "pending"), eq(orders.status, "preparing")))),
    db.select({ count: count() }).from(restaurantTables)
      .where(and(eq(restaurantTables.restaurantId, restaurantId), eq(restaurantTables.isActive, true))),
    // Occupied = tables with active orders
    db.select({ count: sql<number>`COUNT(DISTINCT ${orders.tableId})` }).from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), or(eq(orders.status, "pending"), eq(orders.status, "preparing"), eq(orders.status, "ready"), eq(orders.status, "served")))),
    db.select({ count: count() }).from(users)
      .where(and(eq(users.restaurantId, restaurantId), eq(users.status, "active"))),
  ]);

  return {
    todayOrderCount: todayOrders[0]?.count ?? 0,
    todayRevenue: parseFloat(todayRevenue[0]?.total ?? "0"),
    openOrderCount: openOrders[0]?.count ?? 0,
    totalTables: tableCount[0]?.count ?? 0,
    occupiedTables: occupiedTables[0]?.count ?? 0,
    staffCount: staffCount[0]?.count ?? 0,
  };
}

export async function getRevenueByHour(restaurantId: number, date?: Date) {
  const db = await getDb();
  if (!db) return [];
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const result = await db.select({
    hour: sql<string>`HOUR(${orders.paidAt})`,
    revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
  }).from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gt(orders.paidAt, dayStart),
      lte(orders.paidAt, dayEnd)
    ))
    .groupBy(sql`HOUR(${orders.paidAt})`)
    .orderBy(sql`HOUR(${orders.paidAt})`);

  return result.map((r: any) => ({
    hour: `${String(r.hour).padStart(2, "0")}:00`,
    revenue: parseFloat(r.revenue),
  }));
}

export async function getRevenueSummary(restaurantId: number, date?: Date) {
  const db = await getDb();
  if (!db) return null;
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const result = await db.select({
    gross: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    net: sql<string>`COALESCE(SUM(${orders.subtotal}), 0)`,
    vat: sql<string>`COALESCE(SUM(${orders.taxAmount}), 0)`,
    tips: sql<string>`COALESCE(SUM(${orders.tipAmount}), 0)`,
    salesCount: count(),
  }).from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gt(orders.paidAt, dayStart),
      lte(orders.paidAt, dayEnd)
    ));

  const row = result[0];
  const gross = parseFloat(row?.gross ?? "0");
  const salesCount = row?.salesCount ?? 0;

  return {
    gross,
    net: parseFloat(row?.net ?? "0"),
    vat: parseFloat(row?.vat ?? "0"),
    tips: parseFloat(row?.tips ?? "0"),
    avgTicket: salesCount > 0 ? gross / salesCount : 0,
    salesCount,
  };
}

export async function getPaymentMethodBreakdown(restaurantId: number, date?: Date) {
  const db = await getDb();
  if (!db) return [];
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  return db.select({
    method: orders.paymentMethod,
    total: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
  }).from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gt(orders.paidAt, dayStart),
      lte(orders.paidAt, dayEnd)
    ))
    .groupBy(orders.paymentMethod);
}

export async function getStaffPerformance(restaurantId: number, date?: Date) {
  const db = await getDb();
  if (!db) return [];
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const result = await db.select({
    staffId: orders.staffId,
    revenue: sql<string>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    sales: count(),
    tips: sql<string>`COALESCE(SUM(${orders.tipAmount}), 0)`,
  }).from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      eq(orders.status, "paid"),
      gt(orders.paidAt, dayStart),
      lte(orders.paidAt, dayEnd)
    ))
    .groupBy(orders.staffId);

  return result;
}

export async function getTopProducts(restaurantId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return db.select({
    name: orderItems.name,
    sales: sql<number>`SUM(${orderItems.quantity})`,
    revenue: sql<string>`SUM(${orderItems.totalPrice})`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.restaurantId, restaurantId),
      gt(orders.createdAt, todayStart)
    ))
    .groupBy(orderItems.name)
    .orderBy(sql`SUM(${orderItems.totalPrice}) DESC`)
    .limit(limit);
}

// ─── TOP PRODUCTS WITH ID (für Favoriten-Kacheln) ─────────────────────────
export async function getTopProductsWithId(restaurantId: number, limit = 8, topCategoryId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  // Letzte 30 Tage für bessere Datengrundlage
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (topCategoryId) {
    // Filter by top category: join menuItems and menuCategories to get topCategoryId
    return db.select({
      productId: orderItems.productId,
      name: orderItems.name,
      unitPrice: orderItems.unitPrice,
      itemType: orderItems.itemType,
      sales: sql<number>`SUM(${orderItems.quantity})`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(menuItems, eq(orderItems.productId, menuItems.id))
      .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gt(orders.createdAt, thirtyDaysAgo),
        isNotNull(orderItems.productId),
        sql`${orderItems.status} != 'cancelled'`,
        eq(menuCategories.topCategoryId, topCategoryId),
      ))
      .groupBy(orderItems.productId, orderItems.name, orderItems.unitPrice, orderItems.itemType)
      .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
      .limit(limit);
  }
  return db.select({
    productId: orderItems.productId,
    name: orderItems.name,
    unitPrice: orderItems.unitPrice,
    itemType: orderItems.itemType,
    sales: sql<number>`SUM(${orderItems.quantity})`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.restaurantId, restaurantId),
      gt(orders.createdAt, thirtyDaysAgo),
      isNotNull(orderItems.productId),
      sql`${orderItems.status} != 'cancelled'`,
    ))
    .groupBy(orderItems.productId, orderItems.name, orderItems.unitPrice, orderItems.itemType)
    .orderBy(sql`SUM(${orderItems.quantity}) DESC`)
    .limit(limit);
}

// ─── AI INSIGHTS CACHE ─────────────────────────────────────────────────────
export async function getCachedAiInsights(restaurantId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiInsightsCache)
    .where(eq(aiInsightsCache.restaurantId, restaurantId))
    .orderBy(desc(aiInsightsCache.generatedAt))
    .limit(1);
  return result[0];
}

export async function saveCachedAiInsights(restaurantId: number, insights: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete old cache
  await db.delete(aiInsightsCache).where(eq(aiInsightsCache.restaurantId, restaurantId));
  await db.insert(aiInsightsCache).values({ restaurantId, insights });
}

// ─── RESERVIERUNGEN ──────────────────────────────────────────────────────────

export async function getReservationsByRestaurant(
  restaurantId: number,
  options?: {
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(reservations.restaurantId, restaurantId)];
  if (options?.status) conditions.push(eq(reservations.status, options.status as any));
  if (options?.dateFrom) conditions.push(gt(reservations.reservedAt, options.dateFrom));
  if (options?.dateTo) conditions.push(lte(reservations.reservedAt, options.dateTo));
  return db.select().from(reservations)
    .where(and(...conditions))
    .orderBy(reservations.reservedAt)
    .limit(options?.limit || 200);
}

export async function getReservationById(id: number, restaurantId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, restaurantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(reservations).values(data);
  return result.insertId as number;
}

export async function updateReservation(
  id: number,
  restaurantId: number,
  data: Partial<InsertReservation>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(reservations)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, restaurantId)));
}

export async function deleteReservation(id: number, restaurantId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, restaurantId)));
}

export async function getReservationStats(restaurantId: number, date?: Date) {
  const db = await getDb();
  if (!db) return { total: 0, confirmed: 0, pending: 0, today: 0 };
  const targetDate = date || new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const [total, confirmed, pending, todayRows] = await Promise.all([
    db.select({ c: count() }).from(reservations).where(eq(reservations.restaurantId, restaurantId)),
    db.select({ c: count() }).from(reservations).where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.status, "bestaetigt"))),
    db.select({ c: count() }).from(reservations).where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.status, "angefragt"))),
    db.select({ c: count() }).from(reservations).where(and(eq(reservations.restaurantId, restaurantId), gt(reservations.reservedAt, dayStart), lte(reservations.reservedAt, dayEnd))),
  ]);
  return {
    total: total[0]?.c ?? 0,
    confirmed: confirmed[0]?.c ?? 0,
    pending: pending[0]?.c ?? 0,
    today: todayRows[0]?.c ?? 0,
  };
}

// ─── GESCHENKKARTEN-STATISTIKEN (steuergerecht) ────────────────────────────
/**
 * Steuerliche Behandlung von Geschenkkarten (CH-MWST-konform):
 * - Verkauf einer Geschenkkarte = Vorauszahlung → KEINE Umsatzrealisierung
 * - Einlösung einer Geschenkkarte = Leistungserbringung → Umsatz realisiert
 * - Verfall einer Geschenkkarte = ausserordentlicher Ertrag (kein MWST-Umsatz)
 */
export async function getGiftCardStats(restaurantId: number) {
  const db = await getDb();
  if (!db) return {
    totalSold: 0,           // Anzahl verkaufter Geschenkkarten
    totalSoldValue: 0,      // Gesamtwert aller verkauften Karten (Verbindlichkeit)
    totalRedeemed: 0,       // Bereits eingelöster Betrag (realisierter Umsatz)
    openLiability: 0,       // Noch offenes Guthaben (Verbindlichkeit gegenüber Kunden)
    activeCards: 0,         // Aktive Karten mit Restguthaben
    expiredValue: 0,        // Verfallener Wert (ausserordentlicher Ertrag)
    todaySoldValue: 0,      // Heute verkauft (Einnahmen, noch kein Umsatz)
    todayRedeemedValue: 0,  // Heute eingelöst (realisierter Umsatz heute)
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const now = new Date();

  const [soldStats, redemptionStats, activeCards, todaySold, todayRedeemed, expiredCards] = await Promise.all([
    // Alle verkauften Geschenkkarten (Gesamtwert = Verbindlichkeit beim Verkauf)
    db.select({
      count: count(),
      totalValue: sql<string>`COALESCE(SUM(${giftCardPurchases.purchaseAmount}), 0)`,
    }).from(giftCardPurchases).where(eq(giftCardPurchases.restaurantId, restaurantId)),

    // Eingelöste Beträge aus voucher_redemptions (realisierter Umsatz)
    db.select({
      totalRedeemed: sql<string>`COALESCE(SUM(${voucherRedemptions.amountDeducted}), 0)`,
    }).from(voucherRedemptions)
      .innerJoin(vouchers, eq(voucherRedemptions.voucherId, vouchers.id))
      .where(and(
        eq(vouchers.restaurantId, restaurantId),
        eq(vouchers.category, "gift_card"),
      )),

    // Aktive Karten mit verbleibendem Guthaben (offene Verbindlichkeit)
    db.select({
      count: count(),
      openBalance: sql<string>`COALESCE(SUM(${vouchers.remainingBalance}), 0)`,
    }).from(vouchers).where(and(
      eq(vouchers.restaurantId, restaurantId),
      eq(vouchers.category, "gift_card"),
      eq(vouchers.status, "active"),
    )),

    // Heute verkauft (Einnahmen heute, noch kein Umsatz)
    db.select({
      todayValue: sql<string>`COALESCE(SUM(${giftCardPurchases.purchaseAmount}), 0)`,
    }).from(giftCardPurchases).where(and(
      eq(giftCardPurchases.restaurantId, restaurantId),
      gt(giftCardPurchases.purchasedAt, todayStart),
    )),

    // Heute eingelöst (realisierter Umsatz heute)
    db.select({
      todayRedeemed: sql<string>`COALESCE(SUM(${voucherRedemptions.amountDeducted}), 0)`,
    }).from(voucherRedemptions)
      .innerJoin(vouchers, eq(voucherRedemptions.voucherId, vouchers.id))
      .where(and(
        eq(vouchers.restaurantId, restaurantId),
        eq(vouchers.category, "gift_card"),
        gt(voucherRedemptions.redeemedAt, todayStart),
      )),

    // Verfallene Karten (ausserordentlicher Ertrag, kein MWST-Umsatz)
    db.select({
      expiredValue: sql<string>`COALESCE(SUM(${vouchers.remainingBalance}), 0)`,
    }).from(vouchers).where(and(
      eq(vouchers.restaurantId, restaurantId),
      eq(vouchers.category, "gift_card"),
      eq(vouchers.status, "active"),
      lte(vouchers.validUntil, now),
    )),
  ]);

    const totalSoldValue = parseFloat(soldStats[0]?.totalValue ?? "0");
  const totalRedeemed = parseFloat(redemptionStats[0]?.totalRedeemed ?? "0");
  const openBalance = parseFloat(activeCards[0]?.openBalance ?? "0");
  return {
    totalSold: soldStats[0]?.count ?? 0,
    totalSoldValue,
    totalRedeemed,
    openLiability: openBalance,           // Verbindlichkeit = noch nicht eingelöst
    activeCards: activeCards[0]?.count ?? 0,
    expiredValue: parseFloat(expiredCards[0]?.expiredValue ?? "0"),
    todaySoldValue: parseFloat(todaySold[0]?.todayValue ?? "0"),
    todayRedeemedValue: parseFloat(todayRedeemed[0]?.todayRedeemed ?? "0"),
  };
}

// ─── TRIAL REMINDER SENT MARKER ─────────────────────────────────────────────────────────────────────────────
export async function markTrialReminderSent(subscriptionId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(subscriptions)
    .set({ trialReminderSentAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));
}

// ─── ACTIVE SESSIONS (Single-Session-Enforcement) ────────────────────────────
export async function upsertActiveSession(data: InsertActiveSession): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // INSERT OR REPLACE: überschreibt alte Session wenn userId bereits existiert
  await db
    .insert(activeSessions)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        deviceId: data.deviceId,
        sessionToken: data.sessionToken,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
        lastSeen: new Date(),
      },
    });
}

export async function getActiveSession(userId: number): Promise<ActiveSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(activeSessions)
    .where(eq(activeSessions.userId, userId))
    .limit(1);
  return rows[0];
}

export async function deleteActiveSession(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(activeSessions).where(eq(activeSessions.userId, userId));
}
