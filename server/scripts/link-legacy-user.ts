/**
 * Link an imported legacy user to a real Firebase UID (repair tool).
 *
 *   cd server && npx tsx --env-file=.env scripts/link-legacy-user.ts --email gdaugusta@twilio.com
 *   cd server && npx tsx --env-file=.env scripts/link-legacy-user.ts --email gdaugusta@twilio.com --firebase-uid ABC123 --apply
 */
import { PrismaClient } from "@prisma/client";
import { claimImportedAccountByEmail, isPlaceholderFirebaseUid } from "../src/auth/resolveAppUser.js";
import { getFirebaseAdmin } from "../src/auth/firebaseAdmin.js";

const prisma = new PrismaClient();

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = readArg("--email")?.trim().toLowerCase();
  const firebaseUidArg = readArg("--firebase-uid")?.trim();
  const apply = process.argv.includes("--apply");

  if (!email) {
    throw new Error("Pass --email user@example.com");
  }

  const imported = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: {
      programs: { select: { id: true, name: true, status: true } }
    }
  });

  if (!imported) {
    throw new Error(`No user found for ${email}`);
  }

  let firebaseUid = firebaseUidArg;
  if (!firebaseUid) {
    try {
      const firebaseUser = await getFirebaseAdmin().auth().getUserByEmail(email);
      firebaseUid = firebaseUser.uid;
    } catch (error) {
      throw new Error(
        `Could not resolve Firebase UID for ${email}. Pass --firebase-uid manually. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const uidHolder = await prisma.user.findUnique({
    where: { firebaseUid },
    include: { programs: { select: { id: true, name: true } } }
  });

  console.log("Imported user:", {
    id: imported.id,
    email: imported.email,
    firebaseUid: imported.firebaseUid,
    placeholder: isPlaceholderFirebaseUid(imported.firebaseUid),
    programs: imported.programs
  });
  console.log("Target Firebase UID:", firebaseUid);
  if (uidHolder && uidHolder.id !== imported.id) {
    console.log("Current UID holder:", {
      id: uidHolder.id,
      email: uidHolder.email,
      programs: uidHolder.programs
    });
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to link the imported account.");
    return;
  }

  const linked = await claimImportedAccountByEmail(email, firebaseUid);
  if (!linked) {
    throw new Error("Unable to link imported account. Check for conflicting users with programs.");
  }

  console.log("\nLinked user:", {
    id: linked.id,
    email: linked.email,
    firebaseUid: linked.firebaseUid
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
