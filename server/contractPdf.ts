import PDFDocument from "pdfkit";
import { MODULES, calculateModularPricing, calculateAnnualPrice, ANNUAL_DISCOUNT_PERCENT } from "../shared/pricing";
import { AGB_TEXT } from "./legal/agb";
import { DATENSCHUTZ_TEXT } from "./legal/datenschutz";

interface ContractPdfData {
  contractId: number;
  restaurantName: string;
  restaurantAddress?: string;
  restaurantZip?: string;
  restaurantCity?: string;
  restaurantPhone?: string;
  restaurantPhoneReceipt?: string;
  restaurantEmail?: string;
  restaurantVatNumber?: string;
  companyName?: string;
  companyAddress?: string;
  companyZip?: string;
  companyCity?: string;
  companyPhone?: string;
  companyContact?: string;
  contractType: string;
  billingCycle: string;
  selectedModules: { moduleId: string; quantity: number }[];
  hardwareItems?: { name: string; quantity: number; unitPrice: number }[];
  numEmployees: number;
  monthlyFee: string;
  signedByName?: string;
  signedByEmail?: string;
  signedAt: Date;
}

export function generateContractPdf(data: ContractPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `SimplaPOS Vertrag #${data.contractId}`,
          Author: "SimplaPOS",
          Subject: "Vertragsbestätigung",
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100; // margins

      // ─── HEADER ──────────────────────────────────────────────────────
      doc.fontSize(22).font("Helvetica-Bold").text("SimplaPOS", { align: "center" });
      doc.fontSize(10).font("Helvetica").fillColor("#666666")
        .text("Cloud-Kassensystem für die Gastronomie", { align: "center" });
      doc.moveDown(0.5);

      // Horizontal line
      doc.strokeColor("#2D2B6B").lineWidth(2)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(1);

      // ─── TITLE ───────────────────────────────────────────────────────
      doc.fillColor("#000000").fontSize(16).font("Helvetica-Bold")
        .text("VERTRAGSBESTÄTIGUNG", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica").fillColor("#333333")
        .text(`Vertrag Nr. ${data.contractId} | ${new Date(data.signedAt).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "center" });
      doc.moveDown(1.5);

      // ─── RESTAURANT INFO ─────────────────────────────────────────────
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#2D2B6B")
        .text("1. Restaurant-Informationen");
      doc.moveDown(0.3);
      doc.strokeColor("#EEEEEE").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica").fillColor("#000000");
      const restaurantInfo = [
        ["Restaurant:", data.restaurantName],
        ["Adresse:", [data.restaurantAddress, data.restaurantZip, data.restaurantCity].filter(Boolean).join(", ") || "—"],
        ["Telefon:", data.restaurantPhone || "—"],
        ["Telefon (Beleg):", data.restaurantPhoneReceipt || "—"],
        ["E-Mail:", data.restaurantEmail || "—"],
        ["MwSt-Nr.:", data.restaurantVatNumber || "—"],
      ];
      for (const [label, value] of restaurantInfo) {
        doc.font("Helvetica-Bold").text(label, { continued: true, width: 120 });
        doc.font("Helvetica").text(` ${value}`);
      }
      doc.moveDown(1);

      // ─── COMPANY INFO ────────────────────────────────────────────────
      if (data.companyName) {
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#2D2B6B")
          .text("2. Firmen-Informationen");
        doc.moveDown(0.3);
        doc.strokeColor("#EEEEEE").lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
        doc.moveDown(0.5);

        doc.fontSize(10).font("Helvetica").fillColor("#000000");
        const companyInfo = [
          ["Firma:", data.companyName],
          ["Adresse:", [data.companyAddress, data.companyZip, data.companyCity].filter(Boolean).join(", ") || "—"],
          ["Telefon:", data.companyPhone || "—"],
          ["Ansprechpartner:", data.companyContact || "—"],
        ];
        for (const [label, value] of companyInfo) {
          doc.font("Helvetica-Bold").text(label, { continued: true, width: 120 });
          doc.font("Helvetica").text(` ${value}`);
        }
        doc.moveDown(1);
      }

      // ─── MODULES / LEISTUNGSUMFANG ───────────────────────────────────
      const sectionNum = data.companyName ? 3 : 2;
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#2D2B6B")
        .text(`${sectionNum}. Gebuchte Module & Leistungsumfang`);
      doc.moveDown(0.3);
      doc.strokeColor("#EEEEEE").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(0.5);

      const pricing = calculateModularPricing(data.selectedModules);
      doc.fontSize(10).font("Helvetica").fillColor("#000000");

      // Table header
      const colX = [50, 280, 380, 470];
      doc.font("Helvetica-Bold");
      doc.text("Modul", colX[0], doc.y, { width: 220 });
      doc.text("Menge", colX[1], doc.y - doc.currentLineHeight(), { width: 80 });
      doc.text("Monatlich", colX[2], doc.y - doc.currentLineHeight(), { width: 80 });
      doc.text("Einmalig", colX[3], doc.y - doc.currentLineHeight(), { width: 80 });
      doc.moveDown(0.3);
      doc.strokeColor("#CCCCCC").lineWidth(0.3)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(0.3);

      doc.font("Helvetica");
      for (const item of pricing.breakdown) {
        const y = doc.y;
        doc.text(item.moduleName, colX[0], y, { width: 220 });
        doc.text(item.quantity.toString(), colX[1], y, { width: 80 });
        doc.text(item.monthlySubtotal > 0 ? `CHF ${item.monthlySubtotal.toFixed(2)}` : "—", colX[2], y, { width: 80 });
        doc.text(item.oneTimeSubtotal > 0 ? `CHF ${item.oneTimeSubtotal.toFixed(2)}` : "—", colX[3], y, { width: 80 });
        doc.moveDown(0.2);
      }

      doc.moveDown(0.5);
      doc.strokeColor("#2D2B6B").lineWidth(1)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(0.5);

      // Totals
      doc.font("Helvetica-Bold");
      if (data.billingCycle === "yearly") {
        const annualMonthly = calculateAnnualPrice(pricing.monthlyTotal);
        doc.text(`Monatlich (bei jährlicher Zahlung, ${ANNUAL_DISCOUNT_PERCENT}% Rabatt): CHF ${annualMonthly.toFixed(2)}`);
        doc.font("Helvetica").text(`(Regulär monatlich: CHF ${pricing.monthlyTotal.toFixed(2)})`);
      } else {
        doc.text(`Monatlicher Gesamtbetrag: CHF ${pricing.monthlyTotal.toFixed(2)}`);
      }
      if (pricing.oneTimeTotal > 0) {
        doc.font("Helvetica-Bold").text(`Einmalige Gebühren: CHF ${pricing.oneTimeTotal.toFixed(2)}`);
      }
      doc.moveDown(1);

      // ─── HARDWARE ────────────────────────────────────────────────────
      if (data.hardwareItems && data.hardwareItems.length > 0) {
        doc.addPage();
        const hwSection = sectionNum + 1;
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#2D2B6B")
          .text(`${hwSection}. Hardware-Bestellung`);
        doc.moveDown(0.3);
        doc.strokeColor("#EEEEEE").lineWidth(0.5)
          .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
        doc.moveDown(0.5);

        doc.fontSize(10).font("Helvetica").fillColor("#000000");
        let hwTotal = 0;
        for (const item of data.hardwareItems) {
          const subtotal = item.unitPrice * item.quantity;
          hwTotal += subtotal;
          doc.text(`${item.name} × ${item.quantity} — CHF ${subtotal.toFixed(2)}`);
        }
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").text(`Hardware-Gesamtbetrag: CHF ${hwTotal.toFixed(2)}`);
        doc.moveDown(1);
      }

      // ─── VERTRAGSBEDINGUNGEN ─────────────────────────────────────────
      doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#2D2B6B")
        .text("Vertragsbedingungen");
      doc.moveDown(0.3);
      doc.strokeColor("#EEEEEE").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font("Helvetica").fillColor("#000000");
      const contractDetails = [
        ["Vertragsart:", data.contractType === "standard" ? "Standard" : data.contractType === "referral" ? "Empfehlung" : data.contractType === "partner" ? "Partner" : data.contractType],
        ["Abrechnungszyklus:", data.billingCycle === "yearly" ? "Jährlich" : "Monatlich"],
        ["Anzahl Lizenzen:", data.numEmployees.toString()],
        ["Unterzeichnet von:", data.signedByName || "—"],
        ["E-Mail:", data.signedByEmail || "—"],
        ["Datum:", new Date(data.signedAt).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" })],
      ];
      for (const [label, value] of contractDetails) {
        doc.font("Helvetica-Bold").text(label, { continued: true, width: 150 });
        doc.font("Helvetica").text(` ${value}`);
      }
      doc.moveDown(2);

      // Signature area
      doc.strokeColor("#000000").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(250, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).text("Unterschrift Kunde");
      doc.moveDown(2);

      doc.strokeColor("#000000").lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(250, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).text("SimplaPOS (elektronisch bestätigt)");

      // ─── AGB (neue Seite) ────────────────────────────────────────────
      doc.addPage();
      doc.fontSize(8).font("Helvetica").fillColor("#333333");
      doc.text(AGB_TEXT, { lineGap: 1.5 });

      // ─── DATENSCHUTZ (neue Seite) ────────────────────────────────────
      doc.addPage();
      doc.fontSize(8).font("Helvetica").fillColor("#333333");
      doc.text(DATENSCHUTZ_TEXT, { lineGap: 1.5 });

      // ─── FOOTER auf jeder Seite ──────────────────────────────────────
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor("#999999")
          .text(
            `SimplaPOS | Vertrag #${data.contractId} | Seite ${i + 1} von ${pages.count}`,
            50, doc.page.height - 40,
            { align: "center", width: pageWidth }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
