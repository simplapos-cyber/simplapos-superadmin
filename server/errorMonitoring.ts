/**
 * Fehler-Monitoring für kritische Server-Fehler
 * Sendet automatisch Owner-Notifications bei kritischen Fehlern.
 * Verwendet Rate-Limiting um Notification-Spam zu verhindern.
 */

import { notifyOwner } from "./_core/notification";

// Rate-Limiting: max 1 Notification pro Fehlertyp pro 10 Minuten
const notificationCooldown = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 Minuten

// Fehler-Zähler für Aggregation
const errorCounts = new Map<string, number>();

/**
 * Sendet eine Owner-Notification bei kritischem Fehler.
 * Verhindert Spam durch Cooldown pro Fehlertyp.
 */
export async function reportCriticalError(
  errorType: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const now = Date.now();
  const lastNotified = notificationCooldown.get(errorType) ?? 0;

  // Fehler zählen
  errorCounts.set(errorType, (errorCounts.get(errorType) ?? 0) + 1);
  const count = errorCounts.get(errorType)!;

  // Cooldown prüfen
  if (now - lastNotified < COOLDOWN_MS) {
    console.warn(`[ErrorMonitoring] Cooldown aktiv für "${errorType}" (${count}x aufgetreten)`);
    return;
  }

  notificationCooldown.set(errorType, now);

  const contextStr = context
    ? Object.entries(context)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n')
    : '';

  const title = `🚨 Kritischer Fehler: ${errorType}`;
  const content = [
    `**Fehler:** ${message}`,
    `**Aufgetreten:** ${count}x`,
    `**Zeit:** ${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}`,
    contextStr ? `\n**Kontext:**\n${contextStr}` : '',
    `\n**Server:** ${process.env.NODE_ENV ?? 'unknown'}`,
  ].filter(Boolean).join('\n');

  try {
    await notifyOwner({ title, content });
    console.log(`[ErrorMonitoring] Owner-Notification gesendet für: ${errorType}`);
  } catch (err) {
    console.error('[ErrorMonitoring] Fehler beim Senden der Notification:', err);
  }
}

/**
 * Initialisiert das globale Error-Monitoring.
 * Fängt unbehandelte Fehler ab und sendet Owner-Notifications.
 */
export function initErrorMonitoring(): void {
  // Unbehandelte Exceptions
  process.on('uncaughtException', async (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
    await reportCriticalError('UncaughtException', err.message, {
      stack: err.stack?.split('\n').slice(0, 5).join(' | '),
    });
  });

  // Unbehandelte Promise Rejections
  process.on('unhandledRejection', async (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('[ERROR] Unhandled Promise Rejection:', reason);
    await reportCriticalError('UnhandledRejection', message, {
      reason: String(reason),
    });
  });

  console.log('[ErrorMonitoring] Initialisiert');
}

/**
 * Middleware für Express: fängt kritische HTTP-Fehler ab
 */
export function createErrorMonitoringMiddleware() {
  return async (
    err: Error & { status?: number; statusCode?: number },
    _req: { method: string; path: string },
    res: { status: (code: number) => { json: (data: unknown) => void }; headersSent: boolean },
    next: (err?: unknown) => void
  ) => {
    const statusCode = err.status ?? err.statusCode ?? 500;

    // Nur 5xx Fehler melden (Server-Fehler, nicht Client-Fehler)
    if (statusCode >= 500) {
      await reportCriticalError('ServerError', err.message, {
        statusCode,
        path: _req.path,
        method: _req.method,
      });
    }

    if (!res.headersSent) {
      res.status(statusCode).json({
        error: statusCode >= 500 ? 'Interner Serverfehler' : err.message,
      });
    }

    next(err);
  };
}
