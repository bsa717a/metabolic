import type { DecodedIdToken } from "firebase-admin/auth";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { slugToPlan } from "../services/entitlements.js";
import { isTwilioConfigured, sendOutboundMessage } from "../services/twilioOutboundService.js";

/** Best-effort SMS alert to the owner when a new account is created. Never throws — a
 *  failed/unconfigured alert must not break signup. */
async function notifyNewSignup(user: User) {
  const to = env.SIGNUP_ALERT_PHONE.trim();
  if (!to || !isTwilioConfigured()) return;
  try {
    const name = `${user.firstName} ${user.lastName}`.trim() || "New user";
    await sendOutboundMessage(to, `New Metabolic signup: ${name} (${user.email}).`);
  } catch (error) {
    console.error("Failed to send new-signup SMS alert", error);
  }
}

function splitName(firebaseUser: DecodedIdToken) {
  const [firstName = "Metabolic", ...lastNameParts] = (firebaseUser.name || firebaseUser.email?.split("@")[0] || "User")
    .trim()
    .split(/\s+/);
  return { firstName, lastName: lastNameParts.join(" ") || "User" };
}

/** Placeholder UIDs from seed data or legacy imports — replaced on first Firebase sign-in. */
export function isPlaceholderFirebaseUid(firebaseUid: string) {
  return firebaseUid.startsWith("seed-") || firebaseUid.startsWith("legacy-");
}

async function absorbEmptyFirebaseUidHolder(legacyUserId: string, firebaseUid: string, holderId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: holderId },
      data: { firebaseUid: `merged-${holderId}` }
    });
    return tx.user.update({
      where: { id: legacyUserId },
      data: { firebaseUid }
    });
  });
}

/** Attach a real Firebase UID to an imported placeholder account, dropping an empty duplicate if needed. */
export async function claimImportedAccountByEmail(email: string, firebaseUid: string): Promise<User | null> {
  const importedAccount = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } }
  });
  if (!importedAccount || !isPlaceholderFirebaseUid(importedAccount.firebaseUid)) {
    return null;
  }
  if (importedAccount.firebaseUid === firebaseUid) {
    return importedAccount;
  }

  const uidHolder = await prisma.user.findUnique({ where: { firebaseUid } });
  if (uidHolder && uidHolder.id !== importedAccount.id) {
    const holderProgramCount = await prisma.program.count({ where: { userId: uidHolder.id } });
    if (holderProgramCount === 0) {
      return absorbEmptyFirebaseUidHolder(importedAccount.id, firebaseUid, uidHolder.id);
    }
    return null;
  }

  return prisma.user.update({
    where: { id: importedAccount.id },
    data: { firebaseUid }
  });
}

export async function resolveAppUser(firebaseUser: DecodedIdToken): Promise<User | null> {
  if (firebaseUser.email) {
    const claimed = await claimImportedAccountByEmail(firebaseUser.email, firebaseUser.uid);
    if (claimed) return claimed;
  }

  const byUid = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
  if (byUid) return byUid;

  if (firebaseUser.email) {
    const byEmail = await prisma.user.findFirst({
      where: { email: { equals: firebaseUser.email, mode: "insensitive" } }
    });
    if (byEmail) {
      if (byEmail.firebaseUid === firebaseUser.uid) return byEmail;
      return null;
    }
  }

  if (!firebaseUser.email) return null;

  const { firstName, lastName } = splitName(firebaseUser);

  // During Beta, new accounts are provisioned at the BETA_SIGNUP_PLAN tier (default: Plus).
  const signupPlan = slugToPlan(env.BETA_SIGNUP_PLAN) ?? undefined;

  try {
    const createdUser = await prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email.toLowerCase(),
        firstName,
        lastName,
        role: "USER",
        status: "ACTIVE",
        ...(signupPlan ? { plan: signupPlan } : {})
      }
    });
    await notifyNewSignup(createdUser);
    return createdUser;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.user.findUnique({ where: { firebaseUid: firebaseUser.uid } });
      if (existing) return existing;
      if (firebaseUser.email) {
        const claimed = await claimImportedAccountByEmail(firebaseUser.email, firebaseUser.uid);
        if (claimed) return claimed;
        return prisma.user.findFirst({
          where: { email: { equals: firebaseUser.email, mode: "insensitive" } }
        });
      }
    }
    throw error;
  }
}
