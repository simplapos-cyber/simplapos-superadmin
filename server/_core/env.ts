export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Anthropic direct API key (overrides Manus built-in LLM when set)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Marketing OAuth (SimplaPOS-eigene Apps – einmalig vom Betreiber eingerichtet)
  // Facebook App: "SimplaPOS Marketing" (App-ID: 1724824932303363)
  metaAppId: process.env.MARKETING_META_APP_ID ?? "",
  metaAppSecret: process.env.MARKETING_META_APP_SECRET ?? "",
  // Instagram App: "SimplaPOS Marketing1" (App-ID: 1666295687816230)
  instagramAppId: process.env.MARKETING_INSTAGRAM_APP_ID ?? "",
  instagramAppSecret: process.env.MARKETING_INSTAGRAM_APP_SECRET ?? "",
  // Google Business Profile
  googleClientId: process.env.MARKETING_GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.MARKETING_GOOGLE_CLIENT_SECRET ?? "",
  // TikTok
  tiktokClientKey: process.env.MARKETING_TIKTOK_CLIENT_KEY ?? "",
  tiktokClientSecret: process.env.MARKETING_TIKTOK_CLIENT_SECRET ?? "",
};
