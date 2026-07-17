import { ProgramStatus } from '@prisma/client';
import { prisma } from '../src/db/prisma.js';

const email = process.argv[2] ?? 'derek@explore-on.com';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true }
  });
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const deletedPrograms = await prisma.program.deleteMany({ where: { userId: user.id } });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      timezone: null,
      coachRequestedAt: null,
      selectedVirtualCoachId: null,
      coachWelcomeCompletedAt: null,
      dashboardTutorialCompletedAt: null,
      smsRemindersIntroCompletedAt: null,
      virtualCoachCheckInDay: null
    }
  });

  console.log(
    JSON.stringify(
      {
        email: user.email,
        firstName: user.firstName,
        deletedPrograms: deletedPrograms.count,
        needsSetup: true
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
