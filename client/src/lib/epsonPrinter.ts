/**
 * Epson ePOS SDK Drucker-Integration
 * Verwendet das offizielle Epson ePOS SDK (epos-2.27.0.js)
 *
 * HTTPS-Verbindung: Da die App über HTTPS läuft, muss auch der Drucker über HTTPS
 * angesprochen werden (Mixed Content Schutz des Browsers).
 * Der Epson TM-m30II hat einen eingebauten HTTPS-Server auf Port 8043.
 * Einmalig muss das selbst-signierte Zertifikat im Browser akzeptiert werden.
 *
 * Verbindungsreihenfolge:
 *   1. https://ip:8043/cgi-bin/epos/service.cgi (Epson SSL-Port)
 *   2. https://ip/cgi-bin/epos/service.cgi (Port 443 Fallback)
 *   3. http://ip:8008/cgi-bin/epos/service.cgi (nur wenn Seite auch HTTP ist)
 */

// Epson SDK Typen (global über index.html geladen)
declare global {
  interface Window {
    epson?: {
      ePOSPrint: new (address: string) => EposPrint;
      ePOSBuilder: new () => EposBuilder;
    };
  }
}

interface EposPrint {
  onreceive: ((res: { success: boolean; code: string; status: number }) => void) | null;
  onerror: ((err: unknown) => void) | null;
  send: (data: string) => void;
}

interface EposBuilder {
  ALIGN_CENTER: string;
  ALIGN_LEFT: string;
  ALIGN_RIGHT: string;
  COLOR_1: string;
  CUT_FEED: string;
  toString: () => string;
  addTextAlign: (align: string) => EposBuilder;
  addTextSize: (width: number, height: number) => EposBuilder;
  addTextStyle: (reverse: boolean, ul: boolean, em: boolean, color: string) => EposBuilder;
  addText: (text: string) => EposBuilder;
  addFeedLine: (lines: number) => EposBuilder;
  addCut: (type: string) => EposBuilder;
}

export interface PrinterConfig {
  ip: string;
  port?: number;
  deviceId?: string;
  timeout?: number;
  useSSL?: boolean;
}

export interface ReceiptLine {
  quantity: number;
  name: string;
  unitPrice: number;
  variant?: string | null;
  notes?: string | null;
}

export interface ReceiptData {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  restaurantVat?: string;
  tableLabel: string;
  orderNumber: string;
  items: ReceiptLine[];
  subtotal: number;
  discount?: number;
  tip?: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  footerLine1?: string;
  footerLine2?: string;
  wifiName?: string;
  wifiPassword?: string;
  slogan?: string;
}

export interface KitchenData {
  tableLabel: string;
  waiterName: string;
  orderNumber: string;
  bonType: string;
  items: Array<{
    quantity: number;
    name: string;
    variant?: string | null;
    notes?: string | null;
    course?: number | null;
  }>;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `CHF ${n.toFixed(2)}`;
}

function twoCol(left: string, right: string, width = 48): string {
  const maxLeft = width - right.length - 1;
  const l = left.length > maxLeft ? left.substring(0, maxLeft - 1) + '…' : left;
  return l.padEnd(width - right.length) + right;
}

const SEP48 = '─'.repeat(48);

// ─── iOS Safari Detection ────────────────────────────────────────────────────

/**
 * Erkennt ob der Browser iOS Safari ist.
 * iOS Safari blockiert Mixed Content (HTTPS → HTTP) ohne Bestätigungsfrage.
 * In diesem Fall muss HTTPS Port 8043 verwendet werden.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // iOS: iPhone, iPad, iPod
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Safari: enthält "Safari" aber nicht "Chrome" oder "CriOS" (Chrome on iOS)
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  return isIos && isSafari;
}

// ─── ePOS Adresse ─────────────────────────────────────────────────────────────

/**
 * Gibt die ePOS-Adresse zurück.
 * - iOS Safari: HTTPS Port 8043 (Epson SSL-Port)
 *   → Einmalig https://[IP]:8043 in Safari öffnen und Zertifikat akzeptieren
 * - Alle anderen Browser: HTTP Port 80 (wie qrorpa.ch)
 *   → Browser zeigt einmalig Mixed-Content-Bestätigung
 */
function getEposAddress(ip: string): string {
  if (isIosSafari()) {
    // iOS Safari blockiert Mixed Content strikt – HTTPS Port 8043 verwenden
    return `https://${ip}:8043/cgi-bin/epos/service.cgi?devid=local_printer&timeout=60000`;
  }
  // Desktop-Browser: HTTP Port 80 (wie qrorpa.ch)
  return `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=60000`;
}

// ─── SDK-basierter Druck ─────────────────────────────────────────────────────

function sendWithSdk(ip: string, builderXml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sdk = window.epson;
    if (!sdk) {
      reject(new Error('Epson ePOS SDK nicht geladen. Bitte Seite neu laden.'));
      return;
    }

    const address = getEposAddress(ip);
    const epos = new sdk.ePOSPrint(address);

    const timeout = setTimeout(() => {
      const iosHint = isIosSafari()
        ? ` Für iPhone: Einmalig https://${ip}:8043 in Safari öffnen und Zertifikat akzeptieren.`
        : ' Bitte Zertifikat prüfen.';
      reject(new Error(`Drucker-Timeout: Keine Antwort nach 15 Sekunden.${iosHint}`));
    }, 15000);

    epos.onreceive = (res) => {
      clearTimeout(timeout);
      if (res.success) {
        resolve();
      } else {
        reject(new Error(`Druckfehler Code: ${res.code}`));
      }
    };

    epos.onerror = (_err) => {
      clearTimeout(timeout);
      const iosHint = isIosSafari()
        ? ` Für iPhone: Einmalig https://${ip}:8043 in Safari öffnen und Zertifikat akzeptieren.`
        : '';
      reject(new Error(
        `Verbindungsfehler zum Drucker (${ip}). ` +
        `Bitte sicherstellen dass der Drucker eingeschaltet und im selben Netzwerk ist.` +
        iosHint
      ));
    };

    epos.send(builderXml);
  });
}

// ─── Direktes XML senden (für Server-generiertes XML) ────────────────────────

/**
 * Sendet ein fertig gebautes ePOS-XML direkt an den Drucker.
 * Das XML muss mit <epos-print xmlns="..."> beginnen.
 * Wird verwendet wenn der Server das XML aufbaut (z.B. für Gastbon, Küchenbon).
 */
export async function sendXmlToEpson(ip: string, xml: string): Promise<void> {
  await sendWithSdk(ip, xml);
}

// ─── Bon-Druck ───────────────────────────────────────────────────────────────

export async function printToEpson(
  config: PrinterConfig,
  data: ReceiptData,
  _openCashDrawer = false
): Promise<void> {
  const sdk = window.epson;
  if (!sdk) throw new Error('Epson ePOS SDK nicht geladen. Bitte Seite neu laden.');

  const builder = new sdk.ePOSBuilder();
  const W = 48;

  // HEADER
  builder.addTextAlign(builder.ALIGN_CENTER);
  builder.addTextSize(2, 2);
  builder.addTextStyle(false, false, true, builder.COLOR_1);
  builder.addText(data.restaurantName + '\n');
  builder.addTextStyle(false, false, false, builder.COLOR_1);
  builder.addTextSize(1, 1);

  if (data.restaurantAddress) builder.addText(data.restaurantAddress + '\n');
  if (data.restaurantPhone) builder.addText(data.restaurantPhone + '\n');
  if (data.restaurantVat) builder.addText(`MwSt-Nr: ${data.restaurantVat}\n`);

  builder.addText(SEP48 + '\n');

  // BESTELLINFO
  builder.addTextAlign(builder.ALIGN_LEFT);
  builder.addText(`Tisch:   ${data.tableLabel}\n`);
  builder.addText(`Bon-Nr.: ${data.orderNumber}\n`);
  builder.addText(`Datum:   ${new Date().toLocaleDateString('de-CH')} ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}\n`);
  builder.addText(SEP48 + '\n');

  // ARTIKEL
  builder.addTextStyle(false, false, true, builder.COLOR_1);
  builder.addText(twoCol('Produkt', 'Preis', W) + '\n');
  builder.addTextStyle(false, false, false, builder.COLOR_1);
  builder.addText(SEP48 + '\n');

  for (const item of data.items) {
    const priceStr = fmt(item.quantity * item.unitPrice);
    const label = `${item.quantity}x ${item.name}`;
    builder.addText(twoCol(label, priceStr, W) + '\n');
    if (item.variant) builder.addText(`   ${item.variant}\n`);
    if (item.notes) builder.addText(`   ! ${item.notes}\n`);
  }

  builder.addText(SEP48 + '\n');

  // SUMMEN
  builder.addTextAlign(builder.ALIGN_RIGHT);
  builder.addText(twoCol('Zwischensumme', fmt(data.subtotal), W) + '\n');
  if (data.discount && data.discount > 0) builder.addText(twoCol('Rabatt', `-${fmt(data.discount)}`, W) + '\n');
  if (data.tip && data.tip > 0) builder.addText(twoCol('Trinkgeld', fmt(data.tip), W) + '\n');

  builder.addText(SEP48 + '\n');
  builder.addTextSize(2, 2);
  builder.addTextStyle(false, false, true, builder.COLOR_1);
  builder.addText(twoCol('TOTAL', fmt(data.total), W / 2) + '\n');
  builder.addTextStyle(false, false, false, builder.COLOR_1);
  builder.addTextSize(1, 1);
  builder.addText(SEP48 + '\n');

  const vatAmount = data.total * 0.081 / 1.081;
  builder.addText(twoCol('MwSt 8.1%', fmt(vatAmount), W) + '\n');
  builder.addText(twoCol('Zahlungsart', data.paymentMethod, W) + '\n');
  if (data.amountPaid !== undefined) builder.addText(twoCol('Bezahlt', fmt(data.amountPaid), W) + '\n');
  if (data.change !== undefined && data.change > 0) {
    builder.addTextStyle(false, false, true, builder.COLOR_1);
    builder.addText(twoCol('Rückgeld', fmt(data.change), W) + '\n');
    builder.addTextStyle(false, false, false, builder.COLOR_1);
  }

  // FOOTER
  builder.addTextAlign(builder.ALIGN_CENTER);
  builder.addText(SEP48 + '\n');
  builder.addText((data.slogan || 'Danke für Ihren Besuch!') + '\n');
  if (data.footerLine1) builder.addText(data.footerLine1 + '\n');
  if (data.footerLine2) builder.addText(data.footerLine2 + '\n');
  if (data.wifiName) {
    builder.addText(`WLAN: ${data.wifiName}\n`);
    if (data.wifiPassword) builder.addText(`Passwort: ${data.wifiPassword}\n`);
  }

  builder.addFeedLine(4);
  builder.addCut(builder.CUT_FEED);

  await sendWithSdk(config.ip, builder.toString());
}

export async function printKitchenToEpson(config: PrinterConfig, data: KitchenData): Promise<void> {
  const sdk = window.epson;
  if (!sdk) throw new Error('Epson ePOS SDK nicht geladen. Bitte Seite neu laden.');

  const builder = new sdk.ePOSBuilder();
  const W = 32;
  const SEP32 = '─'.repeat(W);

  builder.addTextAlign(builder.ALIGN_CENTER);
  builder.addTextSize(2, 2);
  builder.addTextStyle(false, false, true, builder.COLOR_1);
  builder.addText(data.bonType.toUpperCase() + '\n');
  builder.addTextStyle(false, false, false, builder.COLOR_1);
  builder.addTextSize(1, 1);
  builder.addText(SEP32 + '\n');

  builder.addTextAlign(builder.ALIGN_LEFT);
  builder.addTextSize(2, 2);
  builder.addText(`TISCH: ${data.tableLabel}\n`);
  builder.addTextSize(1, 1);
  builder.addText(`Kellner: ${data.waiterName}\n`);
  builder.addText(`Bon-Nr.: ${data.orderNumber}\n`);
  builder.addText(`Zeit: ${new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}\n`);
  builder.addText(SEP32 + '\n');

  const byCourse: Record<number, typeof data.items> = {};
  for (const item of data.items) {
    const c = item.course ?? 1;
    if (!byCourse[c]) byCourse[c] = [];
    byCourse[c].push(item);
  }

  const courseNums = Object.keys(byCourse).map(Number).sort();
  for (const courseNum of courseNums) {
    if (courseNums.length > 1) {
      builder.addTextStyle(false, false, true, builder.COLOR_1);
      builder.addText(` GANG ${courseNum} \n`);
      builder.addTextStyle(false, false, false, builder.COLOR_1);
    }
    for (const item of byCourse[courseNum]) {
      builder.addTextSize(2, 2);
      builder.addTextStyle(false, false, true, builder.COLOR_1);
      builder.addText(`${item.quantity}x ${item.name}\n`);
      builder.addTextStyle(false, false, false, builder.COLOR_1);
      builder.addTextSize(1, 1);
      if (item.variant) builder.addText(`   -> ${item.variant}\n`);
      if (item.notes) builder.addText(`   !! ${item.notes}\n`);
    }
    builder.addText(SEP32 + '\n');
  }

  builder.addFeedLine(3);
  builder.addCut(builder.CUT_FEED);

  await sendWithSdk(config.ip, builder.toString());
}

export async function testPrinterConnection(ip: string): Promise<boolean> {
  const sdk = window.epson;
  if (!sdk) return false;

  try {
    const builder = new sdk.ePOSBuilder();
    builder.addTextAlign(builder.ALIGN_CENTER);
    builder.addTextSize(2, 2);
    builder.addText('SimplaPOS\n');
    builder.addTextSize(1, 1);
    builder.addText('Testdruck erfolgreich!\n');
    builder.addText('─'.repeat(48) + '\n');
    builder.addText(new Date().toLocaleString('de-CH') + '\n');
    builder.addText('─'.repeat(48) + '\n');
    builder.addText('Drucker ist bereit.\n');
    builder.addFeedLine(4);
    builder.addCut(builder.CUT_FEED);

    await sendWithSdk(ip, builder.toString());
    return true;
  } catch {
    return false;
  }
}

// ─── Gespeicherte Drucker-IP aus localStorage ─────────────────────────────────

const PRINTER_IP_KEY = 'simplapos_printer_ip';

export function getSavedPrinterConfig(): PrinterConfig | null {
  const ip = localStorage.getItem(PRINTER_IP_KEY);
  if (!ip) return null;
  return { ip };
}

export function savePrinterConfig(ip: string): void {
  localStorage.setItem(PRINTER_IP_KEY, ip);
}

// Legacy XML-Builder Exports (für Kompatibilität mit bestehendem Code)
export function buildReceiptXml(_data: ReceiptData): string {
  return ''; // Nicht mehr verwendet – SDK übernimmt das
}

export function buildKitchenXml(_data: KitchenData): string {
  return ''; // Nicht mehr verwendet – SDK übernimmt das
}

export function buildTestXml(): string {
  return ''; // Nicht mehr verwendet – SDK übernimmt das
}
