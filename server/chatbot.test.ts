import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock LLM ────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// ─── Mock DB ─────────────────────────────────────────────────────────────────
vi.mock("./db", () => {
  const insertChain = { values: vi.fn().mockResolvedValue([{ insertId: 1 }]) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  };
  return {
    getDb: vi.fn().mockResolvedValue(selectChain),
  };
});

import { chatbotRouter } from "./chatbotRouter";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";

const llmMock = vi.mocked(invokeLLM);
const getDbMock = vi.mocked(getDb);

// ─── Helper: create caller ────────────────────────────────────────────────────
function makeCaller(restaurantId: number | null = 1) {
  return chatbotRouter.createCaller({
    user: {
      id: 1,
      email: "admin@test.com",
      name: "Test Admin",
      role: "admin" as const,
      restaurantId,
      openId: "test-open-id",
      passwordHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      avatarUrl: null,
    },
    req: {} as any,
    res: {} as any,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("chatbotRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup LLM mock after clearAllMocks
    llmMock.mockResolvedValue({
      id: "test-id",
      created: Date.now(),
      model: "claude-haiku-4-5-20251001",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Der heutige Umsatz beträgt CHF 250.00." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    } as any);
    // Re-setup DB mock after clearAllMocks
    const insertChain = { values: vi.fn().mockResolvedValue([{ insertId: 1 }]) };
    const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    const dbObj = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
    };
    getDbMock.mockResolvedValue(dbObj as any);
  });

  describe("getSuggestions", () => {
    it("returns admin suggestions for admin role", async () => {
      const caller = makeCaller();
      const result = await caller.getSuggestions({ role: "admin" });
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes("Umsatz") || s.includes("Tisch") || s.includes("Bestellung"))).toBe(true);
    });

    it("returns waiter suggestions for waiter role", async () => {
      const caller = makeCaller();
      const result = await caller.getSuggestions({ role: "waiter" });
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes("frei") || s.includes("vegetarisch") || s.includes("Gluten"))).toBe(true);
    });

    it("admin and waiter suggestions are different", async () => {
      const caller = makeCaller();
      const adminResult = await caller.getSuggestions({ role: "admin" });
      const waiterResult = await caller.getSuggestions({ role: "waiter" });
      expect(adminResult.suggestions).not.toEqual(waiterResult.suggestions);
    });
  });

  describe("chat", () => {
    it("responds even without restaurant (superadmin mode)", async () => {
      const caller = makeCaller(null);
      const result = await caller.chat({ message: "Hallo", history: [], role: "admin" });
      expect(result).toHaveProperty("message");
    });

    it("calls invokeLLM with correct model", async () => {
      const caller = makeCaller(1);
      await caller.chat({
        message: "Was ist der Umsatz heute?",
        history: [],
        role: "admin",
      });
      expect(llmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
        })
      );
    });

    it("returns assistant message from LLM response", async () => {
      const caller = makeCaller(1);
      const result = await caller.chat({
        message: "Was ist der Umsatz heute?",
        history: [],
        role: "admin",
      });
      expect(result.message).toBe("Der heutige Umsatz beträgt CHF 250.00.");
    });

    it("includes chat history in LLM messages", async () => {
      const caller = makeCaller(1);
      const history = [
        { role: "user" as const, content: "Hallo" },
        { role: "assistant" as const, content: "Hallo! Wie kann ich helfen?" },
      ];
      await caller.chat({
        message: "Was kostet das Schnitzel?",
        history,
        role: "admin",
      });

      const callArgs = llmMock.mock.calls[0][0];
      const messages = callArgs.messages;
      expect(messages.length).toBe(4);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe("Hallo");
      expect(messages[3].content).toBe("Was kostet das Schnitzel?");
    });

    it("includes restaurant context in system prompt", async () => {
      const caller = makeCaller(1);
      await caller.chat({ message: "Test", history: [], role: "admin" });

      const callArgs = llmMock.mock.calls[0][0];
      const systemMessage = callArgs.messages[0];
      expect(systemMessage.role).toBe("system");
      expect(systemMessage.content).toContain("SimplaPos");
    });

    it("uses waiter role description for waiter", async () => {
      const caller = makeCaller(1);
      await caller.chat({ message: "Welche Tische sind frei?", history: [], role: "waiter" });

      const callArgs = llmMock.mock.calls[0][0];
      const systemMessage = callArgs.messages[0];
      expect(systemMessage.content).toContain("Kellner");
    });

    it("limits history to last 10 messages", async () => {
      const caller = makeCaller(1);
      const longHistory = Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      }));
      await caller.chat({ message: "Neue Frage", history: longHistory, role: "admin" });

      const callArgs = llmMock.mock.calls[0][0];
      expect(callArgs.messages.length).toBeLessThanOrEqual(12);
      const historyMessages = callArgs.messages.slice(1, -1);
      expect(historyMessages.length).toBeLessThanOrEqual(10);
    });

    it("validates message length (max 2000 chars)", async () => {
      const caller = makeCaller(1);
      const longMessage = "x".repeat(2001);
      await expect(
        caller.chat({ message: longMessage, history: [], role: "admin" })
      ).rejects.toThrow();
    });

    it("validates empty message", async () => {
      const caller = makeCaller(1);
      await expect(
        caller.chat({ message: "", history: [], role: "admin" })
      ).rejects.toThrow();
    });
  });
});
