import { describe, it, expect } from "vitest";

/**
 * Validates that the ANTHROPIC_API_KEY environment variable is set and
 * that the Anthropic API responds with a valid completion.
 *
 * This test calls the real Anthropic API – it is intentionally lightweight
 * (max_tokens: 10) to minimise cost and latency.
 */
describe("Anthropic API key validation", () => {
  it("should have ANTHROPIC_API_KEY set", () => {
    const key = process.env.ANTHROPIC_API_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
    expect(key.startsWith("sk-ant-")).toBe(true);
  });

  it("should successfully call Anthropic API with a minimal prompt", async () => {
    const key = process.env.ANTHROPIC_API_KEY ?? "";
    if (!key) {
      console.warn("ANTHROPIC_API_KEY not set – skipping live API test");
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say: OK" }],
      }),
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    expect(data.content).toBeDefined();
    expect(data.content.length).toBeGreaterThan(0);
    expect(data.content[0].type).toBe("text");
    console.log("[Anthropic test] Response:", data.content[0].text);
  }, 30_000);
});
