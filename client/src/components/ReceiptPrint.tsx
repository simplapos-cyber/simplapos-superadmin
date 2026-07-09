/**
 * ReceiptPrint – Browser-Print Bon-Komponente
 *
 * Verwendung:
 *   printReceipt({ tableLabel, orderNumber, items, total, tip, method, restaurantName })
 *
 * Öffnet ein unsichtbares Print-Fenster mit dem formatierten Bon.
 */

export type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null;
};

export type ReceiptData = {
  tableLabel: string;
  orderNumber: string;
  items: ReceiptItem[];
  subtotal: number;
  tip: number;
  total: number;
  paymentMethod: string;
  cashGiven?: number;
  change?: number;
  restaurantName?: string;
  vatRate?: number; // z.B. 0.081 für 8.1%
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Bar",
  card: "Karte",
  twint: "TWINT",
  invoice: "Rechnung",
  online: "Online",
  voucher: "Gutschein",
};

function formatCHF(amount: number): string {
  return `CHF ${amount.toFixed(2)}`;
}

function roundCHF(amount: number): number {
  return Math.round(amount * 20) / 20;
}

export function printReceipt(data: ReceiptData): void {
  const now = new Date();
  const dateStr = now.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = now.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  const vatRate = data.vatRate ?? 0.081;
  const vatAmount = data.subtotal * vatRate;
  const netAmount = data.subtotal - vatAmount;
  const changeRounded = roundCHF(data.change ?? 0);

  const itemRows = data.items.map((item) => {
    const lineTotal = item.quantity * item.unitPrice;
    return `
      <tr>
        <td style="padding:2px 4px;vertical-align:top;">${item.quantity}×</td>
        <td style="padding:2px 4px;vertical-align:top;width:100%;">
          ${item.name}
          ${item.notes ? `<br><span style="font-size:10px;color:#666;">${item.notes}</span>` : ""}
        </td>
        <td style="padding:2px 4px;vertical-align:top;text-align:right;white-space:nowrap;">${formatCHF(lineTotal)}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Bon ${data.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: #000;
      background: #fff;
      width: 80mm;
      margin: 0 auto;
      padding: 8px 4px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .divider-solid { border-top: 1px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    .total-row td { font-weight: bold; font-size: 15px; padding-top: 4px; }
    .muted { color: #555; font-size: 11px; }
    @media print {
      body { width: 80mm; }
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <div class="center bold large">${data.restaurantName ?? "Restaurant"}</div>
  <div class="center muted">${dateStr} · ${timeStr}</div>
  <div class="divider-solid"></div>

  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
    <span class="bold">Tisch: ${data.tableLabel}</span>
    <span class="muted">Bon #${data.orderNumber}</span>
  </div>

  <div class="divider"></div>

  <table>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td>Netto (${(vatRate * 100).toFixed(1)}% MwSt.)</td>
      <td style="text-align:right;">${formatCHF(netAmount)}</td>
    </tr>
    <tr>
      <td>MwSt. ${(vatRate * 100).toFixed(1)}%</td>
      <td style="text-align:right;">${formatCHF(vatAmount)}</td>
    </tr>
    ${data.tip > 0 ? `
    <tr>
      <td>Trinkgeld</td>
      <td style="text-align:right;">${formatCHF(data.tip)}</td>
    </tr>` : ""}
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right;">${formatCHF(data.total + data.tip)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <div style="display:flex;justify-content:space-between;">
    <span>Zahlungsart</span>
    <span class="bold">${METHOD_LABEL[data.paymentMethod] ?? data.paymentMethod}</span>
  </div>
  ${data.cashGiven && data.cashGiven > 0 ? `
  <div style="display:flex;justify-content:space-between;">
    <span>Erhalten</span>
    <span>${formatCHF(data.cashGiven)}</span>
  </div>
  <div style="display:flex;justify-content:space-between;">
    <span>Rückgeld</span>
    <span class="bold">${formatCHF(changeRounded)}</span>
  </div>` : ""}

  <div class="divider-solid"></div>
  <div class="center muted" style="margin-top:8px;">Vielen Dank für Ihren Besuch!</div>
  <div class="center muted">Inkl. MwSt. gemäss MWSTG</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) {
    // Fallback: Blob-URL
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    // Fenster nach Print schliessen (optional)
    // win.close();
  }, 300);
}
