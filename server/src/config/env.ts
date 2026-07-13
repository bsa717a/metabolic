import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "server/.env")]) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: true });
    break;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FIREBASE_PROJECT_ID: z.string().default("metabolic"),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(""),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(""),
  FIREBASE_STORAGE_BUCKET: z.string().optional().default(""),
  AI_PROVIDER: z.enum(["mock", "openai", "gemini"]).default("mock"),
  SMS_AGENT_MODE: z.enum(["tree", "agent"]).default("agent"),
  // Plan tier assigned to newly created accounts. Defaults to "plus" during Beta so
  // new signups get Metabolic Plus; set to "starter" when Beta ends.
  BETA_SIGNUP_PLAN: z.enum(["starter", "self_guided", "plus", "coach_led"]).default("plus"),
  // Phone number that receives an SMS alert whenever a new account is created.
  // Leave empty to disable signup alerts.
  SIGNUP_ALERT_PHONE: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  TWILIO_ACCOUNT_SID: z.string().optional().default(""),
  TWILIO_AUTH_TOKEN: z.string().optional().default(""),
  TWILIO_PHONE_NUMBER: z.string().optional().default(""),
  TWILIO_VALIDATE_SIGNATURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  TWILIO_WEBHOOK_URL: z.string().optional().default(""),
  SENDGRID_API_KEY: z.string().optional().default(""),
  SENDGRID_FROM_EMAIL: z.string().email().optional().or(z.literal("")).default(""),
  SENDGRID_FROM_NAME: z.string().optional().default("Master Metabolic"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STORE_NOTIFY_EMAIL: z.string().email().optional().or(z.literal("")).default(""),
  GIT_SHA: z.string().optional().default("dev"),
  CRON_SECRET: z.string().optional().default("")
});

export const env = envSchema.parse(process.env);
