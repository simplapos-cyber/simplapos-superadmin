import Stripe from "stripe";
import { ENV } from "./_core/env";

// ─── STRIPE CLIENT ──────────────────────────────────────────────────────────
export const stripe = new Stripe(ENV.stripeSecretKey, {
  apiVersion: "2026-05-27.dahlia",
});

// ─── PRODUCTS (Centralized Stripe Product/Price definitions) ─────────────────
// These are created in Stripe Dashboard or via API. We reference them by metadata.
// For SimplaPOS, we create prices dynamically based on the contract modules.

export interface CreateCheckoutParams {
  restaurantId: number;
  restaurantName: string;
  contractId: number;
  billingCycle: "monthly" | "yearly";
  monthlyAmount: number; // CHF per month
  oneTimeAmount: number; // CHF one-time fees
  customerEmail: string;
  customerName: string;
  userId: number;
  origin: string; // Frontend origin for redirect URLs
  isProRata?: boolean; // If first payment is pro-rata
  proRataAmount?: number; // Pro-rata amount for first period
}

/**
 * Create a Stripe Checkout Session for a restaurant subscription.
 * - For yearly: single payment for 12 months
 * - For monthly: first payment (possibly pro-rata), then recurring
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<string> {
  const {
    restaurantId,
    restaurantName,
    contractId,
    billingCycle,
    monthlyAmount,
    oneTimeAmount,
    customerEmail,
    customerName,
    userId,
    origin,
    isProRata,
    proRataAmount,
  } = params;

  // Calculate the amount for this checkout
  let totalAmount: number;
  let description: string;

  if (billingCycle === "yearly") {
    totalAmount = monthlyAmount * 12; // Full year
    description = `SimplaPOS Jahresabo – ${restaurantName} (12 Monate)`;
  } else {
    // Monthly: first payment (pro-rata or full month)
    totalAmount = isProRata && proRataAmount ? proRataAmount : monthlyAmount;
    description = isProRata
      ? `SimplaPOS Monatsabo – ${restaurantName} (anteiliger erster Monat)`
      : `SimplaPOS Monatsabo – ${restaurantName}`;
  }

  // Add one-time fees if any
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "chf",
        product_data: {
          name: description,
          metadata: { restaurantId: restaurantId.toString(), contractId: contractId.toString() },
        },
        unit_amount: Math.round(totalAmount * 100), // Stripe uses cents
      },
      quantity: 1,
    },
  ];

  if (oneTimeAmount > 0) {
    lineItems.push({
      price_data: {
        currency: "chf",
        product_data: {
          name: `Einmalige Einrichtungsgebühren – ${restaurantName}`,
        },
        unit_amount: Math.round(oneTimeAmount * 100),
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: customerEmail,
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      restaurant_id: restaurantId.toString(),
      contract_id: contractId.toString(),
      billing_cycle: billingCycle,
      monthly_amount: monthlyAmount.toString(),
      customer_email: customerEmail,
      customer_name: customerName,
      type: "subscription_payment",
    },
    line_items: lineItems,
    success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/subscription/cancelled`,
    allow_promotion_codes: true,
  });

  return session.url!;
}

/**
 * Create a recurring monthly payment checkout (for subsequent months)
 */
export async function createRenewalCheckoutSession(params: {
  restaurantId: number;
  restaurantName: string;
  subscriptionId: number;
  monthlyAmount: number;
  customerEmail: string;
  userId: number;
  origin: string;
}): Promise<string> {
  const { restaurantId, restaurantName, subscriptionId, monthlyAmount, customerEmail, userId, origin } = params;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: customerEmail,
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      restaurant_id: restaurantId.toString(),
      subscription_id: subscriptionId.toString(),
      monthly_amount: monthlyAmount.toString(),
      type: "renewal_payment",
    },
    line_items: [
      {
        price_data: {
          currency: "chf",
          product_data: {
            name: `SimplaPOS Monatsabo – ${restaurantName} (Verlängerung)`,
          },
          unit_amount: Math.round(monthlyAmount * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/subscription/pay`,
    allow_promotion_codes: true,
  });

  return session.url!;
}
