import type { DecodedIdToken } from "firebase-admin/auth";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

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

  try {
    return await prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email.toLowerCase(),
        firstName,
        lastName,
        role: "USER",
        status: "ACTIVE"
      }
    });
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
