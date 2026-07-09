/**
 * vitest-setup.ts
 * Globale Test-Setup-Datei: Mockt alle externen Dienste die echte Netzwerkaufrufe
 * machen würden (E-Mails, Push-Benachrichtigungen, etc.).
 * 
 * WICHTIG: Diese Datei verhindert, dass Tests echte E-Mails oder Push-Notifications
 * an den Projektbesitzer senden.
 */

import { vi } from "vitest";

// ─── notifyOwner global mocken ────────────────────────────────────────────────
// Verhindert, dass Tests echte E-Mails über die Manus-Notification-API senden.
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// ─── web-push global mocken ───────────────────────────────────────────────────
// Verhindert echte Web-Push-Benachrichtigungen in Tests.
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
}));

// ─── contractEmail global mocken ─────────────────────────────────────────────
// Verhindert echte E-Mail-Versendungen in Tests.
vi.mock("./contractEmail", () => ({
  sendContractConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendContractActivationEmail: vi.fn().mockResolvedValue(true),
  sendContractRejectionEmail: vi.fn().mockResolvedValue(true),
}));
