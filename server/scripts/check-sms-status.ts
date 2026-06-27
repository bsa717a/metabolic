import { prisma } from '../src/db/prisma.js';

async function main() {
  const failures = await prisma.smsMessage.findMany({
    where: { status: 'FAILED', direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, intent: true, phone: true, response: true }
  });
  console.log('Recent outbound failures:', JSON.stringify(failures, null, 2));

  const recent = await prisma.smsMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { createdAt: true, intent: true, direction: true, status: true, phone: true }
  });
  console.log('Recent messages:', JSON.stringify(recent, null, 2));

  const nudges = await prisma.smsNudgeLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, kind: true, date: true, userId: true }
  });
  console.log('Recent nudges:', JSON.stringify(nudges, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
