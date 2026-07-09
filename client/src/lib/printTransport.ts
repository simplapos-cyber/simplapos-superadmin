/**
 * printTransport.ts
 *
 * Transport-Abstraktion für den Druck in SimplaPOS.
 *
 * ─── ARCHITEKTUR ─────────────────────────────────────────────────────────────
 *
 * Der Server generiert ePOS-XML und gibt es zurück.
 * Dieser Transport sendet das XML an den Drucker.
 *
 * Heute: "direct" – Browser sendet ePOS-XML direkt an Drucker-IP (ePOS HTTP)
 * Später: "local_connect" – Browser → Local Connect App → Drucker
 *
 * Alle Screens rufen NUR usePrint() auf – nie direkt epsonPrinter oder
 * useLocalConnect. Dadurch kann der Transport gewechselt werden, ohne einen
 * einzigen Screen anzufassen.
 *
 * ─── ERWEITERUNG FÜR OFFLINE ─────────────────────────────────────────────────
 *
 * Um Local Connect / Offline hinzuzufügen:
 *   1. sendViaLocalConnect() implementieren (HTTP POST an Local Connect App)
 *   2. In _tryTransports() als erste Option eintragen
 *   3. Fertig – alle Screens profitieren automatisch
 *
 * Kein Screen-Code muss geändert werden.
 */

// ─── Typen ────────────────────────────────────────────────────────────────────

export type PrintTransportType = "direct" | "local_connect";

export interface PrintResult {
  success: boolean;
  transport: PrintTransportType;
  error?: string;
  durationMs?: number;
}

export interface PrintTask {
  printerIp: string;
  xml: string;
  openCashDrawer?: boolean;
}

// ─── Konfiguration (Singleton) ────────────────────────────────────────────────

interface TransportConfig {
  /**
   * Welche Transporte in welcher Reihenfolge versucht werden.
   * Default: ["direct"]
   * Sobald Local Connect aktiv: ["local_connect", "direct"]
   */
  order: PrintTransportType[];

  /**
   * Local Connect Gerät – wird gesetzt sobald eines im LAN gefunden wird.
   * Wenn null, wird "local_connect" übersprungen.
   */
  localConnect: {
    ip: string;
    port: number;
    deviceToken: string;
  } | null;
}

let _config: TransportConfig = {
  order: ["direct"],
  localConnect: null,
};

/**
 * Transport-Konfiguration aktualisieren.
 * Wird von useLocalConnect aufgerufen sobald ein Gerät entdeckt wird.
 *
 * Beispiel (wenn Local Connect aktiv):
 *   configurePrintTransport({
 *     order: ["local_connect", "direct"],
 *     localConnect: { ip: "192.168.1.50", port: 8765, deviceToken: "..." }
 *   });
 */
export function configurePrintTransport(update: Partial<TransportConfig>): void {
  _config = { ..._config, ...update };
}

export function getPrintTransportConfig(): TransportConfig {
  return { ..._config };
}

// ─── ePOS-XML Sender (Direct Transport) ──────────────────────────────────────

const EPOS_TIMEOUT_MS = 10_000;

/**
 * Sendet ePOS-XML direkt an einen Drucker via HTTP.
 * Gleiche Methode wie qrorpa.ch / Epson ePOS SDK.
 */
async function sendEposXml(printerIp: string, xml: string): Promise<void> {
  const url = `http://${printerIp}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">`
    + `<s:Body>${xml}</s:Body></s:Envelope>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EPOS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '""',
      },
      body,
      signal: controller.signal,
      mode: "cors",
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Drucker antwortete mit ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Drucker ${printerIp} antwortet nicht (Timeout ${EPOS_TIMEOUT_MS / 1000}s)`);
    }
    throw err;
  }
}

// ─── Transport-Implementierungen ──────────────────────────────────────────────

async function sendViaDirect(task: PrintTask): Promise<PrintResult> {
  const t0 = Date.now();
  try {
    await sendEposXml(task.printerIp, task.xml);
    return { success: true, transport: "direct", durationMs: Date.now() - t0 };
  } catch (err) {
    return {
      success: false,
      transport: "direct",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * Local Connect Transport – PLATZHALTER.
 * Wird aktiviert sobald Local Connect stabil online läuft.
 * Gibt immer false zurück → Fallback auf "direct".
 */
async function sendViaLocalConnect(_task: PrintTask): Promise<PrintResult> {
  // TODO: HTTP POST an http://{localConnect.ip}:{localConnect.port}/print
  // Implementierung folgt in der Offline-Phase
  return {
    success: false,
    transport: "local_connect",
    error: "Local Connect Transport noch nicht aktiviert",
  };
}

// ─── Haupt-Druckfunktion ──────────────────────────────────────────────────────

/**
 * Führt einen Druckauftrag aus.
 * Versucht die konfigurierten Transporte der Reihe nach.
 * Gibt das Ergebnis des ersten erfolgreichen Transports zurück.
 */
export async function executePrintTask(task: PrintTask): Promise<PrintResult> {
  const errors: string[] = [];

  for (const transport of _config.order) {
    let result: PrintResult;

    if (transport === "direct") {
      result = await sendViaDirect(task);
    } else if (transport === "local_connect") {
      if (!_config.localConnect) continue; // Kein Gerät konfiguriert
      result = await sendViaLocalConnect(task);
    } else {
      continue;
    }

    if (result.success) return result;
    errors.push(`[${transport}] ${result.error ?? "Fehler"}`);
  }

  return {
    success: false,
    transport: _config.order[0] ?? "direct",
    error: errors.join(" | ") || "Alle Transporte fehlgeschlagen",
  };
}

/**
 * Führt mehrere Druckaufträge parallel aus (z.B. Küche + Bar gleichzeitig).
 * Gibt zurück wie viele erfolgreich waren.
 */
export async function executePrintTasks(
  tasks: PrintTask[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const results = await Promise.allSettled(tasks.map(executePrintTask));

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) {
      success++;
    } else {
      failed++;
      if (r.status === "fulfilled") {
        errors.push(r.value.error ?? "Unbekannter Fehler");
      } else {
        errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
  }

  return { success, failed, errors };
}
