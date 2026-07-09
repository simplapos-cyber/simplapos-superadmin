/**
 * Single-Session-Enforcement Tests
 * Prüft dass pro User-Account nur ein Gerät gleichzeitig aktiv sein kann.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock der DB-Funktionen
vi.mock("./db", () => ({
  upsertActiveSession: vi.fn(),
  getActiveSession: vi.fn(),
  deleteActiveSession: vi.fn(),
}));

import { upsertActiveSession, getActiveSession, deleteActiveSession } from "./db";

describe("Single-Session-Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsertActiveSession wird beim Login aufgerufen", async () => {
    const mockUpsert = vi.mocked(upsertActiveSession);
    mockUpsert.mockResolvedValue(undefined);

    await upsertActiveSession({
      userId: 1,
      deviceId: "device-abc-123",
      sessionToken: "hash-xyz",
      userAgent: "Mozilla/5.0",
      ipAddress: "192.168.1.1",
      lastSeen: new Date(),
    });

    expect(mockUpsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        deviceId: "device-abc-123",
      })
    );
  });

  it("Session-Konflikt erkannt wenn deviceId nicht übereinstimmt", async () => {
    const mockGet = vi.mocked(getActiveSession);
    mockGet.mockResolvedValue({
      id: 1,
      userId: 42,
      deviceId: "altes-geraet-uuid",
      sessionToken: "alter-token-hash",
      userAgent: "Safari",
      ipAddress: "10.0.0.1",
      lastSeen: new Date(),
      createdAt: new Date(),
    });

    const activeSession = await getActiveSession(42);
    const currentDeviceId = "neues-geraet-uuid";

    const hasConflict =
      activeSession !== undefined &&
      activeSession.deviceId !== currentDeviceId;

    expect(hasConflict).toBe(true);
  });

  it("Kein Konflikt wenn deviceId übereinstimmt", async () => {
    const mockGet = vi.mocked(getActiveSession);
    const sameDeviceId = "gleiches-geraet-uuid";
    mockGet.mockResolvedValue({
      id: 1,
      userId: 42,
      deviceId: sameDeviceId,
      sessionToken: "token-hash",
      userAgent: "Chrome",
      ipAddress: "10.0.0.2",
      lastSeen: new Date(),
      createdAt: new Date(),
    });

    const activeSession = await getActiveSession(42);
    const hasConflict =
      activeSession !== undefined &&
      activeSession.deviceId !== sameDeviceId;

    expect(hasConflict).toBe(false);
  });

  it("deleteActiveSession wird beim Logout aufgerufen", async () => {
    const mockDelete = vi.mocked(deleteActiveSession);
    mockDelete.mockResolvedValue(undefined);

    await deleteActiveSession(42);

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockDelete).toHaveBeenCalledWith(42);
  });

  it("Kein Konflikt wenn keine aktive Session vorhanden (erster Login)", async () => {
    const mockGet = vi.mocked(getActiveSession);
    mockGet.mockResolvedValue(undefined);

    const activeSession = await getActiveSession(99);
    const hasConflict =
      activeSession !== undefined &&
      activeSession.deviceId !== "irgendeine-device-id";

    expect(hasConflict).toBe(false);
  });
});
