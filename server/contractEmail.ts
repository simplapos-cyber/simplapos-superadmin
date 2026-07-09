import { ENV } from "./_core/env";
import { generateContractPdf } from "./contractPdf";
import { storagePut } from "./storage";
import { createActivationToken } from "./db";
import crypto from "crypto";

interface ContractEmailData {
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
  // For activation link
  recipientEmail: string;
  userId?: number;
  restaurantId?: number;
  origin: string; // Frontend origin URL for activation link
}

/**
 * Sends the contract confirmation email with:
 * 1. PDF contract summary (uploaded to S3)
 * 2. Activation link for first login
 * 3. AGB & Datenschutz included in PDF
 * 
 * The notification is sent even if PDF generation/upload fails.
 */
export async function sendContractConfirmationEmail(data: ContractEmailData): Promise<{
  success: boolean;
  activationToken?: string;
  pdfUrl?: string;
}> {
  console.log(`[ContractEmail] Starting contract confirmation for contract #${data.contractId}, recipient: ${data.recipientEmail}`);

  // 1. Generate activation token first (most critical)
  let activationLink = "";
  let token = "";
  try {
    token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    await createActivationToken({
      token,
      email: data.recipientEmail,
      userId: data.userId,
      contractId: data.contractId,
      restaurantId: data.restaurantId,
      expiresAt,
    });

    activationLink = `${data.origin}/activate?token=${token}`;
    console.log(`[ContractEmail] Activation token created successfully`);
  } catch (error) {
    console.error("[ContractEmail] Failed to create activation token:", error);
    // Continue anyway - we can still send the notification without the link
    activationLink = "(Aktivierungslink konnte nicht erstellt werden - bitte kontaktieren Sie den Support)";
  }

  // 2. Try to generate and upload PDF (non-blocking for notification)
  let pdfUrl = "";
  try {
    console.log(`[ContractEmail] Generating PDF...`);
    const pdfBuffer = await generateContractPdf({
      contractId: data.contractId,
      restaurantName: data.restaurantName,
      restaurantAddress: data.restaurantAddress,
      restaurantZip: data.restaurantZip,
      restaurantCity: data.restaurantCity,
      restaurantPhone: data.restaurantPhone,
      restaurantPhoneReceipt: data.restaurantPhoneReceipt,
      restaurantEmail: data.restaurantEmail,
      restaurantVatNumber: data.restaurantVatNumber,
      companyName: data.companyName,
      companyAddress: data.companyAddress,
      companyZip: data.companyZip,
      companyCity: data.companyCity,
      companyPhone: data.companyPhone,
      companyContact: data.companyContact,
      contractType: data.contractType,
      billingCycle: data.billingCycle,
      selectedModules: data.selectedModules,
      hardwareItems: data.hardwareItems,
      numEmployees: data.numEmployees,
      monthlyFee: data.monthlyFee,
      signedByName: data.signedByName,
      signedByEmail: data.signedByEmail,
      signedAt: data.signedAt,
    });
    console.log(`[ContractEmail] PDF generated, size: ${pdfBuffer.length} bytes`);

    // Upload PDF to S3
    const pdfKey = `contracts/vertrag-${data.contractId}-${Date.now()}.pdf`;
    const result = await storagePut(pdfKey, pdfBuffer, "application/pdf");
    pdfUrl = result.url;
    console.log(`[ContractEmail] PDF uploaded to S3: ${pdfUrl}`);
  } catch (error) {
    console.error("[ContractEmail] PDF generation/upload failed:", error);
    pdfUrl = "(PDF konnte nicht erstellt werden - wird nachgeliefert)";
  }

  // 3. Send notification (always, regardless of PDF success)
  try {
    const emailContent = buildEmailContent(data, activationLink, pdfUrl);
    
    const endpoint = buildNotificationEndpoint();
    console.log(`[ContractEmail] Sending notification to endpoint: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({
        title: `Vertragsbestätigung #${data.contractId} – ${data.restaurantName} (${data.recipientEmail})`,
        content: emailContent,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`[ContractEmail] Notification API failed: ${response.status} - ${responseText}`);
      return { success: false };
    }

    console.log(`[ContractEmail] Contract confirmation notification sent successfully for ${data.recipientEmail}`);
    return { success: true, activationToken: token, pdfUrl };
  } catch (error) {
    console.error("[ContractEmail] Error sending notification:", error);
    return { success: false };
  }
}

function buildEmailContent(data: ContractEmailData, activationLink: string, pdfUrl: string): string {
  return `
═══════════════════════════════════════════════════════
VERTRAGSBESTÄTIGUNG – SimplaPOS
═══════════════════════════════════════════════════════

Sehr geehrte/r ${data.signedByName || "Kunde/Kundin"},

Vielen Dank für Ihr Vertrauen in SimplaPOS! Ihr Vertrag wurde erfolgreich eingereicht und wird nun von unserem Team geprüft.

──────────────────────────────────────────────────────
VERTRAGSZUSAMMENFASSUNG
──────────────────────────────────────────────────────

Restaurant: ${data.restaurantName}
Vertrag Nr.: ${data.contractId}
Vertragsart: ${data.contractType === "standard" ? "Standard" : data.contractType}
Abrechnungszyklus: ${data.billingCycle === "yearly" ? "Jährlich (15% Rabatt)" : "Monatlich"}
Monatlicher Betrag: CHF ${data.monthlyFee}
Anzahl Lizenzen: ${data.numEmployees}
Datum: ${new Date(data.signedAt).toLocaleDateString("de-CH")}

──────────────────────────────────────────────────────
NÄCHSTE SCHRITTE
──────────────────────────────────────────────────────

1. VERIFIZIERUNG: Unser Team prüft Ihren Vertrag. Sie erhalten eine Bestätigung sobald Ihr Zugang freigeschaltet wird.

2. KONTO AKTIVIEREN: Sobald Ihr Vertrag genehmigt wurde, können Sie über folgenden Link Ihr Passwort setzen und sich erstmals anmelden:

   → ${activationLink}
   
   (Dieser Link ist 72 Stunden gültig)

3. EINRICHTUNG: Nach der Anmeldung können Sie Ihr Restaurant im Admin-Panel vollständig einrichten (Speisekarte, Tischplan, Mitarbeiter, etc.)

──────────────────────────────────────────────────────
VERTRAGSUNTERLAGEN (PDF)
──────────────────────────────────────────────────────

Ihr vollständiger Vertrag inklusive AGB und Datenschutzerklärung:
${pdfUrl}

──────────────────────────────────────────────────────
KONTAKT
──────────────────────────────────────────────────────

Bei Fragen stehen wir Ihnen gerne zur Verfügung:
E-Mail: support@simplapos.com
Telefon: +41 (0)44 000 00 00

──────────────────────────────────────────────────────

Mit freundlichen Grüssen
Ihr SimplaPOS-Team

═══════════════════════════════════════════════════════
SimplaPOS | Cloud-Kassensystem für die Gastronomie
www.simplapos.com
═══════════════════════════════════════════════════════

Hinweis: Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht direkt auf diese Nachricht.
Datenschutz: Ihre Daten werden gemäss dem Schweizer Datenschutzgesetz (DSG) verarbeitet. Details finden Sie in der beigefügten Datenschutzerklärung.
`.trim();
}

function buildNotificationEndpoint(): string {
  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  return new URL("webdevtoken.v1.WebDevService/SendNotification", baseUrl).toString();
}
